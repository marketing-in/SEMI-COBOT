import test from 'node:test';
import assert from 'node:assert/strict';
import {groupBySeller,scoreSellers,summarise,radarPoints,AXES} from '../src/supplierScore.js';

const offers=[
 {seller:'DigiKey',source:'digikey',priceUsd:.33,price:.33,currency:'USD',stock:8071,leadDays:null,moq:1,authorized:true,url:'https://dk'},
 {seller:'Mouser',source:'mouser',priceUsd:.378,price:31.53,currency:'INR',stock:39976,leadDays:140,moq:1,authorized:true},
 {seller:'DigiKey',source:'serpapi',priceUsd:.35,price:.35,currency:'USD',stock:null,authorized:true},
 {seller:'KitsGuru',source:'serpapi',priceUsd:.11,price:.11,currency:'USD',stock:null,authorized:false},
 {seller:'Backorder Co',source:'nexar',priceUsd:.3,price:.3,currency:'USD',stock:0,leadDays:90,moq:2500,authorized:true}];

test('offers from several APIs merge per seller',()=>{
 const g=groupBySeller(offers);assert.equal(g.length,4);
 const dk=g.find(r=>r.seller==='DigiKey');assert.deepEqual(dk.sources.sort(),['digikey','serpapi']);assert.equal(dk.priceUsd,.33);assert.equal(dk.stock,8071);assert.equal(dk.url,'https://dk');
});
test('scores reward cheap, stocked, quick, small-order, authorised offers',()=>{
 const s=scoreSellers(offers);const by=Object.fromEntries(s.map(r=>[r.seller,r]));
 assert.equal(by.DigiKey.scores.price,91,'scored against the cheapest authorised price, not the marketplace one');
 assert.equal(by.KitsGuru.scores.price,100);assert.equal(by.KitsGuru.scores.stock,0);assert.equal(by.KitsGuru.scores.trust,35);assert.equal(by.KitsGuru.scores.order,50);
 assert.equal(by.Mouser.scores.stock,100);assert.equal(by.Mouser.scores.delivery,100,'in stock ships now despite a long factory lead time');
 assert.equal(by['Backorder Co'].scores.delivery,50);assert.equal(by['Backorder Co'].scores.order,15);
 assert.deepEqual(s.slice(0,2).map(r=>r.seller).sort(),['DigiKey','Mouser']);assert.equal(s.at(-1).seller,'KitsGuru');
 for(const r of s)for(const a of AXES)assert.ok(r.scores[a.key]>=0&&r.scores[a.key]<=100);
 const sum=summarise(s);assert.equal(sum.cheapest.seller,'KitsGuru');assert.equal(sum.deepest.seller,'Mouser');assert.equal(sum.authorised,3);
 assert.equal(summarise([]),null);assert.deepEqual(scoreSellers([]),[]);
});
test('only marketplace prices still produce a usable price axis',()=>{
 const s=scoreSellers([{seller:'A',priceUsd:1},{seller:'B',priceUsd:2},{seller:'C',priceUsd:null}]);
 assert.deepEqual(s.map(r=>[r.seller,r.scores.price]),[['A',100],['B',50],['C',0]]);
});
test('radar points sit on the axes at the scored radius',()=>{
 const p=radarPoints({price:100,stock:0,delivery:50,order:0,trust:0},100,100,80);
 assert.equal(p.length,5);assert.deepEqual(p[0].map(Math.round),[100,20],'price points straight up');assert.deepEqual(p[1].map(Math.round),[100,100]);
 assert.ok(Math.abs(Math.hypot(p[2][0]-100,p[2][1]-100)-40)<1e-9);
});
