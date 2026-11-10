import {createServer} from 'node:http';
import {handleApi} from './api.mjs';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
// Part details looked up through SerpApi are kept in data/part-info.json, so each part number is
// searched once. Written atomically (temp file, then rename).
const INFO_FILE=new URL('./data/part-info.json',import.meta.url);
let info={};try{info=JSON.parse(readFileSync(INFO_FILE,'utf8'))}catch{}
// The admin account and the session-signing secret live in data/auth.json (or AUTH_FILE), readable only by this user.
const AUTH_FILE=process.env.AUTH_FILE?new URL('file://'+(process.env.AUTH_FILE.startsWith('/')?'':process.cwd()+'/')+process.env.AUTH_FILE):new URL('./data/auth.json',import.meta.url);
let authState=null;try{authState=JSON.parse(readFileSync(AUTH_FILE,'utf8'))}catch{}
const auth={load:()=>authState,save:next=>{authState=next;const tmp=new URL(AUTH_FILE.href+'.tmp');mkdirSync(new URL('./',AUTH_FILE),{recursive:true});writeFileSync(tmp,JSON.stringify(next,null,1),{mode:0o600});renameSync(tmp,AUTH_FILE)}};
const store={get:key=>info[key]||null,put:(key,value)=>{info[key]=value;try{mkdirSync(new URL('./data/',import.meta.url),{recursive:true});const tmp=new URL('./data/part-info.json.tmp',import.meta.url);writeFileSync(tmp,JSON.stringify(info,null,1));renameSync(tmp,INFO_FILE)}catch(e){console.error('Could not save part details:',e.message)}}};
const BODY_LIMIT=8*1024*1024;
// Collects a request body into a Buffer. Resolves null once the client sends more than BODY_LIMIT;
// the rest of the upload is drained so the 413 reply still reaches the client.
const readBody=req=>new Promise((resolve,reject)=>{const chunks=[];let size=0,over=false;req.on('data',chunk=>{if(over)return;size+=chunk.length;if(size>BODY_LIMIT){over=true;chunks.length=0;return}chunks.push(chunk)});req.on('end',()=>resolve(over?null:Buffer.concat(chunks)));req.on('error',reject)});
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
createServer(async(req,res)=>{try{
 let body;
 if(req.method==='POST'){
  if(Number(req.headers['content-length'])>BODY_LIMIT){req.resume();return reply(res,413,{error:'Request body is too large.'})}
  body=await readBody(req);if(body===null)return reply(res,413,{error:'Request body is too large.'});
 }
 const response=await handleApi(new Request('http://localhost:5174'+req.url,{method:req.method,headers:req.headers,body}),process.env,fetch,store,auth)||new Response('Not found',{status:404});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
}catch{res.writeHead(500);res.end('Internal server error')}}).listen(5174,'127.0.0.1',()=>console.log('semi-cobot API listening on http://127.0.0.1:5174'));
