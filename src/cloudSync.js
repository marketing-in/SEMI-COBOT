// Shared inventory: keeps this browser's parts, purchase orders, stock moves and saved part-master details
// in step with Supabase
// through /api/inventory. The browser always keeps its own copy (localStorage), so the app works when
// the server is down; what changed is sent the next time it can be.
//
// How a sync works:
// - "base" is the shared state as this browser last saw it (kept in localStorage, so it survives a reload).
// - The change list is base → what the browser has now. Stock goes as a change (+600, −18), never a
//   total, so two people receiving and using parts at the same time both count.
// - The server applies the changes and answers with the whole shared state, which becomes the new base
//   and what the screen shows. Anything changed while the request was out is laid on top again.
// - The first time a browser joins, it only adds what the shared stock does not have yet (new part
//   numbers, orders and moves); for part numbers already there, the shared stock wins.
import {LEDGER_STORE,loadLedger} from './ledger.js';
import {DETAILS_KEY,loadDetails} from './partDetails.js';

export const BASE_STORE='semicobot-cloud-base-v1';
const key=m=>String(m||'').trim().toUpperCase();
// Equal content, whatever order the fields come in (the server may return them in another order).
const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);
const same=(a,b)=>stable(a)===stable(b);
const whole=v=>Math.max(0,Math.round(Number(v)||0));
const fieldsOf=p=>{const {stock,...rest}=p||{};return rest};
export const moveId=m=>m.id||[m.at,m.type,m.mpn,m.qty,m.ref].join('|');

// Parts: [{id, op:'delete'} | {id, part?, delta}]. part (everything but stock) only when a field changed.
export function diffParts(base,next){
 const before=new Map((base||[]).map(p=>[p.id,p])),now=new Set((next||[]).map(p=>p.id)),out=[];
 for(const p of next||[]){const o=before.get(p.id);
  if(!o){out.push({id:p.id,part:fieldsOf(p),delta:whole(p.stock)});continue}
  const delta=whole(p.stock)-whole(o.stock),changed=!same(fieldsOf(o),fieldsOf(p));
  if(delta||changed)out.push({id:p.id,...(changed?{part:fieldsOf(p)}:{}),delta})}
 for(const o of base||[])if(!now.has(o.id))out.push({id:o.id,op:'delete'});
 return out;
}
// The same rules the database uses, so laying local changes on the fresh shared state matches what the
// server will do with them.
export function applyParts(list,changes){
 const out=[...(list||[])];
 for(const c of changes||[]){let i=out.findIndex(p=>p.id===c.id);
  if(c.op==='delete'){if(i>=0)out.splice(i,1);continue}
  // A new part whose number is already there only adds its stock; the details already there stay.
  let byMpn=false;if(i<0&&c.part){i=out.findIndex(p=>key(p.mpn)===key(c.part.mpn));byMpn=i>=0}
  if(i<0){if(c.part)out.push({...c.part,id:c.id,stock:whole(c.delta)});continue}
  const cur=out[i];out[i]={...cur,...(c.part&&!byMpn?{...c.part,id:cur.id}:{}),stock:Math.max(0,whole(cur.stock)+Math.round(Number(c.delta)||0))}}
 return out;
}

const emptyLedger={orders:[],moves:[],consumed:{}};
export function diffLedger(base=emptyLedger,next=emptyLedger){
 const before=new Map(base.orders.map(o=>[o.id,o])),now=new Set(next.orders.map(o=>o.id)),seen=new Set(base.moves.map(moveId));
 const consumed={};for(const [k,v] of Object.entries(next.consumed||{}))if((base.consumed||{})[k]!==v)consumed[k]=v;
 return {orders:next.orders.filter(o=>!same(before.get(o.id),o)),removed:base.orders.filter(o=>!now.has(o.id)).map(o=>o.id),
  moves:next.moves.filter(m=>!seen.has(moveId(m))),consumed};
}
export const ledgerDiffEmpty=d=>!d.orders.length&&!d.removed.length&&!d.moves.length&&!Object.keys(d.consumed).length;
export function applyLedger(l=emptyLedger,d){
 const orders=new Map(l.orders.map(o=>[o.id,o]));
 for(const id of d.removed){if(orders.get(id)?.status==='ordered')orders.delete(id)}
 for(const o of d.orders){const cur=orders.get(o.id);orders.set(o.id,cur?.status==='received'&&o.status!=='received'?cur:o)}
 const ids=new Set(l.moves.map(moveId));const moves=[...d.moves.filter(m=>!ids.has(moveId(m))),...l.moves];
 const consumed={...l.consumed};for(const [k,v] of Object.entries(d.consumed))consumed[k]=Math.max(consumed[k]||0,v);
 const by=f=>(a,b)=>String(b[f]||'').localeCompare(String(a[f]||''));
 return {orders:[...orders.values()].sort(by('orderedAt')),moves:moves.sort(by('at')).slice(0,500),consumed};
}

// Part master details (keyed by part number): a saved or changed entry is sent whole, a removed one as a key.
export function diffDetails(base={},next={}){
 return {upsert:Object.entries(next||{}).filter(([k,v])=>!same((base||{})[k],v)).map(([key,data])=>({key,data})),removed:Object.keys(base||{}).filter(k=>!(next||{})[k])};
}
export const detailsDiffEmpty=d=>!d.upsert.length&&!d.removed.length;
export function applyDetails(map={},d){const out={...map};for(const k of d.removed)delete out[k];for(const {key,data} of d.upsert)out[key]=data;return out}

// First sync of a browser: add only what the shared stock does not have yet.
export function joinChanges(local,cloud){
 const cloudDetails=cloud.details||{},details={upsert:Object.entries(local.details||{}).filter(([k])=>!cloudDetails[k]).map(([key,data])=>({key,data})),removed:[]};
 const have=new Set(cloud.parts.map(p=>key(p.mpn)));
 const parts=local.parts.filter(p=>p.mpn&&!have.has(key(p.mpn))).map(p=>({id:p.id,part:fieldsOf(p),delta:whole(p.stock)}));
 const cloudOrders=new Set(cloud.ledger.orders.map(o=>o.id)),cloudMoves=new Set(cloud.ledger.moves.map(moveId));
 const consumed={};for(const [k,v] of Object.entries(local.ledger.consumed||{}))if(v>(cloud.ledger.consumed[k]||0))consumed[k]=v;
 return {parts,ledger:{orders:local.ledger.orders.filter(o=>!cloudOrders.has(o.id)),removed:[],moves:local.ledger.moves.filter(m=>!cloudMoves.has(moveId(m))),consumed},details};
}

// The sync loop. getParts/setParts reach the app's inventory state; onStatus gets
// {mode:'local'|'syncing'|'synced'|'offline'|'signed-out', at?, message?}.
export function createCloudSync({getParts,setParts,onLedger=()=>{},onDetails=()=>{},onStatus=()=>{},fetcher=(...a)=>fetch(...a),storage=globalThis.localStorage,delay=900}){
 const read=k=>{try{return JSON.parse(storage.getItem(k))}catch{return null}};
 const write=(k,v)=>{try{storage.setItem(k,JSON.stringify(v));return true}catch{return false}};
 let base=read(BASE_STORE),busy=false,again=false,timer=null,stopped=false,mode='';
 const status=(m,extra={})=>{mode=m;onStatus({mode:m,...extra})};
 const call=async(method,body)=>{const r=await fetcher('/api/inventory',{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(data.error||'HTTP '+r.status),{status:r.status});return data};
 async function sync(){
  if(stopped)return;if(busy){again=true;return}busy=true;
  try{
   const parts=getParts(),ledger=loadLedger(),details=loadDetails(storage);let payload;
   // Joining: base is only kept once the upload went through, so a failed first try is a first try again.
   if(!base){const cloud=await call('GET');if(!cloud.enabled){status('local');return}
    status('syncing');payload=joinChanges({parts,ledger,details},cloud)}
   else payload={parts:diffParts(base.parts,parts),ledger:diffLedger(base.ledger,ledger),details:diffDetails(base.details,details)};
   const quiet=!payload.parts.length&&ledgerDiffEmpty(payload.ledger)&&detailsDiffEmpty(payload.details);if(!quiet)status('syncing');
   const fresh=quiet?await call('GET'):await call('POST',payload);
   if(!fresh.enabled){base=null;try{storage.removeItem(BASE_STORE)}catch{}status('local');return}
   // Another Supabase project: start again as a new member, without sending changes meant for the old one.
   if(base?.project&&fresh.project&&base.project!==fresh.project){base=null;try{storage.removeItem(BASE_STORE)}catch{}again=true;return}
   const nowParts=getParts(),nowLedger=loadLedger(),nowDetails=loadDetails(storage),freshDetails=fresh.details||{};
   const showParts=applyParts(fresh.parts,diffParts(parts,nowParts)),showLedger=applyLedger(fresh.ledger,diffLedger(ledger,nowLedger)),showDetails=applyDetails(freshDetails,diffDetails(details,nowDetails));
   base={project:fresh.project,parts:fresh.parts,ledger:fresh.ledger,details:freshDetails};write(BASE_STORE,base);
   if(!same(showParts,nowParts))setParts(showParts);
   if(!same(showLedger,nowLedger)){write(LEDGER_STORE,showLedger);onLedger(showLedger)}
   if(!same(showDetails,nowDetails)){write(DETAILS_KEY,showDetails);onDetails(showDetails)}
   status('synced',{at:fresh.at});
  // Never joined and no API server answering: the inventory is simply this browser's. A database the
  // server could not use (503: wrong key, missing table, paused project) is shown, so it gets fixed.
  }catch(e){status(e.status===401?'signed-out':!base&&e.status!==503?'local':'offline',{message:e.message})}
  finally{busy=false;if(again&&!stopped){again=false;schedule(300)}}
 }
 function schedule(ms=delay){if(stopped)return;clearTimeout(timer);timer=setTimeout(sync,ms)}
 return {sync,schedule,stop(){stopped=true;clearTimeout(timer)},get mode(){return mode}};
}
