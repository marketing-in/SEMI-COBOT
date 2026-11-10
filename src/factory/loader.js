// PCB loader (magazine unloader), the first machine of the line. A slotted magazine holds the bare
// boards still to be built at a fixed pitch; an elevator indexes it so the next slot sits on the
// conveyor pass line; a pusher bar on a linear actuator slides that board out onto the edge belts,
// which carry it to the paste printer's infeed. Millimetres in, poses pure in t.
import {span,ease,lerp} from './common.js';

export const PITCH=10,SLOTS=10;
// Cycle fractions: index the magazine, confirm the board at the pass line, push, then convey out
// while the pusher retracts.
const PH={index:[0,.22],sense:.24,push:[.3,.52],retract:[.52,.66],convey:[.52,.9],ready:.92};

// Everything the 3D view and the panel share: which slot is aligned, strokes and speeds.
export function loaderNumbers(plan,k=0){
 const N=plan.opts.boards,W=plan.board.width,H=plan.board.height,D=plan.times.loader;
 const remaining=Math.max(1,N-k),shown=Math.min(remaining,8),slot=Math.min(k,SLOTS-shown);
 const magL=-W/2-3,magR=W/2+3;                        // inner length W + 6 along the push axis, board centred at x = 0
 const push=W*.55+3;                                  // leading edge ends about half a board onto the belts
 const bladeIn=magL-4,bladeOut=push-W/2-1;            // pusher blade face, retracted and extended
 const beltL=magR+5,wall=beltL+W+24,end=wall+W*.2,beltEnd=wall+Math.max(12,W*.7+2);    // belts start just clear of the moving magazine; printer infeed wall
 const convey=end-push,tConvey=(PH.convey[1]-PH.convey[0])*D;
 return {N,k,W,H,D,remaining,shown,slot,magL,magR,push,bladeIn,bladeOut,stroke:bladeOut-bladeIn,beltL,beltEnd,wall,end,convey,
  speed:Math.round(convey/tConvey),railWidth:H+1,phases:PH};
}

// Poses at time t (mm): elevator lift, pusher blade face, board centre x and height.
export function loaderState(n,t){
 const f=t/n.D,P=n.phases;
 const lift=lerp((n.slot-1)*PITCH,n.slot*PITCH,ease(span(f,...P.index)));
 const blade=f<P.push[1]?lerp(n.bladeIn,n.bladeOut,ease(span(f,...P.push))):lerp(n.bladeOut,n.bladeIn,ease(span(f,...P.retract)));
 // The blade only moves the board once it touches the trailing edge.
 const x=f<P.push[1]?Math.max(0,blade+n.W/2):n.push+n.convey*ease(span(f,...P.convey));
 return {lift,blade,x,y:lift-n.slot*PITCH,out:x-n.W/2>n.magR,f};
}

export function build(kit,{THREE,plan,k=0}){
 const {M,box,cyl,mat,COLORS:C}=kit,n=loaderNumbers(plan,k),{W,H,D}=n,group=new THREE.Group();
 const frame=mat(C.frame,.15,.7),dark=mat(C.dark,.3,.6),steel=mat(C.steel,.7,.35),copper=mat(C.copper,.35,.45),belt=mat(C.belt,.05,.9);
 const at=(o,x,y,z)=>{o.position.set(M(x),M(y),M(z));return o};
 const inst=(w,h,d,material,count)=>{const m=new THREE.InstancedMesh(new THREE.BoxGeometry(M(w),M(h),M(d)),material,Math.max(1,count));m.count=count;m.castShadow=m.receiveShadow=true;return m};
 const m4=new THREE.Matrix4();
 const top=(SLOTS-1)*PITCH,baseY=-SLOTS*PITCH-17,colTop=top+12,colZ=-(H/2+24);

 // Fixed frame: base plate, elevator column with lead screw, conveyor, printer infeed wall.
 const x0=n.bladeIn-(n.stroke+26)-14,x1=n.wall+6+W*.9;
 box(x1-x0,4,H+70,frame,(x0+x1)/2,baseY-2,-6,group);
 box(16,colTop-baseY,12,dark,0,(colTop+baseY)/2,colZ-4,group);
 cyl(2.2,2.2,colTop-baseY,steel,0,(colTop+baseY)/2,colZ+4,group,12);
 kit.rails(n.beltEnd-n.beltL,group).position.x=M((n.beltL+n.beltEnd)/2);
 for(const s of [-1,1])box(n.beltEnd-n.beltL,1.2,3,belt,(n.beltL+n.beltEnd)/2,-2.2,s*(H/2-1.5),group);
 for(const s of [-1,1])for(const x of [n.beltL+4,n.wall-6])box(4,-7-baseY,4,steel,x,(baseY-7)/2,s*(H/2+2),group);
 // Belt marks on the outer face of each belt, so the belt's travel reads.
 const MARK=8,beltLen=n.beltEnd-n.beltL,marks=Math.floor(beltLen/MARK),markMesh=inst(2,.8,.3,steel,marks*2);markMesh.name='loader-belt-marks';group.add(markMesh);
 // Printer infeed: a wall with an opening at the pass line, copper band like the machines on the line.
 const wz=H/2+30,oz=H/2+7,oy0=-10,oy1=8,wy1=70;
 box(6,oy0-baseY,wz*2,frame,n.wall,(oy0+baseY)/2,0,group);box(6,wy1-oy1,wz*2,frame,n.wall,(wy1+oy1)/2,0,group);
 for(const s of [-1,1])box(6,oy1-oy0,wz-oz,frame,n.wall,(oy0+oy1)/2,s*(wz+oz)/2,group);
 box(6.2,4,wz*2+.2,copper,n.wall,wy1-8,0,group);box(1,oy1-oy0,oz*2,dark,n.wall+3.2+W*.9,(oy0+oy1)/2,0,group);
 // Sensors (emissive only while they see a board): slot sensor beside the magazine mouth, exit eye under the belts.
 const lamp=()=>mat(0x2b2c2e,.1,.5,{emissive:C.pass,emissiveIntensity:0});
 const slotLamp=lamp(),exitLamp=lamp(),exitX=n.beltL+10;
 box(4,4,8,dark,n.magR+3,3.5,H/2+12,group);box(1.2,1.6,1.6,slotLamp,n.magR+1.2,3.5,H/2+12,group).castShadow=false;
 box(6,4,6,dark,exitX,-8,0,group);box(3,.6,3,exitLamp,exitX,-5.7,0,group).castShadow=false;

 // Elevator: table, carriage on the column, and the magazine riding on it.
 const lift=new THREE.Group();lift.name='loader-lift';group.add(lift);
 const botY=-top-8;
 box(W+16,4,H+28,dark,0,botY-3,-6,lift);box(20,16,8,steel,0,botY-3,colZ+10,lift);
 box(W+14,2,H+12,frame,0,botY,0,lift);box(W+14,2,H+12,frame,0,9,0,lift);
 const plateH=9-botY;box(W+10,plateH,1,frame,0,(9+botY)/2,-(H/2+5.5),lift);
 for(const s of [-1,1])for(const x of [n.magL-2.5,n.magR+2.5])box(3,plateH,3,s>0?steel:frame,x,(9+botY)/2,s*(H/2+4),lift);
 // Slotted side guides: one rib under each board edge per slot.
 const ribs=inst(W+8,1,3.5,steel,SLOTS*2);
 for(let j=0;j<SLOTS;j++)for(const s of [-1,1])ribs.setMatrixAt(j*2+(s>0?1:0),m4.makeTranslation(0,M(-j*PITCH-1.6-.5),M(s*(H/2+.75))));
 ribs.instanceMatrix.needsUpdate=true;lift.add(ribs);
 // Boards still to come sit in the slots below; the one being unloaded moves on its own.
 const cur=kit.makeBoard({stage:'bare'});cur.group.name='loader-board';group.add(cur.group);
 const pcb=cur.group.children[0],copperPads=cur.copper;
 for(let j=n.slot+1;j<n.slot+n.shown;j++){const g=new THREE.Group(),p=pcb.clone(),c=new THREE.InstancedMesh(copperPads.geometry,copperPads.material,Math.max(1,copperPads.count));
  c.count=copperPads.count;c.visible=copperPads.visible;c.instanceMatrix.array.set(copperPads.instanceMatrix.array);c.instanceMatrix.needsUpdate=true;g.add(p,c);g.name='loader-slot-board';at(g,0,-j*PITCH,0);lift.add(g)}

 // Pusher: actuator body behind the magazine, rod and a thin blade that fits the slot.
 const bodyR=n.bladeIn-14,bodyLen=n.stroke+26,passY=-.8;
 box(bodyLen,12,14,dark,bodyR-bodyLen/2,passY-2,0,group);box(bodyLen,1.2,14.2,copper,bodyR-bodyLen/2,passY+3.6,0,group);
 for(const x of [bodyR-bodyLen+4,bodyR-4])box(6,passY-2-6-baseY,10,frame,x,(passY-8+baseY)/2,0,group);
 const pusher=new THREE.Group();pusher.name='loader-pusher';group.add(pusher);
 const rod=cyl(1.6,1.6,1,steel,0,0,0,pusher,14);rod.rotation.z=Math.PI/2;
 const blade=box(2,1.2,Math.min(H*.6,60),steel,0,passY,0,pusher);
 box(4,6,Math.min(H*.6,60)*.5,steel,-3,passY,0,pusher);

 
 const steps=[
  {t:0,label:`Index magazine to slot ${n.slot+1}`},
  {t:PH.sense*D,label:'Board at pass line'},
  {t:PH.push[0]*D,label:`Push board ${k+1} onto conveyor`},
  {t:PH.push[1]*D,label:'Retract pusher, convey to printer'},
  {t:PH.ready*D,label:n.remaining>1?`Ready for board ${k+2}`:'Magazine empty'},
 ];
 // The magazine is a fixed ~220 mm tall, so on small boards (kit scale 8 units per board) the machine
 // would outgrow the shell's 80-unit orbit limit: shrink the whole station to keep it framed.
 const cx=(x0+x1)/2,cy=-15,r=Math.hypot(x1-x0,colTop-baseY,H+70)/2,sc=Math.min(1,28/M(r));group.scale.setScalar(sc);
 const dir=new THREE.Vector3(.3,.42,.86).normalize(),dist=M(r)*sc/Math.sin(17*Math.PI/180)*.72;
 const view={target:[M(cx)*sc,M(cy)*sc,0],position:[M(cx)*sc+dir.x*dist,M(cy)*sc+dir.y*dist,dir.z*dist]};

 group.userData={magazineLeft:M(n.magL)*sc,magazineRight:M(n.magR)*sc,scale:sc,numbers:n};
 const update=t=>{
  const s=loaderState(n,Math.max(0,Math.min(D,t)));
  lift.position.y=M(s.lift);
  at(cur.group,s.x,s.y,0);
  // Blade face at s.blade; the rod runs from the actuator body to the blade.
  const L=Math.max(1,s.blade-1-bodyR);rod.scale.y=L;rod.position.set(M(bodyR+L/2),M(passY),0);blade.position.x=M(s.blade-1);
  pusher.children[2].position.x=M(s.blade-4);
  slotLamp.emissiveIntensity=s.f>=PH.index[1]&&s.x-W/2<n.magR?1.4:0;
  exitLamp.emissiveIntensity=s.f>=PH.index[1]&&Math.abs(s.x-exitX)<=W/2?1.4:0;
  // Belt marks travel with the board while it rides the belts.
  const d=Math.max(0,s.x);
  for(let i=0;i<marks;i++){const x=n.beltL+((i*MARK+d)%beltLen+beltLen)%beltLen;for(const z of [0,1])markMesh.setMatrixAt(i*2+z,m4.makeTranslation(M(x),M(-2.2),M((z?1:-1)*(H/2+.2))))}
  markMesh.instanceMatrix.needsUpdate=true;
 };
 update(0);
 return {group,duration:D,steps,update,view};
}
