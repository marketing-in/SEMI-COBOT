import React,{useEffect,useRef,useState} from 'react';
import {Box,RotateCw,Rotate3d,Trash2,Upload} from 'lucide-react';
import {loadModelIndex,modelFor,attachPartModel,removePartModel,turnPartModel,MODELS_CHANGED} from './modelStore.js';
import {forgetModel} from './glb.js';
import {keyOf} from './partDetails.js';

// Board studio inspector: the selected part's 3D model. A .glb attached here is used for this part
// number on every board; the two turn buttons fix models exported lying down or facing the other way.
export default function PartModel3D({part,notify=()=>{}}){
 const mpn=String(part?.inv?.mpn||part?.mpn||'').trim();
 const [index,setIndex]=useState(()=>loadModelIndex()),[busy,setBusy]=useState(false);const input=useRef(null);
 useEffect(()=>{const f=()=>setIndex(loadModelIndex());window.addEventListener(MODELS_CHANGED,f);return()=>window.removeEventListener(MODELS_CHANGED,f)},[]);
 if(!part)return null;
 const m=modelFor(index,mpn),named=mpn&&mpn!=='Unnamed part'&&keyOf(mpn).length>=2;
 const attach=async file=>{if(!file)return;setBusy(true);try{forgetModel('part:'+keyOf(mpn));const r=await attachPartModel(mpn,file);notify(`${r.name} is now the 3D model for ${mpn} on every board.`)}catch(e){notify(e.message)}finally{setBusy(false)}};
 const remove=async()=>{setBusy(true);try{forgetModel('part:'+keyOf(mpn));await removePartModel(mpn);notify(`${mpn} is drawn from its package again.`)}finally{setBusy(false)}};
 const mb=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' kB';
 return <div className="part-model" role="group" aria-label="3D model">
  <Box size={14} aria-hidden="true"/>
  {!named?<small className="muted">3D model: give this part a part number to attach a .glb.</small>
  :m?<><span className="part-model-name"><strong title={m.name}>{m.name}</strong><small>{mb(m.size)} · used for {mpn} on every board</small></span>
    <button type="button" className="icon-button" title="Turn 90° about the board (spin)" aria-label="Spin the model 90°" disabled={busy} onClick={()=>turnPartModel(mpn,'y')}><RotateCw size={14}/></button>
    <button type="button" className="icon-button" title="Turn 90° front to back (stand up or lay down)" aria-label="Tip the model 90°" disabled={busy} onClick={()=>turnPartModel(mpn,'x')}><Rotate3d size={14}/></button>
    <button type="button" className="icon-button" title="Remove the model" aria-label="Remove the 3D model" disabled={busy} onClick={remove}><Trash2 size={14}/></button></>
  :<><small className="muted part-model-name">3D model: drawn from the package</small><button type="button" className="text-button" disabled={busy} onClick={()=>input.current?.click()}><Upload size={13}/>{busy?'Saving…':'Attach .glb'}</button></>}
  <input ref={input} type="file" accept=".glb,model/gltf-binary" hidden aria-label={`3D model file for ${mpn||'this part'}`} onChange={e=>{attach(e.target.files?.[0]);e.target.value=''}}/>
 </div>;
}
