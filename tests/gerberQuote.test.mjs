import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzip} from '../src/unzip.js';
import {buildGerberBoard} from '../src/gerber.js';
import {gerberFacts,viaOptionFor,boardColors,GERBER_FILE} from '../src/gerberQuote.js';

const sample=async()=>(await unzip(readFileSync('public/samples/sample-gerber.zip'))).map(e=>({name:e.name.split('/').pop(),text:new TextDecoder().decode(e.bytes)}));

test('a Gerber set gives the quote its board size, copper layers and smallest hole',async()=>{
 const f=gerberFacts(buildGerberBoard(await sample(),{name:'sample-gerber.zip'}));
 assert.deepEqual({w:f.widthMm,h:f.heightMm,layers:f.layers,hits:f.hits,min:f.minHoleMm,outline:f.outline,mask:f.mask},{w:100,h:67,layers:2,hits:14,min:.4,outline:true,mask:true});
});

test('inner copper files count one layer each',async()=>{
 const files=await sample(),top=files.find(f=>/F_Cu/.test(f.name));
 const inner=n=>top.text.replace(/%TF\.FileFunction,[^%]*%/,'%TF.FileFunction,Copper,L'+n+',Inr*%');
 const four=[...files,{name:'CTRL-01-In1_Cu.gbr',text:inner(2)},{name:'CTRL-01-In2_Cu.gbr',text:inner(3)}];
 assert.equal(gerberFacts(buildGerberBoard(four,{name:'four.zip'})).layers,4);
});

test('the smallest plated hole picks the via option, and the drawing follows the chosen look',()=>{
 assert.deepEqual([.4,.3,.29,.25,.2,.19,.1,null].map(viaOptionFor),['0.3','0.3','0.25','0.25','0.2','0.15','0.15',null]);
 const red=boardColors({color:'red',finish:'enig'});assert.equal(red.mask,'#b3261e');assert.equal(red.finish,'#d9b45a');assert.equal(red.silk,'#f2f2ec');
 const white=boardColors({color:'white',silkscreen:'black',finish:'hasl'});assert.equal(white.silk,'#1b1b1b');assert.equal(white.finish,'#c9ccd1');
 assert.equal(boardColors({}).mask,'#0d4f31','green when nothing is chosen');
 assert.ok(GERBER_FILE.test('board.zip')&&GERBER_FILE.test('top.GTL')&&GERBER_FILE.test('drill.drl')&&!GERBER_FILE.test('notes.pdf'));
});
