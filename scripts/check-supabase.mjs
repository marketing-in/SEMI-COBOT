// Checks the hosted database before deploying: the secret key can write, read, count and delete in
// public.semicobot_kv and use the shared inventory tables, and the publishable key (SUPABASE_PUBLISHABLE_KEY,
// optional) can do none of it.
//   node --env-file=.env scripts/check-supabase.mjs
// Uses one throwaway row and removes it. Prints results only, never keys or accounts.
import {storageConfig,backendFor,inventoryBackend} from '../hosted.mjs';

const cfg=storageConfig(process.env);
if(cfg?.kind!=='supabase'){console.error(cfg?.error==='publishable'?'SUPABASE_SECRET_KEY holds the publishable key; use the secret key.':'Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.');process.exit(1)}
const db=backendFor(cfg),probe='semicobot:check:'+Date.now();let ok=true;
const step=async(name,fn)=>{try{const r=await fn();console.log('ok  ',name+(r?` (${r})`:''))}catch(e){ok=false;console.log('FAIL',name,'-',e.code==='missing-table'?'table missing: run supabase/schema.sql in the SQL editor':e.message)}};
await step('secret key writes a row',()=>db.set(probe,'1',60));
await step('secret key reads it back',async()=>{if(await db.get(probe)!=='1')throw new Error('read a different value')});
await step('counter increments',async()=>{const n=await db.incr(probe+':n',60);if(n!==1)throw new Error('got '+n);return 'atomic function works'});
await step('secret key deletes',async()=>{await db.del(probe);await db.del(probe+':n');if(await db.get(probe)!==null)throw new Error('row still there')});
// Shared inventory: the tables and functions exist and the secret key can use them (read-only: the
// functions are called with no changes, so nothing in stock is touched).
const inv=inventoryBackend(cfg);
await step('shared inventory tables are readable',async()=>{const s=await inv.pull();return `${s.parts.length} parts, ${s.ledger.orders.length} purchase orders`});
await step('shared inventory functions are callable',async()=>{await inv.apply({parts:[],ledger:{}});const raw=await fetch(cfg.url+'/rest/v1/rpc/inventory_apply',{method:'POST',headers:{apikey:cfg.key,...(/^sb_/.test(cfg.key)?{}:{Authorization:'Bearer '+cfg.key}),'Content-Type':'application/json'},body:'{"changes":[],"who":"check"}'});if(!raw.ok)throw new Error(raw.status===404?'inventory_apply missing: run supabase/schema.sql again':'HTTP '+raw.status)});
await step('part master tables are readable',async()=>{const c=await inv.catalogue();return c?`${c.semiconductors.length} semiconductors, ${c.resistors.length} resistors in part_master`:'part_master is empty: run scripts/push-part-master.mjs'});
const pub=process.env.SUPABASE_PUBLISHABLE_KEY;
if(pub){const open=backendFor({kind:'supabase',url:cfg.url,key:pub});
 await step('publishable key cannot read accounts',async()=>{if(await open.get('semicobot:auth').catch(()=>null)!==null)throw new Error('the public key can read the account row: run supabase/schema.sql again')});
 await step('publishable key cannot write',async()=>{let wrote=true;await open.set(probe+':pub','x').catch(()=>{wrote=false});if(wrote){await db.del(probe+':pub');throw new Error('the public key could write: run supabase/schema.sql again')}});
 await step('publishable key cannot read the part master',async()=>{const r=await fetch(cfg.url+'/rest/v1/part_master?select=mpn&limit=1',{headers:{apikey:pub}});const rows=r.ok?await r.json():[];if(r.ok&&rows.length)throw new Error('the public key can read part_master: run supabase/schema.sql again')});
 await step('publishable key cannot read the inventory',async()=>{const r=await fetch(cfg.url+'/rest/v1/inventory_parts?select=id&limit=1',{headers:{apikey:pub}});const rows=r.ok?await r.json():[];if(r.ok&&rows.length)throw new Error('the public key can read inventory_parts: run supabase/schema.sql again')});
 await step('publishable key cannot call the counter',async()=>{let ran=true;await open.incr(probe+':pub',60).catch(()=>{ran=false});if(ran){await db.del(probe+':pub');throw new Error('the public key could call semicobot_incr')}})}
else console.log('skip publishable-key checks (set SUPABASE_PUBLISHABLE_KEY to run them)');
console.log(ok?'\nThe database is ready.':'\nFix the failures above, then run this again.');process.exit(ok?0:1);
