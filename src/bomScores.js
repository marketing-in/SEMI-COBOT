// BOM line scores, each on a 0–100 scale, from the data the connected suppliers and the inventory
// actually return. Every score is a weighted set of factors with a value between 0 and 1:
//
//   score = 100 × Σ(weight × value) / Σ(weight)   over the factors whose value is known
//
// A score is shown only when at least 60 % of its weight is known; otherwise it is null and the
// table says "Not available". Each factor carries a short explanation for the tooltip.
//
// Resilience — will this part be there when we need it?
//   stock coverage 40   (own stock + authorised market stock) ÷ quantity needed; 10× cover = full marks (log scale)
//   distributors   20   authorised distributors holding stock; three or more = full marks
//   lifecycle      25   active 1 · new 1 · not for new designs 0.4 · last time buy 0.2 · obsolete / end of life 0
//   factory lead   15   8 weeks or less = 1, falling to 0 at 52 weeks
// Quality — how traceable is the source and how complete is the part data?
//   source         40   authorised distributor 1 · own stock 0.75 · excess with CoC 0.6 · excess 0.35 · broker 0.3 · marketplace 0.1
//   condition      15   new 1 · anything else 0.2
//   certificate    15   certificate of conformity offered by the seller 1 · not offered 0 (not known for API offers)
//   datasheet      10   a datasheet link from a supplier 1 · none 0
//   manufacturer   10   manufacturer named 1 · unknown 0
//   compliance     10   RoHS status reported 1 · not reported 0
// Economic — are we paying a good price for this quantity?
//   best price     50   best unit price with enough stock ÷ selected unit price
//   market median  30   median unit price across priced offers ÷ selected unit price (capped at 1)
//   order waste    20   quantity needed ÷ quantity that must be ordered (MOQ and order multiples); 1 from own stock
// Sustainability — compliance and longevity
//   RoHS           35   compliant 1 · exempt 0.6 · not compliant 0
//   REACH          30   unaffected or compliant 1 · affected (SVHC) 0
//   lifecycle      25   active 1 · not for new designs 0.4 · last time buy 0.2 · obsolete 0
//   order waste    10   as above: less surplus ordered, less scrap
import {unitAt,allOffers,orderQty,isAuthorized} from './bom.js';

export const SCORES=[
 ['resilience','Resilience','Will the part be available: stock against the quantity needed, distributors holding it, lifecycle and factory lead time.'],
 ['quality','Quality','How traceable the source is (authorised distributor, own stock, excess, marketplace), condition, certificate of conformity and the part data on record.'],
 ['economic','Economic','Price for this quantity against the best and median market prices, and how much more than needed must be ordered.'],
 ['sustainability','Sustainability','RoHS and REACH status, lifecycle and surplus ordered.'],
];

const combine=factors=>{const total=factors.reduce((a,f)=>a+f.weight,0),known=factors.filter(f=>f.value!=null),kw=known.reduce((a,f)=>a+f.weight,0);
 if(!total||kw/total<.6)return {score:null,factors};return {score:Math.round(100*known.reduce((a,f)=>a+f.weight*Math.max(0,Math.min(1,f.value)),0)/kw),factors}};
const clamp=v=>Math.max(0,Math.min(1,v));

export function lifecycleValue(text){
 const t=String(text||'').toLowerCase();if(!t)return null;
 if(/obsolete|end of life|\beol\b|discontinu/.test(t))return 0;if(/last time buy|ltb/.test(t))return .2;if(/not (recommended )?for new design|nrnd|not recommended/.test(t))return .4;
 if(/active|new product|production|in production/.test(t))return 1;return null;
}
export function rohsValue(text){const t=String(text||'').toLowerCase();if(!t)return null;if(/non|not compliant|no\b/.test(t))return 0;if(/exempt/.test(t))return .6;if(/compliant|rohs3|rohs 3|yes/.test(t))return 1;return null}
export function reachValue(text){const t=String(text||'').toLowerCase();if(!t)return null;if(/affected(?! )|svhc|contains/.test(t)&&!/unaffected/.test(t))return 0;if(/unaffected|compliant|free/.test(t))return 1;return null}
const SOURCE={authorized:1,own:.75,'ems-excess':.35,'oem-excess':.35,broker:.3,marketplace:.1};

// Lifecycle status from the offers, the most cautious reported status first.
export function lifecycleOf(row){
 const all=[row.lifecycle,...allOffers(row).map(o=>o.lifecycle),...allOffers(row).filter(o=>o.discontinued).map(()=>'Discontinued')].filter(Boolean);
 if(!all.length)return null;return all.sort((a,b)=>(lifecycleValue(a)??.5)-(lifecycleValue(b)??.5))[0];
}

export function scoreRow(row,calc){
 const offers=allOffers(row),fetched=!!row.fetchedAt,need=calc.need,remaining=Math.max(0,need-calc.useOwn);
 const life=lifecycleValue(lifecycleOf(row));const comp=offers.map(o=>o.compliance).filter(Boolean);
 const rohs=comp.map(c=>rohsValue(c.rohs)).filter(v=>v!=null),reach=comp.map(c=>reachValue(c.reach)).filter(v=>v!=null);
 const stocked=offers.filter(o=>o.authorized!==false&&o.marketType!=='marketplace'&&o.source!=='serpapi'&&Number.isFinite(o.stock));const authStock=stocked.reduce((a,o)=>a+Math.max(0,o.stock),0);
 const holders=offers.filter(o=>isAuthorized(o)&&o.stock>0).length;
 const leads=offers.map(o=>o.factoryLeadDays).filter(d=>d>0);const lead=leads.length?Math.min(...leads):null;
 const cover=need&&(stocked.length||calc.own>=need)?(calc.own+authStock)/need:null;
 const sel=calc.offer,ownOnly=calc.source==='own';
 const ord=sel?orderQty(sel,calc.buy):calc.need;const waste=need&&(calc.buy>0?ord>0:true)?(calc.buy>0?calc.buy/ord:1):null;
 const priced=offers.map(o=>({o,u:unitAt(o,Math.max(1,remaining||need))})).filter(x=>x.u);
 const enough=priced.filter(x=>Number.isFinite(x.o.stock)&&x.o.stock>=Math.max(1,remaining));
 const selUnit=calc.need?calc.unitCost:null;
 const best=(enough.length?enough:priced).reduce((m,x)=>Math.min(m,x.u.unit),Infinity);
 const units=priced.map(x=>x.u.unit).sort((a,b)=>a-b),median=units.length?units[Math.floor((units.length-1)/2)]:null;
 const srcType=ownOnly?'own':sel?(sel.marketType||(sel.authorized===false?'marketplace':'authorized')):null;
 const srcValue=srcType==='ems-excess'||srcType==='oem-excess'?(sel?.coc?.6:.35):SOURCE[srcType]??null;
 const coc=sel?.coc===true?1:sel?.coc===false?0:null;
 const cond=sel?(sel.condition?(/^new/i.test(sel.condition)?1:.2):null):ownOnly?null:null;
 const pct=v=>v==null?'not known':Math.round(v*100)+'%';
 return {
  resilience:combine([
   {label:'Stock coverage',weight:40,value:cover==null||(!fetched&&calc.own<need)?null:clamp(Math.log10(1+cover)/Math.log10(11)),detail:cover==null?'not known':`${(calc.own+authStock).toLocaleString('en-IN')} available for ${need.toLocaleString('en-IN')} needed`},
   {label:'Distributors with stock',weight:20,value:fetched?clamp(holders/3):null,detail:fetched?`${holders} authorised`:'not known'},
   {label:'Lifecycle',weight:25,value:life,detail:lifecycleOf(row)||'not reported'},
   {label:'Factory lead time',weight:15,value:lead==null?null:clamp(1-(lead-56)/(364-56)),detail:lead==null?'not reported':`${Math.round(lead/7)} weeks`}]),
  quality:combine([
   {label:'Source',weight:40,value:srcValue,detail:srcType?({authorized:'authorised distributor',own:'own stock','ems-excess':'EMS excess','oem-excess':'OEM/ODM excess',broker:'broker',marketplace:'marketplace listing'})[srcType]:'no source yet'},
   {label:'Condition',weight:15,value:cond,detail:sel?.condition||'not stated'},
   {label:'Certificate of conformity',weight:15,value:coc,detail:coc==null?'not stated by the seller':coc?'offered':'not offered'},
   {label:'Datasheet',weight:10,value:fetched?(offers.some(o=>o.datasheet)?1:0):null,detail:offers.some(o=>o.datasheet)?'on record':'none'},
   {label:'Manufacturer',weight:10,value:row.manufacturer||offers.some(o=>o.manufacturer)?1:fetched?0:null,detail:row.manufacturer||offers.find(o=>o.manufacturer)?.manufacturer||'unknown'},
   {label:'Compliance data',weight:10,value:fetched?(rohs.length?1:0):null,detail:rohs.length?'RoHS reported':'not reported'}]),
  economic:combine([
   {label:'Against best price',weight:50,value:selUnit&&Number.isFinite(best)?clamp(best/selUnit):null,detail:Number.isFinite(best)&&selUnit?`best ${pct(best/selUnit)} of selected`:'not known'},
   {label:'Against market median',weight:30,value:selUnit&&median?clamp(median/selUnit):null,detail:median&&selUnit?`median ${pct(median/selUnit)} of selected`:'not known'},
   {label:'Order waste',weight:20,value:sel||ownOnly?waste:null,detail:sel?`${ord.toLocaleString('en-IN')} ordered for ${calc.buy.toLocaleString('en-IN')}`:ownOnly?'no order needed (own stock)':'not known'}]),
  sustainability:combine([
   {label:'RoHS',weight:35,value:rohs.length?Math.min(...rohs):null,detail:comp.find(c=>c.rohs)?.rohs||'not reported'},
   {label:'REACH',weight:30,value:reach.length?Math.min(...reach):null,detail:comp.find(c=>c.reach)?.reach||'not reported'},
   {label:'Lifecycle',weight:25,value:life,detail:lifecycleOf(row)||'not reported'},
   {label:'Order waste',weight:10,value:sel||ownOnly?waste:null,detail:sel?`${ord.toLocaleString('en-IN')} ordered for ${calc.buy.toLocaleString('en-IN')}`:ownOnly?'no order needed (own stock)':'not known'}]),
 };
}
// Tooltip text: what the score means and how this line got it.
export function scoreText(key,s){const meta=SCORES.find(x=>x[0]===key);if(!s||s.score==null)return `${meta[1]}: Not available. ${meta[2]} Too little data was reported for this part.`;
 return `${meta[1]} ${s.score}/100. ${meta[2]} `+s.factors.map(f=>`${f.label}: ${f.value==null?'not known':Math.round(f.value*100)+'/100'} (${f.detail})`).join('; ')+'.'}

// Offer uncertainty, 0–100 (lower is better): how far an offer can be trusted, from the same kind of
// weighted factors as the line scores. certainty = 100 × Σ(weight × value) / Σ(known weights);
// uncertainty = 100 − certainty.
//   source        40   API from an authorised distributor 1 · authorised (entered) 0.9 · marketplace seller
//                      that is an authorised distributor 0.7 · EMS / OEM excess 0.5 · broker 0.35 · marketplace 0.15
//   part match    20   exact part number from a distributor 1 · whole part number in a listing title 0.8 · only a partial match 0.4
//   stock         15   a stock count reported 1 · none 0
//   price check   25   against the median authorised price: 0.5–2× = 1 · over 2× = 0.6 · 0.3–0.5× = 0.4 · under 0.3× = 0
//                      (far below the distributors is the usual sign of counterfeit or wrong-part listings)
const compact=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function offerCertainty(offer,offers=[],qty=1,mpn=''){
 const type=offer.marketType||(offer.authorized===false?'marketplace':'authorized');
 const src=type==='authorized'?(offer.source==='manual'?.9:1):type==='marketplace'?(offer.authorized?.7:.15):type==='broker'?.35:.5;
 let match=null;if(offer.title){const t=String(offer.title).toUpperCase(),m=String(mpn||offer.mpn||'').toUpperCase();match=new RegExp('(^|[^A-Z0-9])'+m.replace(/[^A-Z0-9]/g,c=>'\\'+c)+'($|[^A-Z0-9])').test(t)?.8:compact(t).includes(compact(m))?.4:0}else if(offer.source!=='manual')match=1;
 const ref=offers.filter(o=>o!==offer&&(o.marketType==='authorized'||(!o.marketType&&o.authorized!==false&&o.source!=='serpapi'))).map(o=>unitAt(o,qty)?.unit).filter(v=>v>0).sort((a,b)=>a-b);
 const med=ref.length?ref[Math.floor((ref.length-1)/2)]:null,u=unitAt(offer,qty)?.unit;const r=med&&u?u/med:null;
 const price=r==null?null:r<.3?0:r<.5?.4:r<=2?1:.6;
 const factors=[
  {label:'Source',weight:40,value:src,detail:{authorized:offer.source==='manual'?'authorised (entered)':'authorised distributor',marketplace:offer.authorized?'marketplace listing by an authorised distributor':'marketplace listing, seller not verified','ems-excess':'EMS excess','oem-excess':'OEM/ODM excess',broker:'broker'}[type]||type},
  {label:'Part number match',weight:20,value:match,detail:match==null?'not known':match===1?'exact':match===.8?'whole part number in the title':'partial match only'},
  {label:'Stock reported',weight:15,value:Number.isFinite(offer.stock)?1:0,detail:Number.isFinite(offer.stock)?'yes':'no stock count'},
  {label:'Price check',weight:25,value:price,detail:r==null?'no distributor price to compare':`${Math.round(r*100)}% of the median distributor price`}];
 const known=factors.filter(f=>f.value!=null),kw=known.reduce((a,f)=>a+f.weight,0);
 const certainty=kw?Math.round(100*known.reduce((a,f)=>a+f.weight*f.value,0)/kw):null;
 return {certainty,uncertainty:certainty==null?null:100-certainty,factors,ratio:r};
}
export const uncertaintyBand=u=>u==null?'na':u<=30?'low':u<=60?'medium':'high';
export function uncertaintyText(c){if(!c||c.uncertainty==null)return 'Uncertainty: Not available.';
 return `Uncertainty ${c.uncertainty}/100 (${uncertaintyBand(c.uncertainty)}). How far this offer can be trusted: `+c.factors.map(f=>`${f.label}: ${f.value==null?'not known':Math.round(f.value*100)+'/100'} (${f.detail})`).join('; ')+'.'}
