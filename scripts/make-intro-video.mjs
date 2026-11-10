// Records the intro page's background video: the motherboard assembly scene in
// scripts/intro-video/ rendered in Chrome through the running Vite dev server, written to
// public/media/intro-assembly.webm with a JPEG poster frame. Run: node scripts/make-intro-video.mjs
import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';

const url=process.env.SCENE_URL||'http://127.0.0.1:5173/scripts/intro-video/scene.html';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=metal','--enable-gpu-rasterization','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.sceneReady===true,null,{timeout:60000});
 if(errors.length)throw Error(errors.join('\n'));
 const out=await page.evaluate(()=>window.recordIntro());
 mkdirSync(new URL('../public/media/',import.meta.url),{recursive:true});
 const video=Buffer.from(out.video,'base64'),poster=Buffer.from(out.poster.split(',')[1],'base64');
 writeFileSync(new URL('../public/media/intro-assembly.webm',import.meta.url),video);writeFileSync(new URL('../public/media/intro-assembly.jpg',import.meta.url),poster);
 console.log(`Wrote intro-assembly.webm (${(video.length/1e6).toFixed(2)} MB, ${out.frames} frames, ${out.late} late) and intro-assembly.jpg (${(poster.length/1e3).toFixed(0)} kB); ${out.parts} parts placed over ${out.placeSeconds.toFixed(1)} s of machine time.`);
}finally{await browser.close()}
