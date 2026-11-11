import React,{useEffect,useMemo,useState} from 'react';
import {Factory,Timer,Gauge,CalendarCheck,CheckCircle2,CircleDashed,Wrench,ArrowRight,ClipboardCheck,History,Calculator,Check,Settings2} from 'lucide-react';
import FactorySetup from './FactorySetup.jsx';
import {AREAS,LINE_STATIONS,stationsOf,areaOf,modelOf,estimateJob,floorSummary,lastJob,jobDays,completedJobs,activeJobs,formatDate,bookJob,finishJob,setMachineStatus,todayIso,addDays,STATUSES,completeStage,autoAdvance,stageInfo,STAGE_GROUPS,reworkStage} from './production.js';

const fmt=n=>Number(n).toLocaleString('en-US');
const TONE={Likely:'green',Possible:'green',Tight:'amber','Not by that date':'red','Not feasible':'red','Not enough data':'neutral'};
const STATUS_ICON={running:CircleDashed,idle:CheckCircle2,maintenance:Wrench};

// A machine's picture from its 3D model (machineView.js, loaded on demand with three.js): null while
// rendering, false without WebGL.
function useMachinePicture(model,status){
 const [pic,setPic]=useState(null);
 useEffect(()=>{if(!model){setPic(false);return}let live=true;setPic(null);const t=setTimeout(()=>import('./machineView.js').then(v=>{if(live)setPic(v.machinePicture(model,status)||false)}).catch(()=>{if(live)setPic(false)}),20);return()=>{live=false;clearTimeout(t)}},[model,status]);
 return pic;
}
function MachineCard({m,job,setState}){
 const stations=stationsOf(m),standard=stations.length===LINE_STATIONS.length&&stations.every((x,i)=>x===LINE_STATIONS[i]);
 const kind=modelOf(m),line=kind==='smt',model=line&&!standard?null:kind,pic=useMachinePicture(model,m.status),aligned=pic&&line&&standard,Icon=STATUS_ICON[m.status];
 const figure=model&&pic!==false&&<figure className="machine-figure">{pic?<img src={pic.src} alt={`${m.name}, 3D model`} draggable="false"/>:<div className="machine-figure-wait" aria-hidden="true"/>}</figure>;
 return <li className={'machine-card '+(line?'line ':'')+m.status}>
  {!line&&figure}
  <div className="machine-card-head"><span className="machine-icon"><Icon size={15}/></span><span className="machine-copy"><strong>{m.name}</strong><small>{line?(job?job.board:'No job'):m.kind+(job?` · ${job.board}`:'')}</small></span>
   <select aria-label={`${m.name} status`} value={m.status} onChange={e=>setState(s=>setMachineStatus(s,m.id,e.target.value))}>{STATUSES.map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></div>
  {line&&figure}
  {line&&<ol className={'machine-stations'+(aligned?' aligned':'')+(standard?'':' custom')} aria-label={`${m.name} stations`}>{stations.map((st,i)=><li key={st} style={aligned?{left:`${pic.marks[i].x*100}%`}:undefined}>{st}</li>)}</ol>}
 </li>;
}

// The job's stages grouped as the factory runs them: material, factory line, assembly, testing and
// final product. Each stage's width follows its share of the job's time.
function StageTrack({info,board}){
 return <div className="stage-groups" role="list" aria-label={`Process stages for ${board}`}>{STAGE_GROUPS.map(g=>{const list=info.stages.filter(st=>st.group===g),share=list.reduce((a,st)=>a+st.share,0);
  const state=list.every(st=>st.done)?'done':list.some(st=>st.active)?'active':'';
  return <div key={g} role="listitem" className={'stage-group '+state} style={{flex:`${Math.round(share*100)} 1 72px`}}><small>{g}</small>
   <ol className="stage-track">{list.map(st=><li key={st.key} className={(st.done?'done':st.active?'active':'')+(st.gate?' gate':'')} style={{flexGrow:st.share*100}} title={`${st.name}${st.gate?' (quality gate)':''}: ${st.about}${st.done?` Done ${formatDate(st.done)}.`:''}`}><i/>{st.done&&<Check size={10}/>}<span>{st.name}</span></li>)}</ol></div>})}</div>;
}
// One plain line under the track: where the job is now and what comes next.
function StageNow({info}){
 const now=info.stages[info.current],next=info.stages[info.current+1];
 if(!now)return <p className="stage-now">All stages done.</p>;
 return <p className="stage-now">{info.queued?'Waiting to start · first':'Now'}: <strong>{now.name}</strong> <span className="muted">({now.group}{now.gate?', quality gate':''})</span>{next?<> · next: {next.name}</>:' · last stage'}</p>;
}
// At a quality gate: boards that failed go to rework and come back to the same gate.
function ReworkForm({job,stage,onRework}){
 const [n,setN]=useState(''),[note,setNote]=useState('');
 return <form className="rework-form" onSubmit={e=>{e.preventDefault();const k=Math.round(+n||0);if(k>0){onRework(k,note);setN('');setNote('')}}}>
  <span>{stage.name} is a quality gate.</span>
  <input type="number" min="1" max={job.qty} step="1" inputMode="numeric" aria-label={`Boards of ${job.board} failed at ${stage.name}`} placeholder="Failed" value={n} onChange={e=>setN(e.target.value)}/>
  <input aria-label="Defect" placeholder="Defect, e.g. solder bridge" maxLength="60" value={note} onChange={e=>setNote(e.target.value)}/>
  <button className="button small" type="submit" disabled={!(+n>0)}>Send to rework</button>
 </form>;
}
// Production capacity page: what the floor is doing now, how long the last job took, and a live
// feasibility estimate for a request from another board company.
export function Production({state,setState,boardModel=[],board,notify,onOpenList=null}){
 const today=todayIso();
 const [req,setReq]=useState(()=>({customer:'',board:'',qty:'500',components:String(lastJob(state.jobs)?.components||boardModel.length||100),due:addDays(today,21)}));
 const auto=state.auto!==false;const [setup,setSetup]=useState(false);
 // Auto-calculator: on open and every minute, stages whose planned time has passed complete, finished
 // jobs free their lines, queued jobs start, and estimates update from the new history.
 useEffect(()=>{if(!auto)return;const tick=()=>setState(s=>{const next=autoAdvance(s,todayIso());return JSON.stringify(next.jobs)===JSON.stringify(s.jobs)&&JSON.stringify(next.machines)===JSON.stringify(s.machines)?s:next});tick();const t=setInterval(tick,60000);return()=>clearInterval(t)},[auto,setState]);
 const floor=useMemo(()=>floorSummary(state.machines,state.jobs),[state]);
 const last=lastJob(state.jobs),history=completedJobs(state.jobs),active=activeJobs(state.jobs);
 const est=useMemo(()=>estimateJob(state.machines,state.jobs,req,today),[state,req,today]);
 const set=k=>e=>setReq(r=>({...r,[k]:e.target.value}));
 const book=()=>{setState(s=>bookJob(s,est,req,today));notify?.(`${req.board.trim()||'New board'} for ${req.customer.trim()||'new customer'} booked: ${est.days} days from ${formatDate(est.start)}.`)};
 const useBoard=()=>setReq(r=>({...r,board:board?.name||r.board,components:String(boardModel.length||r.components)}));
 return <div className="production">
  <div className="stats-grid prod-stats">
   <div className="stat"><div className="stat-top"><span>Last job took</span><Timer size={18}/></div><div className="stat-value">{last?<>{jobDays(last)}<small className="stat-unit"> days</small></>:'—'}</div><div className="stat-note">{last?`${last.board} · ${fmt(last.qty)} boards · finished ${formatDate(last.finished)}`:'None yet'}</div></div>
   <div className="stat"><div className="stat-top"><span>Machines working now</span><Factory size={18}/></div><div className="stat-value">{floor.running}<small className="stat-unit"> of {floor.total}</small></div><div className={'stat-note '+(floor.maintenance?'amber':'')}>{floor.idle} idle · {floor.maintenance} in maintenance</div></div>
   <div className="stat"><div className="stat-top"><span>SMT lines free</span><Gauge size={18}/></div><div className="stat-value">{floor.idleLines}<small className="stat-unit"> of {floor.lines}</small></div><div className={'stat-note '+(est.window?.waiting?'amber':'green')}>{est.window?.waiting?<><span className="tiny-dot"/>Next free {formatDate(est.window.freesWith?.expected)}</>:<><CheckCircle2 size={13}/>Free today</>}</div></div>
   <div className="stat"><div className="stat-top"><span>Jobs in progress</span><CalendarCheck size={18}/></div><div className="stat-value">{active.length}</div><div className="stat-note">{active[0]?`${active[0].board} · expected ${formatDate(active[0].expected)}`:'Floor is clear'}</div></div>
  </div>
  <section className="panel floor-panel" aria-label="Machines">
   <div className="panel-heading"><div className="title-row"><Factory size={18}/><h2>{setup?'Set up the factory':'Machines'}</h2>{!setup&&<span className="count-label">{state.machines.length}</span>}</div>{!setup&&<button className="button small" onClick={()=>setSetup(true)}><Settings2 size={14}/>Set up the factory</button>}</div>
   {setup?<FactorySetup state={state} setState={setState} notify={notify} onDone={()=>setSetup(false)}/>:<>
   {!state.floorSet&&<div className="studio-note setup-hint"><Settings2 size={15}/><span>This is a typical floor: two SMT lines, wave and selective solder, two test stations. Set it up to match your factory: create your lines, add your machines.</span><button className="button small primary" onClick={()=>setSetup(true)}>Set up the factory</button></div>}
   {state.machines.length===0&&<div className="empty"><Factory/><h3>No machines yet</h3><p>Create your lines and add your machines; estimates and bookings use them.</p><button className="button primary" onClick={()=>setSetup(true)}>Set up the factory</button></div>}
   <div className="floor-body">{AREAS.map(([area,title])=>{const list=state.machines.filter(m=>areaOf(m.kind)===area);return list.length>0&&<div key={area} className={'floor-area '+area}><h3 className="machine-area-title">{title}</h3>
    <ul className="machine-cards">{list.map(m=><MachineCard key={m.id} m={m} job={m.job&&state.jobs.find(j=>j.id===m.job)} setState={setState}/>)}</ul></div>})}</div></>}
  </section>
  <div className="prod-layout">
   <section className="panel quote-panel" aria-label="New request">
    <div className="panel-heading"><div className="title-row"><ClipboardCheck size={18}/><h2>New request</h2></div><button className="text-button" type="button" onClick={useBoard}>Use open board <ArrowRight size={14}/></button></div>
    <form className="quote-form" onSubmit={e=>{e.preventDefault();if(est.ok)book()}}>
     <div className="form-grid">
      <label>Customer<input name="customer" value={req.customer} onChange={set('customer')} placeholder="Company"/></label>
      <label>Board<input name="board" value={req.board} onChange={set('board')} placeholder="Name or rev"/></label>
      <label>Quantity of boards<input name="qty" type="number" min="1" step="1" inputMode="numeric" value={req.qty} onChange={set('qty')}/></label>
      <label>Components per board<input name="components" type="number" min="1" step="1" inputMode="numeric" value={req.components} onChange={set('components')}/></label>
      <label>Requested delivery<input name="due" type="date" value={req.due} min={today} onChange={set('due')}/></label>
     </div>
     <div className={'verdict '+(TONE[est.verdict]||'neutral')} role="status" aria-live="polite">
      <div className="verdict-head"><strong className="verdict-word">{est.verdict}</strong>{est.ok&&<span className="badge neutral">{Math.round(est.confidence*100)}% confidence</span>}</div>
      {est.ok&&<div className="verdict-facts"><div><small>Takes</small><strong>{est.days} day{est.days===1?'':'s'}</strong></div><div><small>Start</small><strong>{formatDate(est.start)}</strong></div><div><small>Finish</small><strong>{formatDate(est.finish)}</strong></div><div><small>Lines</small><strong>{est.linesUsed}</strong></div></div>}
      <div className="confidence-track" aria-hidden="true"><i style={{width:`${Math.round(est.confidence*100)}%`}}/></div>
      <ol className="reason-list">{est.reasons.map((r,i)=><li key={i}>{r}</li>)}</ol>
      <div className="verdict-actions"><button type="submit" className="button primary" disabled={!est.ok}>Book this job <ArrowRight size={15}/></button></div>
     </div>
    </form>
   </section>
   <div className="prod-side">
    <section className="panel" aria-label="Jobs on the floor">
     <div className="panel-heading"><div className="title-row"><CalendarCheck size={18}/><h2>Jobs on the floor</h2></div><label className="auto-switch"><input type="checkbox" checked={auto} onChange={e=>setState(s=>({...s,auto:e.target.checked}))}/><span/>Auto calculator</label></div>
     {active.length===0&&<div className="studio-note"><CheckCircle2 size={15}/> No jobs in progress.</div>}
     {active.map(j=>{const info=stageInfo(j,today),next=info.stages[info.current];return <div className="job-row" key={j.id}>
      <div className="job-head"><span><strong>{j.board}</strong><small>{j.customer} · {fmt(j.qty)} boards · {j.lines} line{j.lines===1?'':'s'}</small></span><span className={'badge '+(info.queued?'neutral':info.drift>0?'red':info.drift<0?'green':'amber')}><span/>{info.queued?`Starts ${formatDate(j.started)}`:`Finish ${formatDate(j.expected)}`}</span></div>
      <StageTrack info={info} board={j.board}/><StageNow info={info}/>
      <div className="job-calc"><div className="progress-bar" role="progressbar" aria-valuenow={Math.round(info.progress*100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${j.board} progress`}><i style={{width:`${Math.round(info.progress*100)}%`}}/></div>
       <small>{Math.round(info.progress*100)}% · {info.queued?'queued':`${info.remaining} day${info.remaining===1?'':'s'} left`}{info.drift?` · ${Math.abs(info.drift)} day${Math.abs(info.drift)===1?'':'s'} ${info.drift<0?'ahead of':'behind'} plan`:' · on plan'}</small></div>
      {next?.gate&&!info.queued&&<ReworkForm job={j} stage={next} onRework={(n,note)=>{setState(s=>reworkStage(s,j.id,n,today,note));notify?.(`${n} board${n===1?'':'s'} of ${j.board} sent to rework at ${next.name}.`)}}/>}<div className="job-foot"><small>Started {formatDate(j.started)} · {j.notes}{j.serials?` · serials ${j.serials.first} to ${j.serials.last}`:''}{j.rework&&Object.keys(j.rework).length?` · rework ${Object.values(j.rework).reduce((a,b)=>a+b,0)} boards`:''}{j.quote?` · quote ${j.quote}`:''}{j.kit?` · kit: ${j.kit.own} of ${j.kit.lines} lines from own stock, ${j.kit.buy} to buy`:''}</small><span className="job-buttons">{j.listId&&onOpenList&&<button type="button" className="button small" onClick={()=>onOpenList(j.listId)}>Open its BOM</button>}{next&&!info.queued&&<button type="button" className="button small primary" onClick={()=>{setState(s=>completeStage(s,j.id,today));notify?.(`${next.name} done for ${j.board}.`)}}>Complete {next.name}</button>}<button type="button" className="button small" onClick={()=>{setState(s=>finishJob(s,j.id,today));notify?.(`${j.board} marked finished.`)}}>Mark finished</button></span></div></div>})}
    </section>
   </div>
  </div>
  <section className="panel calc-log" aria-label="Calculator log"><div className="panel-heading"><div className="title-row"><Calculator size={18}/><h2>Estimate calculator</h2></div></div>
   {(state.log||[]).length?<ol className="log-list">{state.log.slice(0,8).map((l,i)=><li key={i}><time>{formatDate(l.at)}</time><span>{l.text}</span></li>)}</ol>:<p className="studio-note"><Calculator size={15}/> No updates yet.</p>}
  </section>
  <section className="panel history-panel" aria-label="Job history">
   <div className="panel-heading"><div className="title-row"><History size={18}/><h2>Finished jobs</h2><span className="count-label">{history.length}</span></div></div>
   <div className="table-scroll"><table><thead><tr><th>Board</th><th>Customer</th><th>Boards</th><th>Lines</th><th>Started</th><th>Finished</th><th>Days</th><th>Per line per day</th></tr></thead><tbody>{history.map(j=><tr key={j.id}><td><strong>{j.board}</strong>{j.notes&&<small className="price-note">{j.notes}</small>}</td><td>{j.customer}</td><td className="numeric">{fmt(j.qty)}</td><td className="numeric">{j.lines}</td><td>{formatDate(j.started)}</td><td>{formatDate(j.finished)}</td><td className="numeric">{jobDays(j)}</td><td className="numeric">{fmt(Math.round(j.qty/(jobDays(j)*Math.max(1,j.lines))))}</td></tr>)}{history.length===0&&<tr><td colSpan="8" className="muted">None yet.</td></tr>}</tbody></table></div>
  </section>
 </div>;
}
export default Production;
