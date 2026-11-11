// Hosted deployments (Vercel). Functions have no lasting disk, so the accounts, sign-in failure counts
// and the part-info cache live in a database: Supabase (preferred) or Upstash Redis, both called with
// plain fetch. Without one the workspace stays closed: there is no open, sign-in-free mode online.
import {handleApi} from './api.mjs';
import {clean as cleanDetails,keyOf} from './src/partDetails.js';

export class StorageError extends Error{constructor(message,code=''){super(message);this.code=code}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const MESSAGES={
 none:'The database is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the Vercel project settings, then redeploy.',
 publishable:'SUPABASE_SECRET_KEY holds the publishable key. Use the secret key (Supabase → Project Settings → API Keys).',
 'missing-table':'The database table is missing. Run supabase/schema.sql in the Supabase SQL editor.',
 'bad-key':'Supabase refused SUPABASE_SECRET_KEY. Copy the secret key again from Project Settings → API Keys.',
 'no-rights':'The server key has no rights on the table. Run supabase/schema.sql again in the Supabase SQL editor.',
 paused:'The Supabase project is paused. Restore it from the Supabase dashboard.',
 down:'The database is not answering. Try again in a minute.'};

// Which database to use. Supabase: SUPABASE_URL plus the secret key (SUPABASE_SECRET_KEY, or the legacy
// SUPABASE_SERVICE_ROLE_KEY). Upstash: KV_REST_API_* from the Vercel Marketplace, or UPSTASH_REDIS_REST_*.
export function storageConfig(env){
 const sbUrl=env.SUPABASE_URL,sbKey=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(sbUrl&&sbKey){if(/^sb_publishable_/.test(sbKey))return {error:'publishable'};if(!/^https:\/\//.test(sbUrl))return {error:'none'};return {kind:'supabase',url:String(sbUrl).replace(/\/+$/,''),key:String(sbKey)}}
 const cfg=redisConfig(env);return cfg?{kind:'redis',...cfg}:null}
export function redisConfig(env){
 const url=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL,token=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN;
 return url&&token?{url:String(url).replace(/\/+$/,''),token:String(token)}:null}
export const backendFor=(cfg,fetcher=fetch)=>cfg.kind==='supabase'?supabaseBackend(cfg,fetcher):redisBackend(cfg,fetcher);

const send=async(fetcher,url,init)=>{let r;
 try{r=await fetcher(url,{...init,signal:AbortSignal.timeout(8000)})}catch{throw new StorageError('unreachable','down')}
 const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
 return {r,body}};

// Upstash: one command per request, POSTed as a JSON array; the answer is {result} or {error}.
export function redis(cfg,fetcher=fetch){
 return async(...cmd)=>{const {r,body}=await send(fetcher,cfg.url,{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},body:JSON.stringify(cmd.map(String))});
  if(!r.ok||!body||body.error)throw new StorageError(body?.error||'HTTP '+r.status,'down');return body.result}}
export function redisBackend(cfg,fetcher=fetch){const call=redis(cfg,fetcher);return {
 get:key=>call('GET',key),
 set:(key,value,ttl)=>ttl?call('SET',key,value,'EX',ttl):call('SET',key,value),
 // A counter left without an expiry (EXPIRE failed after INCR) gets one on its next increment.
 incr:async(key,ttl)=>{const n=Number(await call('INCR',key));if(n===1||Number(await call('TTL',key))===-1)await call('EXPIRE',key,ttl);return n},
 del:key=>call('DEL',key)}}

// Supabase: the public.semicobot_kv table through the REST API (supabase/schema.sql). New sb_secret_ keys
// go in the apikey header only; a legacy service_role JWT also goes in Authorization.
export function supabaseBackend(cfg,fetcher=fetch){
 const base=cfg.url+'/rest/v1',table=base+'/semicobot_kv',eq=key=>'key=eq.'+encodeURIComponent(key);
 const headers=(extra={})=>({apikey:cfg.key,...(/^sb_/.test(cfg.key)?{}:{Authorization:'Bearer '+cfg.key}),'Content-Type':'application/json',...extra});
 const req=async(url,init)=>{const {r,body}=await send(fetcher,url,init);if(r.ok)return body;
  // PGRST205/PGRST202: table or function not created yet; 42501: no grant; 401 before PostgREST: wrong key; 540: paused free project.
  const code=body?.code,kind=code==='PGRST205'||code==='PGRST202'||code==='42P01'||code==='42883'?'missing-table':code==='42501'?'no-rights':r.status===401?'bad-key':r.status===540?'paused':'down';
  throw new StorageError(body?.message||'HTTP '+r.status,kind)};
 return {
  get:async key=>{const row=(await req(`${table}?${eq(key)}&select=value,expires_at`,{headers:headers()}))?.[0];
   return row&&(!row.expires_at||Date.parse(row.expires_at)>Date.now())?row.value:null},
  set:async(key,value,ttl)=>{await req(table+'?on_conflict=key',{method:'POST',headers:headers({Prefer:'resolution=merge-duplicates,return=minimal'}),
   body:JSON.stringify([{key,value:String(value),expires_at:ttl?new Date(Date.now()+ttl*1000).toISOString():null}])})},
  incr:async(key,ttl)=>Number(await req(base+'/rpc/semicobot_incr',{method:'POST',headers:headers(),body:JSON.stringify({k:key,ttl_seconds:ttl})})),
  del:async key=>{await req(`${table}?${eq(key)}`,{method:'DELETE',headers:headers({Prefer:'return=minimal'})})}}}

// Shared inventory (supabase/schema.sql): parts, purchase orders, stock moves and consumed-board counts,
// read and written by /api/inventory with the secret key once the session is checked. The browser sends
// what changed since it last synced; stock goes as a change (+/-), so two people at once both count.
const PART_FIELDS=['id','mpn','manufacturer','category','description','package','location','lifecycle','supplier','source','stock','min','price','specs'];
const str=v=>String(v??'').slice(0,500);
const nonneg=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:0};
export function partToRow(p){const extra={};for(const [k,v] of Object.entries(p||{}))if(!PART_FIELDS.includes(k))extra[k]=v;
 return {mpn:str(p.mpn).trim(),manufacturer:str(p.manufacturer),category:str(p.category),description:str(p.description),package:str(p.package),location:str(p.location),
  lifecycle:str(p.lifecycle),supplier:str(p.supplier),source:str(p.source),min_stock:Math.round(nonneg(p.min)),price_usd:nonneg(p.price),specs:p.specs&&typeof p.specs==='object'?p.specs:{},extra}}
export function rowToPart(r){return {...(r.extra||{}),id:r.id,mpn:r.mpn,manufacturer:r.manufacturer,category:r.category,description:r.description,package:r.package,location:r.location,
 lifecycle:r.lifecycle,supplier:r.supplier,source:r.source,stock:Number(r.stock)||0,min:Number(r.min_stock)||0,price:Number(r.price_usd)||0,specs:r.specs||{}}}
export const moveId=m=>m.id||[m.at,m.type,m.mpn,m.qty,m.ref].join('|');
const orderToRow=o=>({id:str(o.id),supplier:str(o.supplier),project:str(o.project),list_id:o.listId==null?null:str(o.listId),lines:Array.isArray(o.lines)?o.lines:[],
 shipping_usd:nonneg(o.shippingUsd),total_usd:nonneg(o.totalUsd),status:o.status==='received'?'received':'ordered',ordered_at:o.orderedAt||null,received_at:o.receivedAt||null});
const rowToOrder=r=>({id:r.id,supplier:r.supplier,project:r.project,listId:r.list_id,lines:r.lines||[],shippingUsd:Number(r.shipping_usd)||0,totalUsd:Number(r.total_usd)||0,
 status:r.status,orderedAt:r.ordered_at,receivedAt:r.received_at});
const moveToRow=m=>({id:moveId(m),at:m.at||null,type:m.type==='out'?'out':'in',mpn:str(m.mpn),qty:Math.round(nonneg(m.qty)),cost_usd:m.costUsd==null?null:nonneg(m.costUsd),ref:str(m.ref),note:str(m.note)});
const rowToMove=r=>({id:r.id,at:r.at,type:r.type,mpn:r.mpn,qty:Number(r.qty)||0,...(r.cost_usd==null?{}:{costUsd:Number(r.cost_usd)}),ref:r.ref,note:r.note});
// Turns the browser's change list into what the database functions take; drops anything malformed.
export function inventoryPayload(body){
 const parts=(Array.isArray(body?.parts)?body.parts:[]).filter(c=>c&&typeof c.id==='string'&&c.id).slice(0,20000).map(c=>c.op==='delete'?{id:c.id,op:'delete'}:{id:c.id,...(c.part?{row:partToRow(c.part)}:{}),delta:Math.round(Number(c.delta)||0)}).filter(c=>c.op||!c.row||c.row.mpn);
 const l=body?.ledger||{};
 const orders=(Array.isArray(l.orders)?l.orders:[]).filter(o=>o&&o.id).slice(0,5000).map(orderToRow);
 const removed=(Array.isArray(l.removed)?l.removed:[]).filter(x=>typeof x==='string').slice(0,5000);
 const moves=(Array.isArray(l.moves)?l.moves:[]).filter(m=>m&&m.mpn).slice(0,5000).map(moveToRow);
 const consumed={};for(const [k,v] of Object.entries(l.consumed&&typeof l.consumed==='object'?l.consumed:{}).slice(0,5000))consumed[str(k)]=Math.round(nonneg(v));
 return {parts,orders,removed,moves,consumed}}
// Part master catalogue ⇄ table rows. The file keeps each table as arrays in field order
// (semiconductorFields / resistorFields); the table has one named column per field, and `sort` keeps
// the file's order so the app builds exactly the same index from either.
const SEMI_COLS={category:'category',subType:'sub_type',mpn:'mpn',manufacturer:'manufacturer',description:'description',specs:'specs',package:'package',mount:'mount',use:'use_case',alternates:'alternates'};
const RES_COLS={type:'sub_type',size:'size',value:'value',ohms:'ohms',tolerance:'tolerance',power:'power',maxV:'max_v',tcr:'tcr',mpn:'mpn',manufacturer:'manufacturer',crossRef:'cross_ref',packaging:'packaging'};
export function catalogueRows(json){
 // Every row carries every column: in a bulk upload, Supabase's REST layer writes null for a missing key.
 const blank=Object.fromEntries([...new Set([...Object.values(SEMI_COLS),...Object.values(RES_COLS)])].map(c=>[c,c==='ohms'?null:'']));
 const rows=[];const add=(kind,fields,cols,list)=>(list||[]).forEach((r,i)=>{const row={kind,sort:i,...blank};
  fields.forEach((f,j)=>{const c=cols[f];if(!c)return;const v=r[j];row[c]=c==='ohms'?(v===''||v==null||!Number.isFinite(+v)?null:+v):String(v??'').slice(0,2000)});
  row.mpn=String(row.mpn||'').trim();if(row.mpn)rows.push(row)});
 add('semiconductor',json.semiconductorFields||Object.keys(SEMI_COLS),SEMI_COLS,json.semiconductors);
 add('resistor',json.resistorFields||Object.keys(RES_COLS),RES_COLS,json.resistors);
 return rows;
}
export function rowsToCatalogue(rows,source='Semiconductor & Resistor Part Master'){
 const by=k=>rows.filter(r=>r.kind===k).sort((a,b)=>(a.sort??0)-(b.sort??0));
 const semiFields=Object.keys(SEMI_COLS),resFields=Object.keys(RES_COLS);
 return {version:1,source,semiconductorFields:semiFields,resistorFields:resFields,
  semiconductors:by('semiconductor').map(r=>semiFields.map(f=>r[SEMI_COLS[f]]??'')),
  resistors:by('resistor').map(r=>resFields.map(f=>{const v=r[RES_COLS[f]];return f==='ohms'?(v==null?'':Number(v)):v??''}))}}
// A saved detail as the table stores it; anything that is not a valid detail is dropped.
function detailRow(key,data,who){const d=cleanDetails(data);if(!d||keyOf(d.mpn)!==key)return null;if(typeof data?.addedFrom==='string')d.addedFrom=data.addedFrom.slice(0,120);
 return {key,mpn:d.mpn,manufacturer:d.manufacturer,description:d.description.slice(0,400),package:d.package,source:d.source,data:d,updated_at:new Date().toISOString(),updated_by:who}}

export function inventoryBackend(cfg,fetcher=fetch){
 const base=cfg.url+'/rest/v1';
 const headers=(extra={})=>({apikey:cfg.key,...(/^sb_/.test(cfg.key)?{}:{Authorization:'Bearer '+cfg.key}),'Content-Type':'application/json',...extra});
 const req=async(url,init={})=>{const {r,body}=await send(fetcher,url,{...init,headers:headers(init.headers)});if(r.ok)return body;
  const code=body?.code,kind=code==='PGRST205'||code==='PGRST202'||code==='42P01'||code==='42883'?'missing-table':code==='42501'?'no-rights':r.status===401?'bad-key':r.status===540?'paused':'down';
  throw new StorageError(kind==='down'?(body?.message?'The database refused the change: '+body.message:MESSAGES.down):MESSAGES[kind],kind)};
 // PostgREST returns at most 1000 rows a request, so long tables are read in pages.
 const all=async(path,max=50000)=>{const out=[];for(let at=0;at<max;at+=1000){const page=await req(`${base}/${path}${path.includes('?')?'&':'?'}limit=1000&offset=${at}`);out.push(...(page||[]));if(!page||page.length<1000)break}return out};
 const project=(()=>{try{return new URL(cfg.url).host.split('.')[0]}catch{return ''}})();
 return {
  pull:async()=>{const [parts,orders,moves,consumed,details]=await Promise.all([all('inventory_parts?select=*&order=mpn.asc'),all('purchase_orders?select=*&order=ordered_at.desc'),
    req(`${base}/stock_moves?select=*&order=at.desc&limit=500`),all('production_consumed?select=job_id,boards'),all('part_details?select=key,data&order=key.asc')]);
   return {enabled:true,project,parts:parts.map(rowToPart),ledger:{orders:orders.map(rowToOrder),moves:(moves||[]).map(rowToMove),consumed:Object.fromEntries(consumed.map(c=>[c.job_id,Number(c.boards)||0]))},
    details:Object.fromEntries(details.map(d=>[d.key,d.data])),at:new Date().toISOString()}},
  apply:async(body,who='')=>{const p=inventoryPayload(body);
   if(p.parts.length)await req(base+'/rpc/inventory_apply',{method:'POST',body:JSON.stringify({changes:p.parts,who})});
   if(p.orders.length||p.removed.length||p.moves.length||Object.keys(p.consumed).length)await req(base+'/rpc/ledger_apply',{method:'POST',body:JSON.stringify({orders:p.orders,removed:p.removed,moves:p.moves,consumed:p.consumed,who})});
   // Part details: saved or changed entries are written whole (newest wins); removed ones are deleted.
   const d=body?.details||{},up=(Array.isArray(d.upsert)?d.upsert:[]).slice(0,10000).map(x=>detailRow(String(x?.key||''),x?.data,who)).filter(Boolean);
   for(let i=0;i<up.length;i+=500)await req(base+'/part_details?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(up.slice(i,i+500))});
   const gone=(Array.isArray(d.removed)?d.removed:[]).filter(k=>typeof k==='string'&&/^[A-Z0-9]{1,100}$/.test(k)).slice(0,10000);
   for(let i=0;i<gone.length;i+=200)await req(`${base}/part_details?key=in.(${gone.slice(i,i+200).join(',')})`,{method:'DELETE',headers:{Prefer:'return=minimal'}})},
  // The catalogue: null while the table is empty (the app then uses the bundled file).
  catalogue:async()=>{const rows=await all('part_master?select=*&order=kind.desc,sort.asc');return rows.length?rowsToCatalogue(rows):null},
  // Loads the catalogue file into part_master in batches; rows already there are updated, not doubled.
  seedCatalogue:async(json,onBatch=()=>{})=>{const rows=catalogueRows(json),now=new Date().toISOString();
   for(let i=0;i<rows.length;i+=500){await req(base+'/part_master?on_conflict=kind,mpn',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows.slice(i,i+500).map(r=>({...r,updated_at:now})))});onBatch(Math.min(rows.length,i+500),rows.length)}
   return rows.length}}}

const LOCK_SECONDS=15*60,PART_SECONDS=90*86400;
const parse=v=>{if(v==null)return null;try{return JSON.parse(v)}catch{return null}};
// auth: the account document, read once per request. attempts: wrong passwords per email, expiring after
// 15 minutes, shared by every function instance. store: the part-info cache; its failures never break a lookup.
export function hostedStores(db,env={}){
 const P=(env.KV_PREFIX||'semicobot')+':';let doc;
 const auth={
  load:()=>doc??=db.get(P+'auth').then(parse),
  save:async next=>{await db.set(P+'auth',JSON.stringify(next));doc=Promise.resolve(JSON.parse(JSON.stringify(next)))},
  attempts:{
   count:async email=>Number(await db.get(P+'fail:'+email))||0,
   add:email=>db.incr(P+'fail:'+email,LOCK_SECONDS),
   clear:email=>db.del(P+'fail:'+email)}};
 const store={
  get:async key=>{try{return parse(await db.get(P+'part:'+key))}catch{return null}},
  put:async(key,value)=>{try{await db.set(P+'part:'+key,JSON.stringify(value),PART_SECONDS)}catch{}}};
 return {auth,store}}

// Public workspaces use DigiKey without opening the database or other integrations.
export async function handleHosted(request,env=process.env,fetcher=fetch){
 try{
  if(env.REQUIRE_SIGNIN==='0'){
   const {DIGIKEY_CLIENT_ID,DIGIKEY_CLIENT_SECRET}=env;
   return await handleApi(request,{DIGIKEY_CLIENT_ID,DIGIKEY_CLIENT_SECRET},fetcher)||json({error:'Not found.'},404);
  }
  const url=new URL(request.url),e={...env,REQUIRE_SIGNIN:'1'},cfg=storageConfig(env);
  if(!cfg||cfg.error){
   if(url.pathname==='/api/status')return await handleApi(request,e,fetcher);
   if(url.pathname==='/api/auth/state')return json({enabled:true,admin:false,user:null});
   return json({error:MESSAGES[cfg?.error||'none']},503)}
  const {auth,store}=hostedStores(backendFor(cfg,fetcher),env);
  return await handleApi(request,e,fetcher,store,auth,cfg.kind==='supabase'?inventoryBackend(cfg,fetcher):null)||json({error:'Not found.'},404)}
 catch(err){
  if(err instanceof StorageError){console.error('storage:',err.code,err.message);return json({error:MESSAGES[err.code]||MESSAGES.down},503)}
  console.error(err);return json({error:'Internal server error.'},500)}}
