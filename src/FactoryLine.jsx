import React,{Suspense,lazy,useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Play,Pause,RotateCcw,ArrowLeft,Maximize2,Minimize2} from 'lucide-react';
import {STATIONS,planProduction,boardAt,DEFAULTS} from './factoryLine.js';
import {createKit,stepAt} from './factory/common.js';
import {xrayTimeline,drawRadiograph,scanState,scanKey} from './factory/radiograph.js';
import {createLineModels,LINE_LAYOUT} from './factoryModels.js';
import {boardSlab,boardTexture} from './boardLook.js';
import {buildBody} from './partModels.js';
import {partPads} from './blueprint';

// The SMT production line for the studio board: machines on one straight conveyor, boards flowing
// through on the planned schedule, each machine's signal tower showing its state. Clicking a machine
// (or its button below) opens the inner view: that machine's own cycle in 3D plus its process data.
const INNER=import.meta.glob(['./factory/*.js','!./factory/common.js','!./factory/radiograph.js']);
const PANELS=Object.fromEntries(Object.entries(import.meta.glob('./factory/*Panel.jsx')).map(([k,load])=>[k.match(/\/(\w+)Panel\.jsx$/)[1],lazy(load)]));
const {width:WIDTH,gap:GAP,depth:DEPTH,cy:CY}=LINE_LAYOUT;
const RATES=[[1,'1×'],[10,'10×'],[50,'50×']];
const secs=s=>s<60?s.toFixed(1)+' s':s<3600?Math.floor(s/60)+' min '+String(Math.round(s%60)).padStart(2,'0')+' s':(s/3600).toFixed(1)+' h';
const label=(text,THREEns)=>{const c=document.createElement('canvas');c.width=512;c.height=112;const x=c.getContext('2d');x.fillStyle='rgba(28,27,24,.86)';x.beginPath();x.roundRect(4,8,504,96,12);x.fill();x.fillStyle='#d9824a';x.fillRect(4,8,8,96);x.fillStyle='#ecebe5';x.font='500 46px "IBM Plex Sans", system-ui, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,262,58);
 const t=new THREEns.CanvasTexture(c);t.colorSpace=THREEns.SRGBColorSpace;const sp=new THREEns.Sprite(new THREEns.SpriteMaterial({map:t,depthTest:true}));sp.scale.set(1.5,.33,1);return sp};

export default function FactoryLine({board,parts}){
 const [cfg,setCfg]=useState(DEFAULTS);
 const plan=useMemo(()=>planProduction(board,parts,cfg),[board,parts,cfg]);
 const total=plan.stats.total;
 const [playing,setPlaying]=useState(false),[rate,setRate]=useState(10),[ui,setUi]=useState({T:0,status:{}}),[focus,setFocus]=useState(null),[inner,setInner]=useState({t:0,step:0,duration:1,steps:[],k:0}),[failed,setFailed]=useState(false);
 // Full screen for the whole line view (Fullscreen API, with the webkit prefix for Safari).
 const shell=useRef(null),[full,setFull]=useState(false);
 useEffect(()=>{const fn=()=>setFull((document.fullscreenElement||document.webkitFullscreenElement)===shell.current);document.addEventListener('fullscreenchange',fn);document.addEventListener('webkitfullscreenchange',fn);return()=>{document.removeEventListener('fullscreenchange',fn);document.removeEventListener('webkitfullscreenchange',fn)}},[]);
 const toggleFull=()=>{const el=shell.current;if(!el)return;if(document.fullscreenElement||document.webkitFullscreenElement)(document.exitFullscreen||document.webkitExitFullscreen)?.call(document);else (el.requestFullscreen||el.webkitRequestFullscreen)?.call(el)};
 const host=useRef(null),clock=useRef({T:0,seek:0,playing:false,rate:10,innerT:0,innerSeek:null}),api=useRef(null);
 clock.current.playing=playing;clock.current.rate=rate;

 useEffect(()=>{
  const el=host.current;if(!el)return;let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch{setFailed(true);return}
  renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;el.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(40,1,.05,400),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;controls.minDistance=1;controls.maxDistance=30;
  const owned=[];const keep=x=>{owned.push(x);return x};
  const mat=(color,metalness=.15,roughness=.6,extra={})=>keep(new THREE.MeshStandardMaterial({color,metalness,roughness,...extra}));
  const lights=(sc,withFloor=true)=>{sc.add(new THREE.HemisphereLight(0xffffff,0x8a8578,1.1));const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(6,14,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:22,top:12,bottom:-12,near:1,far:60});sun.shadow.bias=-.0004;sc.add(sun);
   if(!withFloor)return;const floor=new THREE.Mesh(keep(new THREE.PlaneGeometry(400,400)),keep(new THREE.ShadowMaterial({opacity:.1})));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;sc.add(floor)};
  // --- overview scene
  const scene=new THREE.Scene();lights(scene,false);scene.background=new THREE.Color(0xd5d6d1);scene.fog=new THREE.Fog(0xd5d6d1,34,80);
  const lineLen=STATIONS.reduce((s,st)=>s+WIDTH[st.id],0)+GAP*(STATIONS.length-1),x0=-lineLen/2,X={};let cx=x0;
  for(const st of STATIONS){X[st.id]={left:cx,right:cx+WIDTH[st.id],mid:cx+WIDTH[st.id]/2};cx+=WIDTH[st.id]+GAP}
  // Machines, link conveyors and the unloader (factoryModels.js); every machine part is clickable.
  const xtl=xrayTimeline(plan),models=createLineModels(THREE),endX=cx+.25,machines=[],towers={},units={};
  for(const st of STATIONS){const m=models.machine(st.id,{x:X[st.id].mid,w:WIDTH[st.id]-.08,d:DEPTH,cy:CY});scene.add(m.group);
   for(const h of m.hit){h.userData.station=st.id;machines.push(h)}towers[st.id]=m.lamps;units[st.id]=m;
   const top=new THREE.Box3().setFromObject(m.group).max.y,sp=label(st.short,THREE);sp.position.set(X[st.id].mid,top+.32,0);scene.add(sp);owned.push(sp.material.map,sp.material)}
  STATIONS.slice(1).forEach((st,j)=>scene.add(models.link(X[STATIONS[j].id].right,X[st.id].left,CY)));
  const hall=models.environment(x0,endX+1.1);scene.add(hall);const inside=hall.userData.bounds;scene.add(models.link(X.xray.right,endX,CY));const unload=models.unloader(endX+.55,CY);scene.add(unload.group);
  // --- boards: the studio board itself — its outline and artwork per stage, and its real part models
  // (built at studio scale and shrunk, so small parts keep their true size; boxes on very large runs).
  const maxDim=Math.max(board.width,board.height),f=.8/maxDim,REF=10/maxDim;
  const topMats=['bare','paste','soldered'].map(st=>{const t=boardTexture(THREE,plan.board,plan.pads,st,f);if(t)keep(t);return t?mat(0xffffff,.1,.55,{map:t}):mat(0x1f6b45,.1,.55)}),edge=mat(0x1f6b45,.1,.6),slabGeo=keep(boardSlab(THREE,plan.board,f,.03));
  const proto=new THREE.Group();
  if(plan.machine.length*plan.schedule.length<=2500)for(const p of plan.machine){const body=buildBody(THREE,p,REF,{mat:(c,me,ro)=>mat(c,me,ro),partPads});const k=f/REF;body.mesh.scale.setScalar(k);body.mesh.position.set(p.x*f,.0006+body.h*k/2,p.y*f);body.mesh.rotation.y=(p.rot||0)*Math.PI/180;body.mesh.traverse(o=>{o.castShadow=true});proto.add(body.mesh)}
  else{const gs=plan.machine.map(p=>{const g=new THREE.BoxGeometry(Math.max(.004,p.w*f),Math.max(.004,(p.h||1)*f),Math.max(.004,p.d*f));g.rotateY((p.rot||0)*Math.PI/180);g.translate(p.x*f,(p.h||1)*f/2,p.y*f);return g});const m=gs.length?mergeGeometries(gs,false):null;gs.forEach(g=>g.dispose());if(m)proto.add(new THREE.Mesh(keep(m),mat(0x24282b,.2,.5)))}
  const boards=plan.schedule.map((row,i)=>{const g=new THREE.Group();const plate=new THREE.Mesh(slabGeo,[topMats[0],edge]);plate.castShadow=true;plate.position.y=.03;g.add(plate);
   const pm=proto.children.length?proto.clone():null;if(pm){pm.position.y=.03;g.add(pm)}g.visible=false;scene.add(g);return {g,plate,pm,i}});
  const entry=id=>id==='reflow'?X.reflow.left+.35:X[id].mid,exit=id=>id==='reflow'?X.reflow.right-.35:X[id].mid;
  const at=(id,p)=>id==='reflow'?entry(id)+(exit(id)-entry(id))*p:X[id].mid;
  const applyLine=T=>{const busy={},failed={};let good=0,bad=0;
   for(const b of boards){const s=boardAt(plan,b.i,T),row=plan.schedule[b.i];let stage=0;
    if(T>=row.printer.out)stage=1;if(T>=row.reflow.out)stage=2;b.plate.material[0]=topMats[stage];if(b.pm)b.pm.visible=T>=row.pnp.out;
    if(s.state==='queued'){b.g.visible=false;continue}b.g.visible=true;
    if(s.state==='in'){busy[s.station]=true;b.g.position.set(at(s.station,s.progress),CY,0)}
    else if(s.state==='moving'){const a=STATIONS[s.from].id,c=STATIONS[s.to].id;b.g.position.set(exit(a)+(entry(c)-exit(a))*s.progress,CY,0)}
    else{const ok=plan.results[b.i].pass,n=ok?good++:bad++;b.g.position.set(endX+.55,CY+.03+n*.04,ok?unload.slots.ok:unload.slots.ng)}}
   const queued=boards.filter(b=>T<plan.schedule[b.i].loader.out).length;units.loader.setRemaining(queued);
   for(const st of STATIONS){const done=plan.schedule.filter(r=>T>=r[st.id].out).length;const last=done?plan.results[done-1]:null;
    failed[st.id]=!!last&&((st.id==='spi'&&last.counts.spiFail>0)||(st.id==='aoi'&&last.counts.aoiFail>0)||(st.id==='xray'&&last.counts.xrayFail>0));
    const [g,a,r]=towers[st.id];g.material.emissiveIntensity=busy[st.id]?1.4:0;a.material.emissiveIntensity=!busy[st.id]&&!failed[st.id]?1.1:0;r.material.emissiveIntensity=failed[st.id]?1.4:0;
    // Operator screen: redrawn only when what it shows changes.
    const inside=plan.schedule.findIndex(rw=>T>=rw[st.id].in&&T<rw[st.id].out),info={name:st.short,state:failed[st.id]?'Check failed':busy[st.id]?'Running':'Waiting',board:inside>=0?`${inside+1}/${plan.schedule.length}`:'—',cycle:secs(plan.times[st.id]),done:`${done}/${plan.schedule.length}`},key=JSON.stringify(info);
    // The X-ray computer shows the live image of the part under the tube while a board is inside.
    if(st.id==='xray'&&inside>=0&&xtl.windows.length){const sc=scanState(xtl,T-plan.schedule[inside].xray.in),xkey=`x|${inside}|${scanKey(sc)}`;
     if(units.xray.shown!==xkey){units.xray.shown=xkey;units.xray.screen.paint((g,W,H)=>drawRadiograph(g,W,H,plan,plan.results[inside],sc.ref,{tilt:sc.tilt,live:sc.on,scan:sc.on?(sc.local*1.5)%1:null,reveal:sc.reveal}))}}
    else if(units[st.id].shown!==key){units[st.id].shown=key;units[st.id].screen.draw(info)}}
   return {busy,failed}};
  // --- inner scene (built on focus)
  let innerScene=null,innerObj=null,innerKit=null,saved=null;
  const openInner=async(id,k)=>{const load=INNER['./factory/'+id+'.js'];if(!load)return;const mod=await load();if(!api.current)return;closeInner();
   innerKit=createKit(THREE,plan);innerObj=mod.build(innerKit,{THREE,plan,result:plan.results[k],k});innerScene=new THREE.Scene();lights(innerScene);innerScene.background=new THREE.Color(0xcfd0cb);innerScene.add(innerObj.group);
   saved=saved||{pos:camera.position.clone(),target:controls.target.clone()};
   const bb=new THREE.Box3().setFromObject(innerObj.group),c=bb.getCenter(new THREE.Vector3()),r=bb.getBoundingSphere(new THREE.Sphere()).radius;
   if(innerObj.view){camera.position.set(...innerObj.view.position);controls.target.set(...innerObj.view.target)}else{controls.target.copy(c);camera.position.copy(c).addScaledVector(new THREE.Vector3(.25,.7,.8).normalize(),r/Math.sin(camera.fov*Math.PI/360)*.9)}
   clock.current.innerT=0;innerObj.update(0);setInner({t:0,step:0,duration:innerObj.duration,steps:innerObj.steps||[],k,rate:innerObj.rate||1})};
  const closeInner=()=>{if(innerObj){innerScene.remove(innerObj.group);innerObj.group.traverse(o=>{o.geometry?.dispose?.()});innerKit?.dispose();innerObj=null;innerScene=null;innerKit=null}};
  const backToLine=()=>{closeInner();if(saved){camera.position.copy(saved.pos);controls.target.copy(saved.target);saved=null}};
  // --- camera
  camera.position.set(x0*.12,7,16.5);controls.target.set(0,.6,0);
  const ray=new THREE.Raycaster(),ptr=new THREE.Vector2();let down=null;
  const pick=e=>{const r=renderer.domElement.getBoundingClientRect();ptr.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ptr,camera);return ray.intersectObjects(machines,false)[0]?.object.userData.station||null};
  const onDown=e=>{down=[e.clientX,e.clientY]};
  const onUp=e=>{if(innerObj||!down)return;const moved=Math.hypot(e.clientX-down[0],e.clientY-down[1])>5;down=null;if(moved)return;const id=pick(e);if(id)setFocus(id)};
  const onMove=e=>{if(innerObj)return;renderer.domElement.style.cursor=pick(e)?'pointer':''};
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);renderer.domElement.addEventListener('pointermove',onMove);
  const size=()=>{const w=el.clientWidth||800,h=el.clientHeight||460;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()};size();
  const ro=new ResizeObserver(size);ro.observe(el);let visible=true;const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting});io.observe(el);
  let anim=0,raf=0,last=performance.now(),lastUi=0,status=applyLine(0),shownT=-1,shownI=-1;
  const tick=now=>{raf=requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;const c=clock.current;
   if(c.seek!=null){c.T=c.seek;c.seek=null;status=applyLine(c.T)}
   if(c.playing){c.T=Math.min(total,c.T+dt*c.rate);status=applyLine(c.T);anim+=dt;if(c.T>=total){c.playing=false;setPlaying(false)}}
   if(!innerObj)for(const st of STATIONS)units[st.id].update(anim,!!status.busy?.[st.id],now/1000);
   if(innerObj){const d=innerObj.duration;if(c.innerSeek!=null){c.innerT=c.innerSeek;c.innerSeek=null}else c.innerT+=dt*(innerObj.rate||1)*(c.innerRate||1);if(c.innerT>d+1.2)c.innerT=0;const r=innerObj.update(Math.min(d,c.innerT));
    // A station can ask the camera to follow something (the board through the oven): keep the offset, move the target.
    if(r?.target){const want=new THREE.Vector3(...r.target),off=camera.position.clone().sub(controls.target),next=controls.target.clone().lerp(want,.2);controls.target.copy(next);camera.position.copy(next).add(off)}}
   if(now-lastUi>90){lastUi=now;if(c.T!==shownT){shownT=c.T;setUi({T:c.T,status})}if(innerObj&&c.innerT!==shownI){shownI=c.innerT;const t=Math.min(innerObj.duration,c.innerT);setInner(s=>({...s,t,step:stepAt(innerObj.steps||[],t)}))}}
   if(visible){controls.update();
    // The overview camera stays inside the hall walls and under the roof trusses.
    if(!innerObj){const p=camera.position;p.set(Math.min(inside.x1,Math.max(inside.x0,p.x)),Math.min(inside.y1,Math.max(inside.y0,p.y)),Math.min(inside.z1,Math.max(inside.z0,p.z)))}
    renderer.render(innerScene||scene,camera)}};
  raf=requestAnimationFrame(tick);
  api.current={openInner,backToLine};
  return()=>{cancelAnimationFrame(raf);ro.disconnect();io.disconnect();closeInner();controls.dispose();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('pointermove',onMove);
   scene.traverse(o=>{o.geometry?.dispose?.()});owned.forEach(x=>x.dispose?.());models.dispose();renderer.dispose();renderer.domElement.remove();api.current=null};
 },[plan,board,total]);

 useEffect(()=>{clock.current.T=0;clock.current.seek=0;setUi({T:0,status:{}});setPlaying(false);setFocus(null)},[plan]);
 // Opening a machine shows the board inside it now, else the last board it finished (else board 1).
 const boardFor=id=>{const T=clock.current.T;let k=0;plan.schedule.forEach((r,i)=>{if(T>=r[id].in)k=i});return k};
 useEffect(()=>{if(focus)api.current?.openInner(focus,boardFor(focus));else api.current?.backToLine()},[focus]);// eslint-disable-line react-hooks/exhaustive-deps
 const seek=T=>{const v=Math.max(0,Math.min(total,T));clock.current.seek=v;setUi(u=>({...u,T:v}))};
 const set=(k,v)=>setCfg(c=>({...c,[k]:v}));
 const st=plan.stats,now=ui.T,station=STATIONS.find(s=>s.id===focus),Panel=focus?PANELS[focus]:null;
 const stateOf=id=>ui.status?.failed?.[id]?'fail':ui.status?.busy?.[id]?'run':'idle';

 const fullButton=<button type="button" className="icon-button factory-full" aria-label={full?'Exit full screen':'Full screen'} title={full?'Exit full screen':'Full screen'} onClick={toggleFull}>{full?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>;
 return <section ref={shell} className={'factory'+(full?' is-full':'')} aria-label="Production line">
  <div className="factory-bar">
   {focus?<><button type="button" className="button small" onClick={()=>setFocus(null)}><ArrowLeft size={14}/>Line</button><h3>{station.name}</h3><span className="subtle-tag">Simulated</span>
    <label className="factory-field">Board<select aria-label="Board shown" value={inner.k} onChange={e=>api.current?.openInner(focus,+e.target.value)}>{plan.schedule.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label></>
   :<><button type="button" className="icon-button" aria-label={playing?'Pause production':'Run production'} onClick={()=>{if(clock.current.T>=total)seek(0);setPlaying(p=>!p)}}>{playing?<Pause size={17}/>:<Play size={17}/>}</button>
    <button type="button" className="icon-button" aria-label="Restart production" onClick={()=>{setPlaying(false);seek(0)}}><RotateCcw size={16}/></button>
    <input type="range" className="factory-scrub" min="0" max={total} step="0.1" value={Math.min(now,total)} aria-label="Production time" onChange={e=>{const v=+e.target.value;setPlaying(false);seek(v>=total-.15?total:v)}}/>
    <span className="factory-time">{secs(now)} / {secs(total)}</span>
    <div className="segmented" role="group" aria-label="Speed">{RATES.map(([v,l])=><button type="button" key={v} aria-pressed={rate===v} className={rate===v?'active':''} onClick={()=>setRate(v)}>{l}</button>)}</div>
    <label className="factory-field">Boards<input type="number" min="1" max="50" value={cfg.boards} aria-label="Boards" onChange={e=>set('boards',Math.max(1,Math.min(50,+e.target.value||1)))}/></label>
    <div className="segmented" role="group" aria-label="Nozzles">{[2,4,8].map(v=><button type="button" key={v} aria-pressed={cfg.nozzles===v} className={cfg.nozzles===v?'active':''} onClick={()=>set('nozzles',v)}>{v}</button>)}</div></>}
   {fullButton}
  </div>
  <div className="board-view factory-view">{failed?<div className="board-placeholder">3D needs WebGL.</div>:<div ref={host} className="factory-host"/>}
   {focus&&inner.steps.length>0&&<div className="factory-step" aria-live="polite"><b>{inner.step+1}/{inner.steps.length}</b> {inner.steps[inner.step]?.label}</div>}
   {!focus&&<div className="factory-hint">Click a machine</div>}</div>
  {focus?<div className="factory-detail">
    <div className="factory-inner-bar"><input type="range" min="0" max={inner.duration} step="0.01" value={inner.t} aria-label="Cycle time" onChange={e=>{clock.current.innerSeek=+e.target.value}}/><span className="factory-time">{secs(inner.t)} / {secs(inner.duration)}</span>
     <div className="segmented" role="group" aria-label="Cycle speed">{[[.5,'½×'],[1,'1×'],[3,'3×']].map(([v,l])=><button type="button" key={v} aria-pressed={(clock.current.innerRate||1)===v} className={(clock.current.innerRate||1)===v?'active':''} onClick={()=>{clock.current.innerRate=v;setInner(s=>({...s}))}}>{l}</button>)}</div></div>
    <div className="factory-columns"><ol className="factory-steps">{inner.steps.map((s,i)=><li key={i} className={i===inner.step?'now':i<inner.step?'done':''}><button type="button" onClick={()=>{clock.current.innerSeek=s.t}}><span className="numeric">{secs(s.t)}</span>{s.label}</button></li>)}</ol>
     <div className="factory-data">{Panel?<Suspense fallback={<p className="muted">Loading…</p>}><Panel plan={plan} result={plan.results[inner.k]} k={inner.k} t={inner.t} duration={inner.duration}/></Suspense>:null}</div></div>
   </div>
  :<><dl className="factory-stats">
    <div><dt>Takt</dt><dd>{secs(st.takt)}<small> {STATIONS.find(s=>s.id===st.bottleneck).short}</small></dd></div>
    <div><dt>Per hour</dt><dd>{Math.floor(st.perHour)}<small> boards</small></dd></div>
    <div><dt>First board</dt><dd>{secs(st.first)}</dd></div>
    <div><dt>{cfg.boards} boards</dt><dd>{secs(st.total)}</dd></div>
    <div><dt>First pass</dt><dd>{Math.round(st.fpy)}<small>%</small></dd></div>
   </dl>
   <ol className="factory-stations">{STATIONS.map(s=><li key={s.id} className={stateOf(s.id)+(st.bottleneck===s.id?' bottleneck':'')}><button type="button" aria-label={`Open ${s.name}`} onClick={()=>setFocus(s.id)}><i/><strong>{s.short}</strong><span className="numeric">{secs(plan.times[s.id])}</span><small>{Math.round(st.utilisation[s.id])}% busy</small></button></li>)}</ol>
   {(plan.hand.length>0||plan.bottom.length>0)&&<p className="factory-note muted">{plan.hand.length?`${plan.hand.length} through-hole after the line`:''}{plan.hand.length&&plan.bottom.length?' · ':''}{plan.bottom.length?`${plan.bottom.length} bottom-side in a second pass`:''}</p>}</>}
 </section>;
}
