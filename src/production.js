// Production capacity model: machines on the floor, jobs that ran on them, and a feasibility
// estimate for a new request from another board company. Pure functions over plain data so the
// logic is unit-testable; dates are ISO calendar strings (YYYY-MM-DD).

// The floor in process order: each SMT line is one unit with its own stations (loader to X-ray),
// then the through-hole area, then test.
export const MACHINE_KINDS=['SMT line','Wave solder','Selective solder','ICT / test','Burn-in','Conformal coating','Depaneling','Assembly bench','Other'];
export const LINE_STATIONS=['Loader','Printer','SPI','Pick & place','Reflow','AOI','X-ray'];
export const AREAS=[['SMT','SMT lines',['SMT line']],['THT','Through-hole',['Wave solder','Selective solder']],['Test','Test',['ICT / test','Burn-in']],['Other','Other equipment',['Conformal coating','Depaneling','Assembly bench','Other']]];
export const STATUSES=['running','idle','maintenance'];
const DAY=86400000;

export const isoDate=d=>{const x=d instanceof Date?d:new Date(d);return new Date(Date.UTC(x.getFullYear(),x.getMonth(),x.getDate())).toISOString().slice(0,10)};
export const todayIso=()=>isoDate(new Date());
const parse=iso=>{const [y,m,d]=String(iso).split('-').map(Number);return Date.UTC(y,m-1,d)};
export const addDays=(iso,n)=>new Date(parse(iso)+n*DAY).toISOString().slice(0,10);
// Calendar days from a to b (a < b positive). A job started and finished on the same day counts as 1.
export const daysBetween=(a,b)=>Math.round((parse(b)-parse(a))/DAY);
export const jobDays=j=>j.finished?Math.max(1,daysBetween(j.started,j.finished)):null;
export const formatDate=iso=>{if(!iso)return '—';const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})};

// Demo floor: two SMT lines, the through-hole and test stations, and one job in progress. Dates are
// relative to `today` so the sample always reads as current.
export function seedProduction(today=todayIso()){
 const machines=[
  {id:'smt-1',name:'SMT line 1',kind:'SMT line',status:'running',job:'job-4'},
  {id:'smt-2',name:'SMT line 2',kind:'SMT line',status:'idle',job:null},
  {id:'wave-1',name:'Wave solder',kind:'Wave solder',status:'idle',job:null},
  {id:'sel-1',name:'Selective solder',kind:'Selective solder',status:'idle',job:null},
  {id:'ict-1',name:'ICT / functional test',kind:'ICT / test',status:'running',job:'job-4'},
  {id:'ict-2',name:'Flying probe test',kind:'ICT / test',status:'maintenance',job:null}];
 const jobs=[
  {id:'job-1',customer:'Northwind Robotics',board:'Motor driver MD-3',qty:1200,components:86,lines:1,started:addDays(today,-62),finished:addDays(today,-50),expected:addDays(today,-50),notes:'Repeat order',ready:1200,dispatched:1200},
  {id:'job-2',customer:'Helix Medical',board:'Sensor hub SH-2',qty:400,components:142,lines:1,started:addDays(today,-44),finished:addDays(today,-37),expected:addDays(today,-36),notes:'First article approved day 2',ready:400,dispatched:400},
  {id:'job-3',customer:'Aster Energy',board:'Inverter control IC-7',qty:2500,components:118,lines:2,started:addDays(today,-30),finished:addDays(today,-12),expected:addDays(today,-10),notes:'Both lines; AOI bottleneck week 2',ready:2500,dispatched:2000},
  {id:'job-4',customer:'Northwind Robotics',board:'Motor driver MD-3 Rev B',qty:1500,components:92,lines:1,started:addDays(today,-5),finished:null,expected:addDays(today,9),progress:.35,notes:'In progress'}];
 return {machines,jobs,version:2};
}
// Saved floors from the first version listed reflow ovens and the AOI apart from the lines. They are
// part of each SMT line now: the floor is rebuilt in process order, keeping jobs and the status of
// machines that still exist.
export function migrateProduction(saved,today=todayIso()){
 if(!saved||!Array.isArray(saved.machines)||!Array.isArray(saved.jobs))return null;
 if((saved.version||1)>=2)return saved;
 const old=new Map(saved.machines.map(m=>[m.id,m]));
 const machines=seedProduction(today).machines.map(m=>{const o=old.get(m.id);return o?{...m,status:o.status,job:o.job}:m});
 return {...saved,machines,version:2};
}
export const areaOf=kind=>(AREAS.find(a=>a[2].includes(kind))||AREAS[3])[0];
// Which 3D model shows a machine: the whole line for an SMT line, else the machine's own form. Test
// stations are a bed-of-nails ICT press unless the name says flying probe.
export const modelOf=m=>m.kind==='SMT line'?'smt':m.kind==='Wave solder'?'wave':m.kind==='Selective solder'?'selective':m.kind==='ICT / test'?(/flying|probe/i.test(m.name||'')?'probe':'ict'):null;

// --- Factory setup ----------------------------------------------------------------------------------
// Every factory is different: the user builds their own floor. A line is an SMT line with the stations
// it really has (in order); other machines are single units of a kind. The floor starts as a typical
// one (two lines, wave, selective, two test stations) until the user sets it up (floorSet).
export const stationsOf=m=>Array.isArray(m.stations)&&m.stations.length?m.stations:LINE_STATIONS;
const cleanText=(v,max)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const cleanStations=list=>{const out=(Array.isArray(list)?list:[]).map(x=>cleanText(x,30)).filter(Boolean).slice(0,16);return out.length?out:[...LINE_STATIONS]};
const machineId=p=>p+'-'+Math.random().toString(36).slice(2,8);
const nextName=(machines,base)=>{const used=new Set(machines.map(m=>m.name.toLowerCase()));let n=1;while(used.has(`${base} ${n}`.toLowerCase()))n++;return `${base} ${n}`};
export function addLine(state,{name,stations}={}){
 const m={id:machineId('line'),name:cleanText(name,60)||nextName(state.machines,'SMT line'),kind:'SMT line',status:'idle',job:null,stations:cleanStations(stations)};
 return {...state,machines:[...state.machines,m]};
}
export function addMachine(state,{name,kind}={}){
 if(kind==='SMT line')return addLine(state,{name});
 const k=MACHINE_KINDS.includes(kind)?kind:'Other';
 const m={id:machineId('m'),name:cleanText(name,60)||nextName(state.machines,k==='Other'?'Machine':k),kind:k,status:'idle',job:null};
 return {...state,machines:[...state.machines,m]};
}
// Rename, change a machine's kind (a line stays a line) or a line's stations.
export function updateMachine(state,id,patch={}){
 return {...state,machines:state.machines.map(m=>{if(m.id!==id)return m;const next={...m};
  if('name' in patch)next.name=cleanText(patch.name,60)||m.name;
  if('kind' in patch&&m.kind!=='SMT line'&&patch.kind!=='SMT line'&&MACHINE_KINDS.includes(patch.kind))next.kind=patch.kind;
  if('stations' in patch&&m.kind==='SMT line')next.stations=cleanStations(patch.stations);
  return next})};
}
export function removeMachine(state,id){return {...state,machines:state.machines.filter(m=>m.id!==id)}}
export function moveMachine(state,id,dir){const i=state.machines.findIndex(m=>m.id===id),j=i+(dir<0?-1:1);if(i<0||j<0||j>=state.machines.length)return state;const ms=[...state.machines];[ms[i],ms[j]]=[ms[j],ms[i]];return {...state,machines:ms}}
export function clearFloor(state){return {...state,machines:[],floorSet:true}}

export const activeJobs=jobs=>jobs.filter(j=>!j.finished).sort((a,b)=>a.expected<b.expected?-1:1);
export const completedJobs=jobs=>jobs.filter(j=>j.finished).sort((a,b)=>a.finished<b.finished?1:-1);
export const lastJob=jobs=>completedJobs(jobs)[0]||null;

export function floorSummary(machines,jobs){
 const running=machines.filter(m=>m.status==='running'),idle=machines.filter(m=>m.status==='idle'),down=machines.filter(m=>m.status==='maintenance');
 const lines=machines.filter(m=>m.kind==='SMT line');
 return {total:machines.length,running:running.length,idle:idle.length,maintenance:down.length,lines:lines.length,idleLines:lines.filter(m=>m.status==='idle').length,runningLines:lines.filter(m=>m.status==='running').length,utilization:machines.length?running.length/machines.length:0,active:activeJobs(jobs)};
}

// Boards per line per day the shop achieved on a finished job, from its own record.
export const lineRate=j=>{const d=jobDays(j);return d?j.qty/(d*Math.max(1,j.lines||1)):0};

// Reference rate for a new board: the most recent finished job, corrected for how much more or
// less placement work each board carries. The correction is clamped so one odd job cannot swing it.
// The estimator learns from history: the last three finished jobs, newest weighted most (3:2:1),
// each corrected for how much more or less placement work the new board carries. When a job
// completes it becomes the newest sample, so every quote after it uses the new pace.
export function referenceRate(jobs,components){
 const done=completedJobs(jobs).filter(j=>lineRate(j)>0).slice(0,3);const ref=done[0];if(!ref)return null;
 const clampRatio=r=>Math.min(3,Math.max(1/3,r));
 const ratioOf=j=>components>0&&j.components>0?clampRatio(components/j.components):1;
 const weights=[3,2,1].slice(0,done.length),wsum=weights.reduce((a,b)=>a+b,0);
 const rate=done.reduce((sum,j,i)=>sum+weights[i]*lineRate(j)/ratioOf(j),0)/wsum;
 const ratio=ratioOf(ref),similar=ratio>=.5&&ratio<=2;
 return {job:ref,baseRate:lineRate(ref),rate,ratio,similar,days:jobDays(ref),samples:done.length,sampleJobs:done.map(j=>j.board)};
}

// When could a new job start and on how many lines? Idle lines start today; otherwise the first
// line frees when its job is expected to finish.
export function nextWindow(machines,jobs,today){
 const lines=machines.filter(m=>m.kind==='SMT line'&&m.status!=='maintenance');
 const idle=lines.filter(m=>m.status==='idle');
 if(idle.length)return {start:today,lines:idle.length,waiting:false,freesWith:null};
 const act=activeJobs(jobs).map(j=>({job:j,at:j.expected&&j.expected>today?j.expected:today}));
 if(!lines.length||!act.length)return {start:today,lines:lines.length?lines.length:0,waiting:!lines.length,freesWith:null};
 const first=act.sort((a,b)=>a.at<b.at?-1:1)[0];
 const freed=act.filter(a=>a.at===first.at).reduce((s,a)=>s+Math.max(1,a.job.lines||1),0);
 return {start:addDays(first.at,1),lines:Math.min(lines.length,freed),waiting:true,freesWith:first.job};
}

// The answer for a visiting customer: can we take this job, and by when?
export function estimateJob(machines,jobs,req,today=todayIso()){
 const qty=Math.max(0,Math.floor(Number(req.qty)||0)),components=Math.max(0,Math.floor(Number(req.components)||0));
 const ref=referenceRate(jobs,components),window=nextWindow(machines,jobs,today);
 const floor=floorSummary(machines,jobs);
 const reasons=[];
 if(!ref||!qty)return {ok:false,verdict:'Not enough data',confidence:0,reasons:[!ref?'No finished job to base a rate on. Mark a job as finished first.':'Enter a quantity of boards.'],ref,window,floor,qty,components,days:null,start:null,finish:null,linesUsed:0,slack:null,buffer:2};
 if(!window.lines)return {ok:false,verdict:'Not feasible',confidence:0,reasons:['Every SMT line is down for maintenance; nothing can be scheduled until one returns.'],ref,window,floor,qty,components,days:null,start:null,finish:null,linesUsed:0,slack:null,buffer:2};
 const linesUsed=Math.max(1,Math.min(window.lines,qty>=800?2:1));
 const perDay=ref.rate*linesUsed;
 if(!(perDay>0))return {ok:false,verdict:'Not enough data',confidence:0,reasons:['The last finished job has no usable quantity or duration, so no rate can be derived.'],ref,window,floor,qty,components,days:null,start:null,finish:null,linesUsed:0,slack:null,buffer:2};
 const days=Math.max(1,Math.ceil(qty/perDay));
 const start=window.start,finish=addDays(start,days);
 const due=req.due||null;
 const slack=due?daysBetween(finish,due):null;
 const buffer=2;
 let verdict,confidence;
 if(slack===null){verdict='Possible';confidence=ref.similar?.8:.6}
 else if(slack>=buffer){verdict='Likely';confidence=Math.min(.95,(ref.similar?.75:.55)+Math.min(.2,slack*.02))}
 else if(slack>=0){verdict='Tight';confidence=ref.similar?.5:.35}
 else{verdict='Not by that date';confidence=Math.max(.05,.3-Math.min(.25,-slack*.02))}
 reasons.push(`Last finished job (${ref.job.board} for ${ref.job.customer}) took ${ref.days} day${ref.days===1?'':'s'} for ${fmtInt(ref.job.qty)} boards on ${ref.job.lines||1} line${(ref.job.lines||1)===1?'':'s'}: about ${fmtInt(Math.round(ref.baseRate))} boards per line per day.`);
 if(ref.samples>1)reasons.push(`The pace is a weighted average of the last ${ref.samples} finished jobs (newest counts most): about ${fmtInt(Math.round(ref.rate))} boards per line per day for this board.`);
 if(ref.ratio!==1)reasons.push(`This board carries ${components} placements against ${ref.job.components} on that job, so the rate is ${ref.ratio>1?'reduced':'raised'} to about ${fmtInt(Math.round(ref.rate))} per line per day${ref.similar?'':' (a loose comparison; the boards differ a lot)'}.`);
 reasons.push(`${floor.running} of ${floor.total} machines are working now; ${floor.idleLines} of ${floor.lines} SMT lines ${floor.idleLines===1?'is':'are'} free${floor.maintenance?`, ${floor.maintenance} in maintenance`:''}.`);
 if(window.waiting)reasons.push(`No line is free today. The first frees on ${formatDate(window.freesWith.expected)} when ${window.freesWith.board} for ${window.freesWith.customer} is expected to finish, so work would start ${formatDate(start)}.`);
 else reasons.push(`Work could start today on ${linesUsed} line${linesUsed===1?'':'s'}.`);
 reasons.push(`${fmtInt(qty)} boards at about ${fmtInt(Math.round(perDay))} per day: ${days} day${days===1?'':'s'}, finishing around ${formatDate(finish)}.`);
 if(due)reasons.push(slack>=0?`That leaves ${slack} day${slack===1?'':'s'} before the requested ${formatDate(due)}.`:`That is ${-slack} day${slack===-1?'':'s'} after the requested ${formatDate(due)}. Earliest realistic delivery: ${formatDate(finish)}.`);
 return {ok:true,verdict,confidence,reasons,ref,window,floor,qty,components,days,start,finish,linesUsed,slack,due,buffer,perDay};
}

const fmtInt=n=>Number(n).toLocaleString('en-US');

// Booking a quoted job: it becomes active, and idle lines (plus one idle station of each downstream
// kind) are marked running on it.
export function bookJob(state,est,req,today=todayIso()){
 if(!est?.ok)return state;
 const id='job-'+Math.random().toString(36).slice(2,8);
 const job=withStages({id,customer:String(req.customer||'New customer').trim()||'New customer',board:String(req.board||'New board').trim()||'New board',qty:est.qty,components:est.components,lines:est.linesUsed,started:est.start,finished:null,expected:est.finish,planned:est.finish,progress:0,notes:est.start===today?'Booked today':`Starts ${formatDate(est.start)}`});
 let assigned=0;
 const machines=state.machines.map(m=>{if(est.start!==today||m.status!=='idle')return m;if(m.kind==='SMT line'&&assigned<est.linesUsed){assigned++;return {...m,status:'running',job:id}}return m});
 const kindsTaken=new Set(machines.filter(m=>m.job===id).map(m=>m.kind));
 const out=est.start===today?machines.map(m=>{if(m.status!=='idle'||m.kind==='SMT line'||kindsTaken.has(m.kind))return m;kindsTaken.add(m.kind);return {...m,status:'running',job:id}}):machines;
 return {...state,machines:out,jobs:[...state.jobs,job]};
}


export function setMachineStatus(state,id,status){
 if(!STATUSES.includes(status))return state;
 return {...state,machines:state.machines.map(m=>m.id===id?{...m,status,job:status==='running'?m.job:null}:m)};
}

export function setProgress(state,id,progress){
 const p=Math.min(1,Math.max(0,Number(progress)||0));
 return {...state,jobs:state.jobs.map(j=>j.id===id?{...j,progress:p}:j)};
}

// --- Process stages and the auto-calculator ---------------------------------------------------------
// The whole chain a job goes through, from goods in to the packed final product, grouped as the
// factory runs it. Gates are quality checks that can send boards to rework. Shares are the part of
// the job's time each stage takes and drive the progress, the auto-calculator and re-projection.
export const STAGE_GROUPS=['Material','Factory line','Assembly','Testing','Final product'];
export const STAGES=[
 {key:'incoming',name:'Incoming check',group:'Material',share:.04,about:'Internal check against the BOM and own stock, external check of supplier CoC, date codes and packaging.'},
 {key:'iqc',name:'QA incoming',group:'Material',share:.04,gate:true,about:'AQL sampling, counterfeit screen and moisture-sensitive part handling.'},
 {key:'kitting',name:'Kitting',group:'Material',share:.04,about:'Pick list per job and feeder setup for the SMT line.'},
 {key:'storing',name:'Storing',group:'Material',share:.02,about:'Dry cabinets and racks by location, first in first out.'},
 {key:'smt',name:'SMT',group:'Factory line',share:.3,about:'Loader, paste printer, SPI, pick and place, reflow, AOI and X-ray.'},
 {key:'pcba',name:'PCBA',group:'Factory line',share:.05,about:'First article, depaneling and a serial number per board.'},
 {key:'tht',name:'THT',group:'Factory line',share:.1,about:'Through-hole insertion with polarity checks.'},
 {key:'wave',name:'Wave soldering',group:'Factory line',share:.06,about:'Flux, preheat, wave and cleaning.'},
 {key:'qa',name:'QA line',group:'Factory line',share:.07,gate:true,about:'Visual, AOI and in-circuit or flying-probe test.'},
 {key:'assembly',name:'Assembly',group:'Assembly',share:.1,about:'Board into the enclosure with harness, panel parts and firmware.'},
 {key:'testing',name:'Testing',group:'Testing',share:.1,gate:true,about:'Functional test, burn-in, safety and calibration as the product needs.'},
 {key:'final',name:'Final QC and pack',group:'Final product',share:.08,gate:true,about:'Outgoing inspection, label, pack and hand-over for dispatch.'}];
const cumShare=i=>STAGES.slice(0,i+1).reduce((a,s)=>a+s.share,0);
// Jobs saved before stages existed get them, with stages already passed marked done.
export function withStages(job){
 if(Array.isArray(job.stages)&&job.stages.length===STAGES.length)return job;
 const p=job.finished?1:Math.max(0,Math.min(1,Number(job.progress)||0));
 return {...job,planned:job.planned||job.expected,stages:STAGES.map((st,i)=>({key:st.key,done:job.finished?job.finished:cumShare(i)<=p+1e-9?job.started:null}))};
}
export function stageInfo(job,today=todayIso()){
 const j=withStages(job);const doneShare=j.stages.reduce((a,st,i)=>a+(st.done?STAGES[i].share:0),0);const current=j.stages.findIndex(st=>!st.done);
 const span=Math.max(1,daysBetween(j.started,j.planned||j.expected)),elapsed=Math.max(0,daysBetween(j.started,today));
 const timeShare=j.started>today?0:Math.min(1,elapsed/span);
 // Progress follows the calendar inside the current stage but never runs past it until it is completed.
 const progress=j.finished?1:current<0?1:Math.max(doneShare,Math.min(timeShare,cumShare(current)-.001));
 const remaining=j.finished?0:Math.max(0,daysBetween(today,j.expected));
 return {stages:j.stages.map((st,i)=>({...STAGES[i],done:st.done,active:i===current})),doneShare,current,progress,remaining,planned:j.planned||j.expected,
  drift:daysBetween(j.planned||j.expected,j.expected),queued:j.started>today};
}
// After a stage completes, project the finish from the actual pace: elapsed days / share done.
function reproject(job,today){
 const info=stageInfo(job,today);if(job.finished||info.doneShare<=0)return job;
 const elapsed=Math.max(1,daysBetween(job.started,today)),total=Math.max(elapsed,Math.ceil(elapsed/info.doneShare));
 let expected=addDays(job.started,total);if(info.doneShare<1&&expected<=today)expected=addDays(today,1);
 return {...job,expected,progress:info.doneShare};
}
function assignMachines(machines,job){
 let assigned=0;const out=machines.map(m=>{if(m.status!=='idle')return m;if(m.kind==='SMT line'&&assigned<Math.max(1,job.lines||1)){assigned++;return {...m,status:'running',job:job.id}}return m});
 const kinds=new Set(out.filter(m=>m.job===job.id).map(m=>m.kind));
 return assigned?out.map(m=>{if(m.status!=='idle'||m.kind==='SMT line'||kinds.has(m.kind))return m;kinds.add(m.kind);return {...m,status:'running',job:job.id}}):machines;
}
const logLine=(today,text)=>({at:today,text});
// Mark the job's next stage done today. The last stage finishes the job, frees its machines and adds
// its real duration to the history the estimator learns from.
export function completeStage(state,id,today=todayIso()){
 let job=state.jobs.find(j=>j.id===id);if(!job||job.finished)return state;job=withStages(job);
 const i=job.stages.findIndex(st=>!st.done);if(i<0)return state;
 const stages=job.stages.map((st,k)=>k===i?{...st,done:today}:st);let next={...job,stages};
 // Boards get serial numbers when they leave PCBA; assembly, tests and dispatch refer to them.
 if(STAGES[i].key==='pcba'&&!job.serials)next={...next,serials:serialRange(job)};
 const log=[...(state.log||[])];
 if(i===STAGES.length-1){
  const finished=today<job.started?job.started:today;next={...next,finished,progress:1};
  log.unshift(logLine(today,`${job.board}: ${STAGES[i].name} done, job finished in ${Math.max(1,daysBetween(job.started,finished))} days (planned ${Math.max(1,daysBetween(job.started,job.planned||job.expected))}). The estimator now learns from it.`));
  const machines=state.machines.map(m=>m.job===id?{...m,status:'idle',job:null}:m);
  return replanQueue({...state,machines,jobs:state.jobs.map(j=>j.id===id?next:j),log:log.slice(0,30)},today);
 }
 const before=job.expected;next=reproject(next,today);
 log.unshift(logLine(today,`${job.board}: ${STAGES[i].name} done. Finish ${next.expected===before?'stays':'moves to'} ${formatDate(next.expected)}${next.expected===before?'':` (was ${formatDate(before)})`}.`));
 return {...state,jobs:state.jobs.map(j=>j.id===id?next:j),log:log.slice(0,30)};
}
export function serialRange(job){const prefix='SC-'+String(job.id).replace(/^job-/,'').toUpperCase();const qty=Math.max(1,Math.round(+job.qty||1));return {prefix,from:1,to:qty,first:`${prefix}-${String(1).padStart(4,'0')}`,last:`${prefix}-${String(qty).padStart(4,'0')}`}}
// A quality gate found faults: n boards go to rework at the job's current gate and come back to it.
// The stage stays open; the count is kept on the job and in the log.
export function reworkStage(state,id,n,today=todayIso(),note=''){
 let job=state.jobs.find(j=>j.id===id);if(!job||job.finished)return state;job=withStages(job);
 const i=job.stages.findIndex(st=>!st.done);const k=Math.max(0,Math.min(Math.round(+job.qty||0),Math.round(+n||0)));
 if(i<0||!STAGES[i].gate||!k)return state;
 const key=STAGES[i].key,rework={...(job.rework||{}),[key]:((job.rework||{})[key]||0)+k};
 const text=`${job.board}: ${k} board${k===1?'':'s'} failed ${STAGES[i].name} and went to rework${note?' ('+String(note).slice(0,60)+')':''}.`;
 return {...state,jobs:state.jobs.map(j=>j.id===id?{...job,rework}:j),log:[logLine(today,text),...(state.log||[])].slice(0,30)};
}
// An order from the BOM tool's Continue: booked like a request when the estimator has history,
// otherwise planned from the requested delivery date. The job keeps the saved list it came from.
export function jobFromOrder(state,order,today=todayIso()){
 const qty=Math.max(1,Math.round(+order.qty||0)),components=Math.max(1,Math.round(+order.components||1));
 const req={customer:order.customer,board:order.board,qty,components,due:order.due||null};
 const est=estimateJob(state.machines,state.jobs,req,today);
 const link={listId:order.listId||null,quote:order.quote||null,kit:order.kit||null,source:'BOM tool'};
 if(est.ok){const before=new Set(state.jobs.map(j=>j.id));const booked=bookJob(state,est,req,today);
  const job=booked.jobs.find(j=>!before.has(j.id));if(job)return {state:{...booked,jobs:booked.jobs.map(j=>j.id===job.id?{...j,...link}:j),log:[logLine(today,`${job.board}: order from the BOM tool booked, ${est.days} days from ${formatDate(est.start)}.`),...(booked.log||[])].slice(0,30)},job:{...job,...link},estimated:true}}
 const due=order.due&&order.due>today?order.due:addDays(today,14);
 const id='job-'+Math.random().toString(36).slice(2,8);
 const job=withStages({id,customer:String(order.customer||'New customer').trim()||'New customer',board:String(order.board||'New board').trim()||'New board',qty,components,lines:1,started:today,finished:null,expected:due,planned:due,progress:0,
  notes:order.due?'Planned to the requested delivery date; no finished job to estimate from yet':'Planned two weeks out; no delivery date or finished job to estimate from',...link});
 const next=replanQueue({...state,jobs:[...state.jobs,job],log:[logLine(today,`${job.board}: order from the BOM tool, planned to finish ${formatDate(due)}.`),...(state.log||[])].slice(0,30)},today);
 return {state:next,job,estimated:false};
}
// Finish every remaining stage at once (the old "Mark finished").
export function finishJob(state,id,today=todayIso()){
 let s2=state,guard=0;while(guard++<STAGES.length){const j=s2.jobs.find(x=>x.id===id);if(!j||j.finished)break;s2=completeStage(s2,id,today)}return s2;
}
// Queued jobs (start in the future) move up when a line frees early, and start when their day comes.
export function replanQueue(state,today=todayIso()){
 let machines=state.machines,jobs=state.jobs.map(withStages);const log=[...(state.log||[])];
 const lines=machines.filter(m=>m.kind==='SMT line'&&m.status!=='maintenance');
 const queued=jobs.filter(j=>!j.finished&&j.started>today).sort((a,b)=>a.started<b.started?-1:1);
 for(const q of queued){
  const idle=lines.filter(m=>machines.find(x=>x.id===m.id).status==='idle').length;
  const busyUntil=jobs.filter(j=>!j.finished&&j.started<=today).map(j=>j.expected).sort()[0];
  const free=idle?today:busyUntil?addDays(busyUntil,1):today;
  if(free<q.started){const dur=Math.max(1,daysBetween(q.started,q.expected));const moved={...q,started:free,expected:addDays(free,dur),planned:addDays(free,dur),notes:free===today?'Started early':`Starts ${formatDate(free)}`};
   log.unshift(logLine(today,`${q.board}: a line freed early, start moved to ${formatDate(free)} and finish to ${formatDate(moved.expected)}.`));jobs=jobs.map(j=>j.id===q.id?moved:j)}
 }
 for(const j of jobs){if(j.finished||j.started>today||machines.some(m=>m.job===j.id))continue;const after=assignMachines(machines,j);if(after!==machines){machines=after;log.unshift(logLine(today,`${j.board}: started on the line.`))}}
 return {...state,machines,jobs,log:log.slice(0,30)};
}
// Auto mode: stages complete as their planned time passes, so estimates and the floor stay current
// without anyone typing. Manual stage completions still re-project the finish from the real pace.
export function autoAdvance(state,today=todayIso()){
 let s2={...state,jobs:state.jobs.map(withStages)};
 for(const job of s2.jobs){
  if(job.finished||job.started>today)continue;const span=Math.max(1,daysBetween(job.started,job.planned||job.expected));
  for(let i=0;i<STAGES.length;i++){const cur=s2.jobs.find(j=>j.id===job.id);if(!cur||cur.finished)break;if(cur.stages[i].done)continue;
   const due=addDays(cur.started,Math.round(cumShare(i)*span));if(due>today)break;s2=completeStage(s2,job.id,due>cur.started?due:cur.started)}
 }
 return replanQueue(s2,today);
}

// --- Boards through the end of the line -----------------------------------------------------------
// Each job's boards move: in production → completed (built and tested) → ready for dispatch (packed)
// → dispatched. Completed follows the job's progress until someone records a count; finished jobs
// have every board completed. Counts never pass the stage before them.
export function boardFlow(job,today=todayIso()){
 const qty=Math.max(0,Math.round(+job.qty||0)),info=stageInfo(job,today);
 const built=job.finished?qty:Math.min(qty,Math.max(0,job.built!=null?Math.round(job.built):Math.floor(qty*info.progress)));
 const ready=Math.min(built,Math.max(0,Math.round(job.ready||0))),dispatched=Math.min(ready,Math.max(0,Math.round(job.dispatched||0)));
 return {qty,built,inProduction:qty-built,completed:built-ready,ready:ready-dispatched,dispatched,queued:info.queued};
}
export function flowSummary(jobs,today=todayIso()){
 return (jobs||[]).reduce((t,j)=>{const f=boardFlow(j,today);t.inProduction+=f.inProduction;t.completed+=f.completed;t.ready+=f.ready;t.dispatched+=f.dispatched;return t},{inProduction:0,completed:0,ready:0,dispatched:0});
}
// Move n boards one step: 'built' records boards completed, 'ready' packs completed boards, 'dispatch'
// ships ready boards (with a dated note, e.g. the courier and docket). n is clamped to what is there.
export function moveBoards(state,id,step,n,today=todayIso(),note=''){
 const job=state.jobs.find(j=>j.id===id);if(!job)return state;const f=boardFlow(job,today);
 const k=Math.max(0,Math.round(+n||0));let patch=null,text='';
 if(step==='built'){const v=Math.min(f.inProduction,k);if(!v)return state;patch={built:f.built+v};text=`${v} boards of ${job.board} completed`}
 if(step==='ready'){const v=Math.min(f.completed,k);if(!v)return state;patch={ready:f.built-f.completed+v};text=`${v} boards of ${job.board} ready for dispatch`}
 if(step==='dispatch'){const v=Math.min(f.ready,k);if(!v)return state;patch={dispatched:f.dispatched+v,dispatches:[...(job.dispatches||[]),{date:today,qty:v,note:String(note||'').slice(0,120)}]};text=`${v} boards of ${job.board} dispatched to ${job.customer}${note?' ('+String(note).slice(0,60)+')':''}`}
 if(!patch)return state;
 return {...state,jobs:state.jobs.map(j=>j.id===id?{...j,...patch}:j),log:[{at:today,text},...(state.log||[])].slice(0,40)};
}

// --- Sample data ----------------------------------------------------------------------------------
// A new workspace starts with the machine floor and no jobs. The sample jobs (seedProduction) load only
// on request, and withoutSamples() removes them from a saved floor, freeing the machines they held.
const SAMPLE_CUSTOMERS=new Set(['Northwind Robotics','Helix Medical','Aster Energy']);
export const isSampleJob=j=>/^job-[1-4]$/.test(j.id)&&SAMPLE_CUSTOMERS.has(j.customer);
export function emptyProduction(today=todayIso()){return {machines:seedProduction(today).machines.map(m=>({...m,status:'idle',job:null})),jobs:[],log:[],version:2}}
export function withoutSamples(state){
 if(!state)return state;const gone=new Set(state.jobs.filter(isSampleJob).map(j=>j.id));if(!gone.size)return state;
 return {...state,jobs:state.jobs.filter(j=>!gone.has(j.id)),machines:state.machines.map(m=>gone.has(m.job)?{...m,status:m.status==='maintenance'?m.status:'idle',job:null}:m),log:[]};
}
