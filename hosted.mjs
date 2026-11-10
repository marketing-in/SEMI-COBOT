// Hosted deployments (Vercel). Functions have no lasting disk, so the accounts, sign-in failure counts
// and the part-info cache live in a database: Supabase (preferred) or Upstash Redis, both called with
// plain fetch. Without one the workspace stays closed: there is no open, sign-in-free mode online.
import {handleApi} from './api.mjs';

export class StorageError extends Error{constructor(message,code=''){super(message);this.code=code}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const MESSAGES={
 none:'The database is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the Vercel project settings, then redeploy.',
 publishable:'SUPABASE_SECRET_KEY holds the publishable key. Use the secret key (Supabase → Project Settings → API Keys).',
 'missing-table':'The database table is missing. Run supabase/schema.sql in the Supabase SQL editor.',
 'bad-key':'Supabase refused SUPABASE_SECRET_KEY. Copy the secret key again from Project Settings → API Keys.',
 'no-rights':'The server key has no rights on the table. Run supabase/schema.sql again in the Supabase SQL editor.',
 paused:'The Supabase project is paused. Restore it from the Supabase dashboard.',
 down:'The database is not answering. Try again in a minute.'};

// Which database to use. Supabase: SUPABASE_URL plus the secret key (SUPABASE_SECRET_KEY, or the legacy
// SUPABASE_SERVICE_ROLE_KEY). Upstash: KV_REST_API_* from the Vercel Marketplace, or UPSTASH_REDIS_REST_*.
export function storageConfig(env){
 const sbUrl=env.SUPABASE_URL,sbKey=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
 if(sbUrl&&sbKey){if(/^sb_publishable_/.test(sbKey))return {error:'publishable'};if(!/^https:\/\//.test(sbUrl))return {error:'none'};return {kind:'supabase',url:String(sbUrl).replace(/\/+$/,''),key:String(sbKey)}}
 const cfg=redisConfig(env);return cfg?{kind:'redis',...cfg}:null}
export function redisConfig(env){
 const url=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL,token=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN;
 return url&&token?{url:String(url).replace(/\/+$/,''),token:String(token)}:null}
export const backendFor=(cfg,fetcher=fetch)=>cfg.kind==='supabase'?supabaseBackend(cfg,fetcher):redisBackend(cfg,fetcher);

const send=async(fetcher,url,init)=>{let r;
 try{r=await fetcher(url,{...init,signal:AbortSignal.timeout(8000)})}catch{throw new StorageError('unreachable','down')}
 const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
 return {r,body}};

// Upstash: one command per request, POSTed as a JSON array; the answer is {result} or {error}.
export function redis(cfg,fetcher=fetch){
 return async(...cmd)=>{const {r,body}=await send(fetcher,cfg.url,{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json'},body:JSON.stringify(cmd.map(String))});
  if(!r.ok||!body||body.error)throw new StorageError(body?.error||'HTTP '+r.status,'down');return body.result}}
export function redisBackend(cfg,fetcher=fetch){const call=redis(cfg,fetcher);return {
 get:key=>call('GET',key),
 set:(key,value,ttl)=>ttl?call('SET',key,value,'EX',ttl):call('SET',key,value),
 // A counter left without an expiry (EXPIRE failed after INCR) gets one on its next increment.
 incr:async(key,ttl)=>{const n=Number(await call('INCR',key));if(n===1||Number(await call('TTL',key))===-1)await call('EXPIRE',key,ttl);return n},
 del:key=>call('DEL',key)}}

// Supabase: the public.semicobot_kv table through the REST API (supabase/schema.sql). New sb_secret_ keys
// go in the apikey header only; a legacy service_role JWT also goes in Authorization.
export function supabaseBackend(cfg,fetcher=fetch){
 const base=cfg.url+'/rest/v1',table=base+'/semicobot_kv',eq=key=>'key=eq.'+encodeURIComponent(key);
 const headers=(extra={})=>({apikey:cfg.key,...(/^sb_/.test(cfg.key)?{}:{Authorization:'Bearer '+cfg.key}),'Content-Type':'application/json',...extra});
 const req=async(url,init)=>{const {r,body}=await send(fetcher,url,init);if(r.ok)return body;
  // PGRST205/PGRST202: table or function not created yet; 42501: no grant; 401 before PostgREST: wrong key; 540: paused free project.
  const code=body?.code,kind=code==='PGRST205'||code==='PGRST202'||code==='42P01'||code==='42883'?'missing-table':code==='42501'?'no-rights':r.status===401?'bad-key':r.status===540?'paused':'down';
  throw new StorageError(body?.message||'HTTP '+r.status,kind)};
 return {
  get:async key=>{const row=(await req(`${table}?${eq(key)}&select=value,expires_at`,{headers:headers()}))?.[0];
   return row&&(!row.expires_at||Date.parse(row.expires_at)>Date.now())?row.value:null},
  set:async(key,value,ttl)=>{await req(table+'?on_conflict=key',{method:'POST',headers:headers({Prefer:'resolution=merge-duplicates,return=minimal'}),
   body:JSON.stringify([{key,value:String(value),expires_at:ttl?new Date(Date.now()+ttl*1000).toISOString():null}])})},
  incr:async(key,ttl)=>Number(await req(base+'/rpc/semicobot_incr',{method:'POST',headers:headers(),body:JSON.stringify({k:key,ttl_seconds:ttl})})),
  del:async key=>{await req(`${table}?${eq(key)}`,{method:'DELETE',headers:headers({Prefer:'return=minimal'})})}}}

const LOCK_SECONDS=15*60,PART_SECONDS=90*86400;
const parse=v=>{if(v==null)return null;try{return JSON.parse(v)}catch{return null}};
// auth: the account document, read once per request. attempts: wrong passwords per email, expiring after
// 15 minutes, shared by every function instance. store: the part-info cache; its failures never break a lookup.
export function hostedStores(db,env={}){
 const P=(env.KV_PREFIX||'semicobot')+':';let doc;
 const auth={
  load:()=>doc??=db.get(P+'auth').then(parse),
  save:async next=>{await db.set(P+'auth',JSON.stringify(next));doc=Promise.resolve(JSON.parse(JSON.stringify(next)))},
  attempts:{
   count:async email=>Number(await db.get(P+'fail:'+email))||0,
   add:email=>db.incr(P+'fail:'+email,LOCK_SECONDS),
   clear:email=>db.del(P+'fail:'+email)}};
 const store={
  get:async key=>{try{return parse(await db.get(P+'part:'+key))}catch{return null}},
  put:async(key,value)=>{try{await db.set(P+'part:'+key,JSON.stringify(value),PART_SECONDS)}catch{}}};
 return {auth,store}}

// Public workspaces use DigiKey without opening the database or other integrations.
export async function handleHosted(request,env=process.env,fetcher=fetch){
 try{
  if(env.REQUIRE_SIGNIN==='0'){
   const {DIGIKEY_CLIENT_ID,DIGIKEY_CLIENT_SECRET}=env;
   return await handleApi(request,{DIGIKEY_CLIENT_ID,DIGIKEY_CLIENT_SECRET},fetcher)||json({error:'Not found.'},404);
  }
  const url=new URL(request.url),e={...env,REQUIRE_SIGNIN:'1'},cfg=storageConfig(env);
  if(!cfg||cfg.error){
   if(url.pathname==='/api/status')return await handleApi(request,e,fetcher);
   if(url.pathname==='/api/auth/state')return json({enabled:true,admin:false,user:null});
   return json({error:MESSAGES[cfg?.error||'none']},503)}
  const {auth,store}=hostedStores(backendFor(cfg,fetcher),env);
  return await handleApi(request,e,fetcher,store,auth)||json({error:'Not found.'},404)}
 catch(err){
  if(err instanceof StorageError){console.error('storage:',err.code,err.message);return json({error:MESSAGES[err.code]||MESSAGES.down},503)}
  console.error(err);return json({error:'Internal server error.'},500)}}
