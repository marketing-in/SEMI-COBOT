import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPart,candidatesOf,needsValue,usesAiMpn} from '../src/autoSelect.js';

const stock={'LM1117MPX-3.3':{by:'DigiKey',seller:'DigiKey',stock:5200,manufacturer:'Texas Instruments',description:'LDO 3.3 V'},'ULN2003A':{by:'the part master',manufacturer:'TI'}};
const lookup=async m=>{const k=String(m).toUpperCase();return stock[k]?{checked:true,found:true,...stock[k]}:{checked:true,found:false}};

test('the first suggestion that exists exactly is selected, alternates included',async()=>{
 const a=await selectPart({ref:'U1',mpn:'LM1117MPX-3.3',alternates:['AMS1117-3.3'],confidence:.7},{ref:'U1',type:'chip'},{lookup});
 assert.equal(a.selected,true);assert.equal(a.mpn,'LM1117MPX-3.3');assert.equal(a.verifiedBy,'DigiKey');assert.equal(a.verifiedStock,5200);assert.equal(a.alternate,false);
 const b=await selectPart({ref:'U2',mpn:'ULN2003',alternates:['ULN2003A'],confidence:.6},{ref:'U2',type:'chip'},{lookup});
 assert.equal(b.selected,true);assert.equal(b.mpn,'ULN2003A');assert.equal(b.alternate,true);assert.equal(b.suggested,'ULN2003');
});

test('nothing found means nothing used; nothing checkable keeps the suggestion unchecked',async()=>{
 const c=await selectPart({ref:'U3',mpn:'XYZ123',alternates:[]},{ref:'U3',type:'chip'},{lookup});
 assert.equal(c.selected,false);assert.equal(c.notFound,true);assert.equal(c.mpn,'');
 const d=await selectPart({ref:'U4',mpn:'ABC777',confidence:.8},{ref:'U4'},{lookup:async()=>({checked:false,found:false})});
 assert.equal(d.checked,false);assert.equal(d.mpn,'ABC777');assert.equal(usesAiMpn(d),true,'unchecked but confident is used');
 assert.equal(usesAiMpn({...d,confidence:.4}),false);assert.equal(usesAiMpn(c),false);
});

test('a resistor, capacitor or inductor without a value still gets its checked part number, marked as an assumed value',async()=>{
 for(const part of [{ref:'R1',type:'resistor'},{ref:'C3'},{ref:'L1',type:'inductor'}])assert.ok(needsValue(part),part.ref);
 assert.ok(!needsValue({ref:'R1',type:'resistor',value:'10k'}));assert.ok(!needsValue({ref:'U1',type:'chip'}));
 const r=await selectPart({ref:'R1',mpn:'RC1210FR-0710KL',confidence:.9},{ref:'R1',type:'resistor'},{lookup:async()=>({checked:true,found:true,by:'DigiKey',stock:9000})});
 assert.equal(r.selected,true);assert.equal(r.mpn,'RC1210FR-0710KL');assert.equal(r.valueAssumed,true);assert.equal(usesAiMpn(r),true);
 const k=await selectPart({ref:'R2',mpn:'RC1210FR-0710KL'},{ref:'R2',type:'resistor',value:'10k'},{lookup:async()=>({checked:true,found:true,by:'DigiKey'})});assert.equal(k.valueAssumed,undefined);
 const n=await selectPart({ref:'C9',mpn:'NOPE1'},{ref:'C9'},{lookup:async()=>({checked:true,found:false})});assert.equal(n.notFound,true);assert.equal(n.mpn,'','a passive that does not exist is still not used');
 assert.deepEqual(candidatesOf({mpn:'a1b',alternates:['A-1B','X9Y','','LM358','NE555','TL072']}),['a1b','X9Y','LM358','NE555'],'unique, at most four');
});
