import test from 'node:test';
import assert from 'node:assert/strict';
import{breaksOf,liveRates,resetFx,handleApi,normalizeNexar,normalizeDigikey,sanitiseVision,sanitiseIdentify,parseMoney,parseDays,normalizeMouser,normalizeSerp,normalizeGeneric,tmeSignature,compareSuppliers,fxRates,normalizePartInfo,serpKeys,serpFetch,geminiKeys,resetGemini}from'../api.mjs';
test('missing credentials return useful error without network traffic',async()=>{const r=await handleApi(new Request('http://localhost/api/search?provider=nexar&mpn=SS14'),{},()=>{throw Error('must not fetch')});assert.equal(r.status,503);assert.match((await r.json()).error,/not connected/)});
test('status returns only booleans, never secrets',async()=>{const r=await handleApi(new Request('http://localhost/api/status'),{NEXAR_CLIENT_ID:'id',NEXAR_CLIENT_SECRET:'sensitive'});assert.deepEqual(await r.json(),{nexar:true,digikey:false,claude:false,mouser:false,master:false,tme:false,serpapi:false,gemini:false})});
test('rejects invalid provider and cross-site usage',async()=>{assert.equal((await handleApi(new Request('http://localhost/api/search?provider=unknown&mpn=SS14'))).status,400);assert.equal((await handleApi(new Request('http://localhost/api/status',{headers:{'Sec-Fetch-Site':'cross-site'}}))).status,403)});
test('Nexar preserves price break and unknown stock, filters nonexact MPN',()=>{const part={mpn:'SS14',sellers:[{company:{name:'Test supplier'},offers:[{inventoryLevel:-1,moq:100,prices:[{quantity:100,convertedPrice:.1,convertedCurrency:'USD'}]}]}]};const offers=normalizeNexar({data:{supSearchMpn:{results:[{part},{part:{...part,mpn:'SS14-OTHER'}}]}}},'ss14');assert.equal(offers.length,1);assert.equal(offers[0].stock,null);assert.equal(offers[0].quantity,100);assert.equal(offers[0].moq,100)});
test('DigiKey extracts standard pricing and exact MPN',()=>{const result=normalizeDigikey({Products:[{ManufacturerProductNumber:'SS14',QuantityAvailable:200,ProductVariations:[{MinimumOrderQuantity:10,StandardPricing:[{BreakQuantity:100,UnitPrice:.05},{BreakQuantity:10,UnitPrice:.08}]}]},{ManufacturerProductNumber:'SS14-B'}]},'SS14');assert.equal(result.length,1);assert.equal(result[0].price,.08);assert.equal(result[0].quantity,10)});
test('API token and query use distinct official endpoints with secret only on token request',async()=>{let count=0;const calls=[];const f=async(url,opts)=>{calls.push([url,opts]);count++;return new Response(JSON.stringify(count===1?{access_token:'access',expires_in:3600}:{Products:[]}))};const r=await handleApi(new Request('http://localhost/api/search?provider=digikey&mpn=TEST'),{DIGIKEY_CLIENT_ID:'test-id',DIGIKEY_CLIENT_SECRET:'test-secret'},f);assert.equal(r.status,200);assert.equal(calls.length,2);assert.match(calls[0][0],/oauth2\/token$/);assert.match(calls[1][0],/products\/v4\/search\/keyword$/);assert.equal(calls[1][1].headers.Authorization,'Bearer access');assert.ok(!calls[1][1].body.includes('test-secret'))});

// --- Claude vision (fixture fetcher, never the live API) ----------------------------------------
const PNG=Buffer.from('\x89PNG\r\n\x1a\n').toString('base64');
const KEY={ANTHROPIC_API_KEY:'sk-test-secret'};
const noFetch=()=>{throw Error('must not fetch')};
const picture={image:PNG,mediaType:'image/png'};
const post=(body,env={},fetcher=noFetch,headers={})=>handleApi(new Request('http://localhost/api/vision',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}),env,fetcher);
const claudeSays=(message,status=200)=>async()=>new Response(JSON.stringify(message),{status});
const finished=(result,extra={})=>({content:[{type:'text',text:JSON.stringify(result)}],stop_reason:'end_turn',model:'claude-opus-5-5',usage:{input_tokens:10,output_tokens:20},...extra});
const empty={board:{x:0,y:0,w:1,h:1,formFactor:'',widthMm:0,heightMm:0},components:[],notes:''};

test('vision: missing key returns 503 without network traffic',async()=>{const r=await post(picture);assert.equal(r.status,503);assert.match((await r.json()).error,/not connected/)});
test('vision: request carries the key headers, schema format, image, hint and no sampling parameters',async()=>{
 const calls=[];const f=async(url,opts)=>{calls.push([url,opts]);return new Response(JSON.stringify(finished(empty)))};
 const r=await post({image:PNG.slice(0,4)+'\n '+PNG.slice(4),mediaType:'image/jpeg',hint:'ATX motherboard',widthMm:305},KEY,f);
 assert.equal(r.status,200);assert.equal(calls.length,1);
 const [url,opts]=calls[0];const body=JSON.parse(opts.body);
 assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(opts.method,'POST');
 assert.equal(opts.headers['x-api-key'],'sk-test-secret');assert.equal(opts.headers['anthropic-version'],'2023-06-01');assert.equal(opts.headers['anthropic-beta'],'server-side-fallback-2026-07-01');
 assert.equal(body.model,'claude-opus-5-5');assert.equal(body.max_tokens,16000);assert.equal(body.fallbacks,'default');
 assert.equal(body.output_config.effort,'high');assert.equal(body.output_config.format.type,'json_schema');
 const schema=body.output_config.format.schema;assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['board','components','notes']);assert.ok(!JSON.stringify(schema).includes('"minimum"'));
 assert.equal(typeof body.system,'string');assert.match(body.system,/never invent part numbers/i);
 const [image,text]=body.messages[0].content;
 assert.deepEqual(image,{type:'image',source:{type:'base64',media_type:'image/jpeg',data:PNG}});
 assert.match(text.text,/Hint from the user: ATX motherboard/);assert.match(text.text,/305 mm/);
 for(const k of ['thinking','temperature','top_p','top_k','tool_choice'])assert.ok(!(k in body),k+' must not be sent');
 assert.ok(!opts.body.includes('sk-test-secret'));
 const out=await r.json();assert.equal(out.detector,'claude');assert.equal(out.model,'claude-opus-5-5');assert.deepEqual(out.usage,{input:10,output:20});assert.ok(!Number.isNaN(Date.parse(out.fetchedAt)));assert.equal(out.components.length,0);
});
test('vision: ANTHROPIC_MODEL overrides the model and is reported when the API omits it',async()=>{let body;const f=async(u,o)=>{body=JSON.parse(o.body);return new Response(JSON.stringify(finished(empty,{model:undefined,usage:undefined})))};const r=await post(picture,{...KEY,ANTHROPIC_MODEL:'claude-sonnet-5-5'},f);assert.equal(body.model,'claude-sonnet-5-5');const out=await r.json();assert.equal(out.model,'claude-sonnet-5-5');assert.deepEqual(out.usage,{input:null,output:null})});
test('vision: results are clamped into the picture, coerced to the component enum and capped',async()=>{
 const many=Array.from({length:450},(_,i)=>({label:'R'+i,type:'resistor',package:'0603',mpn:'',x:.1,y:.1,w:.01,h:.01,rotation:0,confidence:.9}));
 const raw={board:{x:-.5,y:.2,w:1.4,h:.5,formFactor:'  ATX\u0007 ',widthMm:5000,heightMm:-3},components:[
  {label:'  U1\u0000 main\tCPU '+'x'.repeat(100),type:'Chip',package:'LQFP-144 '+'p'.repeat(50),mpn:'STM32F407\u001f',x:-.2,y:-.1,w:1.3,h:.3,rotation:270,confidence:1.7},
  {label:'C9',type:'MOSFET',package:'',mpn:'',x:.9,y:.9,w:.5,h:.5,rotation:60},
  {label:'gone',type:'led',package:'',mpn:'',x:.5,y:.5,w:0,h:.1,rotation:0,confidence:.4},
  'junk',null,...many],notes:'n'.repeat(600)};
 const r=await post(picture,KEY,claudeSays(finished(raw)));
 assert.equal(r.status,200);const out=await r.json();
 assert.deepEqual(out.board,{x:0,y:.2,w:1,h:.5,formFactor:'ATX',widthMm:2000,heightMm:0});
 assert.equal(out.components.length,400);assert.equal(out.notes.length,500);
 const [u1,c9,r0]=out.components;
 assert.equal(u1.label.length,80);assert.ok(!/[\u0000-\u001f]/.test(u1.label));assert.ok(u1.label.startsWith('U1 main'));assert.equal(u1.type,'chip');assert.equal(u1.package.length,40);assert.equal(u1.mpn,'STM32F407');
 assert.deepEqual([u1.x,u1.y,u1.w,u1.h,u1.rotation,u1.confidence],[0,0,1,.3,90,1]);
 assert.equal(c9.type,'other');assert.deepEqual([c9.x,c9.y,c9.w,c9.h,c9.rotation,c9.confidence],[.9,.9,.1,.1,90,.5]);
 assert.equal(r0.label,'R0');assert.equal(out.components.some(c=>c.label==='gone'),false);
 assert.deepEqual(sanitiseVision(null),{board:{x:0,y:0,w:1,h:1,formFactor:'',widthMm:0,heightMm:0},components:[],notes:''});
});
test('vision: refusal, truncated and unreadable answers surface as 502 with a reason',async()=>{
 let r=await post(picture,KEY,claudeSays({content:[],stop_reason:'refusal',stop_details:{type:'refusal',category:'general_harms',explanation:'Not a circuit board.'},model:'claude-opus-5-5'}));
 assert.equal(r.status,502);const e=(await r.json()).error;assert.match(e,/declined/);assert.match(e,/Not a circuit board/);
 r=await post(picture,KEY,claudeSays({content:[{type:'text',text:'{"board":'}],stop_reason:'max_tokens'}));assert.equal(r.status,502);assert.match((await r.json()).error,/cut off/);
 r=await post(picture,KEY,claudeSays({content:[{type:'text',text:'not json'}],stop_reason:'end_turn'}));assert.equal(r.status,502);assert.match((await r.json()).error,/unreadable/);
 r=await post(picture,KEY,claudeSays({content:[],stop_reason:'end_turn'}));assert.equal(r.status,502);assert.match((await r.json()).error,/unreadable/);
});
test('vision: upstream auth, quota, validation and timeout failures map to clear errors',async()=>{
 let r=await post(picture,KEY,claudeSays({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}},401));assert.equal(r.status,502);assert.match((await r.json()).error,/rejected/);
 r=await post(picture,KEY,claudeSays({},403));assert.equal(r.status,502);assert.match((await r.json()).error,/rejected/);
 r=await post(picture,KEY,claudeSays({},429));assert.equal(r.status,429);assert.match((await r.json()).error,/quota/);
 r=await post(picture,KEY,claudeSays({type:'error',error:{type:'invalid_request_error',message:'image exceeds 5 MB maximum: '+'z'.repeat(300)}},400));assert.equal(r.status,502);const e=(await r.json()).error;assert.match(e,/image exceeds 5 MB/);assert.ok(e.length<260);
 r=await post(picture,KEY,claudeSays({},529));assert.equal(r.status,502);assert.match((await r.json()).error,/529/);
 r=await post(picture,KEY,()=>{throw Object.assign(Error('aborted'),{name:'TimeoutError'})});assert.equal(r.status,502);assert.match((await r.json()).error,/timed out/);
 r=await post(picture,KEY,()=>{throw Error('ECONNRESET')});assert.equal(r.status,502);assert.match((await r.json()).error,/Unable to reach Claude/);
});
test('vision: bad input is rejected before any network call',async()=>{
 const bad=async(body,headers)=>(await post(body,KEY,noFetch,headers)).status;
 assert.equal(await bad({image:'not*base64!',mediaType:'image/png'}),400);
 assert.equal(await bad({image:'',mediaType:'image/png'}),400);
 assert.equal(await bad({image:PNG,mediaType:'image/gif'}),400);
 assert.equal(await bad({image:PNG}),400);
 assert.equal(await bad('{"image":'),400);
 assert.equal(await bad('[1,2]'),400);
 assert.equal(await bad({image:PNG,mediaType:'image/png',hint:'x'.repeat(301)}),400);
 assert.equal(await bad({image:PNG,mediaType:'image/png',widthMm:'305'}),400);
 assert.equal(await bad(picture,{'Content-Length':String(7*1024*1024)}),413);
 assert.equal(await bad({image:'A'.repeat(6*1024*1024+4),mediaType:'image/png'}),413);
});
test('vision is POST-only, other routes stay GET-only and cross-site is still refused',async()=>{
 assert.equal((await handleApi(new Request('http://localhost/api/vision'),KEY)).status,405);
 assert.equal((await handleApi(new Request('http://localhost/api/search?provider=nexar&mpn=SS14',{method:'POST'}),KEY)).status,405);
 assert.equal((await handleApi(new Request('http://localhost/api/status',{method:'POST'}),KEY)).status,405);
 assert.equal((await post(picture,KEY,noFetch,{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await handleApi(new Request('http://localhost/api/status'),KEY)).status,200);
});
test('status reports claude when the key is set and still never leaks it',async()=>{const r=await handleApi(new Request('http://localhost/api/status'),{...KEY,DIGIKEY_CLIENT_ID:'a',DIGIKEY_CLIENT_SECRET:'b'});const text=await r.text();assert.deepEqual(JSON.parse(text),{nexar:false,digikey:true,claude:true,mouser:false,master:false,tme:false,serpapi:false,gemini:false});assert.ok(!text.includes('sk-test-secret'))});

test('money and lead-time parsing handles supplier formats',()=>{
 assert.deepEqual(parseMoney('₹31.53','INR'),{value:31.53,currency:'INR'});assert.deepEqual(parseMoney('$1,234.50'),{value:1234.5,currency:'USD'});
 assert.deepEqual(parseMoney('0,45 €'),{value:.45,currency:'EUR'});assert.deepEqual(parseMoney(.33,'USD'),{value:.33,currency:'USD'});
 assert.equal(parseMoney(''),null);assert.equal(parseMoney('Call'),null);
 assert.equal(parseDays('140 Days'),140);assert.equal(parseDays('6 Weeks'),42);assert.equal(parseDays(''),null);
 assert.equal(fxRates({FX_RATES:'{"INR":0.01}'}).INR,.01);assert.equal(fxRates({FX_RATES:'not json'}).INR,.012);
});
test('Mouser, SerpApi and generic responses normalise to one offer shape',()=>{
 const m=normalizeMouser({SearchResults:{Parts:[{ManufacturerPartNumber:'LM358P',Manufacturer:'Texas Instruments',AvailabilityInStock:'39976',LeadTime:'140 Days',Min:'1',PriceBreaks:[{Quantity:10,Price:'₹22.07',Currency:'INR'},{Quantity:1,Price:'₹31.53',Currency:'INR'}],ProductDetailUrl:'https://www.mouser.in/x'},{ManufacturerPartNumber:'LM358PE4'}]}},'lm358p');
 assert.equal(m.length,1);assert.deepEqual([m[0].seller,m[0].stock,m[0].price,m[0].currency,m[0].quantity,m[0].leadDays,m[0].authorized],['Mouser',39976,31.53,'INR',1,140,true]);
 const s=normalizeSerp({shopping_results:[{title:'LM358P',source:'DigiKey',price:'$0.33',extracted_price:.33,product_link:'https://g/x'},{title:'Op amp kit',source:'Shop',price:'$9'},{title:'LM358P Ic',source:'Aion FX',price:'$1.25',extracted_price:1.25}]},'LM358P');
 assert.deepEqual(s.map(o=>[o.seller,o.price,o.currency,o.authorized]),[['DigiKey',.33,'USD',true],['Aion FX',1.25,'USD',false]]);
 const g=normalizeGeneric({data:{items:[{partNumber:'LM358P',manufacturer:'TI',qtyAvailable:'1,200',priceBreaks:[{qty:100,unitPrice:.2},{qty:1,unitPrice:.4}],currency:'USD',leadTime:'8 weeks'}]}},'LM358P','Master Electronics','master');
 assert.equal(g.length,1);assert.deepEqual([g[0].stock,g[0].price,g[0].quantity,g[0].leadDays,g[0].manufacturer],[1200,.4,1,56,'TI']);
});
test('TME signature is deterministic HMAC-SHA1 over the sorted, encoded parameters',async()=>{
 const a=await tmeSignature('https://api.tme.eu/Products/Search.json',{Token:'t',SearchPlain:'LM358P',Country:'US'},'secret');
 const b=await tmeSignature('https://api.tme.eu/Products/Search.json',{Country:'US',SearchPlain:'LM358P',Token:'t'},'secret');
 assert.equal(a,b,'parameter order does not change the signature');assert.match(a,/^[A-Za-z0-9+/]{27}=$/);
 assert.notEqual(a,await tmeSignature('https://api.tme.eu/Products/Search.json',{Token:'t',SearchPlain:'LM358P',Country:'US'},'other'));
});
test('compare asks every configured supplier at once and isolates failures',async()=>{
 const seen=[];const f=async url=>{seen.push(String(url).split('?')[0]);
  if(String(url).includes('mouser'))return new Response(JSON.stringify({Errors:[],SearchResults:{Parts:[{ManufacturerPartNumber:'XQ1',AvailabilityInStock:'5',PriceBreaks:[{Quantity:1,Price:'₹100.00',Currency:'INR'}]}]}}),{status:200});
  if(String(url).includes('serpapi'))return new Response('{}',{status:500});
  throw Error('unexpected '+url)};
 const env={MOUSER_API_KEY:'m',SERPAPI_KEY:'s',TME_APP_SECRET:'only-secret',FX_RATES:'{"INR":0.012}'};
 const r=await compareSuppliers('XQ1',env,f);
 const by=Object.fromEntries(r.providers.map(p=>[p.id,p]));
 assert.equal(by.mouser.status,'ok');assert.equal(by.mouser.count,1);assert.equal(by.serpapi.status,'error');assert.match(by.serpapi.error,/SerpApi lookup failed \(500\)/);
 assert.equal(by.tme.status,'not-configured');assert.match(by.tme.need,/TME_TOKEN/);assert.equal(by.master.status,'not-configured');assert.equal(by.digikey.status,'not-configured');
 assert.equal(r.offers[0].priceUsd,1.2);assert.ok(r.fx.approximate);
 assert.ok(!JSON.stringify(r).includes('only-secret')&&!JSON.stringify(r).includes('"m"'),'no secrets in the response');
 assert.deepEqual(seen.sort(),['https://api.mouser.com/api/v1/search/partnumber','https://serpapi.com/search.json']);
 const http=await handleApi(new Request('http://localhost/api/compare?mpn='),env,f);assert.equal(http.status,400);
 const s=await handleApi(new Request('http://localhost/api/search?provider=tme&mpn=XQ1'),env,f);assert.equal(s.status,503);assert.match((await s.json()).error,/TME_TOKEN/);
});

test('compare can be limited to distributors so Google Shopping searches are not spent',async()=>{
 const seen=[];const f=async url=>{seen.push(String(url).split('?')[0]);return new Response(JSON.stringify({Errors:[],SearchResults:{Parts:[]}}),{status:200})};
 const env={MOUSER_API_KEY:'m',SERPAPI_KEY:'s',FX_LIVE:'off'};
 const r=await handleApi(new Request('http://localhost/api/compare?mpn=XQ2&sources=distributors'),env,f);const j=await r.json();
 assert.deepEqual(j.providers.map(p=>p.id),['digikey','mouser','nexar','tme','master']);assert.deepEqual(seen,['https://api.mouser.com/api/v1/search/partnumber']);
 const only=await (await handleApi(new Request('http://localhost/api/compare?mpn=XQ2&sources=serpapi'),env,f)).json();assert.deepEqual(only.providers.map(p=>p.id),['serpapi']);
});

test('Gemini identify: server-side key, schema, model fallback and sanitising',async()=>{
 resetGemini();const calls=[];const answer={parts:[{ref:'U3',type:'chip',package:'SOIC-8',mpn:'LM358DR',manufacturer:'Texas Instruments',description:'Dual op-amp',alternates:['MCP6002-I/SN','x'.repeat(200)],confidence:1.7,reason:'8 pads, 1.27 mm pitch'},{ref:'EVIL',type:'chip',package:'',mpn:'',manufacturer:'',description:'',alternates:[],confidence:.5,reason:''},{ref:'R1',type:'bogus',package:'0603',mpn:'unknown',manufacturer:'',description:'',alternates:[],confidence:.2,reason:''}]};
 const f=async(url,opts)=>{calls.push({url,opts});if(calls.length===1)return new Response(JSON.stringify({error:{code:'service_unavailable'}}),{status:503});
  return new Response(JSON.stringify({model:'gemini-3.5-flash',steps:[{type:'thought'},{type:'model_output',content:[{type:'text',text:JSON.stringify(answer)}]}],usage:{total_input_tokens:100,total_output_tokens:50}}),{status:200})};
 const req=body=>new Request('http://localhost/api/identify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const r=await handleApi(req({board:{name:'CTRL-01',width:100,height:67},parts:[{ref:'U3',pads:8,rows:2,pitch:1.27,w:3.9,d:4.9},{ref:'R1',package:'0603'}]}),{GEMINI_API_KEY:'secret-gem'},f);
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.model,'gemini-3.5-flash');
 assert.deepEqual(calls.map(c=>JSON.parse(c.opts.body).model),['gemini-3.6-flash','gemini-3.8-flash'],'falls back when a model is busy');
 assert.equal(calls[0].url,'https://generativelanguage.googleapis.com/v1beta/interactions');assert.equal(calls[0].opts.headers['x-goog-api-key'],'secret-gem');
 const sent=JSON.parse(calls[1].opts.body);assert.equal(sent.store,false);assert.equal(sent.response_format.mime_type,'application/json');assert.match(sent.input,/"ref":"U3"/);
 assert.ok(!JSON.stringify(j).includes('secret-gem'));
 assert.deepEqual(j.parts.map(p=>p.ref),['U3','R1'],'refs that were not asked about are dropped');
 assert.equal(j.parts[0].confidence,1);assert.equal(j.parts[0].alternates[1].length,80);assert.equal(j.parts[1].type,'other');assert.equal(j.parts[1].mpn,'');
 assert.equal((await handleApi(req({parts:[]}),{GEMINI_API_KEY:'k'},f)).status,400);
 assert.equal((await handleApi(req({parts:[{ref:'U1'}]}),{},f)).status,503);
 assert.equal((await handleApi(new Request('http://localhost/api/identify'),{GEMINI_API_KEY:'k'},f)).status,405);
 assert.deepEqual(sanitiseIdentify(null,['A']),[]);
});
test('vision accepts widthMm 0, the app default for unknown board width',async()=>{
 const r=await handleApi(new Request('http://localhost/api/vision',{method:'POST',body:JSON.stringify({image:'AAAA',mediaType:'image/jpeg',widthMm:0})}),{});
 assert.equal(r.status,503,'reaches the key check instead of a 400');
});

test('part details: Google results become manufacturer, description, datasheet and specs; https only',()=>{
 const info=normalizePartInfo({knowledge_graph:{},organic_results:[
  {title:'LM358P Dual op-amp | Texas Instruments',link:'https://www.ti.com/lit/ds/symlink/lm358.pdf',snippet:'LM358P dual operational amplifier. Package: PDIP-8; Supply voltage: 3 V to 32 V.',source:'Texas Instruments'},
  {title:'LM358P DigiKey',link:'https://www.digikey.com/p/lm358p',snippet:'Number of pins: 8',rich_snippet:{top:{extensions:['In stock','$0.42','8-DIP']}}},
  {title:'mirror',link:'http://insecure.example/lm358.pdf',snippet:'LM358P'}]},'LM358P');
 assert.equal(info.manufacturer,'Texas Instruments');assert.equal(info.datasheet,'https://www.ti.com/lit/ds/symlink/lm358.pdf');assert.equal(info.package,'PDIP-8');
 assert.deepEqual(info.specs.map(s=>s.name||s.value),['Package','Supply voltage','8-DIP','Number of pins']);
 assert.ok(info.links.every(l=>l.link.startsWith('https://')));assert.equal(info.source,'serpapi');
});

test('part details: the store is checked before any search, and new results are stored',async()=>{
 const kept=new Map(),store={get:k=>kept.get(k)||null,put:(k,v)=>{kept.set(k,v)}};let calls=0;
 const fetcher=async url=>{calls++;assert.match(String(url),/engine=google&q=BSS138\+datasheet/);return new Response(JSON.stringify({organic_results:[{title:'BSS138 N-channel MOSFET onsemi',link:'https://www.onsemi.com/pdf/datasheet/bss138-d.pdf',snippet:'BSS138 N-Channel Logic Level MOSFET. Package: SOT-23'}]}))};
 const get=async mpn=>handleApi(new Request('http://localhost/api/partinfo?mpn='+encodeURIComponent(mpn)),{SERPAPI_KEY:'k'},fetcher,store);
 const first=await(await get('BSS138')).json();assert.equal(first.manufacturer,'onsemi');assert.equal(first.package,'SOT-23');assert.equal(calls,1);assert.ok(kept.has('BSS138'));
 const again=await(await get('bss-138')).json();assert.equal(again.cached,true);assert.equal(calls,1,'the stored copy answers without a second search');
 const none=await handleApi(new Request('http://localhost/api/partinfo?mpn=XYZ123'),{},fetcher,null);assert.equal(none.status,503);assert.match((await none.json()).error,/SERPAPI_KEY/);
 assert.equal((await handleApi(new Request('http://localhost/api/partinfo?mpn='),{SERPAPI_KEY:'k'},fetcher)).status,400);
});

test('SerpApi keys: SERPAPI_KEY then SERPAPI_KEYS, without duplicates',()=>{
 assert.deepEqual(serpKeys({SERPAPI_KEY:'a',SERPAPI_KEYS:' b, a ,,c'}),['a','b','c']);assert.deepEqual(serpKeys({SERPAPI_KEYS:'x'}),['x']);assert.deepEqual(serpKeys({}),[]);
});

test('SerpApi keys: a used-up key hands the search to the next one and is skipped afterwards',async()=>{
 const used=[];let clock=1000;const now=()=>clock;
 const fetcher=async url=>{const key=new URL(url).searchParams.get('api_key');used.push(key);
  if(key==='r1')return new Response(JSON.stringify({error:'Your account has run out of searches.'}),{status:429});
  if(key==='r2')return new Response(JSON.stringify({error:'Your account has run out of searches.'}),{status:200});
  return new Response(JSON.stringify({organic_results:[]}))};
 const env={SERPAPI_KEY:'r1',SERPAPI_KEYS:'r2,r3'};
 const r=await serpFetch({engine:'google',q:'x'},env,fetcher,{now});assert.equal(r.status,200);assert.deepEqual(used,['r1','r2','r3'],'429 and an in-body limit error both move on');
 used.length=0;await serpFetch({engine:'google',q:'y'},env,fetcher,{now});assert.deepEqual(used,['r3'],'spent keys are skipped for the next search');
 clock+=3600e3+1;used.length=0;await serpFetch({engine:'google',q:'z'},env,fetcher,{now});assert.deepEqual(used,['r1','r2','r3'],'an hour later they are tried again');
 const all=await serpFetch({engine:'google',q:'w'},{SERPAPI_KEY:'s1'},async()=>new Response('{}',{status:429}),{now});assert.equal(all.status,429);
});

test('part details and Google Shopping both use the rotation; status never shows the keys',async()=>{
 const env={SERPAPI_KEY:'t1',SERPAPI_KEYS:'t2'},seen=[];
 const fetcher=async url=>{const key=new URL(url).searchParams.get('api_key');seen.push(key);return key==='t1'?new Response('{}',{status:429}):new Response(JSON.stringify({organic_results:[{title:'AO3400A MOSFET Alpha & Omega',link:'https://aosmd.com/ao3400a.pdf',snippet:'AO3400A N-channel MOSFET. Package: SOT-23'}]}))};
 const r=await handleApi(new Request('http://localhost/api/partinfo?mpn=AO3400A'),env,fetcher);assert.equal(r.status,200);assert.equal((await r.json()).package,'SOT-23');assert.deepEqual(seen,['t1','t2']);
 const spent=await handleApi(new Request('http://localhost/api/partinfo?mpn=AO3401A'),{SERPAPI_KEY:'u1'},async()=>new Response('{}',{status:429}));assert.equal(spent.status,429);assert.match((await spent.json()).error,/used up/);
 const status=await(await handleApi(new Request('http://localhost/api/status'),{SERPAPI_KEYS:'secret-only-extra'})).json();assert.equal(status.serpapi,true);assert.doesNotMatch(JSON.stringify(status),/secret-only-extra/);
});

test('Gemini keys take turns and busy models are skipped for a while',async()=>{
 resetGemini();assert.deepEqual(geminiKeys({GEMINI_API_KEY:'a',GEMINI_API_KEYS:'b, a,c'}),['a','b','c']);
 const ok=()=>new Response(JSON.stringify({model:'m',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({parts:[{ref:'U1',type:'chip',package:'',mpn:'X1',manufacturer:'',description:'',alternates:[],confidence:.9,reason:''}]})}]}]}));
 const seen=[];const f=async(url,opts)=>{const key=opts.headers['x-goog-api-key'],model=JSON.parse(opts.body).model;seen.push(model+'/'+key);
  if(model==='gemini-3.6-flash')return new Response('{}',{status:503});if(key==='k1')return new Response(JSON.stringify({error:{code:'resource_exhausted'}}),{status:429});return ok()};
 const req=()=>new Request('http://localhost/api/identify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts:[{ref:'U1'}]})});
 const env={GEMINI_API_KEY:'k1',GEMINI_API_KEYS:'k2'};
 assert.equal((await handleApi(req(),env,f)).status,200);assert.deepEqual(seen,['gemini-3.6-flash/k1','gemini-3.8-flash/k1','gemini-3.8-flash/k2'],'busy model, then a spent key, then the next key');
 seen.length=0;assert.equal((await handleApi(req(),env,f)).status,200);assert.deepEqual(seen,['gemini-3.8-flash/k2'],'the busy model and the spent key are skipped next time');
 resetGemini();const all=await handleApi(req(),{GEMINI_API_KEY:'z'},async()=>new Response('{}',{status:429}));assert.equal(all.status,503);assert.match((await all.json()).error,/quota/);
 assert.equal((await(await handleApi(new Request('http://localhost/api/status'),{GEMINI_API_KEYS:'only'})).json()).gemini,true);
});

test('offers carry every price break, the product photo, description and lifecycle',async()=>{
 const d=normalizeDigikey({Products:[{ManufacturerProductNumber:'LM358P',Manufacturer:{Name:'Texas Instruments'},Description:{ProductDescription:'IC OPAMP GP 2 CIRCUIT 8DIP'},PhotoUrl:'https://mm.digikey.com/x.jpg',ProductStatus:{Status:'Active'},QuantityAvailable:500,
  ProductVariations:[{PackageType:{Name:'Tube'},MinimumOrderQuantity:1,StandardPricing:[{BreakQuantity:100,UnitPrice:.21},{BreakQuantity:1,UnitPrice:.45},{BreakQuantity:10,UnitPrice:.3}]}]}]},'LM358P')[0];
 assert.deepEqual(d.breaks,[{qty:1,price:.45},{qty:10,price:.3},{qty:100,price:.21}]);assert.equal(d.image,'https://mm.digikey.com/x.jpg');assert.equal(d.lifecycle,'Active');assert.equal(d.manufacturer,'Texas Instruments');
 const m=normalizeMouser({SearchResults:{Parts:[{ManufacturerPartNumber:'LM358P',ImagePath:'//www.mouser.com/images/x.jpg',Description:'Operational Amplifiers',PriceBreaks:[{Quantity:1,Price:'₹31.53',Currency:'INR'},{Quantity:10,Price:'₹22.07',Currency:'INR'}]}]}},'LM358P')[0];
 assert.deepEqual(m.breaks,[{qty:1,price:31.53},{qty:10,price:22.07}]);assert.equal(m.image,'https://www.mouser.com/images/x.jpg');
 assert.equal(normalizeMouser({SearchResults:{Parts:[{ManufacturerPartNumber:'A',ImagePath:'javascript:alert(1)'}]}},'A')[0].image,null,'only https images');
 assert.deepEqual(breaksOf([{q:5,p:'Call'},{q:0,p:1},{q:2,p:'$1.50'}],'q','p'),[{qty:2,price:1.5}]);
});
test('live exchange rate: fetched once, cached, and replaced by the defaults when the source fails',async()=>{
 resetFx();let calls=0;const f=async url=>{calls++;assert.match(String(url),/open\.er-api\.com/);return new Response(JSON.stringify({result:'success',time_last_update_utc:'Fri, 30 Oct 2026',rates:{USD:1,INR:88,EUR:.9}}))};
 const r=await (await handleApi(new Request('http://localhost/api/fx'),{},f)).json();assert.equal(r.inrPerUsd,88);assert.equal(r.live,true);assert.equal(r.source,'open.er-api.com');
 await handleApi(new Request('http://localhost/api/fx'),{},f);assert.equal(calls,1,'cached');
 resetFx();const down=await (await handleApi(new Request('http://localhost/api/fx'),{},async()=>{throw Error('offline')})).json();assert.equal(down.live,false);assert.equal(down.inrPerUsd,Math.round(1/.012*100)/100);
 const fixed=await (await handleApi(new Request('http://localhost/api/fx'),{FX_RATES:'{"INR":0.0125}'},async()=>{throw Error('must not fetch')})).json();assert.equal(fixed.inrPerUsd,80);assert.equal(fixed.source,'FX_RATES setting');
 resetFx();
});

test('offers carry compliance, factory lead time, factory stock and the market type',()=>{
 const d=normalizeDigikey({Products:[{ManufacturerProductNumber:'LM358P',QuantityAvailable:2984,ManufacturerLeadWeeks:'20',ManufacturerPublicQuantity:0,Discontinued:false,EndOfLife:false,
  Classifications:{ReachStatus:'REACH Unaffected',RohsStatus:'ROHS3 Compliant',MoistureSensitivityLevel:'Not Applicable',ExportControlClassNumber:'EAR99',HtsusCode:'8542.33.0001'},ProductVariations:[{PackageType:{Name:'Tube'},StandardPricing:[{BreakQuantity:1,UnitPrice:.33}]}]}]},'LM358P')[0];
 assert.deepEqual([d.factoryLeadDays,d.factoryStock,d.discontinued,d.marketType,d.condition],[140,0,false,'authorized','New']);
 assert.deepEqual(d.compliance,{rohs:'ROHS3 Compliant',reach:'REACH Unaffected',msl:'Not Applicable',eccn:'EAR99',hts:'8542.33.0001'});
 const m=normalizeMouser({SearchResults:{Parts:[{ManufacturerPartNumber:'LM358P',ROHSStatus:'RoHS Compliant',LeadTime:'182 Days',FactoryStock:'0',Mult:'1',SuggestedReplacement:'',ProductCompliance:[{ComplianceName:'USHTS',ComplianceValue:'8542330001'},{ComplianceName:'ECCN',ComplianceValue:'EAR99'}]}]}},'LM358P')[0];
 assert.deepEqual([m.factoryLeadDays,m.factoryStock,m.mult,m.suggestedReplacement,m.compliance.rohs,m.compliance.reach,m.compliance.hts],[182,0,null,null,'RoHS Compliant',null,'8542330001']);
 assert.equal(normalizeSerp({shopping_results:[{title:'LM358P',source:'Shop',extracted_price:1}]},'LM358P')[0].marketType,'marketplace');
});
