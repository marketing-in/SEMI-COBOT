// Picture blueprint detector. Pure JavaScript on an RGBA buffer: finds the board area and the
// component boxes in a rendered PDF page, a scan or a photo, attaches text labels from the PDF
// text layer, and builds the shared board model (see blueprint.js). No DOM, so node --test can
// drive it with synthetic pixels. Coordinates in and out are normalised to 0..1 (x right, y down).
import {makePart} from './blueprint.js';

const r4=n=>Math.round(n*1e4)/1e4,r3=n=>Math.round(n*1000)/1000;
const TYPES=['chip','transistor','diode','led','capacitor','resistor','inductor','connector','crystal','switch','fuse','module','other'];

function otsu(hist,total){
 let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
 let sumB=0,wB=0,best=0,bestT=0;
 for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=total-wB;if(!wF)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF;const v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;bestT=t}}
 return bestT;
}
// Iterative 4-connected flood fill over `open` pixels (open[i]===1), marking `mark`.
function flood(open,mark,W,H,seeds){
 const stack=new Int32Array(W*H);let sp=0;
 for(const s of seeds)if(open[s]&&!mark[s]){mark[s]=1;stack[sp++]=s}
 while(sp){const i=stack[--sp];const x=i%W;
  if(x>0&&open[i-1]&&!mark[i-1]){mark[i-1]=1;stack[sp++]=i-1}
  if(x<W-1&&open[i+1]&&!mark[i+1]){mark[i+1]=1;stack[sp++]=i+1}
  if(i>=W&&open[i-W]&&!mark[i-W]){mark[i-W]=1;stack[sp++]=i-W}
  if(i+W<W*H&&open[i+W]&&!mark[i+W]){mark[i+W]=1;stack[sp++]=i+W}}
}
// Connected components (4- or 8-connected) of mask pixels; returns boxes in pixels with pixel counts.
function components(mask,W,H,eight,minPixels=1){
 const seen=new Uint8Array(W*H),stack=new Int32Array(W*H),out=[];
 for(let start=0;start<W*H;start++){
  if(!mask[start]||seen[start])continue;
  let sp=0;stack[sp++]=start;seen[start]=1;let minX=W,minY=H,maxX=0,maxY=0,count=0;const seed=start;
  while(sp){const i=stack[--sp];const x=i%W,y=(i-x)/W;count++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   const push=j=>{if(mask[j]&&!seen[j]){seen[j]=1;stack[sp++]=j}};
   if(x>0)push(i-1);if(x<W-1)push(i+1);if(y>0)push(i-W);if(y<H-1)push(i+W);
   if(eight){if(x>0&&y>0)push(i-W-1);if(x<W-1&&y>0)push(i-W+1);if(x>0&&y<H-1)push(i+W-1);if(x<W-1&&y<H-1)push(i+W+1)}}
  if(count>=minPixels)out.push({x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,pixels:count,seed});
 }
 return out;
}
const overlapArea=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
function union(a,b){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {...a,x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y,kind:a.kind===b.kind?a.kind:'solid'}}
// Merge boxes that overlap strongly, contain each other, or sit edge to edge (stripes of one body).
function mergeBoxes(boxes,gap){
 let list=boxes.map(b=>({...b}));let changed=true;
 while(changed){changed=false;
  outer:for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
   const a=list[i],b=list[j];const ov=overlapArea(a,b);const small=Math.min(a.w*a.h,b.w*b.h);
   const iou=ov/(a.w*a.h+b.w*b.h-ov);
   const xo=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),yo=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
   const adjacentV=xo>=.7*Math.min(a.w,b.w)&&yo>=-gap&&yo<=gap,adjacentH=yo>=.7*Math.min(a.h,b.h)&&xo>=-gap&&xo<=gap;
   if(iou>.5||ov>=.8*small||adjacentV||adjacentH){list[i]=union(a,b);list.splice(j,1);changed=true;break outer}}}
 return list;
}

export function detectShapes(image,options={}){
 const data=image?.data,W=image?.width|0,H=image?.height|0;
 const empty=notes=>({board:{x:0,y:0,w:1,h:1},shapes:[],background:[0,0,0],notes});
 if(!data||W<8||H<8||data.length<W*H*4)return empty('The picture is too small to analyse.');
 const N=W*H;
 // 1. Background colour = most common colour (4 bits per channel), refined to the bin average.
 const hist=new Uint32Array(4096);const bin=o=>((data[o]>>4)<<8)|((data[o+1]>>4)<<4)|(data[o+2]>>4);
 for(let i=0;i<N;i++)hist[bin(i*4)]++;
 let best=0;for(let k=1;k<4096;k++)if(hist[k]>hist[best])best=k;
 let sr=0,sg=0,sb=0,sn=0;for(let i=0;i<N;i++){const o=i*4;if(bin(o)===best){sr+=data[o];sg+=data[o+1];sb+=data[o+2];sn++}}
 const background=[Math.round(sr/sn),Math.round(sg/sn),Math.round(sb/sn)];
 // 2. Foreground = pixels whose colour distance from the background passes an Otsu threshold.
 const dist=new Uint8Array(N),dh=new Uint32Array(256);
 for(let i=0;i<N;i++){const o=i*4;const d=Math.min(255,((Math.abs(data[o]-background[0])+Math.abs(data[o+1]-background[1])+Math.abs(data[o+2]-background[2]))/3)|0);dist[i]=d;dh[d]++}
 const t=Math.max(12,otsu(dh,N));
 const fg=new Uint8Array(N),open=new Uint8Array(N);let fgCount=0;
 for(let i=0;i<N;i++){if(dist[i]>t){fg[i]=1;fgCount++}else open[i]=1}
 if(fgCount<N*.0003||fgCount>N*.97)return {board:{x:0,y:0,w:1,h:1},shapes:[],background,notes:'No drawing was found on this picture (it is nearly one flat colour).'};
 // 3. Background reachable from the border; what is not reachable is enclosed by drawing.
 const reach=new Uint8Array(N);const seeds=[];for(let x=0;x<W;x++){seeds.push(x,N-W+x)}for(let y=1;y<H-1;y++){seeds.push(y*W,y*W+W-1)}
 flood(open,reach,W,H,seeds);
 const enclosed=new Uint8Array(N);for(let i=0;i<N;i++)if(open[i]&&!reach[i])enclosed[i]=1;
 let regions=components(enclosed,W,H,false,4).sort((a,b)=>b.pixels-a.pixels);
 // A border drawn around the whole page encloses everything; its interior counts as outside.
 let frame=null;
 while(regions.length&&regions[0].w*regions[0].h>=.8*N){frame=regions.shift();flood(open,reach,W,H,[frame.seed]);for(let i=0;i<N;i++)enclosed[i]=open[i]&&!reach[i]?1:0;regions=components(enclosed,W,H,false,4).sort((a,b)=>b.pixels-a.pixels)}
 // Board area: the biggest enclosed region when it is large. Outlines often have hairline gaps
 // (anti-aliasing, ports drawn across the edge), so the board flood runs on a thickened mask.
 let board=null,boardRegion=null,dbg=null;
 // Nested outlines (a title frame around the board): the smallest clean enclosure that still
 // covers a fifth of the picture is the board.
 const outlines=regions.filter(r=>r.w*r.h>=.2*N&&r.pixels>=.5*r.w*r.h).sort((a,b)=>a.w*a.h-b.w*b.h);
 if(outlines.length)boardRegion=outlines[0];
 else{
  // Enclosed cells larger than a letter hole (component interiors, trace-bounded cells) all lie on
  // the board, so their extent is the board even when its edge is not one closed line.
  const sig=regions.filter(r=>r.pixels>=.0001*N);
  if(sig.length>=8){let x0=W,y0=H,x1=0,y1=0;for(const c of sig){if(c.x<x0)x0=c.x;if(c.y<y0)y0=c.y;if(c.x+c.w>x1)x1=c.x+c.w;if(c.y+c.h>y1)y1=c.y+c.h}
   if((x1-x0)*(y1-y0)>=.15*N&&(x1-x0)*(y1-y0)<=.9*N){const m=Math.round(Math.min(W,H)*.008);boardRegion={x:x0-m,y:y0-m,w:x1-x0+2*m,h:y1-y0+2*m,pixels:sig.reduce((a,c)=>a+c.pixels,0)};dbg={method:'cells',cells:sig.length}}}
 }
 if(!boardRegion){
  // Drawings whose board edge is not a closed line (ports drawn across it, traces everywhere):
  // the board is the largest cluster of densely drawn cells; margins with callouts are sparse.
  const cell=Math.max(6,Math.round(Math.min(W,H)*.015)),gx=Math.ceil(W/cell),gy=Math.ceil(H/cell);const dens=new Float32Array(gx*gy),cnt=new Uint32Array(gx*gy);
  for(let y=0;y<H;y++){const cy=(y/cell)|0;for(let x=0;x<W;x++){const ci=cy*gx+((x/cell)|0);cnt[ci]++;if(fg[y*W+x])dens[ci]++}}
  for(let i=0;i<gx*gy;i++)dens[i]=cnt[i]?dens[i]/cnt[i]:0;
  const denseCells=new Uint8Array(gx*gy);for(let i=0;i<gx*gy;i++)denseCells[i]=dens[i]>=.2?1:0;
  const clusters=components(denseCells,gx,gy,false,1).sort((a,b)=>b.pixels-a.pixels);
  if(clusters.length&&clusters[0].pixels*cell*cell>=.12*N){const c=clusters[0];boardRegion={x:Math.max(0,(c.x-.5)*cell),y:Math.max(0,(c.y-.5)*cell),w:Math.min(W,(c.w+1)*cell),h:Math.min(H,(c.h+1)*cell),pixels:c.pixels*cell*cell,cluster:true};dbg={method:'density',clusters:clusters.length,cells:c.pixels}}
 }
 if(!boardRegion){const r=Math.max(2,Math.round(Math.min(W,H)*.003));const thick=new Uint8Array(N);const tb=Math.max(6,t*(options.boardContrast??.45));
  // Board edges are often drawn fainter than components, so a lower contrast cut is used here.
  for(let i=0;i<N;i++)if(dist[i]>tb){const x=i%W,y=(i-x)/W;for(let dy=-r;dy<=r;dy++){const yy=y+dy;if(yy<0||yy>=H)continue;for(let dx=-r;dx<=r;dx++){const xx=x+dx;if(xx>=0&&xx<W)thick[yy*W+xx]=1}}}
  const open2=new Uint8Array(N);for(let i=0;i<N;i++)open2[i]=thick[i]?0:1;const reach2=new Uint8Array(N);const seeds2=[];for(let i=0;i<N;i++)if(reach[i]&&open2[i])seeds2.push(i);flood(open2,reach2,W,H,seeds2.length?seeds2:seeds);
  const enclosed2=new Uint8Array(N);for(let i=0;i<N;i++)if(open2[i]&&!reach2[i])enclosed2[i]=1;
  // Traces usually cut the board interior into many cells; together they still tile the board,
  // so the board is the extent of all sizeable enclosed cells (letter holes are far smaller).
  const cells=components(enclosed2,W,H,false,Math.max(16,Math.round(.0003*N)));const total=cells.reduce((a,c)=>a+c.pixels,0);
  let x0=W,y0=H,x1=0,y1=0;for(const c of cells){if(c.x<x0)x0=c.x;if(c.y<y0)y0=c.y;if(c.x+c.w>x1)x1=c.x+c.w;if(c.y+c.h>y1)y1=c.y+c.h}
  dbg={cells:cells.length,cellsTotal:r4(total/N),cellsBox:cells.length?[r4(x0/W),r4(y0/H),r4((x1-x0)/W),r4((y1-y0)/H)]:null,largest:cells.slice().sort((a,b)=>b.pixels-a.pixels).slice(0,4).map(c=>[r4(c.x/W),r4(c.y/H),r4(c.w/W),r4(c.h/H),r4(c.pixels/N)])};
  if(total>=.15*N)boardRegion={x:x0-r,y:y0-r,w:x1-x0+2*r,h:y1-y0+2*r,pixels:total}}
 if(options.boardHint&&options.boardHint.w>0)board={x:options.boardHint.x*W,y:options.boardHint.y*H,w:options.boardHint.w*W,h:options.boardHint.h*H};
 else if(boardRegion){const m=Math.round(Math.min(W,H)*.004)+1;board={x:boardRegion.x-m,y:boardRegion.y-m,w:boardRegion.w+2*m,h:boardRegion.h+2*m};if(regions[0]===boardRegion)regions.shift()}
 else{let minX=W,minY=H,maxX=0,maxY=0;for(let i=0;i<N;i++)if(fg[i]){const x=i%W,y=(i-x)/W;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  board=(maxX-minX)*(maxY-minY)>=.2*N?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:{x:W*.02,y:H*.02,w:W*.96,h:H*.96}}
 board={x:Math.max(0,board.x),y:Math.max(0,board.y),w:Math.min(W-Math.max(0,board.x),board.w),h:Math.min(H-Math.max(0,board.y),board.h)};
 if(!options.boardHint&&!options._crop&&board.w*board.h<.9*N&&board.w>16&&board.h>16){
  let inkInBoard=0;const bx0=Math.round(board.x),by0=Math.round(board.y),bx1=Math.round(board.x+board.w),by1=Math.round(board.y+board.h);
  for(let y=by0;y<by1;y++)for(let x=bx0;x<bx1;x++)inkInBoard+=fg[y*W+x];
  if(inkInBoard>=.6*board.w*board.h){
   // A photo: the board is the biggest object on a plain background. Re-run on the board alone so
   // the background estimate comes from the board surface and components show against it.
   const cw=bx1-bx0,ch=by1-by0;const crop=new Uint8ClampedArray(cw*ch*4);
   for(let y=0;y<ch;y++)crop.set(data.subarray(((by0+y)*W+bx0)*4,((by0+y)*W+bx1)*4),y*cw*4);
   const exclude=(options.exclude||[]).map(e=>({x:(e.x*W-bx0)/cw,y:(e.y*H-by0)/ch,w:e.w*W/cw,h:e.h*H/ch}));
   const inner=detectShapes({data:crop,width:cw,height:ch},{...options,exclude,boardHint:{x:0,y:0,w:1,h:1},_crop:true});
   const shapes=inner.shapes.map(sh=>({...sh,x:r4((bx0+sh.x*cw)/W),y:r4((by0+sh.y*ch)/H),w:r4(sh.w*cw/W),h:r4(sh.h*ch/H),area:r4(sh.w*cw*sh.h*ch/N)}));
   return {board:{x:r4(bx0/W),y:r4(by0/H),w:r4(cw/W),h:r4(ch/H),aspect:r4(cw/ch)},shapes,background:inner.background,notes:'Photo mode: the board was isolated from the background first. '+inner.notes};
  }
 }
 // 4. Solid or hatched bodies: dense foreground inside a small window (thin traces stay sparse).
 const k=Math.max(2,Math.round(Math.min(W,H)*.004));const integral=new Uint32Array((W+1)*(H+1));
 for(let y=1;y<=H;y++){let row=0;for(let x=1;x<=W;x++){row+=fg[(y-1)*W+x-1];integral[y*(W+1)+x]=integral[(y-1)*(W+1)+x]+row}}
 const dense=new Uint8Array(N);const win=(2*k+1)*(2*k+1);
 for(let y=k;y<H-k;y++)for(let x=k;x<W-k;x++){const x0=x-k,y0=y-k,x1=x+k+1,y1=y+k+1;const s=integral[y1*(W+1)+x1]-integral[y0*(W+1)+x1]-integral[y1*(W+1)+x0]+integral[y0*(W+1)+x0];if(s>=win*.34)dense[y*W+x]=1}
 // Only boxes that are really filled count: a hollow outline has little ink inside its box.
 const inkIn=b=>{const x0=Math.max(0,b.x),y0=Math.max(0,b.y),x1=Math.min(W,b.x+b.w),y1=Math.min(H,b.y+b.h);return integral[y1*(W+1)+x1]-integral[y0*(W+1)+x1]-integral[y1*(W+1)+x0]+integral[y0*(W+1)+x0]};
 // Tighten a blob to the ink it actually contains (the density window pads its edges).
 const tight=b=>{const x0=Math.max(0,b.x-k),y0=Math.max(0,b.y-k),x1=Math.min(W,b.x+b.w+k),y1=Math.min(H,b.y+b.h+k);let minX=x1,minY=y1,maxX=x0-1,maxY=y0-1;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(fg[y*W+x]){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}return maxX<minX?null:{...b,x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}};
 // A row of letters: a short wide box whose ink is split into several columns.
 const textLike=b=>{if(b.h>=H*.022||b.w<2*b.h)return false;let gaps=0,inGap=false;for(let x=b.x;x<b.x+b.w;x++){let ink=0;for(let y=b.y;y<b.y+b.h;y++)if(fg[y*W+x]){ink=1;break}if(!ink&&!inGap){gaps++;inGap=true}else if(ink)inGap=false}return gaps>=3};
 const blobs=components(dense,W,H,true,Math.max(4,k*k)).map(tight).filter(b=>b&&inkIn(b)>=.28*b.w*b.h&&!textLike(b)).map(b=>({...b,kind:'solid'}));
 // 5. Candidates, filters, merging. Enclosed interiors grow by the stroke width to cover their outline.
 const minArea=(options.minArea??.00015)*N,maxArea=(options.maxArea??.3)*board.w*board.h;
 let boxes=[...regions.map(r=>({x:r.x-k,y:r.y-k,w:r.w+2*k,h:r.h+2*k,kind:'enclosed',pixels:r.pixels})),...blobs]
  .filter(b=>b.w*b.h>=minArea*.5&&b.w*b.h<=maxArea);
 // Text glyphs: short boxes that line up in a row with neighbours of the same height (before merging).
 const glyphH=H*.022;
 boxes=boxes.filter((b,i)=>{if(b.h>=glyphH||b.w>3*b.h)return true;const row=boxes.filter((o,j)=>j!==i&&o.h<glyphH&&o.w<=3*o.h&&Math.abs((o.y+o.h/2)-(b.y+b.h/2))<b.h*.6&&Math.abs(o.h-b.h)<b.h*.6&&Math.min(Math.abs(o.x-(b.x+b.w)),Math.abs(b.x-(o.x+o.w)))<2*b.h);return row.length<3});
 boxes=mergeBoxes(boxes,Math.max(2,Math.round(k*.75)));
 boxes=boxes.filter(b=>b.w*b.h>=minArea&&b.w*b.h<=maxArea&&Math.max(b.w,b.h)/Math.max(1,Math.min(b.w,b.h))<=14);
 // Known text positions supplied by the caller, and anything outside a clearly smaller board area.
 const exclude=(options.exclude||[]).map(e=>({x:e.x*W,y:e.y*H,w:e.w*W,h:e.h*H}));
 boxes=boxes.filter(b=>!exclude.some(e=>overlapArea(b,e)>.6*b.w*b.h));
 if(board.w*board.h<.85*N)boxes=boxes.filter(b=>overlapArea(b,board)>=.5*b.w*b.h);
 // Any region the size of the board itself is the outline, not a component.
 boxes=boxes.filter(b=>!(b.w>=.9*board.w&&b.h>=.9*board.h));
 boxes.sort((a,b)=>a.y-b.y||a.x-b.x);
 const shapes=boxes.map(b=>({x:r4(b.x/W),y:r4(b.y/H),w:r4(b.w/W),h:r4(b.h/H),area:r4(b.w*b.h/N),kind:b.kind}));
 const notes=`${shapes.length} outlines detected from the picture (${regions.length} enclosed regions, ${blobs.length} filled areas).`;
 const result={board:{x:r4(board.x/W),y:r4(board.y/H),w:r4(board.w/W),h:r4(board.h/H),aspect:r4(board.w/board.h)},shapes,background,notes};
 if(options.debug)result.debug={threshold:t,k,fgRatio:r4(fgCount/N),frame:!!frame,boardSearch:dbg,regions:regions.slice(0,8).map(r=>({x:r4(r.x/W),y:r4(r.y/H),w:r4(r.w/W),h:r4(r.h/H),fill:r4(r.pixels/(r.w*r.h))})),blobs:blobs.length,candidates:boxes.length};
 return result;
}

// Join PDF text runs into labels: runs on one line, then lines stacked directly beneath each other.
export function mergeLabels(textItems=[]){
 const items=textItems.filter(i=>i&&i.text&&String(i.text).trim()).map(i=>({text:String(i.text).trim(),x:+i.x,y:+i.y,w:+i.w,h:+i.h})).filter(i=>[i.x,i.y,i.w,i.h].every(Number.isFinite)&&i.h>0);
 items.sort((a,b)=>a.y-b.y||a.x-b.x);
 const lines=[];
 for(const it of items){const ch=it.h*.55;const line=lines.find(l=>Math.abs((l.y+l.h/2)-(it.y+it.h/2))<Math.max(l.h,it.h)*.45&&it.x>=l.x+l.w-ch*.5&&it.x-(l.x+l.w)<ch*1.6);
  if(line){line.text+=(it.x-(line.x+line.w)>ch*.25?' ':'')+it.text;const x=Math.min(line.x,it.x),y=Math.min(line.y,it.y);line.w=Math.max(line.x+line.w,it.x+it.w)-x;line.h=Math.max(line.y+line.h,it.y+it.h)-y;line.x=x;line.y=y}
  else lines.push({...it})}
 const labels=[];
 for(const ln of lines){const ch=ln.h*.55;const label=labels.find(l=>ln.y-(l.y+l.h)<ln.h*.8&&ln.y-(l.y+l.h)>-ln.h*.3&&(Math.abs(l.x-ln.x)<ch*1.5||(ln.x<l.x+l.w&&ln.x+ln.w>l.x)));
  if(label){label.text+=' '+ln.text;const x=Math.min(label.x,ln.x),y=Math.min(label.y,ln.y);label.w=Math.max(label.x+label.w,ln.x+ln.w)-x;label.h=Math.max(label.y+label.h,ln.y+ln.h)-y;label.x=x;label.y=y}
  else labels.push({...ln})}
 return labels.map(l=>({text:l.text.replace(/\s+/g,' ').trim().slice(0,120),x:r4(l.x),y:r4(l.y),w:r4(l.w),h:r4(l.h)}));
}

// Attach each label to the nearest free shape. Leader lines are not traced, so a callout that
// points across the board with a long line stays unmatched unless the AI detector names it.
export function labelShapes(shapes=[],labels=[],threshold=.09,board=null){
 const out=shapes.map(s=>({...s}));const pairs=[];const aspect=board&&board.aspect>0?board.aspect:1;
 for(let li=0;li<labels.length;li++){const l=labels[li];const cx=l.x+l.w/2,cy=l.y+l.h/2;
  if(l.text.length>70||l.w>.45)continue;
  if(board&&board.w*board.h<.85){const m=.06;if(cx<board.x-m||cx>board.x+board.w+m||cy<board.y-m||cy>board.y+board.h+m)continue}
  for(let si=0;si<out.length;si++){const s=out[si];const inside=cx>=s.x&&cx<=s.x+s.w&&cy>=s.y&&cy<=s.y+s.h;
   const dx=Math.max(0,s.x-(l.x+l.w),l.x-(s.x+s.w)),dy=Math.max(0,s.y-(l.y+l.h),l.y-(s.y+s.h))/aspect;const d=inside?0:Math.hypot(dx,dy)/Math.SQRT2;
   if(d<=threshold)pairs.push({li,si,d})}}
 pairs.sort((a,b)=>a.d-b.d);const usedL=new Set(),usedS=new Set();
 for(const p of pairs){if(usedL.has(p.li)||usedS.has(p.si))continue;usedL.add(p.li);usedS.add(p.si);out[p.si].label=labels[p.li].text;out[p.si].labelConfidence=r3(1-p.d/threshold)}
 // Group callouts ("Capacitors 100nF (C1-C4)", "VRM MOSFETs") name a row of look-alike parts: pass
 // the label on to unlabelled neighbours of the same size that line up with the labelled one.
 const plural=/s\b|\(\s*[A-Z]+\d+\s*[-–]\s*[A-Z]*\d+\s*\)|\bx\s?\d+\b|\d+\s?x\b/i;
 let grew=true;
 while(grew){grew=false;
  for(const a of out.filter(s=>s.label&&plural.test(s.label))){const size=Math.max(a.w,a.h/aspect);
   for(const b of out){if(b.label||b===a)continue;const similar=Math.abs(b.w-a.w)<=.35*a.w&&Math.abs(b.h-a.h)<=.35*a.h;
    const dx=Math.abs((b.x+b.w/2)-(a.x+a.w/2)),dy=Math.abs((b.y+b.h/2)-(a.y+a.h/2))/aspect;const aligned=(dy<=.6*size&&dx<=4*size)||(dx<=.6*size&&dy<=4*size);
    if(similar&&aligned){b.label=a.label;b.labelConfidence=r3(Math.max(.2,(a.labelConfidence||.5)-.2));b.grouped=true;grew=true}}}}
 return out;
}

const RULES=[
 [/\b(cpu|processor) socket\b|\bsocket\b|\blga\b|\bpga\b|\bzif\b/,'connector','socket',3],
 [/\bdimm\b|\bram slot|\bso-?dimm\b|\bmemory slot/,'connector','DIMM slot',11],[/\bpcie?\b|\bpci\b|\bx16\b|\bx1 slot|\bexpansion slot|\bslot\b/,'connector','expansion slot',11],
 [/\bsata\b|\bheader\b|\bconnector\b|\bport\b|\bjack\b|\busb\b|\bhdmi\b|\bdisplayport\b|\bethernet\b|\brj-?45\b|\bm\.2\b|\baudio\b|\bpower connector|\batx\b|\bterminal\b|\bpin\b/,'connector','',8],
 [/\bcapacitor|\bcaps?\b|\belectrolytic|\bcap\.?\b/,'capacitor','',8],[/\bchoke|\binductor|\bcoil\b|\bferrite/,'inductor','',4],[/\bmosfet|\btransistor|\bvrm\b|\bpower stage|\bfet\b|\bigbt/,'transistor','',1.2],
 [/\bcrystal|\boscillator|\bxtal\b|\bclock gen/,'crystal','',1.5],[/\bfuse\b|\bpolyfuse|\btvs\b|\besd\b/,'fuse','',1.5],[/\bled\b|\bindicator/,'led','',1],[/\bresistor|\bpotentiometer|\btrimmer/,'resistor','',.6],[/\bdiode|\bschottky|\bzener|\brectifier/,'diode','',1.2],
 [/\bbutton|\bswitch|\bjumper/,'switch','',3.5],[/\bbattery|\bcr2032|\bcoin cell/,'other','battery',3,'cyl'],[/\bmodule|\bwi-?fi|\bbluetooth|\bradio|\bantenna/,'module','',3],[/\bheatsink|\bheat sink|\bfan\b|\bcooler/,'other','heatsink',10],
 [/\bic\b|\bcontroller|\bcodec|\bchipset|\bpch\b|\bbios\b|\buefi\b|\bflash\b|\beeprom\b|\bregulator|\bpmic\b|\bmcu\b|\bmicrocontroller|\bprocessor|\bcpu\b|\bfpga\b|\bsoc\b|\bbridge\b|\bsuper i\/o|\bdriver\b|\bamplifier|\bsensor|\bmemory\b|\bgpu\b|\bchip\b/,'chip','',1.6],
];
export function classifyShape(shape,label='',board={x:0,y:0,w:1,h:1}){
 const text=String(label||'').toLowerCase();const area=shape.w*shape.h/Math.max(1e-9,board.w*board.h);const aspect=Math.max(shape.w,shape.h)/Math.max(1e-9,Math.min(shape.w,shape.h));
 const squareish=aspect<1.6;
 let hit=null,end=-1;
 if(text)for(const rule of RULES){const g=new RegExp(rule[0].source,'gi');let m;while((m=g.exec(text))){if(m.index+m[0].length>end){end=m.index+m[0].length;hit=rule}if(!m[0].length)g.lastIndex++}}
 if(hit){const [,type,pkg,h,sh]=hit;
  if(type==='capacitor')return {type,package:squareish&&area<.01?'electrolytic':'SMD',name:label,h:squareish&&area<.01?8:1.2,shape:squareish&&area<.01?'cyl':'box'};
  if(type==='connector')return {type,package:pkg||(aspect>4?'slot or header':'connector'),name:label,h:pkg==='socket'?3:aspect>4?11:8,shape:'box'};
  return {type,package:pkg,name:label,h,shape:sh||'box'};
 }
 if(aspect>4)return {type:'connector',package:'slot or header',name:label,h:aspect>8?11:8,shape:'box'};
 if(area>.03)return {type:'chip',package:'large IC or socket',name:label,h:1.6,shape:'box'};
 if(area<.0006)return squareish?{type:'capacitor',package:'SMD',name:label,h:1.2,shape:'box'}:{type:'resistor',package:'SMD',name:label,h:.6,shape:'box'};
 return {type:'chip',package:'',name:label,h:1.6,shape:'box'};
}

const PREFIX={chip:'U',transistor:'Q',diode:'D',led:'LED',capacitor:'C',resistor:'R',inductor:'L',connector:'J',crystal:'Y',switch:'SW',fuse:'F',module:'M',other:'X'};
const looksLikeMpn=s=>/^[A-Z0-9][A-Z0-9.\-\/]{4,}$/i.test(s)&&/\d/.test(s)&&/[A-Z]/i.test(s);
// A part number inside a longer callout ("Schottky diode SS14 (D1)"): the longest token that mixes
// letters and digits and is not a value with a unit, a reference designator or a package size.
const VALUE_TOKEN=/^(\d+(\.\d+)?[KMRU]?(OHM|Ω|F|H|V|A|W|HZ|MHZ|KHZ|GHZ|MM|NF|UF|PF|MH|UH|NH|K|M|R)?|(U|D|C|R|L|Q|J|Y|F|X|SW|LED|M|T|K|S|P|JP|CN|IC)\d{1,3}(-(U|D|C|R|L|Q|J|Y|F|X|SW|LED|M|T|K|S|P|JP|CN|IC)?\d{1,3})?|\d{4}|LQFP\d*|QFN\d*|SOIC\d*|SOT\d*|TO\d*|DIP\d*|X\d+|REV\d*|V\d+(\.\d+)?)$/i;
const mpnFromLabel=label=>{const tokens=String(label||'').split(/[\s,;:()\[\]\/]+/).filter(t=>t.length>=4&&t.length<=40&&/\d/.test(t)&&/[A-Z]/i.test(t)&&/^[A-Z0-9][A-Z0-9.\-]*$/i.test(t)&&!VALUE_TOKEN.test(t));return tokens.sort((a,b)=>b.length-a.length)[0]||''};
const baseName=f=>String(f||'').replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim().slice(0,60)||'Imported picture';
const clean=(s,n)=>String(s??'').replace(/[\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,n);

export function buildImageBoard({shapes=[],board,labels=[],widthMm,heightMm,fileName='',source='Picture blueprint',detector='local',notes=''}){
 const box=board&&board.w>0&&board.h>0?board:{x:0,y:0,w:1,h:1};
 const W=widthMm>0?+widthMm:100;const Hmm=heightMm>0?+heightMm:W/(box.aspect>0?box.aspect:box.w/box.h);
 const sx=W/box.w,sy=Hmm/box.h;
 const counters={};const ordered=[...shapes].filter(s=>s&&s.w>0&&s.h>0).sort((a,b)=>Math.round((a.y+a.h/2)/.025)-Math.round((b.y+b.h/2)/.025)||a.x-b.x);
 const parts=[];
 for(const s of ordered){
  const label=clean(s.label||'',80);const local=classifyShape(s,label,box);
  const type=TYPES.includes(s.type)?s.type:local.type;const prefix=PREFIX[type]||'X';counters[prefix]=(counters[prefix]||0)+1;
  const w=r3(s.w*sx),d=r3(s.h*sy);const cyl=(s.shape||local.shape)==='cyl'&&Math.max(w,d)/Math.min(w,d)<1.6;
  const mpn=clean(s.mpn||(looksLikeMpn(label)?label:mpnFromLabel(label)),60);
  const part=makePart({ref:`${prefix}${counters[prefix]}`,value:label||clean(local.name||'',80)||'',mpn,package:clean(s.package||local.package||'',40),type,x:(s.x+s.w/2-box.x-box.w/2)*sx,y:(s.y+s.h/2-box.y-box.h/2)*sy,rot:s.rot===90?90:0,side:'top',w,d,h:local.h,shape:cyl?'cyl':'box',pads:null});
  if(type==='connector'||type==='other'||type==='module')part.leads='none';
  part.confidence=r3(Number.isFinite(+s.confidence)?Math.min(1,Math.max(0,+s.confidence)):(s.labelConfidence?.5+s.labelConfidence/2:.5));part.label=label;
  part.outside=s.x+s.w<box.x||s.x>box.x+box.w||s.y+s.h<box.y||s.y>box.y+box.h;
  parts.push(part);if(parts.length>=3000)break;
 }
 if(!parts.length)throw Error('No components were detected in this picture.');
 return {name:baseName(fileName),revision:'',source,fileName,width:r3(W),height:r3(Hmm),outline:null,holes:[],traces:{},layers:2,parts,detector,imageCrop:{x:r4(box.x),y:r4(box.y),w:r4(box.w),h:r4(box.h)},notes:clean(notes,500)};
}
