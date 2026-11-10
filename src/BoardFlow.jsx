import React,{useState} from 'react';
import {Factory,CheckCircle2,PackageCheck,Truck,ArrowRight} from 'lucide-react';
import {boardFlow,flowSummary,moveBoards,activeJobs,completedJobs,formatDate,todayIso} from './production.js';

// Inventory → Production: finished goods. Every job's boards in production, completed, ready for
// dispatch and dispatched, with the step that moves boards on and the dispatch log.
const STEPS=[['built','Completed','inProduction'],['ready','Ready for dispatch','completed'],['dispatch','Dispatched','ready']];
const fmt=n=>Math.round(n).toLocaleString('en-IN');

function JobRow({job,today,setState,notify}){
 const f=boardFlow(job,today);const first=STEPS.find(([,,from])=>f[from]>0);
 const [step,setStep]=useState(first?.[0]||'built'),[qty,setQty]=useState(''),[note,setNote]=useState('');
 const from=STEPS.find(x=>x[0]===step)[2],avail=f[from];
 const apply=e=>{e.preventDefault();const n=qty===''?avail:Math.min(avail,Math.max(0,Math.round(+qty||0)));if(!n)return;setState(s=>moveBoards(s,job.id,step,n,todayIso(),note));notify(`${n} board${n===1?'':'s'} of ${job.board}: ${STEPS.find(x=>x[0]===step)[1].toLowerCase()}.`);setQty('');setNote('')};
 const share=k=>f.qty?f[k]/f.qty*100:0;
 return <tr>
  <td><strong>{job.board}</strong><small>{job.customer} · {job.finished?`finished ${formatDate(job.finished)}`:f.queued?`starts ${formatDate(job.started)}`:`due ${formatDate(job.expected)}`}</small>
   <div className="flow-bar" role="img" aria-label={`${job.board}: ${f.inProduction} in production, ${f.completed} completed, ${f.ready} ready, ${f.dispatched} dispatched`}><i className="prod" style={{width:share('inProduction')+'%'}}/><i className="done" style={{width:share('completed')+'%'}}/><i className="ready" style={{width:share('ready')+'%'}}/><i className="sent" style={{width:share('dispatched')+'%'}}/></div></td>
  <td className="numeric">{fmt(f.qty)}</td><td className="numeric">{fmt(f.inProduction)}</td><td className="numeric">{fmt(f.completed)}</td><td className="numeric">{fmt(f.ready)}</td><td className="numeric">{fmt(f.dispatched)}</td>
  <td>{f.dispatched<f.qty?<form className="flow-move" onSubmit={apply}>
   <select aria-label={`${job.board} step`} value={step} onChange={e=>setStep(e.target.value)}>{STEPS.map(([k,l,src])=><option key={k} value={k} disabled={!f[src]}>{l}</option>)}</select>
   <input aria-label={`${job.board} boards to move`} type="number" min="1" max={avail} placeholder={String(avail)} value={qty} onChange={e=>setQty(e.target.value)}/>
   {step==='dispatch'&&<input aria-label={`${job.board} dispatch note`} placeholder="Courier, docket" value={note} onChange={e=>setNote(e.target.value)}/>}
   <button className="button small" type="submit" disabled={!avail}>Record</button></form>:<span className="badge green"><span/>All dispatched</span>}</td>
 </tr>;
}

export default function BoardFlow({state,setState,notify=()=>{},onOpenProduction}){
 const today=todayIso(),jobs=[...activeJobs(state.jobs),...completedJobs(state.jobs)],sum=flowSummary(state.jobs,today);
 const log=state.jobs.flatMap(j=>(j.dispatches||[]).map(d=>({...d,board:j.board,customer:j.customer}))).sort((a,b)=>a.date<b.date?1:-1).slice(0,12);
 const tiles=[['In production',sum.inProduction,Factory,''],['Completed',sum.completed,CheckCircle2,'done'],['Ready for dispatch',sum.ready,PackageCheck,'ready'],['Dispatched',sum.dispatched,Truck,'sent']];
 return <div className="board-flow">
  <div className="stats-grid flow-stats">{tiles.map(([k,v,Icon,c])=><div className={'stat '+c} key={k}><div className="stat-top"><span>{k}</span><Icon size={18}/></div><div className="stat-value">{fmt(v)}<small className="stat-unit"> boards</small></div></div>)}</div>
  <section className="panel" aria-label="Boards by job">
   <div className="panel-heading"><div className="title-row"><h2>Boards by job</h2><span className="count-label">{jobs.length}</span></div>{onOpenProduction&&<button className="text-button" onClick={onOpenProduction}>Production floor <ArrowRight size={15}/></button>}</div>
   {jobs.length?<div className="table-scroll"><table className="flow-table"><thead><tr><th>Job</th><th className="numeric">Boards</th><th className="numeric">In production</th><th className="numeric">Completed</th><th className="numeric">Ready</th><th className="numeric">Dispatched</th><th>Move boards</th></tr></thead>
    <tbody>{jobs.map(j=><JobRow key={j.id} job={j} today={today} setState={setState} notify={notify}/>)}</tbody></table></div>
   :<div className="empty"><Factory/><h3>No boards in production</h3><p>Book a job on the Production page; its boards appear here.</p>{onOpenProduction&&<button className="button" onClick={onOpenProduction}>Open Production</button>}</div>}
  </section>
  {log.length>0&&<section className="panel" aria-label="Dispatch log"><div className="panel-heading"><div className="title-row"><Truck size={17}/><h2>Dispatch log</h2></div></div>
   <ol className="log-list">{log.map((d,i)=><li key={i}><time>{formatDate(d.date)}</time><span>{fmt(d.qty)} × {d.board} to {d.customer}{d.note?` · ${d.note}`:''}</span></li>)}</ol></section>}
 </div>;
}
