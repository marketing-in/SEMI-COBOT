// KiCad Interactive HTML BOM (ibom.html, from the InteractiveHtmlBom plugin) shipped with a Gerber set.
// Its board data is LZ-String compressed inside the page; it holds every footprint's designator and the
// BOM fields the designer chose (Value, Footprint, and often MPN or Manufacturer). parseIbom returns a
// Map designator → {value, package, mpn, manufacturer, fields} so the Gerber parts get their real data.

// LZ-String decompressFromBase64 (the published format, written out here; no dependency).
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
export function lzDecompressBase64(input){
 if(!input)return '';const map={};for(let i=0;i<B64.length;i++)map[B64[i]]=i;
 const s=String(input).replace(/[^A-Za-z0-9+/=]/g,'');const length=s.length,resetValue=32;
 const getNext=i=>map[s.charAt(i)];
 const dictionary=[0,1,2];let enlargeIn=4,dictSize=4,numBits=3,entry='',result=[],w,c;
 const data={val:getNext(0),position:resetValue,index:1};
 const bits=n=>{let b=0,p=1;const max=Math.pow(2,n);while(p!==max){const r=data.val&data.position;data.position>>=1;if(data.position===0){data.position=resetValue;data.val=getNext(data.index++)}b|=(r>0?1:0)*p;p<<=1}return b};
 switch(bits(2)){case 0:c=String.fromCharCode(bits(8));break;case 1:c=String.fromCharCode(bits(16));break;case 2:return '';}
 dictionary[3]=c;w=c;result.push(c);
 for(let guard=0;guard<5e7;guard++){if(data.index>length+1)return '';
  let cc=bits(numBits);
  switch(cc){case 0:dictionary[dictSize++]=String.fromCharCode(bits(8));cc=dictSize-1;enlargeIn--;break;
   case 1:dictionary[dictSize++]=String.fromCharCode(bits(16));cc=dictSize-1;enlargeIn--;break;
   case 2:return result.join('');}
  if(enlargeIn===0){enlargeIn=Math.pow(2,numBits);numBits++}
  if(dictionary[cc])entry=dictionary[cc];else if(cc===dictSize)entry=w+w.charAt(0);else return '';
  result.push(entry);dictionary[dictSize++]=w+entry.charAt(0);enlargeIn--;w=entry;
  if(enlargeIn===0){enlargeIn=Math.pow(2,numBits);numBits++}}
 return result.join('');
}

export const isIbom=text=>/pcbdata\s*=\s*(JSON\.parse\(LZString\.decompressFromBase64\(|\{)/.test(String(text||'').slice(0,4e6));

// The page's board data and the BOM field names.
export function ibomData(html){
 const t=String(html||'');let pcb=null;
 const z=/pcbdata\s*=\s*JSON\.parse\(LZString\.decompressFromBase64\("([^"]+)"\)\)/.exec(t);
 if(z){try{pcb=JSON.parse(lzDecompressBase64(z[1]))}catch{pcb=null}}
 else{const j=/pcbdata\s*=\s*(\{[\s\S]*?\})\s*\n\s*var\s+config/.exec(t);if(j){try{pcb=JSON.parse(j[1])}catch{pcb=null}}}
 let fields=['Value','Footprint'];const cf=/var\s+config\s*=\s*(\{[^\n]*\})/.exec(t);if(cf){try{const c=JSON.parse(cf[1]);if(Array.isArray(c.fields))fields=c.fields}catch{}}
 return pcb?{pcb,fields}:null;
}

const pick=(names,row,re)=>{const i=names.findIndex(n=>re.test(n));return i>=0?String(row[i]??'').trim():''};
export function parseIbom(html){
 const d=ibomData(html);const out=new Map();if(!d)return out;const {pcb,fields}=d;const bom=pcb.bom||{};
 // Newer pages: bom.fields[footprintIndex] = [values in config.fields order]; groups list [ref, index].
 // Older pages: each group is [qty, value, footprint, [[ref, index]...], extraFields].
 const rowOf=i=>Array.isArray(bom.fields?.[i])?bom.fields[i]:null;
 const add=(ref,row)=>{if(!ref||!row)return;const value=pick(fields,row,/^value$/i),pkg=pick(fields,row,/^(footprint|package)$/i);
  const mpn=pick(fields,row,/^(mpn|manufacturer ?part ?(number|no\.?|#)?|mfr\.? ?part ?(number|no\.?|#)?|part ?number|mfg ?part ?(number|no)?)$/i);
  const manufacturer=pick(fields,row,/^(manufacturer|mfr\.?|mfg\.?)$/i);
  const extra=Object.fromEntries(fields.map((f,k)=>[f,String(row[k]??'').trim()]).filter(([,v])=>v));
  out.set(String(ref).toUpperCase(),{value,package:pkg.replace(/^[^:]+:/,''),mpn,manufacturer,fields:extra})};
 for(const group of [...(bom.both||[]),...(bom.F||[]),...(bom.B||[])]){
  if(!Array.isArray(group))continue;
  if(group.length&&Array.isArray(group[0])&&typeof group[0][0]==='string'){for(const [ref,i] of group)add(ref,rowOf(i))}
  else if(typeof group[0]==='number'&&Array.isArray(group[3])){const row=[group[1],group[2],...(Array.isArray(group[4])?group[4]:[])];const names=['Value','Footprint',...fields.filter(f=>!/^(value|footprint)$/i.test(f))];
   for(const r of group[3]){const ref=Array.isArray(r)?r[0]:r;const value=String(group[1]??''),pkg=String(group[2]??'');out.set(String(ref).toUpperCase(),{value,package:pkg.replace(/^[^:]+:/,''),mpn:pick(names,row,/^(mpn|manufacturer ?part ?(number|no\.?|#)?|part ?number)$/i),manufacturer:pick(names,row,/^(manufacturer|mfr\.?|mfg\.?)$/i),fields:{}})}}
 }
 // Footprints the BOM groups skipped still have a designator in the footprint list.
 return out;
}

// KiCad footprint names as package names: "Resistor_SMD:R_1206_HandSoldering" → "1206",
// "D_SMA_Handsoldering" → "SMA", "DIP-28_W7.62mm" → "DIP-28", "TO-220-3_Vertical" → "TO-220-3".
export function cleanFootprint(fp){
 let s=String(fp||'').replace(/^[^:]+:/,'').trim();if(!s)return '';
 s=s.replace(/_(Hand_?Soldering|Handsoldering|HandSoldering|Vertical|Horizontal|LowProfile|Pad[\d.x]+mm.*|HandSolder)$/i,'').replace(/_(Hand_?Soldering|Handsoldering)/i,'');
 let m=/^(?:R|C|L|D|LED|CP|Fuse|FB)_(0201|0402|0603|0805|1206|1210|1812|2010|2512|SMA|SMB|SMC|SOD-\d+\w*|MELF|MiniMELF)\b/i.exec(s);if(m)return m[1].toUpperCase().replace('MINIMELF','MiniMELF');
 m=/^(DIP|SOIC|SSOP|TSSOP|MSOP|QFN|QFP|LQFP|TQFP|SOT|TO|DFN|SON|SOD|BGA)-?(\d+(?:-\d+)?)/i.exec(s);if(m)return `${m[1].toUpperCase()}-${m[2]}`;
 m=/^CP_Radial_D([\d.]+)mm_P([\d.]+)mm/i.exec(s);if(m)return `Radial D${m[1]} mm, ${m[2]} mm pitch`;
 m=/^LED_D([\d.]+)mm/i.exec(s);if(m)return `LED ${m[1]} mm`;
 return s.replace(/_/g,' ').slice(0,40);
}
