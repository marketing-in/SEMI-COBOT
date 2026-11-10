// Gerber sets for the bare-PCB quote: read a ZIP or loose layer files, then take from the parsed set
// what a fab's quote form asks for (outline size, copper layer count, smallest drilled hole) and the
// colours to draw the bare board in the chosen mask, legend and finish.
import {PCB_SPEC} from './bom.js';

export const GERBER_FILE=/\.(zip|gbr|ger|pho|art|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm\d+|gml|g\d+|gl\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|drd|exc|nc|tap|oln|dim)$/i;

// files: File objects (a ZIP or layer files). Returns [{name, text}]; skips documents and archives inside the ZIP.
// An Excel BOM (or placement sheet) in the set becomes tab-separated text, so it is read like a CSV.
async function sheetText(bytes){try{const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);const ws=wb.worksheets[0];if(!ws)return '';const rows=[];
 ws.eachRow({includeEmpty:false},row=>{const vals=[];row.eachCell({includeEmpty:true},(c,i)=>{const v=c.value;vals[i-1]=String(v&&typeof v==='object'?(v.text??v.result??v.richText?.map(t=>t.text).join('')??''):v??'').replace(/[\t\r\n]+/g,' ')});rows.push(vals.join('\t'))});return rows.join('\n')}catch{return ''}}
export async function readGerberFiles(list){
 const {unzip,isZip}=await import('./unzip.js');const texts=[],dec=new TextDecoder();let total=0;
 for(const file of list){const bytes=new Uint8Array(await file.arrayBuffer());total+=bytes.length;if(total>60e6)throw Error('The Gerber set is larger than 60 MB.');
  // A ZIP may hold another ZIP (a project folder with Gerber.zip and an ibom.html beside it): opened one level deep.
  const take=async(entries,depth)=>{for(const e of entries){const base=e.name.split('/').pop();if(!base||e.bytes.length>25e6)continue;
   if(/\.zip$/i.test(base)){if(depth<1&&isZip(e.bytes)){total+=e.bytes.length;if(total>60e6)throw Error('The Gerber set is larger than 60 MB.');await take(await unzip(e.bytes),depth+1)}continue}
   if(/\.(pdf|png|jpe?g|step|stp|wrl|kicad_(?!pcb$)\w+|sch|brd|pcbdoc|xls|hex|bin|elf)$/i.test(base))continue;
   texts.push({name:base,text:/\.xlsx$/i.test(base)?await sheetText(e.bytes):dec.decode(e.bytes)})}};
  if(isZip(bytes))await take(await unzip(bytes),0)
  else texts.push({name:file.name,text:/\.xlsx$/i.test(file.name)?await sheetText(bytes):dec.decode(bytes)})}
 if(!texts.length)throw Error('The ZIP holds no Gerber, drill or placement files.');
 return texts}

// result: the output of buildGerberBoard. Copper layers are the top and bottom copper plus one per inner
// copper file; the smallest plated hole suggests the via option.
export function gerberFacts(result){
 const s=result.summary,b=result.board,copper=s.layers.filter(l=>l.kind==='copper');
 const layers=copper.reduce((n,l)=>n+(l.side==='inner'?l.names.length:1),0);
 const plated=(result.holes||[]).filter(h=>h.plated!==false&&!h.slot).map(h=>h.d).filter(d=>d>0);
 const hits=s.drills.reduce((n,d)=>n+d.hits,0),slots=s.drills.reduce((n,d)=>n+d.slots,0);
 const has=(kind,side)=>s.layers.some(l=>l.kind===kind&&(!side||l.side===side));
 return {widthMm:Math.round(b.width*10)/10,heightMm:Math.round(b.height*10)/10,layers:Math.max(1,layers),hits,slots,
  minHoleMm:plated.length?Math.round(Math.min(...plated)*1000)/1000:null,outline:has('outline'),mask:has('mask'),silk:has('silk'),
  files:s.layers.reduce((n,l)=>n+l.names.length,0)+s.drills.length,warnings:result.warnings.slice(0,3)}}

// The via option that matches the smallest plated hole in the drill file (the fab's columns are the
// hole size; a smaller hole needs the finer option).
export function viaOptionFor(minHoleMm){
 if(!(minHoleMm>0))return null;
 return minHoleMm<.2?'0.15':minHoleMm<.25?'0.2':minHoleMm<.3?'0.25':'0.3'}

// Render colours for the chosen spec: mask colour (a little lighter over copper), legend, and the finish
// (gold for ENIG, silver for HASL, copper for OSP).
const FINISH={enig:'#d9b45a',hasl:'#c9ccd1','lf-hasl':'#c9ccd1',osp:'#c98f5a'};
const mix=(hex,to,k)=>{const n=parseInt(hex.slice(1),16),m=parseInt(to.slice(1),16);const c=[16,8,0].map(s=>Math.round(((n>>s)&255)*(1-k)+((m>>s)&255)*k));return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')};
export function boardColors(spec={}){
 const mask=PCB_SPEC.find(f=>f.id==='color').options.find(o=>o.v===spec.color)?.swatch||'#0d4f31';
 const light=['#f4f4f0','#e0b422','#d9a521'].includes(mask);
 return {mask,maskOverCopper:mix(mask,light?'#000000':'#ffffff',light?.08:.18),silk:spec.silkscreen==='black'?'#1b1b1b':'#f2f2ec',finish:FINISH[spec.finish]||FINISH.hasl}}

// A board imported in the Board studio from Gerber files keeps them (gzipped JSON) as gerberSource.
// Returns the parsed set and the facts for the quote, marked with the board they came from.
export async function gerberFromBoard(board){
 const [{gunzipBase64},{buildGerberBoard}]=await Promise.all([import('./unzip.js'),import('./gerber.js')]);
 const name=board.fileName||board.name,result=buildGerberBoard(JSON.parse(await gunzipBase64(board.gerberSource)),{name});
 return {result,facts:{name,...gerberFacts(result),board:board.id,boardName:board.name}}}
