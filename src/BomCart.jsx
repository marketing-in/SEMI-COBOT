import React,{useEffect,useId,useRef,useState} from 'react';
import {X,Download,Trash2,Mail,ClipboardList,Gavel} from 'lucide-react';
import {cartGroups,cartCsv} from './bom.js';
import {contactLink} from './BomOverview.jsx';

// Purchase list and bids. The list is grouped per supplier: semi-cobot never places orders, so each
// supplier's lines download as CSV for that supplier's BOM upload. Bids record the price
// asked of excess and broker sellers, with an email when the offer has a contact.
function useDialog(){const ref=useRef(null),id=useId();useEffect(()=>{const prev=document.activeElement;ref.current.showModal();return()=>prev?.focus?.()},[]);return [ref,id]}
const fmtInt=v=>Math.round(v).toLocaleString('en-IN');
// A quantity that can be cleared while typing; it is saved (at least 1) when it is a number or on leaving the field.
function QtyInput({label,value,onCommit}){const [t,setT]=useState(String(value));useEffect(()=>setT(String(value)),[value]);
 const commit=v=>{const n=Math.round(+v);if(n>=1)onCommit(n)};
 return <input className="bom-num" type="number" min="1" aria-label={label} value={t} onChange={e=>{setT(e.target.value);commit(e.target.value)}} onBlur={()=>{if(!(Math.round(+t)>=1))setT(String(value))}}/>}
const host=u=>{try{return new URL(u).origin}catch{return null}};

export default function BomCart({cart,bids,money,shipping,onQty,onRemove,onClear,onBidStatus,onBidRemove,onClose,startTab='cart'}){
 const [ref,id]=useDialog();const [tab,setTab]=useState(startTab);const groups=cartGroups(cart);
 const download=g=>{const blob=new Blob([cartCsv(g.items)],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`purchase-list-${g.seller.replace(/[^\w-]+/g,'-')}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)};
 return <dialog ref={ref} className="wide" aria-labelledby={id} onCancel={onClose} onClick={e=>{const r=ref.current.getBoundingClientRect();if(e.target===ref.current&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))onClose()}}>
  <div className="modal-head"><h2 id={id}>Purchase list and bids</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div>
  <div className="segmented" role="group" aria-label="Purchase list or bids"><button aria-pressed={tab==='cart'} className={tab==='cart'?'active':''} onClick={()=>setTab('cart')}><ClipboardList size={14}/>List · {cart.length}</button><button aria-pressed={tab==='bids'} className={tab==='bids'?'active':''} onClick={()=>setTab('bids')}><Gavel size={14}/>Bids · {bids.length}</button></div>
  {tab==='cart'?<>
   <p className="muted cart-note">Nothing is ordered from here. Download each supplier's list and upload it to their BOM tool.</p>
   {groups.length===0?<div className="empty"><ClipboardList/><h3>The purchase list is empty</h3><p>Use Add to list on an offer, or Add all to list above the BOM.</p></div>:
   groups.map(g=>{const sh=shipping.groups.find(x=>x.seller===g.seller);const site=host(g.items.find(i=>i.url)?.url);
    return <section key={g.seller} className="cart-group" aria-label={`${g.seller} list`}>
     <div className="cart-head"><h3>{g.seller}</h3><span className="muted">{g.items.length} line{g.items.length===1?'':'s'} · {money.fmt(g.subtotal)}{sh?` · shipping ${sh.charge==null?'not quoted':money.fmt(sh.charge)}`:''}</span>
      <span className="cart-actions"><button className="button small" onClick={()=>download(g)}><Download size={14}/>CSV</button>{site&&<a className="button small" href={site} target="_blank" rel="noreferrer noopener">Open {g.seller}</a>}</span></div>
     <div className="table-scroll"><table className="cart-table"><thead><tr><th>Part</th><th className="numeric">Quantity</th><th className="numeric">Unit</th><th className="numeric">Line</th><th aria-label="Remove"/></tr></thead><tbody>
      {g.items.map(i=><tr key={i.id}><td><strong>{i.mpn}</strong>{i.ref&&<small className="muted"> {i.ref}</small>}</td><td className="numeric"><QtyInput label={`${i.mpn} quantity from ${g.seller}`} value={i.qty} onCommit={v=>onQty(i.id,v)}/></td>
       <td className="numeric">{money.fmt(i.unit,{unit:true})}</td><td className="numeric">{money.fmt(i.qty*i.unit)}</td><td><button className="icon-button" aria-label={`Remove ${i.mpn} from the purchase list`} onClick={()=>onRemove(i.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
    </section>})}
   {groups.length>0&&<div className="cart-foot"><strong>{money.fmt(groups.reduce((a,g)=>a+g.subtotal,0))}</strong><span className="muted">before supplier shipping</span><button className="text-button" onClick={onClear}>Clear the list</button></div>}
  </>:<>
   {bids.length===0?<div className="empty"><Gavel/><h3>No bids yet</h3><p>Use Bid on an excess or broker offer.</p></div>:
   <div className="table-scroll"><table className="cart-table"><thead><tr><th>Part</th><th>Seller</th><th className="numeric">Quantity</th><th className="numeric">Target price</th><th>Status</th><th aria-label="Actions"/></tr></thead><tbody>
    {bids.map(b=>{const link=contactLink(b)?.startsWith('mailto:')?`mailto:${b.contact}?subject=${encodeURIComponent(`Bid: ${b.mpn} × ${b.qty}`)}&body=${encodeURIComponent(`Hello,\n\nWe would like ${fmtInt(b.qty)} pcs of ${b.mpn} at ${b.targetText} each${b.dateCode?`, date code ${b.dateCode}`:''}.\n${b.note||''}\n\nRegards`)}`:contactLink(b);
     return <tr key={b.id}><td><strong>{b.mpn}</strong><small className="muted"> {new Date(b.at).toLocaleDateString('en-IN')}</small></td><td>{b.seller}</td><td className="numeric">{fmtInt(b.qty)}</td><td className="numeric">{b.targetText}</td>
      <td><select aria-label={`${b.mpn} bid status`} value={b.status} onChange={e=>onBidStatus(b.id,e.target.value)}>{['Draft','Sent','Accepted','Declined'].map(x=><option key={x}>{x}</option>)}</select></td>
      <td><div className="offer-actions">{link&&<a className="button small" href={link} target="_blank" rel="noreferrer noopener" onClick={()=>b.status==='Draft'&&onBidStatus(b.id,'Sent')}><Mail size={13}/>Send</a>}<button className="icon-button" aria-label={`Delete the bid for ${b.mpn}`} onClick={()=>onBidRemove(b.id)}><Trash2 size={14}/></button></div></td></tr>})}</tbody></table></div>}
  </>}
 </dialog>;
}

// Bid on an offer: quantity, target unit price (in the display currency), a note.
export function BidDialog({offer,need,money,onSave,onClose}){
 const [ref,id]=useDialog();const [f,setF]=useState({qty:String(Math.max(1,need||offer.moq||1)),price:'',note:''});const set=k=>e=>setF(x=>({...x,[k]:e.target.value}));
 const save=e=>{e.preventDefault();const target=+f.price;onSave({id:'b'+Math.random().toString(36).slice(2,9),mpn:offer.mpn,seller:offer.seller,contact:offer.contact||null,dateCode:offer.dateCode||null,qty:Math.max(1,Math.round(+f.qty||1)),
  targetUsd:money.currency==='INR'?target/money.inrPerUsd:target,targetText:`${money.currency} ${target.toLocaleString(money.currency==='INR'?'en-IN':'en-US',{maximumFractionDigits:4})}`,note:f.note.slice(0,300),status:'Draft',at:new Date().toISOString()})};
 return <dialog ref={ref} aria-labelledby={id} onCancel={onClose}><div className="modal-head"><h2 id={id}>Bid to {offer.seller}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div>
  <p className="muted">{offer.mpn}{offer.priceUsd?` · listed at ${money.fmt(offer.priceUsd,{unit:true})}`:' · no listed price'}{Number.isFinite(offer.stock)?` · ${fmtInt(offer.stock)} in stock`:''}</p>
  <form className="offer-form" onSubmit={save}><label>Quantity<input type="number" min="1" value={f.qty} onChange={set('qty')} required/></label><label>Target unit price ({money.currency})<input type="number" min="0" step="any" value={f.price} onChange={set('price')} required/></label>
   <label className="wide-field">Note<textarea rows="2" value={f.note} onChange={set('note')} placeholder="Date code, packaging, delivery"/></label><button className="button primary full wide-field" type="submit"><Gavel size={15}/>Save bid</button></form>
 </dialog>;
}
