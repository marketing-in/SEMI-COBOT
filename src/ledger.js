// Purchases, stock moves and money. Everything that changes stock goes through here, so the inventory,
// the BOM tool and production stay connected:
// - placeOrder: a purchase order per supplier from the BOM tool's purchase list (or entered by hand);
// - receiveOrder: the parts arrive and are added to inventory (new part numbers are created);
// - consumeForJob: completed boards of a job take their components out of inventory, once per board;
// - money: what was spent on purchases and what came in from dispatched boards.
export const LEDGER_STORE='semicobot-ledger-v1';
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const key=m=>String(m||'').trim().toUpperCase();
const day=iso=>String(iso||'').slice(0,10);

export function loadLedger(){try{const v=JSON.parse(localStorage.getItem(LEDGER_STORE));return {orders:Array.isArray(v?.orders)?v.orders:[],moves:Array.isArray(v?.moves)?v.moves:[],consumed:v?.consumed&&typeof v.consumed==='object'?v.consumed:{}}}catch{return {orders:[],moves:[],consumed:{}}}}
// Each save is announced (LEDGER_SAVED) so the shared inventory can send it; when the shared state brings
// other people's orders and moves, LEDGER_UPDATED tells the open pages to read the ledger again.
export const LEDGER_SAVED='semicobot-ledger-saved',LEDGER_UPDATED='semicobot-ledger-updated';
export function saveLedger(l){try{localStorage.setItem(LEDGER_STORE,JSON.stringify({...l,moves:l.moves.slice(0,500)}));if(typeof window!=='undefined')window.dispatchEvent(new Event(LEDGER_SAVED));return true}catch{return false}}

const orderTotal=lines=>lines.reduce((a,l)=>a+num(l.qty)*num(l.unitUsd),0);
export function placeOrder(ledger,{supplier,lines,project='',listId=null,shippingUsd=0,now=new Date().toISOString()}){
 const clean=(lines||[]).map(l=>({mpn:String(l.mpn||'').trim(),manufacturer:String(l.manufacturer||''),description:String(l.description||''),package:String(l.package||''),qty:Math.max(0,Math.round(num(l.qty))),unitUsd:Math.max(0,num(l.unitUsd))})).filter(l=>l.mpn&&l.qty>0);
 if(!clean.length)return {ledger,order:null};
 const n=ledger.orders.filter(o=>day(o.orderedAt)===day(now)).length+1;
 const order={id:`PO-${day(now).replace(/-/g,'')}-${String(n).padStart(3,'0')}`,supplier:String(supplier||''),project,listId,lines:clean,shippingUsd:Math.max(0,num(shippingUsd)),totalUsd:orderTotal(clean)+Math.max(0,num(shippingUsd)),status:'ordered',orderedAt:now,receivedAt:null};
 return {ledger:{...ledger,orders:[order,...ledger.orders]},order};
}

// The order arrives: each line is added to inventory. A part already in stock gets the quantity and a
// weighted average unit cost; a new part number becomes a new inventory record.
export function receiveOrder(ledger,parts,id,now=new Date().toISOString()){
 const order=ledger.orders.find(o=>o.id===id);if(!order||order.status==='received')return {ledger,parts,added:[],updated:[]};
 let next=[...parts];const added=[],updated=[],moves=[];
 for(const l of order.lines){const i=next.findIndex(p=>key(p.mpn)===key(l.mpn));
  if(i>=0){const p=next[i],stock=Math.max(0,num(p.stock)),cost=num(p.price);const price=stock+l.qty>0?(stock*cost+l.qty*l.unitUsd)/(stock+l.qty):l.unitUsd;
   next[i]={...p,stock:stock+l.qty,price:cost>0?Math.round(price*1e5)/1e5:l.unitUsd,supplier:p.supplier||order.supplier};updated.push(l.mpn)}
  else{next=[...next,{id:'buy-'+key(l.mpn).replace(/[^A-Z0-9]/g,'').slice(0,20)+'-'+Date.now().toString(36),mpn:l.mpn,manufacturer:l.manufacturer||'',category:'Uncategorized',description:l.description||'',package:l.package||'',stock:l.qty,min:0,price:l.unitUsd,lifecycle:'',location:'',supplier:order.supplier,source:'purchase'}];added.push(l.mpn)}
  moves.push({at:now,type:'in',mpn:l.mpn,qty:l.qty,ref:order.id,note:'received'})}
 return {ledger:{...ledger,orders:ledger.orders.map(o=>o.id===id?{...o,status:'received',receivedAt:now}:o),moves:[...moves,...ledger.moves]},parts:next,added,updated};
}
export function cancelOrder(ledger,id){return {...ledger,orders:ledger.orders.filter(o=>!(o.id===id&&o.status==='ordered'))}}

// Completed boards take their components: (boards completed − boards already counted) × quantity per board.
// lines: [{mpn, qty}] per board. Stock never goes below zero; what was missing is reported as short.
export function consumeForJob(ledger,parts,job,built,lines,now=new Date().toISOString()){
 const done=Math.max(0,Math.round(num(ledger.consumed[job.id]))),boards=Math.max(0,Math.round(num(built)))-done;
 if(boards<=0||!lines?.length)return {ledger,parts,boards:0,taken:[],short:[]};
 let next=[...parts];const taken=[],short=[],moves=[];
 for(const l of lines){const need=Math.round(num(l.qty)*boards);if(need<=0)continue;const i=next.findIndex(p=>key(p.mpn)===key(l.mpn));
  if(i<0){short.push({mpn:l.mpn,need,missing:need});continue}
  const have=Math.max(0,num(next[i].stock)),use=Math.min(have,need);next[i]={...next[i],stock:have-use};
  if(use)taken.push({mpn:l.mpn,qty:use,costUsd:use*num(next[i].price)});if(use<need)short.push({mpn:l.mpn,need,missing:need-use});
  if(use)moves.push({at:now,type:'out',mpn:l.mpn,qty:use,costUsd:use*num(next[i].price),ref:job.id,note:`${boards} board${boards===1?'':'s'} of ${job.board}`})}
 return {ledger:{...ledger,consumed:{...ledger.consumed,[job.id]:done+boards},moves:[...moves,...ledger.moves]},parts:next,boards,taken,short};
}

// Spend (purchase orders) and income (boards dispatched at the saved list's price per board), by month,
// supplier and job. Income is counted only for jobs whose saved list carries a customer total.
export function money(ledger,jobs,lists){
 const month=iso=>day(iso).slice(0,7);const bump=(m,k,v)=>m.set(k,(m.get(k)||0)+v);
 const spendByMonth=new Map(),incomeByMonth=new Map(),bySupplier=new Map(),byJob=[];
 for(const o of ledger.orders){bump(spendByMonth,month(o.orderedAt),o.totalUsd);bump(bySupplier,o.supplier,o.totalUsd)}
 const usedByJob=new Map();for(const m of ledger.moves)if(m.type==='out')usedByJob.set(m.ref,(usedByJob.get(m.ref)||0)+num(m.costUsd));
 let income=0,unpriced=0;
 for(const j of jobs||[]){const list=(lists||[]).find(l=>l.id===j.listId);const per=list&&list.total!=null&&list.boards>0?list.total/list.boards:null;
  const shipped=(j.dispatches||[]).reduce((a,d)=>a+num(d.qty),0);
  if(per==null){if(shipped)unpriced+=shipped;if(usedByJob.get(j.id))byJob.push({id:j.id,board:j.board,customer:j.customer,boards:shipped,perBoardUsd:null,incomeUsd:0,materialUsd:usedByJob.get(j.id),quote:j.quote||''});continue}
  let got=0;for(const d of j.dispatches||[]){const v=num(d.qty)*per;got+=v;bump(incomeByMonth,month(d.date),v)}
  income+=got;byJob.push({id:j.id,board:j.board,customer:j.customer,boards:shipped,perBoardUsd:per,incomeUsd:got,materialUsd:usedByJob.get(j.id)||0,quote:j.quote||''})}
 const spent=ledger.orders.reduce((a,o)=>a+o.totalUsd,0),received=ledger.orders.filter(o=>o.status==='received').reduce((a,o)=>a+o.totalUsd,0);
 const months=[...new Set([...spendByMonth.keys(),...incomeByMonth.keys()])].filter(Boolean).sort().reverse().map(m=>({month:m,spentUsd:spendByMonth.get(m)||0,incomeUsd:incomeByMonth.get(m)||0}));
 const materialUsd=[...usedByJob.values()].reduce((a,b)=>a+b,0);
 return {materialUsd,spentUsd:spent,receivedUsd:received,openUsd:spent-received,incomeUsd:income,differenceUsd:income-spent,unpricedBoards:unpriced,months,
  suppliers:[...bySupplier].map(([supplier,usd])=>({supplier,usd})).sort((a,b)=>b.usd-a.usd),jobs:byJob.sort((a,b)=>b.incomeUsd-a.incomeUsd)};
}
