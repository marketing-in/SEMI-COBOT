import React,{useMemo} from 'react';
import {spiNumbers,spiState,spiSummary} from './spi.js';
import {SPEC} from '../factoryLine.js';
import './spi.css';

// Volume histogram, 10 % buckets from 40 to 160 %, bars stacked by status, spec band shaded.
function Histogram({buckets}){
 const max=Math.max(1,...buckets.map(b=>b.pass+b.warn+b.fail)),X=v=>(v-40)*2,H=60,s=SPEC.spi;
 return <svg className="f-spi-hist" viewBox="-2 -6 244 82" role="img" aria-label="Paste volume histogram">
  <rect className="f-spi-band" x={X(s.min)} y={0} width={X(s.max)-X(s.min)} height={H}/>
  {[s.min,s.max].map(v=><line key={v} className="f-spi-limit" x1={X(v)} x2={X(v)} y1={0} y2={H}/>)}
  {buckets.map(b=>{let y=H;return ['pass','warn','fail'].map(k=>{const h=b[k]/max*(H-2);y-=h;return h>0?<rect key={b.lo+k} className={'f-spi-'+k} x={X(b.lo)+1.5} y={y} width={17} height={h}/>:null})})}
  <line className="f-spi-axis" x1={0} x2={240} y1={H} y2={H}/>
  {[40,70,100,130,160].map(v=><text key={v} x={X(v)} y={H+11} textAnchor={v===40?'start':v===160?'end':'middle'}>{v}{v===160?' %':''}</text>)}
  <text x={240} y={-.5} textAnchor="end">{max}</text>
 </svg>;
}

export default function Panel({plan,result,t}){
 const n=useMemo(()=>spiNumbers(plan,result),[plan,result]),s=spiState(n,Math.max(0,Math.min(n.D,t||0)));
 const sum=spiSummary(n,result,s.done);
 // Fails first, then warns, each by distance from 100 %.
 const rows=useMemo(()=>(result?.deposits||[]).map((d,j)=>({...d,j})).filter(d=>d.status!=='pass')
  .sort((a,b)=>(a.status==='fail'?0:1)-(b.status==='fail'?0:1)||Math.abs(b.volume-100)-Math.abs(a.volume-100)),[result]);
 const tile=s.tile>=0?s.tile+1:s.done;
 const stats=[
  ['Measured',<>{sum.measured}<small> / {sum.total}</small></>],
  ['FOV',<>{tile}<small> / {n.tiles.length} · {n.fw}×{n.fh} mm</small></>],
  ['Pass',<span className="f-spi-ok">{sum.pass}</span>],
  ['Warn',<span className={sum.warn?'f-spi-w':''}>{sum.warn}</span>],
  ['Fail',<span className={sum.fail?'f-spi-f':''}>{sum.fail}</span>],
  ['Mean volume',sum.measured?<>{sum.mean.toFixed(1)}<small> %</small></>:<>—</>],
 ];
 return <div className="f-spi">
  <dl className="f-spi-grid">{stats.map(([dt,dd])=><div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
  <Histogram buckets={sum.buckets}/>
  {rows.length>0?<table className="f-spi-table">
   <thead><tr><th>Ref</th><th>Pad</th><th>Vol %</th><th>Ht µm</th><th>AR</th></tr></thead>
   <tbody>{rows.slice(0,12).map(d=><tr key={d.j} className={(n.tileOf[d.j]<s.done?'':'f-spi-pending ')+'f-spi-row-'+d.status}>
    <td><i/>{d.ref}</td><td>{d.i+1}</td><td>{d.volume.toFixed(1)}</td><td>{Math.round(d.height)}</td><td>{d.ar.toFixed(2)}</td></tr>)}</tbody>
   {rows.length>12&&<tfoot><tr><td colSpan={5}>+{rows.length-12} more</td></tr></tfoot>}
  </table>:<p className="f-spi-none">All deposits {SPEC.spi.warnLow}–{SPEC.spi.warnHigh} %</p>}
 </div>;
}
