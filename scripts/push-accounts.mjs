// Copies the local accounts (data/auth.json, or AUTH_FILE) to the hosted database, so the same admin and
// members can sign in on Vercel. Uses SUPABASE_URL + SUPABASE_SECRET_KEY (or the Upstash variables) from .env:
//   node --env-file=.env scripts/push-accounts.mjs [--replace]
// Prints only counts, never accounts. Refuses to overwrite accounts already online unless --replace.
import {readFileSync} from 'node:fs';
import {storageConfig,backendFor} from '../hosted.mjs';

const cfg=storageConfig(process.env);
if(!cfg||cfg.error){console.error(cfg?.error==='publishable'?'SUPABASE_SECRET_KEY holds the publishable key; use the secret key.':'Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env first.');process.exit(1)}
const file=process.env.AUTH_FILE||new URL('../data/auth.json',import.meta.url);
let local;try{local=JSON.parse(readFileSync(file,'utf8'))}catch{console.error('No local accounts found at data/auth.json.');process.exit(1)}
const users=local.users||(local.admin?[{...local.admin,role:'admin'}]:[]);
if(!users.length||!local.secret){console.error('The local account file has no accounts.');process.exit(1)}
const db=backendFor(cfg),key=(process.env.KV_PREFIX||'semicobot')+':auth';
try{
 const online=JSON.parse(await db.get(key)||'null');
 if(online?.users?.length&&!process.argv.includes('--replace')){console.error(`The database already holds ${online.users.length} account(s). Run again with --replace to overwrite them.`);process.exit(1)}
 await db.set(key,JSON.stringify({secret:local.secret,users}));
}catch(e){console.error(e.code==='missing-table'?'The table is missing: run supabase/schema.sql in the Supabase SQL editor first.':'The database refused the request: '+e.message);process.exit(1)}
console.log(`Copied ${users.length} account(s) (${users.filter(u=>u.role==='admin').length} admin) to the ${cfg.kind==='supabase'?'Supabase':'Upstash'} database.`);
