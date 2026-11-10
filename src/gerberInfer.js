// Components from Gerber geometry alone, for fabrication sets that carry no component data (no X2 pad
// attributes, no component layer, no placement file). Pure, no DOM.
//
// 1. Pads: every solder-mask opening is a pad, however the CAD tool drew it (flash, region or painted
//    strokes). The mask layer is rasterised and each connected blob becomes one pad. Without a mask
//    layer, copper flashes are used instead.
// 2. Holes: a drill hit inside a pad makes it through-hole; small drilled openings are vias.
// 3. Clusters: pads of the same shape link to neighbours at their own pitch, IC rows that share a
//    centre merge, a large tab joins the small pads beside it, and closed silkscreen outlines split
//    or join groups the way the designer drew them.
// 4. Classification: pad count, rows, pitch and holes give a package (DIP-28, SOIC-8, header 1x8,
//    0603, ...) and a designator prefix.
import {chainOutline,componentFromPads} from './gerber.js';

const r2=n=>Math.round(n*100)/100;

// --- Rasteriser ---------------------------------------------------------------------------------
// objects in board coordinates (mm, Y down, centred). Returns {data,w,h,ppm,x0,y0}.
export function rasterise(objects,bounds,{ppm=20,maxPixels=6e6}={}){
 const W=bounds.maxX-bounds.minX,H=bounds.maxY-bounds.minY;ppm=Math.min(ppm,Math.sqrt(maxPixels/(W*H)));
 const w=Math.ceil(W*ppm)+2,h=Math.ceil(H*ppm)+2,data=new Uint8Array(w*h),x0=bounds.minX-1/ppm,y0=bounds.minY-1/ppm;
 const px=x=>(x-x0)*ppm,py=y=>(y-y0)*ppm;
 const span=(lo,hi,max)=>[Math.max(0,Math.floor(lo)),Math.min(max-1,Math.ceil(hi))];
 for(const o of objects){
  const v=o.pol==='C'?0:1;
  if(o.k==='circle'||o.k==='ring'){const cx=px(o.x),cy=py(o.y),r=o.r*ppm,r2_=r*r;const [a,b]=span(cx-r,cx+r,w),[c,d]=span(cy-r,cy+r,h);
   for(let y=c;y<=d;y++)for(let x=a;x<=b;x++){const dx=x+.5-cx,dy=y+.5-cy;if(dx*dx+dy*dy<=r2_)data[y*w+x]=v}}
  else if(o.k==='stroke'){const rr=Math.max(.5,o.w*ppm/2);for(let i=0;i<o.pts.length;i++){const p=o.pts[i],q=o.pts[i+1]||p;const ax=px(p[0]),ay=py(p[1]),bx=px(q[0]),by=py(q[1]);
    const [a,b]=span(Math.min(ax,bx)-rr,Math.max(ax,bx)+rr,w),[c,d]=span(Math.min(ay,by)-rr,Math.max(ay,by)+rr,h);const dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy||1e-9;
    for(let y=c;y<=d;y++)for(let x=a;x<=b;x++){const fx=x+.5-ax,fy=y+.5-ay;const t=Math.max(0,Math.min(1,(fx*dx+fy*dy)/L2));const ex=fx-t*dx,ey=fy-t*dy;if(ex*ex+ey*ey<=rr*rr)data[y*w+x]=v}}}
  else if(o.k==='poly'&&o.pts.length>2){const P=o.pts.map(([x,y])=>[px(x),py(y)]);let a=Infinity,b=-Infinity;for(const [,y] of P){a=Math.min(a,y);b=Math.max(b,y)}const [c,d]=span(a,b,h);
   for(let y=c;y<=d;y++){const yc=y+.5,xs=[];for(let i=0;i<P.length;i++){const [x1,y1]=P[i],[x2,y2]=P[(i+1)%P.length];if((y1<=yc)!==(y2<=yc))xs.push(x1+(yc-y1)/(y2-y1)*(x2-x1))}xs.sort((m,n)=>m-n);
    for(let k=0;k+1<xs.length;k+=2){const [s,e]=span(xs[k]-.5,xs[k+1]-.5,w);for(let x=s;x<=e;x++)if(x+.5>=xs[k]&&x+.5<=xs[k+1])data[y*w+x]=v}}}
 }
 return {data,w,h,ppm,x0,y0};
}

// Connected blobs (4-neighbour) as pads in mm: {x,y,w,h,area,outline}.
export function blobs(r,{minArea=.03,maxArea=600}={}){
 const {data,w,h,ppm,x0,y0}=r,seen=new Uint8Array(w*h),out=[],stack=new Int32Array(w*h);
 for(let i=0;i<w*h;i++){if(!data[i]||seen[i])continue;let top=0,n=0,a=Infinity,b=Infinity,c=-1,d=-1;stack[top++]=i;seen[i]=1;
  while(top){const k=stack[--top],x=k%w,y=(k-x)/w;n++;if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>d)d=y;
   if(x>0&&data[k-1]&&!seen[k-1]){seen[k-1]=1;stack[top++]=k-1}if(x<w-1&&data[k+1]&&!seen[k+1]){seen[k+1]=1;stack[top++]=k+1}
   if(y>0&&data[k-w]&&!seen[k-w]){seen[k-w]=1;stack[top++]=k-w}if(y<h-1&&data[k+w]&&!seen[k+w]){seen[k+w]=1;stack[top++]=k+w}}
  const area=n/(ppm*ppm);if(area<minArea||area>maxArea)continue;
  const X0=x0+a/ppm,Y0=y0+b/ppm,X1=x0+(c+1)/ppm,Y1=y0+(d+1)/ppm;
  out.push({x:(X0+X1)/2,y:(Y0+Y1)/2,w:X1-X0,h:Y1-Y0,area,outline:[[X0,Y0],[X1,Y0],[X1,Y1],[X0,Y1]]});
 }
 return out;
}

// --- Clustering ---------------------------------------------------------------------------------
const sigOf=p=>{const a=Math.min(p.w,p.h),b=Math.max(p.w,p.h);return `${p.hole>0?'T':'S'}:${(Math.round(a*8)/8).toFixed(3)}:${(Math.round(b*8)/8).toFixed(3)}`};
function grid(pads,cell){const g=new Map();pads.forEach((p,i)=>{const k=Math.floor(p.x/cell)+','+Math.floor(p.y/cell);if(!g.has(k))g.set(k,[]);g.get(k).push(i)});
 return (p,r)=>{const out=[];const cx=Math.floor(p.x/cell),cy=Math.floor(p.y/cell),n=Math.ceil(r/cell);for(let dx=-n;dx<=n;dx++)for(let dy=-n;dy<=n;dy++)for(const i of g.get((cx+dx)+','+(cy+dy))||[])out.push(i);return out}}
function uf(n){const p=Array.from({length:n},(_,i)=>i);const find=i=>{while(p[i]!==i){p[i]=p[p[i]];i=p[i]}return i};return {find,union:(a,b)=>{a=find(a);b=find(b);if(a!==b)p[a]=b}}}
function inPoly([x,y],poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c}
const area=pts=>{let s=0;for(let i=0;i<pts.length;i++){const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length];s+=x1*y2-x2*y1}return Math.abs(s/2)};

export function clusterPads(pads,{silkLoops=[]}={}){
 const n=pads.length;if(!n)return [];pads.forEach(p=>p.sig=sigOf(p));
 const near=grid(pads,4),nn=pads.map((p,i)=>{let best=Infinity;for(const j of near(p,4.5)){if(j===i||pads[j].sig!==p.sig)continue;const d=Math.hypot(pads[j].x-p.x,pads[j].y-p.y);if(d>.2&&d<best)best=d}return best});
 const U=uf(n);
 for(let i=0;i<n;i++)for(const j of near(pads[i],4.5)){if(j<=i||pads[j].sig!==pads[i].sig)continue;const d=Math.hypot(pads[j].x-pads[i].x,pads[j].y-pads[i].y);
  if(d<=4.2&&d<=1.35*Math.min(nn[i],nn[j])+.03)U.union(i,j)}
 const groups=()=>{const m=new Map();for(let i=0;i<n;i++){const r=U.find(i);if(!m.has(r))m.set(r,[]);m.get(r).push(i)}return [...m.values()]};
 const centre=g=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const i of g){const p=pads[i];a=Math.min(a,p.x);c=Math.max(c,p.x);b=Math.min(b,p.y);d=Math.max(d,p.y)}return {x:(a+c)/2,y:(b+d)/2,a,b,c,d}};
 let gs=groups();
 // Two rows of the same pads, facing each other with nothing between them, are one part (DIP, SOIC,
 // resistor arrays, 2-row headers).
 const rowOf=g=>{if(g.length<3)return null;// two-pad groups are passives, never IC rows
 const C=centre(g),sx=C.c-C.a,sy=C.d-C.b;if(sx>Math.max(.3,sy*3))return {axis:'x',lo:C.a,hi:C.c,at:C.y,g};if(sy>Math.max(.3,sx*3))return {axis:'y',lo:C.b,hi:C.d,at:C.x,g};return null};
 const rowsList=gs.map(rowOf).filter(Boolean);
 for(let i=0;i<rowsList.length;i++)for(let j=i+1;j<rowsList.length;j++){const A=rowsList[i],B=rowsList[j];
  if(A.axis!==B.axis||pads[A.g[0]].sig!==pads[B.g[0]].sig||Math.abs(A.g.length-B.g.length)>1)continue;
  const sep=Math.abs(A.at-B.at),overlap=Math.min(A.hi,B.hi)-Math.max(A.lo,B.lo),shorter=Math.min(A.hi-A.lo,B.hi-B.lo);
  if(sep<.8||sep>16||overlap<shorter*.7)continue;
  const lo=Math.max(A.lo,B.lo),hi=Math.min(A.hi,B.hi),m1=Math.min(A.at,B.at)+.3,m2=Math.max(A.at,B.at)-.3,mine=new Set([...A.g,...B.g]);
  const between=pads.some((p,k)=>!mine.has(k)&&!p.via&&(A.axis==='x'?p.x>=lo&&p.x<=hi&&p.y>m1&&p.y<m2:p.y>=lo&&p.y<=hi&&p.x>m1&&p.x<m2)&&!(p.w*p.h>4&&Math.abs((A.axis==='x'?p.y:p.x)-(A.at+B.at)/2)<.6));
  if(!between)U.union(A.g[0],B.g[0])}
 gs=groups();
 // IC rows (and an exposed centre pad) share one centre.
 for(let i=0;i<gs.length;i++)for(let j=i+1;j<gs.length;j++){const A=centre(gs[i]),B=centre(gs[j]);if(Math.hypot(A.x-B.x,A.y-B.y)<.4&&(gs[i].length>1||gs[j].length>1)&&Math.max(A.c-A.a,A.d-A.b,B.c-B.a,B.d-B.b)<60)U.union(gs[i][0],gs[j][0])}
 gs=groups();
 // A large single pad (SOT-223 / DPAK tab) joins the small-pad row right beside it.
 for(const g of gs){if(g.length!==1)continue;const t=pads[g[0]];if(t.hole>0)continue;let best=null,bd=Infinity;
  for(const h of gs){if(h===g||h.length<2||h.length>5)continue;const C=centre(h);const pa=pads[h[0]].w*pads[h[0]].h;if(t.w*t.h<2*pa)continue;
   const gap=Math.max(0,Math.max(C.a-(t.x+t.w/2),(t.x-t.w/2)-C.c,C.b-(t.y+t.h/2),(t.y-t.h/2)-C.d));if(gap<1.6&&gap<bd){bd=gap;best=h}}
  if(best)U.union(g[0],best[0])}
 gs=groups();
 // Closed silkscreen outlines: pads inside the same small outline are one part; a group spread over
 // several outlines is split along them.
 const loops=silkLoops.filter(l=>{const a=area(l);return a>.8&&a<2500});
 if(loops.length){
  const owner=pads.map(p=>{let best=-1,ba=Infinity;loops.forEach((l,k)=>{const a=area(l);if(a<ba&&inPoly([p.x,p.y],l)){ba=a;best=k}});return best});
  const byLoop=new Map();owner.forEach((k,i)=>{if(k<0)return;if(!byLoop.has(k))byLoop.set(k,[]);byLoop.get(k).push(i)});
  const out=[],taken=new Set();
  for(const [k,members] of byLoop){const clusters=new Set(members.map(i=>U.find(i)));if(clusters.size>6||members.length>220)continue;out.push(members);members.forEach(i=>taken.add(i))}
  for(const g of gs){const rest=g.filter(i=>!taken.has(i));if(rest.length)out.push(rest)}
  return out.map(g=>g.map(i=>pads[i]));
 }
 return gs.map(g=>g.map(i=>pads[i]));
}

// --- Classification -----------------------------------------------------------------------------
const PASSIVE_SIZES=[[.45,.75,'0201'],[.75,1.25,'0402'],[1.25,1.75,'0603'],[1.75,2.3,'0805'],[2.3,3.4,'1206'],[3.4,4.6,'1210/SMA'],[4.6,6.5,'2512/SMC']];
export function classify(group,side){
 const n=group.length,tht=group.filter(p=>p.hole>0).length,smd=n-tht;
 const xs=group.map(p=>p.x),ys=group.map(p=>p.y);const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
 const dists=group.map(p=>Math.min(...group.filter(q=>q!==p).map(q=>Math.hypot(q.x-p.x,q.y-p.y)),Infinity)).filter(Number.isFinite).sort((a,b)=>a-b);
 const pitch=dists.length?dists[dists.length>>1]:0;const pin=pitch?`${Math.round(pitch*100)/100} mm`:'';
 const rows=n<3?1:Math.min(new Set(xs.map(x=>Math.round(x*4))).size,new Set(ys.map(y=>Math.round(y*4))).size);
 const across=Math.min(spanX,spanY),along=Math.max(spanX,spanY);
 if(n===1)return tht?{prefix:'TP',type:'other',package:`Single through-hole pad`}:{prefix:'TP',type:'other',package:'Single pad'};
 if(n===2){const d=Math.hypot(spanX,spanY);
  if(tht)return d>=7?{prefix:'R',type:'resistor',package:`Axial, ${r2(d)} mm lead pitch`}:{prefix:'C',type:'capacitor',package:`Radial, ${r2(d)} mm lead pitch`};
  const size=PASSIVE_SIZES.find(([a,b])=>d>=a&&d<b);return {prefix:'P',type:'other',package:size?size[2]:`2-pad SMD, ${r2(d)} mm`,passive:true}}
 if(n===3&&!tht&&along<3.5)return {prefix:'Q',type:'transistor',package:'SOT-23'};
 if(n===4&&smd===1&&along>4)return {prefix:'U',type:'chip',package:'SOT-223 / DPAK'};
 if(tht===n){
  if(n===3&&along<6)return {prefix:'Q',type:'transistor',package:'TO-92 / TO-220 (3 leads)'};
  if(rows===1||across<.5)return {prefix:'J',type:'connector',package:`Header 1x${n}${pin?', '+pin+' pitch':''}`};
  if(rows===2&&Math.abs(across-2.54)<.3)return {prefix:'J',type:'connector',package:`Header 2x${n/2|0}, 2.54 mm`};
  if(rows===2&&(Math.abs(across-7.62)<.6||Math.abs(across-15.24)<.8||Math.abs(across-10.16)<.6))return {prefix:'U',type:'chip',package:`DIP-${n}`};
  return {prefix:'J',type:'connector',package:`${n}-pin through-hole`};
 }
 if(!tht){
  const quad=rows>2&&new Set(xs.map(x=>Math.round(x*4))).size>2&&new Set(ys.map(y=>Math.round(y*4))).size>2;
  if(quad)return {prefix:'U',type:'chip',package:`${spanX<12&&group.some(p=>p.w*p.h>4)?'QFN':'QFP'}-${n}${pin?', '+pin:''}`};
  if(n>=4)return {prefix:'U',type:'chip',package:`${pitch<.9?'TSSOP':'SOIC'}-${n}${pin?', '+pin:''}`};
 }
 return {prefix:'X',type:'other',package:`${n}-pad part`};
}

// Builds parts from a Gerber result's layers (board coordinates). `holes` are the drill hits.
export function inferComponents({layers,holes,bounds}){
 const notes=[],parts=[];
 for(const side of ['top','bottom']){
  const mask=layers['mask:'+side],copper=layers['copper:'+side];if(!mask&&!copper)continue;
  let pads;
  if(mask){pads=blobs(rasterise(mask.objects,bounds,{ppm:20}))}
  else{pads=(copper.objects||[]).filter(o=>o.k!=='stroke'&&!o.region).map(o=>{const pts=o.k==='circle'?[[o.x-o.r,o.y-o.r],[o.x+o.r,o.y+o.r]]:o.pts;let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const [x,y] of pts){a=Math.min(a,x);c=Math.max(c,x);b=Math.min(b,y);d=Math.max(d,y)}return {x:(a+c)/2,y:(b+d)/2,w:c-a,h:d-b,area:(c-a)*(d-b),outline:[[a,b],[c,b],[c,d],[a,d]]}});notes.push(`No ${side} mask layer, so ${side} pads come from copper flashes.`)}
  for(const p of pads){const hole=(holes||[]).find(h=>!h.slot&&Math.abs(h.x-p.x)<=p.w/2&&Math.abs(h.y-p.y)<=p.h/2);p.hole=hole?hole.d:0;p.via=hole&&hole.d<=.65&&Math.max(p.w,p.h)<=1.5}
  // Through-hole pads appear on both sides; keep them with the top side only.
  const keep=pads.filter(p=>!p.via&&!(side==='bottom'&&p.hole>0)&&p.area<300);
  const silk=layers['silk:'+side];const segs=[];for(const o of silk?.objects||[])if(o.k==='stroke')for(let i=1;i<o.pts.length;i++)segs.push([o.pts[i-1],o.pts[i]]);
  const loops=segs.length&&segs.length<20000?chainOutline(segs,.08):[];
  for(const g of clusterPads(keep,{silkLoops:loops})){const c=classify(g,side);if(c.prefix==='TP')continue;parts.push({...c,side,pads:g})}
 }
 // Designators by prefix, numbered top-left to bottom-right like a CAD tool would.
 const count={};parts.sort((a,b)=>{const ca=a.pads.reduce((s,p)=>s+p.y,0)/a.pads.length,cb=b.pads.reduce((s,p)=>s+p.y,0)/b.pads.length;return Math.round(ca/5)-Math.round(cb/5)||a.pads[0].x-b.pads[0].x});
 const out=parts.map(p=>{count[p.prefix]=(count[p.prefix]||0)+1;const ref=p.prefix+count[p.prefix];
  const geo=componentFromPads(ref,p.pads.map(q=>({x:q.x,y:q.y,hole:q.hole,outline:q.outline})));
  return {ref,type:p.type,package:p.package,passive:!!p.passive,side:p.side,geo}});
 return {parts:out,notes};
}
