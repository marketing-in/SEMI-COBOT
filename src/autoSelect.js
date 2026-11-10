// Automatic part selection for parts the files did not name. Gemini proposes a part number and
// alternates from the footprint; each candidate is checked (the part master first, then the connected
// distributors) and the first one that exists exactly is selected, so nobody has to test and pick.
// Passives without a value in the files get a part number too, so suppliers can be checked at once,
// but it is marked: the resistance, capacitance or inductance is Gemini's assumption, not the files'.

const compact=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const PASSIVE=new Set(['resistor','capacitor','inductor']);
export function needsValue(part){
 const t=part?.type&&part.type!=='other'?part.type:/^(R|RN)\d/i.test(part?.ref||'')?'resistor':/^C\d/i.test(part?.ref||'')?'capacitor':/^(L|FB)\d/i.test(part?.ref||'')?'inductor':'';
 return PASSIVE.has(t)&&!String(part?.value||'').trim();
}
export function candidatesOf(s,max=4){
 const out=[],seen=new Set();for(const m of [s?.mpn,...(Array.isArray(s?.alternates)?s.alternates:[])]){const k=compact(m);if(k.length>=3&&!seen.has(k)){seen.add(k);out.push(String(m).trim())}}
 return out.slice(0,max);
}

// lookup(mpn) → {checked:boolean, found:boolean, by, seller, stock, manufacturer, description}
export async function selectPart(s,part,{lookup}){
 const base={...s,suggested:s?.mpn||'',selected:false};
 const cands=candidatesOf(s);if(!cands.length)return {...base,reason:'Gemini gave no part number for this footprint.'};
 const assumed=needsValue(part)?{valueAssumed:true}:{};let checkedAny=false;
 for(const c of cands){const r=await lookup(c).catch(()=>({checked:false,found:false}));if(r.checked)checkedAny=true;
  if(r.found)return {...base,...assumed,mpn:c,selected:true,checked:true,verifiedBy:r.by,verifiedSeller:r.seller||'',verifiedStock:Number.isFinite(r.stock)?r.stock:null,
   manufacturer:r.manufacturer||s.manufacturer||'',description:r.description||s.description||'',alternate:compact(c)!==compact(s.mpn),reason:`Found at ${r.by}${r.seller&&r.seller!==r.by?' ('+r.seller+')':''}.`}}
 if(!checkedAny)return {...base,...assumed,checked:false,reason:'No distributor is connected and the part master does not list it, so it could not be checked.'};
 return {...base,mpn:'',checked:true,notFound:true,reason:`None of ${cands.join(', ')} is listed by a connected distributor or the part master, so none is used.`};
}

// Whether a stored Gemini entry's part number should name the part.
export const usesAiMpn=ai=>!!ai?.mpn&&(ai.selected===true||(ai.selected===undefined&&ai.confidence>=.5)||(ai.checked===false&&ai.confidence>=.6));
