import test from 'node:test';
import assert from 'node:assert/strict';
import {keyOf,loadDetails,saveDetails,fromKnowledge,lookupDetails,exportJson,importJson,clean,DETAILS_KEY} from '../src/partDetails.js';

const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))}};

test('saved details answer first; the network is used only when nothing is saved',async()=>{
 let calls=0;const fetcher=async url=>{calls++;assert.match(url,/^\/api\/partinfo\?mpn=BSS138$/);return new Response(JSON.stringify({mpn:'BSS138',manufacturer:'onsemi',description:'N-channel MOSFET',package:'SOT-23',specs:[],links:[],source:'serpapi',fetchedAt:'2026-10-29T00:00:00Z'}))};
 const first=await lookupDetails('BSS138',{saved:{},fetcher});assert.equal(first.from,'online');assert.equal(first.info.manufacturer,'onsemi');assert.equal(calls,1);
 const saved={[keyOf('BSS138')]:first.info};const again=await lookupDetails('bss-138',{saved,fetcher});assert.equal(again.from,'saved');assert.equal(calls,1);
 const server=await lookupDetails('X1',{saved:{},fetcher:async()=>new Response(JSON.stringify({mpn:'X1',cached:true,specs:[],links:[]}))});assert.equal(server.from,'server');assert.equal('cached' in server.info,false);
 await assert.rejects(lookupDetails('Y2',{saved:{},fetcher:async()=>new Response(JSON.stringify({error:'Google search (SerpApi) is not connected.'}),{status:503})}),/not connected/);
 await assert.rejects(lookupDetails('Y3',{saved:{},fetcher:async()=>new Response('<html>',{status:502})}),/offline/);
});

test('saved details survive a reload and bad storage never throws',()=>{
 const s=memory();assert.deepEqual(loadDetails(s),{});assert.ok(saveDetails(s,{A1:{mpn:'A1'}}));assert.deepEqual(loadDetails(s),{A1:{mpn:'A1'}});
 s.setItem(DETAILS_KEY,'not json');assert.deepEqual(loadDetails(s),{});assert.equal(saveDetails({setItem(){throw Error('full')}},{}),false);assert.deepEqual(loadDetails(null),{});
});

test('imported JSON keeps only text and https links',()=>{
 const c=clean({mpn:' LM358P ',manufacturer:'TI',datasheet:'javascript:alert(1)',links:[{title:'x',link:'http://plain.example'},{title:'ok',link:'https://ti.com/lm358.pdf'}],specs:[{name:'Package',value:'DIP-8'},{name:'',value:''}],extra:'<script>'});
 assert.equal(c.mpn,'LM358P');assert.equal(c.datasheet,'');assert.deepEqual(c.links.map(l=>l.link),['https://ti.com/lm358.pdf']);assert.equal(c.specs.length,1);assert.equal('extra' in c,false);
 assert.equal(clean({mpn:'---'}),null);assert.equal(clean('x'),null);
});

test('export and import round-trip; part master details are not re-imported as saved data',()=>{
 const saved={BSS138:clean({mpn:'BSS138',manufacturer:'onsemi',source:'serpapi'})};
 const rows=[{mpn:'BSS138',value:'',package:'SOT-23',type:'transistor',refs:['Q1','Q2']},{mpn:'LM358P',value:'',package:'DIP-8',type:'chip',refs:['U1']}];
 const detailsOf=r=>saved[keyOf(r.mpn)]||(r.mpn==='LM358P'?fromKnowledge({mpn:'LM358P',manufacturer:'Texas Instruments / TI',description:'Dual op-amp',package:'DIP-8',specs:'3-32V, 1MHz'}):null);
 const data=exportJson({board:{id:'b',name:'Test',width:60,height:40},rows,saved,detailsOf});
 assert.equal(data.format,'semi-cobot-components');assert.equal(data.components[0].quantity,2);assert.equal(data.components[1].details.source,'part-master');assert.equal(data.components[1].details.manufacturer,'Texas Instruments');
 const back=importJson(JSON.parse(JSON.stringify(data)));assert.deepEqual(Object.keys(back),['BSS138']);assert.equal(back.BSS138.manufacturer,'onsemi');
 assert.deepEqual(Object.keys(importJson([{mpn:'A1'},{mpn:'B-2'}])),['A1','B2']);assert.deepEqual(Object.keys(importJson({X:{mpn:'X9'}})),['X9']);assert.deepEqual(importJson(null),{});
});

test('the directory exports to Excel with catalogue fields and reads details back',async()=>{
 const {buildWorkbook,readWorkbook,EXCEL_COLUMNS}=await import('../src/partDetails.js');const {default:ExcelJS}=await import('exceljs');
 const {catalogueNodes}=await import('../src/componentTaxonomy.js');const {readFileSync}=await import('node:fs');
 const nodes=catalogueNodes(JSON.parse(readFileSync(new URL('../public/data/component-categories.json',import.meta.url),'utf8')));
 const rows=[{mpn:'BSS138',value:'',package:'SOT-23',type:'transistor',refs:['Q1','Q2'],cls:{category:'Discrete semiconductors',type:'MOSFET',subtype:'N-channel',mounting:'Surface-mount (SMD/SMT)'}},
  {mpn:'LM358P',value:'',package:'DIP-8',type:'chip',refs:['U1'],cls:{category:'Integrated circuits',type:'Amplifier',subtype:'Operational',mounting:'Through-hole'}}];
 const saved={BSS138:clean({mpn:'BSS138',manufacturer:'onsemi',description:'N-channel MOSFET',datasheet:'https://www.onsemi.com/bss138.pdf',specs:[{name:'Package',value:'SOT-23'},{name:'',value:'50V'}],source:'serpapi'})};
 const detailsOf=r=>saved[keyOf(r.mpn)]||(r.mpn==='LM358P'?fromKnowledge({mpn:'LM358P',manufacturer:'TI',description:'Dual op-amp',package:'DIP-8'}):null);
 const counts=new Map([['Discrete semiconductors|MOSFET|N-channel',1],['Integrated circuits|Amplifier|Operational',1]]);
 const wb=buildWorkbook(ExcelJS,{board:{name:'Test',width:60,height:40},rows,detailsOf,nodes,counts});
 assert.deepEqual(wb.worksheets.map(w=>w.name),['Components','Catalogue','Board']);const ws=wb.getWorksheet('Components');
 assert.deepEqual(ws.getRow(1).values.slice(1),EXCEL_COLUMNS.map(c=>c[0]));assert.ok(ws.autoFilter,'filters on every column');assert.equal(ws.views[0].ySplit,1,'header frozen');
 assert.deepEqual(ws.getRow(2).values.slice(1,5),['Discrete semiconductors','MOSFET','N-channel','BSS138']);assert.equal(ws.getRow(2).getCell(10).value,'Q1, Q2');assert.equal(ws.getRow(2).getCell(13).value,'Package: SOT-23; 50V');
 const cat=wb.getWorksheet('Catalogue');assert.equal(cat.rowCount,417,'header and every subtype');assert.ok(cat.getSheetValues().some(r=>r&&r[3]==='N-channel'&&r[4]===1));
 const buf=await wb.xlsx.writeBuffer();const back=await readWorkbook(ExcelJS,buf);
 assert.deepEqual(Object.keys(back),['BSS138'],'part-master rows are not re-imported');assert.equal(back.BSS138.manufacturer,'onsemi');assert.equal(back.BSS138.datasheet,'https://www.onsemi.com/bss138.pdf');
 assert.deepEqual(back.BSS138.specs,[{name:'Package',value:'SOT-23'},{name:'',value:'50V'}]);
 const bad=new ExcelJS.Workbook();const s=bad.addWorksheet('Components');s.addRow(['Part','Maker']);s.addRow(['X1','Y']);await assert.rejects(readWorkbook(ExcelJS,await bad.xlsx.writeBuffer()),/MPN column/);
 const evil=new ExcelJS.Workbook();const e=evil.addWorksheet('Components');e.addRow(['MPN','Datasheet','Manufacturer']);e.addRow(['Z9','javascript:alert(1)','Acme']);const z=await readWorkbook(ExcelJS,await evil.xlsx.writeBuffer());assert.equal(z.Z9.datasheet,'');assert.equal(z.Z9.manufacturer,'Acme');
});
