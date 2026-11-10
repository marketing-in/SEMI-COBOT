import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,Download,Upload,ChevronRight,ChevronDown,Plus,FileText,FileSpreadsheet} from 'lucide-react';
import {keyOf,loadDetails,saveDetails,fromKnowledge,lookupDetails,exportJson,importJson,buildWorkbook,readWorkbook} from './partDetails.js';
import {classify,catalogueNodes,TAXONOMY_URL} from './componentTaxonomy.js';
import {knowledgeType} from './partMaster.js';
import {PartKnowledge} from './PartKnowledge.jsx';

// The company's component databank: every part the business knows — the part master, every part
// saved from a Google look-up or an import, the inventory, and the components of every board — one
// entry per part number, sorted into the component catalogue. Searching a part that is not listed
// looks it up (saved copy, then Google through the server) and keeps it in the databank.
const SOURCES=[['all','All'],['master','Part master'],['saved','Saved'],['inventory','Inventory'],['boards','Boards']];
const LABEL={master:'Part master',google:'Google',imported:'Imported',inventory:'Inventory',boards:'Boards'};
const PAGE=100;
const natural=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
const storage=()=>{try{return localStorage}catch{return null}};
const fmt=n=>Number(n).toLocaleString('en-US');
const invType=c=>{const s=String(c||'').toLowerCase();return /capacitor/.test(s)?'capacitor':/resistor/.test(s)?'resistor':/inductor|ferrite/.test(s)?'inductor':/diode/.test(s)?'diode':/transistor|mosfet/.test(s)?'transistor':/opto|led/.test(s)?'led':/connector/.test(s)?'connector':/crystal|oscillat/.test(s)?'crystal':/switch/.test(s)?'switch':/protection|fuse/.test(s)?'fuse':/module/.test(s)?'module':s?'chip':''};
const fromInventory=p=>p?{mpn:p.mpn,manufacturer:p.manufacturer&&p.manufacturer!=='Unspecified'?p.manufacturer:'',title:'',description:p.description&&p.description!=='Imported component'?p.description:'',package:p.package&&p.package!=='Unspecified'?p.package:'',datasheet:'',
 specs:Object.entries(p.specs||{}).slice(0,12).map(([name,value])=>({name,value:String(value)})),links:[],source:'inventory'}:null;

export default function ComponentDirectory({boards=[],activeBoardId,boardModel=[],parts=[],knowledge,onOpenInventory,onAdd,notify,serpReady}){
 const [saved,setSaved]=useState(()=>loadDetails(storage()));
 const [query,setQuery]=useState(''),[busy,setBusy]=useState(()=>new Set()),[open,setOpen]=useState(null),[source,setSource]=useState('all'),[limit,setLimit]=useState(PAGE);
 const fileRef=useRef(null),xlsRef=useRef(null);
 const [tax,setTax]=useState(null),[sel,setSel]=useState(null),[expanded,setExpanded]=useState(null);
 useEffect(()=>{let live=true;fetch(TAXONOMY_URL).then(r=>r.ok?r.json():null).then(j=>{if(live)setTax(j)}).catch(()=>{});return()=>{live=false}},[]);
 // One entry per part number, merged from every source.
 const records=useMemo(()=>{const m=new Map();
  const add=(mpn,src,patch={})=>{const k=keyOf(mpn);if(!k)return null;let r=m.get(k);if(!r){r={key:k,mpn:String(mpn).trim(),type:'',package:'',value:'',leads:'',sources:new Set(),boards:new Map(),inv:null,know:null};m.set(k,r)}
   r.sources.add(src);for(const [f,v] of Object.entries(patch))if(v&&!r[f])r[f]=v;return r};
  for(const e of knowledge?.entries||[])add(e.mpn,'master',{know:{entry:e,match:'exact'},type:knowledgeType(e),package:e.package||e.size||''});
  for(const d of Object.values(saved))add(d.mpn,d.source==='serpapi'?'google':'imported',{package:d.package});
  for(const p of parts)add(p.mpn,'inventory',{inv:p,type:invType(p.category),package:p.package&&p.package!=='Unspecified'?p.package:''});
  for(const b of boards){for(const p of b.id===activeBoardId?boardModel:b.parts||[]){if(p.suggested||!p.mpn||p.mpn==='Unnamed part')continue;
   const r=add(p.mpn,'boards',{type:p.type,package:p.package,value:p.value,leads:p.leads});if(r){if(!r.boards.has(b.name))r.boards.set(b.name,[]);r.boards.get(b.name).push(p.ref)}}}
  return [...m.values()]},[knowledge,saved,parts,boards,activeBoardId,boardModel]);
 const detailsOf=r=>saved[r.key]||fromKnowledge(r.know?.entry)||fromInventory(r.inv)||null;
 const nodes=useMemo(()=>catalogueNodes(tax),[tax]),order=useMemo(()=>new Map(nodes.map((n,i)=>[[n.category,n.type,n.subtype].filter(Boolean).join('|'),i])),[nodes]);
 const classed=useMemo(()=>records.map(r=>({...r,refs:[...r.boards.values()].flat(),cls:classify({type:r.type,mpn:r.mpn,value:r.value,package:r.package,leads:r.leads},detailsOf(r))}))
  .sort((a,b)=>(order.get([a.cls.category,a.cls.type,a.cls.subtype].join('|'))??1e9)-(order.get([b.cls.category,b.cls.type,b.cls.subtype].join('|'))??1e9)||natural(a.mpn,b.mpn)),[records,order]);// eslint-disable-line react-hooks/exhaustive-deps
 const inSource=r=>source==='all'||(source==='saved'?r.sources.has('google')||r.sources.has('imported'):r.sources.has(source));
 const pool=useMemo(()=>classed.filter(inSource),[classed,source]);// eslint-disable-line react-hooks/exhaustive-deps
 const counts=useMemo(()=>{const m=new Map();for(const r of pool){const {category:c,type:t,subtype:s}=r.cls;for(const k of c?[c,c+'|'+t,c+'|'+t+'|'+s]:['']){m.set(k,(m.get(k)||0)+1)}}return m},[pool]);
 const catTotal=nodes.filter(n=>n.level===0).length;
 const open0=expanded??new Set(nodes.filter(n=>n.level===0&&counts.get(n.category)).map(n=>n.category));
 const q=query.trim().toLowerCase();
 const inSel=r=>!sel||(sel.unclassified?!r.cls.category:r.cls.category===sel.category&&(!sel.type||r.cls.type===sel.type)&&(!sel.subtype||r.cls.subtype===sel.subtype));
 const shown=useMemo(()=>pool.filter(r=>{if(!inSel(r))return false;if(!q)return true;const d=detailsOf(r);return [r.mpn,r.value,r.package,d?.manufacturer,d?.description,r.cls.category,r.cls.type,r.cls.subtype,...r.boards.keys()].join(' ').toLowerCase().includes(q)}),[pool,sel,q,saved]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>setLimit(PAGE),[sel,q,source]);
 const treeNodes=useMemo(()=>{if(!q)return nodes.filter(n=>n.level===0||open0.has(n.category));
  const hit=n=>n.label.toLowerCase().includes(q),keepT=new Set(),keepC=new Set();
  for(const n of nodes)if(hit(n)){keepC.add(n.category);if(n.level>=1)keepT.add(n.category+'|'+n.type)}
  return nodes.filter(n=>n.level===0?keepC.has(n.category):n.level===1?keepT.has(n.category+'|'+n.type)||hit(n):keepT.has(n.category+'|'+n.type)&&(hit(n)||nodes.some(m=>m.level===1&&m.category===n.category&&m.type===n.type&&hit(m))))},[nodes,q,open0]);
 const isSel=n=>sel&&!sel.unclassified&&sel.category===n.category&&(sel.type||null)===(n.type||null)&&(sel.subtype||null)===(n.subtype||null);
 const pick=n=>setSel(isSel(n)?null:{category:n.category,type:n.type,subtype:n.subtype});
 const toggle=c=>setExpanded(()=>{const n=new Set(open0);n.has(c)?n.delete(c):n.add(c);return n});
 const missing=classed.filter(r=>!detailsOf(r));
 const store=next=>{setSaved(next);if(!saveDetails(storage(),next))notify?.('Could not save in this browser (storage full or blocked).')};
 // Local first; a network answer is saved, so the part stays in the databank.
 const lookup=async mpn=>{const k=keyOf(mpn);setBusy(b=>new Set(b).add(k));
  try{const {info,from}=await lookupDetails(mpn,{saved,fetcher:(...a)=>fetch(...a)});if(from!=='saved')store({...saved,[k]:info});return {info,from}}
  catch(e){notify?.(e.message);return null}finally{setBusy(b=>{const n=new Set(b);n.delete(k);return n})}};
 const submit=async e=>{e.preventDefault();const term=query.trim();if(!term)return;const k=keyOf(term),hit=classed.find(r=>r.key===k);
  if(hit&&detailsOf(hit)){setSel(null);setSource('all');setOpen(k);return}
  const res=await lookup(term);if(!res)return;setSel(null);setSource('all');setQuery(res.info.mpn||term);setOpen(keyOf(res.info.mpn||term));
  notify?.(res.from==='saved'?'Already saved':`${res.info.mpn||term} added to the databank`)};
 const lookupMissing=async()=>{let next={...saved},n=0;for(const r of missing){setBusy(b=>new Set(b).add(r.key));
   try{const {info}=await lookupDetails(r.mpn,{saved:next,fetcher:(...a)=>fetch(...a)});next={...next,[r.key]:info};n++}catch(e){notify?.(`${r.mpn}: ${e.message}`)}finally{setBusy(b=>{const s=new Set(b);s.delete(r.key);return s})}}
  store(next);notify?.(`${n} part detail${n===1?'':'s'} saved`)};
 const fileName=ext=>`component-databank.${ext}`;
 // Exports cover what is shown: the whole databank, or the current category, source and search.
 const download=()=>{const data=exportJson({board:{id:'databank',name:'Component databank',width:0,height:0},rows:shown,saved,detailsOf}),blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=fileName('json');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 const downloadExcel=async()=>{try{const {default:ExcelJS}=await import('exceljs');const wb=buildWorkbook(ExcelJS,{board:null,rows:shown,detailsOf,nodes,counts});
  const blob=new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName('xlsx');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  catch(e){notify?.('Could not create the workbook: '+e.message)}};
 const merge=(add,what)=>{const n=Object.keys(add).length;if(!n){notify?.(`No part details found in that ${what}.`);return}store({...saved,...add});notify?.(`${n} part detail${n===1?'':'s'} imported`)};
 const upload=async file=>{if(!file)return;try{merge(importJson(JSON.parse(await file.text())),'file')}catch{notify?.('That file is not valid JSON.')}};
 const uploadExcel=async file=>{if(!file)return;if(file.size>5e6){notify?.('Choose a workbook smaller than 5 MB.');return}
  try{const {default:ExcelJS}=await import('exceljs');merge(await readWorkbook(ExcelJS,await file.arrayBuffer()),'workbook')}catch(e){notify?.(e.message||'That file is not a valid workbook.')}};
 const defaults=(r,d)=>({mpn:r.mpn||d?.mpn||'',manufacturer:d?.manufacturer||'',description:d?.description||'',package:d?.package||r.package||'',fromMaster:true});

 const Details=({r,d})=><div className="dir-details">
  {r.know&&<PartKnowledge know={r.know} parts={parts} onOpenInventory={onOpenInventory}/>}
  {d&&d.source!=='part-master'&&<>{d.title&&<strong>{d.title}</strong>}{d.description&&<p>{d.description}</p>}
   {d.specs.length>0&&<ul className="dir-specs">{d.specs.map((s,i)=><li key={i}>{s.name?<><span>{s.name}</span> {s.value}</>:s.value}</li>)}</ul>}
   {d.links.length>0&&<ul className="dir-links">{d.links.map(l=><li key={l.link}><a href={l.link} target="_blank" rel="noreferrer">{l.title||l.link}</a><small>{l.source}</small></li>)}</ul>}</>}
  {r.inv&&<p className="dir-inv"><b>Inventory</b> {fmt(r.inv.stock||0)} in stock · minimum {fmt(r.inv.min||0)}{r.inv.location&&r.inv.location!=='Unassigned'?` · ${r.inv.location}`:''}</p>}
  {r.boards.size>0&&<p className="dir-inv"><b>Boards</b> {[...r.boards].map(([n,refs])=>`${n}: ${refs.slice(0,8).join(', ')}${refs.length>8?'…':''}`).join(' · ')}</p>}
  {!d&&!r.know&&<p className="muted">No details yet.{serpReady?' Look it up to search Google.':''}</p>}
  <small className="muted">{[...r.sources].map(s=>LABEL[s]).join(' · ')}{d?.fetchedAt?` · ${new Date(d.fetchedAt).toLocaleDateString()}`:''}</small></div>;

 return <section className="panel directory-panel" aria-label="Component databank">
  <div className="panel-heading"><div className="title-row"><h2>Component databank</h2><span className="count-label">{fmt(classed.length)} parts</span></div>
   <div className="panel-actions">{serpReady&&missing.length>0&&<button type="button" className="text-button" onClick={lookupMissing} disabled={busy.size>0}><Search size={14}/>Look up {missing.length} missing</button>}
    <button type="button" className="text-button" onClick={downloadExcel}><FileSpreadsheet size={14}/>Export Excel</button>
    <button type="button" className="text-button" onClick={()=>xlsRef.current?.click()}><Upload size={14}/>Import Excel</button><input ref={xlsRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-label="Import part details Excel" onChange={e=>{uploadExcel(e.target.files?.[0]);e.target.value=''}}/>
    <button type="button" className="text-button" onClick={download}><Download size={14}/>Export JSON</button>
    <button type="button" className="text-button" onClick={()=>fileRef.current?.click()}><Upload size={14}/>Import JSON</button><input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Import part details JSON" onChange={e=>{upload(e.target.files?.[0]);e.target.value=''}}/></div></div>
  <div className="dir-bar">
   <form className="list-search dir-search" onSubmit={submit}><Search size={14}/><input aria-label="Search the databank" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Part number, description, category…"/><button type="submit" className="button small" disabled={!query.trim()||busy.has(keyOf(query))}>{busy.has(keyOf(query))?'Searching…':'Look up'}</button></form>
   <div className="segmented" role="group" aria-label="Source">{SOURCES.map(([k,l])=><button type="button" key={k} aria-pressed={source===k} className={source===k?'active':''} onClick={()=>setSource(k)}>{l}</button>)}</div>
  </div>
  <div className="dir-body">
  <nav className="dir-tree" aria-label="Component categories">
   <div className="dir-tree-head"><strong>Categories</strong>{sel&&<button type="button" className="text-button" onClick={()=>setSel(null)}>All</button>}{!q&&<button type="button" className="text-button" onClick={()=>setExpanded(open0.size===catTotal?new Set():new Set(nodes.filter(n=>n.level===0).map(n=>n.category)))}>{open0.size===catTotal?'Collapse all':'Expand all'}</button>}</div>
   {!tax?<p className="muted dir-tree-empty">Loading categories…</p>:<ul>{treeNodes.map(n=>{const key=[n.category,n.type,n.subtype].filter(Boolean).join('|'),c=counts.get(key)||0;
    return <li key={key} className={'lv'+n.level+(c?'':' empty')+(isSel(n)?' sel':'')}>{n.level===0&&!q&&<button type="button" className="dir-caret" aria-label={(open0.has(n.category)?'Collapse ':'Expand ')+n.category} aria-expanded={open0.has(n.category)} onClick={()=>toggle(n.category)}><ChevronDown size={13}/></button>}
     <button type="button" className="dir-node" aria-pressed={!!isSel(n)} onClick={()=>pick(n)}><span>{n.label}</span>{c>0&&<b>{fmt(c)}</b>}</button></li>})}
    {counts.get('')>0&&!q&&<li className={'lv0'+(sel?.unclassified?' sel':'')}><button type="button" className="dir-node" aria-pressed={!!sel?.unclassified} onClick={()=>setSel(sel?.unclassified?null:{unclassified:true})}><span>Unclassified</span><b>{fmt(counts.get(''))}</b></button></li>}
    {q&&!treeNodes.length&&<li className="muted dir-tree-empty">No category matches</li>}</ul>}
  </nav>
  <div className="dir-main"><div className="table-scroll"><table className="dir-table"><thead><tr><th>Part number</th><th>Category</th><th>Manufacturer</th><th>Description</th><th>Sources</th><th aria-label="Actions"/></tr></thead><tbody>
   {shown.slice(0,limit).map(r=>{const d=detailsOf(r),isOpen=open===r.key;return <React.Fragment key={r.key}>
    <tr className={isOpen?'open':''}><td><button type="button" className="part-link" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?null:r.key)}><ChevronDown size={14} className="dir-chev"/><span><strong>{r.mpn}</strong><small>{r.package||d?.package||r.type}</small></span></button></td>
     <td className="dir-cat">{r.cls.category?<><span>{r.cls.type} › {r.cls.subtype}</span><small className="price-note">{r.cls.category}</small></>:<span className="muted">Unclassified</span>}</td>
     <td>{d?.manufacturer||<span className="muted">—</span>}</td><td className="dir-desc">{d?.description||<span className="muted">—</span>}</td>
     <td className="dir-sources">{[...r.sources].map(s=><span key={s} className={'badge '+(s==='google'||s==='imported'?'green':'neutral')}>{LABEL[s]}</span>)}{!d&&serpReady&&<button type="button" className="text-button" onClick={()=>lookup(r.mpn)} disabled={busy.has(r.key)}>{busy.has(r.key)?'Searching…':'Look up'}</button>}</td>
     <td className="dir-actions">{d?.datasheet&&<a className="inline-icon" href={d.datasheet} target="_blank" rel="noreferrer" aria-label={`Datasheet for ${r.mpn}`}><FileText size={15}/></a>}
      {r.inv?<button type="button" className="icon-button" aria-label={`Open ${r.inv.mpn} in inventory`} onClick={()=>onOpenInventory(r.inv)}><ChevronRight size={17}/></button>:<button type="button" className="text-button" aria-label={`Add ${r.mpn} to inventory`} onClick={()=>onAdd(defaults(r,d))}><Plus size={14}/>Add</button>}</td></tr>
    {isOpen&&<tr className="dir-open"><td colSpan={6}><Details r={r} d={d}/></td></tr>}</React.Fragment>})}
   {!shown.length&&<tr><td colSpan={6} className="muted">{q?`“${query}” is not in the databank. Press Look up to search for it.`:'Nothing in this category.'}</td></tr>}
  </tbody></table></div>
  {shown.length>limit&&<div className="dir-more"><span className="muted">{fmt(limit)} of {fmt(shown.length)}</span><button type="button" className="button small" onClick={()=>setLimit(l=>l+PAGE*5)}>Show more</button></div>}
  </div></div>
 </section>;
}
