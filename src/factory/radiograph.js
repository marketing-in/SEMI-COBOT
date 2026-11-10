// X-ray image of one inspected part, drawn on any 2D canvas context (DOM-free, so the 3D monitor,
// the line screen and the panel share it). Transmission image: dense solder absorbs, so joints are
// dark on a light field; voids are gas bubbles inside joints, so they show light. Void area follows
// the measured void % for the part; everything is deterministic per board, part and joint.
import {noise} from '../factoryLine.js';

// Time windows of the X-ray cycle: board in and tube on, then each part (top view, then oblique
// views as the detector tilts), then tube off and board out. Matches plan.times.xray.
export function xrayTimeline(plan){
 const parts=plan.xrayParts.map(p=>p.ref);
 if(!parts.length)return {duration:plan.times.xray,load:0,windows:[]};
 const load=3,per=6;return {duration:load+parts.length*per+3,load,windows:parts.map((ref,i)=>({ref,t0:load+i*per,t1:load+(i+1)*per}))};
}
export const windowAt=(tl,t)=>tl.windows.find(w=>t>=w.t0&&t<w.t1)||null;
// What the detector is doing at time t of the cycle: which part, whether the beam is on, how far the
// first (top-view) frame has been read out, and the oblique tilt. Shared by every view of the scan.
export function scanState(tl,t){
 const w=windowAt(tl,t),ws=tl.windows,ref=w?.ref||(ws.length?(t>=tl.load?ws[ws.length-1].ref:ws[0].ref):null);
 if(!w)return {ref,on:false,local:0,reveal:ref&&t>=tl.load?1:null,tilt:0};
 const local=t-w.t0,clamp=x=>Math.max(0,Math.min(1,x)),ease=f=>f<.5?2*f*f:1-2*(1-f)*(1-f),span=(a,b)=>clamp((local-a)/(b-a));
 return {ref,on:local>=.8&&t<w.t1-.2,local,reveal:local<.8?0:span(.8,2.4),tilt:ease(span(2.6,3.4))*(1-ease(span(5.4,5.8)))};
}
export const scanKey=s=>`${s.ref}|${s.reveal==null?'-':Math.round(s.reveal*16)}|${Math.round(s.tilt*12)}|${s.on?Math.floor(s.local*6):'-'}`;

const rot=(x,y,a)=>[x*Math.cos(a)+y*Math.sin(a),-x*Math.sin(a)+y*Math.cos(a)];

// g: CanvasRenderingContext2D; view: {tilt 0..1 (oblique angle), scan 0..1 (acquisition line), live,
// reveal 0..1 (how much of the frame the detector has read out; the rest is still dark)}.
export function drawRadiograph(g,W,H,plan,result,ref,view={}){
 const part=plan.machine.find(p=>p.ref===ref),entry=result?.xray.find(x=>x.ref===ref);
 g.save();g.fillStyle='#cfd3d3';g.fillRect(0,0,W,H);
 if(!part||!entry){g.fillStyle='#5b6063';g.font=`500 ${Math.round(H*.07)}px "IBM Plex Sans", system-ui, sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('No part under the tube',W/2,H/2);g.restore();return}
 const kind=entry.kind,size=Math.max(part.w,part.d)+3,sc=Math.min(W,H)*.82/size,cx=W/2,cy=H/2,a=(part.rot||0)*Math.PI/180;
 // Oblique view: the detector tilt shears the image and foreshortens it slightly.
 const tilt=(view.tilt||0)*.32;g.translate(cx,cy);g.transform(1,0,tilt,1-tilt*.25,0,0);
 const P=(x,y)=>[x*sc,y*sc];
 // Field: fibreglass weave and copper planes as faint texture.
 g.fillStyle='rgba(120,128,130,.08)';for(let i=-12;i<=12;i++){g.fillRect(i*W/24,-H/2,1.5,H);g.fillRect(-W/2,i*H/24,W,1.5)}
 // Package body and lead frame: mid grey (plastic is nearly transparent, copper less so).
 const [bw,bd]=[part.w*sc,part.d*sc];g.save();g.rotate(-a);g.fillStyle='rgba(95,103,106,.22)';g.fillRect(-bw/2,-bd/2,bw,bd);g.restore();
 const pads=plan.pads.filter(q=>q.ref===ref);
 const voidsFrac=entry.voids/100,dark='#24292b',light='#b9bfc1';
 const bubble=(x,y,r)=>{const grd=g.createRadialGradient(x-r*.25,y-r*.25,r*.1,x,y,r);grd.addColorStop(0,'#d6dbdc');grd.addColorStop(1,light);g.fillStyle=grd;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill()};
 let worst=null;
 if(kind==='bga'){
  const pitch=size>=13?1:.8,n=Math.max(4,Math.floor((Math.min(part.w,part.d)-.6)/pitch)),r=pitch*.3*sc,off=(n-1)*pitch/2;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const [lx,ly]=rot(-off+i*pitch,-off+j*pitch,a),[x,y]=P(lx,ly);g.fillStyle=dark;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
   const f=Math.min(.55,voidsFrac*(.2+1.6*noise(`xb|${result.board}|${ref}|${i}|${j}`)));if(f>.02){const vr=r*Math.sqrt(f),dx=(noise(`xbx|${i}|${j}|${ref}`)-.5)*r*.6,dy=(noise(`xby|${i}|${j}|${ref}`)-.5)*r*.6;bubble(x+dx,y+dy,vr);if(!worst||f>worst.f)worst={x,y,r,f}}}
 }else{
  // Perimeter joints from the real pads, then the thermal pad for bottom-terminated parts.
  pads.forEach((q,i)=>{const [x,y]=P(q.x-part.x,q.y-part.y),w=q.w*sc,h=q.h*sc;g.fillStyle=dark;g.fillRect(x-w/2,y-h/2,w,h);
   if(kind==='leaded'){g.fillStyle='rgba(60,66,69,.45)';const inward=[-(q.x-part.x),-(q.y-part.y)],L=Math.hypot(...inward)||1;g.fillRect(x-w/4+inward[0]/L*w*.5,y-h/4+inward[1]/L*h*.5,w/2,h/2)}
   const f=Math.min(.4,voidsFrac*(.1+1.4*noise(`xp|${result.board}|${ref}|${i}`)));if(f>.06){const vr=Math.min(w,h)*.42*Math.sqrt(f);bubble(x,y,vr);if(!worst||f>worst.f)worst={x,y,r:Math.max(w,h)*.6,f}}});
  if(kind==='bottom'){const t=Math.min(part.w,part.d)*.55*sc;g.save();g.rotate(-a);g.fillStyle=dark;g.fillRect(-t/2,-t/2,t,t);
   // Void blobs whose total area is the measured void % of the thermal pad.
   let left=voidsFrac*t*t;for(let i=0;i<14&&left>0;i++){const share=i===13?left:left*(.18+.3*noise(`xt|${result.board}|${ref}|${i}`)),vr=Math.sqrt(share/Math.PI),x=(noise(`xtx|${ref}|${i}`)-.5)*(t-vr*2),y=(noise(`xty|${ref}|${i}`)-.5)*(t-vr*2);bubble(x,y,vr);left-=share;if(!worst||vr>worst.r)worst={x,y,r:vr*1.4,f:share}}
   g.restore()}
 }
 if(worst){g.strokeStyle=entry.pass?'rgba(217,130,74,.9)':'rgba(210,69,59,.95)';g.lineWidth=Math.max(1.5,W/260);g.beginPath();g.arc(worst.x,worst.y,worst.r*1.35+3,0,Math.PI*2);g.stroke()}
 g.setTransform(1,0,0,1,0,0);
 // Detector grain and the live acquisition line.
 for(let i=0;i<W*H/90;i++){const x=noise(`gx|${i}`)*W,y=noise(`gy|${i}`)*H;g.fillStyle=`rgba(${noise(`gc|${i}`)>.5?255:20},${noise(`gc|${i}`)>.5?255:20},${noise(`gc|${i}`)>.5?255:20},.05)`;g.fillRect(x,y,1.5,1.5)}
 if(view.reveal!=null&&view.reveal<1){const y=Math.round(view.reveal*H);g.fillStyle='#14181a';g.fillRect(0,y,W,H-y);for(let i=0;i<W*(H-y)/220;i++){g.fillStyle='rgba(255,255,255,.05)';g.fillRect(noise(`ux|${i}`)*W,y+noise(`uy|${i}`)*(H-y),1.5,1.5)}
  const grd=g.createLinearGradient(0,y-18,0,y+2);grd.addColorStop(0,'rgba(185,166,255,0)');grd.addColorStop(1,'rgba(185,166,255,.55)');g.fillStyle=grd;g.fillRect(0,y-18,W,20);g.fillStyle='#cfc4ff';g.fillRect(0,y-1,W,2)}
 else if(view.live&&view.scan!=null){const y=view.scan*H;g.fillStyle='rgba(255,255,255,.18)';g.fillRect(0,y-3,W,6)}
 const vg=g.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.28)');g.fillStyle=vg;g.fillRect(0,0,W,H);
 // Readout: part, view and void result; 1 mm scale bar.
 const fs=Math.max(11,Math.round(H*.055));g.font=`600 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;g.textBaseline='top';g.fillStyle='rgba(20,22,23,.78)';g.fillRect(0,0,W,fs*1.7);
 g.fillStyle='#ecebe5';g.fillText(`${ref} · ${part.package||kind}`,fs*.6,fs*.35);const res=`voids ${entry.voids.toFixed(1)}% / ${entry.limit}%`;g.fillStyle=entry.pass?'#7cc69a':'#f08b80';g.textAlign='right';g.fillText(res,W-fs*.6,fs*.35);g.textAlign='left';
 g.fillStyle='#24292b';g.fillRect(fs*.6,H-fs*1.2,sc,Math.max(2,fs*.18));g.font=`500 ${Math.round(fs*.8)}px "IBM Plex Mono", ui-monospace, monospace`;g.fillText('1 mm',fs*.6+sc+6,H-fs*1.5);
 const tiltDeg=Math.round((view.tilt||0)*35);g.textAlign='right';g.fillText(tiltDeg?`oblique ${tiltDeg}°`:'top view',W-fs*.6,H-fs*1.5);g.textAlign='left';
 g.restore();
}
