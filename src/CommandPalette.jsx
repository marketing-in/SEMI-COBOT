import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,CornerDownLeft} from 'lucide-react';

// Search and jump (Ctrl+K / ⌘K): one box for every page, the common actions, inventory parts, saved
// lists and boards. Type a few letters, move with the arrow keys, Enter opens it.
export default function CommandPalette({items,onClose}){
 const [q,setQ]=useState(''),[at,setAt]=useState(0);const input=useRef(null),listRef=useRef(null);
 useEffect(()=>{input.current?.focus()},[]);
 const shown=useMemo(()=>{const words=q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit=it=>{const hay=(it.label+' '+(it.hint||'')+' '+it.group+' '+(it.keys||'')).toLowerCase();return words.every(w=>hay.includes(w))};
  const list=items.filter(it=>!words.length?it.group!=='Parts'&&it.group!=='Saved lists'&&it.group!=='Boards':hit(it));
  return list.slice(0,60)},[q,items]);
 useEffect(()=>{setAt(0)},[q]);
 useEffect(()=>{listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})},[at]);
 const run=it=>{onClose();setTimeout(()=>it.run(),0)};
 const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}else if(e.key==='ArrowDown'){e.preventDefault();setAt(a=>Math.min(shown.length-1,a+1))}else if(e.key==='ArrowUp'){e.preventDefault();setAt(a=>Math.max(0,a-1))}else if(e.key==='Enter'&&shown[at]){e.preventDefault();run(shown[at])}};
 let last='';
 return <div className="palette-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="palette" role="dialog" aria-modal="true" aria-label="Search and jump">
   <div className="palette-input"><Search size={16}/><input ref={input} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={key} placeholder="Go to a page, run an action, find a part number, list or board…" aria-label="Search and jump" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[at]?'pal-'+at:undefined}/><kbd>Esc</kbd></div>
   <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
    {shown.map((it,i)=>{const head=it.group!==last;last=it.group;return <React.Fragment key={it.group+it.label+i}>{head&&<li className="palette-group" role="presentation">{it.group}</li>}
     <li id={'pal-'+i} role="option" aria-selected={i===at} className={i===at?'on':''} onMouseMove={()=>setAt(i)} onMouseDown={e=>{e.preventDefault();run(it)}}>{it.icon&&<it.icon size={15}/>}<span><strong>{it.label}</strong>{it.hint&&<small>{it.hint}</small>}</span>{i===at&&<CornerDownLeft size={13}/>}</li></React.Fragment>})}
    {shown.length===0&&<li className="palette-empty">Nothing matches “{q}”.</li>}
   </ul>
   <p className="palette-foot">↑ ↓ to move · Enter to open · Ctrl+K or ⌘K anywhere</p>
  </div>
 </div>;
}
