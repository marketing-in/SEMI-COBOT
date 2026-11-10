import React,{useState,useLayoutEffect,useMemo,useRef,useCallback,useContext} from 'react';
import {CurrencyContext} from './currency.jsx';
import {ArrowUpRight} from 'lucide-react';
import {summary,locationSeries,totalOf,allocation,categoryBars,restockGoals,stockVsMinimum} from './bentoData.js';

// Overview: the inventory at a glance. Plain figures, flat series colours from the theme
// tokens (--series-1..3), hairline rules between cells. Styles live in style.css under "overview".

const SERIES=[['Semiconductors','semiconductors','var(--series-1)'],['Passives','passives','var(--series-2)'],['Other','other','var(--series-3)']];
const COL=Object.fromEntries(SERIES.map(([k,,c])=>[k,c]));
const fmtInt=n=>Math.round(n).toLocaleString('en-US');
// Money in the display currency (set from CurrencyContext each time the overview renders).
let CUR={currency:'USD',inrPerUsd:1};
const money=(v,{compact=false}={})=>{const inr=CUR.currency==='INR',x=inr?v*CUR.inrPerUsd:v,a=Math.abs(x),s=x<0?'−':'',sym=inr?'₹':'$';
 if(compact&&inr&&a>=1e7)return s+sym+(a/1e7).toFixed(a>=1e8?0:1)+'Cr';if(compact&&inr&&a>=1e5)return s+sym+(a/1e5).toFixed(a>=1e6?0:1)+'L';
 if(compact&&a>=1000)return s+sym+(a/1000).toFixed(a>=10000?0:1)+'k';return s+sym+a.toLocaleString(inr?'en-IN':'en-US',{maximumFractionDigits:0})};
const units=(v,{compact=false}={})=>{const a=Math.abs(v),s=v<0?'−':'';if(compact&&a>=1000)return s+(a/1000).toFixed(a>=10000?0:1)+'k';return s+fmtInt(a)+' pcs'};
const amount=(basis,v,o)=>basis==='units'?units(v,o):money(v,o);
const SHORT={'End of life':'EOL','Out of stock':'Out','Low stock':'Low','In stock':'OK'};
// Round axis maximum: 1, 2 or 5 × 10^n at or above `v`.
const niceMax=v=>{if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));for(const m of [1,2,2.5,5,10])if(m*p>=v)return m*p;return 10*p};

function useWidth(ref,fallback){const [w,setW]=useState(fallback);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const read=()=>setW(el.getBoundingClientRect().width||fallback);read();if(typeof ResizeObserver!=='function')return;const ro=new ResizeObserver(read);ro.observe(el);return()=>ro.disconnect()},[ref,fallback]);return w}

function Tip({tip}){const ref=useRef(null);
 useLayoutEffect(()=>{const el=ref.current;if(!el||!tip)return;const r=el.getBoundingClientRect();let L=tip.x+12,T=tip.y-r.height-10;if(L+r.width>innerWidth-8)L=tip.x-r.width-12;if(T<8)T=tip.y+14;el.style.left=L+'px';el.style.top=T+'px'},[tip]);
 return <div ref={ref} className={'ov-tip'+(tip?' on':'')} aria-hidden="true">{tip&&<><b>{tip.title}</b>{tip.rows.map(([k,v,c])=><span key={k}><i style={{background:c||'transparent'}}/>{k}<em>{v}</em></span>)}</>}</div>;
}

// Stacked columns, one per storage bin.
function ValueChart({parts,basis,s,showTip,hideTip}){
 const ref=useRef(null),W=useWidth(ref,640),H=190,L=44,R=8,T=10,B=24;
 const bins=useMemo(()=>locationSeries(parts,basis).filter((b,i,a)=>!(i===1&&a.length===2&&a[0].l===b.l)),[parts,basis]);
 const max=niceMax(Math.max(...bins.map(totalOf))),y=v=>T+(H-T-B)*(1-v/max);
 const step=(W-L-R)/bins.length,bw=Math.min(36,step*.56);
 const total=basis==='units'?s.units:s.value,base=basis==='units'?s.minUnits:s.minValue;
 const diff=total-base;
 return <section className="ov-cell ov-main" id="nw" aria-label={basis==='units'?'Units in stock':'Inventory value'}>
  <header className="ov-head"><h3>{basis==='units'?'Units in stock':'Inventory value'}</h3><ul className="ov-legend">{SERIES.map(([k,,c])=><li key={k}><i style={{background:c}}/>{k}</li>)}</ul></header>
  <div className="ov-figure"><strong>{basis==='units'?fmtInt(total):money(total)}</strong>{base>0?<span><b className={diff>=0?'up':'down'}>{diff>=0?'+':'−'}{amount(basis,Math.abs(diff))}</b> {diff>=0?'above':'below'} minimum</span>:<span>No minimum set</span>}</div>
  <svg ref={ref} className="ov-chart" width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${basis==='units'?'Units':'Value'} by storage location`} onPointerLeave={hideTip}>
   {[0,.5,1].map(f=><g key={f}><line x1={L} x2={W-R} y1={y(max*f)} y2={y(max*f)} className={f?'grid':'axis'}/><text x={L-8} y={y(max*f)+4} textAnchor="end">{f?amount(basis,max*f,{compact:true}):'0'}</text></g>)}
   {bins.map((b,i)=>{const x=L+i*step+(step-bw)/2;let acc=0;return <g key={b.l} onPointerMove={e=>showTip(e.clientX,e.clientY,`Location ${b.l}`,[...SERIES.map(([k,key,c])=>[k,amount(basis,b[key]),c]),['Total',amount(basis,totalOf(b))]])}>
    <rect x={L+i*step} y={T} width={step} height={H-T-B} fill="transparent"/>
    {SERIES.map(([k,key,c])=>{const v=b[key];if(!v)return null;const y1=y(acc+v),h=y(acc)-y1;acc+=v;return <rect key={k} x={x} y={y1} width={bw} height={Math.max(1,h-1)} style={{fill:c}}/>})}
    <text x={x+bw/2} y={H-6} textAnchor="middle">{b.l}</text></g>})}
  </svg>
 </section>;
}

function Allocation({parts,basis}){
 const a=useMemo(()=>allocation(parts,basis),[parts,basis]);
 return <section className="ov-cell" id="alloc" aria-label="Allocation">
  <header className="ov-head"><h3>Allocation</h3></header>
  <div className="ov-share" aria-hidden="true">{a.rows.map(r=>r.share>0&&<i key={r.key} style={{flexGrow:r.share,background:COL[r.key]}}/>)}</div>
  <table className="ov-table"><tbody>{a.rows.map(r=><tr key={r.key}><td><i className="sw" style={{background:COL[r.key]}}/>{r.key}</td><td className="num dim">{Math.round(r.share*100)}%</td><td className="num">{amount(basis,r.value)}</td></tr>)}</tbody></table>
 </section>;
}

function Health({s}){const pct=s.uniqueCount?s.healthy/s.uniqueCount*100:0;
 return <section className="ov-kpi" id="ret" aria-label="Stock health"><h3>Stock health</h3><strong>{pct.toFixed(0)}<small>%</small></strong><p>{s.healthy} of {s.uniqueCount} parts OK</p></section>;
}
function Units({s}){
 return <section className="ov-kpi" id="cash" aria-label="Units in stock"><h3>Units in stock</h3><strong>{fmtInt(s.units)}</strong><p>{s.coverage.toFixed(1)}× minimum</p></section>;
}
function Attention({s,status,onOpenAlert}){const rows=s.alerts.slice(0,3);
 return <section className="ov-kpi ov-list" id="pay" aria-label="Needs attention"><h3>Needs attention <span>{s.alerts.length}</span></h3>
  {rows.length?<ul>{rows.map(p=><li key={p.id||p.mpn}><button type="button" className="rowbtn" onClick={()=>onOpenAlert?.(p)}><span className="mpn">{p.mpn}</span><span className={'st '+(status(p)==='Low stock'?'amber':'red')}>{SHORT[status(p)]||status(p)}</span><span className="num">{fmtInt(p.stock||0)}</span></button></li>)}</ul>:<p>All in stock.</p>}
 </section>;
}
function Goals({parts,status}){const goals=useMemo(()=>restockGoals(parts,status,2),[parts,status]);
 return <section className="ov-kpi ov-list" id="goals" aria-label="Restock goals"><h3>Restock goals <span>{goals.length}</span></h3>
  {goals.length?<ul>{goals.map(g=><li key={g.part.id||g.part.mpn} className="goal"><div><span className="mpn">{g.part.mpn}</span><span className="num">{fmtInt(g.part.stock||0)} / {fmtInt(g.target)}</span></div><div className="ov-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.progress*100)} aria-label={`${g.part.mpn} restock progress`}><i style={{width:g.progress*100+'%'}}/></div></li>)}</ul>:<p>None below minimum.</p>}
 </section>;
}

// Stock per category as a bar, with the minimum marked as a tick.
function Flow({parts}){
 const rows=useMemo(()=>stockVsMinimum(parts,6),[parts]);
 const max=niceMax(Math.max(1,...rows.map(r=>Math.max(r.stock,r.min))));
 const net=rows.reduce((t,r)=>t+r.stock-r.min,0);
 return <section className="ov-cell" id="flow" aria-label="Stock versus minimum">
  <header className="ov-head"><h3>Stock against minimum</h3><small>{net>=0?'+':'−'}{fmtInt(Math.abs(net))} units</small></header>
  <ul className="ov-bars">{rows.map(r=><li key={r.name} title={`${r.name}: ${units(r.stock)} in stock, minimum ${units(r.min)}`}><span className="name">{r.name}</span>
   <span className="track"><i className={r.stock<r.min?'short':''} style={{width:r.stock/max*100+'%'}}/>{r.min>0&&<b style={{left:r.min/max*100+'%'}}/>}</span><span className="num">{units(r.stock,{compact:true})}</span></li>)}</ul>
  <p className="ov-note"><b className="tick"/> minimum</p>
 </section>;
}

function Studio({board,boardModel,matched,onNavigate,preview}){
 return <section className="ov-cell ov-studio" id="crypto" aria-label="Board studio">
  <header className="ov-head"><div><h3>{board.name}</h3><small>{board.revision||board.source}</small></div><button type="button" className="button small" onClick={()=>onNavigate?.('Board studio')}>Open studio <ArrowUpRight size={14}/></button></header>
  <p className="ov-studio-meta"><span><b>{fmtInt(boardModel.length)}</b> components</span><span><b>{fmtInt(matched)}</b> in inventory</span></p>
  <div className="ov-preview">{preview}</div>
 </section>;
}

function Categories({parts,basis}){
 const bars=useMemo(()=>categoryBars(parts,basis,5),[parts,basis]);
 const val=r=>basis==='units'?r.units:r.value,max=Math.max(1,...bars.map(val));
 return <section className="ov-cell" id="stocks" aria-label="Units by category">
  <header className="ov-head"><h3>{basis==='units'?'Units by category':'Value by category'}</h3></header>
  {bars.length?<ul className="ov-bars stacked">{bars.map(b=><li key={b.name}><span className="name">{b.name}</span><span className="num">{amount(basis,val(b),{compact:true})}</span><span className="track"><i style={{width:val(b)/max*100+'%'}}/></span></li>)}</ul>:<p className="ov-note">No stock.</p>}
 </section>;
}

export function Bento({parts=[],status=()=>'In stock',board={name:'Board',revision:'',source:''},boardModel=[],matched=0,onNavigate,onOpenPart,onOpenAlert,preview=null}){
 CUR=useContext(CurrencyContext);
 const [basis,setBasis]=useState('value');
 const [tip,setTip]=useState(null);
 const s=useMemo(()=>summary(parts,status),[parts,status]);
 const showTip=useCallback((x,y,title,rows)=>setTip({x,y,title,rows}),[]);
 const hideTip=useCallback(()=>setTip(null),[]);
 const open=onOpenAlert||onOpenPart;
 return <div className="bento">
  <div className="ov-bar"><p>{parts.length} parts in {s.categories} categories</p>
   <div className="segmented" role="group" aria-label="Basis">{['Value','Units'].map(b=><button type="button" key={b} className={basis===b.toLowerCase()?'active':''} aria-pressed={basis===b.toLowerCase()} onClick={()=>setBasis(b.toLowerCase())}>{b}</button>)}</div></div>
  <div className="ov-top"><ValueChart parts={parts} basis={basis} s={s} showTip={showTip} hideTip={hideTip}/><Allocation parts={parts} basis={basis}/></div>
  <div className="ov-strip"><Health s={s}/><Units s={s}/><Attention s={s} status={status} onOpenAlert={open}/><Goals parts={parts} status={status}/></div>
  <div className="ov-bottom"><Flow parts={parts}/><Studio board={board} boardModel={boardModel} matched={matched} onNavigate={onNavigate} preview={preview}/><Categories parts={parts} basis={basis}/></div>
  <Tip tip={tip}/>
 </div>;
}
export default Bento;
