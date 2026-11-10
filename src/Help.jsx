import React from 'react';
import {PlayCircle,Compass,ArrowRight,Boxes,Plug,Store,Globe,CircuitBoard,Calculator,Box,FileDown,Factory,BookMarked,Bookmark,Package,Bell,Settings2} from 'lucide-react';
import {STAGES,STAGE_GROUPS} from './production.js';
import {BOM_STEPS} from './bomDemo.js';

// Help page: how the product fits together, how to use each page, where prices come from, what each
// production stage means, and answers to common questions. The tour and the BOM demo start from here.
const QUICK=[
 ['Upload the Gerber','BOM tool, step 1. The bare board is drawn and quoted, the board opens in Board studio and its parts fill step 2.',CircuitBoard],
 ['Upload the BOM','Step 2. An Excel or CSV file with MPN and Quantity columns. Press Get prices.',Calculator],
 ['Pick an enclosure','Step 3, optional. Off the shelf, or custom moulded with the mould on the same page.',Box],
 ['Quote','Step 4. Check totals and download the quotation PDF.',FileDown],
 ['Save or continue','Save list keeps everything for later. Continue to production books the job.',Bookmark],
 ['Follow the job','Production shows every stage from incoming check to final product.',Factory]];
const SOURCES=[
 ['Internal stock',Boxes,'Your own inventory is always used first. A line covered by own stock needs no purchase; a part short in stock is bought for the rest.'],
 ['Authorised distributors',Plug,'DigiKey, Mouser, Nexar, TME and Master Electronics, through their APIs, with stock, price breaks, MOQ and lead time. Keys are set on the server (Integrations).'],
 ['Registered vendors',Store,'Products that vendors listed on the Vendors page (stock, price, MOQ, lead time). They appear as "Registered vendor" offers on BOM lines with the same part number.'],
 ['Open market',Globe,'Google Shopping listings through SerpApi. Only listings that are exactly the part are shown: not a longer part number, not a kit, module or "compatible" item, one per seller. Prices are not restricted, but these offers are unverified and never chosen without you.']];
const PAGES=[
 ['Overview','The whole flow on one line, from part master and stock to final product, plus stock value and alerts.',null],
 ['BOM tool','Bare PCB → Components → Enclosure → Quotation. Only Components is required; the rest are options.',Calculator],
 ['Saved lists','Every list saved from the quotation step. Open it again, duplicate it for another quantity, or follow it into production.',Bookmark],
 ['Part master','Every part the company knows, sorted into 10 categories, with specs, alternates and look-ups.',BookMarked],
 ['Inventory','Own stock (quantities, value, minimums) and boards on their way from the line to dispatch.',Package],
 ['Board studio','Gerber, KiCad, pick-and-place or a PDF as a 3D board. Hover to name a part, run the SMT line.',CircuitBoard],
 ['Production','Jobs, machines and capacity. Complete stages, send boards to rework at a quality gate, open the BOM a job came from.',Factory],
 ['Vendors','Every vendor kind. Describe what they do and register the products they have.',Store],
 ['Alerts','Low, out-of-stock and end-of-life parts with alternatives.',Bell],
 ['Integrations','Which supplier and AI keys are set on the server.',Settings2]];
const FAQ=[
 ['Do I need a Gerber?','No. The bare PCB and the enclosure are options. Upload only the BOM if that is what you have.'],
 ['The Gerber gave no components. Why?','Many Gerber sets carry no part data. semi-cobot infers parts from the pads, drills and silkscreen; add the pick-and-place file to the ZIP, or upload the BOM in step 2.'],
 ['What does "Not available" mean?','The supplier did not report that value. Nothing is guessed: a missing price leaves the line out of the totals until you enter or fetch one.'],
 ['Why are some Google Shopping listings hidden?','They were not the exact part (a longer part number, a kit, a module, a "compatible" item) or the same seller again. The part overview says how many and why.'],
 ['How does a list reach production?','Quotation step → Continue to production. The list is saved as ordered, a job is booked, and the job keeps its quote number and a link back to the BOM.'],
 ['Where is my data kept?','In this browser: inventory, BOMs, saved lists, vendors and jobs. Export Excel from Inventory or Part master to keep a copy. Supplier keys stay on the server.'],
 ['How is the mould priced?','From the mould maker\'s quote. The estimate shows weight, cycle time, clamp force and tool class; a cost per enclosure appears only from your resin price and machine rate.']];

export default function Help({onNavigate=()=>{},onTour=()=>{},onBomDemo=()=>{}}){
 const chapters=[...new Set(BOM_STEPS.map(s=>s.ch))];
 return <div className="help-page">
  <section className="panel help-hero"><div><h2>How semi-cobot works</h2><p>A customer's board goes from its files to a quotation, into production and out as a tested product. Each step hands its result to the next, so nothing is typed twice.</p></div>
   <div className="help-actions"><button className="button primary" onClick={onTour}><Compass size={15}/>Take the tour</button><button className="button" onClick={onBomDemo}><PlayCircle size={15}/>Watch the BOM demo</button></div></section>

  <section className="panel help-section" aria-label="Quick start"><h2>Quick start</h2>
   <ol className="help-quick">{QUICK.map(([t,d,Icon],i)=><li key={t}><span className="help-n">{i+1}</span><Icon size={16}/><div><strong>{t}</strong><p>{d}</p></div></li>)}</ol></section>

  <section className="panel help-section" aria-label="BOM demo"><h2>The BOM demo</h2><p className="muted">A priced demo BOM replaces yours while it runs and is put back when it ends. {BOM_STEPS.length} steps in {chapters.length} chapters:</p>
   <ol className="help-chapters">{chapters.map(c=><li key={c}><strong>{c}</strong><span>{BOM_STEPS.filter(s=>s.ch===c).map(s=>s.title).join(' · ')}</span></li>)}</ol>
   <button className="button small" onClick={onBomDemo}><PlayCircle size={14}/>Start the demo</button></section>

  <section className="panel help-section" aria-label="Where prices come from"><h2>Where prices come from</h2><p className="muted">Each BOM line looks in this order. The best offer for the quantity is suggested; you can choose any other.</p>
   <ol className="help-sources">{SOURCES.map(([t,Icon,d],i)=><li key={t}><span className="help-n">{i+1}</span><Icon size={16}/><div><strong>{t}</strong><p>{d}</p></div></li>)}</ol></section>

  <section className="panel help-section" aria-label="Production stages"><h2>Production stages</h2><p className="muted">Every job runs these stages. Stages marked “gate” are quality checks: failed boards go to rework and come back to the same gate.</p>
   <div className="help-stages">{STAGE_GROUPS.map(g=><div key={g}><h3>{g}</h3><ul>{STAGES.filter(s=>s.group===g).map(s=><li key={s.key}><strong>{s.name}{s.gate?' · gate':''}</strong><span>{s.about}</span></li>)}</ul></div>)}</div></section>

  <section className="panel help-section" aria-label="Pages"><h2>Every page</h2>
   <ul className="help-pages">{PAGES.map(([p,d])=><li key={p}><div><strong>{p}</strong><p>{d}</p></div><button className="text-button" onClick={()=>onNavigate(p)}>Open <ArrowRight size={13}/></button></li>)}</ul></section>

  <section className="panel help-section" aria-label="Questions"><h2>Questions</h2>
   <div className="help-faq">{FAQ.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
 </div>;
}
