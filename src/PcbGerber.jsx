import React,{useEffect,useRef,useState} from 'react';
import {Upload,X,CircuitBoard} from 'lucide-react';

// Gerber files for the bare-PCB quote: the bare board drawn in 2D (top face, or the bottom face as seen
// from below) in the chosen mask, legend and finish, and the board size, copper layers and smallest hole
// handed to the form. When the BOM came from a board in the workspace (boardSource, the board in the 3D
// view), that board is shown here without an upload: from its Gerber files when the board keeps them,
// from the faces drawn at import, or drawn from the board model (outline, traces, pads, holes). Only the
// facts are saved; an uploaded set needs the files again after a reload. demoUrl draws the demo board.
// onFiles receives an uploaded set once it reads as Gerber, so the BOM tool can send it on (Board studio, components).
export default function PcbGerber({info,spec,layers,material,boardSource=null,demoUrl=null,onRead,onClear,onFiles=null}){
 const [result,setResult]=useState(null),[model,setModel]=useState(null),[side,setSide]=useState('top'),[img,setImg]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[over,setOver]=useState(false);
 const fileRef=useRef(null),loaded=useRef('');
 const build=async(texts,name)=>{const [{gerberFacts},{buildGerberBoard}]=await Promise.all([import('./gerberQuote.js'),import('./gerber.js')]);
  const r=buildGerberBoard(texts,{name});setImg(null);setResult(r);setSide('top');return {name,...gerberFacts(r)}};
 // An upload takes over at once: a board still being linked in the background stops (see stale()).
 const read=async list=>{if(!list.length)return;loaded.current='upload';setError('');setBusy('Reading Gerber files…');
  try{const {readGerberFiles}=await import('./gerberQuote.js');const name=list.length===1?list[0].name:`${list.length} files`;onRead(await build(await readGerberFiles(list),name));onFiles?.(list)}
  catch(e){setError(e.message||'These files could not be read as a Gerber set.')}finally{setBusy('')}};
 // The board's own Gerber set (or the demo board), loaded once per source. A board's facts are handed
 // to the form only when they are not already there, so an entered price is kept across reloads.
 const fromBoard=boardSource&&(!info||info.board===boardSource.id)?boardSource:null;
 const key=demoUrl?'demo:'+demoUrl:fromBoard?'board:'+fromBoard.id:'';
 useEffect(()=>{if(!key||loaded.current===key)return;loaded.current=key;let live=true;const stale=()=>!live||loaded.current!==key;setError('');setBusy('Reading Gerber files…');
  (async()=>{try{
   if(demoUrl){const {readGerberFiles}=await import('./gerberQuote.js');const r=await fetch(demoUrl);if(!r.ok)throw Error('The demo board could not be loaded.');
    const file=new File([await r.arrayBuffer()],demoUrl.split('/').pop());if(!stale())await build(await readGerberFiles([file]),file.name);return}
   if(fromBoard.gerberSource){const {gerberFromBoard}=await import('./gerberQuote.js');const {result:r,facts}=await gerberFromBoard(fromBoard);if(stale())return;
    setImg(null);setModel(null);setResult(r);setSide('top');if(info?.board!==fromBoard.id)onRead(facts);return}
   const {boardFacts}=await import('./bareBoard.js');if(stale())return;setImg(null);setResult(null);setModel(fromBoard);setSide('top');if(info?.board!==fromBoard.id)onRead(boardFacts(fromBoard,fromBoard.parts))}
  catch(e){if(!stale())setError(e.message||'The board\'s Gerber files could not be read.')}finally{if(!stale())setBusy('')}})();
  return()=>{live=false}},[key]);// eslint-disable-line react-hooks/exhaustive-deps
 // Redraw when a new set arrives or the mask, legend or finish changes.
 const look=[spec.color,spec.silkscreen,spec.finish].join('|');
 // A board whose Gerber files were not kept shows the faces drawn when it was imported (colours as imported).
 const asImported=!result&&!!model?.surface?.top;
 useEffect(()=>{if(!result&&!model)return;let live=true;setBusy('Drawing the board…');
  (async()=>{try{const {boardColors}=await import('./gerberQuote.js');let s;
   if(result){const {renderGerberSurfaces}=await import('./gerberRender.js');s=await renderGerberSurfaces(result,{maxSide:1200,quality:.88,colors:boardColors(spec)})}
   else if(model.surface?.top)s={top:model.surface.top,bottom:model.surface.bottom||model.surface.top};
   else{const {bareBoardImages}=await import('./bareBoard.js');s=await bareBoardImages(model,model.parts,boardColors(spec))}
   if(live)setImg(s)}catch{if(live)setError('The board could not be drawn.')}finally{if(live)setBusy('')}})();
  return()=>{live=false}},[result,model,look]);
 const clear=()=>{setResult(null);setModel(null);setImg(null);setError('');loaded.current='';onClear(info?.board||null)};
 const drop=e=>{e.preventDefault();setOver(false);read([...e.dataTransfer.files])};
 const aspect=info?`${info.widthMm} / ${info.heightMm}`:undefined;
 return <div className={'pcb-gerber'+(over?' over':'')} data-tour="pcb-gerber" onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={drop}>
  <div className="pcb-gerber-head"><h3 className="bom-sub">{info?.board?'Bare board':'Gerber files'}</h3>
   <span className="pcb-gerber-actions"><button type="button" className="button small" onClick={()=>fileRef.current?.click()} disabled={!!busy}><Upload size={14}/>{info?'Replace':'Upload Gerber'}</button>
    {info&&<button type="button" className="icon-button" aria-label="Remove the Gerber files" onClick={clear}><X size={15}/></button>}</span></div>
  <input ref={fileRef} type="file" hidden multiple aria-label="Upload Gerber files" accept=".zip,.gbr,.ger,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gtp,.gbp,.gko,.gml,.gm1,.drl,.xln,.txt" onChange={e=>{read([...e.target.files]);e.target.value=''}}/>
  {info?.board&&<p className="pcb-gerber-board small-copy"><CircuitBoard size={14}/> From the board this BOM was loaded from: <strong>{info.boardName}</strong>{info.drawn==='model'?', drawn from its outline, tracks, pads and holes':''}. No need to upload a Gerber.</p>}
  {busy&&<p className="muted small-copy" role="status">{busy}</p>}
  {error&&<p className="warn-text small-copy" role="alert">{error}</p>}
  {!info&&!busy&&<p className="muted small-copy">Upload the Gerber ZIP, or the layer and drill files, to take the board size and copper layers from the design and see the bare board. You can also drop them here. A BOM loaded from a board imported as Gerber uses that board's files.</p>}
  {info&&<>
   <dl className="pcb-gerber-facts" aria-label="From the Gerber files"><div><dt>File</dt><dd>{info.name}</dd></div><div><dt>Size</dt><dd>{info.widthMm} × {info.heightMm} mm</dd></div>
    <div><dt>Copper layers</dt><dd>{info.layers}</dd></div><div><dt>Drill hits</dt><dd>{info.hits}{info.slots?` + ${info.slots} slots`:''}</dd></div><div><dt>Smallest hole</dt><dd>{info.minHoleMm!=null?info.minHoleMm+' mm':'none'}</dd></div></dl>
   {info.layers!==layers&&<p className="warn-text small-copy">{info.board?'The board':'The Gerber'} has {info.layers} copper layer{info.layers===1?'':'s'}; {material} is quoted at {layers}. Choose a material that makes {info.layers} layers.</p>}
   {!info.outline&&<p className="warn-text small-copy">No board outline layer: the size is the extent of the copper plus 1 mm.</p>}
   {info.warnings?.map(w=><p key={w} className="muted small-copy">{w}</p>)}
   {result||model?<>
    <div className="segmented" role="group" aria-label="Board face">{[['top','Top'],['bottom','Bottom']].map(([k,l])=><button type="button" key={k} aria-pressed={side===k} className={side===k?'active':''} onClick={()=>setSide(k)}>{l}</button>)}</div>
    <figure className="pcb-gerber-view" style={{aspectRatio:aspect}}>{img&&<img src={img[side]} className={side==='bottom'?'mirror':''} alt={`${side==='top'?'Top':'Bottom'} of the bare board from ${info.name}, ${info.widthMm} × ${info.heightMm} mm${side==='bottom'?', seen from below':''}`}/>}</figure>
    <small className="muted">{side==='top'?'Top face':'Bottom face, seen from below'} · {asImported?'as drawn when the board was imported':'drawn in the chosen mask, silkscreen and finish'}</small></>
   :!busy&&<p className="muted small-copy">Upload the files again to see the board. Its size and layers are kept.</p>}</>}
 </div>;
}
