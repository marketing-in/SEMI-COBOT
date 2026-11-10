import React,{useEffect,useMemo,useRef} from 'react';
import {cycleWindow,cycleStarts,events,activity} from './pnp.js';
import {nozzleOffset,cameraFor} from '../smtLine.js';
import './pnp.css';

const PHASE={fiducial:'Fiducials',pick:'Pick',vision:'Vision',place:'Place',done:'Done'};

// Top view of the machine at t: feeder banks, upward cameras, the board with parts placed so far, the
// part going down now, and the head with its nozzles (filled when carrying a part).
function MachineMap({plan,line,a,byRef}){
 const ref=useRef(null);
 useEffect(()=>{const c=ref.current;if(!c)return;const css=getComputedStyle(c),v=n=>css.getPropertyValue(n).trim();
  const W=plan.board.width,H=plan.board.height,fs=line.feeders,n=line.opts.nozzles,s=a.s;
  const R=Math.max(W/2,...fs.map(f=>Math.abs(f.x)+f.pitch/2),...(s?[Math.abs(s.x)+Math.abs(nozzleOffset(0,n))+4]:[]))+4;
  const y0=Math.min(-H/2,...fs.map(f=>f.bank==='rear'?f.y-12:f.y-4))-4,y1=Math.max(H/2,...fs.map(f=>f.bank==='front'?f.y+12:f.y+4))+4;
  const dpr=Math.min(2,window.devicePixelRatio||1),cw=c.clientWidth||320,pad=6,sx=Math.min((cw-2*pad)/(2*R),(300-2*pad)/(y1-y0)),ch=Math.round((y1-y0)*sx+2*pad);
  if(c.width!==Math.round(cw*dpr)||c.height!==Math.round(ch*dpr)){c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr);c.style.height=ch+'px'}
  const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,cw,ch);
  const X=mm=>cw/2+mm*sx,Y=mm=>pad+(mm-y0)*sx;
  const part=(p,cx,cy,rot,fill,stroke,lw=1)=>{const r=(rot||0)*Math.PI/180,co=Math.cos(r),si=Math.sin(r),w=Math.max(1.5,p.w*sx),d=Math.max(1.5,p.d*sx);
   x.save();x.translate(X(cx),Y(cy));x.transform(co,-si,si,co,0,0);if(fill){x.fillStyle=fill;x.fillRect(-w/2,-d/2,w,d)}if(stroke){x.strokeStyle=stroke;x.lineWidth=lw;x.strokeRect(-w/2,-d/2,w,d)}x.restore()};
  // Feeders (pocket at f.y, body running away from the board); the one being picked from in copper.
  const pickF=a.phase==='pick'?fs.find(f=>f.refs.includes(a.ref)):null;
  for(const f of fs){const out=f.bank==='front'?1:-1,ya=f.y-out*3,yb=f.y+out*11;
   x.fillStyle=f===pickF?v('--accent'):f.kind==='tray'?v('--t2'):v('--surface-2');x.strokeStyle=v('--rule');x.lineWidth=1;
   x.fillRect(X(f.x-f.pitch/2+.7),Y(Math.min(ya,yb)),(f.pitch-1.4)*sx,14*sx);x.strokeRect(X(f.x-f.pitch/2+.7)+.5,Y(Math.min(ya,yb))+.5,(f.pitch-1.4)*sx-1,14*sx-1)}
  for(const b of [...new Set(fs.map(f=>f.bank))]){const cm=cameraFor(b,plan.board);x.beginPath();x.arc(X(cm.x),Y(cm.y),Math.max(3,4*sx),0,Math.PI*2);
   x.fillStyle=a.phase==='vision'?v('--accent'):'transparent';x.fill();x.strokeStyle=v('--t3');x.lineWidth=1;x.stroke()}
  x.fillStyle=v('--surface-2');x.strokeStyle=v('--rule');x.fillRect(X(-W/2),Y(-H/2),W*sx,H*sx);x.strokeRect(X(-W/2)+.5,Y(-H/2)+.5,W*sx-1,H*sx-1);
  x.strokeStyle=v('--t3');for(const [fx,fy] of line.fiducials){x.beginPath();x.arc(X(fx),Y(fy),Math.max(2,1*sx),0,Math.PI*2);x.stroke()}
  const placed=new Set(line.placeOrder.slice(0,a.placed));
  for(const p of line.machine){if(placed.has(p.ref))part(p,p.x,p.y,p.rot,v('--t2'),null);else part(p,p.x,p.y,p.rot,null,v('--hair'))}
  if(a.phase==='place'&&byRef.get(a.ref)){const p=byRef.get(a.ref);part(p,p.x,p.y,p.rot,null,v('--accent'),2)}
  // Head: carriage outline and nozzles; a carried part drawn under its nozzle at the nozzle's angle.
  if(s){const hw=(n-1)*18+20;x.strokeStyle=v('--text');x.lineWidth=1;x.strokeRect(X(s.x-hw/2),Y(s.y-5),hw*sx,10*sx);
   for(let k=0;k<n;k++){const nx=s.x+nozzleOffset(k,n),r=s.held[k],p=r&&byRef.get(r);if(p)part(p,nx,s.y,s.rot[k],v('--accent'),null);
    x.beginPath();x.arc(X(nx),Y(s.y),Math.max(2,1.4*sx),0,Math.PI*2);x.fillStyle=r?v('--accent'):v('--surface');x.fill();x.strokeStyle=v('--text');x.stroke()}}
 });
 return <canvas ref={ref} className="f-pnp-map" aria-label="Machine top view"/>;
}

export default function Panel({plan,t}){
 const line=plan.line,{tStart}=useMemo(()=>cycleWindow(line),[line]),ev=useMemo(()=>events(line),[line]),nCycles=useMemo(()=>cycleStarts(line).length,[line]);
 const byRef=useMemo(()=>new Map(line.machine.map(p=>[p.ref,p])),[line]),slotOf=useMemo(()=>{const m=new Map();for(const f of line.feeders)for(const r of f.refs)m.set(r,f);return m},[line]);
 const feeders=useMemo(()=>[...line.feeders].sort((a,b)=>a.slot.localeCompare(b.slot)),[line]);
 const a=activity(line,ev,tStart+Math.max(0,t||0)),p=a.ref?byRef.get(a.ref):null,f=a.ref?slotOf.get(a.ref):null,N=line.placeOrder.length,st=line.stats;
 return <div className="f-pnp">
  <MachineMap plan={plan} line={line} a={a} byRef={byRef}/>
  <div className="f-pnp-live numeric">
   <span className="f-pnp-phase">{PHASE[a.phase]}{p?<b> {p.ref}</b>:a.phase==='vision'?<b> {a.refs.length} parts</b>:null}</span>
   {p&&<span>Nozzle <b>{a.nozzle+1}</b></span>}{f&&<span>Feeder <b>{f.slot}</b></span>}{p&&a.phase==='place'&&<span>θ <b>{Math.round(p.rot||0)}°</b></span>}
   <span>Placed <b>{a.placed}</b>/{N}</span><span>Cycle <b>{Math.max(0,a.cycle+1)}</b>/{nCycles}</span>
  </div>
  <dl className="f-pnp-kpis">
   <div><dt>Nozzles</dt><dd>{line.opts.nozzles}</dd></div>
   <div><dt>Placements</dt><dd>{st.placements}</dd></div>
   <div><dt>Cycles</dt><dd>{st.cycles}</dd></div>
   <div><dt>Rate</dt><dd>{st.cph.toLocaleString('en-US')} <small>cph</small></dd></div>
  </dl>
  <div className="f-pnp-scroll">
   <table className="f-pnp-table">
    <caption>Feeder setup</caption>
    <thead><tr><th>Slot</th><th>Part</th><th>Package</th><th>Tape</th><th>Qty</th></tr></thead>
    <tbody>{feeders.map(x=><tr key={x.slot} className={x===f?'f-pnp-now':''}><td className="numeric">{x.slot}</td><td className="f-pnp-part" title={x.refs.join(', ')}>{x.label}</td><td>{x.package||'—'}</td><td className="numeric">{x.kind==='tray'?'Tray':x.tape+' mm'}</td><td className="numeric">{x.refs.length}</td></tr>)}</tbody>
   </table>
  </div>
 </div>;
}
