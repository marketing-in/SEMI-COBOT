import React,{useRef,useState} from 'react';
import {ArrowUpRight,Box,ChartNoAxesCombined} from 'lucide-react';
import {dayKey,enclosureSize,partKey} from './bomPlanning.js';
import {formatMoney} from './money.js';
import {pickerList} from './vendors.js';

const integer=n=>Math.round(n).toLocaleString('en-IN');
const mm=n=>Number(n.toFixed(1));
// Vendor lists come from the shared registry (vendors.js), so vendors added on the Vendors page appear here.
export const PCB_VENDORS=pickerList('pcb');
const caseVendors=()=>pickerList('enclosure');

export function VendorDirectory({vendors,title,selected,onSelect}){
 return <section className="vendor-directory" aria-label={title}>
  <h3>{title}</h3><p className="muted">Open a supplier for a quote and confirm the material, dimensions, lead time and freight.</p>
  <div className="vendor-grid">{vendors.map(([name,description,url])=><article key={name}>
   <strong>{name}</strong><small>{description}</small><div>
    <a className="text-button" href={url} target="_blank" rel="noreferrer">Request quote <ArrowUpRight size={13}/></a>
    <button className="button small" type="button" aria-pressed={selected===name} onClick={()=>onSelect(name)}>{selected===name?'Selected':'Select'}</button>
   </div>
  </article>)}</div>
 </section>;
}

function PriceHistory({samples,money}){
 if(!samples.length)return <p className="muted">No dated price observations at this supplier and order quantity yet. Refresh prices to start recording.</p>;
 const min=Math.min(...samples.map(s=>s.price)),max=Math.max(...samples.map(s=>s.price));
 const from=Date.parse(samples[0].day),span=Date.parse(samples.at(-1).day)-from;
 const points=samples.map(s=>({x:span?20+((Date.parse(s.day)-from)/span)*320:180,y:max===min?49:83-(s.price-min)/(max-min)*68,...s}));
 return <>
  <svg className="price-history" viewBox="0 0 360 98" role="img" aria-label="Observed unit price over time">
   <path d="M20 83H340 M20 49H340 M20 15H340" className="chart-grid"/>
   <polyline points={points.map(p=>p.x+','+p.y).join(' ')} className="chart-price"/>
   {points.map(p=><circle key={p.day} cx={p.x} cy={p.y} r="3.5"><title>{p.day} · {money.fmt(p.price,{unit:true})}</title></circle>)}
  </svg>
  <div className="chart-axis"><span>{samples[0].day}</span><span>{money.fmt(min,{unit:true})}–{money.fmt(max,{unit:true})}</span><span>{samples.at(-1).day}</span></div>
  <details><summary>Recorded prices ({samples.length})</summary><ul>{samples.map(p=><li key={p.day}>{p.day} · {money.fmt(p.price,{unit:true})} · {p.stock==null?'Stock unknown':integer(p.stock)+' in stock'}</li>)}</ul></details>
 </>;
}

export function ComponentPlanning({rows,calcs,outlooks,hikes,onHikes,purchases,onPurchase,money}){
 const today=dayKey(new Date().toISOString());
 const [chosen,setChosen]=useState(''),[qty,setQty]=useState(''),[paid,setPaid]=useState(''),[date,setDate]=useState(today),[supplier,setSupplier]=useState('');
 const index=Math.max(0,rows.findIndex(r=>r.id===chosen));
 const row=rows[index],calc=calcs[index],o=outlooks[index];
 if(!row)return null;
 const purchaseLog=purchases[partKey(row.mpn)]||[];
 const format=v=>money.fmt(v,{unit:true});
 const range=r=>r?format(r.low)+' – '+format(r.high):'Pending price';
 const advice=o.pressure==='Shortage'?'Get a second quote or split the order. Current stock cannot cover this build.':
  o.pressure==='High'?'Confirm stock and lead time with the supplier before waiting.':
  o.pressure==='Low'?'Stock coverage is strong at the reported level. Compare price breaks and order timing.':
  o.pressure==='Moderate'?'Check the supplier’s quote validity against your purchase date.':'Get a supplier quote to evaluate purchase timing.';
 const submit=e=>{
  e.preventDefault();
  if(!date||date>today||!Number.isInteger(+qty)||+qty<1||paid===''||!Number.isFinite(+paid)||+paid<0)return;
  onPurchase(row.mpn,{date,qty:+qty,unit:+paid,currency:money.currency,supplier:supplier.trim()||calc.offer?.seller||''});
  setQty('');setPaid('');setSupplier('');
 };
 return <section className="panel sourcing-panel" aria-label="Component purchase analysis">
  <div className="sourcing-heading"><div><h2><ChartNoAxesCombined size={19}/> Purchase outlook</h2><p className="muted">Track supplier prices, stock pressure, and what you actually paid.</p></div>
   <label>Component<select aria-label="Component for purchase analysis" value={row.id} onChange={e=>{setChosen(e.target.value);setQty('');setPaid('');setSupplier('')}}>{rows.map(r=><option key={r.id} value={r.id}>{r.mpn}</option>)}</select></label>
  </div>
  <div className="sourcing-metrics">
   <div><small>Current unit price</small><strong>{o.price==null?'Pending price':format(o.price)}</strong><span>{calc.offer?.seller||'No supplier selected'}{calc.orderQty>0?' · '+integer(calc.orderQty)+' to order':''}{row.fetchedAt?' · checked '+dayKey(row.fetchedAt):''}</span></div>
   <div><small>3-day unit price</small><strong>{range(o.three)}</strong><span>Planning range</span></div>
   <div><small>9-day unit price</small><strong>{range(o.nine)}</strong><span>Planning range</span></div>
   <div><small>Stock pressure</small><strong>{o.pressure}</strong><span>{o.stock==null?'Supplier stock unavailable':integer(o.stock)+' in stock · '+integer(calc.buy)+' needed'}</span></div>
  </div>
  {calc.buy>0&&<p className="sourcing-advice"><strong>Buying decision</strong> {advice} {o.price!=null&&<>Estimated spend at the current rate: <strong>{money.fmt(o.price*calc.orderQty)}</strong> before freight.</>}</p>}
  <div className="sourcing-columns">
   <div><h3>Supplier price history</h3><PriceHistory samples={o.samples} money={money}/>
    <p className="muted">{o.stockChange==null?'Stock movement needs observations on different days.':`Observed stock change: ${o.stockChange>0?'+':''}${integer(o.stockChange)} units.`} Stock pressure compares reported availability with your planned purchase. Stock changes can also reflect restocking and inventory adjustments.</p>
    <p className="muted">{o.trendReady?'Ranges combine the recorded price trend with the selected uplift.':'Ranges use the current price and selected uplift. Trend estimates need three distinct observation days.'} Supplier prices and actual demand can change.</p>
    <div className="bom-pcb-dims">{[['three','3-day uplift (%)'],['nine','9-day uplift (%)']].map(([key,label])=><label key={key}>{label}<input type="number" min="0" max="100" step=".1" value={hikes[key]} onChange={e=>onHikes(key,e.target.value)}/></label>)}</div>
   </div>
   <div><h3>Purchase history</h3><form className="purchase-entry" onSubmit={submit}>
    <label>Purchase date<input type="date" max={today} value={date} onChange={e=>setDate(e.target.value)} required/></label>
    <label>Quantity bought<input type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)} required/></label>
    <label>Paid per unit ({money.currency})<input type="number" min="0" step="any" value={paid} onChange={e=>setPaid(e.target.value)} required/></label>
    <label>Purchase supplier<input maxLength="80" value={supplier} placeholder={calc.offer?.seller||'Optional'} onChange={e=>setSupplier(e.target.value)}/></label>
    <button className="button small" type="submit">Record purchase</button>
   </form>
   {purchaseLog.length?<div className="table-scroll"><table className="ship-table"><thead><tr><th>Date</th><th>Qty</th><th>Paid per unit</th></tr></thead><tbody>{purchaseLog.map((p,i)=><tr key={i}><td>{p.date}{p.supplier&&<small>{p.supplier}</small>}</td><td>{integer(p.qty)}</td><td>{formatMoney(p.unit,p.currency||'USD',1,{unit:true})}</td></tr>)}</tbody></table></div>:<p className="muted">No purchases recorded for this part. Enter actual order details after buying.</p>}
   </div>
  </div>
 </section>;
}

function EnclosureDrawing({size}){
 const drawing=useRef(null);
 const {boardWidth,boardDepth,outer,inner,standoff,component}=size;
 const scale=Math.min(210/Math.max(outer[0],1),102/Math.max(outer[1],1));
 const w=outer[0]*scale,h=outer[1]*scale,bw=boardWidth*scale,bh=boardDepth*scale;
 const x=140-w/2,y=72-h/2;
 const sideScale=Math.min(scale,49/Math.max(outer[2],1)),sw=outer[0]*sideScale,sh=outer[2]*sideScale;
 const sideX=140-sw/2,sideY=218-sh,wall=(outer[2]-inner[2])/2;
 const boardY=218-(wall+standoff)*sideScale;
 const download=()=>{
  const svg=drawing.current.cloneNode(true);
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('width','560');
  svg.setAttribute('height','492');
  for(const el of svg.querySelectorAll('.box-outline,.box-board,text')){
   const board=el.classList.contains('box-board');
   el.setAttribute('style',el.tagName==='text'?'font:10px sans-serif;fill:#242424':board?'stroke:#995018;stroke-dasharray:4 2;fill:none':'stroke:#242424;stroke-width:2;fill:none');
  }
  const url=URL.createObjectURL(new Blob([svg.outerHTML],{type:'image/svg+xml;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='enclosure-concept.svg';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <figure className="box-drawing">
  <svg ref={drawing} viewBox="0 0 280 246" role="img" aria-label="Top and side views of the proposed enclosure and PCB">
   <rect x={x} y={y} width={w} height={h} rx="5" className="box-outline"/>
   <rect x={140-bw/2} y={72-bh/2} width={bw} height={bh} rx="2" className="box-board"/>
   <text x="140" y="76" textAnchor="middle">PCB</text>
   <text x="140" y="143" textAnchor="middle">{mm(outer[0])} × {mm(outer[1])} mm footprint</text>
   <rect x={sideX} y={sideY} width={sw} height={sh} rx="3" className="box-outline"/>
   <line x1={140-boardWidth*sideScale/2} x2={140+boardWidth*sideScale/2} y1={boardY} y2={boardY} className="box-board"/>
   <rect x={140-boardWidth*sideScale/4} y={boardY-component*sideScale} width={boardWidth*sideScale/2} height={component*sideScale} className="box-board"/>
   <text x="140" y="239" textAnchor="middle">Side view · {mm(outer[2])} mm outside height</text>
  </svg>
  <figcaption>Concept drawing. Verify connector cutouts, mounting holes, tolerances and ventilation before ordering.</figcaption>
  <button className="button small" type="button" onClick={download}>Download enclosure drawing</button>
 </figure>;
}

export function EnclosurePlanning({box,board,setBox,money,shownAmt,typed}){
 const size=enclosureSize(box,board);
 const fields=[['clearance','Side clearance'],['wall','Wall thickness'],['standoff','Standoff height'],['pcbThickness','PCB thickness'],['component','Tallest component'],['top','Top clearance']];
 return <section className="panel sourcing-panel" aria-label="Enclosure and box setup">
  <div className="sourcing-heading"><div><h2><Box size={19}/> Enclosure and box setup</h2><p className="muted">Size a housing around the PCB and budget for the complete boxed unit.</p></div>
  <label>Material<select aria-label="Enclosure material" value={box.material} onChange={e=>setBox({material:e.target.value,unit:null,tooling:null,vendor:''})}><option value="">No enclosure</option><option>ABS plastic</option><option>Polycarbonate</option><option>PC/ABS plastic</option><option>Nylon</option></select></label></div>
  {box.material&&<>
   <div className="enclosure-kind segmented" role="group" aria-label="Enclosure kind">{[['shelf','Off the shelf'],['custom','Custom moulded']].map(([k,l])=><button key={k} type="button" className={(box.kind||'shelf')===k?'active':''} aria-pressed={(box.kind||'shelf')===k} onClick={()=>setBox({kind:k,unit:null,tooling:null})}>{l}</button>)}</div>
   <div className="sourcing-columns"><div>
    <p className="muted">PCB footprint · {mm(size.boardWidth)} × {mm(size.boardDepth)} mm. Edit the board size in the Bare PCB step.</p>
    <div className="bom-pcb-dims">{fields.map(([key,label])=><label key={key}>{label} (mm)<input type="number" min={key==='wall'?'.1':'0'} step=".1" value={box[key]} onChange={e=>setBox({[key]:e.target.value})}/></label>)}</div>
    <dl className="pcb-line"><div><dt>Minimum inside (W × D × H)</dt><dd>{size.inner.map(mm).join(' × ')} mm</dd></div><div><dt>Approximate outside</dt><dd>{size.outer.map(mm).join(' × ')} mm</dd></div></dl>
    <label>Fabrication notes<textarea rows="3" maxLength="500" value={box.notes} placeholder="Connector cutouts, IP rating, vents, screws and mounting points" onChange={e=>setBox({notes:e.target.value})}/></label>
   </div><EnclosureDrawing size={size}/></div>
   {box.kind==='custom'?<div className="studio-note"><Box size={15}/> Custom moulded: plan the mould just below. The estimate, the mould makers and the maker's tooling and unit price are all on this page.</div>:<>
   <VendorDirectory vendors={caseVendors()} title="Enclosure manufacturers" selected={box.vendor} onSelect={vendor=>setBox({vendor,unit:null,tooling:null})}/>
   <div className="bom-pcb-dims">
    <label>Selected enclosure vendor<input value={box.vendor} maxLength="80" onChange={e=>setBox({vendor:e.target.value})}/></label>
    <label>Enclosure unit cost ({money.currency})<input type="number" min="0" step="any" value={shownAmt(box.unit)} onChange={e=>setBox({unit:typed(e.target.value)})}/></label>
    <label>One-time tooling cost ({money.currency})<input type="number" min="0" step="any" value={shownAmt(box.tooling)} onChange={e=>setBox({tooling:typed(e.target.value)})}/></label>
   </div></>}
  </>}
 </section>;
}
