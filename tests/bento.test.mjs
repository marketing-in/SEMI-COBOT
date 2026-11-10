import test from 'node:test';
import assert from 'node:assert/strict';
import {seedParts,status} from '../src/data.js';
import {groupOf,valueOf,summary,locationSeries,cumulativeSeries,totalOf,allocation,categoryBars,restockGoals,stockVsMinimum,GROUPS} from '../src/bentoData.js';

const finite=o=>JSON.stringify(o,(k,v)=>{if(typeof v==='number'&&!Number.isFinite(v))throw new Error(`non-finite ${k}`);return v});

test('groups and value',()=>{
 assert.equal(groupOf('Microcontrollers'),'Semiconductors');assert.equal(groupOf('Diodes'),'Semiconductors');assert.equal(groupOf('Power management'),'Semiconductors');
 assert.equal(groupOf('Capacitors'),'Passives');assert.equal(groupOf('Resistors'),'Passives');assert.equal(groupOf('Connectors'),'Other');assert.equal(groupOf(undefined),'Other');
 assert.equal(valueOf({price:2,stock:3}),6);assert.equal(valueOf({price:'x',stock:3}),0);assert.equal(valueOf(null),0);
});

test('summary of the seed inventory',()=>{
 const s=summary(seedParts,status);
 assert.equal(s.uniqueCount,12);assert.equal(s.categories,new Set(seedParts.map(p=>p.category)).size);
 assert.equal(s.units,seedParts.reduce((a,p)=>a+p.stock,0));assert.equal(s.minUnits,seedParts.reduce((a,p)=>a+p.min,0));
 assert.ok(Math.abs(s.value-seedParts.reduce((a,p)=>a+p.price*p.stock,0))<1e-6);
 assert.equal(s.healthy,seedParts.filter(p=>p.stock>=p.min&&status(p)!=='End of life').length);
 assert.ok(s.coverage>0);
 assert.deepEqual(s.alerts.map(p=>status(p)),['End of life','Low stock','Low stock','Low stock']);
 assert.equal(s.alerts[0].mpn,'ATMEGA328P-AU');
 assert.ok(s.alerts[1].stock/s.alerts[1].min<=s.alerts[2].stock/s.alerts[2].min);
 finite(s);
});

test('summary handles empty lists and zero minimums',()=>{
 const e=summary([],status);assert.deepEqual({...e,alerts:e.alerts.length},{value:0,minValue:0,units:0,minUnits:0,uniqueCount:0,categories:0,healthy:0,coverage:0,alerts:0});
 const z=summary([{mpn:'A',stock:5,min:0,price:0,lifecycle:'Active'}],status);assert.equal(z.coverage,0);assert.equal(z.healthy,1);finite(z);
});

test('location series and cumulative stream',()=>{
 const s=locationSeries(seedParts,'value');
 assert.deepEqual(s.map(b=>b.l),['A-01','A-02','A-03','A-04','B-01','B-03','C-01','C-02','D-01']);
 assert.ok(s.every(b=>b.semiconductors>=0&&b.passives>=0&&b.other>=0));
 const c=cumulativeSeries(seedParts,'units');
 assert.ok(totalOf(c[c.length-1])===seedParts.reduce((a,p)=>a+p.stock,0));
 for(let i=1;i<c.length;i++)assert.ok(totalOf(c[i])>=totalOf(c[i-1]));
 const one=locationSeries([{category:'Diodes',stock:1,price:1,location:'B-02-01'}],'units');assert.equal(one.length,2);assert.equal(one[0].l,'B-02');
 const cone=cumulativeSeries([{category:'Diodes',stock:1,price:1,location:'B-02-01'}],'units');assert.equal(cone.length,2);assert.equal(totalOf(cone[1]),1);
 const none=locationSeries([],'value');assert.equal(none.length,2);assert.equal(totalOf(none[0]),0);
 const mixed=locationSeries([{category:'Diodes',stock:1,price:1},{category:'Diodes',stock:1,price:1,location:'A-01-01'}],'units');assert.deepEqual(mixed.map(b=>b.l),['A-01','Unassigned']);
 finite([s,c,one,cone,none,mixed]);
});

test('allocation shares sum to one',()=>{
 const a=allocation(seedParts,'value');assert.deepEqual(a.rows.map(r=>r.key),GROUPS);assert.ok(Math.abs(a.rows.reduce((s,r)=>s+r.share,0)-1)<1e-9);
 assert.ok(a.rows[0].share>a.rows[2].share,'semiconductors dominate the seed value');
 const u=allocation(seedParts,'units');assert.equal(u.total,seedParts.reduce((s,p)=>s+p.stock,0));
 const e=allocation([],'value');assert.equal(e.total,0);assert.deepEqual(e.rows.map(r=>r.share),[0,0,0]);
 finite([a,u,e]);
});

test('category bars, goals and stock vs minimum',()=>{
 const bars=categoryBars(seedParts,'units',5);assert.equal(bars.length,5);assert.equal(bars[0].name,'Resistors');assert.ok(bars[0].units>=bars[1].units);assert.ok(Math.abs(bars.reduce((s,b)=>s+b.share,0)-1)<1e-9);
 assert.equal(categoryBars(seedParts,'value',2).length,2);assert.deepEqual(categoryBars([],'value'),[]);
 const goals=restockGoals(seedParts,status,2);assert.equal(goals.length,2);assert.ok(goals[0].progress<=goals[1].progress);assert.ok(goals.every(g=>g.part.lifecycle!=='End of life'&&g.target>0&&g.progress>=0&&g.progress<1));
 assert.deepEqual(restockGoals([{mpn:'A',stock:0,min:0,price:1}],status),[]);
 const svm=stockVsMinimum(seedParts,6);assert.equal(svm.length,6);assert.equal(svm[0].name,'Resistors');assert.ok(svm.every(r=>r.stock>=0&&r.min>=0));
 assert.deepEqual(stockVsMinimum([],3),[]);
 finite([bars,goals,svm]);
});
