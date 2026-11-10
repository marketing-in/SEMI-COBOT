import test from 'node:test';
import assert from 'node:assert/strict';
import {detectShapes,mergeLabels,labelShapes,classifyShape,buildImageBoard} from '../src/detect.js';

// Synthetic pictures: a blueprint (white drawing on blue) and its negative (black on white).
function picture({W=600,H=400,bg=[20,60,140],ink=[255,255,255]}={}){
 const data=new Uint8ClampedArray(W*H*4);for(let i=0;i<W*H;i++){data.set([...bg,255],i*4)}
 const px=(x,y)=>{if(x>=0&&y>=0&&x<W&&y<H)data.set([...ink,255],(y*W+x)*4)};
 const rect=(x,y,w,h,t=2)=>{for(let i=0;i<w;i++)for(let k=0;k<t;k++){px(x+i,y+k);px(x+i,y+h-1-k)}for(let j=0;j<h;j++)for(let k=0;k<t;k++){px(x+k,y+j);px(x+w-1-k,y+j)}};
 const fill=(x,y,w,h)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)px(x+i,y+j)};
 return {data,width:W,height:H,rect,fill,px};
}
function scene(opts){
 const p=picture(opts);
 p.rect(40,30,520,340);          // board outline
 p.rect(120,80,60,60);           // hollow chip
 p.rect(300,90,120,20);          // hollow slot
 p.fill(200,250,30,16);          // filled part
 for(let x=180;x<300;x++)p.px(x,110);  // thin trace between chip and slot
 for(let i=0;i<6;i++)p.fill(360,300+0,6,8),p.fill(360+i*9,300,6,8); // glyph row (text)
 return p;
}
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg}: ${a} vs ${b}`);
const toPx=(s,W,H)=>({x:s.x*W,y:s.y*H,w:s.w*W,h:s.h*H});

test('blueprint picture: board, hollow and filled components found; traces and text ignored',()=>{
 const p=scene();const t0=Date.now();const r=detectShapes(p);const ms=Date.now()-t0;
 assert.ok(ms<1500,'fast enough');
 const b=toPx(r.board,600,400);near(b.x,40,4,'board x');near(b.y,30,4,'board y');near(b.w,520,8,'board w');near(b.h,340,8,'board h');
 const found=r.shapes.map(s=>toPx(s,600,400));
 const has=(x,y,w,h)=>found.some(f=>Math.abs(f.x-x)<=3&&Math.abs(f.y-y)<=3&&Math.abs(f.w-w)<=4&&Math.abs(f.h-h)<=4);
 assert.ok(has(120,80,60,60),'hollow chip '+JSON.stringify(found));assert.ok(has(300,90,120,20),'hollow slot');assert.ok(has(200,250,30,16),'filled part');
 assert.ok(!found.some(f=>f.w>100&&f.h<8),'trace is not a shape');
 assert.ok(!found.some(f=>f.y>=295&&f.y<=312&&f.h<12),'glyph row dropped');
 assert.equal(r.shapes.length,3);
});
test('dark-on-light drawing finds the same boxes and blank images do not throw',()=>{
 const p=scene({bg:[255,255,255],ink:[0,0,0]});const r=detectShapes(p);assert.equal(r.shapes.length,3);
 const blank=picture({W:2,H:2});assert.equal(detectShapes(blank).shapes.length,0);
 const flat=picture({W:100,H:80});const f=detectShapes(flat);assert.equal(f.shapes.length,0);assert.match(f.notes,/No drawing|too small/);
 assert.equal(detectShapes({}).shapes.length,0);
});
test('exclude rectangles and hatched bodies',()=>{
 const p=scene();const r=detectShapes(p,{exclude:[{x:120/600,y:80/400,w:60/600,h:60/400}]});assert.equal(r.shapes.length,2,'excluded box dropped');
 const q=picture();q.rect(40,30,520,340);for(let y=100;y<160;y+=3)for(let x=100;x<180;x++)q.px(x,y);  // hatched rectangle
 const f=detectShapes(q).shapes.map(s=>toPx(s,600,400));assert.ok(f.some(s=>Math.abs(s.x-100)<=6&&Math.abs(s.w-80)<=10&&Math.abs(s.h-60)<=10),'hatched body merged into one box '+JSON.stringify(f));
});
test('labels merge across lines and attach to the nearest shape',()=>{
 const labels=mergeLabels([{text:'8-pin CPU Power',x:.10,y:.10,w:.12,h:.02},{text:'Connector',x:.10,y:.125,w:.08,h:.02},{text:'LAN Controller IC',x:.60,y:.50,w:.14,h:.02},{text:'  ',x:0,y:0,w:.1,h:.02}]);
 assert.equal(labels.length,2);assert.equal(labels[0].text,'8-pin CPU Power Connector');
 const shapes=[{x:.12,y:.16,w:.08,h:.05},{x:.58,y:.53,w:.1,h:.1},{x:.05,y:.9,w:.05,h:.05}];
 const out=labelShapes(shapes,[...labels,{text:'Far away',x:.95,y:.05,w:.04,h:.02}]);
 assert.equal(out[0].label,'8-pin CPU Power Connector');assert.equal(out[1].label,'LAN Controller IC');assert.equal(out[2].label,undefined);
 assert.ok(out[1].labelConfidence>.8);
});
test('classification by keywords then geometry',()=>{
 const board={x:0,y:0,w:1,h:1};
 assert.equal(classifyShape({x:0,y:0,w:.1,h:.1},'CPU Socket (LGA)',board).type,'connector');
 assert.equal(classifyShape({x:0,y:0,w:.3,h:.02},'PCIe x16 Slot',board).type,'connector');
 assert.equal(classifyShape({x:0,y:0,w:.05,h:.05},'Chipset / PCH',board).type,'chip');
 assert.equal(classifyShape({x:0,y:0,w:.02,h:.02},'Capacitors',board).shape,'cyl');
 assert.equal(classifyShape({x:0,y:0,w:.03,h:.02},'VRM MOSFETs',board).type,'transistor');
 assert.equal(classifyShape({x:0,y:0,w:.3,h:.03},'',board).type,'connector','long thin = slot');
 assert.equal(classifyShape({x:0,y:0,w:.2,h:.2},'',board).type,'chip','large square = chip');
 assert.equal(classifyShape({x:0,y:0,w:.02,h:.02},'',board).type,'capacitor','tiny square = capacitor');
 assert.equal(classifyShape({x:0,y:0,w:.03,h:.01},'',board).type,'resistor','tiny oblong = resistor');
});
test('buildImageBoard produces a centred millimetre model with reference designators',()=>{
 const board={x:.1,y:.1,w:.8,h:.6};
 const shapes=[{x:.2,y:.2,w:.1,h:.1,label:'LAN Controller IC'},{x:.6,y:.2,w:.25,h:.03,label:'PCIe x1 Slot'},{x:.4,y:.5,w:.02,h:.02},{x:.5,y:.5,w:.02,h:.02,label:'TPS65217',type:'chip'}];
 const b=buildImageBoard({shapes,board,widthMm:244,fileName:'my_board-v2.pdf',source:'PDF blueprint',detector:'local'});
 assert.equal(b.name,'my board v2');assert.equal(b.width,244);near(b.height,183,.5,'height from aspect');
 assert.equal(b.parts.length,4);const u=b.parts.find(p=>p.label==='LAN Controller IC');assert.equal(u.ref,'U1');assert.equal(u.type,'chip');near(u.w,30.5,.1,'width mm');
 assert.equal(b.parts.find(p=>p.label==='PCIe x1 Slot').ref,'J1');assert.equal(b.parts.find(p=>p.label==='TPS65217').mpn,'TPS65217');
 const sum=b.parts.reduce((s,p)=>s+p.x,0);assert.ok(Math.abs(sum)<244,'coordinates centred on the board');
 assert.deepEqual(b.imageCrop,board);
 assert.throws(()=>buildImageBoard({shapes:[],board,widthMm:100}),/No components/);
});
test('head noun wins in labels and photos of a board on a desk are handled',()=>{
 const board={x:0,y:0,w:1,h:1};
 assert.equal(classifyShape({x:0,y:0,w:.05,h:.05},'USB controller IC',board).type,'chip');
 assert.equal(classifyShape({x:0,y:0,w:.02,h:.02},'Power LED',board).type,'led');
 assert.equal(classifyShape({x:0,y:0,w:.1,h:.1},'CPU socket (LGA)',board).type,'connector');
 // Photo: a wooden desk, a green board with two black chips on it.
 const W=500,H=400,data=new Uint8ClampedArray(W*H*4);const put=(x,y,c)=>data.set([...c,255],(y*W+x)*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)put(x,y,[170,130,80]);
 for(let y=60;y<340;y++)for(let x=80;x<420;x++)put(x,y,[20,110,60]);
 for(let y=120;y<180;y++)for(let x=150;x<210;x++)put(x,y,[15,15,15]);
 for(let y=220;y<250;y++)for(let x=300;x<380;x++)put(x,y,[15,15,15]);
 const r=detectShapes({data,width:W,height:H});
 assert.match(r.notes,/Photo mode/);near(r.board.x*W,80,10,'board x');near(r.board.w*W,340,16,'board w');
 const found=r.shapes.map(s=>[Math.round(s.x*W),Math.round(s.y*H),Math.round(s.w*W),Math.round(s.h*H)]);
 assert.ok(found.some(f=>Math.abs(f[0]-150)<=4&&Math.abs(f[2]-60)<=6),'chip 1 '+JSON.stringify(found));assert.ok(found.some(f=>Math.abs(f[0]-300)<=4&&Math.abs(f[2]-80)<=6),'chip 2');
});
test('group callouts name the whole row of look-alike parts',()=>{
 const shapes=[{x:.50,y:.30,w:.02,h:.03},{x:.53,y:.30,w:.02,h:.03},{x:.56,y:.30,w:.02,h:.03},{x:.59,y:.30,w:.02,h:.03},{x:.50,y:.60,w:.08,h:.08}];
 const out=labelShapes(shapes,[{text:'Capacitors 100nF (C1-C4)',x:.50,y:.26,w:.12,h:.02},{text:'Main controller IC',x:.50,y:.69,w:.1,h:.02}],.09,{x:0,y:0,w:1,h:1,aspect:1.4});
 assert.equal(out.filter(s=>s.label==='Capacitors 100nF (C1-C4)').length,4);assert.equal(out.filter(s=>s.grouped).length,3);assert.equal(out[4].label,'Main controller IC');
 const b=buildImageBoard({shapes:out,board:{x:0,y:0,w:1,h:1,aspect:1.4},widthMm:100});assert.deepEqual(b.parts.filter(p=>p.type==='capacitor').map(p=>p.ref),['C1','C2','C3','C4']);
});
