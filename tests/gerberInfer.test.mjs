import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterise,blobs,clusterPads,classify} from '../src/gerberInfer.js';

const rect=(x,y,w,h,extra={})=>({x,y,w,h,area:w*h,outline:[[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]],hole:0,...extra});

test('mask openings become pads however they were drawn',()=>{
 const objects=[{k:'circle',x:-5,y:0,r:.5,pol:'D'},{k:'poly',pts:[[0,-1],[2,-1],[2,1],[0,1]],pol:'D'},{k:'stroke',pts:[[5,0],[7,0]],w:.6,pol:'D'},{k:'stroke',pts:[[5,0],[5,1]],w:.6,pol:'D'},{k:'circle',x:1,y:0,r:.3,pol:'C'}];
 const p=blobs(rasterise(objects,{minX:-10,minY:-5,maxX:10,maxY:5},{ppm:20}));
 assert.equal(p.length,3,'painted strokes join into one pad');
 const sq=p.find(b=>Math.abs(b.x-1)<.1);assert.ok(Math.abs(sq.w-2)<.1&&Math.abs(sq.h-2)<.1);assert.ok(sq.area<4-.2,'clear polarity removes area');
 assert.ok(Math.abs(p.find(b=>b.x<0).w-1)<.1);
});

test('rows, DIP packages and passives are grouped and classified',()=>{
 const dip=[];for(let i=0;i<14;i++){dip.push(rect(0,i*2.54,1.6,1.6,{hole:.8}),rect(7.62,i*2.54,1.6,1.6,{hole:.8}))}
 const soic=[];for(let i=0;i<4;i++){soic.push(rect(30,i*1.27,1.5,.6),rect(35.4,i*1.27,1.5,.6))}
 const r1=[rect(50,0,.9,.95),rect(51.55,0,.9,.95)],r2=[rect(50,4,.9,.95),rect(51.55,4,.9,.95)];
 const header=[0,1,2,3,4,5,6,7].map(i=>rect(70,i*2.54,1.7,1.7,{hole:1}));
 const groups=clusterPads([...dip,...soic,...r1,...r2,...header]);
 const sizes=groups.map(g=>g.length).sort((a,b)=>a-b);assert.deepEqual(sizes,[2,2,8,8,28]);
 const names=groups.map(g=>classify(g).package.split(',')[0]).sort();assert.deepEqual(names,['0603','0603','DIP-28','Header 1x8','SOIC-8']);
 assert.equal(classify(dip).prefix,'U');assert.equal(classify(header).type,'connector');assert.equal(classify(r1).passive,true);
});

test('silkscreen outlines split neighbours that touch and join parts the designer boxed',()=>{
 // Two 0603s 1.6 mm apart would chain into one 4-pad group without their silkscreen boxes.
 const a=[rect(0,0,.9,.95),rect(1.55,0,.9,.95)],b=[rect(0,1.6,.9,.95),rect(1.55,1.6,.9,.95)];
 assert.equal(clusterPads([...a,...b].map(p=>({...p}))).length,1);
 const loops=[[[-.7,-.8],[2.25,-.8],[2.25,.75],[-.7,.75]],[[-.7,.85],[2.25,.85],[2.25,2.4],[-.7,2.4]]];
 const split=clusterPads([...a,...b].map(p=>({...p})),{silkLoops:loops});assert.deepEqual(split.map(g=>g.length),[2,2]);
});
