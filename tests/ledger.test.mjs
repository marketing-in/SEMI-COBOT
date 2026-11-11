import test from 'node:test';
import assert from 'node:assert/strict';
import {placeOrder,receiveOrder,cancelOrder,consumeForJob,money} from '../src/ledger.js';

const empty={orders:[],moves:[],consumed:{}};
const parts=[{id:'p1',mpn:'SS14',manufacturer:'Diodes Inc',stock:100,min:50,price:.1,supplier:''},{id:'p2',mpn:'BSS138',stock:5,min:0,price:.05}];

test('a purchase order per supplier, numbered by day, with its total',()=>{
 const {ledger,order}=placeOrder(empty,{supplier:'DigiKey',project:'GW-1',listId:'list-1',shippingUsd:5,lines:[{mpn:'SS14',qty:400,unitUsd:.08},{mpn:'LM358P',manufacturer:'TI',qty:100,unitUsd:.2},{mpn:'',qty:3},{mpn:'X',qty:0}],now:'2026-11-11T10:00:00Z'});
 assert.equal(order.id,'PO-20261111-001');assert.equal(order.lines.length,2,'empty and zero lines are dropped');assert.equal(order.totalUsd,400*.08+100*.2+5);assert.equal(order.status,'ordered');
 assert.equal(placeOrder(ledger,{supplier:'Mouser',lines:[{mpn:'A1B2',qty:1,unitUsd:1}],now:'2026-11-11T12:00:00Z'}).order.id,'PO-20261111-002');
 assert.equal(placeOrder(empty,{supplier:'X',lines:[]}).order,null);
 assert.equal(cancelOrder(ledger,order.id).orders.length,0,'an ordered PO can be cancelled');
});

test('receiving an order adds the parts to inventory: stock up, average cost, new part numbers created',()=>{
 const {ledger,order}=placeOrder(empty,{supplier:'DigiKey',lines:[{mpn:'ss14',qty:100,unitUsd:.2},{mpn:'LM358P',manufacturer:'TI',description:'Dual op-amp',package:'DIP-8',qty:50,unitUsd:.3}],now:'2026-11-11T10:00:00Z'});
 const r=receiveOrder(ledger,parts,order.id,'2026-11-12T09:00:00Z');
 const ss=r.parts.find(p=>p.mpn==='SS14');assert.equal(ss.stock,200);assert.ok(Math.abs(ss.price-.15)<1e-9,'weighted average of .1 and .2');assert.equal(ss.supplier,'DigiKey');
 const lm=r.parts.find(p=>p.mpn==='LM358P');assert.deepEqual([lm.stock,lm.price,lm.manufacturer,lm.package,lm.source],[50,.3,'TI','DIP-8','purchase']);
 assert.deepEqual(r.updated,['ss14']);assert.deepEqual(r.added,['LM358P']);
 assert.equal(r.ledger.orders[0].status,'received');assert.equal(r.ledger.moves.length,2);assert.equal(r.ledger.moves[0].type,'in');
 const again=receiveOrder(r.ledger,r.parts,order.id);assert.equal(again.parts,r.parts,'receiving twice changes nothing');
});

test('completed boards take their components out of stock once per board, never below zero',()=>{
 const job={id:'job-1',board:'GW-1'};const lines=[{mpn:'SS14',qty:2},{mpn:'BSS138',qty:1},{mpn:'NE555',qty:1}];
 const a=consumeForJob(empty,parts,job,3,lines,'2026-11-12T00:00:00Z');
 assert.equal(a.boards,3);assert.equal(a.parts.find(p=>p.mpn==='SS14').stock,94);assert.equal(a.parts.find(p=>p.mpn==='BSS138').stock,2);
 assert.deepEqual(a.short,[{mpn:'NE555',need:3,missing:3}],'a part not in inventory is reported short');assert.equal(a.ledger.consumed['job-1'],3);
 assert.ok(Math.abs(a.taken.find(t=>t.mpn==='SS14').costUsd-.6)<1e-9);
 assert.equal(consumeForJob(a.ledger,a.parts,job,3,lines).boards,0,'the same boards are not counted twice');
 const b=consumeForJob(a.ledger,a.parts,job,8,lines);assert.equal(b.boards,5);assert.equal(b.parts.find(p=>p.mpn==='BSS138').stock,0,'never below zero');
 assert.deepEqual(b.short.find(s=>s.mpn==='BSS138'),{mpn:'BSS138',need:5,missing:3});assert.equal(b.ledger.consumed['job-1'],8);
});

test('spend and income: purchases against boards dispatched at the saved list price',()=>{
 let led=placeOrder(empty,{supplier:'DigiKey',lines:[{mpn:'SS14',qty:1000,unitUsd:.1}],now:'2026-10-05T00:00:00Z'}).ledger;
 led=placeOrder(led,{supplier:'Mouser',lines:[{mpn:'BSS138',qty:100,unitUsd:.5}],now:'2026-11-02T00:00:00Z'}).ledger;
 led=receiveOrder(led,parts,led.orders[1].id).ledger;
 led=consumeForJob(led,parts,{id:'job-1',board:'GW-1'},10,[{mpn:'SS14',qty:2}]).ledger;
 const jobs=[{id:'job-1',board:'GW-1',customer:'Orion',listId:'list-1',quote:'Q-1',dispatches:[{date:'2026-11-10',qty:40},{date:'2026-12-01',qty:10}]},{id:'job-2',board:'X',dispatches:[{date:'2026-11-10',qty:5}]}];
 const lists=[{id:'list-1',total:5000,boards:100}];
 const s=money(led,jobs,lists);
 assert.equal(s.spentUsd,150);assert.equal(s.receivedUsd,100);assert.equal(s.openUsd,50);assert.equal(s.incomeUsd,2500);assert.equal(s.differenceUsd,2350);assert.equal(s.unpricedBoards,5);
 assert.ok(Math.abs(s.materialUsd-2)<1e-9,'20 SS14 at 0.1');
 assert.deepEqual(s.months.map(m=>m.month),['2026-12','2026-11','2026-10']);assert.equal(s.months.find(m=>m.month==='2026-11').incomeUsd,2000);
 assert.deepEqual(s.suppliers,[{supplier:'DigiKey',usd:100},{supplier:'Mouser',usd:50}]);
 assert.deepEqual(s.jobs[0],{id:'job-1',board:'GW-1',customer:'Orion',boards:50,perBoardUsd:50,incomeUsd:2500,materialUsd:s.materialUsd,quote:'Q-1'});
});
