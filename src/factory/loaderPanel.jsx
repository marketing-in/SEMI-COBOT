import React,{useMemo} from 'react';
import {loaderNumbers,loaderState,PITCH,SLOTS} from './loader.js';
import {TRANSFER} from '../factoryLine.js';
import './loader.css';

// Side view of the unloader (push axis left to right, mm): magazine on the elevator, pass line,
// pusher blade, belts and the printer infeed, posed at the same t as the 3D view.
function SideView({n,s}){
 const top=(SLOTS-1)*PITCH,x0=n.bladeIn-22,x1=n.wall+8,yTop=n.slot*PITCH+12,yBot=(n.slot-1)*PITCH-top-12;
 const lift=s.lift-n.slot*PITCH;              // magazine offset from its aligned pose
 const Y=y=>-y,slots=[];
 for(let j=0;j<SLOTS;j++){const y=lift+(n.slot-j)*PITCH;slots.push(<line key={'r'+j} className="f-loader-rib" x1={n.magL} x2={n.magR} y1={Y(y-2.1)} y2={Y(y-2.1)}/>);
  if(j>n.slot&&j<n.slot+n.shown)slots.push(<rect key={'b'+j} className="f-loader-pcb" x={-n.W/2} y={Y(y)} width={n.W} height={1.6}/>)}
 return <svg className="f-loader-svg" viewBox={`${x0} ${-yTop} ${x1-x0} ${yTop-yBot}`} role="img" aria-label="Magazine side view">
  <g>{slots}<rect className="f-loader-mag" x={n.magL-3} y={Y(lift+(n.slot)*PITCH+9)} width={n.magR-n.magL+6} height={top+18}/></g>
  <line className="f-loader-pass" x1={x0} x2={x1} y1={Y(-.8)} y2={Y(-.8)}/>
  <line className="f-loader-belt" x1={n.beltL} x2={n.wall} y1={Y(-2.2)} y2={Y(-2.2)}/>
  <rect className="f-loader-wall" x={n.wall-3} y={Y(18)} width={6} height={10}/><rect className="f-loader-wall" x={n.wall-3} y={Y(-10)} width={6} height={8}/>
  <line className="f-loader-rod" x1={x0+4} x2={s.blade} y1={Y(-.8)} y2={Y(-.8)}/><rect className="f-loader-blade" x={s.blade-2} y={Y(2.5)} width={2} height={5}/>
  <rect className="f-loader-cur" x={s.x-n.W/2} y={Y(s.y)} width={n.W} height={1.6}/>
 </svg>;
}

export default function Panel({plan,k,t}){
 const n=useMemo(()=>loaderNumbers(plan,k),[plan,k]),s=loaderState(n,Math.max(0,Math.min(n.D,t||0)));
 const left=s.x-n.W/2>n.magR?n.remaining-1:n.remaining,mm=v=>String(Math.round(v*10)/10);
 const rows=[
  ['Board',<>{k+1}<small> / {n.N}</small></>],
  ['In magazine',<>{left}</>],
  ['Slot',<>{n.slot+1}<small> · {PITCH} mm pitch</small></>],
  ['Board size',<>{mm(n.W)}×{mm(n.H)}<small> mm</small></>],
  ['Rail width',<>{mm(n.railWidth)}<small> mm</small></>],
  ['Push stroke',<>{Math.round(n.stroke)}<small> mm</small></>],
  ['Conveyor',<>{n.speed}<small> mm/s</small></>],
  ['To printer',<>{TRANSFER.toFixed(1)}<small> s</small></>],
 ];
 return <div className="f-loader">
  <SideView n={n} s={s}/>
  <dl className="f-loader-grid">{rows.map(([dt,dd])=><div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>
 </div>;
}
