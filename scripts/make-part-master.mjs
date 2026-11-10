// Converts the part master workbook (data/part-master.xlsx: Semiconductors + Resistors sheets)
// into public/data/part-master.json, the knowledge base the studio inspector and the directory
// search read. Rows are stored as arrays (field order in *Fields) to keep the file small.
//   node scripts/make-part-master.mjs [workbook.xlsx]
import ExcelJS from 'exceljs';
import {writeFile,mkdir} from 'node:fs/promises';
export const SEMI_FIELDS=['category','subType','mpn','manufacturer','description','specs','package','mount','use','alternates'];
export const RES_FIELDS=['type','size','value','ohms','tolerance','power','maxV','tcr','mpn','manufacturer','crossRef','packaging'];
const SEMI_HEADERS=['Category','Sub-type','Manufacturer Part Number (MPN)','Manufacturer(s)','Description','Key Specs','Package','Mount','Typical Use','Common Alternates / Cross-reference'];
const RES_HEADERS=['Type','Size / Form','Value','Ohms (numeric)','Tolerance','Power','Max V','TCR / Note','Manufacturer Part Number (MPN)','Manufacturer','Cross-reference (other brands)','Packaging'];
const cell=v=>v==null?'':typeof v==='object'?(v.richText?v.richText.map(t=>t.text).join(''):v.result!==undefined?String(v.result):v.text!==undefined?String(v.text):''):String(v);
// Trims, collapses whitespace, turns the workbook's em-dash placeholders into empty strings and
// repairs the "10VV" typo in the Zener spec column.
const clean=s=>{const t=cell(s).replace(/\s+/g,' ').trim();return t==='—'||t==='-'?'':t.replace(/(\d)VV\b/g,'$1V')};
function readSheet(ws,headers,name){
 const head=ws.getRow(1).values.slice(1).map(clean);
 headers.forEach((h,i)=>{if(head[i]!==h)throw new Error(`${name} sheet column ${i+1} should be "${h}" but is "${head[i]}"`)});
 const rows=[];ws.eachRow((row,i)=>{if(i===1)return;const v=row.values.slice(1,headers.length+1);while(v.length<headers.length)v.push('');rows.push(v)});
 return rows;
}
export async function buildPartMaster(file){
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(file);
 const semiSheet=wb.getWorksheet('Semiconductors'),resSheet=wb.getWorksheet('Resistors');
 if(!semiSheet||!resSheet)throw new Error('The workbook needs "Semiconductors" and "Resistors" sheets.');
 const seen=new Set();
 const semiconductors=readSheet(semiSheet,SEMI_HEADERS,'Semiconductors').map(v=>v.map(clean)).filter(v=>v[2]).filter(v=>{const k=v[2].toUpperCase();if(seen.has(k))return false;seen.add(k);return true});
 const resistors=readSheet(resSheet,RES_HEADERS,'Resistors').map(v=>v.map((x,i)=>i===3?(Number.isFinite(+cell(x))&&cell(x)!==''?+cell(x):null):clean(x))).filter(v=>v[8]).filter(v=>{const k=v[8].toUpperCase();if(seen.has(k))return false;seen.add(k);return true});
 return {version:1,source:'Semiconductor & Resistor Part Master',semiconductorFields:SEMI_FIELDS,resistorFields:RES_FIELDS,semiconductors,resistors};
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].replace(/^.*\//,''))){
 const file=process.argv[2]||'data/part-master.xlsx';
 const json=await buildPartMaster(file);
 await mkdir('public/data',{recursive:true});await writeFile('public/data/part-master.json',JSON.stringify(json));
 console.log(`Part master: ${json.semiconductors.length} semiconductors, ${json.resistors.length} resistors → public/data/part-master.json`);
}
