import React,{useState} from 'react';
import {CircuitBoard,ArrowRight,LockKeyhole} from 'lucide-react';

// Front door: what semi-cobot does, shown rather than told, and the admin panel. First run creates
// the admin account; after that it is a sign-in. Without the local server, sign-in is off and the
// workspace opens directly.
const STATIONS=['Loader','Printer','SPI','Pick & place','Reflow','AOI','X-ray'];

// The line: a board travels through the seven machines (CSS animation, still under reduced motion).
function LineArt(){
 return <svg className="intro-line" viewBox="0 0 760 170" role="img" aria-label="A board moving through the seven machines of the SMT line">
  <rect x="0" y="118" width="760" height="6" rx="2" className="belt"/>
  {STATIONS.map((s,i)=>{const w=i===4?150:80,x=[8,98,188,278,368,528,618][i];return <g key={s}>
   <rect x={x} y={i===4?62:44} width={w} height={i===4?56:74} rx="4" className="machine"/>
   <rect x={x+10} y={i===4?72:58} width={w-20} height="18" rx="2" className="glass"/>
   {i===4&&[0,1,2,3,4,5].map(k=><rect key={k} x={x+14+k*22} y="102" width="14" height="6" className="heat"/>)}
   <circle cx={x+w-10} cy={(i===4?62:44)-8} r="4" className="lamp"/>
   <text x={x+w/2} y="146" textAnchor="middle">{s}</text></g>})}
  <g className="intro-board"><rect x="0" y="108" width="34" height="10" rx="1.5" className="pcb"/><rect x="6" y="104" width="8" height="4" className="chip"/><rect x="19" y="105" width="10" height="3" className="chip"/></g>
 </svg>;
}

// Small drawings for each part of the product.
const ART={
 studio:<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M20 62 80 32l60 30-60 30Z" className="pcb"/><path d="M20 62v6l60 30 60-30v-6l-60 30Z" className="edge"/><path d="m62 50 14-7 14 7-14 7Z" className="chip"/><path d="m62 50v5l14 7v-5Zm28 0v5l-14 7v-5Z" className="chip-side"/><path d="m98 58 7-3.5 7 3.5-7 3.5Zm-48 6 6-3 6 3-6 3Z" className="part"/><path d="M36 64h16M104 72h18M80 82h12" className="trace"/></svg>,
 parts:<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="22" y="26" width="46" height="46" rx="3" className="chip"/>{[0,1,2,3,4].map(i=><g key={i}><rect x={16} y={31+i*9} width="6" height="3" className="lead"/><rect x={68} y={31+i*9} width="6" height="3" className="lead"/></g>)}<circle cx="30" cy="34" r="2.5" className="dot"/><path d="M88 34h52M88 46h40M88 58h48M88 70h30" className="line"/></svg>,
 market:<svg viewBox="0 0 160 100" aria-hidden="true"><g transform="translate(52 52)">{[34,24,14].map(r=><polygon key={r} points={[0,1,2,3,4,5].map(k=>{const a=k/6*Math.PI*2-Math.PI/2;return `${Math.cos(a)*r},${Math.sin(a)*r}`}).join(' ')} className="ring"/>)}<polygon points="0,-30 26,-12 22,14 0,24 -24,10 -18,-16" className="area"/><polygon points="0,-18 18,-10 28,16 0,28 -12,8 -28,-14" className="area2"/></g>{[0,1,2,3].map(i=><rect key={i} x={104+i*12} y={78-[34,22,46,28][i]} width="8" height={[34,22,46,28][i]} className={i===2?'bar hot':'bar'}/>)}</svg>,
 line:<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="6" y="66" width="148" height="4" className="belt"/>{[12,52,92].map((x,i)=><g key={x}><rect x={x} y="30" width="34" height="36" rx="3" className="machine"/><rect x={x+5} y="37" width="24" height="9" className="glass"/><circle cx={x+29} cy="25" r="2.5" className={i===1?'lamp on':'lamp'}/></g>)}<rect x="132" y="58" width="16" height="7" className="pcb"/><path d="M134 54c2-6 6-6 4-12m6 12c2-6 6-6 4-12" className="smoke"/></svg>,
 inspect:<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="40" y="10" width="80" height="80" rx="4" className="xray"/>{Array.from({length:36},(_,i)=>{const x=54+(i%6)*10.4,y=24+Math.floor(i/6)*10.4,v=[3,8,14,22,27].includes(i);return <g key={i}><circle cx={x} cy={y} r="3.6" className="ball"/>{v&&<circle cx={x+.8} cy={y-.6} r={i===22?2:1.3} className="void"/>}</g>})}<circle cx="70.8" cy="44.2" r="6.5" className="mark"/></svg>,
 stock:<svg viewBox="0 0 160 100" aria-hidden="true">{[52,30,64,44,70,38].map((h,i)=><rect key={i} x={18+i*14} y={84-h} width="9" height={h} className={i===1?'bar warn':'bar'}/>)}<path d="M14 54h92" className="min"/><path d="M118 70a22 22 0 0 1 36 0" className="gauge"/><path d="M118 70a22 22 0 0 1 30-14" className="gauge on"/></svg>,
};
const FEATURES=[
 ['studio','Board studio','Gerber, KiCad, pick-and-place or a PDF becomes a 3D board.'],
 ['parts','Every part known','Part master, your project files and Google look-ups, saved locally.'],
 ['market','Six markets at once','DigiKey, Mouser, Nexar, TME, Master, Google Shopping.'],
 ['line','Full SMT line','Loader to X-ray, with each machine’s cycle inside.'],
 ['inspect','Inspection','Paste volumes, AOI checks, X-ray voids.'],
 ['stock','Stock and capacity','Shortages, alerts and whether the next job fits.'],
];

// What a user does here, in the order the work goes: each step hands its result to the next.
const DO=[
 ['Upload the Gerber','The bare board is drawn and quoted, it opens in Board studio, and its parts fill the BOM.'],
 ['Upload the BOM','Excel or CSV. Each line is priced from own stock first, then distributors, registered vendors and the open market.'],
 ['Choose the enclosure','Off the shelf, or custom moulded with the mould and the mould makers on the same page. Optional.'],
 ['Download the quotation','A customer PDF in rupees or dollars, without your costs or suppliers.'],
 ['Save the list or continue','Saved lists open again later; Continue books a production job.'],
 ['Follow production','Incoming check, QA, kitting, storing, SMT, PCBA, THT, wave soldering, QA, assembly, testing and final product.'],
 ['Keep vendors and stock','Register vendors and the products they have, keep own stock and the part master up to date.'],
];
function AdminPanel({auth,onSignedIn,onOpen}){
 const first=auth.enabled&&!auth.admin;
 const [tab,setTab]=useState('in'),[form,setForm]=useState({name:'',email:'',password:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const signup=first||tab==='up';
 const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');
  try{const r=await fetch(signup?'/api/auth/signup':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signup?form:{email:form.email,password:form.password})});
   const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Sign-in failed.');
   onSignedIn(j.user)}
  catch(err){setError(err.message)}finally{setBusy(false)}};
 if(!auth.enabled)return <section className="intro-admin" aria-label="Admin">
  <h2>Workspace</h2><button type="button" className="button primary full" onClick={onOpen}>Open workspace <ArrowRight size={15}/></button></section>;
 return <section className="intro-admin" aria-label="Admin">
  <div className="intro-admin-head"><LockKeyhole size={16}/><h2>{first?'Create the admin account':signup?'Sign up':'Sign in'}</h2></div>
  {!first&&<div className="segmented intro-tabs" role="tablist" aria-label="Account">{[['in','Sign in'],['up','Sign up']].map(([k,l])=><button type="button" role="tab" key={k} aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>{setTab(k);setError('')}}>{l}</button>)}</div>}
  <form onSubmit={submit} className="intro-form">
   {signup&&<label>Name<input autoComplete="name" value={form.name} onChange={set('name')} required maxLength={60}/></label>}
   <label>Email<input type="email" autoComplete={signup?'email':'username'} value={form.email} onChange={set('email')} required/></label>
   <label>Password<input type="password" autoComplete={signup?'new-password':'current-password'} value={form.password} onChange={set('password')} required minLength={signup?10:1}/>{signup&&<small>At least 10 characters</small>}</label>
   {(error||auth.down)&&<p className="intro-error" role="alert">{error||auth.down}</p>}
   <button type="submit" className="button primary full" disabled={busy}>{busy?'…':signup?'Create account':'Sign in'}</button>
  </form>
  <p className="muted intro-note">{first?'First account becomes the admin.':''}</p>
 </section>;
}

// Background: a recorded motherboard assembly (scripts/make-intro-video.mjs), looping and muted, under
// a veil in the page colour so the text stays readable; a still frame when motion is reduced.
const stillOnly=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
export default function Intro({auth,onSignedIn,onOpen}){
 return <div className="intro">
  {stillOnly()?<img className="intro-bg" src="/media/intro-assembly.jpg" alt="" aria-hidden="true"/>:<video className="intro-bg" src="/media/intro-assembly.webm" poster="/media/intro-assembly.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden="true" tabIndex={-1}/>}
  <div className="intro-veil" aria-hidden="true"/>
  <header className="intro-top"><span className="brand"><span className="brand-icon"><CircuitBoard size={15}/></span>semi-cobot</span></header>
  <div className="intro-grid">
   <div className="intro-main">
    <section className="intro-hero"><h1>From board file to inspected board.</h1><p>Inventory, sourcing, 3D board studio and a full SMT line in one workspace.</p><LineArt/></section>
    <ol className="intro-flow" aria-label="What semi-cobot does">{FEATURES.map(([k,title,text],i)=><li key={k} className={'f-'+k}><span className="intro-n">{String(i+1).padStart(2,'0')}</span><div className="intro-art">{ART[k]}</div><h3>{title}</h3><p>{text}</p></li>)}</ol>
    <section className="intro-do" aria-label="What you can do"><h2>What you can do here</h2><ol>{DO.map(([t,d],i)=><li key={t}><span className="intro-n">{i+1}</span><div><strong>{t}</strong><p>{d}</p></div></li>)}</ol><p className="muted">Help in the workspace explains every page, and the BOM tool has a step-by-step demo.</p></section>
    <dl className="intro-numbers"><div><dt>Board types</dt><dd>61</dd></div><div><dt>Parts in the part master</dt><dd>2,683</dd></div><div><dt>Markets</dt><dd>6</dd></div><div><dt>Line machines</dt><dd>7</dd></div></dl>
   </div>
   <AdminPanel auth={auth} onSignedIn={onSignedIn} onOpen={onOpen}/>
  </div>
 </div>;
}
