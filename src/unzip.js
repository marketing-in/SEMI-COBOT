// Minimal ZIP reader for Gerber sets: stored and deflated entries, using the platform's
// DecompressionStream (browsers and Node 18+). Returns [{name, bytes}] for files only.
const MAX_ENTRIES=400,MAX_TOTAL=200e6;

async function inflateRaw(bytes){
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function isZip(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);return b.length>4&&b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4}

export async function unzip(buffer){
 const b=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 // End of central directory: scan back over a possible comment.
 let eocd=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('This ZIP file is damaged (no central directory).');
 const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true);
 if(count>MAX_ENTRIES)throw Error(`The ZIP has ${count} entries; at most ${MAX_ENTRIES} are read.`);
 const out=[],dec=new TextDecoder();let total=0;
 for(let n=0;n<count;n++){
  if(v.getUint32(p,true)!==0x02014b50)throw Error('This ZIP file is damaged (bad directory entry).');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),csize=v.getUint32(p+20,true),usize=v.getUint32(p+24,true);
  const nameLen=v.getUint16(p+28,true),extraLen=v.getUint16(p+30,true),commentLen=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  const name=dec.decode(b.subarray(p+46,p+46+nameLen));p+=46+nameLen+extraLen+commentLen;
  if(name.endsWith('/')||/(^|\/)(__MACOSX|\.DS_Store)/.test(name))continue;
  if(flags&1)throw Error(`${name} is encrypted. Export the Gerber ZIP without a password.`);
  if(csize===0xffffffff||usize===0xffffffff)throw Error('ZIP64 archives are not supported. Re-zip the Gerber files normally.');
  total+=usize;if(total>MAX_TOTAL)throw Error('The ZIP expands to more than 200 MB.');
  const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);const data=b.subarray(start,start+csize);
  let bytes;if(method===0)bytes=data;else if(method===8)bytes=await inflateRaw(data);else throw Error(`${name} uses an unsupported compression method (${method}).`);
  out.push({name,bytes});
 }
 return out;
}

// Stored (uncompressed) ZIP writer, used for the sample Gerber set.
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
export const crc32=bytes=>{let c=0xffffffff;for(const x of bytes)c=CRC[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0};
export function zipStored(files){
 const enc=new TextEncoder(),parts=[],central=[];let offset=0;
 for(const f of files){const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
  const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
  parts.push(new Uint8Array(h.buffer),name,data);
  const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
  central.push(new Uint8Array(c.buffer),name);offset+=30+name.length+data.length}
 const size=central.reduce((s,a)=>s+a.length,0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 const all=[...parts,...central,new Uint8Array(e.buffer)],out=new Uint8Array(all.reduce((s,a)=>s+a.length,0));let p=0;for(const a of all){out.set(a,p);p+=a.length}return out;
}

// Gzip text to base64 and back, for keeping a Gerber set with its board in browser storage.
export async function gzipBase64(text){
 const bytes=new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(bin);
}
export async function gunzipBase64(b64){
 const bin=atob(b64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
