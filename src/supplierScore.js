// Turns the flat offer list from /api/compare into one row per seller with five 0..100 scores for
// the radar chart. Higher is always better. Unknown values score low (or neutral for order size)
// so a marketplace listing with no stock data never outranks a distributor that reports it.
export const AXES=[
 {key:'price',label:'Price',hint:'Cheapest unit price scores 100'},
 {key:'stock',label:'Stock',hint:'Log scale against the deepest stock'},
 {key:'delivery',label:'Delivery',hint:'In stock ships now; otherwise shorter lead time is better'},
 {key:'order',label:'Order size',hint:'Smaller minimum order is better'},
 {key:'trust',label:'Trust',hint:'Authorised distributor or marketplace listing'}];

export function groupBySeller(offers=[]){
 const map=new Map();
 for(const o of offers){
  const key=String(o.seller||'Unknown').trim().toLowerCase();
  const g=map.get(key)||{seller:o.seller||'Unknown',sources:new Set(),offers:[],priceUsd:null,price:null,currency:null,stock:null,leadDays:null,moq:null,authorized:false,url:null};
  g.offers.push(o);g.sources.add(o.source);
  if(o.priceUsd!=null&&(g.priceUsd==null||o.priceUsd<g.priceUsd)){g.priceUsd=o.priceUsd;g.price=o.price;g.currency=o.currency;if(o.url)g.url=o.url}
  if(o.stock!=null)g.stock=Math.max(g.stock??0,o.stock);
  if(o.leadDays!=null)g.leadDays=g.leadDays==null?o.leadDays:Math.min(g.leadDays,o.leadDays);
  if(o.moq!=null)g.moq=g.moq==null?o.moq:Math.min(g.moq,o.moq);
  g.authorized=g.authorized||!!o.authorized;if(!g.url&&o.url)g.url=o.url;
  map.set(key,g);
 }
 return [...map.values()].map(g=>({...g,sources:[...g.sources]}));
}

const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
export function scoreSellers(offers=[]){
 const rows=groupBySeller(offers);
 // Price is scored against the cheapest authorised distributor when there is one, so a stray
 // marketplace listing (often a kit or a different variant) cannot halve every real offer.
 const authPrices=rows.filter(r=>r.authorized).map(r=>r.priceUsd).filter(p=>p>0),allPrices=rows.map(r=>r.priceUsd).filter(p=>p>0);
 const prices=authPrices.length?authPrices:allPrices,minPrice=prices.length?Math.min(...prices):null;
 const maxStock=Math.max(0,...rows.map(r=>r.stock??0));
 const scored=rows.map(r=>{
  const s={
   price:r.priceUsd>0&&minPrice?clamp(minPrice/r.priceUsd*100):0,
   stock:r.stock==null||maxStock<=0?0:clamp(Math.log10(1+r.stock)/Math.log10(1+maxStock)*100),
   delivery:r.stock>0?100:r.leadDays!=null?clamp(100-r.leadDays/180*100):0,
   order:r.moq==null?50:r.moq<=1?100:clamp(100-Math.log10(r.moq)*25),
   trust:r.authorized?100:35};
  const overall=clamp(AXES.reduce((t,a)=>t+s[a.key],0)/AXES.length);
  return {...r,scores:s,overall};
 });
 return scored.sort((a,b)=>b.overall-a.overall||(a.priceUsd??Infinity)-(b.priceUsd??Infinity));
}

export function summarise(scored){
 if(!scored.length)return null;
 const best=scored[0];
 const priced=scored.filter(r=>r.priceUsd>0).sort((a,b)=>a.priceUsd-b.priceUsd);
 const stocked=scored.filter(r=>r.stock!=null).sort((a,b)=>b.stock-a.stock);
 return {best,cheapest:priced[0]||null,deepest:stocked[0]||null,authorised:scored.filter(r=>r.authorized).length};
}

// Polygon points for one series on a radar of radius r centred at (cx,cy); axis 0 points up.
export function radarPoints(scores,cx,cy,r){
 return AXES.map((a,i)=>{const ang=-Math.PI/2+i*2*Math.PI/AXES.length,v=(scores[a.key]??0)/100*r;return [cx+Math.cos(ang)*v,cy+Math.sin(ang)*v]});
}
