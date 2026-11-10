// Injection mould planning for a custom enclosure (base + lid moulded together in a family tool).
// Everything here is derived from the enclosure geometry and published material properties:
// part volume and weight, cooling and cycle time, clamp force and the tool class that lasts the run.
// Prices are never invented: tooling and the moulded unit price come from the mould maker's quote,
// and the cost build-up only appears when the user enters a resin price and a machine-hour rate.

// Density g/cm³, thermal diffusivity mm²/s, melt / mould wall / ejection temperatures °C (typical datasheet values).
export const RESINS={
 'ABS plastic':{density:1.04,alpha:.117,melt:230,wall:60,eject:90},
 'Polycarbonate':{density:1.20,alpha:.133,melt:300,wall:90,eject:130},
 'PC/ABS plastic':{density:1.15,alpha:.125,melt:260,wall:70,eject:110},
 'Nylon':{density:1.14,alpha:.129,melt:290,wall:80,eject:150}};

// SPI mould classes by expected life.
export const TOOL_CLASSES=[
 {id:'aluminium',label:'Aluminium tool',spi:'SPI class 104',life:100000,note:'Fast and cheaper to cut; for prototypes and runs up to about 100,000 cycles.'},
 {id:'p20',label:'P20 pre-hardened steel',spi:'SPI class 103',life:500000,note:'Common production tool for medium runs up to about 500,000 cycles.'},
 {id:'h13',label:'Hardened H13 steel',spi:'SPI class 101',life:1000000,note:'For long runs of a million cycles and more, and for glass-filled resins.'}];

// Clamp pressure per projected area: about 3 tons per square inch, a common rule for ABS-type parts.
const TONS_PER_CM2=3/6.4516;

export function mouldEstimate({outer,wall,material,cavities=1,qty=1,toolClass=''}){
 const r=RESINS[material];
 const [W,D,H]=(outer||[]).map(Number);const s=Number(wall);
 if(!r||!(W>0&&D>0&&H>0&&s>0))return null;
 const cav=Math.max(1,Math.min(8,Math.round(Number(cavities)||1)));
 // The housing splits at about two thirds height: base and lid, each an open box of wall thickness s.
 const shell=(w,d,h)=>w*d*h-Math.max(0,w-2*s)*Math.max(0,d-2*s)*Math.max(0,h-s);
 const baseH=H*2/3,lidH=H-baseH;
 const partsMm3=shell(W,D,baseH)+shell(W,D,lidH);
 const unitG=partsMm3/1000*r.density;
 const shotG=unitG*cav;
 // Cooling time of a plate cooled from both sides: t = s²/(π²α)·ln(4/π·(Tm−Tw)/(Te−Tw)).
 const cooling=s*s/(Math.PI**2*r.alpha)*Math.log(4/Math.PI*(r.melt-r.wall)/(r.eject-r.wall));
 const cycle=Math.round((cooling+8)*10)/10;// + injection, hold, opening and ejection
 const projectedCm2=2*W*D/100*cav;
 const clampT=Math.ceil(projectedCm2*TONS_PER_CM2);
 const unitsPerHour=Math.floor(3600/cycle*cav);
 const shots=Math.ceil(Math.max(1,Number(qty)||1)/cav);
 const suggested=(TOOL_CLASSES.find(t=>t.life>=shots*1.2)||TOOL_CLASSES[TOOL_CLASSES.length-1]).id;
 const tool=TOOL_CLASSES.find(t=>t.id===toolClass)||TOOL_CLASSES.find(t=>t.id===suggested);
 return {cavities:cav,unitG,shotG,cooling,cycle,clampT,unitsPerHour,shots,suggested,tool,lifeOk:tool.life>=shots,projectedCm2};
}

// Moulded cost per enclosure from the user's own rates; null until both are entered.
export function mouldedUnitCost(est,{resinPerKg,machinePerHour}){
 const resin=Number(resinPerKg),rate=Number(machinePerHour);
 if(!est||!(resin>0)||!(rate>0))return null;
 const material=est.unitG/1000*resin*1.05;// 5 % regrind and start-up loss
 const machine=rate/est.unitsPerHour;
 return {material,machine,total:material+machine};
}

const ALIASES={'ABS plastic':['abs'],'Polycarbonate':['polycarbonate','pc'],'PC/ABS plastic':['pc/abs','pc-abs','pc+abs'],'Nylon':['nylon','pa66','pa6','polyamide']};
// A maker can take the job when what the user recorded about it covers the material and the part size.
export function makerFit(maker,{material,outer}){
 const notes=[];
 if(maker.materials){const have=String(maker.materials).toLowerCase(),names=ALIASES[material]||[String(material||'').toLowerCase()];
  notes.push(names.some(n=>have.includes(n))?'material listed':'material not listed')}
 const m=/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/.exec(String(maker.maxPart||''));
 if(m&&outer){const lim=[+m[1],+m[2],+m[3]].sort((a,b)=>b-a),need=[...outer].sort((a,b)=>b-a);notes.push(need.every((x,i)=>x<=lim[i])?'size fits':'part larger than its limit')}
 const confirmed=notes.length>0;
 return {confirmed,ok:confirmed&&!notes.some(n=>/not listed|larger/.test(n)),notes};
}
