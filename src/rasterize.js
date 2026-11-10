// Browser-only helpers that turn a picture blueprint (PDF page, PNG, JPEG, WebP) into pixels the
// detector can read, plus the PDF text layer so printed labels can be attached to components.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const r4=n=>Math.round(n*1e4)/1e4;

export async function rasterizeFile(file,{maxSide=1400}={}){
 const isPdf=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
 if(isPdf)return rasterizePdf(file,maxSide);
 if(!/^image\//.test(file.type)&&!/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))throw Error('Choose a PDF or an image file (PNG, JPEG, WebP).');
 let bitmap;
 try{bitmap=await createImageBitmap(file)}catch{throw Error('This image could not be decoded. Export it as PNG or JPEG and try again.')}
 const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 return {canvas,width:canvas.width,height:canvas.height,kind:'image',pageCount:1,textItems:[]};
}

async function rasterizePdf(file,maxSide){
 const pdfjs=await import('pdfjs-dist');
 pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
 let doc,task;
 try{task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});doc=await task.promise}catch{throw Error('This PDF could not be opened. Export it again without password protection.')}
 const page=await doc.getPage(1);
 const base=page.getViewport({scale:1});
 const scale=maxSide/Math.max(base.width,base.height);
 const viewport=page.getViewport({scale});
 const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 await page.render({canvasContext:ctx,viewport}).promise;
 // Text runs with their boxes in normalised page coordinates (x right, y down).
 const textItems=[];
 try{
  const content=await page.getTextContent();
  for(const item of content.items){
   if(!item.str||!item.str.trim())continue;
   const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
   const h=Math.abs(item.height*scale)||Math.hypot(item.transform[1],item.transform[3])*scale,w=Math.abs(item.width*scale);
   textItems.push({text:item.str.trim(),x:r4(x/canvas.width),y:r4((y-h)/canvas.height),w:r4(w/canvas.width),h:r4(h/canvas.height)});
  }
 }catch{/* a page without a text layer still renders; labels are simply unavailable */}
 const pageCount=doc.numPages;await task.destroy().catch(()=>{});
 return {canvas,width:canvas.width,height:canvas.height,kind:'pdf',pageCount,textItems};
}

// JPEG encode a canvas (optionally downscaled) for storage or upload.
export function toJpeg(canvas,maxSide=1024,quality=.78){
 const scale=Math.min(1,maxSide/Math.max(canvas.width,canvas.height));
 let source=canvas;
 if(scale<1){source=document.createElement('canvas');source.width=Math.round(canvas.width*scale);source.height=Math.round(canvas.height*scale);source.getContext('2d').drawImage(canvas,0,0,source.width,source.height)}
 const dataUrl=source.toDataURL('image/jpeg',quality);
 return {dataUrl,base64:dataUrl.slice(dataUrl.indexOf(',')+1),width:source.width,height:source.height};
}
export const pixelsOf=canvas=>{const ctx=canvas.getContext('2d',{willReadFrequently:true});const img=ctx.getImageData(0,0,canvas.width,canvas.height);return {data:img.data,width:img.width,height:img.height}};
