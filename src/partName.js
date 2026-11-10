// Naming parts that arrive with a designator only (Gerber sets whose copper says "U1, pin 3" and
// nothing else): the package is read from the pad pattern, and a value that is really a part number
// becomes the part number. Used on import and for boards saved before, so they need no re-import.
import {classify} from './gerberInfer.js';
import {looksLikeMpn,TYPE_LABELS} from './blueprint.js';

const PREFIX_TYPE=[[/^(LED|DS)\d/i,'led'],[/^(R|RN|RV|VR)\d/i,'resistor'],[/^C\d/i,'capacitor'],[/^(L|FB)\d/i,'inductor'],[/^(D|ZD|TVS)\d/i,'diode'],[/^(Q|T)\d/i,'transistor'],[/^(U|IC)\d/i,'chip'],[/^(J|P|CN|CON|X)\d/i,'connector'],[/^(Y|XTAL|X)\d/i,'crystal'],[/^(SW|S|BTN)\d/i,'switch'],[/^(F|PTC)\d/i,'fuse'],[/^(K|RL)\d/i,'relay'],[/^(M|MOD)\d/i,'module']];
export const typeFromRef=ref=>(PREFIX_TYPE.find(([re])=>re.test(String(ref||'')))||[])[1]||'';

// Package from the pads (local or board coordinates, {x,y,w,h,hole}).
export function packageFromPads(ref,pads){
 if(!Array.isArray(pads)||!pads.length)return '';
 const c=classify(pads.map(p=>({x:+p.x,y:+p.y,w:+p.w||0,h:+p.h||0,hole:+p.hole||0})),'top');let pkg=c.package||'';
 const t=typeFromRef(ref);
 // Two through-hole leads: the classifier guesses resistor or capacitor by pitch; the designator knows better.
 const m=/^(Axial|Radial), ([\d.]+) mm lead pitch$/.exec(pkg);if(m&&t&&!((m[1]==='Axial'&&t==='resistor')||(m[1]==='Radial'&&t==='capacitor')))pkg=`Through-hole, ${m[2]} mm lead pitch`;
 // Sizes the pads alone cannot tell apart: the designator decides (a diode is SMA, a resistor 1210).
 const pair=/^(1210\/SMA|2512\/SMC)$/.exec(pkg);if(pair&&t){const [chip,diode]=pkg.split('/');pkg=['diode','led'].includes(t)?diode:['resistor','capacitor','inductor','fuse'].includes(t)?chip:pkg}
 if(/^(Single|[0-9]+-pad part)/.test(pkg)&&pads.length>1)pkg=`${pads.length}-pad ${pads.some(p=>+p.hole>0)?'through-hole':'SMD'}`;
 return pkg;
}

// What to call a part that has no part number yet: "Resistor · 0805", "Relay · 5-pad through-hole".
export function partLabel(p){
 const t=p.type&&p.type!=='other'?p.type:typeFromRef(p.ref)||'other';const name=t==='relay'?'Relay':TYPE_LABELS[t]||'Component';
 return p.package?`${name} · ${p.package}`:name;
}

// Fill what can be known without a part number. Returns the same object when nothing changes.
export function nameFromData(p){
 if(!p||p.suggested)return p;let next=p;
 if(!p.mpn&&looksLikeMpn(p.value))next={...next,mpn:String(p.value).trim()};
 if(!next.package&&next.pads?.length){const pkg=packageFromPads(next.ref,next.pads);if(pkg)next={...next,package:pkg,packageFromPads:true}}
 // The designator names kinds the 3D models do not have a type for (K1 is a relay).
 if(!next.typeLabel&&typeFromRef(next.ref)==='relay')next={...next,typeLabel:'Relay'};
 return next;
}
