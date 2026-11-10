import React,{useState} from 'react';
import {ohmsOf,smdCode,colourBands,familyOf} from './partLook.js';

// Component picture: the supplier's product photo when one is known, otherwise a drawing of the
// package (QFP, SOIC, SOT-23, TO-220, chip resistor with its value code, ceramic and electrolytic
// capacitors, diodes, crystals, connectors…) so every BOM row shows what the part looks like.

const BODY='#1d1f22',TIN='#c3c8cc',LEAD='#9aa0a5',MARK='#9ba1a6',TAN='#b89a6c',BLUE='#24375f',AMBER='#c99a3a';

function Drawing({p}){
 const f=familyOf(p),ohms=f==='chipR'||f==='axialR'?ohmsOf(p.value||p.description||p.mpn):null;
 const pins=(n,x0,y,w,step,h,vertical=false)=>Array.from({length:n},(_,i)=>vertical?<rect key={i} x={y} y={x0+i*step} width={h} height={w} fill={TIN}/>:<rect key={i} x={x0+i*step} y={y} width={w} height={h} fill={TIN}/>);
 switch(f){
  case 'qfp':return <g><rect x="16" y="16" width="32" height="32" rx="1.5" fill={BODY}/>{pins(8,18.5,10,2,3.6,6)}{pins(8,18.5,48,2,3.6,6)}{pins(8,18.5,10,2,3.6,6,true)}{pins(8,18.5,48,2,3.6,6,true)}<circle cx="21" cy="21" r="1.6" fill="#33363a"/></g>;
  case 'qfn':return <g><rect x="14" y="14" width="36" height="36" rx="2" fill={BODY}/>{pins(7,18,50,2.2,4.4,2)}{pins(7,18,12,2.2,4.4,2)}<circle cx="19" cy="19" r="1.6" fill="#33363a"/></g>;
  case 'dip':return <g><rect x="12" y="20" width="40" height="24" rx="1.5" fill={BODY}/>{pins(6,15,13,3,6.6,7)}{pins(6,15,44,3,6.6,9)}<path d="M12 29a3 3 0 0 1 0 6" fill="#33363a"/></g>;
  case 'soic':return <g><rect x="18" y="14" width="28" height="36" rx="1.5" fill={BODY}/>{pins(4,17,10,6,8.6,2.4,true)}{pins(4,17,46,6,8.6,2.4,true)}<circle cx="23" cy="19" r="1.6" fill="#33363a"/></g>;
  case 'sot':return <g><rect x="20" y="22" width="24" height="20" rx="1.5" fill={BODY}/><rect x="23" y="42" width="4" height="8" fill={TIN}/><rect x="37" y="42" width="4" height="8" fill={TIN}/><rect x="30" y="14" width="4" height="8" fill={TIN}/></g>;
  case 'to220':return <g><rect x="18" y="6" width="28" height="14" fill={TIN}/><circle cx="32" cy="13" r="3.4" fill="#e9e7e1"/><rect x="18" y="20" width="28" height="22" fill={BODY}/>{[23,31,39].map(x=><rect key={x} x={x} y="42" width="2.6" height="17" fill={LEAD}/>)}</g>;
  case 'to92':return <g><path d="M20 34V22a12 12 0 0 1 24 0v12z" fill={BODY}/>{[24,31,38].map(x=><rect key={x} x={x} y="34" width="2.2" height="22" fill={LEAD}/>)}</g>;
  case 'chipR':return <g><rect x="12" y="22" width="40" height="20" rx="1" fill={BODY}/><rect x="12" y="22" width="7" height="20" fill={TIN}/><rect x="45" y="22" width="7" height="20" fill={TIN}/><text x="32" y="36" textAnchor="middle" fontSize="9" fontFamily="IBM Plex Mono, monospace" fill="#e8e8e2">{smdCode(ohms)||'R'}</text></g>;
  case 'axialR':{const b=colourBands(ohms);return <g><rect x="2" y="31" width="60" height="2" fill={LEAD}/><rect x="16" y="24" width="32" height="16" rx="6" fill="#d9c3a0"/>{b.map((c,i)=><rect key={i} x={21+i*6+(i===3?3:0)} y="24" width="3" height="16" fill={c}/>)}</g>}
  case 'chipC':return <g><rect x="14" y="23" width="36" height="18" rx="1" fill={TAN}/><rect x="14" y="23" width="7" height="18" fill={TIN}/><rect x="43" y="23" width="7" height="18" fill={TIN}/></g>;
  case 'tantalum':return <g><rect x="14" y="21" width="36" height="22" rx="1" fill={AMBER}/><rect x="14" y="21" width="7" height="22" fill="#7a4f1a"/><rect x="10" y="27" width="4" height="10" fill={TIN}/><rect x="50" y="27" width="4" height="10" fill={TIN}/></g>;
  case 'electrolytic':return <g><rect x="18" y="8" width="28" height="40" rx="3" fill={BLUE}/><rect x="38" y="8" width="6" height="40" fill="#cfd5dc"/><text x="41" y="30" textAnchor="middle" fontSize="7" fill={BLUE} fontFamily="IBM Plex Sans, sans-serif">−</text><rect x="18" y="12" width="28" height="1.6" fill="#13203a"/><rect x="24" y="48" width="2" height="12" fill={LEAD}/><rect x="38" y="48" width="2" height="9" fill={LEAD}/></g>;
  case 'diode':return <g><rect x="14" y="22" width="36" height="20" rx="1.5" fill={BODY}/><rect x="17" y="22" width="5" height="20" fill="#d9dedb"/><rect x="10" y="27" width="4" height="10" fill={TIN}/><rect x="50" y="27" width="4" height="10" fill={TIN}/></g>;
  case 'axialD':return <g><rect x="2" y="31" width="60" height="2" fill={LEAD}/><rect x="20" y="25" width="24" height="14" rx="2" fill={BODY}/><rect x="23" y="25" width="4" height="14" fill="#d9dedb"/></g>;
  case 'led':return <g><rect x="16" y="22" width="32" height="20" rx="1" fill="#e8ece9"/><circle cx="32" cy="32" r="7" fill="#7fd39b" opacity=".85"/><rect x="12" y="27" width="4" height="10" fill={TIN}/><rect x="48" y="27" width="4" height="10" fill={TIN}/></g>;
  case 'crystal':return <g><rect x="10" y="20" width="44" height="24" rx="12" fill={TIN}/><rect x="14" y="24" width="36" height="16" rx="8" fill="#d5d9dc"/></g>;
  case 'inductor':return <g><rect x="14" y="14" width="36" height="36" rx="4" fill="#3a3d40"/><circle cx="32" cy="32" r="11" fill="none" stroke="#c48a4f" strokeWidth="3"/><circle cx="32" cy="32" r="5" fill="none" stroke="#c48a4f" strokeWidth="2"/></g>;
  case 'usb':return <g><rect x="10" y="20" width="44" height="24" rx="4" fill={TIN}/><rect x="16" y="27" width="32" height="10" rx="3" fill="#2a2c2f"/><rect x="22" y="31" width="20" height="2" fill={TIN}/></g>;
  case 'header':return <g><rect x="6" y="26" width="52" height="12" fill={BODY}/>{[11,21,31,41,51].map(x=><rect key={x} x={x-1.5} y="10" width="3" height="44" fill="#c9a35a"/>)}</g>;
  default:return <g><rect x="16" y="18" width="32" height="28" rx="2" fill={BODY}/>{pins(4,19,12,3,7.6,6)}{pins(4,19,46,3,7.6,6)}</g>;
 }
}

export function PartImage({part,src,size=44,className=''}){
 const [failed,setFailed]=useState(false);
 const label=`${part?.mpn||'Component'} picture`;
 if(src&&!failed)return <img className={'part-image photo '+className} src={src} alt={label} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
 return <svg className={'part-image drawn '+className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label}><Drawing p={part||{}}/></svg>;
}
export default PartImage;
