import React,{useEffect,useId,useRef,useState} from 'react';
import {ArrowLeft,RefreshCw,ListPlus,Gavel,MessageSquare,ArrowUpRight,Plus,Trash2,TriangleAlert,Replace} from 'lucide-react';
import {PartImage} from './PartImage.jsx';
import {allOffers,offerKey,unitAt,orderQty,offerLeadDays,availability,complianceOf,marketLabel,recommend,MARKET_TYPES} from './bom.js';
import {SCORES,scoreText,lifecycleOf,offerCertainty,uncertaintyText,uncertaintyBand} from './bomScores.js';

// Component overview: the part, a suggested alternative, three cards (general, availability,
// lifecycle and compliance) and every offer across the markets, where an offer can be chosen for the
// BOM, added to the purchase list, bid on or the seller contacted. Missing data reads "Not available".
const NA='Not available';
const fmtInt=v=>Math.round(v).toLocaleString('en-IN');
export const days=d=>d==null?NA:d===0?'In stock':d<14?`${d} days`:`${Math.round(d/7)} weeks`;
const when=iso=>iso?new Date(iso).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'Never';

// A score with its explanation as a tooltip (hover or keyboard focus).
// The explanation is announced through aria-describedby and shown by the BOM page's tooltip layer.
export function ScoreBadge({k,s,compact=false,plain=false,focusable=true}){const id=useId();const v=s?.score;const band=v==null?'na':v>=70?'good':v>=40?'fair':'poor';const meta=SCORES.find(x=>x[0]===k);
 return <span className={'score '+band+(compact?' compact':'')+(plain?' plain':'')} tabIndex={focusable?0:-1} role="img" data-tip="" aria-describedby={id} aria-label={`${meta[1]}: ${v==null?NA:v+' of 100'}`}>{v==null?<em>{NA}</em>:v}<span id={id} className="sr-only">{scoreText(k,s)}</span></span>}

// Contact for "Chat with seller": an email, a phone number (WhatsApp) or a web address on the offer.
export function contactLink(o){const c=String(o?.contact||'').trim();if(!c)return null;
 if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c))return 'mailto:'+c+'?subject='+encodeURIComponent(`${o.mpn||''} offer`);
 const digits=c.replace(/[^\d+]/g,'');if(/^\+?\d{8,15}$/.test(digits))return 'https://wa.me/'+digits.replace('+','');
 if(/^https:\/\//.test(c))return c;return null}

// Uncertainty of an offer (0–100, lower is better) with its reasons as a tooltip.
function UncertaintyBadge({c}){const id=useId();const u=c?.uncertainty;const band=uncertaintyBand(u);
 return <span className={'score unc '+band} tabIndex={0} role="img" data-tip="" aria-describedby={id} aria-label={`Uncertainty: ${u==null?NA:u+' of 100, '+band}`}>{u==null?<em>{NA}</em>:<>{u} <small>{band}</small></>}<span id={id} className="sr-only">{uncertaintyText(c)}</span></span>}
function Card({title,rows}){return <section className="cmp-card" aria-label={title}><h3>{title}</h3><dl>{rows.map(([k,v,sub])=><div key={k}><dt>{k}</dt><dd className={v===NA?'na':''}>{v}{sub&&<small>{sub}</small>}</dd></div>)}</dl></section>}

export default function BomOverview({row,calc,scores,money,alternates=[],busy,ready,fx,onBack,onRefresh,onSelectOffer,onAddToCart,onBid,onAddOffer,onRemoveOffer,onUseAlternate,focusOffers=false,marketReady=false,shippingRules={}}){
 const offersRef=useRef(null),headRef=useRef(null);const [adding,setAdding]=useState(false);
 // Focus moves into the overview: its heading, or the offers when "View All Market Prices" opened it.
 useEffect(()=>{if(focusOffers){offersRef.current?.scrollIntoView({block:'start'});offersRef.current?.focus({preventScroll:true})}else headRef.current?.focus()},[focusOffers,row.id]);
 // Shipping per offer: quoted on the offer, else your rule for that supplier (per order), else not quoted.
 const shipOf=o=>{if(o.shippingUsd!=null&&o.shippingUsd!=='')return {v:+o.shippingUsd,note:'quoted on the offer'};const r=shippingRules[o.seller];if(r&&r.flat!=null)return {v:r.flat,note:'per order, your rule'+(r.freeAbove!=null?`; free above ${money.fmt(r.freeAbove)}`:'')};return null};
 const quoted=o=>o.currency&&o.price!=null&&o.source!=='manual'&&o.currency!==money.currency?`quoted ${o.currency} ${o.price}`:'';
 const offers=allOffers(row),qty=Math.max(1,calc.buy||calc.need||1),sel=calc.offer,av=availability(row,calc),cp=complianceOf(row,sel);
 const suggestion=offers.map(o=>o.suggestedReplacement).find(Boolean)||alternates[0]?.mpn||null;
 const life=lifecycleOf(row);const eol=/obsolete|end of life|discontinu|last time|not (recommended )?for new/i.test(life||'');
 const sorted=[...offers].sort((a,b)=>(unitAt(a,qty)?.unit??Infinity)-(unitAt(b,qty)?.unit??Infinity));
 // Every offer's uncertainty, and the best one to get: the recommended offer for the quantity still to buy.
 const certs=new Map(offers.map(o=>[offerKey(o),offerCertainty(o,offers,qty,row.mpn)]));
 const best=recommend(offers,qty),bestKey=best?offerKey(best.offer):null,bestCert=best?certs.get(bestKey):null;
 const listings=offers.filter(o=>o.marketType==='marketplace'||(!o.marketType&&o.source==='serpapi')).length;
 const breaks=o=>(o.breaksUsd||[]).slice(0,4).map(b=>`${fmtInt(b.qty)}+ ${money.fmt(b.price,{unit:true})}`).join(' · ');
 const original=o=>o.priceOriginal!=null&&o.currencyOriginal&&o.currencyOriginal!==money.currency?`quoted ${o.currencyOriginal} ${o.priceOriginal}`:'';
 return <div className="bom-overview">
  <div className="cmp-top"><button className="button small" onClick={onBack}><ArrowLeft size={14}/>BOM</button><span className="muted">Last updated {when(row.fetchedAt)}</span><button className="button small" onClick={onRefresh} disabled={busy||!ready}><RefreshCw size={14} className={busy?'spin':''}/>Refresh prices</button></div>
  <section className="panel cmp-head" aria-label="Component">
   <PartImage part={{...row,value:row.description}} src={row.image} size={84}/>
   <div className="cmp-title"><h2 ref={headRef} tabIndex={-1}>{row.mpn}</h2><p className="cmp-maker">{row.manufacturer||offers.find(o=>o.manufacturer)?.manufacturer||'Manufacturer not reported'}</p><p className="cmp-desc">{row.description||offers.find(o=>o.description)?.description||'No description reported.'}</p>
    <div className="cmp-scores">{SCORES.map(([k,label])=><span key={k} className="cmp-score"><small>{label}</small><ScoreBadge k={k} s={scores[k]}/></span>)}</div></div>
   <div className="cmp-alt">{suggestion?<><small>Suggested alternative</small><strong>{suggestion}</strong><span className="muted">{offers.some(o=>o.suggestedReplacement===suggestion)?'Supplier suggested replacement':alternates[0]?.from}</span>
     <div className="cmp-check"><TriangleAlert size={14}/>Check before use: package and footprint, pinout, voltage, current and temperature ratings, and qualification.</div>
     <button className="button small" onClick={()=>onUseAlternate(suggestion)}><Replace size={14}/>Use in BOM</button></>
    :<><small>Suggested alternative</small><span className="muted">None recorded</span>{eol&&<div className="cmp-check"><TriangleAlert size={14}/>Lifecycle is {life}: find a replacement and check its compatibility.</div>}</>}</div>
  </section>
  <div className="cmp-cards" data-tour="ov-cards">
   <Card title="General" rows={[
    ['Condition',sel?.condition||(calc.source==='own'?'Own stock':NA)],
    ['Quantity',fmtInt(calc.need),`${row.qty} per board${calc.useOwn?` · ${fmtInt(calc.useOwn)} from own stock`:''}`],
    ['Minimum order quantity',sel?.moq?fmtInt(sel.moq):NA,sel&&calc.buy?`orders ${fmtInt(orderQty(sel,calc.buy))}${sel.mult?` in multiples of ${sel.mult}`:''}`:''],
    ['Unit price',calc.need&&!calc.missing?money.fmt(calc.unitCost,{unit:true}):calc.ownCostMissing?'No inventory price':row.fetchedAt?'No price':'Not priced yet',calc.need&&!calc.missing?`${money.currency}${sel?' · '+sel.seller:''}${sel&&quoted(sel)?' · '+quoted(sel):''}`:''],
    ['Last updated',when(row.fetchedAt)]]}/>
   <Card title="Availability" rows={[
    ['Total available stock',av.total==null?NA:fmtInt(av.total)],
    ['Distributors',row.fetchedAt||offers.length?`${av.distributors} with stock`:NA,offers.length?`${offers.length} offer${offers.length===1?'':'s'} in all`:''],
    ['Minimum lead time',days(av.minLeadDays)],
    ['Factory lead time',days(av.factoryLeadDays)],
    ['Best available price',av.best?money.fmt(av.best.unit,{unit:true}):NA,av.best?`${av.best.offer.seller}${av.best.enough?'':' · not enough stock'}`:'']]}/>
   <Card title="Lifecycle & Compliance" rows={[
    ['Lifecycle status',life||NA],
    ['RoHS',cp.rohs||NA],
    ['REACH',cp.reach||NA],
    ['Certificate of Conformity',cp.coc||NA,cp.coc?'':'not stated by the seller; ask for one with the order'],
    ['HSN code',cp.hs||NA,cp.hs?'HS 6-digit from the supplier\'s HTS code; confirm the 8-digit HSN':'']]}/>
  </div>
  <section className="panel cmp-offers" ref={offersRef} id="market-offers" data-tour="ov-offers" aria-label="Offers across all markets" tabIndex={-1}>
   <div className="panel-heading"><div className="title-row"><h2>Offers Across All Markets</h2><span className="count-label">{offers.length}</span><small className="muted">{offers.length-listings} distributor and entered offer{offers.length-listings===1?'':'s'} · {listings} marketplace listing{listings===1?'':'s'}{row.marketAt?` · searched ${when(row.marketAt)}`:''}</small></div>
    <div className="offer-head-actions">{marketReady&&<button className="button small" onClick={onRefresh} disabled={busy}><RefreshCw size={14} className={busy?'spin':''}/>{row.marketAt?'Search all markets again':'Search all markets'}</button>}<button className="button small" onClick={()=>setAdding(true)}><Plus size={14}/>Add an offer</button></div></div>
   {!marketReady&&<div className="studio-note">Marketplace listings need SerpApi (Integrations). Distributor offers are shown.</div>}
   {row.marketHidden&&Object.values(row.marketHidden).some(n=>n>0)&&<div className="studio-note" role="note">{Object.values(row.marketHidden).reduce((x,y)=>x+y,0)} Google Shopping listing{Object.values(row.marketHidden).reduce((x,y)=>x+y,0)===1?'':'s'} hidden (not the exact product): {[['identity','different part number'],['type','kit, module or "compatible"'],['seller','same seller again']].filter(([k])=>row.marketHidden[k]>0).map(([k,l])=>`${row.marketHidden[k]} ${l}`).join(', ')}. Listings shown are unverified and never bought automatically.</div>}
   {row.marketStatus==='error'&&<div className="studio-note warn"><TriangleAlert size={15}/> The marketplace search did not answer this time; distributor offers are shown.</div>}
   {best&&<div className={'best-get'+(best.short?' short':'')} role="status" aria-label="Best to get" data-tour="ov-best">
    <span className="best-label">Best to get</span>
    <strong>{best.offer.seller}</strong><span>{money.fmt(best.unit,{unit:true})} each at {fmtInt(qty)}</span><span>{Number.isFinite(best.offer.stock)?`${fmtInt(best.offer.stock)} in stock`:'stock not reported'}</span>
    <UncertaintyBadge c={bestCert}/><span className="muted">{best.reason}{best.short?'':'.'}</span>
    {sel&&offerKey(sel)!==bestKey&&<button className="button small" onClick={()=>onSelectOffer(bestKey)}>Use for BOM</button>}</div>}
   {offers.length?<div className="table-scroll"><table className="offer-table"><thead><tr><th>Use</th><th>Supplier</th><th>Market</th><th>Uncertainty</th><th className="numeric">Stock</th><th className="numeric">MOQ</th><th className="numeric">Unit price at {fmtInt(qty)}</th><th className="numeric">Shipping</th><th className="numeric">Lead time</th><th>Date code</th><th>Actions</th></tr></thead>
    <tbody>{sorted.map(o=>{const k=offerKey(o),u=unitAt(o,qty),chosen=sel&&offerKey(sel)===k,link=contactLink(o),excess=['ems-excess','oem-excess','broker'].includes(o.marketType),listing=o.marketType==='marketplace'||(!o.marketType&&o.source==='serpapi'),c=certs.get(k);
     return <tr key={k} className={(chosen?'chosen ':'')+(k===bestKey?'best':'')}>
      <td><input type="radio" name={'offer-'+row.id} aria-label={`Use ${o.seller} for ${row.mpn}`} checked={!!chosen} disabled={!u} onChange={()=>onSelectOffer(k)}/></td>
      <td><strong>{o.seller}</strong>{k===bestKey&&<span className="badge green best-badge"><span/>Best to get</span>}{o.source==='manual'&&<small className="muted">entered by you</small>}{listing&&o.title&&<small className="muted listing-title" title={o.title}>{o.title}</small>}</td>
      <td><span className={'market '+(listing?'marketplace':o.marketType||'na')}>{marketLabel(listing?'marketplace':o.marketType||(o.authorized===false?'marketplace':o.source==='manual'?null:'authorized'))}</span>{listing&&<small className="muted">{o.authorized?'seller is an authorised distributor':'seller not verified'}</small>}</td>
      <td><UncertaintyBadge c={c}/></td>
      <td className="numeric">{Number.isFinite(o.stock)?fmtInt(o.stock):<em className="na">Not reported</em>}</td>
      <td className="numeric">{o.moq?fmtInt(o.moq):<em className="na">{NA}</em>}</td>
      <td className="numeric">{u?<>{money.fmt(u.unit,{unit:true})}<small className="muted">{money.currency}{original(o)?' · '+original(o):quoted(o)?' · '+quoted(o):''}</small>{(o.breaksUsd||[]).length>1&&<small className="muted breaks">{breaks(o)}</small>}{u.moqShort&&<small className="warn-text">below MOQ</small>}</>:<em className="na">No price</em>}</td>
      <td className="numeric">{(()=>{const sh=shipOf(o);return sh?<>{money.fmt(sh.v)}<small className="muted">{sh.note}</small></>:<em className="na">Not quoted</em>})()}</td>
      <td className="numeric">{days(offerLeadDays(o,qty))}</td>
      <td>{o.dateCode||<em className="na">{NA}</em>}</td>
      <td><div className="offer-actions">
       {u&&<button className="button small" onClick={()=>onAddToCart(o)}><ListPlus size={13}/>Add to list</button>}
       {(excess||!u)&&<button className="button small" onClick={()=>onBid(o)}><Gavel size={13}/>Bid</button>}
       {excess&&(link?<a className="button small" href={link} target="_blank" rel="noreferrer noopener"><MessageSquare size={13}/>Chat with Seller</a>:<small className="muted no-contact">No seller contact on this offer</small>)}
       {o.url&&<a className={listing?'button small':'text-button'} href={o.url} target="_blank" rel="noreferrer noopener">{listing?'Open listing':'Open'} <ArrowUpRight size={12}/></a>}
       {o.source==='manual'&&<button className="icon-button" aria-label={`Remove the ${o.seller} offer`} onClick={()=>onRemoveOffer(o.id)}><Trash2 size={14}/></button>}</div></td></tr>})}</tbody></table></div>
   :<div className="empty"><h3>{row.fetchedAt?'No supplier lists this part':'No offers yet'}</h3><p>{row.fetchedAt?'Add an offer you received, or use an alternative.':ready?'Refresh prices to ask the connected distributors.':'Connect a distributor in Integrations, or add an offer you received.'}</p></div>}
   <div className="studio-note">Distributor APIs do not report date codes or shipping charges: set supplier shipping under the BOM, and enter date codes on offers you add. Prices shown in {money.currency}{money.currency==='INR'?` at 1 USD = ₹${money.inrPerUsd.toFixed(2)}`:''}.</div>
  </section>
  {adding&&<OfferForm mpn={row.mpn} money={money} fx={fx} onClose={()=>setAdding(false)} onSave={o=>{onAddOffer(o);setAdding(false)}}/>}
 </div>;
}

// An offer received outside the connected distributors (EMS or OEM/ODM excess, a broker quote, a
// local distributor). Prices are entered in INR or USD and kept in USD.
function OfferForm({mpn,money,onClose,onSave}){
 const ref=useRef(null),id=useId();useEffect(()=>{const prev=document.activeElement;ref.current.showModal();return()=>prev?.focus?.()},[]);
 const [f,setF]=useState({seller:'',marketType:'ems-excess',stock:'',moq:'',price:'',currency:money.currency,shipping:'',leadDays:'',dateCode:'',condition:'New',coc:'',contact:''});
 const set=k=>e=>setF(x=>({...x,[k]:e.target.value}));
 const toUsd=v=>v===''?null:Math.max(0,f.currency==='INR'?+v/money.inrPerUsd:+v);
 const save=e=>{e.preventDefault();const p=toUsd(f.price);
  onSave({id:Math.random().toString(36).slice(2,10),mpn,seller:f.seller.trim().slice(0,60),source:'manual',marketType:f.marketType,authorized:f.marketType==='authorized',stock:f.stock===''?null:Math.max(0,Math.round(+f.stock)),moq:f.moq===''?null:Math.max(1,Math.round(+f.moq)),
   priceUsd:p,breaksUsd:p?[{qty:1,price:p}]:[],priceOriginal:f.price===''?null:Math.max(0,+f.price),currencyOriginal:f.currency,shippingUsd:toUsd(f.shipping),shippingOriginal:f.shipping===''?null:Math.max(0,+f.shipping),leadDays:f.leadDays===''?null:Math.max(0,Math.round(+f.leadDays)),factoryLeadDays:null,
   dateCode:f.dateCode.trim().slice(0,20)||null,condition:f.condition||null,coc:f.coc===''?null:f.coc==='yes',contact:f.contact.trim().slice(0,120)||null,url:null,addedAt:new Date().toISOString()})};
 return <dialog ref={ref} aria-labelledby={id} onCancel={onClose} onClick={e=>{const r=ref.current.getBoundingClientRect();if(e.target===ref.current&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))onClose()}}><div className="modal-head"><h2 id={id}>Add an offer for {mpn}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>
  <form className="offer-form" onSubmit={save}>
   <label>Seller<input value={f.seller} onChange={set('seller')} required placeholder="Company name"/></label>
   <label>Market<select value={f.marketType} onChange={set('marketType')}>{MARKET_TYPES.filter(m=>m[0]!=='marketplace').map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label>Stock<input type="number" min="0" value={f.stock} onChange={set('stock')}/></label>
   <label>Minimum order<input type="number" min="1" value={f.moq} onChange={set('moq')}/></label>
   <label>Unit price<span className="price-input"><input type="number" min="0" step="any" value={f.price} onChange={set('price')} placeholder="Leave empty to bid"/><select aria-label="Price currency" value={f.currency} onChange={set('currency')}><option>INR</option><option>USD</option></select></span></label>
   <label>Shipping charge ({f.currency})<input type="number" min="0" step="any" value={f.shipping} onChange={set('shipping')} placeholder="Not quoted"/></label>
   <label>Lead time (days)<input type="number" min="0" value={f.leadDays} onChange={set('leadDays')}/></label>
   <label>Date code<input value={f.dateCode} onChange={set('dateCode')} placeholder="e.g. 2431"/></label>
   <label>Condition<select value={f.condition} onChange={set('condition')}><option>New</option><option>New, opened reel</option><option>Refurbished</option><option>Used</option></select></label>
   <label>Certificate of conformity<select value={f.coc} onChange={set('coc')}><option value="">Not stated</option><option value="yes">Offered</option><option value="no">Not offered</option></select></label>
   <label className="wide-field">Seller contact<input value={f.contact} onChange={set('contact')} placeholder="Email, phone (WhatsApp) or https link"/></label>
   <button className="button primary full wide-field" type="submit">Add offer</button>
  </form></dialog>;
}
