import React,{useEffect,useMemo,useState} from 'react';
import {PackageCheck,Truck,Wallet,TrendingUp,ArrowDownToLine,ArrowUpFromLine,Plus,X,ChevronDown,ChevronRight,Factory} from 'lucide-react';
import {loadLedger,saveLedger,placeOrder,receiveOrder,cancelOrder,money as moneyOf,LEDGER_UPDATED} from './ledger.js';
import {loadLists} from './savedLists.js';
import {useMoney} from './currency.jsx';

const int=n=>Math.round(n||0).toLocaleString('en-IN');
const when=iso=>iso?new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
const monthName=m=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1,1)).toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})};

// Purchases and money: what was ordered and received (received orders go into inventory by themselves),
// what production took out of stock, what came in from dispatched boards, and the difference.
export default function Purchases({parts,setParts,jobs=[],notify=()=>{},onNavigate=()=>{}}){
 const m=useMoney();
 const [ledger,setLedger]=useState(loadLedger),[open,setOpen]=useState(null),[tab,setTab]=useState('orders');
 const [form,setForm]=useState({mpn:'',manufacturer:'',qty:'',price:'',received:true});
 const save=next=>{setLedger(next);if(!saveLedger(next))notify('Storage full: the purchase was not saved.')};
 // Orders and moves other people made arrive with the shared inventory.
 useEffect(()=>{const reload=()=>setLedger(loadLedger());window.addEventListener(LEDGER_UPDATED,reload);return ()=>window.removeEventListener(LEDGER_UPDATED,reload)},[]);
 const lists=useMemo(loadLists,[]);
 const sum=useMemo(()=>moneyOf(ledger,jobs,lists),[ledger,jobs,lists]);
 const usd=v=>v===''||v==null?0:m.currency==='INR'?Number(v)/m.inrPerUsd:Number(v);
 const receive=id=>{const r=receiveOrder(ledger,parts,id);setParts(r.parts);save(r.ledger);
  notify(`${id} received: ${r.updated.length} part${r.updated.length===1?'':'s'} topped up${r.added.length?`, ${r.added.length} new part${r.added.length===1?'':'s'} added`:''} in inventory.`)};
 const record=e=>{e.preventDefault();const q=Math.round(+form.qty||0);if(!form.mpn.trim()||q<=0)return;
  const r=placeOrder(ledger,{supplier:'',lines:[{mpn:form.mpn,manufacturer:form.manufacturer,qty:q,unitUsd:usd(form.price)}]});if(!r.order)return;
  if(form.received){const x=receiveOrder(r.ledger,parts,r.order.id);setParts(x.parts);save(x.ledger);notify(`${form.mpn.trim()}: ${int(q)} added to inventory (${r.order.id}).`)}
  else{save(r.ledger);notify(`${r.order.id} recorded as ordered. Mark it received when it arrives.`)}
  setForm(f=>({...f,mpn:'',manufacturer:'',qty:'',price:''}))};
 const waiting=ledger.orders.filter(o=>o.status==='ordered');
 const cards=[[Wallet,'Spent on purchases',m.fmt(sum.spentUsd),`${int(ledger.orders.length)} orders · ${m.fmt(sum.openUsd)} still to arrive`],
  [TrendingUp,'Earned from dispatched boards',m.fmt(sum.incomeUsd),sum.unpricedBoards?`${int(sum.unpricedBoards)} boards dispatched without a quoted price`:'at the saved list\'s price per board'],
  [Factory,'Material used in production',m.fmt(sum.materialUsd),'components taken out of stock for completed boards'],
  [ArrowDownToLine,'Earned − spent',m.fmt(sum.differenceUsd),sum.differenceUsd>=0?'more came in than went out':'more went out than came in']];
 return <div className="purchases-page">
  <div className="money-cards">{cards.map(([Icon,t,v,n],i)=><div key={t} className={'money-card'+(i===3?(sum.differenceUsd>=0?' good':' bad'):'')}><span><Icon size={16}/>{t}</span><strong>{v}</strong><small>{n}</small></div>)}</div>
  <div className="vendor-tabs" role="tablist" aria-label="Purchases sections">{[['orders',`Orders · ${waiting.length} to receive`],['money','Spend and income'],['moves','Stock moves']].map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>

  {tab==='orders'&&<>
   <section className="panel" aria-label="Purchase orders"><div className="panel-heading"><div className="title-row"><Truck size={17}/><h2>Purchase orders</h2><span className="count-label">{ledger.orders.length}</span></div><button className="text-button" onClick={()=>onNavigate('BOM tool')}>Order from a BOM's purchase list</button></div>
    {ledger.orders.length===0?<div className="empty"><Truck/><h3>No purchases yet</h3><p>In the BOM tool, Add all to list, open the Purchase list and press Place order for a supplier. Or record a purchase below.</p></div>
    :<div className="table-scroll"><table className="saved-table"><thead><tr><th>Order</th><th>For</th><th className="numeric">Lines</th><th className="numeric">Total</th><th>Status</th><th/></tr></thead>
     <tbody>{ledger.orders.map(o=><React.Fragment key={o.id}><tr>
      <td><button className="link-button" aria-expanded={open===o.id} onClick={()=>setOpen(open===o.id?null:o.id)}>{open===o.id?<ChevronDown size={12}/>:<ChevronRight size={12}/>}{o.id}</button><small className="muted"> {when(o.orderedAt)}</small></td>
      <td>{o.project||<em className="na">—</em>}</td><td className="numeric">{o.lines.length}</td><td className="numeric">{m.fmt(o.totalUsd)}</td>
      <td>{o.status==='received'?<span className="badge green"><span/>Received {when(o.receivedAt)}</span>:<span className="badge amber"><span/>Ordered</span>}</td>
      <td className="saved-actions">{o.status==='ordered'&&<><button className="button small primary" onClick={()=>receive(o.id)}><PackageCheck size={14}/>Mark received</button><button className="icon-button" aria-label={`Cancel ${o.id}`} title="Cancel the order" onClick={()=>{if(confirm(`Cancel ${o.id}?`)){save(cancelOrder(ledger,o.id));notify(`${o.id} cancelled.`)}}}><X size={14}/></button></>}</td></tr>
      {open===o.id&&<tr className="g-detail-row"><td colSpan={6}><table className="cart-table"><thead><tr><th>Part</th><th className="numeric">Quantity</th><th className="numeric">Unit</th><th className="numeric">Line</th></tr></thead><tbody>{o.lines.map(l=><tr key={l.mpn}><td><strong>{l.mpn}</strong>{l.manufacturer&&<small className="muted"> {l.manufacturer}</small>}</td><td className="numeric">{int(l.qty)}</td><td className="numeric">{m.fmt(l.unitUsd,{unit:true})}</td><td className="numeric">{m.fmt(l.qty*l.unitUsd)}</td></tr>)}</tbody></table></td></tr>}
     </React.Fragment>)}</tbody></table></div>}
   </section>
   <section className="panel" aria-label="Record a purchase"><div className="panel-heading"><div className="title-row"><Plus size={17}/><h2>Record a purchase</h2></div></div>
    <form className="purchase-form" onSubmit={record}>
     <label>Part number<input value={form.mpn} placeholder="MPN" required onChange={e=>setForm(f=>({...f,mpn:e.target.value}))}/></label>
     <label>Manufacturer<input value={form.manufacturer} onChange={e=>setForm(f=>({...f,manufacturer:e.target.value}))}/></label>
     <label>Quantity<input type="number" min="1" value={form.qty} required onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></label>
     <label>Unit price ({m.currency})<input type="number" min="0" step="any" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/></label>
     <label className="check-inline"><input type="checkbox" checked={form.received} onChange={e=>setForm(f=>({...f,received:e.target.checked}))}/>Already received: add to inventory now</label>
     <button className="button primary" type="submit"><Plus size={14}/>Record</button>
    </form></section></>}

  {tab==='money'&&<div className="money-grid">
   <section className="panel wide" aria-label="By month"><div className="panel-heading"><h2>By month</h2></div>
    {sum.months.length?<table className="saved-table"><thead><tr><th>Month</th><th className="numeric">Spent</th><th className="numeric">Earned</th><th className="numeric">Earned − spent</th></tr></thead><tbody>{sum.months.map(x=><tr key={x.month}><td>{monthName(x.month)}</td><td className="numeric">{m.fmt(x.spentUsd)}</td><td className="numeric">{m.fmt(x.incomeUsd)}</td><td className={'numeric '+(x.incomeUsd-x.spentUsd>=0?'ok-text':'warn-text')}>{m.fmt(x.incomeUsd-x.spentUsd)}</td></tr>)}</tbody></table>:<p className="muted bom-off">Nothing spent or earned yet.</p>}</section>
   <section className="panel wide" aria-label="By job"><div className="panel-heading"><h2>Per production job</h2></div>
    {sum.jobs.length?<table className="saved-table"><thead><tr><th>Job</th><th className="numeric">Boards dispatched</th><th className="numeric">Price per board</th><th className="numeric">Earned</th><th className="numeric">Material used</th></tr></thead><tbody>{sum.jobs.map(x=><tr key={x.id}><td><strong>{x.board}</strong><small className="muted"> {x.customer}{x.quote?` · ${x.quote}`:''}</small></td><td className="numeric">{int(x.boards)}</td><td className="numeric">{x.perBoardUsd==null?<em className="na">not quoted</em>:m.fmt(x.perBoardUsd,{unit:true})}</td><td className="numeric">{m.fmt(x.incomeUsd)}</td><td className="numeric">{m.fmt(x.materialUsd)}</td></tr>)}</tbody></table>:<p className="muted bom-off">Income appears when boards of a job from the BOM tool are dispatched (Inventory → Production).</p>}</section>
  </div>}

  {tab==='moves'&&<section className="panel" aria-label="Stock moves"><div className="panel-heading"><div className="title-row"><h2>Stock moves</h2><span className="count-label">{ledger.moves.length}</span></div></div>
   {ledger.moves.length?<div className="table-scroll"><table className="saved-table"><thead><tr><th>Date</th><th>Part</th><th className="numeric">Quantity</th><th>Why</th></tr></thead><tbody>{ledger.moves.slice(0,200).map((x,i)=><tr key={i}><td>{when(x.at)}</td><td><strong>{x.mpn}</strong></td><td className={'numeric '+(x.type==='in'?'ok-text':'warn-text')}>{x.type==='in'?<ArrowDownToLine size={12}/>:<ArrowUpFromLine size={12}/>} {x.type==='in'?'+':'−'}{int(x.qty)}</td><td>{x.note} <small className="muted">{x.ref}</small></td></tr>)}</tbody></table></div>
   :<p className="muted bom-off">Received orders add stock here; completed boards take their components out.</p>}</section>}
 </div>;
}
