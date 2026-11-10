import test from 'node:test';
import assert from 'node:assert/strict';
import {partDetail,synthTraces,toBoard} from '../src/boardDetail.js';
import {makePart} from '../src/blueprint.js';
import {referenceBoard} from '../src/data.js';

test('chip passives get two end caps and solder on both pads, no leads',()=>{
 const r=makePart({ref:'R1',package:'0603',value:'10k',x:0,y:0});const d=partDetail(r);
 assert.equal(d.caps.length,2);assert.equal(d.leads.length,0);assert.equal(d.solder.length,2);assert.ok(d.solder.every(s=>s.side==='top'));
 const alongX=r.w>=r.d;for(const c of d.caps)assert.ok(alongX?Math.abs(Math.abs(c.x)+c.w/2-r.w/2)<1e-9:Math.abs(Math.abs(c.y)+c.d/2-r.d/2)<1e-9,'caps sit flush with the body ends');
});

test('gull-wing ICs get one lead per pad, running from the body edge to the pad',()=>{
 const u=makePart({ref:'U1',package:'SOIC-8',x:10,y:5});const pads=u.pads||[];const d=partDetail(u);
 assert.ok(d.leads.length>=8,'one lead per outer pad');
 for(const l of d.leads){const start=(l.axis==='x'?Math.abs(l.x):Math.abs(l.y))-l.len/2;assert.ok(Math.abs(start-(l.axis==='x'?u.w/2:u.d/2))<1e-6,'starts at the body edge');assert.ok(l.len>0&&l.width>0)}
 const q=makePart({ref:'U2',package:'LQFP-48'});const dq=partDetail(q);assert.ok(dq.leads.some(l=>l.axis==='x')&&dq.leads.some(l=>l.axis==='y'),'quad packages have leads on all four sides');
});

test('through-hole parts get pins and solder joints on the far side',()=>{
 const top=makePart({ref:'J1',package:'PinHeader_1x04_P2.54mm',type:'connector'});const d=partDetail(top);
 assert.ok(d.pins.length>=2);assert.equal(d.solder.filter(s=>s.joint).length,d.pins.length);assert.ok(d.solder.filter(s=>s.joint).every(s=>s.side==='bottom'),'joints are on the back of a top-side part');
 const bottomPart=makePart({ref:'J2',package:'PinHeader_1x04_P2.54mm',type:'connector',side:'bottom'});assert.ok(partDetail(bottomPart).solder.filter(s=>s.joint).every(s=>s.side==='top'));
});

test('board coordinates follow the part rotation',()=>{
 const p={x:10,y:20,rot:90};const [x,y]=toBoard(p,1,0);assert.ok(Math.abs(x-10)<1e-9&&Math.abs(y-19)<1e-9,'local +x points up the screen at 90°');
});

test('illustrative routing connects passives to chip pins and drops to a bottom ground track',()=>{
 const t=synthTraces(referenceBoard.parts,referenceBoard);
 assert.ok(t.illustrative);assert.ok(t.top.length>=24,'two top segments plus a via stub per passive');assert.equal(t.vias.length,14,'one via per two-terminal part: six capacitors, six resistors, two diodes');assert.ok(t.bottom.length===t.vias.length+1,'a drop per via plus the ground track');
 const W=referenceBoard.width/2,H=referenceBoard.height/2;for(const s of [...t.top,...t.bottom])for(let i=0;i<4;i+=2)assert.ok(Math.abs(s[i])<=W&&Math.abs(s[i+1])<=H,'inside the board');
 for(const s of t.top)assert.ok(s[0]===s[2]||s[1]===s[3],'tracks run horizontally or vertically');
 assert.deepEqual(synthTraces(referenceBoard.parts,referenceBoard),t,'deterministic');assert.deepEqual(synthTraces([],referenceBoard).top,[]);
});
