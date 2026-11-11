import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,withStages,stageInfo,completeStage,autoAdvance,replanQueue,lineRate,completedJobs,seedProduction,estimateJob,floorSummary,nextWindow,referenceRate,lastJob,jobDays,addDays,daysBetween,bookJob,finishJob,setMachineStatus,setProgress,isoDate,modelOf} from '../src/production.js';
import * as THREE from 'three';
import {createLineModels,MACHINE_SIZE} from '../src/factoryModels.js';

const today='2026-10-27';
const seed=()=>seedProduction(today);

test('dates and job durations',()=>{
 assert.equal(addDays(today,5),'2026-11-01');assert.equal(daysBetween('2026-10-27','2026-11-01'),5);
 assert.equal(isoDate(new Date(2026,9,27,23,30)),'2026-10-27');
 assert.equal(jobDays({started:'2026-10-01',finished:'2026-10-01'}),1,'same-day job counts as one day');
 assert.equal(jobDays({started:'2026-10-01',finished:null}),null);
});

test('floor summary reports the last job and the machines working now',()=>{
 const {machines,jobs}=seed();
 const f=floorSummary(machines,jobs);
 assert.equal(f.total,6);assert.equal(f.running,2);assert.equal(f.idle,3);assert.equal(f.maintenance,1);
 assert.equal(f.lines,2);assert.equal(f.idleLines,1);assert.equal(f.active.length,1);
 const last=lastJob(jobs);assert.equal(last.board,'Inverter control IC-7');assert.equal(jobDays(last),18);
 const ref=referenceRate(jobs,118);assert.equal(ref.ratio,1);assert.ok(Math.abs(ref.baseRate-2500/36)<1e-9);
 assert.ok(!referenceRate(jobs,600).similar,'a board five times more complex is not a like-for-like reference');
 assert.equal(referenceRate(jobs,600).ratio,3,'complexity correction is clamped');
});

test('a modest order fits on the idle line and is likely by a generous date',()=>{
 const {machines,jobs}=seed();
 const est=estimateJob(machines,jobs,{qty:500,components:118,due:addDays(today,30)},today);
 assert.ok(est.ok);assert.equal(est.verdict,'Likely');assert.equal(est.start,today);assert.equal(est.linesUsed,1);
 assert.equal(est.days,Math.ceil(500/(2500/36)));assert.equal(est.finish,addDays(today,est.days));
 assert.ok(est.confidence>.75&&est.confidence<=.95);
 assert.match(est.reasons[0],/took 18 days for 2,500 boards on 2 lines/);
 assert.match(est.reasons.join(' '),/2 of 6 machines are working now; 1 of 2 SMT lines is free, 1 in maintenance/);
});

test('verdicts follow the slack against the requested date',()=>{
 const {machines,jobs}=seed();
 const base=estimateJob(machines,jobs,{qty:500,components:118},today);
 assert.equal(base.verdict,'Possible');assert.equal(base.slack,null);
 assert.equal(estimateJob(machines,jobs,{qty:500,components:118,due:base.finish},today).verdict,'Tight');
 const late=estimateJob(machines,jobs,{qty:500,components:118,due:addDays(base.finish,-3)},today);
 assert.equal(late.verdict,'Not by that date');assert.equal(late.slack,-3);assert.match(late.reasons.at(-1),/3 days after the requested/);
 assert.ok(late.confidence<.3);
});

test('when no line is free the job waits for the first expected finish',()=>{
 let state=seed();state=setMachineStatus(state,'smt-2','running');
 const w=nextWindow(state.machines,state.jobs,today);
 assert.ok(w.waiting);assert.equal(w.start,addDays(today,10));assert.equal(w.freesWith.id,'job-4');assert.equal(w.lines,1);
 const est=estimateJob(state.machines,state.jobs,{qty:200,components:100,due:addDays(today,5)},today);
 assert.equal(est.verdict,'Not by that date');assert.match(est.reasons.join(' '),/No line is free today/);
 const down=setMachineStatus(setMachineStatus(seed(),'smt-1','maintenance'),'smt-2','maintenance');
 assert.equal(estimateJob(down.machines,down.jobs,{qty:200,components:100},today).verdict,'Not feasible');
});

test('complex boards slow the rate and big orders take two lines when free',()=>{
 let state=seed();state=finishJob(state,'job-4',today);
 const f=floorSummary(state.machines,state.jobs);assert.equal(f.idleLines,2);assert.equal(f.running,0);
 assert.equal(lastJob(state.jobs).id,'job-4');assert.equal(jobDays(lastJob(state.jobs)),5);
 const simple=estimateJob(state.machines,state.jobs,{qty:1000,components:92},today);
 const complex=estimateJob(state.machines,state.jobs,{qty:1000,components:184},today);
 assert.equal(simple.linesUsed,2);assert.ok(complex.days>simple.days);assert.ok(complex.reasons.some(r=>/rate is reduced/.test(r)));
});

test('booking and finishing jobs moves machines and history',()=>{
 let state=seed();
 const est=estimateJob(state.machines,state.jobs,{qty:300,components:100},today);
 state=bookJob(state,est,{customer:'Orion Boards',board:'Gateway GW-1'},today);
 const job=state.jobs.find(j=>j.customer==='Orion Boards');
 assert.ok(job&&!job.finished);assert.equal(job.expected,est.finish);assert.equal(job.started,today);
 assert.equal(state.machines.find(m=>m.id==='smt-2').job,job.id,'the idle SMT line is taken');
 assert.equal(state.machines.find(m=>m.id==='wave-1').status,'running','one idle downstream station per kind joins the job');
 assert.equal(state.machines.find(m=>m.id==='sel-1').status,'running');
 assert.equal(state.machines.find(m=>m.id==='ict-2').status,'maintenance','maintenance is untouched');
 assert.equal(floorSummary(state.machines,state.jobs).idleLines,0);
 state=setProgress(state,job.id,1.7);assert.equal(state.jobs.find(j=>j.id===job.id).progress,1);
 state=finishJob(state,job.id,addDays(today,4));
 const done=state.jobs.find(j=>j.id===job.id);assert.equal(done.finished,addDays(today,4));assert.equal(jobDays(done),4);
 assert.ok(state.machines.every(m=>m.job!==job.id));assert.equal(state.machines.find(m=>m.id==='smt-2').status,'idle');
 assert.equal(bookJob(state,{ok:false},{}),state,'a failed estimate books nothing');
 assert.equal(estimateJob(state.machines,[],{qty:10,components:5},today).verdict,'Not enough data');
 assert.equal(estimateJob(state.machines,state.jobs,{qty:0,components:5},today).ok,false);
});

test('the estimator learns from the last three finished jobs, newest weighted most',()=>{
 const {jobs}=seedProduction(today);const ref=referenceRate(jobs,118);const done=completedJobs(jobs);
 const want=(3*lineRate(done[0])/1+2*lineRate(done[1])/(118/done[1].components)+1*lineRate(done[2])/(118/done[2].components))/6;
 assert.equal(ref.samples,3);assert.ok(Math.abs(ref.rate-want)<1e-9);assert.equal(ref.job.board,'Inverter control IC-7');
});

test('stages, re-projection from the real pace, and finishing on the last stage',()=>{
 let state=seedProduction(today);const id='job-4';
 const j0=withStages(state.jobs.find(j=>j.id===id));assert.equal(j0.stages.length,STAGES.length);assert.equal(j0.stages[0].done,j0.started,'stages already passed are marked done');
 const info=stageInfo(j0,today);assert.equal(info.current,4,'material stages are done, SMT is running');assert.ok(info.progress>.1&&info.progress<.5);assert.equal(info.remaining,9);
 // SMT done today, five days in: 44 % of the work in 5 days projects 12 days in total.
 state=completeStage(state,id,today);let j=state.jobs.find(x=>x.id===id);
 assert.equal(j.stages[4].done,today);assert.equal(j.expected,addDays(j.started,12));assert.match(state.log[0].text,/SMT done\. Finish moves to/);
 assert.equal(stageInfo(j,today).drift,-2,'two days ahead of the plan');
 for(let k=0;k<7;k++)state=completeStage(state,id,today);j=state.jobs.find(x=>x.id===id);
 assert.equal(j.finished,today);assert.equal(j.progress,1);assert.match(state.log[0].text,/job finished in 5 days \(planned 14\)\. The estimator now learns from it/);
 assert.ok(state.machines.every(m=>m.job!==id),'machines released');
 assert.equal(referenceRate(state.jobs,92).job.id,id,'the completed job is now the newest sample');
});

test('auto mode completes stages as planned time passes and finishes jobs on their date',()=>{
 let state=seedProduction(today);const id='job-4';const planned=state.jobs.find(j=>j.id===id).expected;
 state=autoAdvance(state,today);assert.equal(stageInfo(state.jobs.find(j=>j.id===id),today).current,4,'on schedule: still in SMT');
 const later=addDays(today,5);state=autoAdvance(state,later);const mid=state.jobs.find(j=>j.id===id);
 assert.ok(mid.stages[8].done&&!mid.stages[9].done&&!mid.finished,'through the QA line by its planned date, assembly next');
 state=autoAdvance(state,addDays(planned,1));const done=state.jobs.find(j=>j.id===id);assert.equal(done.finished,planned,'finishes on the planned date');
 assert.ok(state.log.some(l=>/job finished in 14 days \(planned 14\)/.test(l.text)));
});

test('queued jobs move up when a line frees early and start on their day',()=>{
 let state=setMachineStatus(seedProduction(today),'smt-2','running');
 const est=estimateJob(state.machines,state.jobs,{qty:300,components:100},today);assert.equal(est.start,addDays(today,10));
 state=bookJob(state,est,{customer:'Orion',board:'GW-1'},today);const q=state.jobs.find(j=>j.board==='GW-1');assert.equal(q.started,addDays(today,10));
 state=setMachineStatus(state,'smt-2','idle');state=finishJob(state,'job-4',today);
 const moved=state.jobs.find(j=>j.board==='GW-1');assert.equal(moved.started,today,'pulled forward to today');assert.equal(daysBetween(moved.started,moved.expected),daysBetween(q.started,q.expected),'same duration');
 assert.ok(state.machines.some(m=>m.job===moved.id&&m.kind==='SMT line'),'started on a line');assert.ok(state.log.some(l=>/start moved to/.test(l.text)));
 assert.deepEqual(replanQueue(state,today).jobs.map(j=>j.started),state.jobs.map(j=>j.started),'stable once planned');
});

test('the floor is in process order and older saved floors are rebuilt that way',async()=>{
 const {seedProduction:seedP,migrateProduction,AREAS,LINE_STATIONS,areaOf}=await import('../src/production.js');
 const s=seedP(today);assert.deepEqual(s.machines.map(m=>areaOf(m.kind)),['SMT','SMT','THT','THT','Test','Test'],'SMT lines, then through-hole, then test');
 assert.deepEqual(LINE_STATIONS,['Loader','Printer','SPI','Pick & place','Reflow','AOI','X-ray']);assert.ok(!s.machines.some(m=>/reflow|aoi/i.test(m.kind)),'reflow and AOI are part of each line');
 const old={version:1,jobs:s.jobs,machines:[{id:'smt-1',name:'SMT line 1',kind:'SMT line',status:'idle',job:null},{id:'reflow-1',name:'Reflow oven A',kind:'Reflow oven',status:'running',job:'job-4'},{id:'aoi-1',name:'AOI station',kind:'AOI',status:'running',job:null},{id:'wave-1',name:'Wave solder',kind:'Wave solder',status:'maintenance',job:null}]};
 const m=migrateProduction(old,today);assert.equal(m.version,2);assert.ok(!m.machines.some(x=>x.id==='reflow-1'||x.id==='aoi-1'));assert.equal(m.machines.find(x=>x.id==='smt-1').status,'idle','kept');assert.equal(m.machines.find(x=>x.id==='wave-1').status,'maintenance','kept');assert.equal(m.jobs,old.jobs);
 assert.equal(migrateProduction(s),s,'current floors are left alone');assert.equal(migrateProduction(null),null);assert.equal(AREAS.length,4);
});

test('each machine on the floor is drawn with its own 3D model, and every model builds', () => {
 const models=seedProduction(today).machines.map(m=>[m.id,modelOf(m)]);
 assert.deepEqual(models,[['smt-1','smt'],['smt-2','smt'],['wave-1','wave'],['sel-1','selective'],['ict-1','ict'],['ict-2','probe']]);
 const kit=createLineModels(THREE);
 for(const id of Object.keys(MACHINE_SIZE)){const {w,d}=MACHINE_SIZE[id],m=kit.machine(id,{x:0,w,d,cy:.92,roof:false});
  assert.equal(m.lamps.length,3,id+' has a signal tower');assert.ok(m.hit.length>5,id+' has a housing');
  const box=new THREE.Box3().setFromObject(m.group);assert.ok(box.max.x-box.min.x<=w+.2&&box.max.z-box.min.z<=d+.5,id+' stays in its footprint');
  m.update(1.7,true,2.6);m.update(0,false,0)}
 kit.dispose();
});

test('boards move from production to completed, ready for dispatch and dispatched', async () => {
 const {boardFlow,flowSummary,moveBoards}=await import('../src/production.js');
 const st=seedProduction(today),j4=st.jobs.find(j=>j.id==='job-4');
 const f=boardFlow(j4,today);assert.equal(f.qty,1500);assert.equal(f.inProduction+f.completed+f.ready+f.dispatched,1500);assert.ok(f.built>0&&f.built<1500,'completed follows progress');
 assert.deepEqual(boardFlow(st.jobs.find(j=>j.id==='job-3'),today),{qty:2500,built:2500,inProduction:0,completed:0,ready:500,dispatched:2000,queued:false});
 let s=moveBoards(st,'job-4','built',100000,today);assert.equal(boardFlow(s.jobs.find(j=>j.id==='job-4'),today).inProduction,0,'clamped to what is left');
 s=moveBoards(s,'job-4','ready',600,today);s=moveBoards(s,'job-4','dispatch',400,today,'BlueDart 123');
 const g=boardFlow(s.jobs.find(j=>j.id==='job-4'),today);assert.deepEqual([g.completed,g.ready,g.dispatched],[900,200,400]);
 assert.deepEqual(s.jobs.find(j=>j.id==='job-4').dispatches,[{date:today,qty:400,note:'BlueDart 123'}]);assert.match(s.log[0].text,/400 boards of Motor driver MD-3 Rev B dispatched to Northwind Robotics \(BlueDart 123\)/);
 assert.equal(moveBoards(s,'job-4','dispatch',0,today),s,'nothing to move leaves the state alone');
 const sum=flowSummary(s.jobs,today);assert.equal(sum.dispatched,1200+400+2000+400);
});
test('a new workspace has no sample jobs, and saved sample jobs are removed', async () => {
 const {emptyProduction,withoutSamples,isSampleJob}=await import('../src/production.js');
 const e=emptyProduction(today);assert.equal(e.jobs.length,0);assert.ok(e.machines.every(m=>m.status==='idle'&&!m.job));
 const mine={id:'job-x1',customer:'Orion Boards',board:'GW-1',qty:10,started:today,expected:today,finished:null};
 const cleaned=withoutSamples({...seedProduction(today),jobs:[...seedProduction(today).jobs,mine]});
 assert.deepEqual(cleaned.jobs.map(j=>j.id),['job-x1']);assert.ok(!cleaned.machines.some(m=>m.job==='job-4'));assert.equal(cleaned.machines.find(m=>m.id==='ict-2').status,'maintenance');
 assert.equal(isSampleJob({id:'job-1',customer:'Someone real'}),false,'only the sample customers count');
});

test('the whole chain runs material, factory line, assembly, testing and final product in order',async()=>{
 const {STAGE_GROUPS,reworkStage,jobFromOrder,serialRange}=await import('../src/production.js');
 assert.deepEqual([...new Set(STAGES.map(s=>s.group))],STAGE_GROUPS);
 assert.deepEqual(STAGES.map(s=>s.key),['incoming','iqc','kitting','storing','smt','pcba','tht','wave','qa','assembly','testing','final']);
 assert.ok(Math.abs(STAGES.reduce((a,s)=>a+s.share,0)-1)<1e-9);assert.deepEqual(STAGES.filter(s=>s.gate).map(s=>s.key),['iqc','qa','testing','final']);
 // Rework only at an open gate, counted per gate, the stage stays open.
 let state=seedProduction(today);const id='job-4';
 assert.equal(reworkStage(state,id,5,today),state,'SMT is not a gate');
 for(let k=0;k<4;k++)state=completeStage(state,id,today);// SMT, PCBA, THT, wave
 const j=state.jobs.find(x=>x.id===id);assert.deepEqual(j.serials,serialRange(j),'serial numbers from PCBA');assert.equal(j.serials.first,'SC-4-0001');assert.equal(j.serials.last,'SC-4-1500');
 state=reworkStage(state,id,12,today,'solder bridges');const r=state.jobs.find(x=>x.id===id);
 assert.equal(r.rework.qa,12);assert.equal(stageInfo(r,today).stages[8].active,true,'QA line still open');assert.match(state.log[0].text,/12 boards failed QA line and went to rework \(solder bridges\)/);
 // An order from the BOM tool: estimated from history, linked to its saved list.
 const o=jobFromOrder(seedProduction(today),{customer:'Orion',board:'GW-2',qty:300,components:90,due:addDays(today,30),listId:'list-1',quote:'Q-1'},today);
 assert.equal(o.estimated,true);assert.equal(o.job.listId,'list-1');assert.equal(o.job.source,'BOM tool');assert.ok(o.state.jobs.some(x=>x.id===o.job.id&&x.quote==='Q-1'));
 // Without history it is planned to the requested date.
 const empty={machines:seedProduction(today).machines.map(m=>({...m,status:'idle',job:null})),jobs:[],log:[]};
 const p=jobFromOrder(empty,{customer:'Orion',board:'GW-3',qty:50,components:40,due:addDays(today,20)},today);
 assert.equal(p.estimated,false);assert.equal(p.job.expected,addDays(today,20));assert.ok(p.state.machines.some(m=>m.job===p.job.id),'started on a free line');
});

test('factory setup: create lines with their own stations, add, rename, reorder and remove machines',async()=>{
 const p=await import('../src/production.js');
 let s=p.emptyProduction('2026-11-11');const before=s.machines.length;
 s=p.clearFloor(s);assert.equal(s.machines.length,0);assert.equal(s.floorSet,true);
 s=p.addLine(s,{name:'',stations:['Loader','Printer','Pick & place','Pick & place 2','Reflow','  ']});
 assert.equal(s.machines[0].name,'SMT line 1');assert.deepEqual(s.machines[0].stations,['Loader','Printer','Pick & place','Pick & place 2','Reflow']);
 s=p.addLine(s,{name:'Fast line'});assert.deepEqual(p.stationsOf(s.machines[1]),p.LINE_STATIONS,'a new line gets the usual stations');
 s=p.addMachine(s,{kind:'Conformal coating'});s=p.addMachine(s,{name:'Wave 1',kind:'Wave solder'});s=p.addMachine(s,{name:'Odd',kind:'Laser'});
 assert.deepEqual(s.machines.map(m=>m.kind),['SMT line','SMT line','Conformal coating','Wave solder','Other']);
 assert.equal(p.areaOf('Conformal coating'),'Other');assert.equal(p.areaOf('Wave solder'),'THT');assert.equal(p.modelOf(s.machines[2]),null);
 const sum=p.floorSummary(s.machines,[]);assert.deepEqual([sum.total,sum.lines,sum.idleLines],[5,2,2]);
 const id=s.machines[3].id;s=p.updateMachine(s,id,{name:'Wave A',kind:'SMT line'});assert.equal(s.machines[3].name,'Wave A');assert.equal(s.machines[3].kind,'Wave solder','a machine cannot become a line');
 s=p.updateMachine(s,s.machines[0].id,{stations:[]});assert.deepEqual(s.machines[0].stations,p.LINE_STATIONS,'a line keeps at least its stations');
 s=p.moveMachine(s,id,-1);assert.equal(s.machines[2].id,id);assert.equal(p.moveMachine(s,s.machines[0].id,-1),s);
 s=p.removeMachine(s,id);assert.equal(s.machines.length,4);
 const est=p.estimateJob(s.machines,p.seedProduction('2026-11-11').jobs,{qty:500,components:90},'2026-11-11');assert.ok(est.ok);assert.equal(est.window.lines,2,'estimates use the lines the user created');
 assert.ok(before>0);
});
