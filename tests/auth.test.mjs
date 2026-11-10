import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi,hashPassword,checkPassword,makeSession,readSession} from '../api.mjs';

const memoryAuth=()=>{let s=null;return {load:()=>s,save:n=>{s=JSON.parse(JSON.stringify(n))},peek:()=>s}};
const post=(path,body,cookie='')=>new Request('http://localhost'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
const get=(path,cookie='')=>new Request('http://localhost'+path,{headers:cookie?{cookie}:{}});
const cookieOf=r=>(r.headers.get('set-cookie')||'').split(';')[0];

test('passwords are salted PBKDF2 hashes and only the right one checks out',async()=>{
 const a=await hashPassword('correct horse battery',1000),b=await hashPassword('correct horse battery',1000);
 assert.notEqual(a.hash,b.hash,'random salt');assert.ok(!JSON.stringify(a).includes('correct'));
 assert.ok(await checkPassword('correct horse battery',a));assert.equal(await checkPassword('wrong horse battery',a),false);assert.equal(await checkPassword('x',null),false);
});

test('sessions are signed and expire',async()=>{
 const t=await makeSession('s3cret','a@b.co',1000);assert.equal((await readSession('s3cret',t,2000)).e,'a@b.co');
 assert.equal(await readSession('other',t,2000),null,'wrong secret');assert.equal(await readSession('s3cret',t.slice(0,-2)+'xx',2000),null,'tampered signature');
 const [body,sig]=t.split('.'),forged=Buffer.from(JSON.stringify({e:'evil@x.co',x:9e15})).toString('base64url')+'.'+sig;assert.equal(await readSession('s3cret',forged,2000),null,'changed payload');void body;
 assert.equal(await readSession('s3cret',t,1000+8*864e5),null,'expired after 7 days');assert.equal(await readSession('s3cret','',0),null);
});

test('first run: sign-up creates the admin once and signs them in; the API then needs the session',async()=>{
 const auth=memoryAuth(),env={};
 let st=await(await handleApi(get('/api/auth/state'),env,fetch,null,auth)).json();assert.deepEqual(st,{enabled:true,admin:false,user:null});
 assert.equal((await handleApi(get('/api/status'),env,fetch,null,auth)).status,200,'open before an admin exists');
 assert.equal((await handleApi(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'short'}),env,fetch,null,auth)).status,400);
 const made=await handleApi(post('/api/auth/signup',{name:'Ana',email:'Ana@Shop.co',password:'long enough pass'}),env,fetch,null,auth);assert.equal(made.status,201);
 const setCookie=made.headers.get('set-cookie');assert.match(setCookie,/^sc_session=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800$/);
 assert.ok(!JSON.stringify(auth.peek()).includes('long enough pass'),'no plain password stored');assert.equal(auth.peek().users[0].email,'ana@shop.co');assert.equal(auth.peek().users[0].role,'admin');
 assert.equal((await handleApi(post('/api/auth/signup',{name:'Ana 2',email:'ana@shop.co',password:'another long one'}),env,fetch,null,auth)).status,409,'one account per email');
 const cookie=cookieOf(made);
 st=await(await handleApi(get('/api/auth/state',cookie),env,fetch,null,auth)).json();assert.deepEqual(st.user,{name:'Ana',email:'ana@shop.co',role:'admin'});
 const locked=await handleApi(get('/api/search?provider=nexar&mpn=SS14'),env,fetch,null,auth);assert.equal(locked.status,401);
 const open=await handleApi(get('/api/search?provider=nexar&mpn=SS14',cookie),env,fetch,null,auth);assert.equal(open.status,503,'signed in: the route runs (Nexar not configured)');
 assert.equal((await handleApi(get('/api/status'),env,fetch,null,auth)).status,200,'status stays open');
 const out=await handleApi(post('/api/auth/logout',{}),env,fetch,null,auth);assert.match(out.headers.get('set-cookie'),/^sc_session=; .*Max-Age=0/);
});

test('sign-in: wrong passwords fail and lock the account after five tries',async()=>{
 const auth=memoryAuth(),env={};await handleApi(post('/api/auth/signup',{name:'Raj',email:'raj@shop.co',password:'good password 1'}),env,fetch,null,auth);
 assert.equal((await handleApi(post('/api/auth/login',{email:'raj@shop.co',password:'good password 1'}),env,fetch,null,auth)).status,200);
 for(let i=0;i<5;i++)assert.equal((await handleApi(post('/api/auth/login',{email:'raj@shop.co',password:'bad '+i}),env,fetch,null,auth)).status,401);
 assert.equal((await handleApi(post('/api/auth/login',{email:'raj@shop.co',password:'good password 1'}),env,fetch,null,auth)).status,429,'locked even with the right password');
 assert.equal((await handleApi(post('/api/auth/login',{email:'nobody@shop.co',password:'x'}),env,fetch,null,auth)).status,401);
});

test('without an auth store (the Worker) sign-in is off and the API is open',async()=>{
 assert.deepEqual(await(await handleApi(get('/api/auth/state'))).json(),{enabled:false,admin:false,user:null});
 assert.equal((await handleApi(post('/api/auth/login',{email:'a@b.co',password:'x'}))).status,404);
 assert.equal((await handleApi(get('/api/auth/login'))).status,405,'POST only');
});

test('later sign-ups are members, signed in at once; the admin can remove them',async()=>{
 const auth=memoryAuth(),env={};const admin=cookieOf(await handleApi(post('/api/auth/signup',{name:'Ana',email:'ana@shop.co',password:'admin password 1'}),env,fetch,null,auth));
 const made=await handleApi(post('/api/auth/signup',{name:'Ben',email:'ben@shop.co',password:'member password 1'}),env,fetch,null,auth);assert.equal(made.status,201);
 assert.deepEqual((await made.json()).user,{name:'Ben',email:'ben@shop.co',role:'member'});const ben=cookieOf(made);assert.ok(ben.startsWith('sc_session='),'signed in straight away');
 assert.equal((await handleApi(get('/api/search?provider=nexar&mpn=SS14',ben),env,fetch,null,auth)).status,503,'the new member can use the API');
 assert.equal((await handleApi(post('/api/auth/login',{email:'ben@shop.co',password:'member password 1'}),env,fetch,null,auth)).status,200);
 assert.equal((await handleApi(get('/api/auth/users',ben),env,fetch,null,auth)).status,403,'members cannot manage the team');
 const list=await(await handleApi(get('/api/auth/users',admin),env,fetch,null,auth)).json();assert.deepEqual(list.users.map(u=>[u.email,u.role,u.status]),[['ana@shop.co','admin','active'],['ben@shop.co','member','active']]);assert.ok(!JSON.stringify(list).includes('hash'),'no password data in the list');
 assert.equal((await handleApi(post('/api/auth/remove',{email:'ana@shop.co'},admin),env,fetch,null,auth)).status,400,'the admin itself cannot be removed');
 assert.equal((await handleApi(post('/api/auth/remove',{email:'ben@shop.co'},admin),env,fetch,null,auth)).status,200);
 assert.equal((await handleApi(get('/api/search?provider=nexar&mpn=SS14',ben),env,fetch,null,auth)).status,401,'a removed member is signed out everywhere');
 const legacyPending={secret:'s',users:[{name:'P',email:'p@shop.co',password:await hashPassword('pending pass 1',1000),role:'member',status:'pending'}]};
 assert.equal((await handleApi(post('/api/auth/login',{email:'p@shop.co',password:'pending pass 1'}),{},fetch,null,{load:()=>legacyPending,save:()=>{}})).status,200,'an account an older version left pending signs in normally');
 assert.equal((await handleApi(post('/api/auth/approve',{email:'p@shop.co'}),{},fetch,null,{load:()=>legacyPending,save:()=>{}})).status,405,'there is no approval route');
});

test('an older single-admin store keeps working',async()=>{
 const legacy={admin:{name:'Old',email:'old@shop.co',password:await hashPassword('legacy password',1000)},secret:'s'};const auth={load:()=>legacy,save:()=>{}};
 const r=await handleApi(post('/api/auth/login',{email:'old@shop.co',password:'legacy password'}),{},fetch,null,auth);assert.equal(r.status,200);assert.equal((await r.json()).user.role,'admin');
});
