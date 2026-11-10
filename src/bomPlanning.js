import {isAuthorized,offerKey,orderQty,sellPrice,unitAt} from './bom.js';

const DAY=86_400_000;
export const dayKey=value=>String(value||'').slice(0,10);
export const partKey=mpn=>String(mpn||'').trim().toUpperCase();

export function observeOffers(history,{mpn,offers,quantity,at}){
 const key=partKey(mpn),day=dayKey(at),old=history[key]||[];
 if(!key||!day)return history;
 const seen=new Set();
 const readings=offers.filter(isAuthorized).flatMap(offer=>{
  const source=offerKey(offer),qty=orderQty(offer,Math.max(1,quantity));
  const price=unitAt(offer,qty)?.unit;
  if(price==null||seen.has(source))return [];
  seen.add(source);
  return [{source,qty,price,stock:Number.isFinite(offer.stock)?offer.stock:null,day}];
 });
 if(!readings.length)return history;
 const current=old.filter(item=>!readings.some(r=>r.day===item.day&&r.source===item.source&&r.qty===item.qty));
 const next={...history};
 delete next[key];
 next[key]=[...current,...readings].slice(-36);
 return Object.fromEntries(Object.entries(next).slice(-300));
}

export function partOutlook(calc,history=[],hikes={three:3,nine:9}){
 const {offer,orderQty:qty,buy,unit}=calc;
 const price=buy>0&&unit!=null?unit:null;
 const stock=Number.isFinite(offer?.stock)?Math.max(0,offer.stock):null;
 const coverage=buy>0&&stock!=null?stock/(qty||buy):null;
 const pressure=!buy?'No purchase needed':coverage==null?'Unknown':coverage<1?'Shortage':coverage<5?'High':coverage<15?'Moderate':'Low';
 const samples=offer?history.filter(p=>p.source===offerKey(offer)&&p.qty===qty).sort((a,b)=>a.day.localeCompare(b.day)):[];
 const last=samples.at(-1),first=samples[0];
 const elapsed=last&&first?(Date.parse(last.day)-Date.parse(first.day))/DAY:0;
 const daily=samples.length>=3&&elapsed>=2?Math.log(last.price/first.price)/elapsed:0;
 const stockChange=last?.stock!=null&&first?.stock!=null&&elapsed>0?last.stock-first.stock:null;
 const factor=({Shortage:1.5,High:1,Moderate:.75,Low:.5})[pressure]??1;
 const estimate=(days,hike)=>{
  if(price==null)return null;
  const trend=Math.max(-.3,Math.min(.3,Math.expm1(daily*days)));
  const uplift=Math.max(0,Math.min(100,Number(hike)||0))/100*factor;
  return {low:price*(1+Math.min(0,trend)),high:price*(1+Math.max(0,trend)+uplift)};
 };
 return {price,stock,coverage,pressure,samples,stockChange,trendReady:samples.length>=3&&elapsed>=2,
  three:estimate(3,hikes.three),nine:estimate(9,hikes.nine)};
}

export function quotationOutlook(calcs,outlooks,customerTotal,method){
 return ['three','nine'].map((key,i)=>{
  const range=calcs.reduce((total,calc,index)=>{
   const scenario=outlooks[index][key];
   if(!scenario||calc.missing)return total;
   return {
    low:total.low+sellPrice((scenario.low-calc.unit)*calc.orderQty,calc.margin,method),
    high:total.high+sellPrice((scenario.high-calc.unit)*calc.orderQty,calc.margin,method)
   };
  },{low:customerTotal,high:customerTotal});
  return {days:i===0?3:9,...range};
 });
}

export function enclosureSize(box,board){
 const positive=v=>Math.max(0,Number(v)||0);
 const margin=positive(box.clearance),wall=positive(box.wall);
 const boardWidth=positive(board.widthMm),boardDepth=positive(board.heightMm);
 const standoff=positive(box.standoff),component=positive(box.component),top=positive(box.top);
 const inner=[boardWidth+2*margin,boardDepth+2*margin,standoff+positive(box.pcbThickness)+component+top];
 return {boardWidth,boardDepth,standoff,component,inner,outer:inner.map(n=>n+2*wall)};
}
