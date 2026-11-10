// The bare board of any board in the workspace, for the PCB quote: what a fab makes, without the parts.
// boardFacts reads the size, copper layers and drilled holes from the board model; bareBoardImages
// draws the top and bottom faces from the outline, traces, pads, holes and part outlines (as silkscreen)
// in the chosen mask, legend and finish. Board coordinates are millimetres, centred, Y down, with the
// same pad placement as the board view (Board.jsx).
import {partPads} from './blueprint.js';

const HOLE='#050606',LAMINATE='#c2a467';

// Every pad of every part in board coordinates: {x, y, w, h, rot, round, hole, side}.
function boardPads(board,parts){
 const out=[];
 for(const p of parts||[]){if(board.image&&!p.pads)continue;const a=(p.rot||0)*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
  for(const pad of partPads(p)){if(out.length>8000)break;
   out.push({x:p.x+pad.x*cos+pad.y*sin,y:p.y-pad.x*sin+pad.y*cos,w:pad.w,h:pad.h,rot:-((pad.rot||0)+(p.rot||0)),round:pad.shape==='circle'||pad.shape==='oval',hole:pad.hole||0,side:p.side==='bottom'?'bottom':'top'})}}
 return out}

// What the quote form needs from a board: size, copper layers and drilled holes (plated pad holes
// and the board's own drill list when it has one).
export function boardFacts(board,parts=board?.parts){
 const pads=boardPads(board,parts),holes=[...pads.filter(p=>p.hole>0).map(p=>p.hole),...(board.drills||[]).map(d=>d.d).filter(d=>d>0)];
 return {name:board.fileName||board.name||'Board',widthMm:Math.round(board.width*10)/10,heightMm:Math.round(board.height*10)/10,layers:Math.max(1,Math.round(board.layers||2)),
  hits:holes.length,slots:0,minHoleMm:holes.length?Math.round(Math.min(...holes)*1000)/1000:null,outline:!!board.outline,mask:true,silk:true,files:0,warnings:[],board:board.id,boardName:board.name,drawn:board.surface?.top?'surface':'model'}}

// colors: {mask, maskOverCopper, silk, finish} (boardColors in gerberQuote.js). Returns {top, bottom}
// JPEG data URLs covering the board's bounding box.
export async function bareBoardImages(board,parts=board?.parts,colors={},{maxSide=1200}={}){
 const W=board.width,H=board.height,ppm=Math.min(14,maxSide/Math.max(W,H)),w=Math.max(8,Math.ceil(W*ppm)),h=Math.max(8,Math.ceil(H*ppm));
 const px=(x,y)=>[(x+W/2)*ppm,(y+H/2)*ppm];
 const ring=(ctx,pts)=>{pts.forEach(([x,y],i)=>{const [a,b]=px(x,y);i?ctx.lineTo(a,b):ctx.moveTo(a,b)});ctx.closePath()};
 const outline=board.outline?.length>2?board.outline:[[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]];
 const pads=boardPads(board,parts),traceW=Math.max(1,.25*ppm);
 const out={};
 for(const side of ['top','bottom']){
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
  ctx.save();ctx.beginPath();ring(ctx,outline);for(const hole of board.holes||[])if(hole.length>2)ring(ctx,hole);ctx.clip('evenodd');
  ctx.fillStyle=colors.mask||'#0d4f31';ctx.fillRect(0,0,w,h);
  // Copper tracks under the mask, a little lighter than bare mask.
  ctx.strokeStyle=colors.maskOverCopper||'#1d7c4a';ctx.lineWidth=traceW;ctx.lineCap='round';ctx.beginPath();
  for(const [a,b,cc,d] of board.traces?.[side]||[]){const [x1,y1]=px(a,b),[x2,y2]=px(cc,d);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2)}ctx.stroke();
  // Part outlines as legend, as a fab prints them (the parts themselves are not on a bare board).
  ctx.strokeStyle=colors.silk||'#f2f2ec';ctx.lineWidth=Math.max(1,.15*ppm);
  for(const p of parts||[]){if((p.side==='bottom'?'bottom':'top')!==side||!(p.w>0&&p.d>0))continue;const [x,y]=px(p.x,p.y);ctx.save();ctx.translate(x,y);ctx.rotate(-(p.rot||0)*Math.PI/180);ctx.strokeRect(-p.w/2*ppm,-p.d/2*ppm,p.w*ppm,p.d*ppm);ctx.restore()}
  // Pads in the finish colour: this side's pads, plus through-hole pads on both sides.
  ctx.fillStyle=colors.finish||'#d9b45a';
  for(const pd of pads){if(pd.side!==side&&!(pd.hole>0))continue;const [x,y]=px(pd.x,pd.y);ctx.save();ctx.translate(x,y);ctx.rotate(pd.rot*Math.PI/180);ctx.beginPath();
   if(pd.round)ctx.ellipse(0,0,Math.max(.5,pd.w/2*ppm),Math.max(.5,pd.h/2*ppm),0,0,Math.PI*2);else ctx.rect(-pd.w/2*ppm,-pd.h/2*ppm,pd.w*ppm,pd.h*ppm);ctx.fill();ctx.restore()}
  // Drill holes go through both faces.
  ctx.fillStyle=HOLE;for(const pd of pads){if(!(pd.hole>0))continue;const [x,y]=px(pd.x,pd.y);ctx.beginPath();ctx.arc(x,y,Math.max(.6,pd.hole/2*ppm),0,Math.PI*2);ctx.fill()}
  for(const d of board.drills||[]){if(!(d.d>0))continue;const [x,y]=px(d.x,d.y);ctx.beginPath();ctx.arc(x,y,Math.max(.6,d.d/2*ppm),0,Math.PI*2);ctx.fill()}
  ctx.restore();
  // The board edge, so a white or black mask still reads against the page.
  ctx.strokeStyle=LAMINATE;ctx.lineWidth=Math.max(1,.3*ppm);ctx.beginPath();ring(ctx,outline);ctx.stroke();
  out[side]=c.toDataURL('image/jpeg',.88)}
 return out}
