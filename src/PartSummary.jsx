import React from 'react';
import {status} from './data';
import {TYPE_LABELS,displayName} from './blueprint';
const fmt=n=>Number(n).toLocaleString('en-US');

// What a diode is, in one line, from the inventory record when there is one.
export function diodeLine(part){
 const specs=part.inv?.specs||{};
 const bits=[specs.Type,specs['Reverse voltage']&&specs['Reverse voltage']+' reverse',specs['Average current']&&specs['Average current']+' average',specs['Forward voltage']&&specs['Forward voltage']+' forward'].filter(Boolean);
 return (bits.length?bits.join(' · ')+' · ':'')+'Cathode at stripe';
}
// Compact identification card used by the hover tooltip and the studio inspector.
export function PartSummary({part,className='',tooltip=false}){
 const inv=part.inv;const tone=inv?(status(inv)==='In stock'?'green':status(inv)==='Low stock'?'amber':'red'):'neutral';
 return <div className={'part-summary '+className}>
  <div className="tip-head"><span className="ref-chip">{part.ref}</span><span className="tip-type">{TYPE_LABELS[part.type]||'Component'}{part.side==='bottom'?' · Bottom side':''}</span></div>
  <strong className="tip-name">{displayName(part)}</strong>
  <small>{inv?`${inv.manufacturer} · ${inv.package}`:(part.package||'Package unknown')}{!inv&&part.value&&part.value!==displayName(part)?` · ${part.value}`:''}</small>
  <span className={'badge '+tone}><span/>{inv?`${status(inv)} · ${fmt(inv.stock)} pcs`:'Not in inventory'}</span>
  {part.suggested&&<small className="tip-know">Suggested for {part.parentRef}: {part.purpose}</small>}
  {part.type==='diode'&&<small className="tip-diode">{diodeLine(part)}</small>}
  {tooltip&&part.know&&<small className="tip-know">{part.know.entry.description}{part.know.entry.kind==='semiconductor'&&part.know.entry.package?` · ${part.know.entry.package}`:''}</small>}
 </div>;
}
