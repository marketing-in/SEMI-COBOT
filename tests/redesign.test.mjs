import test from 'node:test';
import assert from 'node:assert/strict';

// A small localStorage for the browser-side stores.
const mem=new Map();
globalThis.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),clear:()=>mem.clear()};

const {VENDOR_KINDS,VENDORS,vendorsOf,addVendor,removeVendor,setVendorNote,loadVendorData,saveVendorData,pickerList}=await import('../src/vendors.js');
const {mouldEstimate,mouldedUnitCost,makerFit,TOOL_CLASSES}=await import('../src/mould.js');
const lists=await import('../src/savedLists.js');
const {filterSerp,serpIdentity,serpPack,compareSuppliers}=await import('../api.mjs');

test('the vendor registry covers every kind, with unique ids and https links',()=>{
 assert.deepEqual(VENDOR_KINDS.map(k=>k.id),['semiconductor','distributor','passive','pcb','enclosure','mould','testlab','logistics']);
 for(const k of VENDOR_KINDS)assert.ok(VENDORS.some(v=>v.kind===k.id),k.id+' has vendors');
 assert.equal(new Set(VENDORS.map(v=>v.id)).size,VENDORS.length);assert.ok(VENDORS.every(v=>/^https:\/\//.test(v.url)));
 assert.deepEqual(VENDORS.filter(v=>v.api).map(v=>v.api).sort(),['digikey','master','mouser','nexar','tme'],'channel A distributors carry their API id');
});

test('vendors added and described by the user appear in the BOM tool pickers',()=>{
 mem.clear();let d=loadVendorData();
 d=addVendor(d,{kind:'mould',name:'  Pune Tool Room ',url:'javascript:alert(1)',about:'Local moulder'});
 assert.equal(d.custom.length,1);assert.equal(d.custom[0].name,'Pune Tool Room');assert.equal(d.custom[0].url,'','only http(s) links are kept');
 assert.equal(addVendor(d,{kind:'nope',name:'X'}),d,'unknown kinds are refused');
 const id=d.custom[0].id;d=setVendorNote(d,id,{materials:'ABS, PC',maxPart:'300 x 200 x 100'});assert.ok(saveVendorData(d));
 const mine=vendorsOf('mould').find(v=>v.id===id);assert.equal(mine.materials,'ABS, PC');
 assert.ok(pickerList('mould').some(([name])=>name==='Pune Tool Room'));
 d=removeVendor(d,id);assert.equal(d.custom.length,0);assert.equal(d.notes[id],undefined);
});

test('the mould estimate follows the enclosure geometry and the run length',()=>{
 const est=mouldEstimate({outer:[110,80,40],wall:2,material:'ABS plastic',cavities:1,qty:1000});
 // Base (26.67 mm high) and lid (13.33 mm high), open boxes with 2 mm walls.
 const shell=(w,d,h)=>w*d*h-(w-4)*(d-4)*(h-2);const vol=shell(110,80,40*2/3)+shell(110,80,40/3);
 assert.ok(Math.abs(est.unitG-vol/1000*1.04)<1e-9);assert.equal(est.shotG,est.unitG);
 assert.ok(est.cooling>5&&est.cooling<15,'2 mm ABS cools in seconds');assert.equal(est.suggested,'aluminium');assert.ok(est.lifeOk);
 const big=mouldEstimate({outer:[110,80,40],wall:2,material:'ABS plastic',cavities:2,qty:2e6});
 assert.equal(big.shots,1e6);assert.equal(big.suggested,'h13');assert.equal(big.shotG,big.unitG*2);
 assert.equal(mouldEstimate({outer:[110,80,40],wall:2,material:'ABS plastic',qty:2e6,toolClass:'aluminium'}).lifeOk,false,'a short-life tool is flagged');
 assert.equal(mouldEstimate({outer:[0,80,40],wall:2,material:'ABS plastic'}),null);assert.equal(mouldEstimate({outer:[1,1,1],wall:2,material:'Steel'}),null);
 assert.equal(TOOL_CLASSES.length,3);
});

test('moulded cost appears only from the user\'s own rates, and maker fit only from recorded capabilities',()=>{
 const est=mouldEstimate({outer:[110,80,40],wall:2,material:'ABS plastic',qty:1000});
 assert.equal(mouldedUnitCost(est,{resinPerKg:2}),null);
 const c=mouldedUnitCost(est,{resinPerKg:2,machinePerHour:30});assert.ok(Math.abs(c.material-est.unitG/1000*2*1.05)<1e-12);assert.ok(Math.abs(c.machine-30/est.unitsPerHour)<1e-12);
 assert.deepEqual(makerFit({},{material:'ABS plastic',outer:[110,80,40]}),{confirmed:false,ok:false,notes:[]});
 const fit=makerFit({materials:'ABS, PC',maxPart:'400 × 300 × 150'},{material:'ABS plastic',outer:[110,80,40]});assert.equal(fit.ok,true);
 assert.equal(makerFit({materials:'PA66'},{material:'Polycarbonate',outer:[1,1,1]}).ok,false);
 assert.equal(makerFit({maxPart:'100 x 50 x 20'},{material:'Nylon',outer:[110,80,40]}).notes[0],'part larger than its limit');
});

test('saved lists keep the whole BOM, revise in place, duplicate and reopen in the BOM tool',()=>{
 mem.clear();
 const state={project:'Gateway GW-1',customer:'Orion',boards:250,rows:[{id:'a',mpn:'LM358P',qty:2}],pcb:{material:'fr4'},box:{material:'ABS plastic',kind:'custom'},demo:true};
 const r1=lists.saveList(state,{customerTotal:1234.5},{now:'2026-11-10T10:00:00Z'});
 assert.equal(r1.entry.name,'Gateway GW-1');assert.equal(r1.entry.enclosure,'custom moulded');assert.equal(r1.entry.total,1234.5);assert.equal(r1.entry.revision,1);assert.equal(r1.entry.state.demo,undefined);
 const r2=lists.saveList({...state,listId:r1.entry.id,boards:300},{customerTotal:1400},{status:'ordered',jobId:'job-x'});
 assert.equal(r2.lists.length,1,'same list updated');assert.equal(r2.entry.revision,2);assert.equal(r2.entry.boards,300);assert.equal(r2.entry.jobId,'job-x');assert.equal(r2.entry.createdAt,'2026-11-10T10:00:00Z');
 const dup=lists.duplicateList(r1.entry.id);assert.equal(dup.length,2);assert.equal(dup[0].status,'draft');assert.equal(dup[0].jobId,null);assert.notEqual(dup[0].id,r1.entry.id);
 assert.ok(lists.openList(dup[0].id));const open=JSON.parse(localStorage.getItem(lists.BOM_STORE));assert.equal(open.listId,dup[0].id);assert.equal(open.rows[0].mpn,'LM358P');
 assert.equal(lists.setListStatus(r1.entry.id,'archived').find(l=>l.id===r1.entry.id).status,'archived');
 assert.equal(lists.removeList(r1.entry.id).length,1);assert.equal(lists.openList('missing'),false);
});

test('open-market listings are restricted to the exact product, not by price',()=>{
 assert.ok(serpIdentity('LM358P Dual Op Amp DIP-8','LM358P'));assert.ok(serpIdentity('irf-540n mosfet','IRF540N'));
 assert.ok(!serpIdentity('LM358PWR TSSOP','LM358P'),'a longer part number is a different product');assert.ok(!serpIdentity('XLM358P','LM358P'));assert.ok(!serpIdentity('anything','AB'),'too short to match safely');
 assert.equal(serpPack('NE555 timer 10 pcs'),10);assert.equal(serpPack('Pack of 25 LM7805'),25);assert.equal(serpPack('LM7805 regulator'),1);
 const r=filterSerp({shopping_results:[
  {title:'LM358P op amp',source:'Shop A',extracted_price:1},{title:'LM358P op amp DIP-8',source:'Shop A',extracted_price:.8},
  {title:'LM358P module kit for Arduino',source:'Shop B',extracted_price:3},{title:'Replacement for LM358P',source:'Shop C',extracted_price:1},
  {title:'LM358P 10 pcs',source:'Shop D',extracted_price:4},{title:'LM358PW',source:'Shop E',extracted_price:1}]},'LM358P');
 assert.deepEqual(r.offers.map(o=>[o.seller,o.price]),[['Shop A',.8],['Shop D',.4]]);assert.deepEqual(r.hidden,{identity:1,type:2,seller:1});
 assert.ok(r.offers.every(o=>o.trust==='unverified'&&o.marketType==='marketplace'));assert.equal(r.offers[1].moq,10);
 // Prices are not restricted: an exact listing far below the distributors stays, marked unverified.
 const cheap=filterSerp({shopping_results:[{title:'LM358P op amp',source:'Far Shop',extracted_price:.01}]},'LM358P');assert.equal(cheap.offers[0].price,.01);assert.equal(cheap.hidden.identity+cheap.hidden.type+cheap.hidden.seller,0);
});

test('vendor register: products a vendor lists become offers on matching BOM lines',async()=>{
 mem.clear();const {addProduct,removeProduct,productsOf,vendorOffersFor}=await import('../src/vendors.js');const {allOffers,marketLabel,isAuthorized}=await import('../src/bom.js');
 let d=addVendor(loadVendorData(),{kind:'distributor',name:'Chennai Components',url:'https://example.com'});const id=d.custom[0].id;
 d=addProduct(d,id,{mpn:'SS14',manufacturer:'onsemi',stock:'4000',price:'3.5',currency:'INR',moq:'100',leadDays:'3'},'2026-11-10T00:00:00Z');
 d=addProduct(d,id,{mpn:'ss-14',stock:'5000',price:'3',currency:'INR'});assert.equal(productsOf(d,id).length,1,'the same part number is updated, not duplicated');assert.equal(productsOf(d,id)[0].stock,5000);
 assert.equal(addProduct(d,id,{mpn:'  '}),d,'a part number is needed');
 const offers=vendorOffersFor('SS14',d,100);assert.equal(offers.length,1);
 assert.deepEqual({seller:offers[0].seller,priceUsd:offers[0].priceUsd,stock:offers[0].stock,marketType:offers[0].marketType},{seller:'Chennai Components',priceUsd:.03,stock:5000,marketType:'registered'});
 assert.equal(marketLabel('registered'),'Registered vendor');assert.equal(isAuthorized(offers[0]),false,'a registered vendor is not an authorised distributor');
 assert.equal(allOffers({offers:[{seller:'DigiKey'}],vendorOffers:offers}).length,2);assert.deepEqual(vendorOffersFor('SS16',d),[]);
 d=removeProduct(d,productsOf(d,id)[0].id);assert.equal(productsOf(d,id).length,0);
 d=addProduct(d,id,{mpn:'LM358P'});assert.equal(removeVendor(d,id).products.length,0,'removing a vendor removes its products');
});

test('one-click quotation request: the supplier email from the Vendors page and a written-out mail',async()=>{
 mem.clear();const {emailOf,vendorEmail,rfqMail}=await import('../src/rfq.js');
 assert.equal(emailOf('Ravi, ravi.k@chennai-comp.in, +91 98400'),'ravi.k@chennai-comp.in');assert.equal(emailOf('no mail'),'');
 let d=loadVendorData();d=setVendorNote(d,'distributor:digikey',{email:'quotes@example.com'});saveVendorData(d);
 assert.equal(vendorEmail('DigiKey'),'quotes@example.com');assert.equal(vendorEmail('Digi-Key'),'quotes@example.com','spelling of the seller name does not matter');
 d=addVendor(d,{kind:'distributor',name:'Chennai Components'});d=setVendorNote(d,d.custom[0].id,{contact:'Ravi, ravi.k@chennai-comp.in'});saveVendorData(d);
 assert.equal(vendorEmail('Chennai Components'),'ravi.k@chennai-comp.in','an address in the contact field is used');assert.equal(vendorEmail('Mouser'),'');
 const m=rfqMail({seller:'DigiKey',to:'quotes@example.com',lines:[{mpn:'1N4148W',manufacturer:'Diodes Inc',qty:1500,refs:['D1','D2']},{mpn:'SS14',qty:200}],project:'Gateway GW-1',due:'2026-12-15',boards:250,from:{company:'Semi Cobot Pvt Ltd',contact:'Asha',address:'Chennai'},date:new Date('2026-11-10T00:00:00Z')});
 assert.equal(m.subject,'Request for quotation – Gateway GW-1 – 2 parts');
 assert.match(m.body,/^Dear DigiKey team,\n\nPlease quote the parts below, for delivery by 2026-12-15\./);assert.match(m.body,/Project: Gateway GW-1 \(250 boards\)/);
 assert.match(m.body,/1\. 1N4148W \(Diodes Inc\) – quantity 1,500 – ref D1 D2\n2\. SS14 – quantity 200/);assert.match(m.body,/Asha\nSemi Cobot Pvt Ltd\nChennai\nSent 2026-11-10$/);
 assert.ok(m.href.startsWith('mailto:quotes%40example.com?subject=Request%20for%20quotation'));
 const many=rfqMail({seller:'Mouser',lines:Array.from({length:120},(_,i)=>({mpn:'PART-NUMBER-'+i,qty:1000}))});
 assert.ok(many.href.length<=1800,'kept short enough for mail programs');assert.match(many.body,/… and \d+ more parts \(list to follow\)\./);assert.ok(many.href.startsWith('mailto:?subject='),'no address known: the mail opens without one');
});
