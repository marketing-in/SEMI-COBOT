import test from 'node:test';
import assert from 'node:assert/strict';
import {unitAt,recommend,rowCost,sourcingAlerts,pcbEstimate,typicalBoard,purchasePlan,rowsFromParts,rowsFromTable,offerKey,marketStock} from '../src/bom.js';
import {formatMoney,formatPlain,convert,toUsd} from '../src/money.js';

const dk={seller:'DigiKey',source:'digikey',stock:2984,authorized:true,priceUsd:.33,breaksUsd:[{qty:1,price:.33},{qty:10,price:.231},{qty:100,price:.17}],url:'d'};
const ms={seller:'Mouser',source:'mouser',stock:39920,authorized:true,priceUsd:.331,breaksUsd:[{qty:1,price:.331},{qty:10,price:.2316},{qty:100,price:.165}],url:'m'};
const shop={seller:'Aion FX',source:'serpapi',stock:null,authorized:false,priceUsd:.1,breaksUsd:[],url:'s'};

test('price breaks: the largest break at or below the quantity, the first break below it',()=>{
 assert.equal(unitAt(dk,1).unit,.33);assert.equal(unitAt(dk,9).unit,.33);assert.equal(unitAt(dk,10).unit,.231);assert.equal(unitAt(dk,5000).unit,.17);
 assert.equal(unitAt({priceUsd:2,moq:50},10).moqShort,true);assert.equal(unitAt({},5),null);
});
test('best purchasing option: cheapest authorised distributor that has the stock, else the most stock',()=>{
 const r=recommend([dk,ms,shop],100);assert.equal(r.offer.seller,'Mouser');assert.equal(r.unit,.165);assert.equal(r.short,false);
 assert.equal(recommend([dk,ms],5000).offer.seller,'Mouser','only Mouser holds 5000');
 const s=recommend([{...dk,stock:40},{...ms,stock:12}],100);assert.equal(s.offer.seller,'DigiKey');assert.equal(s.short,true);assert.match(s.reason,/short of 100/);
 assert.equal(recommend([shop],10).short,true,'a listing with no stock count is never enough');assert.equal(recommend([],1),null);
});
test('a row uses own stock first, buys the rest, and applies its margin',()=>{
 const row={mpn:'LM358P',qty:2,margin:null,source:'auto',offers:[dk,ms],fetchedAt:'x'};
 const c=rowCost(row,{boards:100,inventory:{stock:50,price:.2},defaultMargin:10});
 assert.deepEqual([c.need,c.useOwn,c.buy,c.offer.seller,c.source],[200,50,150,'Mouser','mixed']);
 assert.equal(Math.round(c.lineCost*1e4)/1e4,Math.round((50*.2+150*.165)*1e4)/1e4);assert.equal(Math.round(c.lineSell*1e4),Math.round(c.lineCost*1.1*1e4));
 const own=rowCost({...row,source:'own'},{boards:100,inventory:{stock:50,price:.2}});assert.equal(own.buy,0);assert.equal(own.short,true);
 const forced=rowCost({...row,source:offerKey(dk),margin:25},{boards:100,inventory:{stock:50,price:.2},defaultMargin:10});assert.equal(forced.offer.seller,'DigiKey');assert.equal(forced.useOwn,0);assert.equal(forced.margin,25);assert.equal(forced.unit,.17);
 const none=rowCost({mpn:'X',qty:1,offers:[]},{boards:3});assert.equal(none.missing,true);assert.equal(none.lineCost,0);
});
test('alerts: end of life, out of stock and high demand ask for an alternative',()=>{
 const need={need:100,own:0};
 assert.deepEqual(sourcingAlerts({lifecycle:'Obsolete',offers:[]},need).map(a=>a.kind),['eol']);
 assert.deepEqual(sourcingAlerts({fetchedAt:'x',offers:[{...dk,stock:0}]},need).map(a=>a.kind),['out']);
 assert.deepEqual(sourcingAlerts({fetchedAt:'x',offers:[{...dk,stock:300}]},need).map(a=>a.kind),['demand']);
 assert.deepEqual(sourcingAlerts({fetchedAt:'x',offers:[dk,ms]},need),[]);assert.deepEqual(sourcingAlerts({offers:[]},need),[],'not judged before prices are fetched');
 assert.equal(marketStock([dk,shop]),2984);
});
test('PCB estimate grows with layers and area and spreads tooling over the quantity',()=>{
 const a=pcbEstimate({layers:2,widthMm:100,heightMm:67,qty:100}),b=pcbEstimate({layers:4,widthMm:100,heightMm:67,qty:100}),c=pcbEstimate({layers:4,widthMm:100,heightMm:67,qty:1000});
 assert.ok(b.perBoard>a.perBoard&&c.perBoard<b.perBoard);assert.equal(b.areaCm2,67);assert.equal(pcbEstimate({layers:3}).layers,4,'odd counts round up');
 assert.deepEqual(typicalBoard({signals:{sizeMm:[33,102],layers:[2,4]}}),{widthMm:68,heightMm:48,layers:2});
});
test('purchase plan groups lines by source; rows come from board parts or a BOM table',()=>{
 const rows=rowsFromParts([{ref:'R1',mpn:'RC0603FR-0710KL',package:'0603',type:'resistor'},{ref:'R2',mpn:'rc0603fr-0710kl',package:'0603'},{ref:'C1',value:'100nF',package:'0603',type:'capacitor'},{ref:'X'}]);
 assert.deepEqual(rows.map(r=>[r.mpn,r.qty,r.refs.join(' ')]),[['RC0603FR-0710KL',2,'R1 R2'],['100nF',1,'C1']]);
 const t=rowsFromTable([['Project BOM'],['Item','Manufacturer Part Number','Qty','Designator','Description'],['1','LM358P','2','U1 U2','Dual op amp'],['2','','1','',''],['3','NE555DR','','U3','Timer']]);
 assert.deepEqual(t.map(r=>[r.mpn,r.qty,r.refs.length,r.description]),[['LM358P',2,2,'Dual op amp'],['NE555DR',1,1,'Timer']]);
 const plan=purchasePlan([{mpn:'A'},{mpn:'B'},{mpn:'C'}],[{useOwn:5,ownPrice:1,buy:0},{useOwn:0,buy:10,orderQty:10,offer:{seller:'Mouser'},unit:2},{useOwn:0,buy:3,offer:null}]);
 assert.deepEqual(plan.map(g=>[g.label,g.cost]),[['Mouser',20],['Own stock',5],['No price yet',0]]);
});
test('INR and USD: conversion and formatting (Indian grouping, small unit prices keep their digits)',()=>{
 assert.equal(convert(2,'INR',95),190);assert.equal(toUsd(190,'INR',95),2);assert.equal(convert(2,'USD',95),2);
 assert.equal(formatMoney(1234.5,'INR',100),'₹1,23,450.00');assert.equal(formatMoney(1234.5,'USD',100),'$1,234.50');
 assert.equal(formatMoney(.0046,'USD',95,{unit:true}),'$0.0046');assert.equal(formatPlain(1234.5,'INR',100),'INR 1,23,450.00');assert.equal(formatMoney(NaN),'—');
});
test('the quotation PDF groups pricing and shows enclosure, shipping and scenario totals',async()=>{
 const {quotePdf}=await import('../src/quotePdf.js');
 const blob=await quotePdf({from:{company:'Semi Cobot Pvt Ltd',address:'Plot 4, Peenya\nBengaluru 560058',contact:'sales@example.com'},to:{customer:'Orion Boards',contact:'A. Rao'},number:'Q-20261030-123',date:'30 Oct 2026',validUntil:'14 Nov 2026',
  currency:'INR',inrPerUsd:90,rateSource:'test',scope:'CTRL-01',boards:100,componentLines:1,pcb:{label:'4 layers, 100 x 67 mm',amount:200},enclosure:{label:'ABS plastic',amount:50},ranges:[{days:3,low:300,high:310},{days:9,low:300,high:325}],shipping:{free:false,amount:10,note:'Courier'},
  totals:{componentsSell:40,pcbSell:200,sellingSubtotal:290,shippingCharged:10,customerTotal:300,perBoard:3,componentCost:31,netProfit:77.77},notes:'50% advance'});
 const text=Buffer.from(await blob.arrayBuffer()).toString('latin1');
 assert.ok(text.startsWith('%PDF'));for(const w of ['QUOTATION','Q-20261030-123','Orion Boards','Component package','Bare PCB','Enclosure','Shipping','INR 27,000.00','INR 3,600.00','In 3 days','In 9 days','50% advance'])assert.ok(text.includes(w),w);
 assert.ok(!text.includes('2,790.00')&&!text.includes('6,999.30'),'no internal cost or profit on the quote');
 const free=Buffer.from(await (await quotePdf({from:{company:'A'},to:{customer:'B'},number:'Q-1',date:'d',validUntil:'v',currency:'USD',inrPerUsd:90,scope:'S',boards:1,componentLines:1,pcb:null,shipping:{free:true,amount:0},totals:{componentsSell:5,pcbSell:0,sellingSubtotal:5,shippingCharged:0,customerTotal:5}})).arrayBuffer()).toString('latin1');
 assert.ok(free.includes('Free shipping')&&free.includes('Shipping is free of charge.'));
});

import {sellPrice,quoteTotals,supplierShipping,availability,complianceOf,hsCode,riskOf,bomSummary,cartAdd,cartGroups,cartCsv,orderQty,offerLeadDays,PCB_MATERIALS,allOffers} from '../src/bom.js';
import {scoreRow,scoreText,lifecycleValue,rohsValue,reachValue} from '../src/bomScores.js';
const full={...dk,lifecycle:'Active',factoryLeadDays:140,datasheet:'https://x/ds.pdf',manufacturer:'TI',marketType:'authorized',condition:'New',compliance:{rohs:'ROHS3 Compliant',reach:'REACH Unaffected',hts:'8542.33.0001'}};
const mouserFull={...ms,marketType:'authorized',condition:'New',factoryLeadDays:182,compliance:{rohs:'RoHS Compliant',reach:null,hts:'8542330001'}};

test('markup and margin are different pricing methods',()=>{
 assert.equal(sellPrice(100,20,'markup'),120);assert.equal(sellPrice(100,20,'margin'),125);assert.equal(Math.round(sellPrice(100,99,'margin')),2000,'margin capped at 95 %');
 const row={mpn:'LM358P',qty:1,offers:[dk],fetchedAt:'x'};assert.equal(Math.round(rowCost(row,{boards:100,defaultMargin:20,method:'margin'}).lineSell*100)/100,Math.round(100*.17/.8*100)/100);
});
test('shipping is counted once: supplier shipping per supplier order, delivery once, free shipping comes out of profit',()=>{
 const calcs=[{offer:{seller:'Mouser'},buy:100,orderQty:100,unit:.5,lineCost:50,lineSell:60},{offer:{seller:'Mouser'},buy:10,orderQty:10,unit:1,lineCost:10,lineSell:12},{offer:{seller:'DigiKey'},buy:5,orderQty:5,unit:2,lineCost:10,lineSell:12},{offer:{seller:'EMS Co',shippingUsd:7},buy:1,orderQty:1,unit:1,lineCost:1,lineSell:1.2},{offer:null,buy:0,lineCost:3,lineSell:3.6,useOwn:3}];
 const sh=supplierShipping(calcs,{Mouser:{flat:20,freeAbove:50},DigiKey:{flat:15,freeAbove:''}});
 assert.deepEqual(sh.groups.map(g=>[g.seller,g.charge,g.basis]),[['Mouser',0,'free above the order value'],['DigiKey',15,'flat charge per order'],['EMS Co',7,'quoted on the offer']]);assert.equal(sh.total,22);
 assert.deepEqual(supplierShipping(calcs,{}).unquoted,['Mouser','DigiKey']);
 const t=quoteTotals(calcs,{boards:10,pcb:{on:true,unit:2,margin:25},method:'markup',inbound:sh.total,deliveryCost:30});
 assert.deepEqual([t.componentCost,t.pcbCost,t.pcbSell,t.sellingSubtotal,t.actualShipping,t.shippingCharged,t.customerTotal],[74,20,25,113.8,52,52,165.8]);
 assert.equal(Math.round(t.netProfit*100)/100,Math.round((165.8-74-20-52)*100)/100);assert.equal(Math.round(t.netProfit*100)/100,Math.round((t.sellingSubtotal-74-20)*100)/100,'charging actual shipping leaves the margin as profit');
 const free=quoteTotals(calcs,{boards:10,pcb:{on:true,unit:2,margin:25},inbound:sh.total,deliveryCost:30,freeShipping:true});
 assert.equal(free.shippingCharged,0);assert.equal(free.customerTotal,113.8);assert.equal(Math.round((t.netProfit-free.netProfit)*100)/100,52,'free shipping costs exactly the actual shipping');
 assert.equal(quoteTotals(calcs,{inbound:22,deliveryCost:30,charge:40}).shippingCharged,40,'a set charge replaces pass-through');
 assert.equal(quoteTotals(calcs,{}).pcbCost,0,'no PCB selected');
});
test('PCB materials: aluminium and flex cost more and keep their layer limits',()=>{
 const base={widthMm:100,heightMm:67,qty:100,layers:2};const fr4=pcbEstimate({...base,material:'fr4'}),al=pcbEstimate({...base,material:'aluminium'}),flex=pcbEstimate({...base,material:'polyimide'});
 assert.ok(al.perBoard>fr4.perBoard&&flex.perBoard>al.perBoard);assert.equal(pcbEstimate({...base,layers:6,material:'aluminium'}).layers,2);assert.deepEqual(PCB_MATERIALS.map(m=>m.id),['fr4','fr4-high-tg','aluminium','polyimide']);
});
test('scores: 0–100 from the reported data, and Not available when too little is known',()=>{
 const row={mpn:'LM358P',qty:1,offers:[full,mouserFull],fetchedAt:'x',manufacturer:'TI'};const c=rowCost(row,{boards:100});const s=scoreRow(row,c);
 for(const k of ['resilience','quality','economic','sustainability'])assert.ok(s[k].score>=0&&s[k].score<=100,k);
 assert.ok(s.resilience.score>=80,'big stock, two distributors, active');assert.equal(s.economic.score>=90,true,'cheapest offer chosen');assert.ok(s.sustainability.score>=95);
 const empty=scoreRow({mpn:'X',qty:1,offers:[]},rowCost({mpn:'X',qty:1,offers:[]},{boards:10}));for(const k of ['resilience','quality','economic','sustainability'])assert.equal(empty[k].score,null,k);
 assert.match(scoreText('sustainability',empty.sustainability),/Not available/);assert.match(scoreText('resilience',s.resilience),/^Resilience \d+\/100\. [\s\S]*Stock coverage: \d+\/100/);
 const eol={...row,offers:[{...full,lifecycle:'Obsolete',stock:0,factoryLeadDays:400},{...mouserFull,stock:0}]};const se=scoreRow(eol,rowCost(eol,{boards:100}));assert.ok(se.resilience.score<20,'obsolete with no stock');
 const pricey=rowCost({...row,source:offerKey(full)},{boards:100});assert.ok(scoreRow(row,pricey).economic.score<scoreRow(row,c).economic.score,'a dearer supplier scores lower');
 assert.deepEqual([lifecycleValue('Not For New Designs'),lifecycleValue('Last Time Buy'),rohsValue('ROHS3 Compliant'),rohsValue('Non-Compliant'),reachValue('REACH Unaffected'),reachValue('REACH Affected')],[.4,.2,1,0,1,0]);
});
test('overview data: availability, lead times, compliance with HS code, risk and the BOM summary',()=>{
 const row={mpn:'LM358P',qty:1,offers:[full,mouserFull],fetchedAt:'x'};const c=rowCost(row,{boards:100});
 const a=availability(row,c);assert.deepEqual([a.total,a.distributors,a.minLeadDays,a.factoryLeadDays,a.best.offer.seller],[2984+39920,2,0,140,'Mouser']);
 assert.equal(offerLeadDays({stock:10,factoryLeadDays:70},50),70);assert.equal(orderQty({moq:250,mult:50},120),250);assert.equal(orderQty({moq:1,mult:100},120),200);
 const cp=complianceOf(row,full);assert.deepEqual([cp.rohs,cp.reach,cp.hs,cp.coc],['ROHS3 Compliant','REACH Unaffected','8542.33',null],'no certificate claimed without the seller saying so');assert.equal(complianceOf(row,{coc:true}).coc,'Offered by the seller');assert.equal(hsCode('8542330001'),'8542.33');assert.equal(hsCode(''),null);
 const out={mpn:'Z',qty:1,offers:[{...full,stock:0},{...mouserFull,stock:0}],fetchedAt:'x'};const co=rowCost(out,{boards:10});const r=riskOf(out,co,scoreRow(out,co));assert.equal(r.atRisk,true);assert.equal(r.level,'high');
 const ok=riskOf(row,c,scoreRow(row,c));assert.equal(ok.atRisk,false);
 const sum=bomSummary([row,out,{mpn:'Q',qty:1,offers:[]}],[c,co,rowCost({mpn:'Q',qty:1},{})],[ok,r,{atRisk:false}]);assert.deepEqual([sum.lines,sum.matched,sum.matchedPct,sum.atRisk],[3,2,67,1]);
 assert.equal(allOffers({offers:[1],manualOffers:[2]}).length,2);
});
test('cart: one line per part and supplier, grouped for CSV upload',()=>{
 let cart=cartAdd([],{mpn:'LM358P',seller:'Mouser',qty:100,unit:.165});cart=cartAdd(cart,{mpn:'lm358p',seller:'Mouser',qty:150,unit:.16});cart=cartAdd(cart,{mpn:'NE555DR',seller:'DigiKey',qty:10,unit:.2,ref:'U3'});
 assert.equal(cart.length,2);assert.equal(cart[0].qty,150);const g=cartGroups(cart);assert.deepEqual(g.map(x=>[x.seller,x.items.length,Math.round(x.subtotal*100)/100]),[['Mouser',1,24],['DigiKey',1,2]]);
 assert.equal(cartCsv(g[1].items),'Manufacturer Part Number,Quantity,Customer Reference,Unit Price USD\r\nNE555DR,10,U3,0.2000\r\n');
});
import {offerCertainty,uncertaintyBand} from '../src/bomScores.js';
test('offer uncertainty: distributors are trusted, unverified listings and suspicious prices are not',()=>{
 const shopCheap={seller:'Aion FX',source:'serpapi',marketType:'marketplace',authorized:false,stock:null,priceUsd:.02,breaksUsd:[],title:'LM358P IC'};
 const shopFair={seller:'DigiKey',source:'serpapi',marketType:'marketplace',authorized:true,stock:null,priceUsd:.3,breaksUsd:[],title:'LM358P Texas Instruments'};
 const all=[dk,ms,shopCheap,shopFair];
 const d=offerCertainty({...dk,marketType:'authorized'},all,100,'LM358P'),c=offerCertainty(shopCheap,all,100,'LM358P'),f=offerCertainty(shopFair,all,100,'LM358P');
 assert.ok(d.uncertainty<=5,'distributor with stock and a normal price');assert.ok(c.uncertainty>=70,'unverified seller at a fraction of the market price');assert.ok(f.uncertainty>d.uncertainty&&f.uncertainty<c.uncertainty);
 assert.equal(uncertaintyBand(d.uncertainty),'low');assert.equal(uncertaintyBand(c.uncertainty),'high');
 assert.equal(offerCertainty({...shopCheap,title:'Op amp kit LM358PX'},all,100,'LM358P').factors[1].value,.4,'partial part number match');
});

test('when nobody has enough stock, a distributor beats a cheaper unverified listing',()=>{
 const r=recommend([{...dk,stock:0},{...shop,priceUsd:.01}],100);assert.equal(r.offer.seller,'DigiKey');assert.equal(r.short,true);
});

test('honest pricing: no free own stock, no price for a shortfall, MOQ cost counted, unknown stock is not zero',()=>{
 const row={mpn:'X',qty:1,offers:[{...dk,moq:250,stock:null}],fetchedAt:'x'};
 const c=rowCost(row,{boards:100});assert.equal(c.orderQty,250);assert.equal(c.surplus,150);assert.equal(Math.round(c.lineCost*1e4),Math.round(250*.17*1e4),'MOQ bought at its break');assert.equal(c.stockUnknown,true);assert.equal(c.short,false);
 assert.equal(marketStock(row.offers),null,'stock not reported is not 0');assert.deepEqual(sourcingAlerts(row,c),[],'no out-of-stock claim without a stock count');
 const noPrice=rowCost({mpn:'Y',qty:1,offers:[]},{boards:10,inventory:{stock:50,price:0}});assert.equal(noPrice.missing,true);assert.equal(noPrice.ownCostMissing,true);assert.deepEqual(riskOf({mpn:'Y',offers:[]},noPrice,null).reasons,['No inventory price']);
 const own=rowCost({mpn:'Z',qty:1,source:'own',offers:[dk]},{boards:100,inventory:{stock:40,price:.1}});assert.equal(own.missing,true);assert.equal(own.ownShort,60);
 const gone=rowCost({mpn:'Z',qty:1,source:'own',offers:[dk]},{boards:100,inventory:null});assert.equal(gone.offer.seller,'DigiKey','own stock that left the inventory falls back to the best offer');
 assert.equal(quoteTotals([],{boards:10,pcb:{on:true,unit:null,margin:10}}).pcbUnpriced,true);assert.equal(quoteTotals([],{boards:10,pcb:{on:true,unit:null}}).pcbCost,0,'an unpriced PCB adds nothing');
 assert.notEqual(offerKey({...dk,moq:1}),offerKey({...dk,moq:500}),'two offers from one seller keep separate keys');
 let cart=cartAdd([],{mpn:'A',seller:'S',qty:10,unit:1,breaksUsd:[{qty:1,price:1},{qty:100,price:.5}]});cart=cartAdd(cart,{mpn:'a',seller:'S',qty:95,unit:1,breaksUsd:[{qty:1,price:1},{qty:100,price:.5}]},{sum:true});assert.deepEqual([cart[0].qty,cart[0].unit],[105,.5],'the same part on two lines adds up and reprices');
 assert.match(cartCsv([{mpn:'=HYPERLINK("x")',qty:1,unit:1}]),/\n"'=HYPERLINK\(""x""\)",1/,'formula cells are neutralised');
});

test('price history compares the same order size and applies scenario changes only to purchased quantities',async()=>{
 const {observeOffers,partOutlook,quotationOutlook}=await import('../src/bomPlanning.js');
 const offer={mpn:'TEST',seller:'DigiKey',source:'digikey',authorized:true,stock:300,priceUsd:1};
 const track=(history,day,price,stock,quantity=100)=>observeOffers(history,{mpn:'test',offers:[{...offer,priceUsd:price,stock}],quantity,at:'2026-11-'+day});
 let history=track({},'01',.95,450);
 history=track(history,'02',1,400);
 history=track(history,'02',1,390);
 history=track(history,'03',1.05,300);
 history=track(history,'03',2,300,10);
 const calc={offer,orderQty:100,buy:100,unit:1.05,margin:10,missing:false};
 const o=partOutlook(calc,history.TEST);
 assert.equal(o.samples.length,3);
 assert.equal(o.samples[1].stock,390);
 assert.equal(o.stockChange,-150);
 assert.equal(o.pressure,'High');
 assert.ok(o.trendReady&&o.three.high>1.05&&o.nine.high>=o.three.high);
 const [three,nine]=quotationOutlook([calc],[o],200,'markup');
 assert.equal(three.low,200);
 assert.ok(nine.high>three.high&&three.high>200);
 assert.equal(partOutlook({...calc,orderQty:10},history.TEST).trendReady,false);
});

test('the enclosure has clearance around the PCB and tooling enters the total once',async()=>{
 const {enclosureSize}=await import('../src/bomPlanning.js');
 assert.deepEqual(enclosureSize({clearance:3,wall:2,standoff:5,pcbThickness:1.6,component:15,top:3},{widthMm:100,heightMm:67}).outer,[110,77,28.6]);
 const totals=quoteTotals([{missing:true,lineCost:10,lineSell:15}],{boards:100,enclosure:{on:true,unit:1.25,tooling:50,margin:20}});
 assert.equal(totals.enclosureCost,175);
 assert.equal(totals.customerTotal,210);
 assert.equal(totals.netProfit,35);
 assert.equal(totals.missing,1);
});

test('bare PCB quote form: options follow the material, raise the estimate item by item and print on the quote',async()=>{
 const {pcbEstimate,pcbSpecFor,pcbFieldsFor,pcbSpecText}=await import('../src/bom.js');
 const base={layers:2,widthMm:100,heightMm:67,qty:100};
 const std=pcbEstimate(base);assert.equal(std.perBoard,pcbEstimate({...base,spec:pcbSpecFor({},'fr4',2)}).perBoard,'the standard choices cost nothing extra');
 assert.deepEqual(std.breakdown.map(b=>b.label),['Engineering and tooling','100 boards × 67 cm²']);assert.deepEqual(std.buildDays,[2,3]);
 assert.equal(Math.round((std.total/std.qty)*1e4)/1e4,std.perBoard,'per board = total / quantity');
 const enig=pcbEstimate({...base,spec:{finish:'enig'}}),both=pcbEstimate({...base,spec:{finish:'enig',via:'epoxy',outerCopper:'2oz'}});
 assert.ok(enig.perBoard>std.perBoard&&both.perBoard>enig.perBoard);
 assert.deepEqual(both.breakdown.slice(2).map(b=>b.label),['Surface finish: ENIG','Outer copper weight: 2 oz','Via covering: Epoxy filled & capped']);
 assert.equal(Math.round(both.breakdown.reduce((a,b)=>a+b.amount,0)),Math.round(both.total),'the charge details add up to the total');
 assert.ok(pcbEstimate({...base,spec:{via:'epoxy'}}).buildDays[1]>std.buildDays[1]);assert.ok(pcbEstimate({...base,layers:6,spec:{build:'expedited'}}).buildDays[1]<pcbEstimate({...base,layers:6}).buildDays[1]);
 assert.equal(pcbEstimate({...base,spec:{designs:3}}).setup,std.setup+20,'each extra design adds tooling');
 // What each material allows: aluminium is white or black, flex is thin with coverlay and ENIG.
 const al=pcbSpecFor({color:'green',thickness:'0.4'},'aluminium',2);assert.equal(al.color,'white');assert.equal(al.thickness,'1.6');assert.equal(al.silkscreen,'black','dark legend on a light mask');
 const flex=pcbSpecFor({},'polyimide',2);assert.equal(flex.thickness,'0.11');assert.equal(flex.finish,'enig');assert.ok(!('goldFingers' in flex));
 assert.ok(!('innerCopper' in pcbSpecFor({},'fr4',2))&&'innerCopper' in pcbSpecFor({},'fr4',4),'inner copper only on 4+ layers');
 assert.deepEqual(pcbFieldsFor('aluminium',2).find(f=>f.id==='color').options.map(o=>o.v),['white','black']);
 assert.equal(pcbSpecText({...base,material:'fr4',layers:4,spec:{finish:'enig',goldFingers:'yes',color:'black'}}),
  'FR-4, 4 layers, 100 x 67 mm, 1.6 mm, Black mask, white silkscreen, ENIG, 1 oz outer copper, 0.5 oz inner copper, vias tented, gold fingers');
});
