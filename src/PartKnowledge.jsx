import React from 'react';
import {BookOpen} from 'lucide-react';
import {alternatesOf,matchLine} from './partMaster';

const MOUNT={SMD:'Surface mount',THT:'Through-hole','THT/SMD':'Through-hole or surface mount','SMD/THT':'Surface mount or through-hole'};
const fmt=n=>Number(n).toLocaleString('en-US');

// What the part master knows about a component: description, specs, package, typical use and
// alternates. `know` comes from lookupPart(); `parts` is the inventory, used to mark alternates
// that are already on the shelf.
export function PartKnowledge({know,parts=[],compact=false,onOpenInventory,onSource}){
 if(!know)return null;
 const e=know.entry,byMpn=new Map(parts.map(p=>[p.mpn.toUpperCase(),p]));
 const rows=e.kind==='resistor'
  ?[['Value',e.value],['Tolerance',e.tolerance],['Power',e.power],['Max voltage',e.maxV],['TCR / note',e.tcr],['Form',e.size],['Packaging',e.packaging]]
  :[['Key specs',e.specs],['Package',e.package],['Mount',MOUNT[e.mount]||e.mount],['Typical use',e.use]];
 const alts=alternatesOf(e);
 const siblings=know.family?.filter(f=>f!==e)||[];
 return <div className={'knowledge '+(compact?'compact':'')} data-match={know.match}>
  <div className="knowledge-head"><span className="subtle-tag"><BookOpen size={10}/> PART MASTER</span><small>{matchLine(know)}</small></div>
  <strong className="knowledge-title">{e.description}</strong>
  <small className="knowledge-line">{e.kind==='resistor'?e.type:`${e.category} · ${e.subType}`} · {e.manufacturer}{know.match!=='exact'?` · ${e.mpn}`:''}</small>
  <dl className="knowledge-grid">{rows.filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  {alts.length>0&&<div className="alt-row"><small>{e.kind==='resistor'?'Equivalents':'Alternates to review'}</small><div className="alt-chips">{alts.map(a=>{const inv=a.mpn&&byMpn.get(a.mpn.toUpperCase());
   return inv||a.mpn?<button type="button" key={a.label} className={'alt-chip '+(inv?'in-stock':'')} title={inv?`${fmt(inv.stock)} in inventory`:'Search suppliers for this part'} onClick={()=>inv?onOpenInventory?.(inv):onSource?.(a.mpn)}>{a.label}{inv&&<i className="stock-dot green"/>}</button>:<span key={a.label} className="alt-chip plain">{a.label}</span>})}</div></div>}
  {siblings.length>0&&<small className="knowledge-line">{know.match==='value'?'Other forms':'Same family'}: {siblings.slice(0,6).map(f=>f.kind==='resistor'?`${f.mpn} (${f.size})`:f.mpn).join(', ')}{siblings.length>6?` +${siblings.length-6}`:''}</small>}
 </div>;
}
