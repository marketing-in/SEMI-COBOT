const tokenCache = new Map();
const resultCache = new Map();
export function configured(env){return {nexar:!!(env.NEXAR_CLIENT_ID&&env.NEXAR_CLIENT_SECRET),digikey:!!(env.DIGIKEY_CLIENT_ID&&env.DIGIKEY_CLIENT_SECRET),claude:!!env.ANTHROPIC_API_KEY,mouser:!!env.MOUSER_API_KEY,master:!!(env.MASTER_SEARCH_API_KEY&&env.MASTER_SEARCH_URL),tme:!!(env.TME_TOKEN&&env.TME_APP_SECRET),serpapi:serpKeys(env).length>0,gemini:geminiKeys(env).length>0}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function getToken(provider,env,fetcher){
 const prefix=provider.toUpperCase(),id=env[prefix+'_CLIENT_ID'],secret=env[prefix+'_CLIENT_SECRET'];
 if(!id||!secret)throw Object.assign(Error(`${provider==='nexar'?'Nexar':'DigiKey'} is not connected. Configure the client ID and client secret in server environment settings.`),{status:503});
 const cacheKey=provider+id+secret;const saved=tokenCache.get(cacheKey);if(saved&&saved.expires>Date.now())return saved.token;
 const body=new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret});if(provider==='nexar')body.set('scope','supply.domain');
 const r=await fetcher(provider==='nexar'?'https://identity.nexar.com/connect/token':'https://api.digikey.com/v1/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Object.assign(Error(`Supplier authorization failed (${r.status}). Check credentials and API product permissions.`),{status:502});
 const data=await r.json();if(!data.access_token)throw Error('Supplier did not return an access token.');
 if(tokenCache.size>8)tokenCache.clear();tokenCache.set(cacheKey,{token:data.access_token,expires:Date.now()+Math.max(0,(Number(data.expires_in)||300)-60)*1000});return data.access_token;
}
export function normalizeNexar(data,mpn){
 return (data?.data?.supSearchMpn?.results||[]).filter(r=>r.part?.mpn?.toUpperCase()===mpn.toUpperCase()).flatMap(({part})=>(part.sellers||[]).flatMap(s=>(s.offers||[]).map(o=>{const price=[...(o.prices||[])].sort((a,b)=>a.quantity-b.quantity)[0];return {mpn:part.mpn,manufacturer:part.manufacturer?.name||'',description:part.shortDescription||'',image:httpsUrl(part.bestImage?.url),seller:s.company?.name||'Unknown',stock:o.inventoryLevel>=0?o.inventoryLevel:null,price:price?.convertedPrice??null,currency:price?.convertedCurrency||'USD',quantity:price?.quantity??null,breaks:breaksOf(o.prices,'quantity','convertedPrice'),moq:o.moq??null,url:o.clickUrl||part.octopartUrl||null}})));
}
// Price breaks as [{qty, price}] ascending, from any list of objects with a quantity and a price field.
export function breaksOf(list,qtyKey,priceKey,currency){
 return (Array.isArray(list)?list:[]).map(b=>{const m=parseMoney(b?.[priceKey],currency);const q=Number(b?.[qtyKey]);return m&&Number.isFinite(q)&&q>0&&m.value>0?{qty:q,price:m.value}:null}).filter(Boolean).sort((a,b)=>a.qty-b.qty);
}
const httpsUrl=u=>{const v=String(u||'').trim().replace(/^\/\//,'https://');return /^https:\/\/[^\s"'<>]+$/.test(v)?v.slice(0,500):null};
// DigiKey: the cut-tape (or first) packaging variation carries the standard price breaks.
export function normalizeDigikey(data,mpn){return (data.Products||[]).filter(p=>p.ManufacturerProductNumber?.toUpperCase()===mpn.toUpperCase()).map(p=>{const vars=p.ProductVariations||[];const variation=vars.find(v=>/cut tape|bulk|tube|tray/i.test(v.PackageType?.Name||''))||vars[0];const breaks=breaksOf(variation?.StandardPricing,'BreakQuantity','UnitPrice','USD');const price=breaks[0];
 const cls=p.Classifications||{},weeks=Number(p.ManufacturerLeadWeeks);
 return {mpn:p.ManufacturerProductNumber,manufacturer:p.Manufacturer?.Name||'',description:p.Description?.ProductDescription||p.Description?.DetailedDescription||'',image:httpsUrl(p.PhotoUrl),datasheet:httpsUrl(p.DatasheetUrl),lifecycle:p.ProductStatus?.Status||null,
  discontinued:!!(p.Discontinued||p.EndOfLife),condition:'New',marketType:'authorized',factoryLeadDays:Number.isFinite(weeks)&&weeks>0?Math.round(weeks*7):null,factoryStock:Number.isFinite(p.ManufacturerPublicQuantity)?p.ManufacturerPublicQuantity:null,
  compliance:{rohs:cls.RohsStatus||null,reach:cls.ReachStatus||null,msl:cls.MoistureSensitivityLevel||null,eccn:cls.ExportControlClassNumber||null,hts:cls.HtsusCode||null},seller:'DigiKey',stock:p.QuantityAvailable??null,price:price?.price??p.UnitPrice??null,currency:'USD',quantity:price?.qty??null,breaks,moq:variation?.MinimumOrderQuantity??null,url:p.ProductUrl||null}})}

// --- Claude vision ------------------------------------------------------------------------------
// POST /api/vision sends a board picture to the Claude Messages API and returns normalised bounding
// boxes for the board and its components. The component families mirror TYPE_LABELS in
// src/blueprint.js; they are repeated here because scripts/package.mjs inlines this file into the
// Worker, so it cannot import from src/.
const VISION_TYPES=['chip','transistor','diode','led','capacitor','resistor','inductor','connector','crystal','switch','fuse','module','other'];
const VISION_MEDIA=['image/jpeg','image/png','image/webp'];
const VISION_BODY_LIMIT=6*1024*1024;
const VISION_MODEL='claude-opus-5-5';
const bbox={x:{type:'number',description:'Left edge as a fraction 0..1 of the image width'},y:{type:'number',description:'Top edge as a fraction 0..1 of the image height'},w:{type:'number',description:'Width as a fraction 0..1 of the image width'},h:{type:'number',description:'Height as a fraction 0..1 of the image height'}};
// Structured-output schema: every object has additionalProperties:false with all properties required.
// The API rejects minimum/maximum/minLength, so value ranges are enforced in sanitiseVision instead.
const VISION_SCHEMA={type:'object',additionalProperties:false,required:['board','components','notes'],properties:{
 board:{type:'object',additionalProperties:false,required:['x','y','w','h','formFactor','widthMm','heightMm'],properties:{...bbox,formFactor:{type:'string',description:'Recognised form factor such as ATX, Mini-ITX or Raspberry Pi; empty when unknown'},widthMm:{type:'number',description:'Estimated physical board width in millimetres; 0 when unknown'},heightMm:{type:'number',description:'Estimated physical board height in millimetres; 0 when unknown'}}},
 components:{type:'array',items:{type:'object',additionalProperties:false,required:['label','type','package','mpn','x','y','w','h','rotation','confidence'],properties:{
  label:{type:'string',description:'Printed reference or callout name such as U1, CPU socket or 24-pin ATX; empty when none'},
  type:{type:'string',enum:VISION_TYPES},
  package:{type:'string',description:'Short package family guess such as QFP, SOIC, 0603, DIP, DIMM slot; empty when unknown'},
  mpn:{type:'string',description:'Manufacturer part number only when it is actually printed and readable; otherwise empty'},
  ...bbox,
  rotation:{type:'integer',enum:[0,90],description:'0 when the long axis of the body runs left to right, 90 when it runs top to bottom'},
  confidence:{type:'number',description:'Identification confidence from 0 to 1'}}}},
 notes:{type:'string',description:'Anything else worth knowing: unreadable areas, uncertain identifications, groups that were merged'}}};
const SYSTEM_PROMPT='You identify components on a picture of a printed circuit board for an electronics manufacturer\'s inventory tool. Return every visible component as a bounding box of its body in normalised image coordinates: x and y give the top-left corner and w and h the size, all as fractions from 0 to 1 of the image width and height, with x growing to the right and y growing downwards. Group repeated tiny passives only when the picture labels them as a group; otherwise list each one separately. When the picture is an annotated diagram, use the callout text as the label. Never invent part numbers: fill mpn only with a manufacturer part number that is actually printed and readable, otherwise leave it empty. Estimate the physical board size from recognisable form factors (ATX 305 x 244 mm, microATX 244 x 244 mm, Mini-ITX 170 x 170 mm, Raspberry Pi 85 x 56 mm, Arduino Uno 68.6 x 53.4 mm, credit-card sized boards 85.6 x 54 mm) and leave widthMm and heightMm at 0 when unsure. Put anything else worth knowing in notes.';
function visionPrompt(hint,widthMm){
 let text='Identify the components on this circuit board picture and return the JSON described by the schema: the board bounding box with its form factor and estimated size, one entry per component with label, type, package family, printed part number, bounding box, rotation and confidence, plus notes.';
 if(hint)text+='\nHint from the user: '+hint;
 if(widthMm)text+='\nThe real board is about '+widthMm+' mm wide.';
 return text;
}
const clean=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const unit=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(Math.min(1,Math.max(0,n))*1e4)/1e4:0};
const mm=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(Math.min(2000,Math.max(0,n))*10)/10:0};
// Clamps a normalised box into the picture: origin in 0..1, size trimmed so the box stays in frame.
const frame=o=>{const x=unit(o.x),y=unit(o.y);return {x,y,w:Math.min(unit(o.w),Math.round((1-x)*1e4)/1e4),h:Math.min(unit(o.h),Math.round((1-y)*1e4)/1e4)}};
export function sanitiseVision(raw){
 const src=raw&&typeof raw==='object'?raw:{};const b=src.board&&typeof src.board==='object'?src.board:{};
 let board={...frame(b),formFactor:clean(b.formFactor,40),widthMm:mm(b.widthMm),heightMm:mm(b.heightMm)};
 if(!(board.w>0&&board.h>0))board={...board,x:0,y:0,w:1,h:1}; // No usable board box: treat the whole picture as the board.
 const components=(Array.isArray(src.components)?src.components:[]).filter(c=>c&&typeof c==='object').map(c=>{
  const type=String(c.type??'').trim().toLowerCase(),conf=Number(c.confidence),rot=((Math.round(Number(c.rotation)||0)%180)+180)%180;
  return {label:clean(c.label,80),type:VISION_TYPES.includes(type)?type:'other',package:clean(c.package,40),mpn:clean(c.mpn,60),...frame(c),rotation:rot>=45&&rot<135?90:0,confidence:Number.isFinite(conf)?Math.round(Math.min(1,Math.max(0,conf))*100)/100:.5};
 }).filter(c=>c.w>0&&c.h>0).slice(0,400);
 return {board,components,notes:clean(src.notes,500)};
}
async function handleVision(request,env,fetcher){
 const tooLarge=()=>json({error:'The picture is too large. Resize it to under 4 MB and try again.'},413);
 if(Number(request.headers.get('Content-Length'))>VISION_BODY_LIMIT)return tooLarge();
 const text=await request.text();if(text.length>VISION_BODY_LIMIT)return tooLarge();
 let body;try{body=JSON.parse(text)}catch{body=null}
 if(!body||typeof body!=='object')return json({error:'Send a JSON body with image, mediaType and an optional hint.'},400);
 const image=typeof body.image==='string'?body.image.replace(/\s+/g,''):'';
 if(!image||image.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))return json({error:'image must be base64 without the data: prefix.'},400);
 const mediaType=body.mediaType;if(!VISION_MEDIA.includes(mediaType))return json({error:'mediaType must be image/jpeg, image/png or image/webp.'},400);
 if(body.hint!=null&&(typeof body.hint!=='string'||body.hint.length>300))return json({error:'hint must be text of at most 300 characters.'},400);
 if(body.widthMm!=null&&body.widthMm!==0&&!(Number.isFinite(body.widthMm)&&body.widthMm>0&&body.widthMm<=2000))return json({error:'widthMm must be a number between 0 and 2000.'},400);
 const hint=clean(body.hint,300),widthMm=body.widthMm?Math.round(body.widthMm*10)/10:0;
 if(!env.ANTHROPIC_API_KEY)return json({error:'Claude vision is not connected. Set ANTHROPIC_API_KEY in server environment settings.'},503);
 const model=env.ANTHROPIC_MODEL||VISION_MODEL;
 // No thinking, temperature, top_p, top_k, tool_choice or prefill: this model rejects them.
 const payload={model,max_tokens:16000,fallbacks:'default',output_config:{effort:'high',format:{type:'json_schema',schema:VISION_SCHEMA}},system:SYSTEM_PROMPT,messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:mediaType,data:image}},{type:'text',text:visionPrompt(hint,widthMm)}]}]};
 try{
  const response=await fetcher('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','anthropic-beta':'server-side-fallback-2026-07-01'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
  if(!response.ok){
   if(response.status===401||response.status===403)return json({error:'Claude API key was rejected.'},502);
   if(response.status===429)return json({error:'Claude API quota reached. Please retry later.'},429);
   let detail='';if(response.status===400){try{detail=clean((await response.json())?.error?.message,200)}catch{}}
   return json({error:`Claude vision request failed (${response.status}).`+(detail?' '+detail:'')},502);
  }
  const data=await response.json();
  if(data.stop_reason==='refusal'){const why=clean(data.stop_details?.explanation,300);return json({error:'Claude declined to analyse this picture.'+(why?' '+why:'')},502)}
  if(data.stop_reason==='max_tokens')return json({error:'The analysis was cut off. Try a smaller or clearer picture.'},502);
  let parsed;try{parsed=JSON.parse((data.content||[]).find(b=>b?.type==='text')?.text)}catch{return json({error:'Claude returned an unreadable result.'},502)}
  const {board,components,notes}=sanitiseVision(parsed);
  return json({detector:'claude',model:data.model||model,board,components,notes,usage:{input:data.usage?.input_tokens??null,output:data.usage?.output_tokens??null},fetchedAt:new Date().toISOString()});
 }catch(e){return json({error:e.status?e.message:e.name==='TimeoutError'?'Claude vision timed out. Please try again.':'Unable to reach Claude. Please try again.'},e.status||502)}
}


// --- Multi-supplier comparison ------------------------------------------------------------------
// GET /api/compare?mpn=X asks every configured supplier at once and returns one flat offer list.
// Each provider fails on its own: a missing key or an outage marks that provider and the rest still
// answer. Prices keep their own currency; priceUsd uses approximate rates (the FX_RATES env var
// overrides them as JSON, for example {"INR":0.0119}).
const FX_DEFAULT={USD:1,INR:.012,EUR:1.08,GBP:1.27,PLN:.25,CNY:.14,JPY:.0067,CAD:.73,AUD:.66,SGD:.74};
const SYMBOLS=[['US$','USD'],['₹','INR'],['€','EUR'],['£','GBP'],['¥','JPY'],['zł','PLN'],['$','USD']];
const AUTHORIZED=/digi-?key|mouser|arrow|avnet|newark|farnell|element ?14|\btme\b|master electronics|rs (components|online)|future electronics|\btti\b|lcsc|rochester/i;
const compactPn=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function fxRates(env={},live=null){let extra={};try{extra=env.FX_RATES?JSON.parse(env.FX_RATES):{}}catch{}return {...FX_DEFAULT,...(live||{}),...extra}}
// Live exchange rates (USD per unit of each currency) from open.er-api.com, cached for 12 hours. An
// explicit FX_RATES secret wins and skips the request; on any failure the approximate defaults stay.
let fxCache=null;
export async function liveRates(env,fetcher,now=Date.now()){
 if(env.FX_RATES||env.FX_LIVE==='off')return null;
 if(fxCache&&now-fxCache.time<12*3600e3)return fxCache;
 try{const r=await fetcher('https://open.er-api.com/v6/latest/USD',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const j=await r.json();if(j.result!=='success'||!j.rates)throw Error();
  const rates={};for(const k of Object.keys(FX_DEFAULT)){const v=Number(j.rates[k]);if(v>0)rates[k]=Math.round(1/v*1e8)/1e8}
  fxCache={time:now,rates,updated:j.time_last_update_utc||null,source:'open.er-api.com'};return fxCache}
 catch{return fxCache}
}
export const resetFx=()=>{fxCache=null};
// GET /api/fx: the rate the app uses to show INR and USD (inrPerUsd), where it came from and when.
async function handleFx(env,fetcher){const live=await liveRates(env,fetcher);const rates=fxRates(env,live?.rates);
 return json({rates,inrPerUsd:Math.round(1/rates.INR*100)/100,source:env.FX_RATES?'FX_RATES setting':live?live.source:'approximate default',updated:live?.updated||null,live:!!live})}
export function parseMoney(v,currency){
 if(typeof v==='number')return Number.isFinite(v)?{value:v,currency:currency||'USD'}:null;
 const s=String(v??'').trim();if(!s)return null;
 const cur=currency||SYMBOLS.find(([sym])=>s.includes(sym))?.[1]||'USD';
 const m=s.replace(/[^\d.,]/g,'');if(!/\d/.test(m))return null;
 const value=/,\d{1,2}$/.test(m)&&!m.includes('.')?Number(m.replace(',','.')):Number(m.replace(/,/g,''));
 return Number.isFinite(value)?{value,currency:cur}:null;
}
export function parseDays(v){const m=/(\d+(?:\.\d+)?)\s*(day|week|wk|month)/i.exec(String(v||''));if(!m)return null;const n=Number(m[1]);return Math.round(/week|wk/i.test(m[2])?n*7:/month/i.test(m[2])?n*30:n)}
export function normalizeMouser(data,mpn){
 return (data?.SearchResults?.Parts||[]).filter(p=>compactPn(p.ManufacturerPartNumber)===compactPn(mpn)).map(p=>{
  const pb=[...(p.PriceBreaks||[])].sort((a,b)=>a.Quantity-b.Quantity)[0];const money=pb?parseMoney(pb.Price,pb.Currency):null;const stock=Number(p.AvailabilityInStock);
  const comp=Object.fromEntries((p.ProductCompliance||[]).map(c=>[c.ComplianceName,c.ComplianceValue]));const fs=Number(p.FactoryStock),mult=Number(p.Mult);
  return {mpn:p.ManufacturerPartNumber,manufacturer:p.Manufacturer||'',description:p.Description||'',image:httpsUrl(p.ImagePath),datasheet:httpsUrl(p.DataSheetUrl),seller:'Mouser',
   condition:'New',marketType:'authorized',factoryLeadDays:parseDays(p.LeadTime),factoryStock:Number.isFinite(fs)?fs:null,mult:Number.isFinite(mult)&&mult>1?mult:null,suggestedReplacement:String(p.SuggestedReplacement||'').trim()||null,
   compliance:{rohs:p.ROHSStatus||null,reach:null,msl:null,eccn:comp.ECCN||null,hts:comp.USHTS||null},source:'mouser',stock:p.AvailabilityInStock!=null&&p.AvailabilityInStock!==''&&Number.isFinite(stock)?stock:null,price:money?.value??null,currency:money?.currency||null,quantity:pb?.Quantity??null,breaks:breaksOf(p.PriceBreaks,'Quantity','Price',pb?.Currency),moq:Number(p.Min)||null,leadDays:parseDays(p.LeadTime),lifecycle:p.LifecycleStatus||null,authorized:true,url:p.ProductDetailUrl||null};
 });
}
// Open-market channel (SerpApi Google Shopping), strictly restricted to the exact product:
// 1 identity: the part number appears as a whole token in the title (not inside a longer number);
// 2 product type: kits, modules, boards, sockets, "compatible"/"replacement" and mixed lots are dropped;
// 3 packs: "10 pcs" listings are priced per piece; 4 seller: one listing per seller, the cheapest.
// Prices are not restricted: every listing that is the exact product is shown, marked unverified.
// Dropped listings are counted.
const SERP_REJECT=/\b(kit|kits|module|modules|breakout|dev(elopment)?\s*board|evaluation|eval\s*board|arduino|raspberry|shield|adapter|socket|compatible|replacement|replaces|equivalent|alternative|substitute|assortment|assorted|mixed|sampler|book|manual|tester|programmer|for\s+use\s+with)\b/i;
export function serpIdentity(title,mpn){
 const chars=String(mpn||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(chars.length<3)return false;
 const body=chars.split('').map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[-\\s./]?');
 return new RegExp('(^|[^A-Z0-9])'+body+'($|[^A-Z0-9])').test(String(title||'').toUpperCase());
}
export function serpPack(title){const m=/\b(\d{1,5})\s*(?:pcs|pc|pieces|piece|pack|pk|units|x)\b/i.exec(String(title||''))||/\b(?:pack|lot|set)\s*of\s*(\d{1,5})\b/i.exec(String(title||''));const n=m?Number(m[1]):1;return n>1&&n<=10000?n:1}
export function filterSerp(data,mpn){
 const hidden={identity:0,type:0,seller:0};const bySeller=new Map();
 for(const r of data?.shopping_results||[]){
  const title=String(r.title||'');
  if(!serpIdentity(title,mpn)){hidden.identity++;continue}
  if(SERP_REJECT.test(title)){hidden.type++;continue}
  const money=r.extracted_price!=null?parseMoney(r.extracted_price,SYMBOLS.find(([sym])=>String(r.price||'').includes(sym))?.[1]):parseMoney(r.price);
  const pack=serpPack(title),price=money?.value!=null?Math.round(money.value/pack*1e5)/1e5:null;
  const offer={mpn,manufacturer:'',seller:r.source||'Marketplace',source:'serpapi',marketType:'marketplace',condition:null,stock:null,price,currency:money?.currency||'USD',quantity:1,pack:pack>1?pack:null,moq:pack>1?pack:null,leadDays:null,lifecycle:null,authorized:AUTHORIZED.test(r.source||''),url:r.product_link||r.link||null,title,trust:'unverified'};
  const key=offer.seller.toLowerCase(),prev=bySeller.get(key);
  if(prev){hidden.seller++;if(price!=null&&(prev.price==null||price<prev.price))bySeller.set(key,offer)}else bySeller.set(key,offer);
 }
 const offers=[...bySeller.values()].slice(0,12);
 return {offers,hidden};
}
export function normalizeSerp(data,mpn){return filterSerp(data,mpn).offers}
// Master Electronics does not publish its endpoint. MASTER_SEARCH_URL is the URL from the account
// manager with {mpn} and {key} placeholders; the response is read by field names, best effort.
export function normalizeGeneric(data,mpn,seller,source){
 const out=[],seen=new Set(),want=compactPn(mpn);
 const num=v=>{if(v==null||v==='')return null;const n=typeof v==='number'?v:Number(String(v).replace(/[^\d.]/g,''));return Number.isFinite(n)?n:null};
 const pick=(o,re)=>{for(const k of Object.keys(o))if(re.test(k)&&o[k]!=null&&typeof o[k]!=='object')return o[k];return undefined};
 const walk=o=>{if(!o||typeof o!=='object'||seen.has(o))return;seen.add(o);if(Array.isArray(o)){o.forEach(walk);return}
  const pn=pick(o,/^(mpn|manufacturer_?part_?(number|no)|mfr_?part_?(number|no)|part_?(number|no)|partnumber)$/i);
  if(pn!=null&&compactPn(pn)===want){
   const breaks=Object.values(o).find(v=>Array.isArray(v)&&v.some(b=>b&&typeof b==='object'&&Object.keys(b).some(k=>/price/i.test(k))));
   const qty=b=>num(pick(b,/qty|quantity|break/i))??0;
   const first=breaks?[...breaks].sort((a,b)=>qty(a)-qty(b))[0]:null;
   const money=parseMoney(first?pick(first,/price/i):pick(o,/^(unit_?)?price$/i),pick(o,/^currency(_?code)?$/i));
   out.push({mpn:String(pn),manufacturer:String(pick(o,/^(manufacturer|mfr|brand)(_?name)?$/i)??''),seller,source,stock:num(pick(o,/stock|qty_?available|quantity_?available|availab/i)),price:money?.value??null,currency:money?.currency||null,quantity:first?qty(first)||null:null,moq:num(pick(o,/^(moq|min(imum)?_?(order)?_?(qty|quantity))$/i)),leadDays:parseDays(pick(o,/lead/i))??num(pick(o,/lead_?time_?days/i)),lifecycle:pick(o,/lifecycle/i)??null,authorized:true,marketType:'authorized',condition:'New',url:pick(o,/url|link/i)??null});
  }
  Object.values(o).forEach(walk)};
 walk(data);return out;
}
async function hmacSha1Base64(secret,message){
 const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)));let bin='';for(const b of sig)bin+=String.fromCharCode(b);return btoa(bin);
}
const rfc3986=v=>encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
// TME signs each call: Base64 HMAC-SHA1 over "POST&<url>&<sorted params>" keyed with the app secret.
export async function tmeSignature(url,params,secret){const query=Object.keys(params).sort().map(k=>rfc3986(k)+'='+rfc3986(params[k])).join('&');return hmacSha1Base64(secret,['POST',rfc3986(url),rfc3986(query)].join('&'))}
async function tmeRequest(action,params,env,fetcher){
 const url='https://api.tme.eu/'+action+'.json',all={...params,Token:env.TME_TOKEN};
 const ApiSignature=await tmeSignature(url,all,env.TME_APP_SECRET);
 const body=new URLSearchParams({...all,ApiSignature});
 const r=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Object.assign(Error(r.status===401||r.status===403?'TME rejected the token or signature. Check TME_TOKEN and TME_APP_SECRET.':'TME lookup failed ('+r.status+').'),{status:502});
 const data=await r.json();if(data.Status&&data.Status!=='OK')throw Object.assign(Error('TME: '+data.Status),{status:502});return data;
}
export const PROVIDERS=[
 {id:'digikey',name:'DigiKey',need:'DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET',ready:e=>!!(e.DIGIKEY_CLIENT_ID&&e.DIGIKEY_CLIENT_SECRET)},
 {id:'mouser',name:'Mouser',need:'MOUSER_API_KEY',ready:e=>!!e.MOUSER_API_KEY},
 {id:'nexar',name:'Nexar (Octopart)',need:'NEXAR_CLIENT_ID and NEXAR_CLIENT_SECRET',ready:e=>!!(e.NEXAR_CLIENT_ID&&e.NEXAR_CLIENT_SECRET)},
 {id:'tme',name:'TME',need:'TME_TOKEN (the app secret is set; TME also needs the token from developers.tme.eu)',ready:e=>!!(e.TME_TOKEN&&e.TME_APP_SECRET)},
 {id:'master',name:'Master Electronics',need:'MASTER_SEARCH_URL (the search endpoint from your Master Electronics account manager)',ready:e=>!!(e.MASTER_SEARCH_API_KEY&&e.MASTER_SEARCH_URL)},
 {id:'serpapi',name:'Google Shopping (SerpApi)',need:'SERPAPI_KEY',ready:e=>serpKeys(e).length>0}];

// --- SerpApi keys -----------------------------------------------------------------------------
// SERPAPI_KEY first, then SERPAPI_KEYS (comma-separated). When a key is used up (HTTP 429, or
// SerpApi's "run out of searches") or rejected (401), the same search moves on to the next key, and
// that key is skipped for an hour. If every key is spent they are all tried again.
export const serpKeys=env=>[...new Set([env.SERPAPI_KEY,...String(env.SERPAPI_KEYS||'').split(',')].map(k=>String(k||'').trim()).filter(Boolean))];
const serpSpent=new Map(),SPENT_MS=3600e3;
export async function serpFetch(params,env,fetcher,{timeout=30000,now=Date.now}={}){
 const keys=serpKeys(env),fresh=keys.filter(k=>!(now()-(serpSpent.get(k)??-Infinity)<SPENT_MS));let last=null;
 for(const key of fresh.length?fresh:keys){
  const r=await fetcher('https://serpapi.com/search.json?'+new URLSearchParams({...params,api_key:key}),{signal:AbortSignal.timeout(timeout)});
  if(r.status===429||r.status===401){serpSpent.set(key,now());last=r;continue}
  if(r.ok){let body=null;try{body=await r.clone().json()}catch{}if(body?.error&&/run out of searches|searches? (limit|quota)|plan.*(exceeded|limit)/i.test(body.error)){serpSpent.set(key,now());last=r;continue}}
  return r}
 return last||new Response(JSON.stringify({error:'Every SerpApi key has used up its searches.'}),{status:429});
}
const failed=(r,name)=>{throw Object.assign(Error(r.status===429?name+' request quota reached. Please retry later.':r.status===401||r.status===403?name+' rejected the API key ('+r.status+').':name+' lookup failed ('+r.status+').'),{status:r.status===429?429:502})};
export async function providerOffers(id,mpn,env,fetcher){
 if(id==='digikey'||id==='nexar'){
  const token=await getToken(id,env,fetcher);let response;
  if(id==='nexar')response=await fetcher('https://api.nexar.com/graphql',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({query:'query PartLookup($mpn: String!) { supSearchMpn(q: $mpn, limit: 5, currency: "USD", country: "US") { results { part { mpn shortDescription manufacturer { name } bestImage { url } octopartUrl sellers { company { name } offers { inventoryLevel moq clickUrl prices { quantity convertedPrice convertedCurrency } } } } } } }',variables:{mpn}}),signal:AbortSignal.timeout(15000)});
  else response=await fetcher('https://api.digikey.com/products/v4/search/keyword',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-DIGIKEY-Client-Id':env.DIGIKEY_CLIENT_ID,'X-DIGIKEY-Locale-Site':'US','X-DIGIKEY-Locale-Language':'en','X-DIGIKEY-Locale-Currency':'USD'},body:JSON.stringify({Keywords:mpn,Limit:10,Offset:0}),signal:AbortSignal.timeout(15000)});
  if(!response.ok){if(response.status===401)tokenCache.clear();failed(response,id==='nexar'?'Nexar':'DigiKey')}
  const data=await response.json();if(data.errors?.length)throw Object.assign(Error('Nexar rejected the query. Verify the Supply API subscription and schema.'),{status:502});
  return (id==='nexar'?normalizeNexar(data,mpn):normalizeDigikey(data,mpn)).map(o=>{const auth=id==='digikey'||AUTHORIZED.test(o.seller);return {...o,source:id,authorized:auth,marketType:o.marketType||(auth?'authorized':null),leadDays:null}});
 }
 if(id==='mouser'){
  const r=await fetcher('https://api.mouser.com/api/v1/search/partnumber?apiKey='+encodeURIComponent(env.MOUSER_API_KEY),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({SearchByPartRequest:{mouserPartNumber:mpn,partSearchOptions:'Exact'}}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)failed(r,'Mouser');const data=await r.json();if(data.Errors?.length)throw Object.assign(Error('Mouser: '+(data.Errors[0].Message||'request rejected')),{status:502});
  return normalizeMouser(data,mpn);
 }
 if(id==='serpapi'){
  const r=await serpFetch({engine:'google_shopping',q:mpn,gl:env.SERPAPI_GL||'us',hl:'en'},env,fetcher);
  if(!r.ok)failed(r,'SerpApi');const data=await r.json();if(data.error&&!/hasn.t returned any results/i.test(data.error))throw Object.assign(Error('SerpApi: '+data.error),{status:502});
  const {offers,hidden}=filterSerp(data,mpn);return Object.assign(offers,{hidden});
 }
 if(id==='tme'){
  const country=env.TME_COUNTRY||'US';
  const found=await tmeRequest('Products/Search',{SearchPlain:mpn,Country:country,Language:'EN'},env,fetcher);
  const match=(found.Data?.ProductList||[]).filter(p=>compactPn(p.OriginalSymbol||p.Symbol)===compactPn(mpn)).slice(0,5);if(!match.length)return [];
  const params={Country:country,Currency:env.TME_CURRENCY||'USD',Language:'EN'};match.forEach((p,i)=>{params['SymbolList['+i+']']=p.Symbol});
  const priced=await tmeRequest('Products/GetPricesAndStocks',params,env,fetcher);const cur=priced.Data?.Currency||params.Currency;
  return (priced.Data?.ProductList||[]).map(p=>{const info=match.find(m=>m.Symbol===p.Symbol)||{};const pb=[...(p.PriceList||[])].sort((a,b)=>a.Amount-b.Amount)[0];
   return {mpn:info.OriginalSymbol||mpn,manufacturer:info.Producer||'',description:info.Description||'',image:httpsUrl(info.Photo),seller:'TME',source:'tme',marketType:'authorized',condition:'New',stock:Number.isFinite(p.Amount)?p.Amount:null,price:pb?.PriceValue??null,currency:cur,quantity:pb?.Amount??null,breaks:breaksOf(p.PriceList,'Amount','PriceValue',cur),moq:info.MinAmount??null,leadDays:null,lifecycle:null,authorized:true,url:info.ProductInformationPage?'https:'+String(info.ProductInformationPage).replace(/^https?:/,''):null}});
 }
 if(id==='master'){
  const url=env.MASTER_SEARCH_URL.replace('{mpn}',encodeURIComponent(mpn)).replace('{key}',encodeURIComponent(env.MASTER_SEARCH_API_KEY));
  if(!/^https:\/\//.test(url))throw Object.assign(Error('MASTER_SEARCH_URL must be an https URL.'),{status:503});
  const r=await fetcher(url,{headers:{Accept:'application/json',apikey:env.MASTER_SEARCH_API_KEY},signal:AbortSignal.timeout(15000)});
  if(!r.ok)failed(r,'Master Electronics');return normalizeGeneric(await r.json(),mpn,'Master Electronics','master');
 }
 throw Object.assign(Error('Unknown supplier.'),{status:400});
}
async function cachedOffers(id,mpn,env,fetcher){
 // SerpApi is cached for six hours because its plan is metered per search.
 const key='offers:'+id+':'+compactPn(mpn),ttl=id==='serpapi'?6*3600e3:5*60e3,hit=resultCache.get(key);
 if(hit&&Date.now()-hit.time<ttl)return hit.data;
 const data=await providerOffers(id,mpn,env,fetcher);if(resultCache.size>200)resultCache.clear();resultCache.set(key,{time:Date.now(),data});return data;
}
const errorText=e=>e.status?e.message:e.name==='TimeoutError'?'Timed out.':'Unable to reach the supplier.';
// only: optional list of provider ids; 'distributors' means every supplier except Google Shopping.
export async function compareSuppliers(mpn,env,fetcher,only=null){
 const rates=fxRates(env,(await liveRates(env,fetcher))?.rates);
 const wanted=only?.length?new Set(only.flatMap(o=>o==='distributors'?PROVIDERS.filter(p=>p.id!=='serpapi').map(p=>p.id):[o])):null;
 const providers=await Promise.all(PROVIDERS.filter(p=>!wanted||wanted.has(p.id)).map(async p=>{
  if(!p.ready(env))return {id:p.id,name:p.name,status:'not-configured',need:p.need,offers:[]};
  try{const offers=await cachedOffers(p.id,mpn,env,fetcher);return {id:p.id,name:p.name,status:'ok',offers,...(offers.hidden?{hidden:{...offers.hidden}}:{})}}catch(e){return {id:p.id,name:p.name,status:'error',error:errorText(e),offers:[]}}
 }));
 const usd=(v,c)=>v!=null&&rates[c]?Math.round(v*rates[c]*1e5)/1e5:null;
 const priced=providers.flatMap(p=>p.offers).map(o=>({...o,priceUsd:usd(o.price,o.currency),breaksUsd:(o.breaks||[]).map(b=>({qty:b.qty,price:usd(b.price,o.currency)})).filter(b=>b.price!=null)}));
 const offers=priced;
 return {mpn,fetchedAt:new Date().toISOString(),providers:providers.map(({offers:list,...p})=>({...p,count:p.id==='serpapi'?offers.filter(o=>o.source==='serpapi').length:list.length})),offers,fx:{approximate:true,rates}};
}


// --- Gemini component identification -------------------------------------------------------------
// POST /api/identify {board:{name,source,width,height}, parts:[{ref,type,package,value,mpn,side,
// w,d,h,pads,rows,pitch,tht,padW,padH}]} asks Gemini which real part each footprint most likely is.
// The Interactions API is used with a JSON schema; models fall back from the newest Flash to the
// previous one when the first is busy or unavailable. The key never leaves the server.
const IDENTIFY_LIMIT=256*1024,IDENTIFY_MAX_PARTS=60;
const IDENTIFY_TYPES=['chip','transistor','diode','led','capacitor','resistor','inductor','connector','crystal','switch','fuse','module','other'];
const IDENTIFY_SCHEMA={type:'object',properties:{parts:{type:'array',items:{type:'object',properties:{
 ref:{type:'string'},type:{type:'string',enum:IDENTIFY_TYPES},package:{type:'string'},mpn:{type:'string',description:'Most likely orderable manufacturer part number, or empty when it cannot be judged'},
 manufacturer:{type:'string'},description:{type:'string',description:'Short functional description, e.g. "3.3 V 800 mA LDO regulator"'},
 alternates:{type:'array',items:{type:'string'}},confidence:{type:'number',description:'0..1'},reason:{type:'string',description:'One sentence: which evidence led to this'}},
 required:['ref','type','package','mpn','manufacturer','description','alternates','confidence','reason']}}},required:['parts']};
const IDENTIFY_PROMPT=`You identify components on a printed circuit board for an electronics manufacturer.
When pinNets are given (pin:net from the Gerber copper), use them: supply nets (+5V, +12V, GND), signal names (TX, RX, SDA, SCL), and which other parts share a net show the part's function; the CAD project name says what the board is for.
For each footprint you get its reference designator, the package or footprint name and value when the CAD data had them, the body size in mm, the pad count, pad rows, pitch, pad size and whether it is through-hole.
Return the most likely component type, the standard package name, and the most likely orderable part number of a widely stocked part that fits this footprint and the board's apparent purpose.
Rules: keep any given value or part number unless it is clearly wrong; for passives give a typical part number in the stated value and size (for example a Yageo RC0603 series resistor); when the evidence is too thin, return an empty mpn and a low confidence instead of guessing; confidence is 0..1; reason is one short sentence; keep every ref exactly as given.`;
const s80=v=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,80):'';
const n2=v=>Number.isFinite(+v)?Math.round(+v*100)/100:null;
export function sanitiseIdentify(raw,refs){
 const want=new Set(refs);const out=[];const seen=new Set();
 for(const p of (raw&&Array.isArray(raw.parts)?raw.parts:[])){
  const ref=s80(p.ref);if(!want.has(ref)||seen.has(ref))continue;seen.add(ref);
  const mpn=s80(p.mpn).replace(/\s+/g,'');
  out.push({ref,type:IDENTIFY_TYPES.includes(p.type)?p.type:'other',package:s80(p.package),mpn:/^(unknown|n\/?a|none|-+)$/i.test(mpn)?'':mpn,manufacturer:s80(p.manufacturer),description:s80(p.description),
   alternates:(Array.isArray(p.alternates)?p.alternates:[]).map(s80).filter(Boolean).slice(0,4),confidence:Math.max(0,Math.min(1,Number(p.confidence)||0)),reason:typeof p.reason==='string'?p.reason.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,200):''});
 }
 return out;
}
// Gemini keys: GEMINI_API_KEY first, then GEMINI_API_KEYS (comma-separated).
export const geminiKeys=env=>[...new Set([env.GEMINI_API_KEY,...String(env.GEMINI_API_KEYS||'').split(',')].map(k=>String(k||'').trim()).filter(Boolean))];
const geminiSpent=new Map(),geminiBusy=new Map();
export const resetGemini=()=>{geminiSpent.clear();geminiBusy.clear()};
async function handleIdentify(request,env,fetcher){
 if(Number(request.headers.get('Content-Length'))>IDENTIFY_LIMIT)return json({error:'Too much data. Send at most 60 parts per request.'},413);
 const text=await request.text();if(text.length>IDENTIFY_LIMIT)return json({error:'Too much data. Send at most 60 parts per request.'},413);
 let body;try{body=JSON.parse(text)}catch{body=null}
 const parts=Array.isArray(body?.parts)?body.parts.slice(0,IDENTIFY_MAX_PARTS):null;
 if(!parts||!parts.length)return json({error:'Send a JSON body with a non-empty parts array.'},400);
 const keys=geminiKeys(env);if(!keys.length)return json({error:'Gemini is not connected. Set GEMINI_API_KEY in server environment settings.'},503);
 const rows=parts.map(p=>({ref:s80(p.ref),type:s80(p.type),package:s80(p.package),value:s80(p.value),mpn:s80(p.mpn),side:p.side==='bottom'?'bottom':'top',bodyMm:[n2(p.w),n2(p.d),n2(p.h)],pads:Number.isInteger(p.pads)?p.pads:null,rows:Number.isInteger(p.rows)?p.rows:null,pitchMm:n2(p.pitch),padMm:[n2(p.padW),n2(p.padH)],throughHole:!!p.tht,pinNets:(Array.isArray(p.nets)?p.nets:[]).slice(0,32).map(x=>s80(String(x)).slice(0,48)).filter(Boolean)})).filter(r=>r.ref);
 const b=body.board&&typeof body.board==='object'?body.board:{};
 const input=`${IDENTIFY_PROMPT}\n\nBoard: ${s80(b.name)||'unnamed'} (${s80(b.source)||'CAD data'}), ${n2(b.width)||'?'} x ${n2(b.height)||'?'} mm, ${Math.min(Number(b.count)||rows.length,5000)} components in total.${s80(b.project)?`\nCAD project name: ${s80(b.project)}.`:''}${Array.isArray(b.nets)&&b.nets.length?`\nNamed nets on the board: ${b.nets.slice(0,40).map(s80).filter(Boolean).join(', ')}.`:''}\nOther parts on the board for context: ${(Array.isArray(b.context)?b.context:[]).slice(0,40).map(s80).filter(Boolean).join(', ')||'none given'}.\n\nFootprints to identify (JSON):\n${JSON.stringify(rows)}`;
 // Models in order of speed and availability; a model that answers "busy" is skipped for a few minutes.
 // Keys take turns: one over its quota (429) or rejected (401/403/bad key) is skipped for an hour and
 // the same request moves on to the next key.
 const now=Date.now(),models=[...new Set([env.GEMINI_MODEL,'gemini-3.6-flash','gemini-3.8-flash','gemini-3.5-flash'].filter(Boolean))];let last='';
 const ready=models.filter(m=>!(geminiBusy.get(m)>now));
 for(const model of ready.length?ready:models){
  const fresh=keys.filter(k=>!(now-(geminiSpent.get(k)??-Infinity)<3600e3));
  for(const key of fresh.length?fresh:keys){
   let r;try{r=await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({model,store:false,input,response_format:{type:'text',mime_type:'application/json',schema:IDENTIFY_SCHEMA}}),signal:AbortSignal.timeout(60000)})}
   catch(e){last=e.name==='TimeoutError'?`${model} timed out.`:'Unable to reach Gemini.';geminiBusy.set(model,Date.now()+2*60e3);break}
   let data;try{data=await r.json()}catch{data=null}
   const keyProblem=r.status===401||r.status===403||(r.status===400&&/API key/i.test(JSON.stringify(data)));
   if(r.status===429||keyProblem){geminiSpent.set(key,Date.now());last=r.status===429?'Every Gemini key has reached its request quota.':'Gemini rejected the API key.';continue}
   if(r.status===503||r.status===500||r.status===404){geminiBusy.set(model,Date.now()+5*60e3);last=`${model} is unavailable right now.`;break}
   if(!r.ok)return json({error:`Gemini request failed (${r.status}).`},502);
   const out=(data?.steps||[]).find(x=>x.type==='model_output')?.content?.find(c=>typeof c.text==='string')?.text;
   let parsed;try{parsed=JSON.parse(out)}catch{last='Gemini returned an unreadable answer.';break}
   return json({model:data.model||model,parts:sanitiseIdentify(parsed,rows.map(x=>x.ref)),usage:{input:data.usage?.total_input_tokens??null,output:data.usage?.total_output_tokens??null}});
  }
 }
 return json({error:(last||'Gemini is unavailable.')+' Please try again in a minute.'},503);
}
// --- Part details from a Google search (SerpApi) ------------------------------------------------
// Manufacturer, description, package, datasheet link, key specs and sources for one part number,
// read from the organic results and knowledge panel. Only https links are kept.
const MAKERS=['Texas Instruments','STMicroelectronics','Microchip','NXP','Analog Devices','onsemi','ON Semiconductor','Infineon','Murata','Yageo','Vishay','Nexperia','Diodes Incorporated','ROHM','Renesas','TDK','Samsung Electro-Mechanics','KEMET','Bourns','Littelfuse','Espressif','Nordic Semiconductor','Silicon Labs','Maxim Integrated','Toshiba','Panasonic','KYOCERA AVX','Würth Elektronik','Molex','TE Connectivity','Amphenol','Allegro MicroSystems','Monolithic Power Systems','Richtek','Winbond','Macronix','Micron','Cypress','Lattice','Xilinx','Broadcom','Realtek','WCH','GigaDevice','Torex','Semtech','Abracon','Epson','Kingbright','Lite-On','Everlight','Wolfspeed','Hirose','JST','Samtec'];
const SPEC_NAMES='Package(?: \\/ Case)?|Case|Supply voltage|Voltage[ -][A-Za-z ]{0,18}|Current[ -][A-Za-z ]{0,18}|Frequency|Core(?: processor)?|Flash(?: memory)?|Program memory size|RAM(?: size)?|Operating temperature|Tolerance|Power(?: rating)?|Capacitance|Resistance|Inductance|Mounting type|Number of pins|Pin count|Interface|Output current|Input voltage';
const httpsOnly=u=>{try{return new URL(u).protocol==='https:'?u:''}catch{return ''}};
// Shop extensions ("14-day returns", "In stock", "$4.10", "9 pages", "(2)") are not specs: a spec has
// a number with a unit or a package name.
const isSpec=s=>/\d/.test(s)&&/[a-zµΩ°%]/i.test(s)&&!/stock|rating|review|price|[$€£₹]|deliver|ship|free|return|pages?\b|sold|order|warranty|\bday/i.test(s);
// Snippet text without shop banners ("Buy now, ships today.") and stray bullets.
const cleanSnippet=s=>String(s||'').replace(/\s*•\s*\.?/g,' · ').replace(/(^|\.\s+)(buy now|in stock|ships? (today|now|same day)|order (now|today)|free shipping)[^.]*\.\s*/gi,'$1').replace(/\s+/g,' ').replace(/^[\s·.]+/,'').trim().slice(0,320);
export function normalizePartInfo(data,mpn){
 const org=(data?.organic_results||[]).filter(o=>o&&httpsOnly(o.link)),kg=data?.knowledge_graph||{},key=compactPn(mpn);
 const mentions=o=>compactPn(`${o.title||''} ${o.snippet||''}`).includes(key);
 const best=org.find(mentions)||org[0]||{},text=[kg.title,kg.description,...org.map(o=>`${o.title||''} ${o.snippet||''}`)].filter(Boolean).join('\n');
 const manufacturer=String(kg.manufacturer||'')||MAKERS.find(m=>new RegExp('(^|[^A-Za-z])'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^A-Za-z]|$)','i').test(text))||'';
 const specs=[],seen=new Set();
 for(const o of org){for(const e of [...(o.rich_snippet?.top?.extensions||[]),...(o.rich_snippet?.bottom?.extensions||[])]){const s=String(e).trim();if(s&&s.length<=60&&isSpec(s)&&!seen.has(s.toLowerCase())){seen.add(s.toLowerCase());specs.push({name:'',value:s})}}
  // A value ends at a sentence break, so "Core: M3. Flash: 64KB" gives two specs.
  for(const m of String(o.snippet||'').matchAll(new RegExp('\\b('+SPEC_NAMES+')\\s*[:：]\\s*([^;|•·\\n]{1,40}?)(?=\\.\\s|[;|•·\\n]|\\.?$)','gi'))){const name=m[1].trim(),value=m[2].trim().replace(/[.,]$/,'');if(!seen.has(name.toLowerCase())){seen.add(name.toLowerCase());specs.push({name,value})}}}
 const pkg=(specs.find(s=>/package|case/i.test(s.name))?.value)||(text.match(/\b(?:LQFP|TQFP|QFP|QFN|VQFN|DFN|SOIC|SOP|SSOP|TSSOP|MSOP|SOT|SOD|BGA|WLCSP|DIP|PDIP|TO)-?\d{1,3}[A-Z]?\b/i)?.[0])||(text.match(/\b(?:0201|0402|0603|0805|1206|1210|2512)\b/)?.[0])||'';
 const sheet=org.find(o=>/\.pdf($|\?)/i.test(o.link))||org.find(o=>/datasheet/i.test(`${o.title} ${o.link}`));
 return {mpn,manufacturer,title:String(kg.title||best.title||'').slice(0,160),description:cleanSnippet(kg.description||[best,...org].map(o=>o?.snippet).find(s=>cleanSnippet(s).length>20)||''),package:pkg.toUpperCase(),
  datasheet:sheet?sheet.link:'',specs:specs.slice(0,10),links:org.slice(0,5).map(o=>({title:String(o.title||'').slice(0,140),link:o.link,source:String(o.source||new URL(o.link).hostname)})),source:'serpapi',fetchedAt:new Date().toISOString()};
}
const infoCache=new Map();
// store: optional {get(mpn), put(mpn, info)} kept by the host (the Node server writes a JSON file).
async function handlePartInfo(url,env,fetcher,store){
 const mpn=url.searchParams.get('mpn')?.trim();if(!mpn||mpn.length>100||/[\x00-\x1f]/.test(mpn))return json({error:'Enter a part number between 1 and 100 characters.'},400);
 const key=compactPn(mpn),kept=(await store?.get?.(key))||infoCache.get(key);if(kept)return json({...kept,cached:true});
 if(!serpKeys(env).length)return json({error:'Google search (SerpApi) is not connected. Set SERPAPI_KEY in server environment settings.'},503);
 try{const r=await serpFetch({engine:'google',q:`${mpn} datasheet`,num:'10',hl:'en',gl:env.SERPAPI_GL||'us'},env,fetcher);
  if(r.status===429)return json({error:'Every SerpApi key has used up its searches.'},429);if(!r.ok)return json({error:`Google search failed (${r.status}).`},502);
  const info=normalizePartInfo(await r.json(),mpn);if(infoCache.size>500)infoCache.clear();infoCache.set(key,info);await store?.put?.(key,info);return json(info)}
 catch(e){return json({error:e.name==='TimeoutError'?'Google search timed out. Please try again.':'Unable to reach Google search. Please try again.'},502)}
}

// --- Admin sign-in ----------------------------------------------------------------------------
// Accounts are created on the intro page (the first one is the admin). Passwords: PBKDF2-SHA256 (210,000 rounds, random salt).
// Sessions: an HttpOnly, SameSite=Strict cookie holding {email, expiry} signed with HMAC-SHA256.
// Web Crypto only, so the same code runs in Node and in the Worker. auth: {load(), save(state)}
// kept by the host (the Node server writes data/auth.json; hosted.mjs keeps it in Redis); without it sign-in is off.
const enc=new TextEncoder(),ROUNDS=210000,SESSION_MS=7*864e5,COOKIE='sc_session';
const b64u=buf=>{let s='';for(const b of new Uint8Array(buf))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const unb64u=s=>Uint8Array.from(atob(String(s).replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((String(s).length+3)%4)),c=>c.charCodeAt(0));
const sameBytes=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0};
async function pbkdf2(password,salt,rounds){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:rounds},key,256))}
async function hmac(secret,data){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64u(await crypto.subtle.sign('HMAC',key,enc.encode(data)))}
export async function hashPassword(password,rounds=ROUNDS){const salt=crypto.getRandomValues(new Uint8Array(16));return {salt:b64u(salt),rounds,hash:b64u(await pbkdf2(password,salt,rounds))}}
export async function checkPassword(password,rec){if(!rec?.salt||!rec?.hash)return false;return sameBytes(await pbkdf2(password,unb64u(rec.salt),rec.rounds||ROUNDS),unb64u(rec.hash))}
export async function makeSession(secret,email,now=Date.now()){const body=b64u(enc.encode(JSON.stringify({e:email,x:now+SESSION_MS})));return body+'.'+await hmac(secret,body)}
export async function readSession(secret,token,now=Date.now()){
 const [body,sig]=String(token||'').split('.');if(!body||!sig)return null;if(!sameBytes(enc.encode(await hmac(secret,body)),enc.encode(sig)))return null;
 try{const p=JSON.parse(new TextDecoder().decode(unb64u(body)));return p.x>now?p:null}catch{return null}}
const cookieValue=(req,name)=>{for(const part of (req.headers.get('cookie')||'').split(/;\s*/)){const i=part.indexOf('=');if(i>0&&part.slice(0,i)===name)return part.slice(i+1)}return ''};
const withCookie=(res,value,maxAge,secure)=>{res.headers.append('Set-Cookie',`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`);return res};
// 5 wrong passwords in 15 minutes locks sign-in for that email. A host with shared storage passes
// auth.attempts {count, add, clear} so every instance sees the same count; otherwise it is kept in memory.
const failures=new Map();// email -> {n, since}
const memoryAttempts={count:email=>{const f=failures.get(email);return f&&Date.now()-f.since<15*60e3?f.n:0},
 add:email=>{const f=failures.get(email);if(!f||Date.now()-f.since>=15*60e3){failures.set(email,{n:1,since:Date.now()});return 1}return ++f.n},
 clear:email=>{failures.delete(email)}};
// Who may sign up. ADMIN_EMAIL: only this address can create the first (admin) account; a host that
// requires sign-in (REQUIRE_SIGNIN, set online) refuses to create an admin without it. SIGNUP_ALLOW:
// later sign-ups limited to listed addresses and @domains, "*" for anyone, "none" for no one. Unset, anyone
// may join locally and no one online. Members the admin removed stay out unless SIGNUP_ALLOW names them.
const listOf=v=>String(v||'').split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
function signupRefusal(env,email,first,blocked=[]){
 if(first){const owner=listOf(env.ADMIN_EMAIL)[0];
  if(!owner)return env.REQUIRE_SIGNIN?[503,'Set ADMIN_EMAIL in the hosting settings, then sign up with that address.']:null;
  return email===owner?null:[403,'This workspace is waiting for its admin to sign up first.']}
 const allow=listOf(env.SIGNUP_ALLOW),no=[403,'Sign-up is limited to approved addresses. Ask the admin to add yours.'];
 if(blocked.includes(email)&&!allow.includes(email))return no;
 if(!allow.length)return env.REQUIRE_SIGNIN?no:null;
 return allow.some(a=>a==='*'||a===email||(a.startsWith('@')&&email.endsWith(a)))?null:no}
// Unknown emails still cost one PBKDF2 check, so the answer time does not tell which addresses have accounts.
let dummyRecord=null;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
// Accounts: the first one is the admin; later sign-ups are members, active and signed in at once.
// The admin can remove members in the Team panel. There is no approval: every account is active,
// including any an older version saved as pending. Older stores with a single {admin} are read as one admin.
const usersOf=state=>(state?.users||(state?.admin?[{...state.admin,role:'admin'}]:[])).map(u=>({...u,status:'active'}));
const publicUser=u=>({name:u.name,email:u.email,role:u.role,status:u.status,created:u.created||''});
export async function sessionUser(request,env,auth){
 if(!auth)return null;const state=await auth.load(),users=usersOf(state);if(!users.length)return null;
 const s=await readSession(env.SESSION_SECRET||state.secret,cookieValue(request,COOKIE)),u=s&&users.find(x=>x.email===s.e);
 return u?{name:u.name,email:u.email,role:u.role}:null}
async function handleAuth(request,url,env,auth){
 const secure=url.protocol==='https:'||!!env.REQUIRE_SIGNIN,attempts=auth?.attempts||memoryAttempts,state=auth?(await auth.load())||{}:null,users=usersOf(state);
 if(url.pathname==='/api/auth/state')return json(auth?{enabled:true,admin:users.some(u=>u.role==='admin'),user:await sessionUser(request,env,auth)}:{enabled:false,admin:false,user:null});
 if(!auth)return json({error:'Sign-in needs the local server (npm run server).'},404);
 if(url.pathname==='/api/auth/logout')return withCookie(json({ok:true}),'',0,secure);
 const save=next=>auth.save({...state,secret:state.secret,...next});
 // Team management: admin only.
 if(url.pathname==='/api/auth/users'||url.pathname==='/api/auth/remove'){
  const me=await sessionUser(request,env,auth);if(!me||me.role!=='admin')return json({error:'Only the admin can manage the team.'},403);
  if(url.pathname==='/api/auth/users')return json({users:users.map(publicUser)});
  let body;try{body=await request.json()}catch{return json({error:'Send the form as JSON.'},400)}
  const email=String(body?.email||'').trim().toLowerCase(),u=users.find(x=>x.email===email);if(!u)return json({error:'No such account.'},404);
  if(u.role==='admin')return json({error:'The admin account cannot be changed here.'},400);
  const next=users.filter(x=>x!==u);
  await save({users:next,blocked:[...new Set([...(state.blocked||[]),email])].slice(-500)});return json({users:next.map(publicUser)})}
 let body;try{body=await request.json()}catch{return json({error:'Send the form as JSON.'},400)}
 const email=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'');
 if(!EMAIL.test(email))return json({error:'Enter a valid email address.'},400);
 if(url.pathname==='/api/auth/signup'){
  const name=String(body?.name||'').trim().slice(0,60);if(!name)return json({error:'Enter your name.'},400);
  if(password.length<10||password.length>200)return json({error:'Use a password of at least 10 characters.'},400);
  // Refusals come before the duplicate check, so a closed sign-up does not reveal which addresses exist.
  const refused=signupRefusal(env,email,!users.length,state.blocked||[]);if(refused)return json({error:refused[1]},refused[0]);
  if(users.some(u=>u.email===email))return json({error:'An account with this email already exists. Sign in instead.'},409);
  if(users.length>=200)return json({error:'The account limit is reached. Ask the admin.'},429);
  const role=users.length?'member':'admin',user={name,email,password:await hashPassword(password),role,status:'active',created:new Date().toISOString()};
  const secret=state.secret||b64u(crypto.getRandomValues(new Uint8Array(32)));await auth.save({...state,secret,users:[...users,user]});
  return withCookie(json({user:{name,email,role}},201),await makeSession(env.SESSION_SECRET||secret,email),SESSION_MS/1000,secure)}
 if(url.pathname==='/api/auth/login'){
  if(!users.length)return json({error:'No admin account yet. Create one first.'},409);
  // Every attempt on a real account is counted before the password is checked, so parallel guesses cannot
  // slip past the limit; a correct password clears the count. Unknown emails are not stored at all.
  const u=users.find(x=>x.email===email),wrong=()=>json({error:'Wrong email or password.'},401);
  if(!u){await checkPassword(password,dummyRecord??=await hashPassword('no account'));return wrong()}
  if(await attempts.add(email)>5)return json({error:'Too many wrong passwords. Try again in 15 minutes.'},429);
  if(!(await checkPassword(password,u.password)))return wrong();
  await attempts.clear(email);
  return withCookie(json({user:{name:u.name,email,role:u.role}}),await makeSession(env.SESSION_SECRET||state.secret,email),SESSION_MS/1000,secure)}
 return json({error:'Not found.'},404);
}

// Shared inventory in Supabase. Without a database this answers {enabled:false} and the browser keeps
// its own copy. POST {parts:[changes], ledger:{orders, removed, moves, consumed}} applies one browser's
// changes, then both methods answer with the whole shared state.
async function handleInventory(request,env,auth,inventory){
 if(!inventory)return json({enabled:false});
 try{
  if(request.method==='POST'){let body;try{body=await request.json()}catch{return json({error:'Send the changes as JSON.'},400)}
   const who=(await sessionUser(request,env,auth))?.email||'local';await inventory.apply(body,who)}
  return json(await inventory.pull())}
 catch(e){return json({error:e.code?e.message:'The shared inventory could not be reached. Changes stay on this device and are sent again later.',code:e.code||'down'},503)}}

// Part master catalogue from Supabase (table part_master). {enabled:false} without a database and
// {enabled:true, empty:true} before it is loaded; the browser then uses the bundled file.
async function handlePartMaster(inventory){
 if(!inventory?.catalogue)return json({enabled:false});
 try{const c=await inventory.catalogue();return json(c?{enabled:true,from:'supabase',...c}:{enabled:true,empty:true})}
 catch(e){return json({error:e.code?e.message:'The part master could not be read from the database.',code:e.code||'down'},503)}}

export async function handleApi(request,env={},fetcher=fetch,store=null,auth=null,inventory=null){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return null;
 // The vision upload is the only POST route; everything else stays GET-only.
 const POSTS=['/api/vision','/api/identify','/api/auth/signup','/api/auth/login','/api/auth/logout','/api/auth/remove'];
 // The shared inventory reads with GET and sends changes with POST.
 if(url.pathname==='/api/inventory'?!['GET','POST'].includes(request.method):request.method!==(POSTS.includes(url.pathname)?'POST':'GET'))return json({error:'Method not allowed.'},405);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Cross-site requests are not allowed.'},403);
 if(url.pathname.startsWith('/api/auth/'))return handleAuth(request,url,env,auth);
 // Once an admin exists, every other route except the status check needs a signed-in session.
 // A host with REQUIRE_SIGNIN (online) keeps every route closed until someone signs in, admin or not.
 if(auth&&url.pathname!=='/api/status'){const state=await auth.load();if((usersOf(state).length||env.REQUIRE_SIGNIN)&&!(await sessionUser(request,env,auth)))return json({error:'Sign in to use the workspace.'},401)}
 if(url.pathname==='/api/status')return json(configured(env));
 if(url.pathname==='/api/inventory')return handleInventory(request,env,auth,inventory);
 if(url.pathname==='/api/partmaster')return handlePartMaster(inventory);
 if(url.pathname==='/api/vision')return handleVision(request,env,fetcher);
 if(url.pathname==='/api/identify')return handleIdentify(request,env,fetcher);
 if(url.pathname==='/api/partinfo')return handlePartInfo(url,env,fetcher,store);
 if(url.pathname==='/api/fx')return handleFx(env,fetcher);
 if(url.pathname==='/api/compare'){const mpn=url.searchParams.get('mpn')?.trim();if(!mpn||mpn.length>100||/[\x00-\x1f]/.test(mpn))return json({error:'Enter a part number between 1 and 100 characters.'},400);const only=(url.searchParams.get('sources')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,8);return json(await compareSuppliers(mpn,env,fetcher,only))}
 if(url.pathname!=='/api/search')return json({error:'Not found.'},404);
 const provider=url.searchParams.get('provider'),mpn=url.searchParams.get('mpn')?.trim();
 const def=PROVIDERS.find(p=>p.id===provider);if(!def)return json({error:'Choose a supported supplier.'},400);
 if(!mpn||mpn.length>100||/[\x00-\x1f]/.test(mpn))return json({error:'Enter a part number between 1 and 100 characters.'},400);
 if(!def.ready(env))return json({error:provider==='nexar'||provider==='digikey'?(provider==='nexar'?'Nexar':'DigiKey')+' is not connected. Configure the client ID and client secret in server environment settings.':def.name+' is not connected. Set '+def.need+' in server environment settings.'},503);
 try{const offers=await cachedOffers(provider,mpn,env,fetcher);return json({provider,mpn,fetchedAt:new Date().toISOString(),market:'US',currency:'USD',offers})}
 catch(e){return json({error:e.status?e.message:e.name==='TimeoutError'?'Supplier timed out. Please try again.':'Unable to reach the supplier. Please try again.'},e.status||502)}
}
