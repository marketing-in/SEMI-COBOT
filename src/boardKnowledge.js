// Board knowledge: which kind of board a design is, and which supporting parts it needs.
// Pure, no DOM. Board types come from public/data/board-types.json (see scripts/ and README).
import {makePart,packageSize} from './blueprint.js';

const text=p=>[p.mpn,p.value,p.package,p.inv?.description,p.inv?.category,p.know?.entry?.description,p.know?.entry?.category,p.know?.entry?.subType,p.ai?.description,p.ai?.package,p.type].filter(Boolean).join(' ').toLowerCase();
const mpnOf=p=>String(p.inv?.mpn||p.mpn||p.ai?.mpn||'').toUpperCase();
const inRange=(v,[a,b]=[])=>a==null||b==null||v>=a&&v<=b;

// Scores every board type against the board's parts. Returns the best matches with the evidence.
export function classifyBoard(board,parts,types){
 const texts=parts.map(text),mpns=parts.map(mpnOf).filter(Boolean),all=texts.join(' | ');
 const longest=Math.max(board.width||0,board.height||0),layers=board.layers||2;
 const scored=[];
 for(const t of types||[]){
  const sig=t.signals||{},evidence=[];let score=0;
  for(const src of sig.mpnPatterns||[]){let re;try{re=new RegExp(src,'i')}catch{continue}const hit=mpns.find(m=>re.test(m));if(hit){score+=3;evidence.push(hit)}}
  const kw=(sig.keywords||[]).filter(k=>k&&all.includes(k.toLowerCase()));score+=Math.min(4,kw.length*.8);evidence.push(...kw.slice(0,4));
  const con=(sig.connectors||[]).filter(k=>k&&all.includes(k.toLowerCase()));score+=Math.min(3,con.length*1.2);evidence.push(...con.slice(0,3));
  if(parts.length&&inRange(parts.length,sig.partCount))score+=1;if(longest&&inRange(longest,sig.sizeMm))score+=1;if(inRange(layers,sig.layers))score+=.5;
  scored.push({type:t,score,confidence:score/(score+6),evidence:[...new Set(evidence)].slice(0,8)});
 }
 return scored.sort((a,b)=>b.score-a.score).slice(0,3).filter(s=>s.score>1.5);
}

// --- Supporting-part rules -------------------------------------------------------------------------
const RULES=[
 {role:'mcu',test:(p,t,m)=>p.type==='chip'&&(/^(ATMEGA|ATTINY|ATSAM|STM32|STM8|ESP32|ESP8266|RP2040|PIC1|PIC2|PIC3|DSPIC|MSP430|NRF5|SAMD|GD32|CH32|LPC|EFM32|CY8C|MKL|MK[0-9]|ATXMEGA)/.test(m)||/microcontroller|\bmcu\b|cortex/.test(t)),
  needs:p=>{const pins=(p.pads||[]).length||32,vdd=Math.max(2,Math.min(8,Math.round(pins/12)));return [
   {type:'capacitor',value:'100 nF X7R 50 V',package:'0603',example:'GRM188R71H104KA93D',qty:vdd,purpose:'Decoupling, one per supply pin, placed at the pin'},
   {type:'capacitor',value:'10 µF X5R 16 V',package:'0805',example:'CL21A106KAYNNNE',qty:1,purpose:'Bulk capacitance on the MCU supply'},
   {type:'resistor',value:'10 kΩ 1%',package:'0603',example:'RC0603FR-0710KL',qty:1,purpose:'Reset (NRST) pull-up'},
   {type:'capacitor',value:'100 nF X7R 50 V',package:'0603',example:'GRM188R71H104KA93D',qty:1,purpose:'Reset filter capacitor'},
   {type:'crystal',value:'8–16 MHz',package:'3225',example:'ABM8-16.000MHZ-B2-T',qty:1,purpose:'Main clock (skip if the internal oscillator is enough)',optional:true},
   {type:'capacitor',value:'18–22 pF C0G',package:'0603',example:'GRM1885C1H220JA01D',qty:2,purpose:'Crystal load capacitors',withCrystal:true}]}},
 {role:'ldo',test:(p,t,m)=>/^(LM1117|AMS1117|LD1117|NCP1117|AP2112|MCP1700|MCP1702|XC6206|LP2985|TLV7|LM78|L78|LM317|RT9013|ME6211|LDL1117|TPS7A)/.test(m)||/\bldo\b|linear regulator/.test(t),
  needs:()=>[{type:'capacitor',value:'10 µF X5R 16 V',package:'0805',example:'CL21A106KAYNNNE',qty:1,purpose:'Regulator input capacitor'},{type:'capacitor',value:'10–22 µF X5R 10 V',package:'0805',example:'CL21A226MQQNNNE',qty:1,purpose:'Regulator output capacitor (stability per datasheet)'}]},
 {role:'buck',test:(p,t,m)=>/^(LM2596|LM2576|MP1584|MP2307|MP2315|TPS54|TPS56|TPS62|LMR|SY8|RT8|XL4015|AP62|AOZ)/.test(m)||/buck|step-?down/.test(t),
  needs:()=>[{type:'inductor',value:'4.7–22 µH, rated above load current',package:'1210 / 6x6 mm',example:'SRN6045TA-100M',qty:1,purpose:'Buck output inductor'},{type:'capacitor',value:'22 µF X5R 25 V',package:'1206',example:'GRM31CR61E226KE15L',qty:2,purpose:'Input capacitors'},{type:'capacitor',value:'22 µF X5R 10 V',package:'0805',example:'CL21A226MQQNNNE',qty:2,purpose:'Output capacitors'},{type:'resistor',value:'feedback divider (sets VOUT)',package:'0603',example:'RC0603FR-0710KL',qty:2,purpose:'Output voltage feedback divider'}]},
 {role:'opamp',test:(p,t,m)=>/^(LM358|LM324|LM2904|MCP600|MCP60|TL07|TL08|OPA|LMV3|TLV9|NE5532|AD86)/.test(m)||/op-?amp|operational amplifier/.test(t),
  needs:()=>[{type:'capacitor',value:'100 nF X7R 50 V',package:'0603',example:'GRM188R71H104KA93D',qty:1,purpose:'Supply decoupling at the op-amp'}]},
 {role:'ic',test:p=>p.type==='chip',needs:()=>[{type:'capacitor',value:'100 nF X7R 50 V',package:'0603',example:'GRM188R71H104KA93D',qty:1,purpose:'Supply decoupling'}]},
 {role:'usbc',test:(p,t)=>/usb-?c|type-?c|usb4110/.test(t),
  needs:()=>[{type:'resistor',value:'5.1 kΩ 1%',package:'0603',example:'RC0603FR-075K1L',qty:2,purpose:'CC1/CC2 pull-downs so a USB-C source supplies power (sink only)'},{type:'diode',value:'USB ESD array',package:'SOT-23-6',example:'USBLC6-2SC6',qty:1,purpose:'ESD protection on D+/D-'},{type:'fuse',value:'PTC 500 mA',package:'1206',example:'1206L050YR',qty:1,purpose:'VBUS over-current protection'}]},
 {role:'usb',test:(p,t)=>/\busb\b|usb-?b|micro-?usb|mini-?usb/.test(t)&&!/usb-?c|type-?c/.test(t),
  needs:()=>[{type:'diode',value:'USB ESD array',package:'SOT-23-6',example:'USBLC6-2SC6',qty:1,purpose:'ESD protection on D+/D-'},{type:'fuse',value:'PTC 500 mA',package:'1206',example:'1206L050YR',qty:1,purpose:'VBUS over-current protection'}]},
 {role:'mosfet',test:(p,t,m)=>p.type==='transistor'&&(/^(IRF|IRL|AO3|AO4|SI2|SI4|BSS|2N7002|DMN|DMG|IRLML|FDN|NTR|NTS)/.test(m)||/mosfet/.test(t)),
  needs:()=>[{type:'resistor',value:'10–100 Ω',package:'0603',example:'RC0603FR-0722RL',qty:1,purpose:'Gate series resistor (limits ringing)'},{type:'resistor',value:'10–100 kΩ',package:'0603',example:'RC0603FR-07100KL',qty:1,purpose:'Gate pull-down so the FET stays off at power-up'}]},
 {role:'led',test:p=>p.type==='led',needs:()=>[{type:'resistor',value:'330 Ω – 1 kΩ (sets LED current)',package:'0603',example:'RC0603FR-071KL',qty:1,purpose:'LED series current-limit resistor'}]},
 {role:'jack',test:(p,t)=>p.type==='connector'&&/barrel|dc jack|power jack|\bjack\b/.test(t),
  needs:()=>[{type:'diode',value:'Schottky 3 A 40 V',package:'SMA',example:'SS34',qty:1,purpose:'Reverse-polarity protection on the input'},{type:'capacitor',value:'47–100 µF 25 V electrolytic',package:'Radial 6.3 mm',example:'EEE-FK1E101P',qty:1,purpose:'Input bulk capacitor'}]},
];
const roleOf=p=>{const t=text(p),m=mpnOf(p);for(const r of RULES)if(r.test(p,t,m))return r;return null};

// Supporting parts each part needs, what the board already has near it, and what is missing.
export function supportPlan(parts){
 // Placed parts count as present; suggested (planned) parts fill what is left, so adding twice adds nothing.
 const items=[];const have=parts.filter(p=>!p.suggested),all=parts;
 const near=(p,type,radius)=>all.filter(q=>q!==p&&q.side===p.side&&(q.suggested?q.parentRef===p.ref:Math.hypot(q.x-p.x,q.y-p.y)<=radius)&&(q.type===type||(q.passive&&['capacitor','resistor'].includes(type))));
 const used=new Set();
 for(const p of have){
  const rule=roleOf(p);if(!rule)continue;const radius=Math.max(6,Math.hypot(p.w,p.d)*.8);
  const crystal=have.some(q=>q.type==='crystal'&&Math.hypot(q.x-p.x,q.y-p.y)<=radius*1.6);
  for(const need of rule.needs(p)){
   if(need.withCrystal&&!crystal)continue;
   if(need.type==='crystal'&&crystal){items.push({...need,parent:p.ref,role:rule.role,present:1,missing:0});continue}
   const candidates=near(p,need.type,radius).filter(q=>!used.has(q.ref)&&(!q.suggested||q.purpose===need.purpose)).sort((a,b)=>(a.suggested?1:0)-(b.suggested?1:0)||Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
   const taken=candidates.slice(0,need.qty);taken.forEach(q=>used.add(q.ref));const present=taken.filter(q=>!q.suggested).length,planned=taken.length-present;
   items.push({...need,parent:p.ref,role:rule.role,present,planned,missing:need.optional?0:need.qty-present-planned});
  }
 }
 const missing=items.reduce((s,i)=>s+i.missing,0),present=items.reduce((s,i)=>s+i.present,0),planned=items.reduce((s,i)=>s+(i.planned||0),0);
 return {items,missing,present,planned,roles:[...new Set(items.map(i=>i.role))]};
}

// Places the missing supporting parts on free board space next to their parent part.
const PREFIX={capacitor:'C',resistor:'R',inductor:'L',diode:'D',fuse:'F',crystal:'Y'};
export function placeSuggestions(board,parts,plan,{clearance=.4}={}){
 const boxes=parts.filter(p=>!p.suggested).map(p=>{const r=Math.abs(Math.sin(p.rot*Math.PI/180))>.5;const w=r?p.d:p.w,d=r?p.w:p.d;return {x:p.x,y:p.y,w,d,side:p.side}});
 const W=board.width/2-1,H=board.height/2-1;const byRef=new Map(parts.map(p=>[p.ref,p]));
 const used=new Map();for(const p of parts){const m=/^([A-Z]+)(\d+)/.exec(p.ref);if(m)used.set(m[1],Math.max(used.get(m[1])||0,Number(m[2])))}
 const nextRef=pre=>{const n=Math.max(used.get(pre)||0,100)+1;used.set(pre,n);return pre+n};
 const free=(x,y,w,d,side)=>Math.abs(x)+w/2<=W&&Math.abs(y)+d/2<=H&&!boxes.some(b=>b.side===side&&Math.abs(b.x-x)<(b.w+w)/2+clearance&&Math.abs(b.y-y)<(b.d+d)/2+clearance);
 const out=[],unplaced=[];
 for(const item of plan.items){
  const parent=byRef.get(item.parent);if(!parent)continue;
  for(let k=0;k<item.missing;k++){
   const [pw,pd,ph]=packageSize(item.package,item.type);const w=Math.max(.6,pw),d=Math.max(.4,pd);let spot=null;
   const reach=Math.max(parent.w,parent.d)/2+Math.max(w,d);
   for(let ring=0;ring<14&&!spot;ring++){const r=reach+ring*Math.max(1,Math.min(w,d)+clearance);const steps=Math.max(8,Math.round(2*Math.PI*r/(w+clearance)));
    for(let i=0;i<steps;i++){const a=i/steps*2*Math.PI;const x=parent.x+r*Math.cos(a),y=parent.y+r*Math.sin(a);if(free(x,y,w,d,parent.side)){spot={x,y};break}}}
   if(!spot){unplaced.push(item);continue}
   boxes.push({x:spot.x,y:spot.y,w,d,side:parent.side});
   out.push({...makePart({ref:nextRef(PREFIX[item.type]||'X'),type:item.type,value:item.value,mpn:item.example,package:item.package,x:spot.x,y:spot.y,rot:0,side:parent.side,w,d,h:ph}),suggested:true,purpose:item.purpose,parentRef:item.parent});
  }
 }
 return {parts:out,unplaced};
}
