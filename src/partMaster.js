// Part master knowledge base: the reference list of commonly sourced semiconductors and resistors
// (data/part-master.xlsx → public/data/part-master.json via scripts/make-part-master.mjs).
// Pure functions, no DOM, so the same code serves the browser and the Node tests.
//
// A board part is matched to the list by part number first (exact, then an ordering variant such
// as IRF540NPBF → IRF540N, then the family when only a stem such as LM358 is known) and, for
// resistors, by value and size when the label is just "10k" or "4K7 0603".

export const PART_MASTER_URL='/data/part-master.json';
export const SEMI_FIELDS=['category','subType','mpn','manufacturer','description','specs','package','mount','use','alternates'];
export const RES_FIELDS=['type','size','value','ohms','tolerance','power','maxV','tcr','mpn','manufacturer','crossRef','packaging'];
export const KNOWLEDGE_CATEGORIES=['Diodes','Optoelectronics','Transistors','Power management','Amplifiers','Analog ICs','Interface ICs','Timers & logic','Memory','Microcontrollers','Modules','Programmable logic','Resistors','Circuit protection'];
const MIN_STEM=4;          // shortest part-number stem that may match a longer number in either direction
const SIZE_CODES=/^(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)$/;

// A decimal point between two digits is part of the number (SMBJ5.0A is a 5 V part, SMBJ50A a 50 V one),
// so it is kept as 'P' instead of being dropped with the other separators.
export const compactMpn=s=>String(s||'').toUpperCase().replace(/(\d)[.,](?=\d)/g,'$1P').replace(/[^A-Z0-9]/g,'');
export const normalizeMpn=s=>String(s||'').trim().toUpperCase().replace(/\s+/g,'');

// Resistance text → ohms: 10K, 10k, 4K7, 4.7k, 4,7k, 10 kΩ, 100R, 0R, 2R2, 1M, 0.1Ω, 10 ohm. NaN otherwise.
export function parseOhms(text){
 const t=String(text||'').trim().replace(/\s+/g,'').replace(/(OHMS?|Ω|ω)$/i,'').toUpperCase();
 const m=t.match(/^(\d+(?:[.,]\d+)?)([RKM]?)(\d*)$/);
 if(!m||(m[3]&&m[1].includes('.'))||/^0\d/.test(m[1]))return NaN;   // 0603-style size codes are not values
 const whole=m[1].replace(',','.');
 const n=parseFloat(m[3]?whole+'.'+m[3]:whole);
 return n*{'':1,R:1,K:1e3,M:1e6}[m[2]];
}
// Whether a token states a resistance explicitly (unit or multiplier letter), rather than being a bare number.
export const hasOhmUnit=t=>/^\d+(?:[.,]\d+)?(?:[RKM]\d*|(?:[RKM]?\s*(?:Ω|ω|OHMS?)))$/i.test(String(t||'').trim());
export function formatOhms(n){
 if(!Number.isFinite(n))return '';
 const f=v=>String(Math.round(v*1000)/1000);
 return n>=1e6?f(n/1e6)+' MΩ':n>=1e3?f(n/1e3)+' kΩ':f(n)+' Ω';
}

const lower=s=>s&&s[1]&&s[1]===s[1].toLowerCase()?s[0].toLowerCase()+s.slice(1):s;   // keeps acronyms such as SMD, THT
function resistorDescription(e){
 const noun=/resistor|thermistor|varistor|potentiometer|jumper|network|array/i.test(e.type)?'':' resistor';
 return `${e.value||formatOhms(e.ohms)} ${lower(e.type)}${noun} · ${e.size}`;
}
const resistorMount=size=>/^(0\d{3}|1206|1210|1812|2010|2512)|x4|SMD|^3mm/i.test(size)?'SMD':/Axial|Radial|Disc|SIP|Cement|Chassis|multi-turn|single-turn|rotary|WH148/i.test(size)?'THT':'';

// Builds the lookup index from the JSON produced by scripts/make-part-master.mjs.
export function buildIndex(json){
 if(!json||!Array.isArray(json.semiconductors)||!Array.isArray(json.resistors))throw new Error('Part master JSON is missing the semiconductors or resistors tables.');
 const sf=json.semiconductorFields||SEMI_FIELDS,rf=json.resistorFields||RES_FIELDS;
 const entries=[];
 for(const row of json.semiconductors){const e={kind:'semiconductor'};sf.forEach((f,i)=>e[f]=row[i]==null?'':String(row[i]));if(!e.mpn)continue;e.hay=[e.mpn,e.manufacturer,e.description,e.category,e.subType,e.specs,e.package,e.mount,e.use,e.alternates].join(' ').toUpperCase();entries.push(e)}
 for(const row of json.resistors){const e={kind:'resistor'};rf.forEach((f,i)=>e[f]=f==='ohms'?(row[i]==null||row[i]===''?NaN:+row[i]):row[i]==null?'':String(row[i]));if(!e.mpn)continue;e.category='Resistor';e.subType=e.type;e.description=resistorDescription(e);e.package=e.size;e.mount=resistorMount(e.size);e.use='';e.specs=[e.tolerance,e.power,e.maxV&&e.maxV+' max',e.tcr].filter(Boolean).join(', ');e.hay=[e.mpn,e.manufacturer,e.description,e.type,e.size,e.value,e.tolerance,e.power,e.maxV,e.tcr,e.crossRef,e.packaging].join(' ').toUpperCase();entries.push(e)}
 const byCompact=new Map(),byOhms=new Map();
 for(const e of entries){e.compact=compactMpn(e.mpn);if(!byCompact.has(e.compact))byCompact.set(e.compact,e);if(e.kind==='resistor'&&Number.isFinite(e.ohms)){const k=ohmKey(e.ohms);if(!byOhms.has(k))byOhms.set(k,[]);byOhms.get(k).push(e)}}
 const keys=[...byCompact.keys()].sort();
 return {entries,byCompact,keys,byOhms,size:entries.length,version:json.version||1};
}
const ohmKey=n=>String(Math.round(n*1e6)/1e6);

// First index in the sorted key array that is >= key.
function lowerBound(keys,key){let lo=0,hi=keys.length;while(lo<hi){const mid=(lo+hi)>>1;if(keys[mid]<key)lo=mid+1;else hi=mid}return lo}

// Looks one part number up: exact, then an ordering variant (query longer than a listed number),
// then the family (query is a stem of listed numbers). Returns null when nothing fits.
export function lookupMpn(index,raw,{family=true}={}){
 if(!index)return null;
 const upper=String(raw||'').toUpperCase(),key=compactMpn(upper);
 if(!key)return null;
 const exact=index.byCompact.get(key);
 if(exact)return {entry:exact,match:'exact',query:raw};
 // Positions of the compact characters inside the raw string, to tell "1N4148W-7" (separator) from "SS140" (a different number).
 const pos=[];for(let i=0;i<upper.length;i++)if(/[A-Z0-9]/.test(upper[i])||(/[.,]/.test(upper[i])&&/\d/.test(upper[i-1]||'')&&/\d/.test(upper[i+1]||'')))pos.push(i);
 const separated=n=>n<pos.length&&n>0&&pos[n]-pos[n-1]>1;
 for(let n=key.length-1;n>=MIN_STEM;n--){
  const e=index.byCompact.get(key.slice(0,n));
  if(e&&(/[A-Z]/.test(key[n])||separated(n)))return {entry:e,match:'variant',query:raw};
 }
 if(!family||key.length<MIN_STEM)return null;
 const members=[];
 for(let i=lowerBound(index.keys,key);i<index.keys.length&&index.keys[i].startsWith(key);i++){
  const e=index.byCompact.get(index.keys[i]);
  const rest=e.compact.slice(key.length);
  const epos=[];for(let j=0;j<e.mpn.length;j++)if(/[A-Za-z0-9]/.test(e.mpn[j]))epos.push(j);
  if(/^[A-Z]/.test(rest)||epos[key.length]-epos[key.length-1]>1)members.push(e);
 }
 if(!members.length)return null;
 members.sort((a,b)=>a.compact.length-b.compact.length||a.mpn.localeCompare(b.mpn));
 return {entry:members[0],match:'family',query:raw,family:members};
}

// Resistor lookup by value, narrowed by the size code when the label or package states one.
export function lookupResistor(index,ohms,size=''){
 if(!index||!Number.isFinite(ohms))return null;
 const all=index.byOhms.get(ohmKey(ohms));
 if(!all)return null;
 const code=String(size||'').toUpperCase().match(/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/)?.[1];
 const axial=/AXIAL|THT|THROUGH/i.test(size||'');
 const fit=code?all.filter(e=>e.size.toUpperCase()===code):axial?all.filter(e=>/Axial/i.test(e.size)):[];
 const pool=fit.length?fit:all;
 const pick=pool.find(e=>/thick film/i.test(e.type)&&(!code&&!axial?e.size==='0603':true))||pool[0];
 return {entry:pick,match:'value',query:formatOhms(ohms),family:all,sized:fit.length>0};
}

// Matches a board part ({mpn,value,package,type} or a plain string) to the knowledge base.
export function lookupPart(index,part){
 if(!index)return null;
 const p=typeof part==='string'?{mpn:part}:part||{};
 // A label that is only a reference designator (D1, U12, R4) names a position on the board, not a part,
 // even when a short listed number (the Allwinner D1) happens to spell the same.
 const REFDES=/^(R|C|D|L|Q|U|J|Y|F|X|K|T|M|S|P|SW|LED|JP|CN|IC|TP|FB|RN|VR)\d{1,3}[A-Z]?$/i;
 const texts=[p.mpn,p.value].map(s=>String(s||'').trim()).filter(t=>t&&!REFDES.test(t));
 for(const text of texts){
  const whole=lookupMpn(index,text);
  if(whole&&whole.match!=='family')return whole;
  const tokens=text.split(/[\s,;()\/|]+/).filter(t=>compactMpn(t).length>=MIN_STEM&&/\d/.test(t)&&!SIZE_CODES.test(t)&&!hasOhmUnit(t));
  for(const t of tokens){const hit=lookupMpn(index,t,{family:false});if(hit)return hit}
  if(whole)return whole;
 }
 // Value-only labels ("10k", "4K7", "100R 1%") name a resistance rather than a part number.
 const wantsResistor=p.type==='resistor'||/resistor/i.test(p.package||'');
 for(const text of texts){
  for(const t of text.split(/[\s,;()\/|]+/)){
   if(!hasOhmUnit(t)&&!(wantsResistor&&/^\d+(?:[.,]\d+)?$/.test(t)&&!SIZE_CODES.test(t)))continue;
   const hit=lookupResistor(index,parseOhms(t),text+' '+(p.package||''));
   if(hit)return hit;
  }
 }
 return null;
}

// Free-text search for the directory: every word must appear in the entry; a resistance such as
// "10k" matches by value. Returns {results,total} with results capped at `limit`.
export function searchPartMaster(index,query,limit=40){
 if(!index)return {results:[],total:0};
 const words=String(query||'').toUpperCase().split(/\s+/).filter(Boolean);
 if(!words.length)return {results:[],total:0};
 const compactQuery=compactMpn(query);
 const tests=words.map(w=>{const ohms=hasOhmUnit(w)?parseOhms(w):NaN;const cw=compactMpn(w);return e=>e.hay.includes(w)||(Number.isFinite(ohms)&&e.kind==='resistor'&&Math.abs(e.ohms-ohms)<=ohms*1e-6)||(cw.length>=2&&e.compact.includes(cw))});
 const scored=[];
 for(const e of index.entries){
  if(!tests.every(t=>t(e)))continue;
  const score=e.compact===compactQuery?4:compactQuery&&e.compact.startsWith(compactQuery)?3:words.some(w=>e.mpn.toUpperCase().includes(w))?2:1;
  scored.push([score,e]);
 }
 scored.sort((a,b)=>b[0]-a[0]||a[1].compact.length-b[1].compact.length||a[1].mpn.localeCompare(b[1].mpn));
 return {results:scored.slice(0,limit).map(s=>s[1]),total:scored.length};
}

// Board-studio component family for an entry (drives colour, body shape and the type label).
export function knowledgeType(e){
 if(!e)return 'other';
 if(e.kind==='resistor')return /PTC resettable|Varistor/i.test(e.type)?'fuse':'resistor';
 if(e.category==='Diode')return 'diode';
 if(e.category==='Optoelectronic')return /LED|7-segment/i.test(e.subType)?'led':'chip';
 if(e.category==='Transistor')return 'transistor';
 if(/^Module/i.test(e.package))return 'module';
 return 'chip';
}
// Inventory category for an entry.
export function knowledgeCategory(e){
 if(!e)return 'Uncategorized';
 if(e.kind==='resistor')return /PTC resettable|Varistor/i.test(e.type)?'Circuit protection':'Resistors';
 if(/^Module/i.test(e.package))return 'Modules';
 return {Diode:'Diodes',Optoelectronic:'Optoelectronics',Transistor:'Transistors','Power IC':'Power management','Analog IC':/Op-amp/i.test(e.subType)?'Amplifiers':'Analog ICs','Interface IC':'Interface ICs','Logic IC':'Timers & logic','Memory IC':'Memory','Microcontroller / SoC / RF':'Microcontrollers','FPGA / CPLD / Processor':'Programmable logic'}[e.category]||'Uncategorized';
}
// First manufacturer named for an entry ("ON Semi / Diodes Inc / Vishay" → "ON Semi").
export const manufacturerOf=e=>String(e?.manufacturer||'').split(/\s*\/\s*/)[0].replace(/\s*\(.*?\)\s*$/,'').trim();

// Alternates / cross-reference column → [{label,mpn}]; mpn is null when the text names a series
// ("SMBJ series 600W", "1N47xx 1W") rather than an orderable number.
export function alternatesOf(e){
 const text=e?.kind==='resistor'?e.crossRef:e?.alternates;
 return String(text||'').split(/\s*[;,]\s*/).map(s=>s.trim()).filter(Boolean).map(label=>{
  const token=label.split(/\s+/).find(t=>/\d/.test(t)&&/^[A-Za-z0-9][A-Za-z0-9.\-\/+#]*$/.test(t)&&t.length>=3&&!/^\d+(?:\.\d+)?[VAWK]?$/i.test(t)&&!/X{2}|…/i.test(t));
  return {label,mpn:token||null};
 });
}
// Short line describing how a lookup result relates to the board part.
export function matchLine(know){
 if(!know)return '';
 const e=know.entry;
 return know.match==='exact'?'Exact part number':know.match==='variant'?`Ordering variant of ${e.mpn}`:know.match==='family'?`Closest in the family · ${know.family.length} listed`:`Matched by value${know.sized?'':' · size not stated'} · ${know.family.length} forms listed`;
}
