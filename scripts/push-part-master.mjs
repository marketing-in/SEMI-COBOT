// Loads the part master catalogue into the Supabase table part_master, so the app reads it from the
// database and the team can edit it in the Table Editor. Uses public/data/part-master.json (built from
// data/part-master.xlsx by scripts/make-part-master.mjs), or a JSON file given as the first argument.
// Rows already there are updated by part number, never doubled; running it again is safe.
// Prints counts only, never keys.
//   node --env-file=.env scripts/push-part-master.mjs
import {readFileSync} from 'node:fs';
import {storageConfig,inventoryBackend,catalogueRows} from '../hosted.mjs';

const cfg=storageConfig(process.env);
if(cfg?.kind!=='supabase'){console.error(cfg?.error==='publishable'?'SUPABASE_SECRET_KEY holds the publishable key; use the secret key (Project Settings → API Keys).':'Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.');process.exit(1)}
const file=process.argv[2]||new URL('../public/data/part-master.json',import.meta.url);
let json;try{json=JSON.parse(readFileSync(file,'utf8'))}catch(e){console.error('Could not read the part master file:',e.message);process.exit(1)}
const rows=catalogueRows(json);
console.log(`Part master file: ${json.semiconductors?.length||0} semiconductors, ${json.resistors?.length||0} resistors (${rows.length} rows).`);
const db=inventoryBackend(cfg);
try{
 await db.seedCatalogue(json,(done,total)=>process.stdout.write(`\r  uploaded ${done} / ${total}`));
 const back=await db.catalogue();
 console.log(`\nDone. part_master now holds ${back?.semiconductors.length||0} semiconductors and ${back?.resistors.length||0} resistors.`);
 console.log('Open the app: the Part master page shows "Catalogue: Supabase".');
}catch(e){
 console.error('\nFailed:',e.code==='missing-table'?'the part_master table is missing. Run supabase/schema.sql in the Supabase SQL editor first.':e.message);process.exit(1)}
