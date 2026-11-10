import React,{useMemo,useState} from 'react';
import {BookOpen,CircuitBoard,CheckCircle2,CircleDashed,Plus,Trash2,Search,ChevronDown,ListChecks} from 'lucide-react';

const TYPE_WORD={chip:'IC',transistor:'Transistor',diode:'Diode',led:'LED',capacitor:'Capacitor',resistor:'Resistor',inductor:'Inductor',connector:'Connector',crystal:'Crystal',switch:'Switch',fuse:'Fuse',module:'Module',other:'Part'};
const pct=n=>Math.round(n*100)+'%';

// One board type: what it is, its sections with typical parts, and what to check.
export function BoardTypeCard({type,present,open:startOpen=false}){
 const [open,setOpen]=useState(startOpen);
 return <article className={'btype'+(open?' open':'')}>
  <button type="button" className="btype-head" aria-expanded={open} onClick={()=>setOpen(o=>!o)}><span><strong>{type.name}</strong><small>{type.category} · {type.signals?.layers?.join('–')} layers · {type.signals?.partCount?.join('–')} parts</small></span><ChevronDown size={16}/></button>
  <p>{type.description}</p>
  {open&&<>
   {type.examples?.length>0&&<p className="btype-examples"><b>Examples:</b> {type.examples.join(' · ')}</p>}
   <div className="btype-sections">{(type.sections||[]).map(sec=><section key={sec.name}><h4>{sec.name}</h4><small>{sec.purpose}</small>
    <ul>{sec.parts.map((p,i)=>{const have=present?present(p.type):null;return <li key={i}>{have==null?null:have?<CheckCircle2 size={12} className="ok"/>:<CircleDashed size={12} className="miss"/>}<span><b>{p.role}</b> · {TYPE_WORD[p.type]||p.type}{p.value?` ${p.value}`:''}{p.package?` · ${p.package}`:''}</span><code>{p.example}</code><em>{p.qty}</em></li>})}</ul></section>)}</div>
   {type.checks?.length>0&&<div className="btype-checks"><h4><ListChecks size={14}/> Checks</h4><ul>{type.checks.map((c,i)=><li key={i}>{c}</li>)}</ul></div>}
  </>}
 </article>;
}

// Studio panel: the detected board type and the supporting parts this board still needs.
export function BoardKnowledge({analysis,parts,suggested=0,onAdd,onRemove,onBrowse}){
 if(!analysis)return <section className="panel bk-panel" aria-label="Board knowledge"><div className="panel-heading"><div className="title-row"><BookOpen size={18}/><h2>Board knowledge</h2></div></div><p className="studio-note">Loading…</p></section>;
 const {matches,plan}=analysis;const best=matches[0];
 const counts={};for(const p of parts)if(!p.suggested)counts[p.type]=(counts[p.type]||0)+1;
 const byParent=new Map();for(const it of plan.items){if(!byParent.has(it.parent))byParent.set(it.parent,[]);byParent.get(it.parent).push(it)}
 return <section className="panel bk-panel" aria-label="Board knowledge">
  <div className="panel-heading"><div className="title-row"><BookOpen size={18}/><h2>Board knowledge</h2>{best&&<span className="count-label">{pct(best.confidence)} match</span>}</div><button type="button" className="text-button" onClick={onBrowse}>All board types <ChevronDown size={13} style={{transform:'rotate(-90deg)'}}/></button></div>
  <div className="bk-grid">
   <div className="bk-type">{best?<>
     <span className="eyebrow">This looks like</span><h3>{best.type.name}</h3><p>{best.type.description}</p>
     {best.evidence.length>0&&<div className="alt-chips" aria-label="Evidence">{best.evidence.map(e=><span key={e} className="alt-chip plain">{e}</span>)}</div>}
     {matches.length>1&&<small className="muted">Also possible: {matches.slice(1).map(m=>`${m.type.name} (${pct(m.confidence)})`).join(', ')}</small>}
     <BoardTypeCard type={best.type} present={t=>(counts[t]||0)>0}/>
    </>:<><span className="eyebrow">Board type</span><h3>Not recognised yet</h3><p>Identify the parts first.</p></>}
   </div>
   <div className="bk-plan"><div className="bk-plan-head"><span className="eyebrow">Supporting parts</span><h3>{plan.missing?`${plan.missing} part${plan.missing===1?'':'s'} missing`:'Nothing missing'}{plan.planned?<small className="bk-planned"> · {plan.planned} planned</small>:null}</h3>
     <div className="bk-actions">{plan.missing>0&&<button type="button" className="button primary small" onClick={onAdd}><Plus size={14}/>Add {plan.missing} missing part{plan.missing===1?'':'s'}</button>}{suggested>0&&<button type="button" className="button small" onClick={onRemove}><Trash2 size={14}/>Remove {suggested} suggested</button>}</div></div>
    {byParent.size?<div className="table-scroll"><table className="bk-table"><thead><tr><th>For</th><th>Part</th><th>Value</th><th>Example</th><th>Have</th><th>Missing</th></tr></thead><tbody>
     {[...byParent].map(([parent,items])=>items.map((it,i)=><tr key={parent+i} className={it.missing?'missing':''}>{i===0&&<td rowSpan={items.length}><span className="ref-chip">{parent}</span><small className="price-note">{it.role.toUpperCase()}</small></td>}
      <td>{TYPE_WORD[it.type]||it.type}<small className="price-note">{it.purpose}</small></td><td>{it.value}<small className="price-note">{it.package}</small></td><td><code>{it.example}</code></td><td className="numeric">{it.present}/{it.qty}{it.planned?<small className="price-note">+{it.planned} planned</small>:null}</td><td className="numeric">{it.optional?'optional':it.missing||'—'}</td></tr>))}
    </tbody></table></div>:<p className="muted">No support rules apply.</p>}
   </div>
  </div>
 </section>;
}

// Library page: every board type, searchable, with the current board's best match first.
export function BoardTypesLibrary({types,matches}){
 const [q,setQ]=useState('');const [cat,setCat]=useState('all');
 const cats=useMemo(()=>[...new Set((types||[]).map(t=>t.category))],[types]);
 const list=useMemo(()=>{const s=q.trim().toLowerCase();const top=matches?.[0]?.type.id;return (types||[]).filter(t=>(cat==='all'||t.category===cat)&&(!s||[t.name,t.description,t.category,...(t.examples||[]),...(t.signals?.keywords||[])].join(' ').toLowerCase().includes(s))).sort((a,b)=>(b.id===top)-(a.id===top)||a.name.localeCompare(b.name))},[types,q,cat,matches]);
 if(!types)return <p className="studio-note">Loading…</p>;
 return <div className="btype-library">
  <div className="btype-filters"><label className="search-box"><Search size={15}/><input aria-label="Search board types" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)}/></label>
   <div className="filter-tabs" role="group" aria-label="Board category">{['all',...cats].map(c=><button type="button" key={c} className={cat===c?'active':''} aria-pressed={cat===c} onClick={()=>setCat(c)}>{c==='all'?'All':c}<span>{c==='all'?types.length:types.filter(t=>t.category===c).length}</span></button>)}</div></div>
  {matches?.[0]&&<p className="notice"><CircuitBoard size={18}/><span>Studio board: <strong>{matches[0].type.name}</strong> · {pct(matches[0].confidence)} match</span></p>}
  <div className="btype-grid">{list.map(t=><BoardTypeCard key={t.id} type={t} open={t.id===matches?.[0]?.type.id}/>)}</div>
  {!list.length&&<p className="muted">No matches.</p>}
 </div>;
}
