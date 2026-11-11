import test from 'node:test';
import assert from 'node:assert/strict';
import {diffParts,applyParts,diffLedger,applyLedger,ledgerDiffEmpty,joinChanges,createCloudSync,moveId,BASE_STORE} from '../src/cloudSync.js';
import {handleApi} from '../api.mjs';
import {inventoryBackend,inventoryPayload,partToRow,rowToPart,moveId as serverMoveId} from '../hosted.mjs';
import {LEDGER_STORE} from '../src/ledger.js';

const part=(id,mpn,stock,extra={})=>({id,mpn,manufacturer:'TI',category:'IC',description:'',package:'SOIC-8',stock,min:0,price:.5,lifecycle:'Active',location:'A1',source:'',supplier:'',specs:{},...extra});

test('part changes: stock goes as a change, fields only when they changed, removals as deletes',()=>{
 const base=[part('a','LM358',100),part('b','NE555',5),part('c','SS14',1)];
 const next=[part('a','LM358',130),part('b','NE555',5,{location:'B2'}),part('d','BSS138',40)];
 const fields=({stock,...r})=>r;
 assert.deepEqual(diffParts(base,next),[
  {id:'a',delta:30},
  {id:'b',part:fields(next[1]),delta:0},
  {id:'d',part:fields(next[2]),delta:40},
  {id:'c',op:'delete'}]);
 assert.deepEqual(diffParts(base,base),[]);
});

test('laying changes on the shared stock adds them to what others did',()=>{
 // Someone else took the shared stock to 90 while this browser received +30.
 const shared=[part('a','LM358',90)];
 const out=applyParts(shared,[{id:'a',delta:30},{id:'x',part:(({stock,...r})=>r)(part('x','lm358',0)),delta:5},{id:'n',part:(({stock,...r})=>r)(part('n','NE555',0)),delta:7}]);
 assert.equal(out.find(p=>p.mpn==='LM358').stock,125,'+30 and the same part number under another id (+5) both land on the shared row');
 assert.equal(out.find(p=>p.mpn==='NE555').stock,7);
 assert.equal(applyParts([part('a','LM358',3)],[{id:'a',delta:-10}])[0].stock,0,'never below zero');
});

test('ledger changes: new and changed orders, cancels, new moves, consumed counts',()=>{
 const o=(id,status='ordered')=>({id,status,orderedAt:'2026-11-11T09:00:00Z',lines:[],totalUsd:1});
 const base={orders:[o('PO-1'),o('PO-2')],moves:[{at:'2026-11-11T09:00:00Z',type:'in',mpn:'A',qty:1,ref:'PO-0'}],consumed:{j1:2}};
 const next={orders:[o('PO-1','received'),o('PO-3')],moves:[{at:'2026-11-12T09:00:00Z',type:'out',mpn:'A',qty:1,ref:'j1'},...base.moves],consumed:{j1:3}};
 const d=diffLedger(base,next);
 assert.deepEqual(d.orders.map(x=>x.id),['PO-1','PO-3']);assert.deepEqual(d.removed,['PO-2']);assert.equal(d.moves.length,1);assert.deepEqual(d.consumed,{j1:3});
 assert.ok(ledgerDiffEmpty(diffLedger(next,next)));
 const shared={orders:[o('PO-1','received'),o('PO-9')],moves:[],consumed:{j1:5}};
 const after=applyLedger(shared,{orders:[o('PO-1','ordered')],removed:['PO-9'],moves:d.moves,consumed:{j1:3}});
 assert.equal(after.orders.find(x=>x.id==='PO-1').status,'received','a received order does not go back');
 assert.ok(!after.orders.some(x=>x.id==='PO-9'),'a waiting order can be cancelled');
 assert.equal(after.consumed.j1,5,'consumed only goes up');
 assert.equal(moveId(d.moves[0]),serverMoveId(d.moves[0]),'browser and server name a stock move the same way');
});

test('joining: only part numbers, orders and moves the shared stock does not have are added',()=>{
 const local={parts:[part('l1','LM358',999),part('l2','NE555',4)],ledger:{orders:[{id:'PO-A'},{id:'PO-B'}],moves:[],consumed:{j:2}}};
 const cloud={parts:[part('c1','lm358',10)],ledger:{orders:[{id:'PO-A'}],moves:[],consumed:{j:5}}};
 const j=joinChanges(local,cloud);
 assert.deepEqual(j.parts.map(c=>[c.id,c.delta]),[['l2',4]],'LM358 is already shared: the shared count wins, nothing is doubled');
 assert.deepEqual(j.ledger.orders.map(o=>o.id),['PO-B']);assert.deepEqual(j.ledger.removed,[]);assert.deepEqual(j.ledger.consumed,{});
});

test('server mapping keeps every inventory field and moves unknown ones to extra',()=>{
 const p=part('a','LM358',12,{required:3,refs:'U1 U2',specs:{Pins:'8'}});
 const row=partToRow(p);
 assert.equal(row.min_stock,0);assert.equal(row.price_usd,.5);assert.deepEqual(row.extra,{required:3,refs:'U1 U2'});assert.ok(!('stock' in row),'stock never goes as a total');
 assert.deepEqual(rowToPart({...row,id:'a',stock:12}),p);
 const pay=inventoryPayload({parts:[{id:'a',part:p,delta:2},{id:'b',op:'delete'},{id:'',delta:1},{id:'z',part:{mpn:''},delta:1}],ledger:{orders:[{id:'PO-1',status:'odd',totalUsd:-5}],removed:['PO-2',7],moves:[{mpn:'A',qty:-3,type:'x'}],consumed:{j:-1}}});
 assert.equal(pay.parts.length,2,'rows without an id or a part number are dropped');
 assert.equal(pay.orders[0].status,'ordered');assert.equal(pay.orders[0].total_usd,0);assert.deepEqual(pay.removed,['PO-2']);
 assert.equal(pay.moves[0].qty,0);assert.equal(pay.moves[0].type,'in');assert.equal(pay.consumed.j,0);
});

test('/api/inventory: off without a database, method rules, and requests to Supabase',async()=>{
 const off=await handleApi(new Request('http://x/api/inventory'));assert.deepEqual(await off.json(),{enabled:false});
 assert.equal((await handleApi(new Request('http://x/api/inventory',{method:'DELETE'}))).status,405);
 const calls=[];
 const fetcher=async(url,init={})=>{calls.push({url:String(url),init});const u=String(url);
  const body=u.includes('/rpc/')?'':u.includes('inventory_parts')?JSON.stringify([{id:'a',mpn:'LM358',manufacturer:'TI',category:'',description:'',package:'',location:'',lifecycle:'',supplier:'',source:'',stock:7,min_stock:1,price_usd:'0.25',specs:{},extra:{}}]):'[]';
  return new Response(body,{status:200})};
 const inv=inventoryBackend({url:'https://abcd1234.supabase.co',key:'sb_secret_test'},fetcher);
 const r=await handleApi(new Request('http://x/api/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts:[{id:'a',delta:5}],ledger:{moves:[{at:'2026-11-11T00:00:00Z',type:'in',mpn:'LM358',qty:5,ref:'PO-1'}]}})}),{},fetch,null,null,inv);
 const data=await r.json();
 assert.equal(r.status,200);assert.equal(data.enabled,true);assert.equal(data.project,'abcd1234');assert.deepEqual(data.parts[0].price,.25);
 const rpc=calls.filter(c=>c.url.includes('/rpc/'));
 assert.deepEqual(rpc.map(c=>c.url.split('/rpc/')[1]),['inventory_apply','ledger_apply']);
 assert.deepEqual(JSON.parse(rpc[0].init.body),{changes:[{id:'a',delta:5}],who:'local'});
 assert.equal(rpc[0].init.headers.apikey,'sb_secret_test');assert.ok(!rpc[0].init.headers.Authorization,'new sb_secret_ keys go in apikey only');
 assert.ok(calls.some(c=>/inventory_parts\?select=\*&order=mpn\.asc&limit=1000&offset=0/.test(c.url)),'parts are read in pages of 1000');
 const missing=inventoryBackend({url:'https://abcd1234.supabase.co',key:'sb_secret_test'},async()=>new Response(JSON.stringify({code:'PGRST205',message:'no table'}),{status:404}));
 const m=await handleApi(new Request('http://x/api/inventory'),{},fetch,null,null,missing);
 assert.equal(m.status,503);assert.match((await m.json()).error,/schema\.sql/);
});

// A shared stock in memory with the database's rules, so two browsers can be run against it.
function fakeServer(){
 let parts=[],ledger={orders:[],moves:[],consumed:{}},down=false;
 const fetcher=async(url,init={})=>{if(down)return new Response(JSON.stringify({error:'down'}),{status:503});
  if(init.method==='POST'){const b=JSON.parse(init.body);parts=applyParts(parts,b.parts);ledger=applyLedger(ledger,b.ledger)}
  return new Response(JSON.stringify({enabled:true,project:'p1',parts,ledger,at:'now'}),{status:200})};
 return {fetcher,get parts(){return parts},get ledger(){return ledger},set down(v){down=v}};
}
function browser(server,startParts=[]){
 const mem=new Map(),storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
 globalThis.localStorage=storage;
 const b={parts:startParts,storage,statuses:[]};
 b.sync=createCloudSync({getParts:()=>b.parts,setParts:p=>{b.parts=p},onStatus:s=>b.statuses.push(s.mode),fetcher:server.fetcher,storage,delay:0});
 return b;
}
const use=b=>{globalThis.localStorage=b.storage};

test('two browsers share one stock: joins, receipts and use from both count',async()=>{
 const server=fakeServer();
 const a=browser(server,[part('a1','LM358',100)]);use(a);await a.sync.sync();
 assert.equal(server.parts.length,1);assert.equal(a.statuses.at(-1),'synced');
 const b=browser(server,[part('b1','lm358',50),part('b2','NE555',8)]);use(b);await b.sync.sync();
 assert.deepEqual(server.parts.map(p=>[p.mpn,p.stock]),[['LM358',100],['NE555',8]],'B joined: its LM358 count does not double the shared one');
 assert.equal(b.parts.find(p=>p.mpn==='LM358').stock,100,'B now shows the shared stock');
 // A receives +600, B uses 18 at the same time.
 use(a);a.parts=a.parts.map(p=>({...p,stock:p.stock+600}));
 use(b);b.parts=b.parts.map(p=>p.mpn==='LM358'?{...p,stock:p.stock-18}:p);
 use(a);await a.sync.sync();use(b);await b.sync.sync();use(a);await a.sync.sync();
 assert.equal(server.parts.find(p=>p.mpn==='LM358').stock,682);
 assert.equal(a.parts.find(p=>p.mpn==='LM358').stock,682);assert.equal(b.parts.find(p=>p.mpn==='LM358').stock,682);
 // A purchase order placed in A shows in B; B received it.
 use(a);a.storage.setItem(LEDGER_STORE,JSON.stringify({orders:[{id:'PO-1',status:'ordered',orderedAt:'2026-11-11T09:00:00Z',lines:[]}],moves:[],consumed:{}}));await a.sync.sync();
 use(b);await b.sync.sync();assert.equal(JSON.parse(b.storage.getItem(LEDGER_STORE)).orders[0].id,'PO-1');
 // Offline: the change waits on the device and goes the next time.
 server.down=true;use(b);b.parts=b.parts.map(p=>p.mpn==='NE555'?{...p,stock:p.stock+2}:p);await b.sync.sync();
 assert.equal(b.statuses.at(-1),'offline');assert.equal(server.parts.find(p=>p.mpn==='NE555').stock,8);
 server.down=false;await b.sync.sync();assert.equal(server.parts.find(p=>p.mpn==='NE555').stock,10);
 assert.ok(JSON.parse(b.storage.getItem(BASE_STORE)).parts.length===2,'the base survives a reload');
});

test('without a database the inventory stays in the browser',async()=>{
 const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)};globalThis.localStorage=storage;
 let parts=[part('a','LM358',3)],last='';
 const c=createCloudSync({getParts:()=>parts,setParts:p=>{parts=p},onStatus:s=>{last=s.mode},fetcher:async()=>new Response('{"enabled":false}'),storage});
 await c.sync();assert.equal(last,'local');assert.equal(parts[0].stock,3);assert.equal(storage.getItem(BASE_STORE),null);
});

// Part master in Supabase.
import {readFileSync} from 'node:fs';
import {catalogueRows,rowsToCatalogue} from '../hosted.mjs';
import {buildIndex,loadPartMaster} from '../src/partMaster.js';
import {diffDetails,applyDetails,detailsDiffEmpty} from '../src/cloudSync.js';

test('the part master catalogue survives the table round trip exactly',()=>{
 const json=JSON.parse(readFileSync(new URL('../public/data/part-master.json',import.meta.url),'utf8'));
 const rows=catalogueRows(json);
 assert.equal(rows.length,json.semiconductors.length+json.resistors.length);
 assert.ok(rows.every(r=>r.mpn&&(r.kind==='semiconductor'||r.kind==='resistor')));
 assert.equal(new Set(rows.map(r=>r.kind+'|'+r.mpn)).size,rows.length,'kind + part number is unique, so uploading twice updates instead of doubling');
 const res=rows.find(r=>r.kind==='resistor');assert.equal(typeof res.ohms,'number');assert.equal(res.sub_type,json.resistors[0][0]);
 // Rows come back from the database in any order: the sort column restores the file order.
 const back=rowsToCatalogue([...rows].reverse());
 assert.deepEqual(buildIndex(back).entries,buildIndex(json).entries);
});

test('saved part details: changed entries go whole, removed ones as keys',()=>{
 const base={LM358:{mpn:'LM358',description:'Op amp'},NE555:{mpn:'NE555'}};
 const next={LM358:{description:'Dual op amp',mpn:'LM358'},SS14:{mpn:'SS14'}};
 const d=diffDetails(base,next);
 assert.deepEqual(d.upsert.map(x=>x.key),['LM358','SS14']);assert.deepEqual(d.removed,['NE555']);
 assert.ok(detailsDiffEmpty(diffDetails(next,{SS14:{mpn:'SS14'},LM358:{mpn:'LM358',description:'Dual op amp'}})),'field and key order do not count as a change');
 assert.deepEqual(applyDetails({NE555:{mpn:'NE555'},X:{mpn:'X'}},d),{X:{mpn:'X'},LM358:next.LM358,SS14:next.SS14});
});

test('/api/partmaster and the app fall back to the bundled file until the catalogue is loaded',async()=>{
 assert.deepEqual(await(await handleApi(new Request('http://x/api/partmaster'))).json(),{enabled:false});
 const empty=inventoryBackend({url:'https://p.supabase.co',key:'sb_secret_x'},async()=>new Response('[]'));
 assert.deepEqual(await(await handleApi(new Request('http://x/api/partmaster'),{},fetch,null,null,empty)).json(),{enabled:true,empty:true});
 const rows=[{kind:'semiconductor',mpn:'1N4001',sort:0,category:'Diode',sub_type:'Rectifier',manufacturer:'ON',description:'',specs:'',package:'DO-41',mount:'THT',use_case:'',alternates:''}];
 const full=inventoryBackend({url:'https://p.supabase.co',key:'sb_secret_x'},async u=>new Response(String(u).includes('offset=0')?JSON.stringify(rows):'[]'));
 const j=await(await handleApi(new Request('http://x/api/partmaster'),{},fetch,null,null,full)).json();
 assert.equal(j.from,'supabase');assert.deepEqual(j.semiconductors,[['Diode','Rectifier','1N4001','ON','','','DO-41','THT','','']]);
 const fake=answers=>async u=>answers[u]?new Response(JSON.stringify(answers[u])):new Response('',{status:404});
 assert.equal((await loadPartMaster(fake({'/api/partmaster':j,'/data/part-master.json':{semiconductors:[],resistors:[]}}))).from,'supabase');
 assert.equal((await loadPartMaster(fake({'/api/partmaster':{enabled:true,empty:true},'/data/part-master.json':{semiconductors:[],resistors:[]}}))).from,'bundled');
 assert.equal((await loadPartMaster(async u=>{if(u==='/api/partmaster')throw Error('no server');return new Response('{"semiconductors":[],"resistors":[]}')})).from,'bundled');
});
