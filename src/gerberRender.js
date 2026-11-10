// Paints the Gerber layers of each board face into an image, the way a fab would make it: solder mask
// over copper and laminate, gold-finish copper and bare laminate where the mask is open, white legend
// clipped off the pads, and the drill holes. Board coordinates are millimetres, centred, Y down; the
// image covers exactly the board's bounding box, so it maps straight onto the 3D slab.

const BASE_COLORS={
 laminate:'#c2a467',          // bare FR-4 seen through mask openings
 mask:'#0d4f31',               // green solder mask over laminate
 maskOverCopper:'#1d7c4a',     // the same mask over copper, slightly lighter
 finish:'#d9b45a',             // exposed copper with an ENIG (gold) finish
 silk:'#f2f2ec',
 hole:'#050606',
 bare:'#b48a4a'                // copper with no mask layer at all
};

const makeCanvas=(w,h)=>{const c=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});return c};

// Draws primitives in solid white (dark polarity) or erases them (clear polarity), batching runs of the
// same polarity into a few paths so large layers stay fast.
function paint(ctx,objects,px,ppm,{filter}={}){
 let pol=null,fill=null;const strokes=new Map();
 const flush=()=>{ctx.globalCompositeOperation=pol==='C'?'destination-out':'source-over';ctx.fillStyle=ctx.strokeStyle='#fff';
  if(fill){ctx.fill(fill,'nonzero');fill=null}
  for(const [w,path] of strokes){ctx.lineWidth=Math.max(.75,w*ppm);ctx.lineCap=ctx.lineJoin='round';ctx.stroke(path)}strokes.clear()};
 for(const o of objects){
  if(filter&&!filter(o))continue;
  if(o.pol!==pol){if(pol)flush();pol=o.pol}
  if(o.k==='stroke'){let p=strokes.get(o.w);if(!p){p=new Path2D();strokes.set(o.w,p)}const [x0,y0]=px(o.pts[0]);p.moveTo(x0,y0);for(let i=1;i<o.pts.length;i++){const [x,y]=px(o.pts[i]);p.lineTo(x,y)}if(o.pts.length===1)p.lineTo(x0+.01,y0)}
  else if(o.k==='circle'){fill=fill||new Path2D();const [x,y]=px([o.x,o.y]);fill.moveTo(x+o.r*ppm,y);fill.arc(x,y,Math.max(.4,o.r*ppm),0,Math.PI*2)}
  else if(o.k==='ring'){let p=strokes.get(o.w);if(!p){p=new Path2D();strokes.set(o.w,p)}const [x,y]=px([o.x,o.y]);const r=Math.max(.4,(o.r-o.w/2)*ppm);p.moveTo(x+r,y);p.arc(x,y,r,0,Math.PI*2)}
  else if(o.k==='poly'&&o.pts.length>2){fill=fill||new Path2D();const [x0,y0]=px(o.pts[0]);fill.moveTo(x0,y0);for(let i=1;i<o.pts.length;i++){const [x,y]=px(o.pts[i]);fill.lineTo(x,y)}fill.closePath()}
 }
 if(pol)flush();ctx.globalCompositeOperation='source-over';
}
const tint=(src,color,w,h)=>{const c=makeCanvas(w,h),ctx=c.getContext('2d');ctx.drawImage(src,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,w,h);return c};
const layerCanvas=(objects,w,h,px,ppm,opts)=>{const c=makeCanvas(w,h);if(objects?.length)paint(c.getContext('2d'),objects,px,ppm,opts);return c};

// result: the output of buildGerberBoard. Returns {top,bottom} data URLs (JPEG) plus the pixel scale.
// colors overrides the defaults, e.g. a red mask or a HASL (silver) finish for a quote preview.
export async function renderGerberSurfaces(result,{maxSide=2048,quality=.9,colors={}}={}){
 const COLORS={...BASE_COLORS,...colors};
 const {board,layers,holes}=result;const W=board.width,H=board.height;
 const ppm=Math.min(30,maxSide/Math.max(W,H));const w=Math.max(8,Math.ceil(W*ppm)),h=Math.max(8,Math.ceil(H*ppm));
 const px=([x,y])=>[(x+W/2)*ppm,(y+H/2)*ppm];
 const outlinePath=new Path2D();for(const ring of [board.outline,...(board.holes||[])]){if(!ring||ring.length<3)continue;ring.forEach((p,i)=>{const [x,y]=px(p);i?outlinePath.lineTo(x,y):outlinePath.moveTo(x,y)});outlinePath.closePath()}
 const out={ppm,width:w,height:h};
 for(const side of ['top','bottom']){
  const copper=layers['copper:'+side]?.objects,mask=layers['mask:'+side]?.objects,silk=layers['silk:'+side]?.objects;
  const c=makeCanvas(w,h),ctx=c.getContext('2d');ctx.save();ctx.clip(outlinePath,'evenodd');
  const cu=layerCanvas(copper,w,h,px,ppm);
  // Without a mask layer, assume the usual: mask everywhere except on pads (flashes, not pours or tracks).
  const open=mask?layerCanvas(mask,w,h,px,ppm):layerCanvas(copper,w,h,px,ppm,{filter:o=>o.k!=='stroke'&&!o.region});
  ctx.fillStyle=COLORS.mask;ctx.fillRect(0,0,w,h);
  ctx.drawImage(tint(cu,COLORS.maskOverCopper,w,h),0,0);
  ctx.drawImage(tint(open,COLORS.laminate,w,h),0,0);
  const exposed=tint(cu,COLORS.finish,w,h);{const e=exposed.getContext('2d');e.globalCompositeOperation='destination-in';e.drawImage(open,0,0)}
  ctx.drawImage(exposed,0,0);
  if(silk?.length){const s=tint(layerCanvas(silk,w,h,px,ppm),COLORS.silk,w,h);const sc=s.getContext('2d');sc.globalCompositeOperation='destination-out';sc.drawImage(open,0,0);ctx.drawImage(s,0,0)}
  // Drill holes go through both faces.
  ctx.fillStyle=ctx.strokeStyle=COLORS.hole;ctx.lineCap='round';
  for(const hole of holes||[]){const [x,y]=px([hole.x,hole.y]);if(hole.slot){const [x2,y2]=px([hole.x2,hole.y2]);ctx.lineWidth=hole.d*ppm;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()}else{ctx.beginPath();ctx.arc(x,y,Math.max(.5,hole.d/2*ppm),0,Math.PI*2);ctx.fill()}}
  ctx.restore();
  out[side]=await toDataUrl(c,quality);
  out[side+'Layers']={copper:!!copper,mask:!!mask,silk:!!silk};
 }
 return out;
}
async function toDataUrl(canvas,quality){
 if(canvas.toDataURL)return canvas.toDataURL('image/jpeg',quality);
 const blob=await canvas.convertToBlob({type:'image/jpeg',quality});
 return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob)});
}

// Separate layer images for the exploded view: each layer on a transparent background, so the
// planes can be stacked apart in 3D. PNG keeps the transparency.
export async function renderGerberLayers(result,{maxSide=1400}={}){
 const {board,layers,holes}=result;const W=board.width,H=board.height;
 const ppm=Math.min(24,maxSide/Math.max(W,H));const w=Math.max(8,Math.ceil(W*ppm)),h=Math.max(8,Math.ceil(H*ppm));
 const px=([x,y])=>[(x+W/2)*ppm,(y+H/2)*ppm];
 const outlinePath=new Path2D();for(const ring of [board.outline,...(board.holes||[])]){if(!ring||ring.length<3)continue;ring.forEach((p,i)=>{const [x,y]=px(p);i?outlinePath.lineTo(x,y):outlinePath.moveTo(x,y)});outlinePath.closePath()}
 const drill=ctx=>{ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineCap='round';for(const hole of holes||[]){const [x,y]=px([hole.x,hole.y]);if(hole.slot){const [x2,y2]=px([hole.x2,hole.y2]);ctx.lineWidth=hole.d*ppm;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()}else{ctx.beginPath();ctx.arc(x,y,Math.max(.5,hole.d/2*ppm),0,Math.PI*2);ctx.fill()}}ctx.globalCompositeOperation='source-over'};
 const out={};
 const png=async c=>c.toDataURL?c.toDataURL('image/png'):await new Promise((res,rej)=>{c.convertToBlob({type:'image/png'}).then(b=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)})});
 for(const side of ['top','bottom']){
  const copper=layers['copper:'+side]?.objects,mask=layers['mask:'+side]?.objects,silk=layers['silk:'+side]?.objects;
  if(copper?.length){const c=tint(layerCanvas(copper,w,h,px,ppm),'#c98f3c',w,h);const ctx=c.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.fill(outlinePath,'evenodd');drill(ctx);out['copper-'+side]=await png(c)}
  if(mask?.length||copper?.length){const c=makeCanvas(w,h),ctx=c.getContext('2d');ctx.save();ctx.clip(outlinePath,'evenodd');ctx.fillStyle='#14703f';ctx.fillRect(0,0,w,h);ctx.restore();
   const open=mask?layerCanvas(mask,w,h,px,ppm):layerCanvas(copper,w,h,px,ppm,{filter:o=>o.k!=='stroke'&&!o.region});ctx.globalCompositeOperation='destination-out';ctx.drawImage(open,0,0);drill(ctx);out['mask-'+side]=await png(c)}
  if(silk?.length){const c=tint(layerCanvas(silk,w,h,px,ppm),'#f4f4ee',w,h);const ctx=c.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.fill(outlinePath,'evenodd');out['silk-'+side]=await png(c)}
 }
 return out;
}
