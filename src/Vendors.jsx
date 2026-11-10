import React,{useMemo,useState} from 'react';
import {ArrowUpRight,Plus,Search,Trash2,Plug,PencilLine,Check,Package} from 'lucide-react';
import {VENDOR_KINDS,CAPABILITY_FIELDS,loadVendorData,saveVendorData,vendorsOf,addVendor,removeVendor,setVendorNote,addProduct,removeProduct,productsOf} from './vendors.js';

// Vendors page: one registry of every vendor kind (semiconductor makers, distributors, passive makers,
// PCB fabricators, enclosure makers, mould makers, test labs and logistics). The BOM tool's PCB,
// enclosure and mould steps pick from the same list, so a vendor added or described here appears there.
// The products a vendor has: part number, stock, price, MOQ and lead time. The BOM tool shows them as
// "Registered vendor" offers on every BOM line with the same part number.
function VendorProducts({vendor,products,onAdd,onRemove}){
 const [open,setOpen]=useState(false),[f,setF]=useState({mpn:'',manufacturer:'',stock:'',price:'',currency:'INR',moq:'',leadDays:''});
 const set=k=>e=>setF(x=>({...x,[k]:e.target.value}));
 return <div className="vendor-products">
  <button type="button" className="text-button" aria-expanded={open} onClick={()=>setOpen(o=>!o)}><Package size={13}/>Products this vendor has ({products.length})</button>
  {open&&<>{products.length>0&&<ul>{products.map(p=><li key={p.id}><span><strong>{p.mpn}</strong><small>{[p.manufacturer,p.stock!=null?`${Number(p.stock).toLocaleString('en-IN')} in stock`:'',p.price!=null?`${p.currency==='INR'?'₹':'$'}${p.price} each`:'',p.moq?`MOQ ${p.moq}`:'',p.leadDays!=null?`${p.leadDays} days`:''].filter(Boolean).join(' · ')}</small></span>
    <button className="icon-button" type="button" aria-label={`Remove ${p.mpn} from ${vendor.name}`} onClick={()=>onRemove(p.id)}><Trash2 size={13}/></button></li>)}</ul>}
   <form className="product-form" onSubmit={e=>{e.preventDefault();if(!f.mpn.trim())return;onAdd(f);setF(x=>({...x,mpn:'',manufacturer:'',stock:'',price:'',moq:'',leadDays:''}))}}>
    <input aria-label={`Part number for ${vendor.name}`} placeholder="Part number (MPN)" value={f.mpn} maxLength="60" onChange={set('mpn')}/>
    <input aria-label="Manufacturer" placeholder="Manufacturer" value={f.manufacturer} maxLength="60" onChange={set('manufacturer')}/>
    <input aria-label="Stock" type="number" min="0" placeholder="Stock" value={f.stock} onChange={set('stock')}/>
    <span className="price-in"><input aria-label="Unit price" type="number" min="0" step="any" placeholder="Unit price" value={f.price} onChange={set('price')}/><select aria-label="Price currency" value={f.currency} onChange={set('currency')}><option>INR</option><option>USD</option></select></span>
    <input aria-label="Minimum order" type="number" min="0" placeholder="MOQ" value={f.moq} onChange={set('moq')}/>
    <input aria-label="Lead time days" type="number" min="0" placeholder="Lead days" value={f.leadDays} onChange={set('leadDays')}/>
    <button className="button small" type="submit" disabled={!f.mpn.trim()}><Plus size={13}/>Add product</button></form></>}
 </div>;
}
function VendorCard({vendor,api,onNote,onRemove,products,onAddProduct,onRemoveProduct}){
 const [edit,setEdit]=useState(false);const fields=CAPABILITY_FIELDS[vendor.kind]||[];
 const filled=fields.filter(([k])=>vendor[k]);
 const connected=vendor.api?!!api?.[vendor.api]:null;
 return <article className="vendor-card">
  <div className="vendor-card-head"><strong>{vendor.name}</strong>{vendor.api&&<span className={'badge '+(connected?'green':'neutral')} title={connected?'API key configured on the server':'API key not set up'}><span/>{connected?'API connected':'API not set up'}</span>}{!vendor.builtIn&&<span className="subtle-tag">YOURS</span>}</div>
  {vendor.about&&<small>{vendor.about}</small>}
  {edit?<form className="vendor-edit" onSubmit={e=>{e.preventDefault();setEdit(false)}}>
    {fields.map(([k,label,hint])=><label key={k}>{label}<input value={vendor[k]||''} placeholder={hint} maxLength="120" onChange={e=>onNote({[k]:e.target.value})}/></label>)}
    <label>Contact<input value={vendor.contact||''} placeholder="Name, email or phone" maxLength="120" onChange={e=>onNote({contact:e.target.value})}/></label>
    <label>Notes<textarea rows="2" value={vendor.notes||''} maxLength="300" onChange={e=>onNote({notes:e.target.value})}/></label>
    <button className="button small primary" type="submit"><Check size={14}/>Done</button>
   </form>
  :<dl className="vendor-caps">{fields.length>0&&filled.length===0&&<div><dt>Capabilities</dt><dd className="muted">Not confirmed yet</dd></div>}
    {filled.map(([k,label])=><div key={k}><dt>{label}</dt><dd>{vendor[k]}</dd></div>)}
    {vendor.contact&&<div><dt>Contact</dt><dd>{vendor.contact}</dd></div>}{vendor.notes&&<div><dt>Notes</dt><dd>{vendor.notes}</dd></div>}</dl>}
  <VendorProducts vendor={vendor} products={products} onAdd={onAddProduct} onRemove={onRemoveProduct}/>
  <div className="vendor-card-foot">
   {vendor.url&&<a className="text-button" href={vendor.url} target="_blank" rel="noreferrer">Website <ArrowUpRight size={13}/></a>}
   {!edit&&<button className="text-button" type="button" onClick={()=>setEdit(true)}><PencilLine size={13}/>Describe</button>}
   {!vendor.builtIn&&<button className="icon-button" type="button" aria-label={`Remove ${vendor.name}`} title="Remove" onClick={onRemove}><Trash2 size={14}/></button>}
  </div>
 </article>;
}

export default function Vendors({api=null,notify=()=>{}}){
 const [data,setData]=useState(loadVendorData),[kind,setKind]=useState('semiconductor'),[query,setQuery]=useState('');
 const [form,setForm]=useState({name:'',url:'',about:''});
 const update=next=>{setData(next);if(!saveVendorData(next))notify('Storage full: the vendor list was not saved.')};
 const all=useMemo(()=>vendorsOf(null,data),[data]);
 const q=query.trim().toLowerCase();
 const list=all.filter(v=>(q?true:v.kind===kind)&&(!q||[v.name,v.about,v.kind,v.notes,v.materials,v.families].join(' ').toLowerCase().includes(q)));
 const meta=VENDOR_KINDS.find(k=>k.id===kind);
 const add=e=>{e.preventDefault();if(!form.name.trim())return;update(addVendor(data,{kind,...form}));notify(`${form.name.trim()} added to ${meta.label.toLowerCase()}.`);setForm({name:'',url:'',about:''})};
 const apis=all.filter(v=>v.api),live=apis.filter(v=>api?.[v.api]).length;
 return <div className="vendors-page">
  <section className="panel vendors-head">
   <div><h2>Every vendor in one place</h2><p className="muted">Find a vendor, describe what they can do, and list the products they have. The BOM tool uses these lists for the PCB, enclosure and mould, and every product listed here appears as an offer on matching BOM lines.</p></div>
   <div className="vendor-stats"><div><strong>{all.length}</strong><small>vendors</small></div><div><strong>{live} of {apis.length}</strong><small>distributor APIs connected</small></div><div><strong>{data.custom.length}</strong><small>registered by you</small></div><div><strong>{(data.products||[]).length}</strong><small>vendor products</small></div></div>
  </section>
  <div className="vendor-tabs" role="tablist" aria-label="Vendor kinds">{VENDOR_KINDS.map(k=><button key={k.id} role="tab" aria-selected={!q&&kind===k.id} className={!q&&kind===k.id?'active':''} onClick={()=>{setKind(k.id);setQuery('')}}>{k.short}<b>{all.filter(v=>v.kind===k.id).length}</b></button>)}</div>
  <section className="panel vendor-list" aria-label={q?'Vendor search':meta.label}>
   <div className="panel-heading"><div className="title-row"><h2>{q?`Vendors matching “${query.trim()}”`:meta.label}</h2><span className="count-label">{list.length}</span></div>
    <div className="search-box"><Search size={15}/><input aria-label="Search vendors" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search every vendor"/></div></div>
   {!q&&<p className="muted vendor-about">{meta.about}{kind==='distributor'&&<> <Plug size={12}/> A BOM line looks at your own stock first, then distributors with a connected API, then products registered vendors list here, then Google Shopping listings of the exact part.</>}</p>}
   <div className="vendor-cards">{list.map(v=><VendorCard key={v.id} vendor={v} api={api} onNote={patch=>update(setVendorNote(data,v.id,patch))} onRemove={()=>{update(removeVendor(data,v.id));notify(`${v.name} removed.`)}}
    products={productsOf(data,v.id)} onAddProduct={f=>{update(addProduct(data,v.id,f));notify(`${f.mpn.trim()} added to ${v.name}. BOM lines with this part number now show it as an offer.`)}} onRemoveProduct={id=>update(removeProduct(data,id))}/>)}</div>
   {list.length===0&&<div className="empty"><Search/><h3>No vendor matches</h3></div>}
   {!q&&<form className="vendor-add" onSubmit={add}><strong>Register a {meta.short.toLowerCase()} vendor</strong><small className="muted">After registering, open “Products this vendor has” on its card to list part numbers, stock and prices.</small>
    <input aria-label="Vendor name" placeholder="Company name" value={form.name} maxLength="80" onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
    <input aria-label="Vendor website" placeholder="https://" value={form.url} maxLength="200" onChange={e=>setForm(f=>({...f,url:e.target.value}))}/>
    <input aria-label="What they do" placeholder="What they do" value={form.about} maxLength="160" onChange={e=>setForm(f=>({...f,about:e.target.value}))}/>
    <button className="button small primary" type="submit" disabled={!form.name.trim()}><Plus size={14}/>Register vendor</button></form>}
  </section>
 </div>;
}
