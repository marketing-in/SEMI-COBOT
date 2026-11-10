import test from 'node:test';
import assert from 'node:assert/strict';
import {handleHosted,hostedStores,redisConfig,redis,StorageError,storageConfig,backendFor} from '../hosted.mjs';

// A stand-in for the Upstash REST endpoint: POST [command, ...args] with a bearer token, answers {result} or {error}.
function fakeUpstash(token='tok'){
 const data=new Map(),ttl=new Map(),calls=[];let down=false;
 const fetcher=async(url,init)=>{
  if(down)throw new TypeError('fetch failed');
  if(init.headers.Authorization!=='Bearer '+token)return new Response(JSON.stringify({error:'WRONGPASS invalid password'}),{status:401});
  const [cmd,key,...args]=JSON.parse(init.body);calls.push([cmd,key,...args]);
  const ok=result=>new Response(JSON.stringify({result}));
  if(cmd==='GET')return ok(data.has(key)?data.get(key):null);
  if(cmd==='SET'){data.set(key,args[0]);if(args[1]==='EX')ttl.set(key,+args[2]);return ok('OK')}
  if(cmd==='INCR'){const n=(+data.get(key)||0)+1;data.set(key,String(n));return ok(n)}
  if(cmd==='EXPIRE'){ttl.set(key,+args[0]);return ok(1)}
  if(cmd==='TTL')return ok(!data.has(key)?-2:ttl.has(key)?ttl.get(key):-1);
  if(cmd==='DEL'){const had=data.delete(key);return ok(had?1:0)}
  return new Response(JSON.stringify({error:'ERR unknown command'}),{status:400})};
 return {fetcher,data,ttl,calls,setDown:v=>{down=v}}}
const ENV={KV_REST_API_URL:'https://kv.example.upstash.io/',KV_REST_API_TOKEN:'tok'};
const post=(path,body,cookie='')=>new Request('https://semi-cobot.vercel.app'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
const get=(path,cookie='')=>new Request('https://semi-cobot.vercel.app'+path,{headers:cookie?{cookie}:{}});
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];
// Supplier and rate calls never leave the test: anything that is not the store answers 599.
const withStore=kv=>async(url,init)=>String(url).startsWith('https://kv.example.upstash.io')?kv.fetcher(url,init):new Response('{}',{status:599});

test('the store is found under either set of Upstash variable names',()=>{
 assert.deepEqual(redisConfig(ENV),{url:'https://kv.example.upstash.io',token:'tok'});
 assert.deepEqual(redisConfig({UPSTASH_REDIS_REST_URL:'https://u.io',UPSTASH_REDIS_REST_TOKEN:'t'}),{url:'https://u.io',token:'t'});
 assert.equal(redisConfig({KV_REST_API_URL:'https://u.io'}),null,'a URL without a token is not a store');
});

test('without a store the hosted workspace stays closed instead of opening the API',async()=>{
 const st=await(await handleHosted(get('/api/auth/state'),{})).json();assert.deepEqual(st,{enabled:true,admin:false,user:null},'the intro asks for sign-up, not an open workspace');
 for(const path of ['/api/compare?mpn=LM358P','/api/fx','/api/search?provider=mouser&mpn=SS14']){const r=await handleHosted(get(path),{MOUSER_API_KEY:'k'});assert.equal(r.status,503,path);assert.match((await r.json()).error,/SUPABASE_URL and SUPABASE_SECRET_KEY/)}
 const signup=await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),{ADMIN_EMAIL:'ana@shop.co'});assert.equal(signup.status,503);
 assert.equal((await handleHosted(get('/api/status'),{})).status,200,'which suppliers are connected is still reported');
});

test('public mode opens the workspace and only uses the DigiKey credentials',async()=>{
 const env={...ENV,REQUIRE_SIGNIN:'0',DIGIKEY_CLIENT_ID:'public-test-id',DIGIKEY_CLIENT_SECRET:'test-secret',MOUSER_API_KEY:'private'};
 const calls=[],fetcher=async (url,options)=>{
  if(url==='https://open.er-api.com/v6/latest/USD')return new Response(null,{status:503});
  calls.push(url);
  if(url==='https://api.digikey.com/v1/oauth2/token'){
   assert.equal(options.body.get('client_secret'),env.DIGIKEY_CLIENT_SECRET);
   return Response.json({access_token:'test-token'});
  }
  assert.equal(url,'https://api.digikey.com/products/v4/search/keyword');
  assert.equal(options.headers.Authorization,'Bearer test-token');
  return Response.json({Products:[{ManufacturerProductNumber:'NE555DR',QuantityAvailable:100}]});
 };
 const state=await handleHosted(get('/api/auth/state'),env,fetcher);
 assert.deepEqual(await state.json(),{enabled:false,admin:false,user:null});
 const status=await handleHosted(get('/api/status'),env,fetcher);
 const connected=await status.json();
 assert.equal(connected.digikey,true);
 assert.equal(connected.mouser,false);
 const compare=await handleHosted(get('/api/compare?mpn=NE555DR'),env,fetcher);
 assert.equal(compare.status,200);
 assert.equal((await compare.json()).offers[0].source,'digikey');
 const lookup=await handleHosted(get('/api/search?provider=digikey&mpn=NE555DR'),env,fetcher);
 assert.equal((await lookup.json()).offers[0].stock,100);
 const search=await handleHosted(get('/api/search?provider=mouser&mpn=SS14'),env,fetcher);
 assert.equal(search.status,503);
 assert.deepEqual(calls,['https://api.digikey.com/v1/oauth2/token','https://api.digikey.com/products/v4/search/keyword']);
});

test('online, the API needs a session even before the admin exists, and only ADMIN_EMAIL can become admin',async()=>{
 const kv=fakeUpstash(),f=withStore(kv);
 assert.equal((await handleHosted(get('/api/compare?mpn=LM358P'),ENV,f)).status,401,'no open window before the first sign-up');
 const noOwner=await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),ENV,f);
 assert.equal(noOwner.status,503);assert.match((await noOwner.json()).error,/ADMIN_EMAIL/);
 const env={...ENV,ADMIN_EMAIL:'Ana@Shop.co'};
 const stranger=await handleHosted(post('/api/auth/signup',{name:'Eve',email:'eve@else.co',password:'long enough pass'}),env,f);
 assert.equal(stranger.status,403);assert.ok(!JSON.stringify(await stranger.json()).includes('ana@'),'the admin address is not revealed');
 const made=await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),env,f);assert.equal(made.status,201);
 assert.match(made.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
 const doc=JSON.parse(kv.data.get('semicobot:auth'));assert.equal(doc.users[0].role,'admin');assert.ok(doc.secret);assert.ok(!kv.data.get('semicobot:auth').includes('long enough pass'),'no plain password stored');
 const st=await(await handleHosted(get('/api/auth/state',cookieOf(made)),env,f)).json();assert.deepEqual(st,{enabled:true,admin:true,user:{name:'Ana',email:'ana@shop.co',role:'admin'}});
 assert.equal((await handleHosted(get('/api/compare?mpn=LM358P',cookieOf(made)),env,f)).status,200,'signed in, the API answers');
 const ola={name:'Ola',email:'ola@else.co',password:'long enough pass'};
 assert.equal((await handleHosted(post('/api/auth/signup',ola),env,f)).status,403,'online, sign-up is closed until SIGNUP_ALLOW says who may join');
 const member=await handleHosted(post('/api/auth/signup',ola),{...env,SIGNUP_ALLOW:'*'},f);assert.equal(member.status,201,'"*" lets anyone join as a member');
 assert.equal(JSON.parse(kv.data.get('semicobot:auth')).users[1].role,'member');
});

test('SIGNUP_ALLOW limits who can join after the admin; "none" closes sign-up',async()=>{
 const kv=fakeUpstash(),f=withStore(kv),env={...ENV,ADMIN_EMAIL:'ana@shop.co',SIGNUP_ALLOW:'@shop.co, guest@partner.in'};
 assert.equal((await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),env,f)).status,201);
 const sign=(email,e=env)=>handleHosted(post('/api/auth/signup',{name:'X',email,password:'long enough pass'}),e,f).then(r=>r.status);
 assert.equal(await sign('raj@shop.co'),201);assert.equal(await sign('guest@partner.in'),201);
 assert.equal(await sign('eve@else.co'),403);assert.equal(await sign('eve@notshop.co'),403,'a domain must match after the @');
 assert.equal(await sign('new@shop.co',{...env,SIGNUP_ALLOW:'none'}),403);
});

test('wrong passwords lock the email across function instances for 15 minutes',async()=>{
 const kv=fakeUpstash(),f=withStore(kv),env={...ENV,ADMIN_EMAIL:'ana@shop.co'};
 await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),env,f);
 for(let i=0;i<5;i++)assert.equal((await handleHosted(post('/api/auth/login',{email:'ana@shop.co',password:'wrong password '+i}),env,f)).status,401);
 assert.equal(kv.data.get('semicobot:fail:ana@shop.co'),'5');assert.equal(kv.ttl.get('semicobot:fail:ana@shop.co'),900);
 assert.equal((await handleHosted(post('/api/auth/login',{email:'ana@shop.co',password:'long enough pass'}),env,f)).status,429,'locked even with the right password');
 kv.data.delete('semicobot:fail:ana@shop.co');// the 15 minutes pass
 const ok=await handleHosted(post('/api/auth/login',{email:'ana@shop.co',password:'long enough pass'}),env,f);assert.equal(ok.status,200);assert.equal(kv.data.has('semicobot:fail:ana@shop.co'),false,'a good sign-in clears the count');
});

test('a store outage answers 503, never an open API or a crash; the part cache just misses',async()=>{
 const kv=fakeUpstash(),f=withStore(kv);kv.setDown(true);
 const r=await handleHosted(get('/api/compare?mpn=LM358P'),ENV,f);assert.equal(r.status,503);assert.match((await r.json()).error,/not answering/);
 assert.equal((await handleHosted(get('/api/compare?mpn=LM358P'),{...ENV,KV_REST_API_TOKEN:'wrong'},withStore(fakeUpstash()))).status,503,'a wrong token is an outage, not an open door');
 const {store}=hostedStores(backendFor(storageConfig(ENV),f),{});assert.equal(await store.get('LM358P'),null);await store.put('LM358P',{a:1});
 await assert.rejects(redis(redisConfig(ENV),f)('GET','x'),StorageError);
});

test('the account document is read once per request and part info is cached for 90 days under the prefix',async()=>{
 const kv=fakeUpstash(),f=withStore(kv),{auth,store}=hostedStores(backendFor(storageConfig(ENV),f),{KV_PREFIX:'acme'});
 await auth.load();await auth.load();assert.equal(kv.calls.filter(c=>c[0]==='GET').length,1);
 await auth.save({secret:'s',users:[]});assert.deepEqual(await auth.load(),{secret:'s',users:[]});assert.equal(kv.calls.filter(c=>c[0]==='GET').length,1,'save refreshes the copy');
 await store.put('LM358P',{datasheet:'x'});assert.deepEqual(await store.get('LM358P'),{datasheet:'x'});assert.equal(kv.ttl.get('acme:part:LM358P'),90*86400);
});

test('the Vercel entry rebuilds the browser path from the rewrite and keeps the body and query',async()=>{
 const {originalRequest}=await import('../api/index.js');
 const a=originalRequest(new Request('https://x.vercel.app/api?__path=compare&mpn=LM358P&sources=distributors'));
 assert.equal(a.url,'https://x.vercel.app/api/compare?mpn=LM358P&sources=distributors');
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"email":"a@b.co"}'));c.close()}});
 const b=originalRequest(new Request('https://x.vercel.app/api?__path=auth/login',{method:'POST',headers:{'content-type':'application/json',cookie:'sc_session=1'},body:stream,duplex:'half'}));
 assert.equal(new URL(b.url).pathname,'/api/auth/login');assert.equal(b.method,'POST');assert.equal(b.headers.get('cookie'),'sc_session=1');assert.deepEqual(await b.json(),{email:'a@b.co'});
 const c=new Request('https://x.vercel.app/api/fx');assert.equal(originalRequest(c),c,'an unrewritten request passes through');
});

// A stand-in for Supabase's REST API over public.semicobot_kv (supabase/schema.sql): the secret key in
// the apikey header only, RLS hiding every row from the publishable key, and the semicobot_incr function.
function fakeSupabase({secret='sb_secret_test',missing=false}={}){
 const rows=new Map(),calls=[];
 const fetcher=async(url,init={})=>{const u=new URL(url),h=init.headers||{},method=init.method||'GET';calls.push({method,path:u.pathname,headers:h});
  const err=(status,code,message)=>new Response(JSON.stringify({code,message,details:null,hint:null}),{status});
  if(h.Authorization&&/^Bearer sb_/.test(h.Authorization))return err(401,'PGRST301','Expected 3 parts in JWT; got 1');
  const isSecret=h.apikey===secret||(h.apikey==='legacy.service.jwt'&&h.Authorization==='Bearer legacy.service.jwt');
  if(!isSecret&&!/^sb_publishable_/.test(h.apikey||''))return err(401,'','Invalid API key');
  if(missing)return err(404,'PGRST205',"Could not find the table 'public.semicobot_kv' in the schema cache");
  const key=decodeURIComponent((u.search.match(/key=eq\.([^&]*)/)||[])[1]||'');
  if(u.pathname==='/rest/v1/rpc/semicobot_incr'){if(!isSecret)return err(401,'42501','permission denied for function semicobot_incr');
   const {k,ttl_seconds}=JSON.parse(init.body),row=rows.get(k),fresh=!row||(row.expires_at&&Date.parse(row.expires_at)<=Date.now());
   const next=fresh?{key:k,value:'1',expires_at:new Date(Date.now()+ttl_seconds*1000).toISOString()}:{...row,value:String(+row.value+1)};rows.set(k,next);return new Response(next.value)}
  if(u.pathname!=='/rest/v1/semicobot_kv')return err(404,'PGRST205','no such table');
  if(method==='GET'){if(!isSecret)return new Response('[]');const row=rows.get(key);return new Response(JSON.stringify(row?[{value:row.value,expires_at:row.expires_at}]:[]))}
  if(!isSecret)return err(401,'42501','permission denied for table semicobot_kv');
  if(method==='POST'){assert.equal(u.searchParams.get('on_conflict'),'key');assert.match(h.Prefer,/resolution=merge-duplicates/);for(const r of JSON.parse(init.body))rows.set(r.key,r);return new Response(null,{status:201})}
  if(method==='DELETE'){rows.delete(key);return new Response(null,{status:204})}
  return err(405,'','method')};
 return {fetcher,rows,calls}}
const SB={SUPABASE_URL:'https://abc.supabase.co/',SUPABASE_SECRET_KEY:'sb_secret_test'};
const viaSupabase=sb=>async(url,init)=>String(url).startsWith('https://abc.supabase.co')?sb.fetcher(url,init):new Response('{}',{status:599});

test('Supabase is chosen when set, and the publishable key is refused as the server key',async()=>{
 assert.deepEqual(storageConfig({...SB,...ENV}),{kind:'supabase',url:'https://abc.supabase.co',key:'sb_secret_test'},'Supabase wins over Upstash');
 assert.deepEqual(storageConfig({SUPABASE_URL:'https://abc.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'legacy.service.jwt'}).key,'legacy.service.jwt');
 assert.deepEqual(storageConfig({SUPABASE_URL:'https://abc.supabase.co',SUPABASE_SECRET_KEY:'sb_publishable_x'}),{error:'publishable'});
 assert.equal(storageConfig({SUPABASE_URL:'https://abc.supabase.co'}),null,'a URL without a key is not a database');
 const r=await handleHosted(get('/api/fx'),{SUPABASE_URL:'https://abc.supabase.co',SUPABASE_SECRET_KEY:'sb_publishable_x'});assert.equal(r.status,503);assert.match((await r.json()).error,/publishable key/);
});

test('on Supabase: the admin signs up, the account row is stored, lockouts count and clear',async()=>{
 const sb=fakeSupabase(),f=viaSupabase(sb),env={...SB,ADMIN_EMAIL:'ana@shop.co'};
 assert.equal((await handleHosted(get('/api/compare?mpn=LM358P'),env,f)).status,401);
 const made=await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),env,f);assert.equal(made.status,201);
 const doc=JSON.parse(sb.rows.get('semicobot:auth').value);assert.equal(doc.users[0].role,'admin');assert.equal(sb.rows.get('semicobot:auth').expires_at,null,'accounts never expire');
 assert.ok(sb.calls.every(c=>c.headers.apikey==='sb_secret_test'&&!c.headers.Authorization),'the secret key goes in apikey only');
 assert.equal((await handleHosted(get('/api/compare?mpn=LM358P',cookieOf(made)),env,f)).status,200);
 for(let i=0;i<5;i++)assert.equal((await handleHosted(post('/api/auth/login',{email:'ana@shop.co',password:'wrong password '+i}),env,f)).status,401);
 const fail=sb.rows.get('semicobot:fail:ana@shop.co');assert.equal(fail.value,'5');assert.ok(Math.abs(Date.parse(fail.expires_at)-Date.now()-900e3)<5e3,'15-minute window');
 assert.equal((await handleHosted(post('/api/auth/login',{email:'ana@shop.co',password:'long enough pass'}),env,f)).status,429);
 sb.rows.get('semicobot:fail:ana@shop.co').expires_at=new Date(Date.now()-1000).toISOString();// the 15 minutes pass
 assert.equal((await handleHosted(post('/api/auth/login',{email:'ana@shop.co',password:'long enough pass'}),env,f)).status,200);assert.equal(sb.rows.has('semicobot:fail:ana@shop.co'),false,'a good sign-in deletes the count');
});

test('on Supabase: expired rows read as missing, a missing table says what to run, the public key sees nothing',async()=>{
 const sb=fakeSupabase(),f=viaSupabase(sb),{store}=hostedStores(backendFor(storageConfig(SB),f),{});
 await store.put('LM358P',{datasheet:'x'});assert.deepEqual(await store.get('LM358P'),{datasheet:'x'});
 sb.rows.get('semicobot:part:LM358P').expires_at=new Date(Date.now()-1).toISOString();assert.equal(await store.get('LM358P'),null);
 const missing=await handleHosted(get('/api/fx'),SB,viaSupabase(fakeSupabase({missing:true})));assert.equal(missing.status,503);assert.match((await missing.json()).error,/supabase\/schema\.sql/);
 const pub=backendFor({kind:'supabase',url:'https://abc.supabase.co',key:'sb_publishable_x'},f);await store.put('k',{a:1});
 assert.equal(await pub.get('semicobot:part:k'),null,'row level security hides rows from the public key');await assert.rejects(pub.set('semicobot:auth','{}'),StorageError);
 const legacy=fakeSupabase(),lf=viaSupabase(legacy);await backendFor({kind:'supabase',url:'https://abc.supabase.co',key:'legacy.service.jwt'},lf).set('a','b');
 assert.equal(legacy.calls[0].headers.Authorization,'Bearer legacy.service.jwt','a legacy service_role JWT also goes in Authorization');
});

test('Supabase errors become messages that say what to fix',async()=>{
 const answer=(status,body)=>async url=>String(url).startsWith('https://abc.supabase.co')?new Response(body==null?'':JSON.stringify(body),{status}):new Response('{}',{status:599});
 const cases=[[401,{message:'Invalid API key'},/refused SUPABASE_SECRET_KEY/],[403,{code:'42501',message:'permission denied for table semicobot_kv'},/no rights on the table/],
  [404,{code:'PGRST205',message:'Could not find the table'},/supabase\/schema\.sql/],[404,{code:'PGRST202',message:'Could not find the function'},/supabase\/schema\.sql/],[540,null,/paused/],[502,null,/not answering/]];
 for(const [status,body,re] of cases){const r=await handleHosted(get('/api/fx'),SB,answer(status,body));assert.equal(r.status,503,String(status));assert.match((await r.json()).error,re,String(status))}
});

test('review fixes: parallel guesses are capped, removed members stay out, unknown emails leave no rows',async()=>{
 const sb=fakeSupabase(),f=viaSupabase(sb),env={...SB,ADMIN_EMAIL:'ana@shop.co',SIGNUP_ALLOW:'@shop.co'};
 const admin=await handleHosted(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'long enough pass'}),env,f);
 await handleHosted(post('/api/auth/signup',{name:'Bob',email:'bob@shop.co',password:'long enough pass'}),env,f);
 // 20 guesses at once: each is counted before its password check, so at most 5 are checked.
 const answers=await Promise.all(Array.from({length:20},(_,i)=>handleHosted(post('/api/auth/login',{email:'bob@shop.co',password:'guess number '+i}),env,f).then(r=>r.status)));
 assert.equal(answers.filter(s=>s===401).length,5);assert.equal(answers.filter(s=>s===429).length,15);
 // Removing a member keeps them out, even though their domain is allowed; naming the address lets them back.
 assert.equal((await handleHosted(post('/api/auth/remove',{email:'bob@shop.co'},cookieOf(admin)),env,f)).status,200);
 assert.equal((await handleHosted(post('/api/auth/signup',{name:'Bob',email:'bob@shop.co',password:'another long pass'}),env,f)).status,403);
 assert.equal((await handleHosted(post('/api/auth/signup',{name:'Bob',email:'bob@shop.co',password:'another long pass'}),{...env,SIGNUP_ALLOW:'@shop.co bob@shop.co'},f)).status,201);
 // Closed sign-up answers the same for an existing address and a new one.
 const closed={...env,SIGNUP_ALLOW:'none'};
 assert.equal((await handleHosted(post('/api/auth/signup',{name:'X',email:'ana@shop.co',password:'long enough pass'}),closed,f)).status,403);
 assert.equal((await handleHosted(post('/api/auth/signup',{name:'X',email:'new@shop.co',password:'long enough pass'}),closed,f)).status,403);
 // Wrong passwords for unknown emails are refused without storing anything.
 const before=sb.rows.size;for(let i=0;i<3;i++)assert.equal((await handleHosted(post('/api/auth/login',{email:`ghost${i}@else.co`,password:'whatever pass'}),env,f)).status,401);
 assert.equal(sb.rows.size,before);
});

test('an Upstash counter that lost its expiry gets one on the next wrong password',async()=>{
 const kv=fakeUpstash(),db=backendFor(storageConfig(ENV),withStore(kv));
 kv.data.set('k','3');assert.equal(await db.incr('k',900),4);assert.equal(kv.ttl.get('k'),900);
});
