// BOM files that travel with a Gerber set (JLCPCB, KiCad, Altium, EasyEDA exports and hand-made sheets):
// one row per part or per group of designators, with the part number, manufacturer, value, footprint
// and supplier part number. parseBomText returns a Map designator → {mpn, manufacturer, value, package,
// supplierPn, supplier}, so the Gerber board's parts get their real part numbers.

const H={
 ref:/^(designators?|ref(erence)?s?|ref ?des(ignators?)?|refdes|parts?|part ?references?|component ?refs?|locations?)$/i,
 mpn:/^(mpn|manufacturer ?part ?(number|no\.?|#)?|mfr\.? ?part ?(number|no\.?|#)?|mfg\.? ?part ?(number|no\.?|#)?|manufacturer_part_number|mfr ?p\/?n|mfg ?p\/?n|part ?number|part ?no\.?|p\/?n)$/i,
 manufacturer:/^(manufacturer( ?name)?|mfr\.?|mfg\.?|maker|brand|vendor)$/i,
 value:/^(value|val|comment|description|desc)$/i,
 package:/^(footprint|package|pattern|case|package\/case|footprint ?name)$/i,
 supplierPn:/^(lcsc( ?part)?( ?(number|no\.?|#))?|jlcpcb ?part ?(number|no\.?|#)?|digi-?key ?(part ?)?(number|no\.?|#|pn)?|mouser ?(part ?)?(number|no\.?|#|pn)?|supplier ?part ?(number|no\.?|#)?|spn)$/i};
const SUPPLIER=h=>/lcsc|jlc/i.test(h)?'LCSC':/digi/i.test(h)?'DigiKey':/mouser/i.test(h)?'Mouser':'Supplier';
const clean=v=>String(v??'').replace(/^﻿/,'').trim();
const empty=v=>!v||/^(~|-|—|n\/?a|none|dnp|not ?fitted|nc)$/i.test(v);

function split(line,d){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];
 if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q;continue}if(!q&&c===d){out.push(cur);cur='';continue}cur+=c}out.push(cur);return out.map(clean)}

// "C1, C2 C3", "R1-R4", "U1;U2" → each designator.
export function expandRefs(text){
 const out=[];for(const tok of String(text||'').split(/[\s,;]+/).filter(Boolean)){
  const m=/^([A-Za-z_]+)(\d+)\s*[-–]\s*(?:([A-Za-z_]+))?(\d+)$/.exec(tok);
  if(m&&(!m[3]||m[3]===m[1])&&+m[4]>=+m[2]&&+m[4]-+m[2]<500){for(let n=+m[2];n<=+m[4];n++)out.push(m[1]+n)}
  else if(/^[A-Za-z_]+\d+[A-Za-z]?$/.test(tok))out.push(tok)}
 return out;
}

// A table looks like a BOM when it names designators and a part number, value or manufacturer, and has no X/Y.
export function bomHeader(cells){
 const c=cells.map(clean);const ref=c.findIndex(x=>H.ref.test(x));if(ref<0)return null;
 if(c.some(x=>/^(x|y|posx|posy|mid ?x|mid ?y|center-?x|center-?y)(\s*\(.*\))?$/i.test(x)))return null;
 const col={ref};for(const k of ['mpn','manufacturer','value','package','supplierPn']){const i=c.findIndex(x=>H[k].test(x));if(i>=0)col[k]=i}
 if(col.mpn==null&&col.value==null&&col.supplierPn==null&&col.manufacturer==null)return null;
 if(col.supplierPn!=null)col.supplier=SUPPLIER(c[col.supplierPn]);
 return col;
}

export function looksLikeBom(text){
 const lines=String(text||'').split(/\r?\n/).slice(0,15);
 for(const l of lines)for(const d of [',','\t',';'])if(l.includes(d)&&bomHeader(split(l,d)))return true;
 return false;
}

export function parseBomText(text){
 const lines=String(text||'').split(/\r?\n/);let at=-1,d=',',col=null;
 for(let i=0;i<Math.min(lines.length,30)&&at<0;i++)for(const dl of [',','\t',';']){if(!lines[i].includes(dl))continue;const c=bomHeader(split(lines[i],dl));if(c){at=i;d=dl;col=c;break}}
 const map=new Map();if(at<0)return map;
 for(const line of lines.slice(at+1)){if(!line.trim())continue;const cells=split(line,d);
  const get=k=>col[k]==null?'':clean(cells[col[k]]);
  const entry={mpn:empty(get('mpn'))?'':get('mpn'),manufacturer:empty(get('manufacturer'))?'':get('manufacturer'),value:empty(get('value'))?'':get('value'),package:empty(get('package'))?'':get('package'),
   supplierPn:empty(get('supplierPn'))?'':get('supplierPn'),supplier:col.supplier||''};
  if(!entry.mpn&&!entry.value&&!entry.supplierPn)continue;
  for(const ref of expandRefs(get('ref')))if(!map.has(ref.toUpperCase()))map.set(ref.toUpperCase(),entry);
 }
 return map;
}
