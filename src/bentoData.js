// Figures behind the Overview bento cards, computed from inventory records
// {id,mpn,manufacturer,category,stock,min,price,lifecycle,location}. Pure functions, no DOM,
// so the same code runs in the browser and in Node tests. Every number is finite (NaN and
// Infinity are clamped to 0) so the charts never receive a broken value.

const num=v=>{const n=+v;return Number.isFinite(n)?n:0};
const safeDiv=(a,b)=>b>0?a/b:0;

export function groupOf(category){
 const c=String(category||'');
 if(/microcontroller|diode|transistor|power|amplif|timer|logic|memory|interface|analog|integrated|optoelectronic|programmable|module/i.test(c))return 'Semiconductors';
 if(/capacitor|resistor|inductor|crystal/i.test(c))return 'Passives';
 return 'Other';
}
export const GROUPS=['Semiconductors','Passives','Other'];
export const valueOf=p=>num(p?.price)*num(p?.stock);
const basisOf=(p,basis)=>basis==='units'?num(p?.stock):valueOf(p);
const STATUS_ORDER={'End of life':0,'Out of stock':1,'Low stock':2,'In stock':3};

// Headline figures and the attention list, worst first.
export function summary(parts=[],status=()=>'In stock'){
 const list=Array.isArray(parts)?parts:[];
 const value=list.reduce((s,p)=>s+valueOf(p),0);
 const minValue=list.reduce((s,p)=>s+num(p.price)*num(p.min),0);
 const units=list.reduce((s,p)=>s+num(p.stock),0);
 const minUnits=list.reduce((s,p)=>s+num(p.min),0);
 const healthy=list.filter(p=>num(p.stock)>=num(p.min)&&status(p)!=='End of life').length;
 const alerts=list.filter(p=>status(p)!=='In stock').sort((a,b)=>(STATUS_ORDER[status(a)]??9)-(STATUS_ORDER[status(b)]??9)||safeDiv(num(a.stock),num(a.min))-safeDiv(num(b.stock),num(b.min)));
 return {value,minValue,units,minUnits,uniqueCount:list.length,categories:new Set(list.map(p=>p.category||'Uncategorized')).size,healthy,coverage:safeDiv(units,minUnits),alerts};
}

// Bins by storage location ("A-01-02" → "A-01"); parts without a location land in "Unassigned" at the end.
const binOf=p=>{const l=String(p?.location||'').trim();if(!l)return 'Unassigned';const seg=l.split(/[-/ ]/).filter(Boolean);return seg.length>1?seg.slice(0,2).join('-'):l};
export function locationSeries(parts=[],basis='value'){
 const bins=new Map();
 for(const p of Array.isArray(parts)?parts:[]){const k=binOf(p);if(!bins.has(k))bins.set(k,{l:k,semiconductors:0,passives:0,other:0});const b=bins.get(k);b[groupOf(p.category).toLowerCase()]+=basisOf(p,basis)}
 const out=[...bins.values()].sort((a,b)=>a.l==='Unassigned'?1:b.l==='Unassigned'?-1:a.l.localeCompare(b.l,'en',{numeric:true}));
 if(!out.length)out.push({l:'—',semiconductors:0,passives:0,other:0});
 if(out.length===1)out.push({...out[0]});
 return out;
}
export function cumulativeSeries(parts=[],basis='value'){
 let s=0,pa=0,o=0;
 return locationSeries(parts,basis).map((b,i,arr)=>{if(arr.length===2&&i===1&&arr[0].l===arr[1].l)return {...b,semiconductors:s,passives:pa,other:o};s+=b.semiconductors;pa+=b.passives;o+=b.other;return {l:b.l,semiconductors:s,passives:pa,other:o}});
}
export const totalOf=pt=>num(pt?.semiconductors)+num(pt?.passives)+num(pt?.other);

export function allocation(parts=[],basis='value'){
 const sums={Semiconductors:0,Passives:0,Other:0};
 for(const p of Array.isArray(parts)?parts:[])sums[groupOf(p.category)]+=basisOf(p,basis);
 const total=GROUPS.reduce((s,k)=>s+sums[k],0);
 return {total,rows:GROUPS.map(key=>({key,value:sums[key],share:safeDiv(sums[key],total)}))};
}

export function categoryBars(parts=[],basis='value',limit=5){
 const m=new Map();
 for(const p of Array.isArray(parts)?parts:[]){const k=p.category||'Uncategorized';if(!m.has(k))m.set(k,{name:k,value:0,units:0});const r=m.get(k);r.value+=valueOf(p);r.units+=num(p.stock)}
 const rows=[...m.values()].sort((a,b)=>(basis==='units'?b.units-a.units:b.value-a.value)||a.name.localeCompare(b.name)).slice(0,Math.max(0,limit));
 const total=rows.reduce((s,r)=>s+(basis==='units'?r.units:r.value),0);
 return rows.map(r=>({...r,share:safeDiv(basis==='units'?r.units:r.value,total)}));
}

export function restockGoals(parts=[],status=()=>'In stock',limit=2){
 return (Array.isArray(parts)?parts:[]).filter(p=>num(p.min)>0&&num(p.stock)<num(p.min)&&status(p)!=='End of life')
  .map(p=>({part:p,progress:Math.max(0,Math.min(1,safeDiv(num(p.stock),num(p.min)))),target:num(p.min)}))
  .sort((a,b)=>a.progress-b.progress||String(a.part.mpn).localeCompare(String(b.part.mpn))).slice(0,Math.max(0,limit));
}

export function stockVsMinimum(parts=[],limit=6){
 const m=new Map();
 for(const p of Array.isArray(parts)?parts:[]){const k=p.category||'Uncategorized';if(!m.has(k))m.set(k,{name:k,stock:0,min:0});const r=m.get(k);r.stock+=num(p.stock);r.min+=num(p.min)}
 return [...m.values()].sort((a,b)=>b.stock-a.stock||a.name.localeCompare(b.name)).slice(0,Math.max(0,limit));
}
