import React,{useEffect,useMemo,useRef} from 'react';
import {timeline,pose,SLOW} from './printer.js';
import './printer.css';

const AR_MIN=.66;
const f1=v=>v.toFixed(1),f2=v=>v.toFixed(2),sg=v=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(2);

// Top view of the print: board, apertures (paste once the blade has passed), low area ratios outlined,
// the blade line and both fiducials.
function StrokeMap({plan,tl,s}){
 const ref=useRef(null),{W,H,E}=tl,aps=plan.printer.apertures;
 useEffect(()=>{const c=ref.current;if(!c)return;const css=getComputedStyle(c),v=n=>css.getPropertyValue(n).trim();
  const dpr=Math.min(2,window.devicePixelRatio||1),cw=c.clientWidth||320,pad=8,sx=(cw-2*pad)/(W+8),ch=Math.round(2*E*sx+2*pad);
  if(c.width!==Math.round(cw*dpr)||c.height!==Math.round(ch*dpr)){c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr);c.style.height=ch+'px'}
  const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,cw,ch);
  const X=mm=>pad+(mm+W/2+4)*sx,Y=mm=>pad+(mm+E)*sx;
  x.fillStyle=v('--surface-2');x.strokeStyle=v('--rule');x.lineWidth=1;x.fillRect(X(-W/2),Y(-H/2),W*sx,H*sx);x.strokeRect(X(-W/2)+.5,Y(-H/2)+.5,W*sx-1,H*sx-1);
  const printed=a=>s.printed||tl.dir*(a.y-s.blade)<=0;
  for(const a of aps){const w=Math.max(1,a.w*sx),h=Math.max(1,a.h*sx),px=X(a.x)-w/2,py=Y(a.y)-h/2;
   x.fillStyle=printed(a)?'#8f9499':v('--hair');x.fillRect(px,py,w,h);
   if(a.ar<AR_MIN){x.strokeStyle=v('--warning');x.lineWidth=1;x.strokeRect(px-.5,py-.5,w+1,h+1)}}
  x.strokeStyle=v('--text');x.lineWidth=1;for(const [fx,fy] of tl.fid){x.beginPath();x.arc(X(fx),Y(fy),Math.max(2.5,1*sx),0,Math.PI*2);x.stroke()}
  if(s.down>0){x.strokeStyle=v('--accent');x.lineWidth=2;x.globalAlpha=Math.max(.35,s.down);x.beginPath();x.moveTo(X(-W/2-4),Y(s.blade));x.lineTo(X(W/2+4),Y(s.blade));x.stroke();x.globalAlpha=1}
 });
 return <canvas ref={ref} className="f-printer-map" aria-label="Print stroke over the board"/>;
}

export default function Panel({plan,k,t}){
 const pr=plan.printer,sq=pr.squeegee,tl=useMemo(()=>timeline(plan,k),[plan,k]),s=pose(tl,Math.min(tl.D,t));
 const low=useMemo(()=>[...pr.apertures].sort((a,b)=>a.ar-b.ar||a.ref.localeCompare(b.ref)||a.i-b.i).slice(0,5),[pr]);
 const filled=s.printed?pr.apertures.length:pr.apertures.filter(a=>tl.dir*(a.y-s.blade)<=0).length,al=tl.al;
 const nextWipe=k+(4-k%5)+1;
 return <div className="f-printer">
  <StrokeMap plan={plan} tl={tl} s={s}/>
  <div className="f-printer-live numeric"><span>Table Z <b>{f1(s.lift)}</b> mm</span><span>Blade <b>{f1(s.blade)}</b> mm</span><span>Filled <b>{filled}</b>/{pr.apertures.length}</span></div>
  <dl className="f-printer-kpis">
   <div><dt>Stencil</dt><dd>{Math.round(pr.stencil*1000)} <small>µm</small></dd></div>
   <div><dt>Apertures</dt><dd>{pr.apertures.length}</dd></div>
   <div className={pr.lowAr?'warn':''}><dt>AR &lt; {AR_MIN}</dt><dd>{pr.lowAr}</dd></div>
   <div><dt>Stroke</dt><dd>{f1(tl.stroke)} <small>s</small></dd></div>
  </dl>
  <dl className="f-printer-specs">
   <div><dt>Speed</dt><dd>{sq.speed} mm/s</dd></div>
   <div><dt>Pressure</dt><dd>{sq.pressure} kg</dd></div>
   <div><dt>Angle</dt><dd>{sq.angle}°</dd></div>
   <div><dt>Travel</dt><dd>{Math.round(2*tl.E)} mm {tl.dir>0?'↓':'↑'}</dd></div>
   <div><dt>Snap-off</dt><dd>{f1(SLOW/tl.sep)} mm/s</dd></div>
   <div><dt>Align X Y θ</dt><dd>{sg(al.dx)} {sg(al.dy)} mm {sg(al.rot)}°</dd></div>
   <div><dt>Wipe</dt><dd>{tl.wipe?'This board':'Board '+nextWipe}</dd></div>
   <div><dt>Cycle</dt><dd>{f1(tl.D)} s</dd></div>
  </dl>
  <table className="f-printer-table">
   <caption>Smallest area ratio</caption>
   <thead><tr><th>Ref</th><th>Pad</th><th>Aperture</th><th>AR</th></tr></thead>
   <tbody>{low.map(a=><tr key={a.ref+'|'+a.i}><td>{a.ref}</td><td className="numeric">{a.i+1}</td><td className="numeric">{f2(a.w)}×{f2(a.h)} mm</td><td className={'numeric'+(a.ar<AR_MIN?' warn':'')}>{f2(a.ar)}</td></tr>)}</tbody>
  </table>
 </div>;
}
