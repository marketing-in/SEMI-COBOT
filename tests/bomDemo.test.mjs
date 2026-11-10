import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBomState,DEMO_GERBER,BOM_STEPS} from '../src/bomDemo.js';
import {rowCost,riskOf,bomSummary,allOffers,pcbEstimate} from '../src/bom.js';
import {scoreRow,offerCertainty} from '../src/bomScores.js';
import {existsSync} from 'node:fs';

test('the demo BOM has something for every feature the tour shows',()=>{
 const s=demoBomState(Date.parse('2026-11-06T10:00:00Z'));assert.equal(s.demo,true);
 const calcs=s.rows.map(r=>rowCost(r,{boards:s.boards,defaultMargin:s.margin,method:s.method}));
 assert.equal(calcs.filter(c=>c.missing).length,0,'every line is priced');
 const risks=s.rows.map((r,i)=>riskOf(r,calcs[i],scoreRow(r,calcs[i])));const sum=bomSummary(s.rows,calcs,risks);
 assert.ok(risks.filter(r=>r.atRisk).length>=2,'at least two parts at risk');assert.ok(risks[s.rows.findIndex(r=>r.mpn==='MAX485CPA+')].atRisk,'the obsolete part is at risk');
 assert.deepEqual({lines:sum.lines,matchedPct:sum.matchedPct,priced:sum.priced},{lines:9,matchedPct:100,priced:9},'nine lines, every part number matched and priced');
 assert.ok(s.rows.every(r=>r.marketAt),'no automatic market search: no supplier quota is spent');
 const driver=s.rows.find(r=>r.id==='demo-1');assert.equal(driver.mpn,'DRV8323RSRGZR','the tour opens the gate driver');assert.ok(driver.manualOffers.some(o=>o.marketType==='ems-excess'),'an excess offer to bid on');
 const op=s.rows.find(r=>r.mpn==='LM358DR'),listing=allOffers(op).find(o=>o.source==='serpapi');assert.ok(listing,'a Google Shopping listing');
 assert.ok(offerCertainty(listing,allOffers(op),op.qty*s.boards,op.mpn).uncertainty>50,'the cheap unverified listing is uncertain');
 assert.equal(s.pcb.gerber.name,'sample-gerber.zip');assert.ok(existsSync('public'+DEMO_GERBER),'the demo Gerber ships with the site');
 assert.ok(pcbEstimate({...s.pcb,material:s.pcb.material,qty:s.boards,spec:s.pcb.spec}).breakdown.some(b=>/ENIG/.test(b.label)));
 assert.ok(Object.keys(s.supplierRules).length===2&&s.shipping.deliveryCost);
});

test('every tour step has a picture, a chapter and a target, and the last step ends the tour',()=>{
 assert.ok(BOM_STEPS.length>=14);assert.ok(BOM_STEPS.every(s=>s.icon&&s.ch&&s.title&&s.text));
 assert.ok(BOM_STEPS.slice(0,-1).every(s=>s.target));assert.equal(BOM_STEPS.at(-1).target,null);
 assert.equal(new Set(BOM_STEPS.map(s=>s.title)).size,BOM_STEPS.length);
});
