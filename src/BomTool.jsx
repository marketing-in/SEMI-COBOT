import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {PlayCircle,Bookmark,Factory,CheckCircle2,Calculator,RefreshCw,Trash2,Plus,Upload,FileDown,ArrowRight,ArrowUpRight,TriangleAlert,X,Truck,CircuitBoard,ClipboardList,Replace,Search,ChevronDown,ChevronRight,Columns3,Gavel,ArrowUpDown,ArrowUp,ArrowDown,Info} from 'lucide-react';
import {cartUnit,MAX_MARGIN,marketLabel,availability,rowCost,sourcingAlerts,pcbEstimate,pcbFieldsFor,pcbSpecText,typicalBoard,purchasePlan,rowsFromParts,rowsFromTable,offerKey,unitAt,marketStock,recommend,allOffers,orderQty,offerLeadDays,supplierShipping,quoteTotals,riskOf,bomSummary,cartAdd,PRICING,PCB_MATERIALS} from './bom.js';
import {scoreRow,SCORES} from './bomScores.js';
import {useMoney} from './currency.jsx';
import {PartImage} from './PartImage.jsx';
import BomOverview,{ScoreBadge,days} from './BomOverview.jsx';
import BomCart,{BidDialog} from './BomCart.jsx';
import PcbGerber from './PcbGerber.jsx';
import {viaOptionFor} from './gerberQuote.js';
import {demoBomState,DEMO_GERBER} from './bomDemo.js';
import BomTour from './BomTour.jsx';
import {BOM_DEMO} from './Tour.jsx';
import {lookupPart,alternatesOf} from './partMaster.js';
import {quotePdf,quoteNumber} from './quotePdf.js';
import {ComponentPlanning,EnclosurePlanning,PCB_VENDORS,VendorDirectory} from './BomSourcing.jsx';
import {enclosureSize,observeOffers,partKey,partOutlook,quotationOutlook} from './bomPlanning.js';
import MouldStep from './MouldStep.jsx';
import {saveList,loadLists} from './savedLists.js';
import {loadVendorData,vendorOffersFor} from './vendors.js';

// BOM tool: analyse and price a bill of materials for a build. Rows come from a board, the inventory
// or an uploaded BOM file; /api/compare asks the connected distributors (keys stay on the server) for
// price breaks, stock, lead times, lifecycle and compliance. Each line is priced from own stock first,
// then the selected or best offer, with its own markup or margin, and scored 0–100 for resilience,
// quality, economics and sustainability (bomScores.js). A line opens into its overview with every
// offer across the markets. The optional bare PCB, supplier shipping and customer delivery complete
// the customer total and net profit, and the quotation downloads as PDF.
// BACKUP holds the user's own BOM while the demo runs.
const STORE='semicobot-bom-tool-v1',FROM='semicobot-quote-from-v1',BACKUP='semicobot-bom-backup-v1';
// The order of the work: the bare board first (its outline sizes the enclosure), then the components,
// the enclosure, the mould for a custom enclosure, and the quotation with Save list and Continue.
const STEPS=['Bare PCB','Components','Enclosure','Quotation'];
// Only the components are needed; the bare board and the enclosure (with its mould) are options.
const OPTIONAL=new Set(['Bare PCB','Enclosure']);
// One plain sentence per step: what to do here and where it goes next.
const GUIDE=[
 'Optional. Upload the Gerber ZIP: the board size and layers fill the PCB quote, the board opens in Board studio, its components fill the Components step and its size sizes the enclosure. No Gerber? Skip to Components.',
 'Required. Upload your Excel or CSV BOM (MPN and quantity), or use a board. Each line is priced from your own stock first, then authorised distributors, registered vendors and the open market.',
 'Optional. Choose off the shelf or custom moulded. A custom enclosure gets its mould here: the estimate, the mould makers and the maker\'s quote.',
 'Check the totals, download the quotation PDF, then Save list to come back later or Continue to send it to production.'];
const DEFAULT={project:'',customer:'',due:'',listId:null,from:'',boards:100,margin:15,method:'markup',rows:[],pcb:{material:'',choice:'',widthMm:100,heightMm:67,layers:2,spec:{},gerber:null,unit:null,margin:0,vendor:''},
 history:{},purchases:{},hikes:{three:3,nine:9},
 box:{material:'',kind:'shelf',vendor:'',clearance:3,wall:2,standoff:5,pcbThickness:1.6,component:15,top:3,notes:'',unit:null,tooling:null},
 mould:{cavities:1,toolClass:'',maker:'',tooling:null,unit:null,leadWeeks:'',resinPerKg:null,machinePerHour:null,notes:''},
 shipping:{deliveryCost:0,note:'',free:false,charge:null},supplierRules:{},cart:[],bids:[],shopping:false,pricedAt:null,cols:{},sort:{key:'',dir:1}};
function load(){try{let v=JSON.parse(localStorage.getItem(STORE));
 // A demo left behind (the page closed mid-tour) gives way to the user's own BOM.
 if(v?.demo){const own=localStorage.getItem(BACKUP);localStorage.removeItem(BACKUP);if(own)localStorage.setItem(STORE,own);else localStorage.removeItem(STORE);v=own?JSON.parse(own):null}
 if(!v||typeof v!=='object')return DEFAULT;const s={...DEFAULT,...v};
 // Earlier versions: pcb.on and shipping {on, amount}.
 if(v.pcb&&'on' in v.pcb&&!('material' in v.pcb))s.pcb={...DEFAULT.pcb,...v.pcb,material:v.pcb.on?'fr4':''};
 else s.pcb={...DEFAULT.pcb,...v.pcb};
 s.box={...DEFAULT.box,...v.box};s.mould={...DEFAULT.mould,...v.mould};
 if(v.shipping&&'amount' in v.shipping&&!('deliveryCost' in v.shipping))s.shipping={...DEFAULT.shipping,deliveryCost:v.shipping.on?+v.shipping.amount||0:0,note:v.shipping.note||''};
 return s}catch{return DEFAULT}}
const loadFrom=()=>{try{return {company:'',address:'',contact:'',...JSON.parse(localStorage.getItem(FROM))}}catch{return {company:'',address:'',contact:''}}};
const n0=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
// Placeholders written by the inventory import for blank cells are missing data, not values.
const real=v=>/^(unspecified|imported component|unknown|n\/a|-|—)$/i.test(String(v??'').trim())?'':v||'';
const fmtInt=v=>Math.round(v).toLocaleString('en-IN');
const NA='Not available';
const KEEP=['mpn','manufacturer','seller','source','stock','priceUsd','breaksUsd','moq','mult','leadDays','factoryLeadDays','factoryStock','authorized','marketType','condition','lifecycle','discontinued','compliance','suggestedReplacement','datasheet','url','image','description','title','currency','price'];
const slim=o=>Object.fromEntries(KEEP.filter(k=>o[k]!=null).map(k=>[k,k==='breaksUsd'?o[k].slice(0,10):o[k]]));
const when=iso=>iso?new Date(iso).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'';

// Table columns: the compact set is always on; the optional ones are chosen under Columns.
const COLS=[
 {key:'mpn',label:'MPN'},{key:'brand',label:'Brand'},{key:'stock',label:'Avail.',long:'Available stock',numeric:true},
 ...SCORES.map(([key,label,tip])=>({key,label:{resilience:'Resil.',economic:'Econ.',sustainability:'Sust.'}[key]||label,long:label,numeric:true,score:true,tip})),
 {key:'unit',label:'Unit price',numeric:true},
 {key:'description',label:'Description',optional:true},{key:'supplier',label:'Supplier',long:'Selected supplier',optional:true},{key:'need',label:'Req. qty',long:'Required quantity',numeric:true,optional:true},
 {key:'total',label:'Total',long:'Total price',numeric:true,optional:true},{key:'qtyPerBoard',label:'Qty / board',numeric:true,optional:true},{key:'own',label:'Own stock',numeric:true,optional:true},
 {key:'lead',label:'Lead time',numeric:true,optional:true},{key:'package',label:'Package',optional:true},{key:'margin',label:'Markup / margin',numeric:true,optional:true}];

function parseCsv(text){const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else if(c==='"')q=true;else if(c===','||c===';'||c==='\t'){row.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows}

function Dialog({title,onClose,children,wide}){const ref=useRef(null),id=useId();useEffect(()=>{const prev=document.activeElement;ref.current.showModal();return()=>prev?.focus?.()},[]);
 return <dialog ref={ref} className={wide?'wide':''} aria-labelledby={id} onCancel={onClose} onClick={e=>{if(outside(e,ref.current))onClose()}}><div className="modal-head"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div>{children}</dialog>}
// A click on the dialog's backdrop (outside its box), not on its padding.
export const outside=(e,el)=>{if(e.target!==el)return false;const r=el.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom};
// A small "i" with a tooltip (hover or keyboard focus, shown by TipLayer).
function Tip({text,label='About this'}){const id=useId();return <span className="tip" tabIndex={0} role="img" aria-label={label} aria-describedby={id} data-tip=""><Info size={12}/><span id={id} className="sr-only">{text}</span></span>}
// One floating tooltip for the BOM pages: elements with data-tip show their text (or the text their
// aria-describedby points at) on hover or focus, above every panel so nothing clips it. It stays while
// the pointer moves onto it and closes with Escape.
export function TipLayer(){
 const [tip,setTip]=useState(null),timer=useRef(null),box=useRef(null);
 useEffect(()=>{
  const textOf=el=>{const own=el.getAttribute('data-tip');if(own)return own;const id=el.getAttribute('aria-describedby');return id?document.getElementById(id)?.textContent||'':''};
  const show=e=>{const el=e.target?.closest?.('[data-tip]');if(!el)return;const text=textOf(el);if(!text)return;clearTimeout(timer.current);setTip({text,r:el.getBoundingClientRect()})};
  const hide=e=>{const el=e.target?.closest?.('[data-tip]');if(!el||box.current?.contains(e.relatedTarget))return;clearTimeout(timer.current);timer.current=setTimeout(()=>setTip(null),150)};
  const key=e=>{if(e.key==='Escape')setTip(null)};const drop=()=>setTip(null);
  document.addEventListener('mouseover',show);document.addEventListener('focusin',show);document.addEventListener('mouseout',hide);document.addEventListener('focusout',hide);document.addEventListener('keydown',key);addEventListener('scroll',drop,true);
  return()=>{document.removeEventListener('mouseover',show);document.removeEventListener('focusin',show);document.removeEventListener('mouseout',hide);document.removeEventListener('focusout',hide);document.removeEventListener('keydown',key);removeEventListener('scroll',drop,true);clearTimeout(timer.current)};
 },[]);
 if(!tip)return null;const W=Math.min(300,innerWidth-16),below=tip.r.bottom+8+140<innerHeight,left=Math.max(8,Math.min(innerWidth-W-8,tip.r.left+tip.r.width/2-W/2));
 return <div ref={box} className="tip-layer" aria-hidden="true" style={{width:W,left,...(below?{top:tip.r.bottom+6}:{bottom:innerHeight-tip.r.top+6})}} onMouseEnter={()=>clearTimeout(timer.current)} onMouseLeave={()=>setTip(null)}>{tip.text}</div>;
}

export default function BomTool({parts=[],boards=[],activeBoardId,boardModel=[],boardTypes=[],knowledge=null,api=null,notify=()=>{},onCompare=()=>{},onContinue=null,onOpenSavedLists=()=>{},onVendors=()=>{},onGerberFiles=null}){
 const money=useMoney();
 const [s,setS]=useState(load),[step,setStep]=useState(0);
 const workflow=useRef(null);
 const goTo=next=>{setStep(next);workflow.current?.focus();workflow.current?.scrollIntoView({block:'start'})};
 // Amounts typed by the user keep the currency they were typed in ({v, c}) and convert at the current
 // rate when used, so ₹500 stays ₹500 when the rate moves. Bare numbers are USD (earlier saves).
 const usdOf=x=>x==null||x===''?null:typeof x==='object'?(x.c==='INR'?n0(x.v)/money.inrPerUsd:n0(x.v)):Math.max(0,n0(x));
 const typed=v=>v===''?null:{v:Math.max(0,n0(v)),c:money.currency};
 const shownAmt=x=>x==null||x===''?'':typeof x==='object'&&x.c===money.currency?x.v:+money.value(usdOf(x)).toFixed(4);
 const live=(v,c)=>v==null?null:c==='INR'?v/money.inrPerUsd:v;
 const liveOffer=o=>o.priceOriginal==null&&o.shippingOriginal==null?o:{...o,priceUsd:live(o.priceOriginal,o.currencyOriginal),breaksUsd:o.priceOriginal!=null?[{qty:1,price:live(o.priceOriginal,o.currencyOriginal)}]:[],shippingUsd:o.shippingOriginal!=null?live(o.shippingOriginal,o.currencyOriginal):o.shippingUsd??null};
 // Products registered vendors listed on the Vendors page join each line's offers (read when the tool opens).
 const vendorData=useMemo(loadVendorData,[]);
 const rows=useMemo(()=>s.rows.map(r=>{const vo=vendorOffersFor(r.mpn,vendorData,money.inrPerUsd);const x=vo.length?{...r,vendorOffers:vo}:r;return x.manualOffers?.length?{...x,manualOffers:x.manualOffers.map(liveOffer)}:x}),[s.rows,money.inrPerUsd,vendorData]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify(s))}catch{notify('Storage full: the BOM was not saved.')}},[s]);// eslint-disable-line react-hooks/exhaustive-deps
 const set=patch=>setS(x=>({...x,...(typeof patch==='function'?patch(x):patch)}));
 const setRow=(id,patch)=>setS(x=>({...x,rows:x.rows.map(r=>r.id===id?{...r,...(typeof patch==='function'?patch(r):patch)}:r)}));
 const [busy,setBusy]=useState(''),[addMpn,setAddMpn]=useState(''),[addQty,setAddQty]=useState('1'),[alt,setAlt]=useState(null),[quote,setQuote]=useState(false),[open,setOpen]=useState(()=>new Set());
 const [query,setQuery]=useState(''),[detail,setDetail]=useState(null),[cartOpen,setCartOpen]=useState(null),[bid,setBid]=useState(null),[colsOpen,setColsOpen]=useState(false);
 const fileRef=useRef(null);
 const [savedCount,setSavedCount]=useState(()=>loadLists().length);
 const inv=useMemo(()=>new Map(parts.map(p=>[String(p.mpn).toUpperCase(),p])),[parts]);
 const invOf=r=>inv.get(String(r.mpn).toUpperCase())||null;
 const calcs=useMemo(()=>rows.map(r=>rowCost(r,{boards:s.boards,inventory:invOf(r),defaultMargin:s.margin,method:s.method})),[rows,s.boards,s.margin,s.method,inv]);// eslint-disable-line react-hooks/exhaustive-deps
 const scores=useMemo(()=>rows.map((r,i)=>scoreRow(r,calcs[i])),[rows,calcs]);
 const risks=useMemo(()=>rows.map((r,i)=>riskOf(r,calcs[i],scores[i])),[rows,calcs,scores]);
 const summary=bomSummary(rows,calcs,risks,r=>!!invOf(r));
 const firstRisk=rows.find((r,i)=>risks[i]?.atRisk)?.id;
 const active=boards.find(b=>b.id===activeBoardId)||boards[0];
 // Bare PCB: a material, then this board's size or a board type's typical size; the price is an estimate until entered.
 const sizeOptions=useMemo(()=>[...(active?[{id:'board:'+active.id,label:`${active.name} (this board)`,widthMm:Math.round(active.width)||100,heightMm:Math.round(active.height)||67,layers:active.layers||2}]:[]),
  ...(boardTypes||[]).map(t=>({id:'type:'+t.id,label:t.name,...typicalBoard(t)}))],[active,boardTypes]);
 const pcbOn=!!s.pcb.material,mat=PCB_MATERIALS.find(m=>m.id===s.pcb.material)||PCB_MATERIALS[0];
 const est=pcbEstimate({material:s.pcb.material||'fr4',layers:s.pcb.layers,widthMm:s.pcb.widthMm,heightMm:s.pcb.heightMm,qty:s.boards,spec:s.pcb.spec});
 // The quote-form choices this material and layer count allow, grouped as the fab's form groups them.
 const pcbGroups=[...pcbFieldsFor(mat.id,est.layers).reduce((m,f)=>m.set(f.group,[...(m.get(f.group)||[]),f]),new Map())];
 // The board the BOM was loaded from (by id, or by name for BOMs saved before the id was kept), unless its
 // bare board was removed here. The board in the 3D view brings its current parts.
 const bomBoardRaw=boards.find(b=>b.id===s.fromBoard)||(!s.fromBoard&&s.from?boards.find(b=>b.name===s.from):null)||null;
 const gerberBoard=useMemo(()=>!bomBoardRaw||s.pcb.gerberOff===bomBoardRaw.id||!(bomBoardRaw.width>0&&bomBoardRaw.height>0)?null:
  bomBoardRaw.id===activeBoardId?{...bomBoardRaw,parts:boardModel.filter(p=>!p.suggested)}:bomBoardRaw,[bomBoardRaw?.id,s.pcb.gerberOff,activeBoardId]);// eslint-disable-line react-hooks/exhaustive-deps
 const setSpec=(id,v)=>set(x=>({pcb:{...x.pcb,spec:{...x.pcb.spec,[id]:v},unit:null}}));
 // A Gerber set fills the board size and copper layers (FR-4 when no material is chosen yet) and the
 // via option its smallest plated hole needs; the remaining options stay as chosen.
 const readGerber=g=>{const via=viaOptionFor(g.minHoleMm);set(x=>{const id=x.pcb.material||'fr4',m=PCB_MATERIALS.find(y=>y.id===id)||PCB_MATERIALS[0];
  return {pcb:{...x.pcb,material:id,choice:'',widthMm:g.widthMm,heightMm:g.heightMm,layers:m.layers.find(l=>l>=g.layers)||m.layers[m.layers.length-1],gerber:g,spec:{...x.pcb.spec,...(via?{minVia:via}:{})},unit:null}}});
  notify(g.board?`Bare PCB set from ${g.boardName}${g.drawn?'':"'s Gerber files"}: ${g.widthMm} × ${g.heightMm} mm, ${g.layers} copper layer${g.layers===1?'':'s'}.`:`Board from ${g.name}: ${g.widthMm} × ${g.heightMm} mm, ${g.layers} copper layer${g.layers===1?'':'s'}.`)};
 // The bare PCB counts once a price is entered (or the estimate is taken on purpose).
 const pcbUnit=usdOf(s.pcb.unit);
 // A custom enclosure is priced from the mould step (the maker's tooling and moulded unit price).
 const customBox=!!s.box.material&&s.box.kind==='custom';
 const rulesUsd=Object.fromEntries(Object.entries(s.supplierRules||{}).map(([k,r])=>[k,{flat:usdOf(r?.flat),freeAbove:usdOf(r?.freeAbove)}]));
 const inbound=supplierShipping(calcs,rulesUsd);
 const totals=quoteTotals(calcs,{boards:s.boards,pcb:{on:pcbOn,unit:pcbUnit,margin:s.pcb.margin},enclosure:{on:!!s.box.material,unit:usdOf(customBox?s.mould.unit:s.box.unit),tooling:usdOf(customBox?s.mould.tooling:s.box.tooling),margin:s.margin},method:s.method,inbound:inbound.total,deliveryCost:usdOf(s.shipping.deliveryCost)||0,freeShipping:s.shipping.free,charge:usdOf(s.shipping.charge)});
 const outlooks=useMemo(()=>calcs.map((c,i)=>partOutlook(c,s.history[partKey(rows[i].mpn)],s.hikes)),[calcs,rows,s.history,s.hikes]);
 const ranges=outlooks.some(o=>o.three)?quotationOutlook(calcs,outlooks,totals.customerTotal,s.method):[];
 const boxBoard=!pcbOn&&active?{widthMm:active.width||s.pcb.widthMm,heightMm:active.height||s.pcb.heightMm}:s.pcb;
 const boxDims=enclosureSize(s.box,boxBoard);
 const recordPurchase=(mpn,purchase)=>set(x=>{
  const key=partKey(mpn);
  return {purchases:{...x.purchases,[key]:[purchase,...(x.purchases[key]||[])]}};
 });
 // Shipping on the quote is "to be confirmed" when nothing about it is known yet.
 const shippingTbc=!s.shipping.free&&usdOf(s.shipping.charge)==null&&totals.actualShipping===0&&(inbound.unquoted.length>0||!usdOf(s.shipping.deliveryCost));
 const plan=purchasePlan(rows,calcs);
 // null while the supplier status is unknown (still loading, or the API server is not answering).
 const ready=api?!!(api.digikey||api.mouser||api.nexar||api.tme||api.master):null;
 const marketReady=!!api?.serpapi,autoMarket=useRef(null);
 const method=PRICING.find(p=>p[0]===s.method)||PRICING[0];

 // --- BOM sources
 const loadBoard=b=>{const list=b.id===activeBoardId?boardModel.filter(p=>!p.suggested):(b.parts||[]).map(p=>({...p,inv:inv.get(String(p.mpn||'').toUpperCase())||null}));
  const rows=rowsFromParts(list).map(r=>({...r,manufacturer:real(r.manufacturer),description:real(r.description),package:real(r.package),lifecycle:real(r.lifecycle)||null}));set(x=>({rows,from:b.name,fromBoard:b.id,project:x.project||b.name,pricedAt:null,pcb:{...x.pcb,gerberOff:null}}));setDetail(null);notify(`${rows.length} lines from ${b.name}.`);
  // The board brings its bare board along: from its Gerber files when it keeps them, else from the board
  // model. No upload in the Bare PCB step.
  if(b.gerberSource)import('./gerberQuote.js').then(m=>m.gerberFromBoard(b)).then(({facts})=>readGerber(facts)).catch(()=>{});
  else if(b.width>0&&b.height>0)import('./bareBoard.js').then(m=>readGerber(m.boardFacts(b,list))).catch(()=>{})};
 const loadInventory=()=>{const rows=parts.map((p,i)=>({id:'i'+i+'-'+p.id,mpn:p.mpn,manufacturer:real(p.manufacturer),description:real(p.description),package:real(p.package),type:'',refs:[],qty:1,margin:null,source:'auto',offers:[],fetchedAt:null,lifecycle:real(p.lifecycle)||null}));set({rows,from:'Inventory',pricedAt:null});setDetail(null);notify(`${rows.length} lines from inventory.`)};
 async function importFile(file){if(!file)return;try{if(file.size>5e6)throw Error('Choose a file smaller than 5 MB.');let table;
  if(/\.xlsx$/i.test(file.name)){const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());const ws=wb.worksheets[0];table=[];ws.eachRow({includeEmpty:false},row=>{const vals=[];row.eachCell({includeEmpty:true},(c,i)=>{const v=c.value;vals[i-1]=v&&typeof v==='object'?(v.text??v.result??v.richText?.map(t=>t.text).join('')??''):v});table.push(vals)})}
  else table=parseCsv(await file.text());
  const rows=rowsFromTable(table);if(!rows.length)throw Error('No part number column found. Name a column "MPN" or "Part number".');set({rows,from:file.name,project:s.project||file.name.replace(/\.[^.]+$/,''),pricedAt:null});setDetail(null);notify(`${rows.length} lines imported from ${file.name}.`)}
  catch(e){notify(e.message)}finally{if(fileRef.current)fileRef.current.value=''}}
 const addRow=e=>{e.preventDefault();const mpn=addMpn.trim();if(!mpn)return;const p=inv.get(mpn.toUpperCase());const k0=knowledge?lookupPart(knowledge,{mpn}):null,k=k0?.match==='exact'?k0:null;
  set(x=>({rows:[...x.rows,{id:'m'+Date.now().toString(36),mpn:p?.mpn||mpn,manufacturer:real(p?.manufacturer)||k?.entry?.manufacturer||'',description:real(p?.description)||k?.entry?.description||'',package:real(p?.package)||k?.entry?.package||'',type:'',refs:[],qty:Math.max(1,n0(addQty)),margin:null,source:'auto',offers:[],fetchedAt:null,lifecycle:p?.lifecycle||null}]}));setAddMpn('');setAddQty('1')};

 // --- Prices: three lookups at a time; Google Shopping only when asked (it spends SerpApi searches).
 // all: every market, Google Shopping listings included (one SerpApi search, cached on the server for six hours).
 async function fetchOffers(mpn,all=false){const r=await fetch('/api/compare?mpn='+encodeURIComponent(mpn)+(all||s.shopping?'':'&sources=distributors'));let d;try{d=await r.json()}catch{throw Error('The server did not answer. Start it with npm run server.')}if(!r.ok)throw Error(d.error||'Price lookup failed.');return d}
 async function priceRows(ids,{market=false}={}){
  const todo=rows.flatMap((r,i)=>!ids||ids.includes(r.id)?[{r,quantity:calcs[i].buy||calcs[i].need}]:[]);if(!todo.length)return;let done=0,errors=0,ok=0;setBusy(`Pricing 0 of ${todo.length}…`);
  // Up to eight offers per source (cheapest first), so a long list from one source cannot hide the others.
  const keep=list=>{const by=new Map();for(const o of list){const k=o.source||'';if(!by.has(k))by.set(k,[]);by.get(k).push(o)}return [...by.values()].flatMap(g=>g.sort((a,b)=>(a.priceUsd??Infinity)-(b.priceUsd??Infinity)).slice(0,8)).slice(0,40)};
  const one=async ({r,quantity})=>{try{const d=await fetchOffers(r.mpn,market);if(!d.providers.some(p=>p.status==='ok'))throw Error(d.providers.find(p=>p.error)?.error||'No supplier returned prices.');const offers=keep(d.offers.filter(o=>o.priceUsd!=null||Number.isFinite(o.stock))).map(slim);const first=offers.find(o=>o.description)||{};ok++;
    set(x=>({history:observeOffers(x.history,{mpn:r.mpn,offers,quantity,at:d.fetchedAt})}));
    setRow(r.id,x=>x.mpn!==r.mpn?{}:({offers,fetchedAt:d.fetchedAt,image:offers.find(o=>o.image)?.image||x.image||null,manufacturer:x.manufacturer||first.manufacturer||'',description:x.description||first.description||'',lifecycle:offers.find(o=>o.lifecycle)?.lifecycle||x.lifecycle||null,providers:d.providers.filter(p=>p.status==='ok').map(p=>p.name),...(market||s.shopping?{marketAt:d.fetchedAt,marketStatus:d.providers.find(p=>p.id==='serpapi')?.status||null,marketHidden:d.providers.find(p=>p.id==='serpapi')?.hidden||null}:{}),
     source:x.source&&x.source!=='auto'&&x.source!=='own'&&!allOffers({offers,manualOffers:x.manualOffers}).some(o=>offerKey(o)===x.source&&(o.priceUsd!=null||o.priceOriginal!=null))?'auto':x.source}))}
   catch(e){errors++;if(errors===1)notify(e.message)}finally{done++;setBusy(`Pricing ${done} of ${todo.length}…`)}};
  const queue=[...todo];await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(queue.length)await one(queue.shift())}));
  // "Prices updated" means the whole BOM was priced at that time.
  if(!ids&&ok)set({pricedAt:new Date().toISOString()});setBusy('');
  if(!errors)notify(`Prices and stock updated for ${todo.length} line${todo.length===1?'':'s'}.`);else if(ok)notify(`${ok} of ${todo.length} lines priced; ${errors} lookup${errors===1?'':'s'} failed.`);
 }
 const alternates=r=>{const out=[],seen=new Set([String(r.mpn).toUpperCase()]);const push=(mpn,from)=>{const k=String(mpn||'').toUpperCase();if(!k||seen.has(k))return;seen.add(k);out.push({mpn,from,inv:inv.get(k)||null})};
  allOffers(r).forEach(o=>o.suggestedReplacement&&push(o.suggestedReplacement,`${o.seller} suggested replacement`));
  const p=invOf(r);if(p?.alt)push(p.alt,'Inventory record');parts.filter(x=>String(x.alt||'').toUpperCase()===String(r.mpn).toUpperCase()).forEach(x=>push(x.mpn,'Inventory record'));
  const k=knowledge?lookupPart(knowledge,{mpn:r.mpn,value:r.description,package:r.package}):null;if(k?.match==='exact'||k?.match==='variant')alternatesOf(k.entry).forEach(a=>a.mpn&&push(a.mpn,'Part master cross-reference'));
  return out};
 const useAlternate=(r,mpn)=>{const p=inv.get(mpn.toUpperCase());setRow(r.id,{mpn,manufacturer:p?.manufacturer||'',description:p?.description||'',lifecycle:p?.lifecycle||null,offers:[],manualOffers:[],fetchedAt:null,image:null,source:'auto',replaced:r.mpn});setAlt(null);notify(`${r.mpn} replaced by ${mpn}. Get prices to price it.`)};

 // --- Purchase list and bids (stored as `cart`; nothing is ordered from here)
 const cartItem=(r,o,qty)=>{const q=orderQty(o,qty);return {mpn:r.mpn,seller:o.seller,qty:q,unit:unitAt(o,q)?.unit??o.priceUsd??0,breaksUsd:(o.breaksUsd||[]).slice(0,10),url:o.url||null,ref:(r.refs||[]).join(' ').slice(0,60),marketType:o.marketType||null}};
 const addToCart=(r,c,o)=>{if(!o)return;set(x=>({cart:cartAdd(x.cart,cartItem(r,o,Math.max(1,c.buy||c.need)))}));notify(`${r.mpn} from ${o.seller} added to the purchase list.`)};
 const addAll=()=>{let n=0,own=0,none=0;const batch=new Map();rows.forEach((r,i)=>{const c=calcs[i];
   if(c.buy>0&&c.offer&&c.unit!=null){const it=cartItem(r,c.offer,c.buy),k=it.mpn.toUpperCase()+'|'+it.seller,prev=batch.get(k);batch.set(k,prev?{...it,qty:prev.qty+it.qty,ref:[prev.ref,it.ref].filter(Boolean).join(' ').slice(0,60)}:it);n++}
   else if(c.source==='own')own++;else if(c.need)none++});
  let cart=s.cart;for(const it of batch.values())cart=cartAdd(cart,{...it,unit:cartUnit(it,it.qty)});set({cart});notify(`${n} line${n===1?'':'s'} added to the purchase list${own?`, ${own} covered by own stock`:''}${none?`, ${none} without a price`:''}.`)};
 const cartProps={cart:s.cart,bids:s.bids,money,shipping:inbound,onClose:()=>setCartOpen(null),onQty:(id,qty)=>set(x=>({cart:x.cart.map(i=>i.id===id?{...i,qty,unit:cartUnit(i,qty)}:i)})),onRemove:id=>set(x=>({cart:x.cart.filter(i=>i.id!==id)})),onClear:()=>set({cart:[]}),
  onBidStatus:(id,status)=>set(x=>({bids:x.bids.map(b=>b.id===id?{...b,status}:b)})),onBidRemove:id=>set(x=>({bids:x.bids.filter(b=>b.id!==id)}))};
 const saveBid=b=>{set(x=>({bids:[b,...x.bids]}));setBid(null);notify(`Bid for ${b.mpn} saved.`)};

 // --- Table: search, sort, optional columns
 const shown=COLS.filter(c=>!c.optional||s.cols[c.key]);
 const colLabel=(c,long=false)=>c.key==='margin'?(s.method==='margin'?'Margin %':'Markup %'):long?c.long||c.label:c.label;
 const pctMax=s.method==='margin'?MAX_MARGIN:1000,pct=v=>v===''?null:Math.min(pctMax,Math.max(0,n0(v)));
 const val=(i,k)=>{const r=rows[i],c=calcs[i];switch(k){case 'mpn':return r.mpn;case 'description':return r.description||'';case 'brand':return r.manufacturer||'';case 'supplier':return c.source==='own'?'Own stock':c.offer?.seller||'';
  case 'qtyPerBoard':return n0(r.qty);case 'need':return c.need;case 'own':return c.own;case 'stock':return availability(r,c).total??(c.own||-1);case 'lead':return c.offer?offerLeadDays(c.offer,c.buy)??1e9:c.source==='own'?0:1e9;
  case 'package':return r.package||'';case 'margin':return c.margin;case 'unit':return c.missing?-1:c.unitCost;case 'total':return c.lineSell;default:return scores[i][k]?.score??-1}};
 const q=query.trim().toLowerCase();
 const order=useMemo(()=>{let idx=rows.map((_,i)=>i);if(q)idx=idx.filter(i=>[rows[i].mpn,rows[i].description,rows[i].manufacturer,calcs[i].offer?.seller,(rows[i].refs||[]).join(' ')].join(' ').toLowerCase().includes(q));
  if(s.sort.key)idx.sort((a,b)=>{const x=val(a,s.sort.key),y=val(b,s.sort.key);return (typeof x==='string'?x.localeCompare(y,'en',{numeric:true}):x-y)*s.sort.dir});return idx},[rows,calcs,scores,q,s.sort]);// eslint-disable-line react-hooks/exhaustive-deps
 const sortBy=k=>set(x=>({sort:x.sort.key===k?{key:k,dir:-x.sort.dir}:{key:k,dir:1}}));
 const toggle=id=>setOpen(o=>{const n=new Set(o);n.has(id)?n.delete(id):n.add(id);return n});
 const lastRow=useRef(null);
 const openDetail=(id,offers=false)=>{lastRow.current=id;setDetail({id,offers});if(!offers)window.scrollTo?.({top:0})};
 useEffect(()=>{if(!detail&&lastRow.current){const el=document.querySelector(`tr[data-row="${CSS.escape(lastRow.current)}"] .link-button`);el?.focus()}},[detail]);
 // Columns menu: Escape or a click elsewhere closes it.
 const colsRef=useRef(null);
 useEffect(()=>{if(!colsOpen)return;const away=e=>{if(!colsRef.current?.contains(e.target))setColsOpen(false)},esc=e=>{if(e.key==='Escape')setColsOpen(false)};document.addEventListener('mousedown',away);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',esc)}},[colsOpen]);

 const empty=!rows.length;
 // Opening a component searches its whole market once (Google Shopping included) when SerpApi is set up.
 useEffect(()=>{if(!detail)return;const r=rows.find(x=>x.id===detail.id);if(r&&marketReady&&!r.marketAt&&autoMarket.current!==r.id){autoMarket.current=r.id;priceRows([r.id],{market:true})}},[detail?.id,marketReady]);// eslint-disable-line react-hooks/exhaustive-deps
 const detailIndex=detail?rows.findIndex(r=>r.id===detail.id):-1;
 const providers=[...new Set(rows.flatMap(r=>r.providers||[]))];
 // The rate behind INR amounts: its source and time (the provider's update time, else when it was fetched).
 const rateTime=money.updated?'rate of '+when(money.updated):money.fetchedAt?'fetched '+when(money.fetchedAt):'';
 const rateLine=money.currency==='INR'?(money.live===false||/default/.test(money.source||'')?`1 USD = ₹${money.inrPerUsd.toFixed(2)} · approximate rate, the live rate is unavailable${rateTime?' · '+rateTime:''}`:`1 USD = ₹${money.inrPerUsd.toFixed(2)} · ${money.source||'rate'}${rateTime?' · '+rateTime:''}`):'no conversion';
 const sourceSelect=(r,c)=><select className="bom-source" aria-label={`${r.mpn} source`} value={r.source||'auto'} onChange={e=>setRow(r.id,{source:e.target.value})}>
  <option value="auto">{(r.source||'auto')!=='auto'?'Best price and stock':c.useOwn>=c.need&&c.need>0?'Best: own stock':c.offer?`Best: ${c.offer.seller}`:'Best available'}</option>{invOf(r)&&<option value="own">Own stock ({fmtInt(c.own)})</option>}
  {allOffers(r).filter(o=>o.priceUsd!=null).map(o=>{const u=unitAt(o,Math.max(1,c.need));return <option key={offerKey(o)} value={offerKey(o)}>{o.seller} · {u?money.fmt(u.unit,{unit:true}):'—'} · {Number.isFinite(o.stock)?fmtInt(o.stock)+' in stock':'stock not reported'}</option>})}</select>;

 const count=v=>v==null?null:v>=1e6?(v/1e6).toFixed(v>=1e7?0:1).replace(/\.0$/,'')+'M':Math.round(v).toLocaleString('en-US');
 const marketShort=t=>({'ems-excess':'EMS excess','oem-excess':'OEM/ODM excess',broker:'broker'})[t]||'excess';
 // Action for a line, by offer: buy from a distributor, bid on excess stock, or get a price first.
 const action=(r,c)=>{const o=c.offer;
  if(!c.need)return <span className="act-muted">—</span>;
  if(c.source==='own')return <span className="act-muted">Own stock</span>;
  if(o&&o.marketType&&!['authorized','marketplace'].includes(o.marketType))return <button className="act-link bid" onClick={()=>setBid({offer:{...o,mpn:o.mpn||r.mpn},need:c.buy||c.need})}>Bid ({marketShort(o.marketType)})</button>;
  if(o&&c.unit!=null&&c.buy>0)return <button className="act-link" onClick={()=>addToCart(r,c,o)} aria-label={`Add ${r.mpn} to the purchase list`}>Add to list</button>;
  if(o)return <button className="act-link bid" onClick={()=>setBid({offer:{...o,mpn:o.mpn||r.mpn},need:c.buy||c.need})}>Bid</button>;
  if(!r.fetchedAt)return <button className="act-link" onClick={()=>priceRows([r.id])} disabled={!!busy||ready===false}>Get price</button>;
  return <button className="act-link" onClick={()=>openDetail(r.id,true)}>Find offers</button>};
 const riskTip=risk=>risk.reasons.join(', ');

 const factsLine=<p className="bom-sum">
  <span>{fmtInt(summary.lines)} line{summary.lines===1?'':'s'}</span>
  <span tabIndex={0} data-tip={`${summary.matched} of ${summary.lines} part numbers found exactly at a connected distributor or in the inventory. Marketplace listings and offers you entered do not count.`}>{summary.lines?summary.matchedPct:0}% MPN matched</span>
  <span className="units"><input aria-label="Production quantity" type="number" min="1" step="1" inputMode="numeric" value={s.boards} onChange={e=>set({boards:Math.max(1,Math.round(n0(e.target.value))||1)})}/> units</span>
  <span tabIndex={0} data-tip="Component cost plus the selected bare PCB for the production quantity, before markup or margin and shipping.">BoM cost {money.fmt(totals.componentCost+totals.pcbCost)}</span>
  <span tabIndex={0} className={summary.atRisk?'risk':''} data-tip="A part is at risk when it is end of life, has limited stock coverage, has no price, or scores under 40 for resilience.">{summary.atRisk} part{summary.atRisk===1?'':'s'} at risk</span></p>;
 const header=<div className="bom-sheet-head" role="group" aria-label="BOM analysis" data-tour="bom-summary">
  <div className="bom-name"><input className="bom-project" aria-label="Project name" value={s.project} placeholder="Name this BoM" onChange={e=>set({project:e.target.value.slice(0,80)})}/>{factsLine}</div>
  <div className="bom-cta" data-tour="bom-cta"><button className="button soft" onClick={()=>fileRef.current?.click()}>Upload BoM</button><button className="button primary" onClick={addAll} disabled={empty}>Add all to list</button></div>
  <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt,.tsv" hidden aria-label="BOM file" onChange={e=>importFile(e.target.files[0])}/>
 </div>;
 const tools=<div className="bom-tools">
  <div className="search-box"><Search size={15}/><input aria-label="Search the BOM" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search part, brand, supplier"/></div>
  <select aria-label="Load BOM from" value="" onChange={e=>{const v=e.target.value;if(v==='inventory')loadInventory();else{const b=boards.find(x=>x.id===v);if(b)loadBoard(b)}}}>
   <option value="">{s.from?`Loaded: ${s.from}`:'Load from…'}</option>{boards.map(b=><option key={b.id} value={b.id}>Board · {b.name}{b.id===activeBoardId?' (open)':''}</option>)}<option value="inventory">All inventory parts</option></select>
  <div className="cols-menu" ref={colsRef}><button className="button small" aria-expanded={colsOpen} onClick={()=>setColsOpen(v=>!v)}><Columns3 size={14}/>Columns</button>
   {colsOpen&&<div className="cols-pop" role="group" aria-label="Optional columns">{COLS.filter(c=>c.optional).map(c=><label key={c.key} className="check-inline"><input type="checkbox" checked={!!s.cols[c.key]} onChange={e=>set(x=>({cols:{...x.cols,[c.key]:e.target.checked}}))}/>{colLabel(c,true)}</label>)}</div>}</div>
  <span className="bar-gap"/>
  <label className="check-inline"><input type="checkbox" checked={s.shopping} onChange={e=>set({shopping:e.target.checked})}/>Marketplaces</label><Tip label="About Marketplaces" text="Get prices also searches Google Shopping listings for every line. Each line uses one SerpApi search (cached for six hours). A component's overview always searches every market."/>
  <button className="button small" onClick={()=>priceRows()} disabled={!!busy||empty||ready===false}><RefreshCw size={14} className={busy?'spin':''}/>{busy||'Get prices'}</button>
  <button className="button small" data-tour="bom-list" onClick={()=>setCartOpen('cart')} aria-label={`Purchase list, ${s.cart.length} line${s.cart.length===1?'':'s'}`}><ClipboardList size={14}/>Purchase list <b className="count-bubble">{s.cart.length}</b></button>
  {s.bids.length>0&&<button className="button small" onClick={()=>setCartOpen('bids')} aria-label={`Bids, ${s.bids.length}`}><Gavel size={14}/>Bids <b className="count-bubble">{s.bids.length}</b></button>}
  <button className="button small" onClick={()=>setQuote(true)} disabled={empty}><FileDown size={14}/>Quotation PDF</button>
  {!empty&&<button className="icon-button" aria-label="Clear the BOM" title="Clear the BOM" onClick={()=>{set({rows:[],from:'',pricedAt:null});notify('BOM cleared.')}}><Trash2 size={15}/></button>}
 </div>;
 const foot=<p className="bom-note">Scores 0–100; click any column to sort, any row to open part detail.{s.pricedAt?` Prices updated ${when(s.pricedAt)}${providers.length?' from '+providers.join(', '):''}.`:''} <span className="cur-chip">{money.currency==='INR'?'₹ INR':'$ USD'}</span> {money.currency==='INR'?rateLine:'Amounts in US dollars.'}</p>;

 // --- Demo tour: a priced demo BOM replaces the user's for the length of the tour, then theirs comes back.
 const [demo,setDemo]=useState(false);
 const startDemo=()=>{try{if(!s.demo)localStorage.setItem(BACKUP,JSON.stringify(s))}catch{}setDetail(null);setCartOpen(null);setQuote(false);setS({...DEFAULT,...demoBomState()});setStep(1);setDemo(true)};
 const endDemo=()=>{setDemo(false);setDetail(null);setCartOpen(null);let own=null;try{own=localStorage.getItem(BACKUP);localStorage.removeItem(BACKUP);if(own)localStorage.setItem(STORE,own);else localStorage.removeItem(STORE)}catch{}
  setS(own?load():DEFAULT);setStep(0);notify('Demo finished. Your own BOM is back.')};
 useEffect(()=>{const ask=()=>{try{if(sessionStorage.getItem(BOM_DEMO)!=='1')return;sessionStorage.removeItem(BOM_DEMO)}catch{return}startDemo()};ask();addEventListener(BOM_DEMO,ask);return()=>removeEventListener(BOM_DEMO,ask)},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const tourActions={step:n=>{setDetail(null);goTo(n)},openRow:id=>openDetail(id),closeRow:()=>setDetail(null),addAll};
 const withTour=view=><>{demo&&<BomTour actions={tourActions} onEnd={endDemo}/>}{view}</>;
 if(detail&&detailIndex>=0){const r=rows[detailIndex],c=calcs[detailIndex];
  return withTour(<div className="bom-tool"><div className="sr-only" role="status" aria-live="polite">{busy}</div><TipLayer/><section className="panel bom-sheet compact" aria-label="BOM summary">{header}</section>
   <BomOverview row={r} calc={c} scores={scores[detailIndex]} money={money} alternates={alternates(r)} busy={!!busy} ready={ready!==false} shippingRules={rulesUsd} focusOffers={detail.offers}
    marketReady={marketReady} onBack={()=>setDetail(null)} onRefresh={()=>priceRows([r.id],{market:marketReady})} onSelectOffer={k=>{setRow(r.id,{source:k});notify(`${r.mpn}: supplier changed.`)}}
    onAddToCart={o=>addToCart(r,c,o)} onBid={o=>setBid({offer:{...o,mpn:o.mpn||r.mpn},need:c.buy||c.need})} onAddOffer={o=>{setRow(r.id,x=>({manualOffers:[...(x.manualOffers||[]),o]}));notify(`Offer from ${o.seller} added.`)}}
    onRemoveOffer={id=>setRow(r.id,x=>({manualOffers:(x.manualOffers||[]).filter(o=>o.id!==id),source:x.source==='manual|'+id?'auto':x.source}))} onUseAlternate={m=>{useAlternate(r,m);setDetail(null)}}/>
   {bid&&<BidDialog offer={bid.offer} need={bid.need} money={money} onClose={()=>setBid(null)} onSave={saveBid}/>}
   {cartOpen&&<BomCart {...cartProps} startTab={cartOpen}/>}
  </div>)}

 // A Gerber set uploaded in the Bare PCB step goes on by itself: the board is imported into Board studio
 // (drawn from the files, components from X2 attributes, a placement file or inferred from the pads),
 // and when the BOM is still empty its components become the BOM lines.
 const sendGerber=async files=>{if(!onGerberFiles)return;try{const b=await onGerberFiles(files);if(!b)return;
  if(!s.rows.length&&b.parts?.length){loadBoard({...b,parts:b.parts});notify(`${b.name}: board added to Board studio and ${b.parts.length} components sent to the Components step.`)}
  else notify(b.parts?.length?`${b.name} added to Board studio. Your BOM lines are kept; use Load from… in Components to replace them with the board's ${b.parts.length} components.`:`${b.name} added to Board studio. No components were found in the files, so upload the BOM in Components.`)}
  catch(e){notify(e.message||'The board could not be added to Board studio.')}};
 // --- Quotation outcome: save the list to come back to, or continue to production.
 const checks=[['Bare PCB',!pcbOn?'not needed':pcbUnit==null?'price not entered':'priced',pcbOn&&pcbUnit==null],
  ['Components',empty?'no lines':totals.missing?`${totals.missing} line${totals.missing===1?'':'s'} without a price`:'priced',empty||totals.missing>0],
  ['Enclosure',!s.box.material?'not needed':customBox?'custom moulded':totals.enclosureUnpriced?'price not entered':'priced',!!s.box.material&&!customBox&&totals.enclosureUnpriced],
  ['Mould',!customBox?'not needed':totals.enclosureUnpriced?'tooling or unit price not entered':`${s.mould.maker||'maker not chosen'}`,customBox&&totals.enclosureUnpriced]];
 const doSave=(status='quoted',jobId=null)=>{const r=saveList(s,totals,{status,jobId});if(!r){notify('Storage full: the list was not saved.');return null}set({listId:r.entry.id});setSavedCount(r.lists.length);return r.entry};
 const continueOrder=()=>{if(!onContinue)return;const entry=doSave('ordered');if(!entry)return;
  const kit={own:calcs.filter(c=>c.need&&c.useOwn>=c.need).length,mixed:calcs.filter(c=>c.need&&c.useOwn>0&&c.useOwn<c.need).length,buy:calcs.filter(c=>c.need&&c.buy>0).length,lines:calcs.filter(c=>c.need).length};
  const job=onContinue({kit,customer:s.customer,board:s.project||s.from||'New board',qty:s.boards,components:Math.max(1,rows.reduce((a,r)=>a+n0(r.qty),0)),due:s.due||null,listId:entry.id,quote:quoteNumber()});
  if(job){saveList({...s,listId:entry.id},totals,{status:'ordered',jobId:job.id});notify(`${job.board} for ${job.customer} is in production: ${job.notes}.`)}};
 const outcome=<section className="panel quote-outcome-panel" aria-label="Save or continue">
  <div className="panel-heading"><div className="title-row"><CheckCircle2 size={17}/><h2>Save the list or continue to production</h2></div>{s.listId&&<small className="muted">Saved list · {s.project||'Untitled BOM'}</small>}</div>
  <div className="quote-outcome">
   <ul className="outcome-checks">{checks.map(([k,v,warn])=><li key={k} className={warn?'warn-text':''}><strong>{k}</strong> {v}</li>)}</ul>
   <div className="form-grid"><label>Customer<input value={s.customer} maxLength="80" placeholder="Company" onChange={e=>set({customer:e.target.value.slice(0,80)})}/></label>
    <label>Requested delivery<input type="date" value={s.due} onChange={e=>set({due:e.target.value})}/></label>
    <label>Boards<input type="number" min="1" step="1" value={s.boards} onChange={e=>set({boards:Math.max(1,Math.round(n0(e.target.value))||1)})}/></label></div>
   <div className="quote-outcome-actions">
    <button className="button" type="button" disabled={empty&&!pcbOn&&!s.box.material} onClick={()=>{const e=doSave('quoted');if(e)notify(`${e.name} saved (revision ${e.revision}). Open it again from Saved lists.`)}}><Bookmark size={15}/>{s.listId?'Save changes':'Save list'}</button>
    <button className="button primary" type="button" disabled={empty||!s.customer.trim()||!onContinue} onClick={continueOrder}><Factory size={15}/>Continue to production <ArrowRight size={15}/></button></div>
   <small>Continue saves the list as ordered and books a production job: incoming check, QA, kitting, storing, SMT, PCBA, THT, wave soldering, QA, assembly, testing and final product. {!s.customer.trim()&&'Enter the customer to continue.'}</small>
  </div></section>;

 const liveRegion=<div className="sr-only" role="status" aria-live="polite">{busy}</div>;
 return withTour(<div className="bom-tool">{liveRegion}<TipLayer/>
  <nav className="panel bom-workflow" aria-label="BOM workflow" ref={workflow} tabIndex={-1} data-tour="bom-steps">
   {STEPS.map((name,i)=><button className="button" type="button" key={name} aria-current={step===i?'step':undefined} onClick={()=>goTo(i)}><span>{i+1}</span>{name}{OPTIONAL.has(name)&&<small className="opt-tag">optional</small>}</button>)}
   <button className="button small soft bom-demo-start" type="button" onClick={startDemo} disabled={demo}><PlayCircle size={15}/>Watch the demo</button>
   <button className="button small" type="button" onClick={onOpenSavedLists}><Bookmark size={14}/>Saved lists <b className="count-bubble">{savedCount}</b></button>
  </nav>
  <p className="step-guide" role="note"><strong>Step {step+1} of {STEPS.length} · {STEPS[step]}.</strong> {GUIDE[step]}</p>
  {s.demo&&<div className="studio-note bom-demo-note" role="note"><PlayCircle size={15}/> Demo data: an illustrative BOM with demo prices. Your own BOM comes back when the demo ends.</div>}
  {step===1&&<><section className="panel bom-sheet" aria-label="Components">
   {header}{tools}
   {ready===false&&<div className="studio-note"><TriangleAlert size={15}/> No distributor is connected, so prices cannot be fetched. Add DigiKey or Mouser keys as server secrets (Integrations).</div>}
   {busy&&<div className="bom-loading" aria-hidden="true">{busy}</div>}
   {empty?<div className="empty bom-empty"><Calculator/><h3>Start a BoM</h3><p>Upload a BoM file, load a board, or add parts one by one.</p>
     <div className="bom-empty-actions"><button className="button primary" onClick={()=>fileRef.current?.click()}><Upload size={15}/>Upload BoM</button>{active&&<button className="button" onClick={()=>loadBoard(active)}><CircuitBoard size={15}/>Use {active.name}</button>}</div>
     <form className="bom-add-row" onSubmit={addRow}><input aria-label="Part number to add" value={addMpn} onChange={e=>setAddMpn(e.target.value)} placeholder="Add a part number"/><input aria-label="Quantity per board" type="number" min="1" value={addQty} onChange={e=>setAddQty(e.target.value)}/><button className="button small" type="submit" disabled={!addMpn.trim()}><Plus size={14}/>Add line</button></form></div>
   :<div className="table-scroll bom-grid-wrap" data-tour="bom-grid"><table className="bom-grid">
    <thead><tr>{shown.map(c=>{const sorted=s.sort.key===c.key;return <th key={c.key} className={c.numeric?'numeric':''} aria-sort={sorted?(s.sort.dir>0?'ascending':'descending'):'none'}>
      <button className="th-sort" onClick={()=>sortBy(c.key)} aria-label={`Sort by ${colLabel(c,true)}`}>{colLabel(c)}{sorted&&(s.sort.dir>0?<ArrowUp size={11}/>:<ArrowDown size={11}/>)}</button>{c.tip&&<Tip label={`About ${c.long}`} text={`${c.long}, 0–100: ${c.tip} Shows "Not available" when too little is reported.`}/>}{c.key==='unit'&&<Tip label="About unit price" text="Purchase price per part for this build (own stock at its inventory price, the rest at the selected offer's price break). Selling prices are in the expanded line and the totals."/>}</th>})}<th>Action</th></tr></thead>
    <tbody>{order.map(i=>{const r=rows[i],c=calcs[i],sc=scores[i],risk=risks[i],p=invOf(r),isOpen=open.has(r.id),alts=risk.atRisk?alternates(r):[],av=availability(r,c);
     const cell=k=>{switch(k){
      case 'mpn':return <td key={k} className="g-mpn"><span className="g-mpn-in"><PartImage part={{...r,category:p?.category,value:r.description}} src={r.image} size={28}/><button className="g-expand" aria-label={`${isOpen?'Collapse':'Expand'} ${r.mpn}`} aria-expanded={isOpen} onClick={()=>toggle(r.id)}>{isOpen?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button><button className="link-button" onClick={()=>openDetail(r.id)} aria-label={`Open ${r.mpn} overview`}>{r.mpn}</button>{r.replaced&&<small className="muted"> replaces {r.replaced}</small>}</span></td>;
      case 'brand':return <td key={k}>{r.manufacturer||<em className="na">{NA}</em>}</td>;
      case 'stock':return <td key={k} className="numeric" data-tip={av.total!=null?`${av.total.toLocaleString('en-US')} across ${av.sources} offer${av.sources===1?'':'s'}${c.own?`; ${c.own.toLocaleString('en-US')} in own stock`:''}`:p?'Own stock only: suppliers not checked yet':undefined}>{av.total!=null?count(av.total):p&&!r.fetchedAt?count(c.own):<em className="na">{r.fetchedAt?'Not reported':'Not checked yet'}</em>}</td>;
      case 'description':return <td key={k} className="g-descr">{r.description||<em className="na">{NA}</em>}</td>;
      case 'supplier':return <td key={k}>{c.source==='own'?'Own stock':c.offer?c.offer.seller+(c.useOwn>0?' + own stock':''):<em className="na">{r.fetchedAt?'No offer':'Not priced yet'}</em>}</td>;
      case 'qtyPerBoard':return <td key={k} className="numeric"><input className="bom-num" aria-label={`${r.mpn} quantity per board`} type="number" min="0" step="1" value={r.qty} onChange={e=>setRow(r.id,{qty:Math.max(0,n0(e.target.value))})}/></td>;
      case 'need':return <td key={k} className="numeric">{fmtInt(c.need)}</td>;
      case 'own':return <td key={k} className="numeric">{p?fmtInt(c.own):<em className="na">—</em>}</td>;
      case 'lead':{const d=c.offer?offerLeadDays(c.offer,c.buy):c.source==='own'?0:null;return <td key={k} className="numeric">{d==null?<em className="na">{NA}</em>:days(d)}</td>}
      case 'package':return <td key={k}>{r.package||<em className="na">—</em>}</td>;
      case 'margin':return <td key={k} className="numeric"><span className="input-suffix small"><input className="bom-num" aria-label={`${r.mpn} ${s.method} percent`} type="number" min="0" max={pctMax} step="0.5" placeholder={String(s.margin)} value={r.margin??''} onChange={e=>setRow(r.id,{margin:pct(e.target.value)})}/><em>%</em></span></td>;
      case 'unit':return <td key={k} className="numeric">{c.need&&!c.missing?money.fmt(c.unitCost,{unit:true}):<em className="na">{!c.need?'Not needed':c.ownCostMissing?'No inventory price':c.ownShort?'Own stock short':r.fetchedAt?'No price':'Not priced yet'}</em>}</td>;
      case 'total':return <td key={k} className="numeric">{c.need&&!c.missing?money.fmt(c.lineCost):<em className="na">{!c.need?'Not needed':c.ownCostMissing?'No inventory price':c.ownShort?'Own stock short':r.fetchedAt?'No price':'Not priced yet'}</em>}</td>;
      case 'resilience':return <td key={k} className={'numeric'+(risk.atRisk?' g-risk':'')}><ScoreBadge k={k} s={sc[k]} plain focusable={false}/>{risk.atRisk&&<span className="g-risk-tag" data-tour={r.id===firstRisk?'bom-risk':undefined} tabIndex={0} role="img" aria-label={`At risk: ${riskTip(risk)}`} data-tip={`At risk: ${riskTip(risk)}`}> · Risk</span>}</td>;
      default:return <td key={k} className="numeric"><ScoreBadge k={k} s={sc[k]} plain focusable={false}/></td>}};
     return <React.Fragment key={r.id}><tr data-row={r.id} className={'g-row'+(isOpen?' open':'')} onClick={e=>{if(e.target.closest('button,a,input,select,label,.tip,.g-risk-tag')||String(window.getSelection?.()||''))return;openDetail(r.id)}}>
      {shown.map(col=>cell(col.key))}<td className="g-action">{action(r,c)}</td></tr>
      {isOpen&&<tr className="g-detail-row"><td colSpan={shown.length+1}><div className="bom-detail">
       <dl className="bom-facts">
        <div><dt>Description</dt><dd>{r.description||NA}</dd></div>
        <div><dt>Selected supplier</dt><dd>{c.source==='own'?'Own stock':c.offer?c.offer.seller:'None yet'}{c.offer?` · ${marketLabel(c.offer.marketType||(c.offer.authorized===false?'marketplace':'authorized')).toLowerCase()}`:''}</dd></div>
        <div><dt>Required quantity</dt><dd>{fmtInt(c.need)} ({r.qty} per board)</dd></div>
        <div><dt>Selling price</dt><dd>{c.missing?<em className="na">{!c.need?'Not needed':c.ownCostMissing?'No inventory price':c.ownShort?'Own stock short':r.fetchedAt?'No price':'Not priced yet'}</em>:<>{money.fmt(c.lineSell)} <small className="muted">{money.fmt(c.unitSell,{unit:true})} each</small></>}</dd></div>
        <div><dt>Cost</dt><dd>{c.missing?<em className="na">{!c.need?'Not needed':c.ownCostMissing?'No inventory price':c.ownShort?'Own stock short':r.fetchedAt?'No price':'Not priced yet'}</em>:<>{money.fmt(c.lineCost)}{c.surplus>0&&<small className="muted"> incl. {fmtInt(c.surplus)} surplus to stock</small>}</>}</dd></div>
        <div><dt>Own stock</dt><dd>{p?`${fmtInt(c.own)} (uses ${fmtInt(c.useOwn)})`:'Not in inventory'}</dd></div>
        <div><dt>To buy</dt><dd>{fmtInt(c.buy)}{c.offer&&c.orderQty>c.buy?` · orders ${fmtInt(c.orderQty)} (MOQ / multiple)`:''}</dd></div>
        <div><dt>Why this source</dt><dd className={c.short||c.missing?'warn-text':''}>{c.missing?(r.fetchedAt?'No price found':'Not priced yet'):c.source==='own'?'Covered by own stock':c.source==='mixed'?`${fmtInt(c.useOwn)} from stock, ${fmtInt(c.buy)} from ${c.offer?.seller}`:c.reason}</dd></div>
        <div><dt>Lead time</dt><dd>{c.offer?days(offerLeadDays(c.offer,c.buy)):c.source==='own'?'In stock':NA}</dd></div>
        <div><dt>Prices of</dt><dd>{r.fetchedAt?when(r.fetchedAt):'Not priced yet'}</dd></div>
        {r.refs?.length>0&&<div><dt>References</dt><dd className="mono">{r.refs.join(' ')}</dd></div>}
       </dl>
       <div className="bom-detail-edit">
        {!s.cols.qtyPerBoard&&<label>Qty per board<input className="bom-num" type="number" min="0" step="1" value={r.qty} onChange={e=>setRow(r.id,{qty:Math.max(0,n0(e.target.value))})}/></label>}
        {!s.cols.margin&&<label>{s.method==='margin'?'Margin %':'Markup %'}<span className="input-suffix small"><input className="bom-num" type="number" min="0" max={pctMax} step="0.5" placeholder={String(s.margin)} value={r.margin??''} onChange={e=>setRow(r.id,{margin:pct(e.target.value)})}/><em>%</em></span></label>}
        <label>Source{sourceSelect(r,c)}</label>
        <button className="button small" onClick={()=>openDetail(r.id,true)}>View All Market Prices</button>
        <button className="icon-button" aria-label={`Remove ${r.mpn}`} title="Remove line" onClick={()=>set(x=>({rows:x.rows.filter(y=>y.id!==r.id)}))}><Trash2 size={15}/></button>
       </div>
       {risk.atRisk&&<div className="bom-alerts">{risk.reasons.map(x=><span key={x} className={'badge '+(risk.level==='high'?'red':'amber')}><span/>{x}</span>)}<button className="text-button" onClick={()=>setAlt(r)}>{alts.length?`${alts.length} alternative${alts.length===1?'':'s'}`:'Find alternatives'} <ArrowRight size={13}/></button></div>}
      </div></td></tr>}
     </React.Fragment>})}</tbody></table>
     {order.length===0&&<div className="empty"><Search/><h3>No line matches “{query}”</h3><button className="button" onClick={()=>setQuery('')}>Clear search</button></div>}</div>}
   {!empty&&<form className="bom-add-row" onSubmit={addRow}><input aria-label="Part number to add" value={addMpn} onChange={e=>setAddMpn(e.target.value)} placeholder="Add a part number"/><input aria-label="Quantity per board" type="number" min="1" value={addQty} onChange={e=>setAddQty(e.target.value)}/><button className="button small" type="submit" disabled={!addMpn.trim()}><Plus size={14}/>Add line</button></form>}
   {!empty&&foot}
  </section>
  {!empty&&<ComponentPlanning rows={rows} calcs={calcs} outlooks={outlooks} hikes={s.hikes} onHikes={(key,value)=>set(x=>({hikes:{...x.hikes,[key]:Math.max(0,Math.min(100,n0(value)))}}))} purchases={s.purchases} onPurchase={recordPurchase} money={money}/>}
  </>}

  {step===0&&<section className="panel bom-extras" aria-label="Bare PCB setup">
    <div className="panel-heading"><div className="title-row"><CircuitBoard size={17}/><h2>Bare PCB</h2></div><small className="muted">optional</small></div>
    <div className="bom-pcb">
     <PcbGerber onFiles={sendGerber} info={s.pcb.gerber} spec={est.spec} layers={est.layers} material={mat.label} boardSource={gerberBoard} demoUrl={s.demo?DEMO_GERBER:null} onRead={readGerber} onClear={board=>set(x=>({pcb:{...x.pcb,gerber:null,gerberOff:board||x.pcb.gerberOff||null}}))}/>
     <label>Board material<select aria-label="Bare PCB material" value={s.pcb.material} onChange={e=>{const m=PCB_MATERIALS.find(x=>x.id===e.target.value);set(x=>({pcb:{...x.pcb,material:e.target.value,layers:m?(m.layers.find(l=>l>=x.pcb.layers)||m.layers[m.layers.length-1]):x.pcb.layers,unit:null}}))}}>
      <option value="">No bare PCB</option>{PCB_MATERIALS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
     {pcbOn&&<>
      <small className="muted">{mat.note}</small>
      <label>Board type and size<select aria-label="PCB board type" value={s.pcb.choice} onChange={e=>{const o=sizeOptions.find(x=>x.id===e.target.value);set(x=>({pcb:{...x.pcb,choice:e.target.value,...(o?{widthMm:o.widthMm,heightMm:o.heightMm,layers:mat.layers.find(l=>l>=o.layers)||mat.layers[mat.layers.length-1]}:{}),unit:null}}))}}>
       <option value="">Custom size</option>{sizeOptions.map(o=><option key={o.id} value={o.id}>{o.label} · {o.widthMm}×{o.heightMm} mm · est. {money.fmt(pcbEstimate({...o,material:mat.id,qty:s.boards,spec:s.pcb.spec}).perBoard)}/board</option>)}</select></label>
      <div className="bom-pcb-dims"><label>Width mm<input type="number" min="5" value={s.pcb.widthMm} onChange={e=>set(x=>({pcb:{...x.pcb,widthMm:n0(e.target.value),unit:null}}))}/></label><label>Height mm<input type="number" min="5" value={s.pcb.heightMm} onChange={e=>set(x=>({pcb:{...x.pcb,heightMm:n0(e.target.value),unit:null}}))}/></label>
       <div className="pcb-qty"><span>PCB quantity</span><strong>{fmtInt(est.qty)}</strong><small className="muted">production quantity</small></div></div>
      <ChipField label="Layers" value={String(est.layers)} options={mat.layers.map(l=>({v:String(l),label:String(l)}))} onChange={v=>set(x=>({pcb:{...x.pcb,layers:n0(v),unit:null}}))}/>
      {pcbGroups.map(([group,fields])=><div className="pcb-group" key={group} data-tour={group==='Specifications'?'pcb-options':undefined}>{group!=='Board'&&<h3 className="bom-sub">{group}</h3>}
       {fields.map(f=>f.number?<label key={f.id} className="pcb-number">{f.label}<input type="number" min={f.number.min} max={f.number.max} value={est.spec[f.id]} onChange={e=>setSpec(f.id,n0(e.target.value))}/><small className="muted">{f.hint}</small></label>
        :<ChipField key={f.id} label={f.label} value={est.spec[f.id]} options={f.options} unit={f.unit} onChange={v=>setSpec(f.id,v)}/>)}</div>)}
      <div className="pcb-charges" role="group" aria-label="Estimated charge details" data-tour="pcb-charges"><h3 className="bom-sub">Charge details <small>estimate</small></h3>
       <dl>{est.breakdown.map(b=><div key={b.label}><dt>{b.label}</dt><dd>{money.fmt(b.amount)}</dd></div>)}
        <div className="total"><dt>Estimated total, {fmtInt(est.qty)} board{est.qty===1?'':'s'}</dt><dd>{money.fmt(est.total)}</dd></div>
        <div><dt>Per board</dt><dd>{money.fmt(est.perBoard,{unit:true})}</dd></div>
        <div><dt>Build time</dt><dd>{est.buildDays[0]}–{est.buildDays[1]} working days, before shipping</dd></div></dl>
       <small className="muted">Rough factors so the price moves the right way with each option; not a fab's tariff. Enter the fab's quote below.</small></div>
      <div className="bom-pcb-dims"><label>Unit price ({money.currency})<input type="number" min="0" step="0.01" aria-label="PCB price per board" placeholder={'est. '+money.value(est.perBoard).toFixed(2)} value={shownAmt(s.pcb.unit)} onChange={e=>set(x=>({pcb:{...x.pcb,unit:typed(e.target.value)}}))}/></label>
       <label>{method[1]}<span className="input-suffix"><input type="number" min="0" max={pctMax} step="0.5" aria-label="PCB markup or margin percent" value={s.pcb.margin} onChange={e=>set(x=>({pcb:{...x.pcb,margin:pct(e.target.value)??0}}))}/><em>%</em></span></label></div>
      <dl className="pcb-line" aria-label="Selected bare PCB"><div><dt>Selected</dt><dd>{mat.label}, {est.layers} layer{est.layers===1?'':'s'}, {s.pcb.widthMm} × {s.pcb.heightMm} mm</dd></div><div><dt>Unit price</dt><dd>{pcbUnit==null?<em className="na">Price not entered</em>:money.fmt(pcbUnit,{unit:true})}</dd></div><div><dt>Quantity</dt><dd>{fmtInt(s.boards)}</dd></div><div><dt>Total cost</dt><dd>{pcbUnit==null?<em className="na">Not counted</em>:money.fmt(totals.pcbCost)}</dd></div></dl>
      <p className="muted small-copy pcb-spec-text">On the quote: {pcbSpecText({material:mat.id,layers:est.layers,widthMm:s.pcb.widthMm,heightMm:s.pcb.heightMm,spec:s.pcb.spec})}{s.pcb.gerber?`, Gerber ${s.pcb.gerber.name}`:''}</p>
      {pcbUnit==null?<p className="warn-text small-copy">Enter your fab's price per board. Until then the PCB is not in the totals or the quote. <button type="button" className="text-button" onClick={()=>set(x=>({pcb:{...x.pcb,unit:typed(money.value(est.perBoard).toFixed(4))}}))}>Use the estimate ({money.fmt(est.perBoard,{unit:true})})</button></p>
       :<small className="muted">Estimate for reference: {money.fmt(est.total)} for {fmtInt(est.qty)} boards = {money.fmt(est.perBoard,{unit:true})} per board.</small>}</>}
     {!pcbOn&&<p className="muted bom-off">Choose a material to set the board dimensions and add bare PCB pricing to the quote.</p>}
    </div>
    <div className="sourcing-panel">
     <VendorDirectory vendors={PCB_VENDORS} title="Bare PCB fabricators" selected={s.pcb.vendor} onSelect={vendor=>set(x=>({pcb:{...x.pcb,vendor,unit:null}}))}/>
     <label>Selected PCB fabricator<input value={s.pcb.vendor} maxLength="80" onChange={e=>set(x=>({pcb:{...x.pcb,vendor:e.target.value}}))}/></label>
    </div>
   </section>}
  {step===2&&<EnclosurePlanning box={s.box} board={boxBoard} setBox={patch=>set(x=>({box:{...x.box,...patch}}))} money={money} shownAmt={shownAmt} typed={typed}/>}
  {step===2&&customBox&&<MouldStep box={s.box} size={boxDims} mould={s.mould} boards={s.boards} money={money} shownAmt={shownAmt} typed={typed} onVendors={onVendors}
    setMould={patch=>set(x=>({mould:{...x.mould,...patch}}))} setBox={patch=>set(x=>({box:{...x.box,...patch}}))}/>}
  {step===3&&<><div className="bom-bottom">
   <section className="panel bom-extras" aria-label="Shipping">
    <div className="panel-heading"><div className="title-row"><Truck size={17}/><h2>Shipping</h2></div><label className="auto-switch"><input type="checkbox" checked={s.shipping.free} onChange={e=>set(x=>({shipping:{...x.shipping,free:e.target.checked}}))}/><span/>Offer Free Shipping</label></div>
    <div className="bom-ship">
     <h3 className="bom-sub">Supplier shipping <small className="muted">what suppliers charge us, once per supplier order</small></h3>
     {inbound.groups.length?<div className="table-scroll"><table className="ship-table"><thead><tr><th>Supplier</th><th className="numeric">Order value</th><th className="numeric">Flat charge</th><th className="numeric">Free above</th><th className="numeric">Shipping</th></tr></thead><tbody>
      {inbound.groups.map(g=>{const rule=s.supplierRules[g.seller]||{};const edit=k=>e=>set(x=>({supplierRules:{...x.supplierRules,[g.seller]:{...rule,[k]:typed(e.target.value)}}}));const shownV=shownAmt;
       return <tr key={g.seller}><td>{g.seller}</td><td className="numeric">{money.fmt(g.subtotal)}</td><td className="numeric"><input className="bom-num" type="number" min="0" step="any" aria-label={`${g.seller} flat shipping charge`} value={shownV(rule.flat)} onChange={edit('flat')} placeholder="—"/></td><td className="numeric"><input className="bom-num" type="number" min="0" step="any" aria-label={`${g.seller} free shipping above`} value={shownV(rule.freeAbove)} onChange={edit('freeAbove')} placeholder="—"/></td>
        <td className="numeric">{g.charge==null?<em className="na">Not quoted</em>:money.fmt(g.charge)}<small className="muted">{g.basis}</small></td></tr>})}</tbody></table></div>
     :<p className="muted bom-off">No supplier orders yet: every line is from own stock or unpriced.</p>}
     {inbound.unquoted.length>0&&<p className="warn-text small-copy">Shipping not quoted for {inbound.unquoted.join(', ')}: enter their charge so it is counted.</p>}
     <h3 className="bom-sub">Delivery to the customer</h3>
     <div className="bom-pcb-dims"><label>Our cost ({money.currency})<input type="number" min="0" step="1" aria-label="Delivery cost to the customer" placeholder="0" value={shownAmt(s.shipping.deliveryCost)} onChange={e=>set(x=>({shipping:{...x.shipping,deliveryCost:typed(e.target.value)}}))}/></label>
      <label>Method<input aria-label="Delivery method" value={s.shipping.note} placeholder="Courier, door delivery" onChange={e=>set(x=>({shipping:{...x.shipping,note:e.target.value.slice(0,80)}}))}/></label>
      <label>Charge the customer ({money.currency})<input type="number" min="0" step="1" aria-label="Shipping charged to the customer" disabled={s.shipping.free} placeholder={money.value(totals.actualShipping).toFixed(2)} value={s.shipping.free?'':shownAmt(s.shipping.charge)} onChange={e=>set(x=>({shipping:{...x.shipping,charge:typed(e.target.value)}}))}/></label></div>
     <small className="muted">{s.shipping.free?'Free shipping: the customer pays no shipping; the actual shipping cost comes out of net profit.':usdOf(s.shipping.charge)==null?'The customer pays the actual shipping cost (supplier shipping + delivery). Enter an amount to charge something else.':'The customer pays the amount entered.'}</small>
    </div>
   </section>
   <section className="panel bom-summary" aria-label="BOM total">
    <div className="panel-heading"><div className="title-row"><Calculator size={17}/><h2>Customer total and profit</h2></div><small className="muted">{fmtInt(s.boards)} boards</small></div>
    <div className="bom-method"><label>Pricing method<select aria-label="Pricing method" value={s.method} onChange={e=>set(x=>({method:e.target.value,margin:e.target.value==='margin'?Math.min(MAX_MARGIN,x.margin):x.margin}))}>{PRICING.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
     <label>Default %<span className="input-suffix"><input type="number" min="0" max={pctMax} step="0.5" aria-label="Default percent" value={s.margin} onChange={e=>set({margin:pct(e.target.value)??0})}/><em>%</em></span></label>
     <small className="muted">{method[2]}</small></div>
    <dl className="bom-totals" data-tour="bom-totals">
     <div><dt>Component cost</dt><dd>{money.fmt(totals.componentCost)}</dd></div>
     <div><dt>Selected bare PCB cost</dt><dd>{!pcbOn?'None':totals.pcbUnpriced?<em className="na">Price not entered</em>:money.fmt(totals.pcbCost)}</dd></div>
     <div><dt>Enclosure and tooling cost</dt><dd>{!s.box.material?'None':totals.enclosureUnpriced?<em className="na">Price not entered</em>:money.fmt(totals.enclosureCost)}</dd></div>
     <div className="sub"><dt>Selling subtotal before shipping</dt><dd>{money.fmt(totals.sellingSubtotal)}</dd></div>
     <div><dt>Actual shipping cost</dt><dd>{money.fmt(totals.actualShipping)}<small>supplier {money.fmt(totals.supplierShipping)} + delivery {money.fmt(totals.deliveryCost)}</small></dd></div>
     <div><dt>Shipping charged to customer</dt><dd>{s.shipping.free?'Free shipping':shippingTbc?<em className="na">To be confirmed</em>:money.fmt(totals.shippingCharged)}</dd></div>
     <div className="grand"><dt>Customer total</dt><dd>{money.fmt(totals.customerTotal)}</dd></div>
     <div><dt>Per board</dt><dd>{money.fmt(totals.perBoard)}</dd></div>
     <div className="profit"><dt>Net profit</dt><dd className={totals.netProfit>=0?'ok-text':'warn-text'}>{money.fmt(totals.netProfit)}<small>{totals.customerTotal?Math.round(totals.netProfit/totals.customerTotal*1000)/10+'% of customer total':''}</small></dd></div>
    </dl>
    <p className="formula muted">Net profit deducts component, PCB, enclosure, tooling and actual shipping costs.</p>
    {(totals.missing>0||totals.short>0||inbound.unquoted.length>0||totals.pcbUnpriced||totals.enclosureUnpriced)&&<div className="studio-note warn"><TriangleAlert size={15}/> {totals.missing?`${totals.missing} line${totals.missing===1?' has':'s have'} no price and ${totals.missing===1?'is':'are'} left out of the totals. `:''}{totals.short?`${totals.short} short of stock. `:''}{inbound.unquoted.length?`Shipping not quoted for ${inbound.unquoted.join(', ')}. `:''}{totals.pcbUnpriced?'Bare PCB price not entered. ':''}{totals.enclosureUnpriced?'Enclosure price not entered.':''}</div>}
    {ranges.length>0&&<div className="bom-scenarios"><h3>Customer pricing outlook</h3><p className="muted">Planning ranges for the priced scope. PCB, enclosure and freight stay at their entered rates.</p>
     {ranges.map(r=><div key={r.days}><span>In {r.days} days</span><strong>{money.fmt(r.low)} – {money.fmt(r.high)}</strong></div>)}</div>}
    <h3 className="bom-sub">Where to buy</h3>
    <ol className="bom-plan">{plan.map(g=><li key={g.key} className={g.key==='none'?'warn-text':''}><span><strong>{g.label}</strong><small>{g.lines.length} line{g.lines.length===1?'':'s'} · {fmtInt(g.lines.reduce((a,l)=>a+l.qty,0))} pcs</small></span><b>{g.key==='none'?'—':money.fmt(g.cost)}</b></li>)}</ol>
    <button className="button primary full" data-tour="bom-quote" disabled={empty&&!pcbOn&&!s.box.material} onClick={()=>setQuote(true)}><FileDown size={15}/>Quotation PDF</button>
   </section>
  </div>
  {outcome}</>}
  <div className="bom-step-actions">
   {step>0&&<button className="button" type="button" onClick={()=>goTo(step-1)}>Back to {STEPS[step-1]}</button>}
   {step<STEPS.length-1&&<button className="button primary" type="button" onClick={()=>goTo(step+1)}>Next: {STEPS[step+1]} <ArrowRight size={16}/></button>}
  </div>

  {alt&&<Alternatives row={alt} calc={calcs[rows.findIndex(r=>r.id===alt.id)]} list={alternates(alt)} money={money} ready={ready!==false} fetchOffers={fetchOffers} onUse={m=>useAlternate(alt,m)} onCompare={onCompare} onClose={()=>setAlt(null)}/>}
  {quote&&<QuoteDialog s={s} rows={rows} totals={totals} ranges={ranges} boxDims={boxDims} mat={pcbOn?mat:null} layers={est.layers} money={money} notify={notify} shippingTbc={shippingTbc} unquoted={inbound.unquoted} onClose={()=>setQuote(false)}/>}
  {bid&&<BidDialog offer={bid.offer} need={bid.need} money={money} onClose={()=>setBid(null)} onSave={saveBid}/>}
  {cartOpen&&<BomCart {...cartProps} startTab={cartOpen}/>}
 </div>);
}

function Alternatives({row,calc,list,money,ready,fetchOffers,onUse,onCompare,onClose}){
 const [checked,setChecked]=useState({});
 const check=async mpn=>{setChecked(c=>({...c,[mpn]:{busy:true}}));try{const d=await fetchOffers(mpn);const need=Math.max(1,calc?.need||1),best=recommend(d.offers,need);setChecked(c=>({...c,[mpn]:{best,market:marketStock(d.offers),image:d.offers.find(o=>o.image)?.image}}))}catch(e){setChecked(c=>({...c,[mpn]:{error:e.message}}))}};
 const alerts=sourcingAlerts(row,calc);
 return <Dialog title={`Alternatives for ${row.mpn}`} onClose={onClose}>
  <div className="notice"><TriangleAlert size={18}/><span>{alerts.map(a=>a.label+(a.detail?` (${a.detail})`:'')).join(' · ')||'Candidates'}. Compatibility check required: package and pinout, electrical and thermal ratings, and qualification before you switch.</span></div>
  {list.length===0?<p className="muted">No cross-reference is recorded for this part. Compare the market to find one.</p>:
  <ul className="alt-list">{list.map(a=>{const c=checked[a.mpn];return <li key={a.mpn}><PartImage part={{mpn:a.mpn,package:a.inv?.package||row.package,category:a.inv?.category,description:a.inv?.description||row.description}} src={c?.image} size={40}/>
   <div><strong>{a.mpn}</strong><small>{a.from}{a.inv?` · ${a.inv.stock.toLocaleString('en-IN')} in own stock`:''}</small>{c?.best&&<small>{c.best.offer.seller} · {money.fmt(c.best.unit,{unit:true})} · {c.market.toLocaleString('en-IN')} in the market</small>}{c?.error&&<small className="warn-text">{c.error}</small>}</div>
   <div className="alt-actions">{ready&&<button className="button small" onClick={()=>check(a.mpn)} disabled={c?.busy}>{c?.busy?'Checking…':'Check price'}</button>}<button className="button small primary" onClick={()=>onUse(a.mpn)}><Replace size={14}/>Use instead</button></div></li>})}</ul>}
  <button className="button full" onClick={()=>{onClose();onCompare(row.mpn)}}>Compare the market for {row.mpn} <ArrowUpRight size={15}/></button>
 </Dialog>;
}

// Customer quotation: selling prices only. Internal costs, markup or margin, supplier shipping and net
// profit stay out of the PDF.
// One quote-form choice as a row of buttons: radio inputs, so arrow keys move between the choices.
function ChipField({label,value,options,unit,onChange}){const name=useId();
 return <fieldset className="pcb-field"><legend>{label}</legend><div className="pcb-chips">{options.map(o=><label key={o.v} className={'pcb-chip'+(value===o.v?' on':'')}>
  <input type="radio" name={name} value={o.v} checked={value===o.v} onChange={()=>onChange(o.v)}/>{o.swatch&&<i className="pcb-swatch" style={{background:o.swatch}} aria-hidden="true"/>}{o.label}{unit?' '+unit:''}</label>)}</div></fieldset>}

function QuoteDialog({s,rows,totals,ranges,boxDims,mat,layers,money,notify,shippingTbc=false,unquoted=[],onClose}){
 const [from,setFrom]=useState(loadFrom);
 const [q,setQ]=useState(()=>({customer:'',contact:'',number:quoteNumber(),valid:9,currency:money.currency,notes:'',scope:s.project||s.from||'Production build'}));
 const [busy,setBusy]=useState(false);
 const download=async e=>{e.preventDefault();setBusy(true);try{localStorage.setItem(FROM,JSON.stringify(from))}catch{}
  try{const today=new Date(),until=new Date(today.getTime()+Math.max(1,+q.valid||15)*864e5),d=x=>x.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
   const pcb=mat?{label:pcbSpecText({material:mat.id,layers,widthMm:s.pcb.widthMm,heightMm:s.pcb.heightMm,spec:s.pcb.spec})+(s.pcb.gerber?`, Gerber ${s.pcb.gerber.name}`:''),amount:totals.pcbSell,onRequest:totals.pcbUnpriced}:null;
   const enclosure=s.box.material?{label:`${s.box.material}, ${boxDims.outer.map(n=>Number(n.toFixed(1))).join(' x ')} mm outside, including tooling`,amount:totals.enclosureSell,onRequest:totals.enclosureUnpriced}:null;
   const fetched=rows.map(r=>r.fetchedAt).filter(Boolean).sort();
   const blob=await quotePdf({from,to:{customer:q.customer,contact:q.contact},number:q.number,date:d(today),validUntil:d(until),currency:q.currency,inrPerUsd:money.inrPerUsd,rateSource:money.source,rateTime:money.updated?when(money.updated):money.fetchedAt?when(money.fetchedAt):null,scope:q.scope,boards:s.boards,componentLines:rows.filter(r=>r.qty>0).length,pcb,enclosure,ranges,
    shipping:{free:s.shipping.free,amount:totals.shippingCharged,note:s.shipping.note,tbc:shippingTbc},totals,notes:q.notes,priced:fetched.length?d(new Date(fetched[0])):null});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Quotation-${q.number}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
   notify(`Quotation ${q.number} downloaded.`);onClose()}catch(err){notify('The PDF could not be made: '+err.message)}finally{setBusy(false)}};
 const f=k=>e=>setQ(x=>({...x,[k]:e.target.value})),g=k=>e=>setFrom(x=>({...x,[k]:e.target.value}));
 const shown=v=>q.currency===money.currency?money.fmt(v):new Intl.NumberFormat(q.currency==='INR'?'en-IN':'en-US',{style:'currency',currency:q.currency}).format(q.currency==='INR'?v*money.inrPerUsd:v);
 return <Dialog title="Quotation" onClose={onClose} wide>
  <form className="quote-dialog" onSubmit={download}>
   <fieldset><legend>From</legend><label>Company<input value={from.company} onChange={g('company')} placeholder="Your company name" required/></label><label>Address<textarea rows="3" value={from.address} onChange={g('address')} placeholder="Street, city, GSTIN"/></label><label>Contact<input value={from.contact} onChange={g('contact')} placeholder="Phone or email"/></label></fieldset>
   <fieldset><legend>To</legend><label>Customer<input value={q.customer} onChange={f('customer')} placeholder="Company" required/></label><label>Contact<input value={q.contact} onChange={f('contact')} placeholder="Name, email"/></label><label>Scope<input value={q.scope} onChange={f('scope')}/></label></fieldset>
   <fieldset className="quote-meta"><legend>Quote</legend><label>Number<input value={q.number} onChange={f('number')} required/></label><label>Valid for (days)<input type="number" min="1" value={q.valid} onChange={f('valid')}/></label>
    <label>Currency<select value={q.currency} onChange={f('currency')}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option></select></label><label className="wide-field">Notes and terms<textarea rows="2" value={q.notes} onChange={f('notes')} placeholder="Payment terms, delivery time"/></label></fieldset>
   <dl className="quote-preview"><div><dt>Lines</dt><dd>{rows.length} · {s.boards.toLocaleString('en-IN')} boards{mat?` · ${mat.label} PCB`:''}</dd></div><div><dt>Subtotal</dt><dd>{shown(totals.sellingSubtotal)}</dd></div><div><dt>Shipping</dt><dd>{s.shipping.free?'Free':shippingTbc?'To be confirmed':shown(totals.shippingCharged)}</dd></div><div className="grand"><dt>Customer total</dt><dd>{shown(totals.customerTotal)}</dd></div></dl>
   <p className="muted small-copy">The quote groups component pricing into one amount and shows the current total and available 3-day and 9-day ranges.</p>
   {totals.missing>0&&<div className="studio-note warn"><TriangleAlert size={15}/> {totals.missing} line{totals.missing===1?' is':'s are'} pending and excluded from the quotation total.</div>}
   {totals.pcbUnpriced&&<div className="studio-note warn"><TriangleAlert size={15}/> The bare PCB has no price yet and will print "Price on request".</div>}
   {totals.enclosureUnpriced&&<div className="studio-note warn"><TriangleAlert size={15}/> The enclosure has no price yet and will print "Price on request".</div>}
   {shippingTbc&&<div className="studio-note warn"><TriangleAlert size={15}/> Shipping is not known yet{unquoted.length?` (no charge set for ${unquoted.join(', ')})`:''} and will print "To be confirmed".</div>}
   <button className="button primary full" type="submit" disabled={busy}><FileDown size={15}/>{busy?'Making the PDF…':'Download PDF'}</button>
  </form>
 </Dialog>;
}
