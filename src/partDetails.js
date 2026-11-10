// Part details for the component directory, local first: details saved in this browser, then the
// bundled part master, and only then a Google search through the server (/api/partinfo, SerpApi),
// whose answer is saved so the same part number is never searched twice. Everything saved exports
// to, and imports from, a .json file.
import {manufacturerOf} from './partMaster.js';

export const DETAILS_KEY='semicobot-part-details-v1';
export const keyOf=mpn=>String(mpn||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

export function loadDetails(storage){try{const v=JSON.parse(storage?.getItem(DETAILS_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}}
export function saveDetails(storage,map){try{storage?.setItem(DETAILS_KEY,JSON.stringify(map));return true}catch{return false}}

// Details the part master already knows (no network).
export function fromKnowledge(e){
 if(!e)return null;
 return {mpn:e.mpn||'',manufacturer:manufacturerOf(e),title:'',description:e.description||'',package:e.package||e.size||'',datasheet:'',family:[e.category,e.subType].filter(Boolean).join(' / '),
  specs:String(e.specs||'').split(/\s*[;,]\s*/).filter(Boolean).slice(0,8).map(value=>({name:'',value})),links:[],source:'part-master'};
}

// Saved copy first; otherwise ask the server, which answers from its own JSON store or searches.
export async function lookupDetails(mpn,{saved,fetcher}){
 const k=keyOf(mpn);if(!k)throw Error('Enter a part number.');if(saved[k])return {info:saved[k],from:'saved'};
 const r=await fetcher('/api/partinfo?mpn='+encodeURIComponent(String(mpn).trim()));
 let j;try{j=await r.json()}catch{throw Error('Part details service offline. Run npm run server.')}
 if(!r.ok)throw Error(j.error||'Lookup failed.');
 const {cached,...info}=j;return {info:clean(info)||{mpn},from:cached?'server':'online'};
}

// Only plain text fields and https links survive: imported files are untrusted.
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const https=v=>{try{return typeof v==='string'&&new URL(v).protocol==='https:'?v:''}catch{return ''}};
export function clean(d){
 if(!d||typeof d!=='object')return null;const mpn=str(d.mpn,100).trim();if(!keyOf(mpn))return null;
 return {mpn,manufacturer:str(d.manufacturer,80),title:str(d.title,160),description:str(d.description,400),package:str(d.package,40),datasheet:https(d.datasheet),
  specs:(Array.isArray(d.specs)?d.specs:[]).slice(0,20).map(s=>({name:str(s?.name,40),value:str(s?.value,60)})).filter(s=>s.value),
  links:(Array.isArray(d.links)?d.links:[]).slice(0,8).map(l=>({title:str(l?.title,140),link:https(l?.link),source:str(l?.source,60)})).filter(l=>l.link),
  source:str(d.source,20)||'import',fetchedAt:str(d.fetchedAt,40)};
}

// The directory as JSON: the board's components with whatever details are known, plus every saved entry.
export function exportJson({board,rows,saved,detailsOf}){
 return {format:'semi-cobot-components',version:1,exportedAt:new Date().toISOString(),board:{id:board.id,name:board.name,width:board.width,height:board.height},
  // Each component in the catalogue's recommended fields, plus the board references and details.
  components:rows.map(r=>{const d=detailsOf(r)||null;return {main_category:r.cls?.category||'',component_type:r.cls?.type||'',subtype:r.cls?.subtype||'',manufacturer:d?.manufacturer||'',mpn:r.mpn,
   mounting_style:r.cls?.mounting||'',package:r.package||d?.package||'',specifications:Object.fromEntries((d?.specs||[]).filter(s=>s.name).map(s=>[s.name,s.value])),
   value:r.value,type:r.type,refs:r.refs,quantity:r.refs.length,details:d}}),saved};
}
// Accepts this app's export, a plain {key: details} map, or an array of details. Returns a key → details map.
export function importJson(obj){
 const list=Array.isArray(obj)?obj:obj?.format==='semi-cobot-components'?[...Object.values(obj.saved||{}),...(obj.components||[]).map(c=>c.details&&c.details.source!=='part-master'?c.details:null)]:obj&&typeof obj==='object'?Object.values(obj):[];
 const out={};for(const d of list){const c=clean(d);if(c)out[keyOf(c.mpn)]=c}return out;
}

// --- Excel ---------------------------------------------------------------------------------------
// The same directory as an Excel workbook (ExcelJS passed in, so this stays testable in Node):
// "Components" in the catalogue's fields with filters on every column, and "Catalogue" with every
// category, type and subtype and how many of the board's part numbers fall in each.
export const EXCEL_COLUMNS=[['Main category','main_category',26],['Component type','component_type',26],['Subtype','subtype',26],['MPN','mpn',26],['Manufacturer','manufacturer',22],
 ['Description','description',48],['Package','package',16],['Mounting','mounting_style',22],['Value','value',12],['References','refs',22],['Quantity','quantity',10],['Datasheet','datasheet',40],['Specifications','specifications',40],['Details source','source',14]];
const specText=d=>(d?.specs||[]).map(s=>s.name?`${s.name}: ${s.value}`:s.value).join('; ');
export function excelRows({rows,detailsOf}){
 return rows.map(r=>{const d=detailsOf(r)||null;return {main_category:r.cls?.category||'',component_type:r.cls?.type||'',subtype:r.cls?.subtype||'',mpn:r.mpn||'',manufacturer:d?.manufacturer||'',
  description:d?.description||'',package:r.package||d?.package||'',mounting_style:r.cls?.mounting||'',value:r.value||'',refs:r.refs.join(', '),quantity:r.refs.length,datasheet:d?.datasheet||'',specifications:specText(d),source:d?.source||''}});
}
const styleHeader=ws=>{const h=ws.getRow(1);h.font={bold:true,color:{argb:'FFFCFBF8'}};h.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2B2A26'}};h.alignment={vertical:'middle'};h.height=20;
 ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:1,column:ws.columnCount}}};
export function buildWorkbook(ExcelJS,{board,rows,detailsOf,nodes=[],counts=new Map()}){
 const wb=new ExcelJS.Workbook();wb.creator='semi-cobot';wb.created=new Date();
 const ws=wb.addWorksheet('Components');ws.columns=EXCEL_COLUMNS.map(([header,key,width])=>({header,key,width}));
 for(const r of excelRows({rows,detailsOf}))ws.addRow(r);
 ws.getColumn('description').alignment={wrapText:true,vertical:'top'};styleHeader(ws);
 const cat=wb.addWorksheet('Catalogue');cat.columns=[{header:'Main category',key:'c',width:34},{header:'Component type',key:'t',width:32},{header:'Subtype',key:'s',width:34},{header:'Board part numbers',key:'n',width:20}];
 for(const n of nodes)if(n.level===2)cat.addRow({c:n.category,t:n.type,s:n.subtype,n:counts.get(`${n.category}|${n.type}|${n.subtype}`)||0});styleHeader(cat);
 const info=wb.addWorksheet('Board');info.columns=[{header:'Field',key:'k',width:20},{header:'Value',key:'v',width:40}];
 [['Board',board?.name||''],['Size (mm)',board?`${Math.round(board.width)} × ${Math.round(board.height)}`:''],['Part numbers',rows.length],['Parts',rows.reduce((t,r)=>t+r.refs.length,0)],['Exported',new Date().toISOString()]].forEach(([k,v])=>info.addRow({k,v}));styleHeader(info);
 return wb;
}
// Details back from a workbook: the "Components" sheet (or the first), matched by column header.
export async function readWorkbook(ExcelJS,buffer){
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);const ws=wb.getWorksheet('Components')||wb.worksheets[0];if(!ws)return {};
 const head=ws.getRow(1).values.map(v=>String(v?.text??v??'').trim().toLowerCase()),col=name=>head.indexOf(name);
 if(col('mpn')<1)throw Error('The first row needs an MPN column.');const out={};
 ws.eachRow((row,i)=>{if(i===1||i>5001)return;const cell=name=>{const c=col(name);if(c<1)return '';const v=row.getCell(c);return String(v.text??'').trim()};
  const specs=cell('specifications').split(/\s*;\s*/).filter(Boolean).map(s=>{const m=/^([^:]{1,40}):\s*(.+)$/.exec(s);return m?{name:m[1],value:m[2]}:{name:'',value:s}});
  const src=cell('details source');if(src==='part-master')return;
  const c=clean({mpn:cell('mpn'),manufacturer:cell('manufacturer'),description:cell('description'),package:cell('package'),datasheet:cell('datasheet'),specs,source:'import'});
  if(c&&(c.manufacturer||c.description||c.datasheet||c.specs.length))out[keyOf(c.mpn)]=c});
 return out;
}
