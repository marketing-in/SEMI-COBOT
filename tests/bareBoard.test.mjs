import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseKicadPcb} from '../src/blueprint.js';
import {boardFacts} from '../src/bareBoard.js';
import {referenceBoard} from '../src/data.js';

test('any board in the workspace gives the quote its size, layers and holes, marked with the board',()=>{
 const kicad={id:'b1',...parseKicadPcb(readFileSync('public/samples/sample-board.kicad_pcb','utf8'),'sample-board.kicad_pcb')};
 const f=boardFacts(kicad);
 assert.equal(f.board,'b1');assert.equal(f.drawn,'model');assert.equal(f.widthMm,Math.round(kicad.width*10)/10);assert.equal(f.layers,kicad.layers||2);
 assert.ok(f.outline,'a KiCad board has its real outline');
 const ref=boardFacts(referenceBoard);assert.equal(ref.board,'reference');assert.ok(ref.widthMm>0&&ref.heightMm>0);assert.ok(ref.layers>=1);
 assert.ok(ref.hits>0&&ref.minHoleMm>0,'through-hole pads count as drilled holes');
 assert.equal(boardFacts({id:'g',name:'G',width:50,height:40,layers:4,surface:{top:'data:x'},parts:[]}).drawn,'surface','a Gerber board keeps the faces drawn at import');
});
