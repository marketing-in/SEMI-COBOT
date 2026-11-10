import test from 'node:test';
import assert from 'node:assert/strict';
import {modelKind} from '../src/partModels.js';
import {makePart,upgradePart} from '../src/blueprint.js';

test('each package family gets its own 3D model',()=>{
 const k=raw=>modelKind(makePart(raw));
 assert.equal(k({ref:'U1',package:'LQFP-100'}),'ic');assert.equal(k({ref:'U2',package:'DIP-28'}),'dip');assert.equal(k({ref:'U3',package:'SOT-223'}),'sot223');
 assert.equal(k({ref:'J1',package:'USB-C'}),'usb');assert.equal(k({ref:'J2',package:'Header 1x8, 2.54 mm pitch'}),'header');assert.equal(k({ref:'J3',package:'DC barrel jack'}),'jack');
 assert.equal(k({ref:'C5',package:'Radial, 2.5 mm lead pitch',leads:'tht'}),'electrolytic');assert.equal(k({ref:'C1',package:'0603'}),'passive');
 assert.equal(k({ref:'Y1',package:'HC-49'}),'can');assert.equal(k({ref:'Y2',package:'3225'}),'smdcrystal');
 assert.equal(k({ref:'Q1',package:'TO-220'}),'to220');assert.equal(k({ref:'Q2',package:'TO-92'}),'to92');assert.equal(k({ref:'Q3',package:'SOT-23'}),'sot');
 assert.equal(k({ref:'D1',package:'SMA'}),'diode');assert.equal(k({ref:'LED1',package:'0805',type:'led'}),'led');assert.equal(k({ref:'SW1',package:'TACT 6x6',type:'switch'}),'switch');
 assert.equal(k({ref:'M1',package:'ESP32-WROOM-32E',type:'module'}),'module');assert.equal(k({ref:'L1',package:'1210'}),'inductor');
 assert.equal(modelKind({ref:'P3',type:'other',package:'0805',passive:true}),'passive','inferred two-pad parts look like chip passives');
});

test('capacitors are built at their real size: big cans for big capacitance, chips stay chips',()=>{
 const p=raw=>makePart({ref:'C1',...raw}),size=x=>[x.w,x.d,x.h];
 assert.deepEqual(size(p({value:'1000uF 25V',package:'CP_Radial_D10.0mm_P5.00mm'})),[10,10,20],'footprint diameter, height from the can series');
 assert.deepEqual(size(p({value:'1000uF/25V'})),[12.5,12.5,20],'no footprint: sized from capacitance × voltage');
 assert.deepEqual(size(p({value:'100uF 16V',package:'Radial'})),[6.3,6.3,11]);
 assert.equal(p({value:'4700uF 50V'}).body,'snap-in');assert.deepEqual(size(p({value:'22uF 16V',package:'CP_Elec_6.3x5.4'})),[6.3,6.3,5.4]);
 assert.equal(p({value:'10uF 16V',package:'Tantalum Case B'}).body,'tantalum');assert.equal(p({value:'0.47uF 275V',package:'C_Rect_L18.0mm_W6.0mm_P15.00mm_MKT'}).body,'film');
 assert.equal(p({value:'100nF',package:'0603'}).body,undefined);assert.deepEqual(size(p({value:'100nF',package:'0603'})).slice(0,2),[1.6,.8]);
 assert.equal(modelKind(p({value:'1000uF 25V'})),'electrolytic');assert.equal(modelKind(p({value:'22uF',package:'CP_Elec_6.3x5.4'})),'smdcan');
 assert.equal(modelKind(p({value:'10uF',package:'TANT case C'})),'tantalum');assert.equal(modelKind(p({value:'1uF X2',package:'Film P15'})),'film');
 // Saved parts from before get their body on load; ceramic chips are left alone.
 const old={ref:'C9',type:'capacitor',value:'470uF 35V',package:'Radial',w:1.6,d:.8,h:.8,leads:'ends',shape:'box',pads:null};
 assert.deepEqual(size(upgradePart(old)),[12.5,12.5,20]);const chip={ref:'C2',type:'capacitor',value:'100nF',package:'0402',w:1,d:.5,h:.5};assert.equal(upgradePart(chip),chip);
});
