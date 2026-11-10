// Gerber (RS-274X with X2/X3 attributes) and Excellon drill parsing, layer identification, and the
// board model built from a fabrication set. Pure functions, no DOM: geometry comes out as drawable
// primitives in millimetres, which src/gerberRender.js paints onto the board surfaces.
//
// Primitive shapes (Gerber coordinates, Y up):
//   {k:'stroke',pts:[[x,y]...],w,pol}          round-capped polyline drawn with a circular aperture
//   {k:'poly',pts:[[x,y]...],pol}              filled polygon (flashes, swept rectangles, regions)
//   {k:'circle',x,y,r,pol}                     filled circle (round flashes, holes in apertures)
// pol is 'D' (dark, adds material) or 'C' (clear, removes it).

import {makePart,parsePlacementText,LIMITS} from './blueprint.js';
import {inferComponents} from './gerberInfer.js';

const MAX_OBJECTS=400000;
const r3=n=>{const v=Math.round(n*1000)/1000;return v===0?0:v};
const deg=Math.PI/180;
const rotPt=([x,y],a)=>{if(!a)return [x,y];const c=Math.cos(a*deg),s=Math.sin(a*deg);return [x*c-y*s,x*s+y*c]};

// --- Arithmetic for aperture macros (no eval) -----------------------------------------------------
export function evalExpr(src,vars){
 const s=String(src).replace(/\s+/g,'').replace(/[xX]/g,'*');let i=0;
 const peek=()=>s[i];
 const num=()=>{if(peek()==='$'){i++;let n='';while(/\d/.test(peek()||''))n+=s[i++];return vars[Number(n)]??0}let n='';while(/[\d.]/.test(peek()||''))n+=s[i++];if(!n)throw Error('Bad number in aperture macro: '+src);return Number(n)};
 const factor=()=>{if(peek()==='-'){i++;return -factor()}if(peek()==='+'){i++;return factor()}if(peek()==='('){i++;const v=expr();if(peek()===')')i++;return v}return num()};
 const term=()=>{let v=factor();while(peek()==='*'||peek()==='/'){const op=s[i++];const r=factor();v=op==='*'?v*r:v/r}return v};
 const expr=()=>{let v=term();while(peek()==='+'||peek()==='-'){const op=s[i++];const r=term();v=op==='+'?v+r:v-r}return v};
 const v=expr();return Number.isFinite(v)?v:0;
}

// Expands a macro body into primitives in the aperture's own frame (mm), for the given parameters.
function expandMacro(body,params,unit){
 const vars=[0,...params.map(Number)],out=[];
 for(const raw of body){
  const stmt=raw.trim();if(!stmt||stmt[0]==='0')continue;
  const asg=/^\$(\d+)=(.+)$/.exec(stmt);if(asg){vars[Number(asg[1])]=evalExpr(asg[2],vars);continue}
  const f=stmt.split(',').map(t=>t.trim());const code=Number(f[0]);const v=k=>evalExpr(f[k]??'0',vars);
  const pol=v(1)===0?'C':'D';
  if(code===1){const d=v(2)*unit,c=rotPt([v(3)*unit,v(4)*unit],f.length>5?v(5):0);out.push({k:'circle',x:c[0],y:c[1],r:d/2,pol})}
  else if(code===20||code===2){const w=v(2)*unit,a=[v(3)*unit,v(4)*unit],b=[v(5)*unit,v(6)*unit],rot=v(7);const L=Math.hypot(b[0]-a[0],b[1]-a[1])||1e-9,nx=-(b[1]-a[1])/L*w/2,ny=(b[0]-a[0])/L*w/2;
   out.push({k:'poly',pts:[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]].map(p=>rotPt(p,rot)),pol})}
  else if(code===21){const w=v(2)*unit,h=v(3)*unit,cx=v(4)*unit,cy=v(5)*unit,rot=v(6);out.push({k:'poly',pts:[[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]].map(p=>rotPt(p,rot)),pol})}
  else if(code===22){const w=v(2)*unit,h=v(3)*unit,x=v(4)*unit,y=v(5)*unit,rot=v(6);out.push({k:'poly',pts:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>rotPt(p,rot)),pol})}
  else if(code===4){const n=Math.round(v(2));const pts=[];for(let j=0;j<=n;j++)pts.push([v(3+j*2)*unit,v(4+j*2)*unit]);const rot=v(3+(n+1)*2);out.push({k:'poly',pts:pts.slice(0,-1).map(p=>rotPt(p,rot)),pol})}
  else if(code===5){const n=Math.max(3,Math.round(v(2))),cx=v(3)*unit,cy=v(4)*unit,r=v(5)*unit/2,rot=v(6);const pts=[];for(let j=0;j<n;j++){const a=j*360/n;pts.push(rotPt([cx+r*Math.cos(a*deg),cy+r*Math.sin(a*deg)],rot))}out.push({k:'poly',pts,pol})}
  else if(code===7){const c=[v(2)*unit,v(3)*unit],ro=v(4)*unit/2,ri=v(5)*unit/2,gap=v(6)*unit,rot=v(7);
   // Thermal: an annulus split by a cross-shaped gap, as four quarter-ring polygons.
   for(let q=0;q<4;q++){const pts=[];const a0=q*90,a1=a0+90;const half=Math.asin(Math.min(1,gap/2/Math.max(ri,1e-6)))/deg,halfO=Math.asin(Math.min(1,gap/2/Math.max(ro,1e-6)))/deg;
    for(let a=a0+halfO;a<=a1-halfO+1e-9;a+=Math.max(2,(90-2*halfO)/12))pts.push([c[0]+ro*Math.cos(a*deg),c[1]+ro*Math.sin(a*deg)]);
    for(let a=a1-half;a>=a0+half-1e-9;a-=Math.max(2,(90-2*half)/12))pts.push([c[0]+ri*Math.cos(a*deg),c[1]+ri*Math.sin(a*deg)]);
    if(pts.length>2)out.push({k:'poly',pts:pts.map(p=>rotPt(p,rot)),pol:'D'})}}
  else if(code===6){const c=[v(1)*unit,v(2)*unit],od=v(3)*unit,th=v(4)*unit,gap=v(5)*unit,max=Math.round(v(6)),cw=v(7)*unit,cl=v(8)*unit,rot=v(9);
   let r=od/2;for(let n=0;n<max&&r>0;n++){out.push({k:'ring',x:c[0],y:c[1],r,w:th,pol:'D'});r-=th+gap}
   out.push({k:'poly',pts:[[-cl/2,-cw/2],[cl/2,-cw/2],[cl/2,cw/2],[-cl/2,cw/2]].map(p=>rotPt([p[0]+c[0],p[1]+c[1]],rot)),pol:'D'},{k:'poly',pts:[[-cw/2,-cl/2],[cw/2,-cl/2],[cw/2,cl/2],[-cw/2,cl/2]].map(p=>rotPt([p[0]+c[0],p[1]+c[1]],rot)),pol:'D'})}
 }
 return out;
}

// Standard apertures as primitives in their own frame (mm).
function standardShape(type,p){
 const hole=p=>p>0?[{k:'circle',x:0,y:0,r:p/2,pol:'C'}]:[];
 if(type==='C')return [{k:'circle',x:0,y:0,r:p[0]/2,pol:'D'},...hole(p[1])];
 if(type==='R'){const [w,h]=p;return [{k:'poly',pts:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],pol:'D'},...hole(p[2])]}
 if(type==='O'){const [w,h]=p;const r=Math.min(w,h)/2,pts=[];const seg=12;
  if(w>=h){for(let i=0;i<=seg;i++){const a=-90+i*180/seg;pts.push([w/2-r+r*Math.cos(a*deg),r*Math.sin(a*deg)])}for(let i=0;i<=seg;i++){const a=90+i*180/seg;pts.push([-w/2+r+r*Math.cos(a*deg),r*Math.sin(a*deg)])}}
  else{for(let i=0;i<=seg;i++){const a=i*180/seg;pts.push([r*Math.cos(a*deg),h/2-r+r*Math.sin(a*deg)])}for(let i=0;i<=seg;i++){const a=180+i*180/seg;pts.push([r*Math.cos(a*deg),-h/2+r+r*Math.sin(a*deg)])}}
  return [{k:'poly',pts,pol:'D'},...hole(p[2])]}
 if(type==='P'){const d=p[0],n=Math.max(3,Math.round(p[1]||3)),rot=p[2]||0,pts=[];for(let i=0;i<n;i++){const a=rot+i*360/n;pts.push([d/2*Math.cos(a*deg),d/2*Math.sin(a*deg)])}return [{k:'poly',pts,pol:'D'},...hole(p[3])]}
 return [];
}

// Outline points of an aperture (for sweeping it along a line and for pad sizes).
function shapePoints(shape){
 const pts=[];for(const s of shape){if(s.pol!=='D')continue;
  if(s.k==='circle'||s.k==='ring')for(let i=0;i<16;i++){const a=i*22.5*deg;pts.push([s.x+s.r*Math.cos(a),s.y+s.r*Math.sin(a)])}
  else pts.push(...s.pts)}
 return pts;
}
function hull(points){
 const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];
 for(const q of p){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q)}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cross(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q)}
 up.pop();lo.pop();return lo.concat(up);
}

// Arc from a to b around centre c. cw=true for G02. Full circle when a equals b.
function arcPts(a,b,c,cw){
 const r=Math.hypot(a[0]-c[0],a[1]-c[1]);let a0=Math.atan2(a[1]-c[1],a[0]-c[0]),a1=Math.atan2(b[1]-c[1],b[0]-c[0]);
 let sweep=a1-a0;if(cw){if(sweep>=-1e-9)sweep-=2*Math.PI}else if(sweep<=1e-9)sweep+=2*Math.PI;
 if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)sweep=cw?-2*Math.PI:2*Math.PI;
 const n=Math.max(2,Math.min(180,Math.ceil(Math.abs(sweep)/(5*deg))+Math.ceil(r*Math.abs(sweep)/1.5)));const pts=[];
 for(let i=1;i<=n;i++){const t=a0+sweep*i/n;pts.push([c[0]+r*Math.cos(t),c[1]+r*Math.sin(t)])}
 pts[pts.length-1]=[b[0],b[1]];return pts;
}

// Attribute names start with a dot (.P, .C, .AperFunction); the dot is dropped so lookups read attrs.P.
const parseAttr=s=>{s=s.replace(/^\./,'');const parts=[];let cur='';for(let i=0;i<s.length;i++){if(s[i]==='\\'&&/[0-9a-fA-F]{4}/.test(s.slice(i+2,i+6))&&s[i+1]==='u'){cur+=String.fromCharCode(parseInt(s.slice(i+2,i+6),16));i+=5}else if(s[i]===','){parts.push(cur);cur=''}else cur+=s[i]}parts.push(cur);return parts};

// --- Gerber --------------------------------------------------------------------------------------
export function parseGerber(text,name='layer.gbr'){
 const src=String(text);const objects=[],flashes=[],warnings=new Set();
 let fmt={xi:2,xd:4,yi:2,yd:4,zeros:'L',abs:true},unit=25.4,unitSet=false;const apertures=new Map(),macros=new Map();
 let cur=null,x=0,y=0,interp='G01',quadrant='multi',pol='D',region=null,contour=null,stroke=null,sr=null;
 const fileAttrs={},objAttrs={},aperAttrs={};let offset=[0,0];
 const flushStroke=()=>{if(stroke&&stroke.pts.length>1)push(stroke);stroke=null};
 const push=o=>{if(objects.length>=MAX_OBJECTS){warnings.add('Layer has more than '+MAX_OBJECTS+' shapes; the rest were skipped.');return}objects.push(o)};
 const coord=(v,int,dec)=>{if(v==null)return null;if(/[.]/.test(v))return Number(v)*unit;const neg=v[0]==='-';let d=v.replace(/^[+-]/,'');
  if(fmt.zeros==='T'){d=d.padEnd(int+dec,'0')}return (neg?-1:1)*Number(d)/Math.pow(10,dec)*unit};
 const flushContour=()=>{if(contour&&contour.length>2)push({k:'poly',pts:contour,pol,region:true});contour=null};
 const draw=(tx,ty,ci,cj)=>{
  const from=[x,y],to=[tx,ty];let pts=[to];
  if(interp!=='G01'){
   let c;
   if(quadrant==='multi')c=[x+(ci||0),y+(cj||0)];
   else{const cands=[];for(const sx of [1,-1])for(const sy of [1,-1]){const cc=[x+sx*Math.abs(ci||0),y+sy*Math.abs(cj||0)];const r1=Math.hypot(from[0]-cc[0],from[1]-cc[1]),r2=Math.hypot(to[0]-cc[0],to[1]-cc[1]);let sw=Math.atan2(to[1]-cc[1],to[0]-cc[0])-Math.atan2(from[1]-cc[1],from[0]-cc[0]);if(interp==='G02'){if(sw>0)sw-=2*Math.PI}else if(sw<0)sw+=2*Math.PI;cands.push({cc,err:Math.abs(r1-r2)+(Math.abs(sw)>Math.PI/2+1e-3?1e3:0)})}c=cands.sort((a,b)=>a.err-b.err)[0].cc}
   pts=arcPts(from,to,c,interp==='G02');if(quadrant!=='multi'&&Math.hypot(from[0]-to[0],from[1]-to[1])<1e-6)pts=[to];
  }
  if(region){if(!contour)contour=[from];contour.push(...pts);return}
  const ap=apertures.get(cur);if(!ap){warnings.add('Drawing with an undefined aperture');return}
  if(ap.round){const w=ap.size;if(stroke&&stroke.w===w&&stroke.pol===pol&&stroke.aper===cur){stroke.pts.push(...pts)}else{flushStroke();stroke={k:'stroke',pts:[from,...pts],w,pol,aper:cur,attrs:{...objAttrs},af:ap.attrs.AperFunction}}}
  else{flushStroke();const sp=shapePoints(ap.shape);let prev=from;for(const p of pts){push({k:'poly',pts:hull([...sp.map(q=>[q[0]+prev[0],q[1]+prev[1]]),...sp.map(q=>[q[0]+p[0],q[1]+p[1]])]),pol,attrs:{...objAttrs}});prev=p}}
 };
 const flash=(fx,fy)=>{flushStroke();const ap=apertures.get(cur);if(!ap){warnings.add('Flashing an undefined aperture');return}
  const shapes=ap.shape.map(s=>s.k==='poly'?{...s,pts:s.pts.map(([px,py])=>[px+fx,py+fy])}:{...s,x:s.x+fx,y:s.y+fy});
  for(const s of shapes)push({...s,pol:s.pol==='C'?(pol==='D'?'C':'D'):pol});
  flashes.push({x:fx,y:fy,aper:cur,shape:shapes,af:ap.attrs.AperFunction||'',attrs:{...objAttrs}});
 };
 const handleExtended=block=>{
  const cmds=block.split('*').map(s=>s.replace(/[\r\n]/g,'')).filter(Boolean);if(!cmds.length)return;
  const head=cmds[0];
  if(head.startsWith('AM')){macros.set(head.slice(2),cmds.slice(1));return}
  for(const c of cmds){
   if(c.startsWith('FS')){const m=/FS([LTD]?)([AI]?)X(\d)(\d)Y(\d)(\d)/.exec(c);if(m){fmt={zeros:m[1]==='T'?'T':'L',abs:m[2]!=='I',xi:+m[3],xd:+m[4],yi:+m[5],yd:+m[6]};if(m[2]==='I')warnings.add('Incremental coordinates are not supported.')}}
   else if(c.startsWith('MO')){unit=c.slice(2,4)==='MM'?1:25.4;unitSet=true}
   else if(c.startsWith('AD')){const m=/^ADD(\d+)([A-Za-z_.$][\w.$-]*?)(?:,(.*))?$/.exec(c);if(!m)continue;const [,code,type,args]=m;const params=args?args.split(/[xX]/).map(Number):[];
    let shape;if(['C','R','O','P'].includes(type)){const p=type==='P'?[params[0]*unit,params[1],params[2]||0,(params[3]||0)*unit]:params.map(n=>n*unit);shape=standardShape(type,p)}
    else if(macros.has(type))shape=expandMacro(macros.get(type),params,unit);
    else{warnings.add('Unknown aperture '+type);shape=[{k:'circle',x:0,y:0,r:(params[0]||.1)*unit/2,pol:'D'}]}
    const round=type==='C'&&!(params[1]>0);
    apertures.set('D'+Number(code),{type,shape,round,size:round?params[0]*unit:0,attrs:{...aperAttrs}})}
   else if(c.startsWith('LP')){flushStroke();pol=c[2]==='C'?'C':'D'}
   else if(c.startsWith('SR')){flushStroke();const m=/SR(?:X(\d+))?(?:Y(\d+))?(?:I([\d.]+))?(?:J([\d.]+))?/.exec(c);
    if(sr){repeatBlock(sr)}sr=m&&(m[1]||m[2])?{nx:+(m[1]||1),ny:+(m[2]||1),dx:+(m[3]||0)*unit,dy:+(m[4]||0)*unit,start:objects.length,fstart:flashes.length}:null}
   else if(c.startsWith('OF')){const m=/OF(?:A([-\d.]+))?(?:B([-\d.]+))?/.exec(c);offset=[(+(m?.[1]||0))*unit,(+(m?.[2]||0))*unit]}
   else if(c.startsWith('TF')){const [k,...v]=parseAttr(c.slice(2));fileAttrs[k]=v}
   else if(c.startsWith('TA')){const [k,...v]=parseAttr(c.slice(2));aperAttrs[k]=v.join(',')}
   else if(c.startsWith('TO')){const [k,...v]=parseAttr(c.slice(2));objAttrs[k]=v}
   else if(c.startsWith('TD')){const k=c.slice(2).replace(/^\./,'');if(!k){for(const a of Object.keys(objAttrs))delete objAttrs[a];for(const a of Object.keys(aperAttrs))delete aperAttrs[a]}else{delete objAttrs[k];delete aperAttrs[k]}}
   else if(/^(LM|LR|LS)/.test(c)){if(!/^LMN|^LR0(\.0*)?$|^LS1(\.0*)?$/.test(c))warnings.add('Mirrored, rotated or scaled apertures (LM/LR/LS) are drawn unmodified.')}
   else if(c.startsWith('IP')&&/NEG/.test(c))warnings.add('Negative image polarity is drawn as positive.');
  }
 };
 const repeatBlock=b=>{const objs=objects.slice(b.start),fl=flashes.slice(b.fstart);
  for(let i=0;i<b.nx;i++)for(let j=0;j<b.ny;j++){if(!i&&!j)continue;const ox=i*b.dx,oy=j*b.dy,mv=o=>o.pts?{...o,pts:o.pts.map(([px,py])=>[px+ox,py+oy])}:{...o,x:o.x+ox,y:o.y+oy};
   for(const o of objs)push(mv(o));for(const f of fl)flashes.push({...f,x:f.x+ox,y:f.y+oy,shape:f.shape.map(mv)})}};
 // Tokenise: %...% extended blocks, otherwise '*'-terminated words.
 let i=0;const n=src.length;
 while(i<n){
  const ch=src[i];
  if(ch==='%'){const end=src.indexOf('%',i+1);if(end<0)break;handleExtended(src.slice(i+1,end));i=end+1;continue}
  if(/\s/.test(ch)){i++;continue}
  const end=src.indexOf('*',i);if(end<0)break;let w=src.slice(i,end).replace(/\s+/g,'');i=end+1;
  if(!w)continue;
  if(w.startsWith('G04')||w.startsWith('G4 '))continue;
  if(/^M0?2$/.test(w)||w==='M00'||w==='M01')break;
  let g;while((g=/^G0*(\d+)/.exec(w))){const code=Number(g[1]);w=w.slice(g[0].length);
   if(code===1)interp='G01';else if(code===2)interp='G02';else if(code===3)interp='G03';
   else if(code===74)quadrant='single';else if(code===75)quadrant='multi';
   else if(code===36){flushStroke();region=true;contour=null}else if(code===37){flushContour();region=false}
   else if(code===70){unit=25.4;unitSet=true}else if(code===71){unit=1;unitSet=true}
   else if(code===54||code===55){}else if(code===4){w='';break}}
  if(!w)continue;
  const sel=/^D0*(\d+)$/.exec(w);if(sel&&Number(sel[1])>=10){flushStroke();cur='D'+Number(sel[1]);continue}
  const m=/^(?:X([+-]?[\d.]+))?(?:Y([+-]?[\d.]+))?(?:I([+-]?[\d.]+))?(?:J([+-]?[\d.]+))?(?:D0*([123]))?$/.exec(w);
  if(!m){continue}
  const nx=m[1]!=null?coord(m[1],fmt.xi,fmt.xd)+offset[0]:x,ny=m[2]!=null?coord(m[2],fmt.yi,fmt.yd)+offset[1]:y;
  const ci=m[3]!=null?coord(m[3],fmt.xi,fmt.xd):0,cj=m[4]!=null?coord(m[4],fmt.yi,fmt.yd):0;
  const d=m[5]?Number(m[5]):(m[1]!=null||m[2]!=null?1:null);
  if(d===1)draw(nx,ny,ci,cj);
  else if(d===2){flushStroke();if(region){flushContour();contour=[[nx,ny]]}}
  else if(d===3)flash(nx,ny);
  x=nx;y=ny;
 }
 flushStroke();flushContour();if(sr)repeatBlock(sr);
 if(!unitSet)warnings.add('No unit set (MO); assumed inches.');
 return {name,objects,flashes,fileAttrs,warnings:[...warnings]};
}

// --- Excellon drill ----------------------------------------------------------------------------
export function parseExcellon(text,name='drill.drl'){
 const lines=String(text).split(/\r?\n/);const tools=new Map(),hits=[],slots=[],warnings=new Set();
 let unit=25.4,zeros='L',intD=2,decD=4,fmtSet=false,tool=null,x=0,y=0,header=false,plated=!/npth|non.?plated/i.test(name);
 const setUnit=(u,z,f)=>{unit=u;if(z)zeros=z;if(!fmtSet){[intD,decD]=u===1?[3,3]:[2,4]}if(f){const m=/(\d+)\.(\d+)/.exec(f.replace(/0/g,'0'));if(m){intD=m[1].length;decD=m[2].length;fmtSet=true}}};
 const num=v=>{if(v==null)return null;if(v.includes('.'))return Number(v)*unit;const neg=v[0]==='-';let d=v.replace(/^[+-]/,'');if(zeros==='L')d=d.padEnd(intD+decD,'0');return (neg?-1:1)*Number(d)/Math.pow(10,decD)*unit};
 for(let raw of lines){
  const line=raw.trim();if(!line)continue;
  if(line.startsWith(';')){const f=/FILE_FORMAT\s*=\s*(\d+):(\d+)/i.exec(line);if(f){intD=+f[1];decD=+f[2];fmtSet=true}
   if(/TF\.FileFunction.*NonPlated|TYPE=NON_PLATED/i.test(line))plated=false;if(/TYPE=PLATED/i.test(line)&&!/NON_PLATED/i.test(line))plated=true;continue}
  if(line==='M48'){header=true;continue}
  if(line==='%'||line==='M95'){header=false;continue}
  const u=/^(METRIC|INCH)(?:,(LZ|TZ))?(?:,([0.]+))?/i.exec(line);if(u){setUnit(/METRIC/i.test(u[1])?1:25.4,u[2]?(u[2].toUpperCase()==='LZ'?'L':'T'):null,u[3]);continue}
  if(line==='M71'){setUnit(1);continue}if(line==='M72'){setUnit(25.4);continue}
  const td=/^T0*(\d+)(?:[FS][\d.]+)*C([\d.]+)/i.exec(line);if(td){tools.set(+td[1],Number(td[2])*unit);continue}
  if(/^M30|^M00/.test(line))break;
  const sel=/^T0*(\d+)$/.exec(line);if(sel){tool=+sel[1];continue}
  if(header)continue;
  if(/G85/.test(line)){const m=/X([+-]?[\d.]+)?(?:Y([+-]?[\d.]+))?G85(?:X([+-]?[\d.]+))?(?:Y([+-]?[\d.]+))?/.exec(line);if(m){const x1=m[1]!=null?num(m[1]):x,y1=m[2]!=null?num(m[2]):y,x2=m[3]!=null?num(m[3]):x1,y2=m[4]!=null?num(m[4]):y1;slots.push({x1,y1,x2,y2,d:tools.get(tool)||.8,plated});x=x2;y=y2}continue}
  const c=/^(?:G0?[015])?X([+-]?[\d.]+)?(?:Y([+-]?[\d.]+))?$|^(?:G0?[015])?Y([+-]?[\d.]+)$/.exec(line);
  if(c){const nx=c[1]!=null?num(c[1]):x,ny=c[2]!=null?num(c[2]):(c[3]!=null?num(c[3]):y);x=nx;y=ny;if(!/^G0?0/.test(line))hits.push({x,y,d:tools.get(tool)||.8,plated});continue}
  if(/^G0?[0-3](?=[XY])|^M1[56]\b/.test(line))warnings.add('Routed (milled) drill paths are not drawn.');
 }
 return {name,hits,slots,plated,warnings:[...warnings]};
}

// --- Layer identification ----------------------------------------------------------------------
export function identifyLayer(name,text=''){
 const lower=String(name).toLowerCase(),base=lower.split('/').pop(),ext=(base.match(/\.([a-z0-9]+)$/)||[])[1]||'';
 const head=String(text).slice(0,4000);
 const ff=/%TF\.FileFunction,([^*]+)\*%/.exec(head)?.[1]?.split(',')||(/TF\.FileFunction,([^\s*]+)/.exec(head)?.[1]?.split(','));
 const isDrill=/^\s*(%\s*)?M48/m.test(head.slice(0,400))||/^;.*(drill|excellon)/im.test(head.slice(0,400))&&/^T\d+C/m.test(head);
 const isGerber=/%FS[LTD]?[AI]?X\d\dY\d\d/.test(head)||/%MO(MM|IN)\*%/.test(head);
 if(isDrill||['drl','xln','exc','drd','drill','tap','nc'].includes(ext)&&!isGerber)return {kind:'drill',side:'all',plated:!/npth|non.?plated/.test(base)};
 if(ff&&isGerber){
  const [fn,...rest]=ff;const side=rest.includes('Bot')?'bottom':rest.includes('Top')?'top':rest.includes('Inr')?'inner':'all';
  if(fn==='Copper')return {kind:'copper',side};if(fn==='Soldermask')return {kind:'mask',side};if(fn==='Legend')return {kind:'silk',side};
  if(fn==='Paste')return {kind:'paste',side};if(fn==='Profile')return {kind:'outline',side:'all'};if(fn==='Component')return {kind:'component',side};
  if(/Plated|NonPlated/.test(fn))return {kind:'drill',side:'all',plated:fn==='Plated'};
 }
 if(!isGerber){
  if(['pos','xy','mnt','mnb'].includes(ext)||/(pick.?(and|n|&)?.?place|centroid|pnp|position|insert|placement|cpl)/.test(base)&&/\.(csv|txt|tsv)$/.test(base))return {kind:'pnp',side:/mnb$|bot/.test(base)?'bottom':'all'};
  if(/\.(csv|txt|tsv)$/.test(base)&&/(bom|bill)/.test(base))return {kind:'bom',side:'all'};
  return {kind:'unknown',side:'all'};
 }
 const byExt={gtl:['copper','top'],gbl:['copper','bottom'],cmp:['copper','top'],sol:['copper','bottom'],top:['copper','top'],bot:['copper','bottom'],
  gts:['mask','top'],gbs:['mask','bottom'],stc:['mask','top'],sts:['mask','bottom'],smt:['mask','top'],smb:['mask','bottom'],
  gto:['silk','top'],gbo:['silk','bottom'],plc:['silk','top'],pls:['silk','bottom'],sst:['silk','top'],ssb:['silk','bottom'],
  gtp:['paste','top'],gbp:['paste','bottom'],crc:['paste','top'],crs:['paste','bottom'],spt:['paste','top'],spb:['paste','bottom'],
  gko:['outline','all'],gm1:['outline','all'],gml:['outline','all'],oln:['outline','all'],out:['outline','all'],dim:['outline','all'],bor:['outline','all']};
 const stem=base.replace(/\.[a-z0-9]+$/,''),n=stem.replace(/[\s_.-]+/g,''),spaced=' '+stem.replace(/[\s_.-]+/g,' ')+' ';
 const tests=[
  [/edgecuts|boardoutline|outline|profile|keepout|mechanical1\b|\bmech1/,'outline','all'],
  [/fcu$|topcopper|copper(layer)?top|toplayer|^top$|copperl1$|layer1$/,'copper','top'],[/bcu$|bottomcopper|copper(layer)?bottom|bottomlayer|^bottom$/,'copper','bottom'],
  [/in\d+cu$|inner\d|innerlayer|copperl\d+$/,'copper','inner'],
  [/fmask|topsoldermask|soldermasktop|topmask|masktop|\btsm\b/,'mask','top'],[/bmask|bottomsoldermask|soldermaskbottom|bottommask|maskbottom|\bbsm\b/,'mask','bottom'],
  [/fsilks?|fsilkscreen|topsilk|silkscreentop|silktop|toplegend|legendtop|topoverlay|\btsk\b/,'silk','top'],[/bsilks?|bsilkscreen|bottomsilk|silkscreenbottom|silkbottom|bottomlegend|legendbottom|bottomoverlay|\bbsk\b/,'silk','bottom'],
  [/fpaste|toppaste|pastetop|topcream/,'paste','top'],[/bpaste|bottompaste|pastebottom|bottomcream/,'paste','bottom']];
 if(byExt[ext])return {kind:byExt[ext][0],side:byExt[ext][1]};
 if(/^g\d+$|^gl\d+$|^g\d+l$|^gp\d+$/.test(ext))return {kind:'copper',side:'inner'};
 for(const [re,kind,side] of tests)if(re.test(n)||re.test(spaced.trim()))return {kind,side};
 if(/ (top|f) /.test(spaced)&&/ (cu|copper) /.test(spaced))return {kind:'copper',side:'top'};if(/ (bottom|bot|b) /.test(spaced)&&/ (cu|copper) /.test(spaced))return {kind:'copper',side:'bottom'};
 return {kind:'unknown',side:'all'};
}

// --- Geometry helpers --------------------------------------------------------------------------
const objPoints=o=>o.k==='circle'||o.k==='ring'?[[o.x-o.r,o.y-o.r],[o.x+o.r,o.y+o.r]]:o.pts;
export function boundsOf(objects){let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const o of objects){const pad=o.k==='stroke'?o.w/2:0;for(const [x,y] of objPoints(o)){if(x-pad<a)a=x-pad;if(x+pad>c)c=x+pad;if(y-pad<b)b=y-pad;if(y+pad>d)d=y+pad}}return Number.isFinite(a)?{minX:a,minY:b,maxX:c,maxY:d}:null}
const polyArea=pts=>{let s=0;for(let i=0;i<pts.length;i++){const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length];s+=x1*y2-x2*y1}return s/2};

// Joins outline segments into closed loops, tolerating small gaps between ends.
export function chainOutline(segs,tol=.05){
 // Ends are indexed in a grid of tolerance-sized cells, so chaining stays fast on busy silkscreen layers.
 const used=new Array(segs.length).fill(false),loops=[];const d=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
 const cell=Math.max(tol,1e-3),key=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell),index=new Map();
 const add=(p,i,end)=>{const k=key(p[0],p[1]);if(!index.has(k))index.set(k,[]);index.get(k).push([i,end])};
 segs.forEach((s,i)=>{add(s[0],i,0);add(s[s.length-1],i,1)});
 const near=p=>{const cx=Math.floor(p[0]/cell),cy=Math.floor(p[1]/cell),out=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const e of index.get((cx+dx)+','+(cy+dy))||[])out.push(e);return out};
 for(let i=0;i<segs.length;i++){if(used[i])continue;used[i]=true;const loop=[...segs[i]];let guard=0;
  while(guard++<segs.length+2){const tail=loop[loop.length-1];if(loop.length>3&&d(tail,loop[0])<=tol)break;
   let best=-1,flip=false,bd=tol;for(const [j,end] of near(tail)){if(used[j])continue;const s=segs[j];const dd=d(end?s[s.length-1]:s[0],tail);if(dd<=bd){bd=dd;best=j;flip=!!end}}
   if(best<0)break;used[best]=true;const s=flip?[...segs[best]].reverse():segs[best];loop.push(...s.slice(1))}
  if(loop.length>3&&d(loop[0],loop[loop.length-1])<=tol){loop.pop();loops.push(loop)}}
 return loops.sort((a,b)=>Math.abs(polyArea(b))-Math.abs(polyArea(a)));
}

// --- Components from pads ----------------------------------------------------------------------
const naturalCmp=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
// Pads carry (x,y) in board coordinates (mm, Y down) and their outline points.
export function componentFromPads(ref,pads,{rot=null,center=null}={}){
 const cx0=pads.reduce((s,p)=>s+p.x,0)/pads.length,cy0=pads.reduce((s,p)=>s+p.y,0)/pads.length;
 let theta=0;
 if(pads.length===2){theta=Math.atan2(-(pads[1].y-pads[0].y),pads[1].x-pads[0].x)/deg}
 else if(pads.length>2){let sx=0,sy=0;for(const p of pads){let best=null,bd=Infinity;for(const q of pads){if(q===p)continue;const dd=Math.hypot(q.x-p.x,q.y-p.y);if(dd>1e-6&&dd<bd){bd=dd;best=q}}if(!best)continue;const a=Math.atan2(-(best.y-p.y),best.x-p.x)*4;sx+=Math.cos(a);sy+=Math.sin(a)}theta=Math.hypot(sx,sy)>1e-6?Math.atan2(sy,sx)/4/deg:0}
 theta=((theta%180)+180)%180;if(pads.length!==2)theta=theta%90;
 for(const snap of [0,90,180])if(Math.abs(theta-snap)<.5)theta=snap%180;
 if(rot!=null){const r=((rot%360)+360)%360;const diff=((r-theta)%90+90)%90;if(diff<3||diff>87)theta=r}
 const c=Math.cos(theta*deg),s=Math.sin(theta*deg);const toLocal=(x,y)=>[(x-cx0)*c-(y-cy0)*s,(x-cx0)*s+(y-cy0)*c];
 const local=pads.map(p=>{const [lx,ly]=toLocal(p.x,p.y);let a=Infinity,b=Infinity,cc=-Infinity,dd=-Infinity;for(const [px,py] of p.outline){const [qx,qy]=toLocal(px,py);a=Math.min(a,qx);cc=Math.max(cc,qx);b=Math.min(b,qy);dd=Math.max(dd,qy)}return {x:lx,y:ly,w:Math.max(.05,cc-a),h:Math.max(.05,dd-b),hole:p.hole||0}});
 const axis=(key,dim)=>{const vals=local.map(p=>p[key]);const min=Math.min(...vals),max=Math.max(...vals),span=max-min;const distinct=[...new Set(vals.map(v=>Math.round(v*20)))].length;
  const dims=local.map(p=>p[dim]).sort((a,b)=>a-b),med=dims[dims.length>>1];const atMin=vals.filter(v=>Math.abs(v-min)<.05).length;
  if(pads.length===2)return null;
  if(distinct<=2||atMin>=3)return Math.max(.6,span-.9*med,span<.05?med*1.5:0);
  return span+span/(distinct-1)*.6};
 let w,d;
 if(pads.length===2){const dx=Math.abs(local[0].x-local[1].x),dy=Math.abs(local[0].y-local[1].y),alongX=dx>=dy;
  const along=alongX?dx:dy,padAlong=Math.max(...local.map(p=>alongX?p.w:p.h)),padPerp=Math.max(...local.map(p=>alongX?p.h:p.w));
  const L=Math.max(.4,along+padAlong*.2),S=Math.max(.3,padPerp*.85);w=alongX?L:S;d=alongX?S:L}
 else if(pads.length===1){w=Math.max(.6,local[0].w*1.3);d=Math.max(.6,local[0].h*1.3)}
 else{w=axis('x','w');d=axis('y','h')}
 const bx=(Math.min(...local.map(p=>p.x))+Math.max(...local.map(p=>p.x)))/2,by=(Math.min(...local.map(p=>p.y))+Math.max(...local.map(p=>p.y)))/2;
 let cx=cx0+bx*c+by*s,cy=cy0-bx*s+by*c,ox=bx,oy=by;
 // A known body centre (placement file or component layer) wins over the pad centre: connectors and
 // modules often have their pins off to one side of the body.
 if(center){cx=center[0];cy=center[1];[ox,oy]=toLocal(cx,cy)}
 return {ref,x:cx,y:cy,rot:theta,w,d,pads:local.map(p=>({x:r3(p.x-ox),y:r3(p.y-oy),w:r3(p.w),h:r3(p.h),rot:0,shape:'rect',...(p.hole?{hole:r3(p.hole)}:{})})),tht:local.some(p=>p.hole>0)};
}

// --- Board assembly ------------------------------------------------------------------------------
// files: [{name,text}]. Returns {board, layers, warnings, summary} where `layers` holds the
// drawable primitives (board coordinates) for the surface renderer, and `board` is the usual model.
export function buildGerberBoard(files,{name}={}){
 const warnings=[],layers={},drills=[],pnpFiles=[],unknown=[];let copperCount=0;
 for(const f of files){
  const id=identifyLayer(f.name,f.text);
  if(id.kind==='drill'){const d=parseExcellon(f.text,f.name);if(id.plated===false)d.plated=false;drills.push(d);d.warnings.forEach(w=>warnings.push(f.name+': '+w));continue}
  if(id.kind==='pnp'){pnpFiles.push({...f,side:id.side});continue}
  if(id.kind==='unknown'||id.kind==='bom'){unknown.push(f.name);continue}
  const g=parseGerber(f.text,f.name);g.warnings.forEach(w=>warnings.push(f.name+': '+w));
  const key=id.kind+':'+id.side;if(id.kind==='copper')copperCount++;
  if(layers[key]){layers[key].objects.push(...g.objects);layers[key].flashes.push(...g.flashes);layers[key].names.push(f.name)}else layers[key]={...id,objects:g.objects,flashes:g.flashes,names:[f.name],fileAttrs:g.fileAttrs};
 }
 if(!layers['copper:top']&&!layers['copper:bottom']&&!layers['outline:all'])throw Error('No Gerber copper or outline layer found. Add the .gtl/.gbl (or F_Cu/B_Cu) and board outline files, or a ZIP of the whole set.');
 // Outline: centre lines of strokes, plus region contours.
 let outline=null,holes=[];const ol=layers['outline:all'];
 if(ol){const segs=[];for(const o of ol.objects){if(o.k==='stroke')for(let i=1;i<o.pts.length;i++)segs.push([o.pts[i-1],o.pts[i]]);else if(o.k==='poly'&&o.region)segs.push([...o.pts,o.pts[0]])}
  const loops=chainOutline(segs);if(loops.length){outline=loops[0];holes=loops.slice(1,60).filter(l=>Math.abs(polyArea(l))>.5)}
  else{warnings.push('The outline layer is not a closed shape; using its bounding box.');const b=boundsOf(ol.objects);if(b)outline=[[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]]}}
 if(!outline){const all=Object.values(layers).flatMap(l=>l.objects);const b=boundsOf(all);if(!b)throw Error('The Gerber files contain no drawable shapes.');const m=1;outline=[[b.minX-m,b.minY-m],[b.maxX+m,b.minY-m],[b.maxX+m,b.maxY+m],[b.minX-m,b.maxY+m]];warnings.push('No board outline layer found; the board is the copper extent plus 1 mm.')}
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const [x,y] of outline){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2,W=maxX-minX,H=maxY-minY;
 if(W<1||H<1||W>2000||H>2000)throw Error(`Board size ${W.toFixed(1)} × ${H.toFixed(1)} mm looks wrong. Check the outline layer and units.`);
 // Board coordinates: centred on the outline, Y down.
 const T=([x,y])=>[r3(x-cx),r3(cy-y)];
 const tObj=o=>o.k==='circle'||o.k==='ring'?{...o,x:o.x-cx,y:cy-o.y}:{...o,pts:o.pts.map(([x,y])=>[x-cx,cy-y])};
 const out={};for(const [key,l] of Object.entries(layers))out[key]={kind:l.kind,side:l.side,names:l.names,objects:l.objects.map(tObj)};
 const holeList=[];for(const d of drills){for(const h of d.hits)holeList.push({x:h.x-cx,y:cy-h.y,d:h.d,plated:d.plated});for(const s of d.slots)holeList.push({x:s.x1-cx,y:cy-s.y1,x2:s.x2-cx,y2:cy-s.y2,d:s.d,plated:d.plated,slot:true})}
 // Large non-plated holes become real cut-outs in the 3D slab.
 const cut=holeList.filter(h=>!h.slot&&h.d>=2).slice(0,60).map(h=>{const pts=[];for(let i=0;i<32;i++){const a=i/32*2*Math.PI;pts.push([r3(h.x+h.d/2*Math.cos(a)),r3(h.y+h.d/2*Math.sin(a))])}return pts});
 // Components: X3 component layer > pick-and-place file > X2 pad attributes on copper.
 const padsByRef=new Map();
 for(const side of ['top','bottom']){const l=layers['copper:'+side];if(!l)continue;
  for(const f of l.flashes){const p=f.attrs.P?.[0]||f.attrs.C?.[0];if(!p)continue;const pin=f.attrs.P?.[1]||'';
   const [x,y]=[f.x-cx,cy-f.y];const entry=padsByRef.get(p)||{sides:new Set(),pads:[]};entry.sides.add(side);
   if(!entry.pads.some(q=>q.pin&&q.pin===pin&&Math.hypot(q.x-x,q.y-y)<.01||Math.hypot(q.x-x,q.y-y)<.01)){const hole=holeList.find(h=>!h.slot&&Math.hypot(h.x-x,h.y-y)<.05);entry.pads.push({x,y,pin,hole:hole?.d||0,outline:f.shape.flatMap(s=>s.pol==='D'?(s.k==='circle'?Array.from({length:8},(_,k)=>[s.x+s.r*Math.cos(k*Math.PI/4),s.y+s.r*Math.sin(k*Math.PI/4)]):s.pts):[]).map(([px,py])=>[px-cx,cy-py])})}
   padsByRef.set(p,entry)}}
 const meta=new Map();
 for(const side of ['top','bottom']){const l=layers['component:'+side];if(!l)continue;
  for(const f of l.flashes){const ref=f.attrs.C?.[0];if(!ref||!/ComponentMain/i.test(f.af))continue;meta.set(ref,{ref,x:f.x-cx,y:cy-f.y,side,rot:Number(f.attrs.CRot?.[0]),value:f.attrs.CVal?.[0]||'',mpn:f.attrs.CMPN?.[0]||'',package:f.attrs.CFtp?.[0]||f.attrs.CPgN?.[0]||'',h:Number(f.attrs.CHgt?.[0])||0,mfr:f.attrs.CMfr?.[0]||''})}}
 for(const pf of pnpFiles){try{const {parts:raw}=parsePlacementText(pf.text,pf.name,{raw:true});
  // Placement files may use another origin than the Gerbers. Prefer matching designators to pads, then
  // the file's own coordinates if they land on the board, and centre them only as a last resort.
  let dx=-cx,dy=cy,how='origin';const pairs=raw.map(p=>[p,padsByRef.get(p.ref)]).filter(([,e])=>e&&e.pads.length);
  const med=a=>{const s=[...a].sort((x,y)=>x-y);return s[s.length>>1]};
  if(pairs.length){const est=pairs.map(([p,e])=>{const c=componentFromPads(p.ref,e.pads);return [c.x-p.x,c.y-p.y]});dx=med(est.map(e=>e[0]));dy=med(est.map(e=>e[1]));how='pads'}
  else{const inside=raw.filter(p=>Math.abs(p.x+dx)<=W/2&&Math.abs(p.y+dy)<=H/2).length;
   if(inside<raw.length*.8){let a1=Infinity,b1=Infinity,c1=-Infinity,d1=-Infinity;for(const p of raw){a1=Math.min(a1,p.x);c1=Math.max(c1,p.x);b1=Math.min(b1,p.y);d1=Math.max(d1,p.y)}dx=-(a1+c1)/2;dy=-(b1+d1)/2;how='centred';
    warnings.push(pf.name+': its coordinates do not line up with the Gerber origin, so the parts were centred on the board. Check positions, or export the placement file with the same origin as the Gerbers.')}}
  for(const p of raw){const prev=meta.get(p.ref)||{};meta.set(p.ref,{...p,...prev,ref:p.ref,x:prev.x??(p.x+dx),y:prev.y??(p.y+dy),rot:Number.isFinite(prev.rot)?prev.rot:p.rot,value:prev.value||p.value,mpn:prev.mpn||p.mpn,package:prev.package||p.package,side:prev.side||p.side,h:prev.h||0,fromPnp:true,aligned:how})}
 }catch(e){warnings.push(pf.name+': '+e.message)}}
 const parts=[];const refs=new Set([...padsByRef.keys(),...meta.keys()]);
 for(const ref of [...refs].sort(naturalCmp)){
  if(parts.length>=LIMITS.parts){warnings.push(`More than ${LIMITS.parts} components; the rest were skipped.`);break}
  const e=padsByRef.get(ref),m=meta.get(ref)||{};
  if(/^(TP|FID|MH|H\d|REF\*\*|LOGO|G\*\*\*)/i.test(ref)&&!m.value)continue;
  const known=Number.isFinite(m.x)&&Number.isFinite(m.y)&&m.aligned!=='centred';
  let geo=e&&e.pads.length?componentFromPads(ref,e.pads,{rot:Number.isFinite(m.rot)?m.rot:null,center:known?[m.x,m.y]:null}):null;
  // Pin spread says little about the body of connectors, modules, switches and crystals: use the package size.
  const bodyFromPads=geo&&!/^(J|P|CN|CON|X|SW|S|K|BT|M|MOD|U?ANT|Y|XTAL)\d/i.test(ref);
  const side=m.side||(e?(e.sides.has('top')?'top':'bottom'):'top');
  const x=geo?geo.x:m.x,y=geo?geo.y:m.y;if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  parts.push(makePart({ref,value:m.value,mpn:m.mpn,package:m.package,x,y,rot:geo?geo.rot:(m.rot||0),side:e&&e.sides.size===1?[...e.sides][0]:side,w:bodyFromPads?geo.w:0,d:bodyFromPads?geo.d:0,h:m.h||undefined,pads:geo?.pads,leads:geo?.tht?'tht':undefined}));
 }
 const bounds={minX:-W/2,minY:-H/2,maxX:W/2,maxY:H/2};
 // No component data at all: infer the parts from pads (mask openings), drills and silkscreen.
 let inferred=0;
 if(!parts.length){const inf=inferComponents({layers:out,holes:holeList,bounds});inf.notes.forEach(n=>warnings.push(n));
  for(const c of inf.parts.slice(0,LIMITS.parts)){const tht=c.geo.tht;parts.push({...makePart({ref:c.ref,type:c.type,package:c.package,x:c.geo.x,y:c.geo.y,rot:c.geo.rot,side:c.side,w:c.geo.w,d:c.geo.d,pads:c.geo.pads,leads:tht?'tht':undefined}),inferred:true,passive:c.passive})}
  inferred=parts.length}
 const fileName=name||files[0]?.name||'gerber';
 const board={name:boardName(fileName,files),revision:'',source:'Gerber',fileName,parts,outline:outline.map(T),holes:[...holes.map(l=>l.map(T)),...cut],traces:{},width:r3(W),height:r3(H),layers:Math.max(copperCount,1),gerber:true};
 const summary={layers:Object.values(layers).map(l=>({kind:l.kind,side:l.side,names:l.names})),drills:drills.map(d=>({name:d.name,hits:d.hits.length,slots:d.slots.length,plated:d.plated})),pnp:pnpFiles.map(f=>f.name),unknown,components:parts.length,attributed:padsByRef.size,fromComponentLayer:[...meta.values()].filter(m=>!m.fromPnp).length,pnpAligned:[...meta.values()].find(m=>m.aligned)?.aligned||null,inferred};
 if(inferred)warnings.push(`No component data in these files, so ${inferred} components were inferred from the pads, drills and silkscreen. Designators are generated and part numbers are unknown until identified.`);
 else if(!parts.length)warnings.push('No component data in these files and no pads could be found, so the board has no 3D components. Add the pick-and-place (centroid) file to place them.');
 return {board,layers:out,holes:holeList,bounds,warnings,summary};
}
const boardName=(fileName,files)=>{const base=String(fileName).replace(/\.(zip|gbr|gtl|gbl|gko|gm1)$/i,'').replace(/[-_](F|B)[._](Cu|Mask|SilkS|Silkscreen|Paste)$|[-_]Edge[._]Cuts$/i,'').replace(/[-_]+/g,' ').trim();return base.slice(0,60)||'Gerber board'};
