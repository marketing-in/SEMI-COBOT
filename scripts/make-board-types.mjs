// Builds public/data/board-types.json from the board-type knowledge workflow's journal (reviewed batch
// when present, otherwise the draft). Validates every entry and every regex.
// Usage: node scripts/make-board-types.mjs <journal.jsonl>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const rows=readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const labelOf=new Map(rows.filter(r=>r.type==='started').map(r=>[r.key,r.label]));
const batches={};for(const r of rows){if(r.type!=='result')continue;const label=labelOf.get(r.key)||'';const v=r.result??r.value;if(!v?.entries)continue;const [stage,group]=label.split(':');(batches[group]||={})[stage]=v.entries}
const types=[],problems=[],seen=new Set();
for(const [group,b] of Object.entries(batches)){const list=b.review||b.draft||[];
 for(const e of list){if(!e?.id||seen.has(e.id)){problems.push('duplicate or missing id '+e?.id);continue}seen.add(e.id);
  const pats=(e.signals?.mpnPatterns||[]).filter(p=>{try{new RegExp(p,'i');return true}catch{problems.push(`${e.id}: invalid regex ${p}`);return false}});
  types.push({...e,category:group,reviewed:!!b.review,signals:{...e.signals,mpnPatterns:pats,keywords:(e.signals?.keywords||[]).map(k=>String(k).toLowerCase()),connectors:(e.signals?.connectors||[]).map(k=>String(k).toLowerCase())}})}}
mkdirSync(new URL('../public/data/',import.meta.url),{recursive:true});
writeFileSync(new URL('../public/data/board-types.json',import.meta.url),JSON.stringify({version:1,generated:'board-type knowledge workflow, technically reviewed',types},null,0));
console.log(`${types.length} board types (${types.filter(t=>t.reviewed).length} reviewed) in ${Object.keys(batches).length} categories`);problems.forEach(p=>console.log('!',p));
