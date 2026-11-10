import React,{useMemo} from 'react';
import {reflowNumbers} from './reflow.js';
import {LIQUIDUS,SPEC} from '../factoryLine.js';
import './reflow.css';

const VW=320,L=30,R=312,TOP=8,BOT=150,TMAX=280;

// Temperature profile: zone setpoints (step line), the board curve (bold up to now), liquidus, the
// peak spec band and the current-time marker.
function Chart({n,t}){
 const X=v=>L+v/n.D*(R-L),Y=T=>BOT-T/TMAX*(BOT-TOP),s=SPEC.reflow;
 const set=n.zoneTimes.map((z,i)=>`${i?'L':'M'}${X(z.t0).toFixed(1)} ${Y(z.set).toFixed(1)}H${X(z.t1).toFixed(1)}`).join('');
 const line=pts=>pts.map((p,i)=>`${i?'L':'M'}${X(p.t).toFixed(1)} ${Y(p.T).toFixed(1)}`).join('');
 const done=[...n.pts.filter(p=>p.t<t),{t,T:n.TAt(t)}],now=n.TAt(t);
 const step=n.D>400?120:60,ticks=[];for(let v=0;v<=n.D;v+=step)ticks.push(v);
 return <svg className="f-reflow-chart" viewBox={`0 0 ${VW} 168`} role="img" aria-label="Reflow temperature profile">
  {n.zoneTimes.slice(1).map(z=><line key={z.name} className="f-reflow-zone" x1={X(z.t0)} x2={X(z.t0)} y1={TOP} y2={BOT}/>)}
  <rect className="f-reflow-band" x={L} y={Y(s.peak[1])} width={R-L} height={Y(s.peak[0])-Y(s.peak[1])}/>
  {[0,50,100,150,200,250].map(v=><g key={v}><line className="f-reflow-gl" x1={L} x2={R} y1={Y(v)} y2={Y(v)}/><text x={L-4} y={Y(v)+3} textAnchor="end">{v}</text></g>)}
  <line className="f-reflow-liq" x1={L} x2={R} y1={Y(LIQUIDUS)} y2={Y(LIQUIDUS)}/>
  <text className="f-reflow-liq-label" x={L+3} y={Y(LIQUIDUS)-3}>{LIQUIDUS}</text>
  <path className="f-reflow-set" d={set}/>
  <path className="f-reflow-plan" d={line(n.pts)}/>
  <path className="f-reflow-board" d={line(done)}/>
  <line className="f-reflow-now" x1={X(t)} x2={X(t)} y1={TOP} y2={BOT}/>
  <circle className="f-reflow-dot" cx={X(t)} cy={Y(now)} r="3"/>
  <line className="f-reflow-axis" x1={L} x2={R} y1={BOT} y2={BOT}/>
  {ticks.map(v=><text key={v} x={X(v)} y={BOT+12} textAnchor={v===0?'start':'middle'}>{v}</text>)}
  <text x={R} y={BOT+12} textAnchor="end">s</text>
  <text x={L-4} y={TOP-1} textAnchor="end">°C</text>
 </svg>;
}

export default function Panel({plan,t}){
 const n=useMemo(()=>reflowNumbers(plan),[plan]),r=n.R,s=SPEC.reflow,tt=Math.max(0,Math.min(n.D,t||0));
 const T=n.TAt(tt),zi=n.zoneAt(tt),inside=n.xAt(tt)<n.L;
 const metrics=[
  ['Peak',<>{r.peak.toFixed(1)}<small> °C</small></>,`${s.peak[0]}–${s.peak[1]} °C`,r.ok.peak],
  [`Above ${LIQUIDUS} °C`,<>{r.tal.toFixed(1)}<small> s</small></>,`${s.tal[0]}–${s.tal[1]} s`,r.ok.tal],
  ['Soak 150–200 °C',<>{r.soak.toFixed(1)}<small> s</small></>,`${s.soak[0]}–${s.soak[1]} s`,r.ok.soak],
  ['Max ramp',<>{r.ramp.toFixed(2)}<small> °C/s</small></>,`≤ ${s.ramp} °C/s`,r.ok.ramp],
 ];
 return <div className="f-reflow">
  <dl className="f-reflow-live">
   <div><dt>Board</dt><dd>{T.toFixed(1)}<small> °C</small></dd></div>
   <div><dt>Zone</dt><dd>{inside?<>{zi+1}<small> {r.zones[zi].name} · {r.zones[zi].set} °C</small></>:<small>Out</small>}</dd></div>
  </dl>
  <Chart n={n} t={tt}/>
  <div className="f-reflow-legend"><span className="f-reflow-k-board">Board</span><span className="f-reflow-k-set">Zone set</span><span className="f-reflow-k-liq">Liquidus</span><span className="f-reflow-k-band">Peak spec</span></div>
  <table className="f-reflow-metrics">
   <tbody>{metrics.map(([k,v,spec,ok])=><tr key={k} className={ok?'':'f-reflow-bad'}><th>{k}</th><td>{v}</td><td className="f-reflow-spec">{spec}</td><td className="f-reflow-verdict">{ok?'Pass':'Fail'}</td></tr>)}</tbody>
  </table>
  <dl className="f-reflow-grid">
   <div><dt>Conveyor</dt><dd>{r.speedMmin.toFixed(2)}<small> m/min</small></dd></div>
   <div><dt>Dwell</dt><dd>{Math.round(r.dwell)}<small> s</small></dd></div>
   <div><dt>Heated length</dt><dd>{(n.L/1000).toFixed(1)}<small> m · {n.NZ} zones</small></dd></div>
  </dl>
  <div className="f-reflow-zones"><table>
   <thead><tr><th>Zone</th>{r.zones.map((z,i)=><th key={i} className={inside&&i===zi?'f-reflow-cur':''} title={z.name}>{i+1}</th>)}</tr></thead>
   <tbody><tr><th>°C</th>{r.zones.map((z,i)=><td key={i} className={inside&&i===zi?'f-reflow-cur':''}>{z.set}</td>)}</tr></tbody>
  </table></div>
 </div>;
}
