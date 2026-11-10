import React,{useMemo} from 'react';
import {aoiNumbers,aoiState,aoiSummary,DEFECTS,SHORT} from './aoi.js';
import {SPEC} from '../factoryLine.js';
import './aoi.css';

const TYPE={capacitor:'Cap',resistor:'Res',chip:'IC',diode:'Diode',led:'LED',transistor:'Trans',inductor:'Ind',crystal:'Xtal',connector:'Conn'};
const typeOf=t=>TYPE[t]||(t?String(t).charAt(0).toUpperCase()+String(t).slice(1,6):'—');
const signed=(v,d=2)=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(d);
const VIEW=['rear','right','front','left'];

export default function Panel({plan,result,t}){
 const n=useMemo(()=>aoiNumbers(plan,result),[plan,result]),s=aoiState(n,t||0),sum=aoiSummary(n,s.done),lim=SPEC.aoi;
 // Defects first (most defects, then largest offset), then passes by how close they run to the limits.
 const rows=useMemo(()=>{const idx=new Map(n.order.map((o,i)=>[o.ref,i])),risk=a=>Math.max(Math.hypot(a.dx,a.dy)/lim.offset,Math.abs(a.rot)/lim.rotation);
  return (result?.aoi||[]).map(a=>({...a,i:idx.get(a.ref)??0})).sort((a,b)=>b.defects.length-a.defects.length||risk(b)-risk(a)||String(a.ref).localeCompare(String(b.ref)))},[n,result,lim]);
 const cur=s.cur>=0?n.order[s.cur]:null;
 const now=cur?<>{cur.ref}<small> {s.top?'top':s.side>=0?VIEW[s.side]:'move'}</small></>:s.phase==='fid'?<>Fiducials</>:<>—</>;
 const stats=[
  ['Inspected',<>{sum.inspected}<small> / {sum.total}</small></>],
  ['Camera',now],
  ['Pass',<span className="f-aoi-ok">{sum.pass}</span>],
  ['Fail',<span className={sum.fail?'f-aoi-f':''}>{sum.fail}</span>],
 ];
 return <div className="f-aoi">
  <dl className="f-aoi-grid">{stats.map(([dt,dd])=><div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
  <ul className="f-aoi-defects" aria-label="Defects by type">{DEFECTS.map(d=><li key={d} className={sum.by[d]?'on':''}><span>{SHORT[d]}</span><b>{sum.by[d]}</b></li>)}</ul>
  <p className="f-aoi-spec">Offset ≤ {lim.offset.toFixed(2)} mm · rotation ≤ {lim.rotation}°</p>
  {rows.length>0?<div className="f-aoi-scroll"><table className="f-aoi-table">
   <thead><tr><th>Ref</th><th>Type</th><th>dx mm</th><th>dy mm</th><th>Rot °</th><th>Pol</th><th>Result</th></tr></thead>
   <tbody>{rows.slice(0,15).map(a=>{const seen=a.i<s.done,off=Math.hypot(a.dx,a.dy)>lim.offset,rot=Math.abs(a.rot)>lim.rotation,bad=seen&&!a.pass;
    return <tr key={a.ref} className={(seen?'':'f-aoi-pending ')+(a.pass?'f-aoi-row-pass':'f-aoi-row-fail')}>
     <td><i/>{a.ref}</td><td>{typeOf(a.type)}</td>
     <td className={seen&&off?'f-aoi-f':''}>{signed(a.dx)}</td><td className={seen&&off?'f-aoi-f':''}>{signed(a.dy)}</td><td className={seen&&rot?'f-aoi-f':''}>{signed(a.rot)}</td>
     <td>{a.polarity==='checked'?(seen?'OK':'·'):'—'}</td>
     <td className={bad?'f-aoi-f':seen?'f-aoi-ok':''} title={a.defects.join(', ')||undefined}>{!seen?'—':a.pass?'Pass':a.defects.map(d=>SHORT[d]||d).join(', ')}</td></tr>})}</tbody>
   {rows.length>15&&<tfoot><tr><td colSpan={7}>+{rows.length-15} more</td></tr></tfoot>}
  </table></div>:<p className="f-aoi-none">No parts to inspect</p>}
 </div>;
}
