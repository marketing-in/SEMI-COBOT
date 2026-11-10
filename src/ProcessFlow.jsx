import React,{useMemo} from 'react';
import {Boxes,BookMarked,Calculator,Bookmark,PackageCheck,Factory,Wrench,FlaskConical,Truck,Store,ChevronRight} from 'lucide-react';
import {STAGE_GROUPS,stageInfo,flowSummary} from './production.js';
import {loadLists} from './savedLists.js';
import {vendorsOf} from './vendors.js';

const ICONS={Material:PackageCheck,'Factory line':Factory,Assembly:Wrench,Testing:FlaskConical,'Final product':Truck};
const fmt=n=>Number(n||0).toLocaleString('en-IN');

// The whole product on one line, each step with its live count and a link to its page: part master →
// BOM tool → saved lists → material → factory line → assembly → testing → final product, with the
// vendors every step buys from. Jobs are counted at the group their current stage belongs to.
export default function ProcessFlow({partCount=0,stockCount=0,bomLines=0,jobs=[],onNavigate=()=>{}}){
 const lists=useMemo(loadLists,[]);
 const vendors=useMemo(()=>vendorsOf(null).length,[]);
 const at=useMemo(()=>{const c=Object.fromEntries(STAGE_GROUPS.map(g=>[g,0]));for(const j of jobs){if(j.finished)continue;const info=stageInfo(j);const st=info.stages[info.current];if(st)c[st.group]++}return c},[jobs]);
 const flow=flowSummary(jobs);
 const steps=[
  {key:'Part master',icon:BookMarked,value:fmt(partCount),note:'parts known',page:'Part master'},
  {key:'Internal stock',icon:Boxes,value:fmt(stockCount),note:'parts in own stock, used first',page:'Inventory'},
  {key:'BOM tool',icon:Calculator,value:fmt(bomLines),note:'lines in the open BOM',page:'BOM tool'},
  {key:'Saved lists',icon:Bookmark,value:fmt(lists.length),note:`${lists.filter(l=>l.status==='quoted').length} quoted · ${lists.filter(l=>l.status==='ordered').length} ordered`,page:'Saved lists'},
  ...STAGE_GROUPS.map(g=>({key:g,icon:ICONS[g],value:fmt(at[g]),note:g==='Final product'?`${fmt(flow.ready)} ready · ${fmt(flow.dispatched)} dispatched`:`job${at[g]===1?'':'s'} here`,page:g==='Final product'?'Inventory':'Production'}))];
 return <section className="panel process-flow" aria-label="Product flow">
  <div className="panel-heading"><div className="title-row"><h2>From part to final product</h2></div><button className="text-button" onClick={()=>onNavigate('Vendors')}><Store size={14}/>{fmt(vendors)} vendors</button></div>
  <ol className="flow-chain">{steps.map((s,i)=>{const Icon=s.icon;return <li key={s.key}><button type="button" onClick={()=>onNavigate(s.page)}><span className="flow-icon"><Icon size={16}/></span><small>{s.key}</small><strong>{s.value}</strong><span className="muted">{s.note}</span></button>{i<steps.length-1&&<ChevronRight size={14} className="flow-arrow" aria-hidden="true"/>}</li>})}</ol>
 </section>;
}
