import React,{useEffect,useMemo,useState} from 'react';
import {BarChart3,RefreshCw,Radar,TriangleAlert,ChevronDown,ExternalLink,ShoppingCart} from 'lucide-react';
import {scoreSellers} from './supplierScore.js';

// Stacked market chart for the board on screen: one row per part number, one bar segment per
// supplier sized by the stock that supplier reports, plus the best authorised price and how many
// boards the market could build. Every row opens into the full market listing (the same offers and
// scores as Compare). Google Shopping is included for boards with up to 25 part numbers and can be
// switched on or off, because each part number costs one SerpApi search (cached for six hours).
const MAIN=['DigiKey','Mouser','TME','Master Electronics'],MAX_COLS=7;
const fmt=n=>Number(n).toLocaleString('en-US');
const money=v=>'$'+v.toFixed(v<1?3:2);
const cache=new Map();          // MPN -> compare result, for this browser session
const inflight=new Map();       // MPN -> pending request, shared by every render that asks for it
const CONCURRENCY=3;
let active=0;const waiting=[];
const slot=()=>new Promise(res=>{if(active<CONCURRENCY){active++;res()}else waiting.push(res)});
const release=()=>{const next=waiting.shift();if(next)next();else active--};
function loadMarket(mpn,force=false,shopping=false){
 const key=mpn.toUpperCase()+(shopping?'|all':'|dist');if(!force&&cache.has(key))return Promise.resolve(cache.get(key));if(inflight.has(key))return inflight.get(key);
 const p=(async()=>{await slot();try{const res=await fetch('/api/compare?'+(shopping?'':'sources=distributors&')+'mpn='+encodeURIComponent(mpn));let j;try{j=await res.json()}catch{throw Error('Supplier service offline. Run npm run server.')}
  if(!res.ok)throw Error(j.error||'Lookup failed');cache.set(key,j);return j}finally{release();inflight.delete(key)}})();
 inflight.set(key,p);return p;
}

const keyOf=p=>{const m=String(p.inv?.mpn||p.mpn||'').trim();return m&&m!=='Unnamed part'?m:''};
const naturalCmp=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
const refRange=refs=>{if(refs.length<=3)return refs.join(', ');return `${refs[0]}–${refs[refs.length-1]}`};

export function MarketChart({parts=[],onFocus,onCompare}){
 const rows=useMemo(()=>{const m=new Map();for(const p of parts){const k=keyOf(p);if(!k)continue;const r=m.get(k.toUpperCase())||{mpn:k,refs:[],part:p};r.refs.push(p.ref);m.set(k.toUpperCase(),r)}
  return [...m.values()].map(r=>({...r,refs:r.refs.sort(naturalCmp)})).sort((a,b)=>naturalCmp(a.refs[0],b.refs[0]))},[parts]);
 const unnamed=parts.length-rows.reduce((n,r)=>n+r.refs.length,0);
 const [shopping,setShopping]=useState(()=>rows.length<=25);const [closed,setClosed]=useState(()=>new Set());
 const [data,setData]=useState({});const [nonce,setNonce]=useState(0);const [error,setError]=useState('');const [failed,setFailed]=useState({});
 useEffect(()=>{let live=true;const force=nonce>0;setError('');setFailed({});
  for(const r of rows){const key=r.mpn.toUpperCase();
   loadMarket(r.mpn,force,shopping).then(j=>{if(live)setData(d=>d[key]===j?d:{...d,[key]:j})}).catch(e=>{if(!live)return;setError(e.message);setFailed(f=>({...f,[key]:true}))})}
  return()=>{live=false}},[rows,nonce,shopping]);
 // Per row: stock by supplier (best offer per supplier), best authorised USD price.
 const table=useMemo(()=>rows.map(r=>{const res=data[r.mpn.toUpperCase()];if(!res)return {...r,loading:!failed[r.mpn.toUpperCase()],failed:!!failed[r.mpn.toUpperCase()],segs:[],total:0,listed:0};
  const by=new Map();for(const o of res.offers||[]){if(!o.authorized&&o.source==='nexar')continue;const s=o.seller||o.source;const prev=by.get(s)||{seller:s,stock:0,priceUsd:null,authorized:false};prev.authorized=prev.authorized||!!o.authorized;prev.stock=Math.max(prev.stock,o.stock||0);if(o.priceUsd>0&&(prev.priceUsd==null||o.priceUsd<prev.priceUsd))prev.priceUsd=o.priceUsd;by.set(s,prev)}
  const segs=[...by.values()].sort((a,b)=>b.stock-a.stock);const total=segs.reduce((n,s)=>n+s.stock,0);const priced=segs.filter(s=>s.priceUsd!=null&&s.authorized).sort((a,b)=>a.priceUsd-b.priceUsd)[0];
  return {...r,segs,total,best:priced||null,listed:segs.length,providers:res.providers,offers:scoreSellers(res.offers||[])}}),[rows,data,failed]);
 const loaded=table.filter(r=>!r.loading&&!r.failed);const busy=table.some(r=>r.loading);
 // One column per supplier: the main distributors first, then other authorised distributors, then
 // marketplaces, each by how many parts they price;
 // anything beyond MAX_COLS shares an Others column showing its cheapest price.
 const priced=new Map(),auth=new Set();for(const r of loaded)for(const x of r.segs){if(x.authorized)auth.add(x.seller);if(x.priceUsd!=null||x.stock>0)priced.set(x.seller,(priced.get(x.seller)||0)+1)}
 const ranked=[...priced.keys()].sort((a,b)=>(MAIN.indexOf(a)<0?99:MAIN.indexOf(a))-(MAIN.indexOf(b)<0?99:MAIN.indexOf(b))||auth.has(b)-auth.has(a)||priced.get(b)-priced.get(a)||a.localeCompare(b));
 const cols=(ranked.length?ranked:MAIN).slice(0,MAX_COLS),others=ranked.length>MAX_COLS,span=4+cols.length+(others?1:0);
 // Boards the market could supply: the scarcest part decides, counting how many times it is used.
 const buildable=loaded.length===rows.length&&rows.length?Math.min(...loaded.map(r=>Math.floor(r.total/r.refs.length))):null;
 const bottleneck=buildable!=null?loaded.reduce((a,r)=>Math.floor(r.total/r.refs.length)<Math.floor(a.total/a.refs.length)?r:a,loaded[0]):null;
 const bomCost=loaded.length===rows.length?loaded.reduce((s,r)=>s+(r.best?.priceUsd||0)*r.refs.length,0):null;
 const providers=loaded[0]?.providers||[];
 const offline=providers.filter(p=>p.status!=='ok');
 if(!parts.length)return null;
 return <section className="panel market-panel" aria-label="Market for this board">
  <div className="panel-heading"><div className="title-row"><BarChart3 size={18}/><h2>Market for this board</h2><span className="count-label">{rows.length} part number{rows.length===1?'':'s'}</span></div>
   <div className="market-actions"><button type="button" className={'text-button'+(shopping?' on':'')} aria-pressed={shopping} onClick={()=>setShopping(v=>!v)} title="Each part number uses one SerpApi search, cached for six hours"><ShoppingCart size={13}/>Google Shopping {shopping?'on':'off'}</button><button type="button" className="text-button" onClick={()=>setClosed(c=>c.size?new Set():new Set(rows.map(r=>r.mpn)))}><ChevronDown size={13}/>{closed.size?'Open all':'Close all'}</button><button type="button" className="text-button" onClick={()=>setNonce(n=>n+1)} disabled={busy}><RefreshCw size={13}/>{busy?`Checking ${loaded.length}/${rows.length}…`:'Refresh'}</button></div></div>
  <div className="market-summary">
   <div><small>Boards the market can supply</small><strong>{buildable==null?'…':fmt(buildable)}</strong>{bottleneck&&<span>Limited by {bottleneck.mpn}</span>}</div>
   <div><small>Parts cost per board</small><strong>{bomCost==null?'…':'$'+bomCost.toFixed(2)}</strong><span>Best authorised price</span></div>
   <div><small>Out of stock</small><strong>{loaded.length===rows.length?loaded.filter(r=>r.total===0).length:'…'}</strong><span>{unnamed>0?`${unnamed} unnamed, not checked`:null}</span></div>
  </div>
  {error&&<div className="notice error" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
  {offline.length>0&&<p className="market-offline muted">Not connected: {offline.map(p=>p.name).join(', ')}</p>}
  <div className="table-scroll"><table className="market-table"><thead><tr><th>Component</th><th>On board</th>{cols.map(c=><th key={c} className="num-col">{c}</th>)}{others&&<th className="num-col">Others</th>}<th className="num-col">Total stock</th><th aria-label="Compare"/></tr></thead>
   <tbody>{table.map(r=>{const open=!closed.has(r.mpn),by=new Map(r.segs.map(x=>[x.seller,x])),rest=r.segs.filter(x=>!cols.includes(x.seller)&&x.priceUsd!=null).sort((a,b)=>a.priceUsd-b.priceUsd)[0],low=Math.min(...r.segs.filter(x=>x.priceUsd!=null).map(x=>x.priceUsd));
    const cell=(x,key,name)=>r.loading?<td key={key} className="numeric muted">…</td>:!x||x.priceUsd==null&&!x.stock?<td key={key} className="numeric muted">—</td>:<td key={key} className={'numeric price-cell'+(x.priceUsd!=null&&x.priceUsd===low?' best':'')}>{x.priceUsd!=null?money(x.priceUsd):'—'}<small className="price-note">{fmt(x.stock)} in stock{name?' · '+name:''}</small></td>;
    return <React.Fragment key={r.mpn}><tr className={'market-row'+(open?' open':'')} onMouseEnter={()=>onFocus?.(r.part)} onMouseLeave={()=>onFocus?.(null)}>
    <td><button type="button" className="market-toggle" aria-expanded={open} aria-label={`${open?'Close':'Open'} the market listing for ${r.mpn}`} onClick={()=>setClosed(c=>{const n=new Set(c);n.has(r.mpn)?n.delete(r.mpn):n.add(r.mpn);return n})}><ChevronDown size={14}/></button><button type="button" className="part-link" onClick={()=>onFocus?.(r.part,true)}><span><strong>{r.mpn}</strong><small>{r.part.package||r.part.type}</small></span></button></td>
    <td><span className="ref-chip">{refRange(r.refs)}</span><small className="price-note">×{r.refs.length} per board</small></td>
    {r.failed?<td colSpan={cols.length+(others?1:0)} className="muted">Lookup failed</td>:<>{cols.map(c=>cell(by.get(c),c))}{others&&cell(rest,'others',rest?.seller)}</>}
    <td className="numeric">{r.loading?'…':fmt(r.total)}</td>
    <td><button type="button" className="button small" onClick={()=>onCompare?.(r.mpn)} aria-label={`Compare all markets for ${r.mpn}`}><Radar size={13}/>Radar</button></td>
   </tr>{open&&!r.loading&&!r.failed&&<tr className="market-offers"><td colSpan={span}>
    <div className="offer-providers">{(r.providers||[]).map(p=><span key={p.id} className={'provider-chip '+p.status} title={p.error||p.need||''}>{p.name}<b>{p.status==='ok'?p.count:p.status==='error'?'error':'off'}</b></span>)}</div>
    {r.offers.length?<table className="offer-table" aria-label={`Market listing for ${r.mpn}`}><thead><tr><th>Seller</th><th>Unit price</th><th>Stock</th><th>Delivery</th><th>MOQ</th><th>Score</th><th aria-label="Link"/></tr></thead><tbody>{r.offers.map(o=><tr key={o.seller}>
     <td><strong>{o.seller}</strong><small className="price-note">{o.authorized?'Authorised':'Marketplace'} · {o.sources.map(x=>x==='serpapi'?'Google Shopping':x).join(', ')}</small></td>
     <td className="numeric">{o.price==null?'—':`${o.currency==='USD'?'$':o.currency==='INR'?'₹':(o.currency||'')+' '}${o.price<1?o.price.toFixed(o.price<.1?4:3):o.price.toFixed(2)}`}{o.currency&&o.currency!=='USD'&&o.priceUsd!=null&&<small className="price-note">≈ ${o.priceUsd.toFixed(o.priceUsd<1?3:2)}</small>}</td>
     <td className="numeric">{o.stock==null?'Unknown':fmt(o.stock)}</td><td>{o.stock>0?'Ships now':o.leadDays!=null?`${o.leadDays} days`:'Unknown'}</td><td className="numeric">{o.moq==null?'—':fmt(o.moq)}</td>
     <td className="numeric"><span className="score-pill" style={{'--s':o.overall+'%'}}>{o.overall}</span></td>
     <td>{typeof o.url==='string'&&/^https:\/\//.test(o.url)&&<a href={o.url} target="_blank" rel="noreferrer" aria-label={`Open ${o.seller} offer for ${r.mpn}`}><ExternalLink size={14}/></a>}</td></tr>)}</tbody></table>:<p className="muted offer-empty">Not listed.</p>}
   </td></tr>}</React.Fragment>})}</tbody></table></div>
  
 </section>;
}
export default MarketChart;
