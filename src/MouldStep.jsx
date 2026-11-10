import React,{useMemo} from 'react';
import {Boxes,ArrowUpRight,TriangleAlert,CheckCircle2} from 'lucide-react';
import {mouldEstimate,mouldedUnitCost,makerFit,TOOL_CLASSES,RESINS} from './mould.js';
import {vendorsOf} from './vendors.js';

const mm=n=>Number(n.toFixed(1));
const int=n=>Math.round(n).toLocaleString('en-IN');

// BOM tool step 4: the mould for a custom enclosure. The estimate comes from the enclosure geometry
// (step 3) and the resin; the mould maker list is the Vendors page's mould makers. Tooling and the
// moulded unit price go into the quotation only when entered from a maker's quote.
export default function MouldStep({box,size,mould,setMould,setBox,boards,money,shownAmt,typed,onVendors}){
 const custom=!!box.material&&box.kind==='custom';
 const est=useMemo(()=>custom?mouldEstimate({outer:size.outer,wall:box.wall,material:box.material,cavities:mould.cavities,qty:boards,toolClass:mould.toolClass}):null,[custom,size.outer.join(),box.wall,box.material,mould.cavities,boards,mould.toolClass]);// eslint-disable-line react-hooks/exhaustive-deps
 const usd=x=>x==null||x===''?null:typeof x==='object'?(x.c==='INR'?Number(x.v)/money.inrPerUsd:Number(x.v)):Number(x);
 const build=mouldedUnitCost(est,{resinPerKg:usd(mould.resinPerKg),machinePerHour:usd(mould.machinePerHour)});
 const makers=vendorsOf('mould').map(m=>({...m,fit:makerFit(m,{material:box.material,outer:size.outer})}));
 if(!custom)return <section className="panel sourcing-panel" aria-label="Mould">
  <div className="sourcing-heading"><div><h2><Boxes size={19}/> Mould</h2><p className="muted">{!box.material?'No enclosure is chosen, so no mould is needed.':'The enclosure is off the shelf, so no mould is needed.'}</p></div></div>
  {box.material&&<p><button className="button" type="button" onClick={()=>setBox({kind:'custom',unit:null,tooling:null})}>Make it a custom moulded enclosure</button></p>}
 </section>;
 if(!est)return <section className="panel sourcing-panel" aria-label="Mould"><div className="studio-note warn"><TriangleAlert size={15}/> Enter the enclosure's wall thickness and size in the Enclosure step to plan the mould.</div></section>;
 return <section className="panel sourcing-panel mould-step" aria-label="Mould">
  <div className="sourcing-heading"><div><h2><Boxes size={19}/> Mould for the custom enclosure</h2><p className="muted">{box.material}, base and lid moulded together, outside {size.outer.map(mm).join(' × ')} mm, wall {box.wall} mm.</p></div>
   <label>Cavities (sets per shot)<select aria-label="Mould cavities" value={est.cavities} onChange={e=>setMould({cavities:+e.target.value})}>{[1,2,4,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
  <div className="sourcing-columns"><div>
   <h3 className="bom-sub">Moulding estimate <small>from the geometry and {box.material} properties</small></h3>
   <dl className="pcb-line mould-facts">
    <div><dt>Plastic per enclosure</dt><dd>{est.unitG.toFixed(1)} g</dd></div>
    <div><dt>Shot weight</dt><dd>{est.shotG.toFixed(1)} g</dd></div>
    <div><dt>Cooling time</dt><dd>{est.cooling.toFixed(1)} s</dd></div>
    <div><dt>Cycle time</dt><dd>about {est.cycle} s</dd></div>
    <div><dt>Clamp force</dt><dd>about {est.clampT} t</dd></div>
    <div><dt>Output</dt><dd>{int(est.unitsPerHour)} enclosures per hour</dd></div>
    <div><dt>Shots for {int(boards)} units</dt><dd>{int(est.shots)}</dd></div>
   </dl>
   <label>Tool<select aria-label="Mould tool class" value={mould.toolClass||est.suggested} onChange={e=>setMould({toolClass:e.target.value})}>{TOOL_CLASSES.map(t=><option key={t.id} value={t.id}>{t.label} · {t.spi}{t.id===est.suggested?' · suggested':''}</option>)}</select></label>
   <small className={est.lifeOk?'muted':'warn-text'}>{est.tool.note}{est.lifeOk?'':` This run needs ${int(est.shots)} shots; choose a longer-life tool.`}</small>
   <h3 className="bom-sub">Cost build-up <small>from your own rates</small></h3>
   <div className="bom-pcb-dims"><label>Resin price per kg ({money.currency})<input type="number" min="0" step="any" value={shownAmt(mould.resinPerKg)} onChange={e=>setMould({resinPerKg:typed(e.target.value)})}/></label>
    <label>Machine rate per hour ({money.currency})<input type="number" min="0" step="any" value={shownAmt(mould.machinePerHour)} onChange={e=>setMould({machinePerHour:typed(e.target.value)})}/></label></div>
   {build?<dl className="pcb-line"><div><dt>Resin</dt><dd>{money.fmt(build.material,{unit:true})}</dd></div><div><dt>Machine time</dt><dd>{money.fmt(build.machine,{unit:true})}</dd></div><div><dt>Moulded cost per enclosure</dt><dd>{money.fmt(build.total,{unit:true})}</dd></div></dl>
    :<small className="muted">Enter both rates to see the moulded cost per enclosure. Resin and machine rate vary by supplier and region, so none is assumed.</small>}
  </div>
  <div className="mould-makers"><h3 className="bom-sub">Mould makers <button type="button" className="text-button" onClick={onVendors}>Describe makers on the Vendors page <ArrowUpRight size={12}/></button></h3>
   <ul className="maker-list">{makers.map(m=><li key={m.id} className={mould.maker===m.name?'selected':''}>
    <span><strong>{m.name}</strong><small>{m.about}</small>
     <small className={m.fit.confirmed?(m.fit.ok?'ok-text':'warn-text'):'muted'}>{m.fit.confirmed?<>{m.fit.ok?<CheckCircle2 size={11}/>:<TriangleAlert size={11}/>} {m.fit.notes.join(' · ')}</>:'Capability not confirmed'}{m.leadWeeks?` · tooling ${m.leadWeeks} weeks`:''}</small></span>
    <span className="maker-actions">{m.url&&<a className="text-button" href={m.url} target="_blank" rel="noreferrer">Quote <ArrowUpRight size={12}/></a>}<button className="button small" type="button" aria-label={`Select ${m.name}`} aria-pressed={mould.maker===m.name} onClick={()=>setMould({maker:m.name,leadWeeks:mould.leadWeeks||m.leadWeeks||''})}>{mould.maker===m.name?'Selected':'Select'}</button></span>
   </li>)}</ul></div></div>
  <h3 className="bom-sub">The maker's quote <small>goes into the quotation</small></h3>
  <div className="bom-pcb-dims">
   <label>Mould maker<input value={mould.maker} maxLength="80" onChange={e=>setMould({maker:e.target.value})}/></label>
   <label>Tooling, one time ({money.currency})<input type="number" min="0" step="any" aria-label="Mould tooling cost" value={shownAmt(mould.tooling)} onChange={e=>setMould({tooling:typed(e.target.value)})}/></label>
   <label>Moulded enclosure, per unit ({money.currency})<input type="number" min="0" step="any" aria-label="Moulded enclosure unit price" placeholder={build?'from rates '+money.value(build.total).toFixed(2):''} value={shownAmt(mould.unit)} onChange={e=>setMould({unit:typed(e.target.value)})}/></label>
   <label>Tooling lead time (weeks)<input type="number" min="0" step="1" value={mould.leadWeeks} onChange={e=>setMould({leadWeeks:e.target.value})}/></label>
  </div>
  {build&&usd(mould.unit)==null&&<button type="button" className="text-button" onClick={()=>setMould({unit:typed(money.value(build.total).toFixed(4))})}>Use the cost from your rates ({money.fmt(build.total,{unit:true})}) as the unit price</button>}
  {(usd(mould.tooling)==null||usd(mould.unit)==null)&&<p className="warn-text small-copy">Enter the maker's tooling and unit price. Until then the enclosure shows as "not priced" in the quotation.</p>}
  <label>Notes for the maker<textarea rows="2" maxLength="400" value={mould.notes} placeholder="Texture, colour, inserts, draft angles, ribs" onChange={e=>setMould({notes:e.target.value})}/></label>
 </section>;
}
export {RESINS};
