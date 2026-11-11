// 3D models (.glb) kept in this browser. The bytes go to IndexedDB (a board model is often several MB,
// too big for localStorage); a small index in localStorage says which part numbers have a model and how
// it is turned, so a board knows at once which parts to draw from a model.
//   board:<id>  the whole-board model of an imported board (Board studio → Import blueprint → .glb)
//   part:<KEY>  a component model attached to a part number (KEY = keyOf(mpn)); used on every board
import {keyOf} from './partDetails.js';

const DB='semicobot-models',STORE='files';
export const MODELS_KEY='semicobot-part-models-v1',MODELS_CHANGED='semicobot-models-changed';
export const MAX_GLB_BYTES=60*1024*1024;

let dbp=null;
const open=()=>dbp??=new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(new Error('This browser cannot store 3D models (no IndexedDB).'));return}
 const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not open the model store.'))});
async function tx(mode,fn){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),req=fn(t.objectStore(STORE));
 t.oncomplete=()=>resolve(req?.result);t.onerror=()=>reject(t.error||new Error('The model store refused the change (storage full?).'));t.onabort=()=>reject(t.error||new Error('The model store refused the change (storage full?).'))})}
export const putFile=(key,bytes)=>tx('readwrite',s=>s.put(bytes,key));
export const getFile=key=>tx('readonly',s=>s.get(key));
export const deleteFile=key=>tx('readwrite',s=>s.delete(key));
export const listKeys=()=>tx('readonly',s=>s.getAllKeys());

// A .glb starts with the ASCII magic "glTF". A .gltf (JSON with separate files) is not accepted.
export function checkGlb(bytes,name='file'){
 const b=new Uint8Array(bytes,0,Math.min(12,bytes.byteLength));
 if(b.length<12||String.fromCharCode(b[0],b[1],b[2],b[3])!=='glTF')throw new Error(`${name} is not a binary glTF (.glb) file. Export it as .glb (binary glTF), not .gltf, STEP or VRML.`);
 if(bytes.byteLength>MAX_GLB_BYTES)throw new Error(`${name} is ${Math.round(bytes.byteLength/1048576)} MB; choose a model under 60 MB.`);
}

// Which part numbers have a component model: {KEY: {mpn, name, size, addedAt, rx, ry}} (rx/ry: quarter turns).
export function loadModelIndex(storage=globalThis.localStorage){try{const v=JSON.parse(storage?.getItem(MODELS_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}}
function saveModelIndex(index,storage=globalThis.localStorage){storage?.setItem(MODELS_KEY,JSON.stringify(index));if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new Event(MODELS_CHANGED))}
export const modelFor=(index,mpn)=>{const k=keyOf(mpn);return k?index[k]||null:null};

export async function attachPartModel(mpn,file){
 const key=keyOf(mpn);if(key.length<2)throw new Error('This part has no part number to attach a model to. Name it first.');
 const bytes=await file.arrayBuffer();checkGlb(bytes,file.name);
 await putFile('part:'+key,bytes);
 const index=loadModelIndex();index[key]={mpn:String(mpn).trim(),name:file.name,size:bytes.byteLength,addedAt:new Date().toISOString(),rx:0,ry:0};saveModelIndex(index);
 return index[key];
}
export async function removePartModel(mpn){const key=keyOf(mpn),index=loadModelIndex();delete index[key];saveModelIndex(index);await deleteFile('part:'+key).catch(()=>{})}
// Quarter turns about X (stand up / lay down) or Y (spin), for models exported in another orientation.
export function turnPartModel(mpn,axis){const key=keyOf(mpn),index=loadModelIndex();const m=index[key];if(!m)return null;
 const f=axis==='x'?'rx':'ry';index[key]={...m,[f]:((m[f]||0)+90)%360};saveModelIndex(index);return index[key]}

// Board models whose board is gone (removed, or pushed out of the last 12) are deleted.
export async function pruneBoardModels(boards){try{const keep=new Set((boards||[]).map(b=>b.glb?.key).filter(Boolean));
 for(const k of await listKeys())if(String(k).startsWith('board:')&&!keep.has(k))await deleteFile(k)}catch{}}
