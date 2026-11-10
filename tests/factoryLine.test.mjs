import test from 'node:test';
import assert from 'node:assert/strict';
import {makePart} from '../src/blueprint.js';
import {STATIONS,planProduction,planReflow,planPrinter,boardPads,inspectBoard,schedule,boardAt,xrayKind,noise,SPEC,TRANSFER} from '../src/factoryLine.js';

const board={width:60,height:40,layers:2,name:'T'};
const parts=[
 makePart({ref:'U1',mpn:'STM32F103C8T6',package:'LQFP-48',type:'chip',x:0,y:0}),
 makePart({ref:'U2',mpn:'ATSAMD21G18A-MU',package:'QFN-48',type:'chip',x:-18,y:10}),
 makePart({ref:'U3',mpn:'XC7A35T-1CPG236C',package:'BGA-236',type:'chip',x:18,y:-8,w:10,d:10}),
 makePart({ref:'C1',value:'100nF',package:'0402',type:'capacitor',x:-12,y:-12}),
 makePart({ref:'R1',value:'10k',package:'0201',type:'resistor',x:10,y:12,rot:90}),
 makePart({ref:'J1',mpn:'PJ-002A',package:'DC jack',type:'connector',x:-25,y:-14,leads:'tht'}),
 makePart({ref:'R9',value:'1k',package:'0603',type:'resistor',x:8,y:8,side:'bottom'}),
];

test('the line has the seven stations in order',()=>{
 assert.deepEqual(STATIONS.map(s=>s.id),['loader','printer','spi','pnp','reflow','aoi','xray']);
});

test('pads follow the part rotation, and through-hole pads are not printed',()=>{
 const r=makePart({ref:'R1',value:'1k',package:'0603',type:'resistor',x:10,y:5,rot:90}),flat=boardPads([{...r,rot:0}]),turned=boardPads([r]);
 assert.equal(turned.length,2);assert.ok(Math.abs(flat[0].y-5)<1e-9&&Math.abs(turned[0].x-10)<1e-9,'a 90° turn moves the pads from the x axis to the y axis');
 assert.equal(turned[0].w,flat[0].h);
 const p=planProduction(board,parts);assert.ok(!p.pads.some(q=>q.ref==='J1'||q.ref==='R9'),'only top-side SMD pads get paste');
});

test('the stencil thins for fine pitch and flags apertures with a poor area ratio',()=>{
 const pr=planPrinter(boardPads(parts.slice(0,5)));assert.equal(pr.stencil,.1);
 for(const a of pr.apertures)assert.ok(Math.abs(a.ar-(a.w*a.h)/(2*(a.w+a.h)*pr.stencil))<.01);
 assert.equal(pr.lowAr,pr.apertures.filter(a=>a.ar<.66).length);
});

test('the reflow recipe meets the SAC305 profile for small and large boards',()=>{
 for(const [w,h,l] of [[30,20,2],[60,40,2],[160,100,6],[300,200,8]]){const r=planReflow({width:w,height:h,layers:l},[]);
  assert.ok(r.pass,`${w}×${h}: peak ${r.peak} tal ${r.tal} soak ${r.soak} ramp ${r.ramp}`);
  assert.ok(r.speedMmin>=.4&&r.speedMmin<=1.5,'plausible conveyor speed '+r.speedMmin);assert.ok(r.zones.every(z=>z.set<=285));
  const pts=r.points;for(let i=1;i<pts.length;i++)assert.ok(pts[i].t>pts[i-1].t);assert.ok(Math.abs(Math.max(...pts.map(p=>p.T))-r.peak)<3)}
});

test('X-ray covers BGAs and bottom-terminated parts, else samples the biggest leaded ICs',()=>{
 assert.equal(xrayKind({package:'BGA-236'}),'bga');assert.equal(xrayKind({package:'QFN-48'}),'bottom');assert.equal(xrayKind({package:'LQFP-48'}),null);
 const p=planProduction(board,parts);assert.deepEqual(p.xrayParts.map(x=>x.ref).sort(),['U2','U3']);
 assert.equal(p.xrayMode,'hidden');
 const sample=planProduction(board,parts.filter(x=>!['U2','U3'].includes(x.ref)));assert.equal(sample.xrayMode,'sample');assert.deepEqual(sample.xrayParts.map(x=>x.ref),['U1'],'the LQFP is sampled');
 assert.equal(sample.results[0].xray[0].kind,'leaded');assert.equal(sample.results[0].xray[0].limit,SPEC.xray.leaded);
 const none=planProduction(board,parts.filter(x=>['C1','R1'].includes(x.ref)));assert.equal(none.xrayMode,'none');assert.equal(none.times.xray,2,'nothing to X-ray: the board passes straight through');
});

test('inspection is repeatable per board, and defects follow the paste',()=>{
 const p=planProduction(board,parts,{boards:3});
 assert.deepEqual(inspectBoard(p,1),inspectBoard(p,1));assert.notDeepEqual(inspectBoard(p,0).deposits.map(d=>d.volume),inspectBoard(p,1).deposits.map(d=>d.volume));
 for(const r of p.results){
  for(const d of r.deposits){const s=SPEC.spi;assert.equal(d.status,d.volume<s.min||d.volume>s.max?'fail':d.volume<s.warnLow||d.volume>s.warnHigh?'warn':'pass')}
  for(const a of r.aoi){const starved=r.deposits.some(d=>d.ref===a.ref&&d.volume<SPEC.spi.min);if(starved)assert.ok(a.defects.length,'a starved joint is caught by AOI: '+a.ref)}
  for(const x of r.xray)assert.equal(x.pass,x.voids<=x.limit);
  assert.equal(r.pass,r.aoi.every(a=>a.pass)&&r.xray.every(x=>x.pass))}
 assert.ok(noise('a')>=0&&noise('a')<1&&noise('a')===noise('a'));
});

test('the schedule keeps one board per machine, transfers between them, and spaces boards in the oven',()=>{
 const p=planProduction(board,parts,{boards:6}),ids=STATIONS.map(s=>s.id);
 for(let i=0;i<p.schedule.length;i++){const row=p.schedule[i];
  ids.forEach((id,j)=>{assert.ok(Math.abs(row[id].out-row[id].in-p.times[id])<.02);if(j)assert.ok(row[id].in>=row[ids[j-1]].out+TRANSFER-.01)});
  if(i){const prev=p.schedule[i-1];for(const id of ids){if(id==='reflow')assert.ok(row[id].in>=prev[id].in+p.spacing.reflow-.01);else assert.ok(row[id].in>=prev[id].out-.01,`${id} holds one board`)}}}
 assert.equal(p.stats.takt,Math.max(...Object.values(p.spacing)));assert.ok(p.stats.perHour>0);
 const late=schedule(p.times,p.spacing,6);assert.deepEqual(late,p.schedule);
});

test('boards are located in a station, on the conveyor, queued or done',()=>{
 const p=planProduction(board,parts,{boards:2}),r=p.schedule[1];
 assert.equal(boardAt(p,1,r.loader.in-1).state,'queued');
 const mid=boardAt(p,1,(r.pnp.in+r.pnp.out)/2);assert.equal(mid.state,'in');assert.equal(mid.station,'pnp');assert.ok(mid.progress>.4&&mid.progress<.6);
 const moving=boardAt(p,1,r.printer.out+TRANSFER/2);assert.equal(moving.state,'moving');assert.equal(moving.from,1);
 assert.equal(boardAt(p,1,r.xray.out+1).state,'done');
});
