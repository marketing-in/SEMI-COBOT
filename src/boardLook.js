// The board's own look for the production-line views: its outline, and its top artwork (the Gerber
// surface render or the picture blueprint) with the pads coloured for the line stage — bare copper,
// printed paste, or reflowed solder. f is scene units per millimetre.
export function boardShape(THREE,b,f){
 if(b.outline&&b.outline.length>2)return new THREE.Shape(b.outline.map(([x,y])=>new THREE.Vector2(x*f,-y*f)));
 const w=b.width*f/2,h=b.height*f/2;return new THREE.Shape([new THREE.Vector2(-w,-h),new THREE.Vector2(w,-h),new THREE.Vector2(w,h),new THREE.Vector2(-w,h)]);
}
// Board slab with its top face at y = 0. Material group 0 is the faces, 1 the edges.
export function boardSlab(THREE,b,f,thickness){const g=new THREE.ExtrudeGeometry(boardShape(THREE,b,f),{depth:thickness,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(0,-thickness,0);return g}

const PAD={bare:'#c9a35a',paste:'#9ea3a8',soldered:'#e3e6e8'};
// Top-face texture. Extrude UVs are the shape coordinates, so the board's bounding box is mapped
// onto [0,1]; canvas row 0 is the board's top edge (y = −height/2). Returns null outside a browser.
export function boardTexture(THREE,b,pads,stage,f,{size=512}={}){
 if(typeof document==='undefined')return null;
 const W=b.width,H=b.height,c=document.createElement('canvas');c.width=size;c.height=Math.max(32,Math.round(size*H/W));
 const x=c.getContext('2d'),sx=c.width/W,sy=c.height/H,tex=new THREE.CanvasTexture(c);
 tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;tex.repeat.set(1/(W*f),1/(H*f));tex.offset.set(.5,.5);
 const art=b.surfaceTop?{url:b.surfaceTop,crop:null}:b.image?{url:b.image.url,crop:b.image.crop}:null;
 const paint=img=>{x.fillStyle='#1f6b45';x.fillRect(0,0,c.width,c.height);
  if(img){const k=img.crop;if(k&&k.w>0)x.drawImage(img.el,k.x*img.el.width,k.y*img.el.height,k.w*img.el.width,k.h*img.el.height,0,0,c.width,c.height);else x.drawImage(img.el,0,0,c.width,c.height)}
  // Artwork already shows bare copper; paste and solder are drawn over it.
  if(!img||stage!=='bare'){x.fillStyle=PAD[stage]||PAD.bare;for(const p of pads)x.fillRect((p.x+W/2-p.w/2)*sx,(p.y+H/2-p.h/2)*sy,Math.max(1,p.w*sx),Math.max(1,p.h*sy))}
  tex.needsUpdate=true};
 paint(null);
 if(art){const el=new Image();el.onload=()=>paint({el,crop:art.crop});el.src=art.url}
 return tex;
}
