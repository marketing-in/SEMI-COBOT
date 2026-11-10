import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import path from 'node:path';
// Screenshots and generated workbooks go to WORK_DIR (default ../../work, outside the repository).
const WORK=process.env.WORK_DIR||'../../work';const out=name=>path.join(WORK,name);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const svgPart=name=>page.locator('.board-svg').getByRole('button',{name});const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Exchange rate and distributor offers are stubbed: fixed numbers, and no supplier quota is spent.
await page.route('**/api/fx',r=>r.fulfill({json:{inrPerUsd:90,source:'test rate',updated:'2026-10-30T06:00:00Z',live:true,rates:{USD:1,INR:1/90}}}));
const OFFERS={'LM1117MPX-3.3':[0,0],'1N4148W':[60,40],'SS14':[9000,12000]};
await page.route('**/api/compare?**',r=>{const mpn=new URL(r.request().url()).searchParams.get('mpn');const [a,b]=OFFERS[mpn]||[5000,8000];
 const offer=(seller,source,stock,p)=>({mpn,manufacturer:'Test Mfr',description:mpn+' test part',seller,source,stock,priceUsd:p,breaksUsd:[{qty:1,price:p},{qty:100,price:+(p*.6).toFixed(4)}],moq:1,authorized:true,url:'https://example.com/'+source,image:null});
 // Without a sources filter the whole market is searched: one unverified Google Shopping listing joins in.
 const all=!new URL(r.request().url()).searchParams.get('sources'),listing={mpn,seller:'Aion FX',source:'serpapi',marketType:'marketplace',authorized:false,stock:null,priceUsd:.02,breaksUsd:[],title:mpn+' IC chip 10pcs',url:'https://example.com/listing',condition:null};
 r.fulfill({json:{mpn,fetchedAt:new Date().toISOString(),providers:[{id:'digikey',name:'DigiKey',status:'ok'},{id:'mouser',name:'Mouser',status:'ok'},...(all?[{id:'serpapi',name:'Google Shopping',status:'ok'}]:[])],offers:[offer('DigiKey','digikey',a,.5),offer('Mouser','mouser',b,.45),...(all?[listing]:[])],fx:{approximate:true,rates:{}}}})});
try{
 await page.goto('http://127.0.0.1:5173');await page.evaluate(()=>localStorage.clear());await page.reload();
 // Intro page and admin panel: what the product does, then first-run sign-up (or sign-in with TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD).
 const adminPanel=page.getByRole('region',{name:'Admin'});await adminPanel.waitFor();
 assert.equal(await page.getByRole('list',{name:'What semi-cobot does'}).getByRole('listitem').count(),6);await page.getByRole('img',{name:/board moving through the seven machines/}).waitFor();
 {const bg=await page.locator('video.intro-bg').evaluate(v=>({src:v.currentSrc||v.src,loop:v.loop,muted:v.muted,poster:v.poster,hidden:v.getAttribute('aria-hidden')}));assert.match(bg.src,/\/media\/intro-assembly\.webm$/);assert.ok(bg.loop&&bg.muted&&bg.hidden==='true');assert.match(bg.poster,/intro-assembly\.jpg$/);
  assert.equal((await page.request.get('http://127.0.0.1:5173/media/intro-assembly.webm')).status(),200,'the background video is served')}
 const ADMIN={name:'Line Admin',email:process.env.TEST_ADMIN_EMAIL||'admin@semicobot.test',password:process.env.TEST_ADMIN_PASSWORD||'test password 123'};
 const signIn=async()=>{const p=page.getByRole('region',{name:'Admin'});if(await p.getByRole('heading',{name:'Create the admin account'}).count()){await p.getByLabel('Name').fill(ADMIN.name);await p.getByLabel('Email').fill(ADMIN.email);await p.getByLabel('Password').fill(ADMIN.password);await p.getByRole('button',{name:'Create account'}).click()}
  else{await p.getByLabel('Email').fill(ADMIN.email);await p.getByLabel('Password').fill(ADMIN.password);await p.getByRole('button',{name:'Sign in'}).click()}};
 await signIn();await page.getByRole('heading',{name:'Workspace overview'}).waitFor();
 // First visit: the product tour walks the main features, opening each page as it goes, and does not come back.
 {const tourCard=page.locator('.tour-card');await tourCard.waitFor();const titles=[];
  for(let i=0;i<20&&await tourCard.count();i++){const t=await tourCard.locator('h2').innerText();titles.push(t);
   if(t==='BOM tool')await page.getByRole('heading',{name:'BOM tool',level:1}).waitFor();
   await tourCard.getByRole('button',{name:/^(Next|Finish)$/}).click()}
  assert.deepEqual(titles.slice(0,4),['Overview','BOM tool','INR or USD','Inventory']);assert.equal(titles.at(-1),'Help is here');
  await page.reload();await page.getByRole('heading',{level:1}).first().waitFor();assert.equal(await page.locator('.tour-card').count(),0,'the tour shows once');
  await page.getByRole('navigation').getByRole('button',{name:/^Overview/}).click();await page.getByRole('heading',{name:'Workspace overview'}).waitFor()}
 // The BOM tool is the second menu item; a new workspace holds no sample records until asked for them.
 assert.match((await page.getByRole('navigation').getByRole('button').allInnerTexts())[1],/^BOM tool/);
 await page.getByRole('region',{name:'Get started'}).waitFor();assert.equal(await page.locator('.demo-label').count(),0,'no sample label on real data');
 assert.match(await page.getByRole('group',{name:'Boards'}).innerText(),/In production\s*0/);
 await page.getByRole('region',{name:'Get started'}).getByRole('button',{name:'Load sample data'}).click();await page.getByText('Sample components and jobs loaded.').waitFor();await page.locator('.demo-label').waitFor();
 {const guest=await browser.newPage();await guest.goto('http://127.0.0.1:5173');await guest.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await guest.evaluate(()=>fetch('/api/search?provider=nexar&mpn=SS14').then(r=>r.status)),401,'the API needs a session');
  await guest.getByLabel('Email').fill(ADMIN.email);await guest.getByLabel('Password').fill('not the password');await guest.getByRole('button',{name:'Sign in'}).click();await guest.getByRole('alert').filter({hasText:'Wrong email or password'}).waitFor();
  // A newcomer signs up and goes straight in; the admin sees them in the Team window.
  const member={name:'Floor Operator',email:'operator@semicobot.test',password:'operator pass 123'};
  await guest.getByRole('tab',{name:'Sign up'}).click();await guest.getByLabel('Name').fill(member.name);await guest.getByLabel('Email').fill(member.email);await guest.getByLabel('Password').fill(member.password);await guest.getByRole('button',{name:'Create account'}).click();
  await guest.getByRole('heading',{name:'Workspace overview'}).waitFor();
  await page.getByRole('button',{name:'Team',exact:true}).click();const team=page.getByRole('table',{name:'Team accounts'});await team.waitFor();assert.match(await team.innerText(),/Floor Operator[\s\S]*Member/);await page.getByRole('button',{name:'Close dialog'}).click();
  assert.equal(await guest.getByRole('button',{name:'Team',exact:true}).count(),0,'members do not manage the team');await guest.close()}
 // Light and dark themes: the switch changes the colour tokens and is remembered.
 const bgOf=()=>page.evaluate(()=>getComputedStyle(document.body).backgroundColor);const startTheme=await page.evaluate(()=>document.documentElement.dataset.theme);
 await page.getByRole('button',{name:/Switch to (light|dark) theme/}).click();const other=startTheme==='light'?'dark':'light';
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),other);const bg1=await bgOf();await page.reload();await page.getByRole('heading',{name:'Workspace overview'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),other,'theme persists across reloads');
 await page.getByRole('button',{name:/Switch to (light|dark) theme/}).click();assert.notEqual(await bgOf(),bg1,'background changes with the theme');
 if(await page.evaluate(()=>document.documentElement.dataset.theme)!=='dark')await page.getByRole('button',{name:'Switch to dark theme'}).click();
 // Overview bento: value/units basis toggle, attention rows open the alternatives dialog, the studio card opens the studio.
 const bento=page.locator('.bento');await bento.getByRole('region',{name:'Inventory value'}).waitFor();assert.match(await bento.getByRole('region',{name:'Allocation'}).textContent(),/Semiconductors/);
 await bento.getByRole('group',{name:'Basis'}).getByRole('button',{name:'Units'}).click();await bento.getByRole('region',{name:'Units in stock'}).first().waitFor();assert.equal(await bento.getByRole('button',{name:'Units'}).getAttribute('aria-pressed'),'true');
 await bento.getByRole('group',{name:'Basis'}).getByRole('button',{name:'Value'}).click();
 await bento.getByRole('region',{name:'Needs attention'}).locator('button.rowbtn').first().click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/alternative/i);await page.getByRole('button',{name:'Close dialog'}).click();
 // Production capacity: last job duration, machines working now, and the feasibility verdict for a new request.
 await page.getByRole('navigation').getByRole('button',{name:/^Production/}).click();await page.getByRole('heading',{name:'Production'}).waitFor();
 const stats=await page.locator('.prod-stats').innerText();assert.match(stats,/LAST JOB TOOK[\s\S]*18\s*days/i);assert.match(stats,/MACHINES WORKING NOW[\s\S]*2\s*of 6/i);assert.match(stats,/SMT LINES FREE[\s\S]*1\s*of 2/i);
 // Machines: each drawn from its own 3D model; an SMT line's stations are named under their machines, left to right.
 const floorPanel=page.getByRole('region',{name:'Machines'});await floorPanel.getByRole('img',{name:'Flying probe test, 3D model'}).waitFor();
 await page.waitForFunction(()=>{const im=[...document.querySelectorAll('.machine-figure img')];return im.length===6&&im.every(i=>i.complete&&i.naturalWidth>0)});
 const stationLabels=await floorPanel.getByRole('list',{name:'SMT line 1 stations'}).getByRole('listitem').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [e.textContent,r.left,r.right]}));
 assert.deepEqual(stationLabels.map(l=>l[0]),['Loader','Printer','SPI','Pick & place','Reflow','AOI','X-ray']);stationLabels.slice(1).forEach((l,i)=>assert.ok(l[1]>stationLabels[i][2]+4,l[0]+' sits right of '+stationLabels[i][0]));
 const quote=page.getByRole('region',{name:'New request'});await quote.getByLabel('Customer').fill('Orion Boards');await quote.getByLabel('Board',{exact:true}).fill('Gateway GW-1');await quote.getByLabel('Quantity of boards').fill('500');await quote.getByLabel('Components per board').fill('118');
 const due=d=>{const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().slice(0,10)};
 await quote.getByLabel('Requested delivery').fill(due(30));assert.match(await quote.getByRole('status').innerText(),/Likely[\s\S]*Last finished job \(Inverter control IC-7 for Aster Energy\) took 18 days[\s\S]*2 of 6 machines are working now/);
 await quote.getByLabel('Requested delivery').fill(due(1));assert.match(await quote.getByRole('status').innerText(),/Not by that date/);
 await quote.getByLabel('Requested delivery').fill(due(30));await quote.getByRole('button',{name:'Book this job'}).click();await page.getByText(/Gateway GW-1 for Orion Boards booked/).waitFor();
 assert.match(await page.locator('.prod-stats').innerText(),/SMT LINES FREE[\s\S]*0\s*of 2/i);assert.match(await page.getByRole('region',{name:'Jobs on the floor'}).innerText(),/Gateway GW-1/);
 await page.reload();await page.getByRole('heading',{name:'Production'}).waitFor();assert.match(await page.getByRole('region',{name:'Jobs on the floor'}).innerText(),/Gateway GW-1/,'booked job persists');
 // Inventory has two sections: own stock (with its totals) and production (boards through dispatch).
 await page.getByRole('navigation').getByRole('button',{name:/^Inventory/}).click();const invSections=page.getByRole('group',{name:'Inventory section'});
 assert.match(await page.locator('.stock-stats').innerText(),/COMPONENTS\s*12[\s\S]*STOCK VALUE\s*₹/i);
 await invSections.getByRole('button',{name:'Production'}).click();const byJob=page.getByRole('region',{name:'Boards by job'});await byJob.waitFor();
 {const row=byJob.locator('tr',{hasText:'Motor driver MD-3 Rev B'});const cells=async()=>(await row.locator('td.numeric').allInnerTexts()).map(t=>+t.replace(/,/g,''));
  const before=await cells();assert.equal(before[0],1500);assert.equal(before[1]+before[2]+before[3]+before[4],1500);
  await row.getByLabel('Motor driver MD-3 Rev B step').selectOption('built');await row.getByLabel('Motor driver MD-3 Rev B boards to move').fill('100');await row.getByRole('button',{name:'Record'}).click();
  await row.getByLabel('Motor driver MD-3 Rev B step').selectOption('ready');await row.getByLabel('Motor driver MD-3 Rev B boards to move').fill('60');await row.getByRole('button',{name:'Record'}).click();
  await row.getByLabel('Motor driver MD-3 Rev B step').selectOption('dispatch');await row.getByLabel('Motor driver MD-3 Rev B boards to move').fill('40');await row.getByLabel('Motor driver MD-3 Rev B dispatch note').fill('BlueDart 4471');await row.getByRole('button',{name:'Record'}).click();
  const after=await cells();assert.deepEqual([after[1],after[4]],[before[1]-100,40]);assert.equal(after[2],before[2]+100-60);assert.equal(after[3],20);
  assert.match(await page.getByRole('region',{name:'Dispatch log'}).innerText(),/40 × Motor driver MD-3 Rev B to Northwind Robotics · BlueDart 4471/)}
 await page.getByRole('navigation').getByRole('button',{name:/^Overview/}).click();assert.match(await page.getByRole('group',{name:'Boards'}).innerText(),/Ready for dispatch\s*520[\s\S]*Dispatched\s*3,640/);
 // BOM tool: analysis table (summary figures, scores, search, sort, optional columns, risks), the component
 // overview with offers across markets (choose an offer, an EMS excess offer with bid and seller contact),
 // cart, bare PCB material, supplier shipping and free shipping, INR and USD, and the quotation PDF.
 await page.getByRole('navigation').getByRole('button',{name:/^BOM tool/}).click();await page.getByRole('heading',{name:'BOM tool',level:1}).waitFor();
 // The work starts with the bare board; the components come second.
 await page.getByRole('region',{name:'Components'}).waitFor();assert.deepEqual(await page.getByRole('navigation',{name:'BOM workflow'}).locator('button > span').allInnerTexts(),['1','2','3','4']);
 assert.match(await page.getByRole('navigation',{name:'BOM workflow'}).innerText(),/1\s*Components[\s\S]*2\s*Bare PCB\s*optional[\s\S]*3\s*Enclosure\s*optional[\s\S]*4\s*Quotation/);
 assert.match(await page.getByRole('note').filter({hasText:'Step 1 of 4'}).innerText(),/Step 1 of 4 · Components\. Required\. Upload your BOM[\s\S]*or the Gerber ZIP/);
 await page.getByRole('button',{name:'Use CTRL-01'}).click();const bomRows=page.locator('table.bom-grid tr.g-row');assert.equal(await bomRows.count(),9);
 await page.getByRole('button',{name:'Get prices'}).click();await page.getByText('Prices and stock updated for 9 lines.').waitFor();
 const kpis=page.getByRole('group',{name:'BOM analysis'});assert.equal(await kpis.getByLabel('Project name').inputValue(),'CTRL-01');
 assert.match(await kpis.locator('.bom-sum').innerText(),/^9 lines\s*100% MPN matched\s*units\s*BoM cost ₹[\d,.]+\s*2 parts at risk$/);assert.equal(await kpis.getByLabel('Production quantity').inputValue(),'100');
 assert.deepEqual([...await page.locator('table.bom-grid thead .th-sort').allInnerTexts(),await page.locator('table.bom-grid thead th').last().innerText()],['MPN','Brand','Avail.','Resil.','Quality','Econ.','Sust.','Unit price','Action'],'compact columns as in the reference');
 assert.match(await page.locator('.bom-note').innerText(),/Scores 0–100; click any column to sort, any row to open part detail\.[\s\S]*INR[\s\S]*1 USD = ₹90\.00 · test rate · rate of 30 Oct 2026/);
 const bomRow=mpn=>bomRows.filter({has:page.getByRole('button',{name:'Open '+mpn+' overview',exact:true})});
 assert.match(await bomRow('STM32F407VGT6').innerText(),/Own stock$/);assert.equal(await bomRow('STM32F407VGT6').locator('.part-image').count(),1,'the component picture is in the table');assert.match(await bomRow('1N4148W').innerText(),/· Risk[\s\S]*Add to list\s*Ask quote$/);
 {const ask=bomRow('1N4148W').getByRole('link',{name:/^Ask .+ to quote 1N4148W$/});const href=decodeURIComponent(await ask.getAttribute('href'));assert.match(href,/^mailto:\?subject=Request for quotation[\s\S]*1\. 1N4148W[\s\S]*quantity [\d,]+/,'a written-out quotation request')}assert.match(await bomRow('1N4148W').locator('.g-risk-tag').getAttribute('data-tip'),/Low stock coverage/);
 assert.match(await bomRow('LM1117MPX-3.3').locator('.g-risk-tag').getAttribute('aria-label'),/^At risk: Out of stock/);
 await bomRow('LM1117MPX-3.3').locator('.g-risk-tag').focus();assert.match(await page.locator('.tip-layer').innerText(),/At risk: Out of stock/,'the risk reasons show as a tooltip on focus');await page.keyboard.press('Escape');assert.equal(await page.locator('.tip-layer').count(),0,'Escape closes the tooltip');assert.equal(await bomRows.locator('td.g-risk').count(),2,'only the two risky parts are highlighted');
 assert.match(await bomRow('STM32F407VGT6').locator('.score').first().getAttribute('aria-label'),/^Resilience: \d+ of 100$/);
 assert.equal(await bomRow('STM32F407VGT6').locator('.score').nth(3).getAttribute('aria-label'),'Sustainability: Not available','no RoHS or lifecycle reported, so no sustainability score');
 await page.getByLabel('Search the BOM').fill('lm1117');assert.equal(await bomRows.count(),1);await page.getByLabel('Search the BOM').fill('');
 await page.getByRole('button',{name:'Sort by Unit price'}).click();await page.getByRole('button',{name:'Sort by Unit price'}).click();
 assert.equal(await page.locator('th',{has:page.getByRole('button',{name:'Sort by Unit price'})}).getAttribute('aria-sort'),'descending');
 {const units=(await bomRows.locator('td:nth-child(8)').allInnerTexts()).map(x=>/^₹/.test(x)?+x.replace(/[^\d.]/g,''):-1);assert.deepEqual(units,[...units].sort((a,b)=>b-a),'rows are in descending unit price')}
 await page.getByRole('button',{name:'Columns'}).click();for(const c of ['Own stock','Total price'])await page.getByRole('group',{name:'Optional columns'}).getByLabel(c).check();await page.getByRole('button',{name:'Sort by Total price'}).waitFor();await page.getByRole('button',{name:'Columns'}).click();
 // A short part: alternatives, then the replacement is priced.
 await bomRow('LM1117MPX-3.3').getByRole('button',{name:'Expand LM1117MPX-3.3'}).click();await page.locator('tr.g-detail-row').getByRole('button',{name:/alternative/}).click();
 const altDlg=page.getByRole('dialog',{name:'Alternatives for LM1117MPX-3.3'});await altDlg.waitFor();assert.match(await altDlg.innerText(),/Compatibility check required[\s\S]*LD1117S33TR[\s\S]*Inventory record/);
 await altDlg.locator('li',{hasText:'LD1117S33TR'}).getByRole('button',{name:'Use instead'}).click();await page.getByText('LM1117MPX-3.3 replaced by LD1117S33TR. Get prices to price it.').waitFor();
 assert.match(await bomRow('LD1117S33TR').innerText(),/Not priced yet/);assert.equal(await bomRow('LD1117S33TR').getByRole('button',{name:'Collapse LD1117S33TR'}).getAttribute('aria-expanded'),'true');await bomRow('LD1117S33TR').getByRole('button',{name:'Collapse LD1117S33TR'}).click();
 await page.getByRole('button',{name:'Get prices'}).click();await page.getByText('Prices and stock updated for 9 lines.').waitFor();assert.doesNotMatch(await bomRow('LD1117S33TR').innerText(),/Not priced yet/);assert.match(await bomRow('LD1117S33TR').locator('td:nth-child(8)').innerText(),/^₹\d/,'the replacement now has a unit price');
 // Component overview: three cards and every offer; picking another offer updates the BOM line.
 await bomRow('STM32F407VGT6').locator('td').nth(1).click();const ov=page.locator('.bom-overview');await ov.getByRole('heading',{name:'STM32F407VGT6'}).waitFor();
 for(const card of ['General','Availability','Lifecycle & Compliance'])await ov.getByRole('region',{name:card}).waitFor();
 assert.match(await ov.getByRole('region',{name:'Availability'}).innerText(),/Total available stock\s*13,000[\s\S]*Distributors\s*2 with stock[\s\S]*Minimum lead time\s*In stock[\s\S]*Best available price/);
 assert.match(await ov.getByRole('region',{name:'Lifecycle & Compliance'}).innerText(),/Lifecycle status\s*Active[\s\S]*RoHS\s*Not available[\s\S]*HSN code\s*Not available/);
 const offersTbl=ov.getByRole('region',{name:'Offers across all markets'});await offersTbl.locator('tr',{hasText:'Aion FX'}).waitFor();assert.equal(await offersTbl.locator('tbody tr').count(),3,'distributors and the marketplace listing');
 assert.match(await offersTbl.innerText(),/Authorised distributor[\s\S]*Not quoted/);assert.match(await offersTbl.locator('.title-row').innerText(),/2 distributor and entered offers · 1 marketplace listing · searched/);
 const listingRow=offersTbl.locator('tr',{hasText:'Aion FX'});assert.match(await listingRow.innerText(),/Marketplace listing[\s\S]*seller not verified[\s\S]*high/);assert.match(await listingRow.locator('.score.unc').getAttribute('aria-label'),/^Uncertainty: \d+ of 100, high$/);
 assert.equal(await listingRow.getByRole('link',{name:/Open listing/}).getAttribute('href'),'https://example.com/listing');
 const bestGet=ov.getByRole('status',{name:'Best to get'});assert.match(await bestGet.innerText(),/Best to get\s*Mouser[\s\S]*8,000 in stock/i);assert.match(await bestGet.locator('.score.unc').getAttribute('aria-label'),/low$/);
 assert.match(await offersTbl.locator('tr.best').innerText(),/Mouser[\s\S]*Best to get/i);assert.match(await offersTbl.locator('tr',{hasText:'DigiKey'}).innerText(),/1\+ ₹45\.00 · 100\+ ₹27\.00/,'every price break is listed');
 await offersTbl.getByLabel('Use DigiKey for STM32F407VGT6').check();await page.getByText('STM32F407VGT6: supplier changed.').waitFor();
 await ov.getByRole('button',{name:'Add an offer'}).click();const of=page.getByRole('dialog',{name:'Add an offer for STM32F407VGT6'});
 await of.getByLabel('Seller',{exact:true}).fill('EMS Surplus Pvt Ltd');await of.getByLabel('Market').selectOption('ems-excess');await of.getByLabel('Stock',{exact:true}).fill('500');await of.getByLabel('Minimum order').fill('100');await of.getByLabel('Unit price').fill('300');await of.getByLabel('Price currency').selectOption('INR');
 await of.getByLabel(/^Shipping charge/).fill('200');await of.getByLabel('Date code').fill('2431');await of.getByLabel('Seller contact').fill('sales@ems.example');await of.getByRole('button',{name:'Add offer'}).click();
 const ems=offersTbl.locator('tr',{hasText:'EMS Surplus Pvt Ltd'});assert.match(await ems.innerText(),/EMS excess[\s\S]*500[\s\S]*100[\s\S]*₹300\.00[\s\S]*₹200\.00[\s\S]*2431/);
 assert.equal(await ems.getByRole('link',{name:'Chat with Seller'}).getAttribute('href'),'mailto:sales@ems.example?subject=STM32F407VGT6%20offer');
 await ems.getByRole('button',{name:'Bid'}).click();const bd=page.getByRole('dialog',{name:'Bid to EMS Surplus Pvt Ltd'});await bd.getByLabel(/^Target unit price/).fill('250');await bd.getByRole('button',{name:'Save bid'}).click();await page.getByText('Bid for STM32F407VGT6 saved.').waitFor();
 await ov.getByRole('button',{name:'BOM',exact:true}).click();assert.match(await bomRow('STM32F407VGT6').innerText(),/Add to list\s*Ask quote$/,'the chosen offer replaces own stock for this line');
 await bomRow('BSS138').getByRole('button',{name:'Expand BSS138'}).click();await page.locator('tr.g-detail-row').getByRole('button',{name:'View All Market Prices'}).click();await page.getByRole('region',{name:'Offers across all markets'}).waitFor();await page.locator('.bom-overview').getByRole('button',{name:'BOM',exact:true}).click();
 // Purchase list: every priced line, grouped per supplier, as CSV for upload.
 await page.getByRole('button',{name:'Add all to list'}).click();await page.getByText(/^\d+ lines added to the purchase list, \d+ covered by own stock\.$/).waitFor();
 await page.getByRole('button',{name:/^Purchase list, \d+ lines$/}).click();const cartDlg=page.getByRole('dialog',{name:'Purchase list and bids'});await cartDlg.getByRole('region',{name:'DigiKey list'}).waitFor();
 const [csv]=await Promise.all([page.waitForEvent('download'),cartDlg.getByRole('region',{name:'DigiKey list'}).getByRole('button',{name:'CSV'}).click()]);const csvText=(await import('node:fs')).readFileSync(await csv.path(),'utf8');
 assert.match(csvText,/^Manufacturer Part Number,Quantity,Customer Reference,Unit Price USD\r\nSTM32F407VGT6,100,U1,/);
 await cartDlg.getByRole('group',{name:'Purchase list or bids'}).getByRole('button',{name:/Bids · 1/}).click();assert.match(await cartDlg.innerText(),/STM32F407VGT6[\s\S]*EMS Surplus Pvt Ltd[\s\S]*100[\s\S]*INR 250/);await cartDlg.getByRole('button',{name:'Close dialog'}).click();
 // Money: per-line markup in USD, bare PCB material, supplier shipping, delivery and free shipping.
 await page.getByRole('group',{name:'Currency'}).getByRole('button',{name:'$ USD'}).click();
 const outlook=page.getByRole('region',{name:'Component purchase analysis'});
 await outlook.getByLabel('Quantity bought').fill('20');await outlook.getByLabel('Paid per unit (USD)').fill('.30');
 await outlook.getByRole('button',{name:'Record purchase'}).click();
 await outlook.getByRole('cell',{name:'$0.30',exact:true}).waitFor();
 await bomRow('GRM188R71C104KA01D').getByRole('button',{name:'Expand GRM188R71C104KA01D'}).click();const capDetail=bomRow('GRM188R71C104KA01D').locator('xpath=following-sibling::tr[1]');
 await capDetail.getByLabel('Markup %').fill('50');assert.match(await capDetail.innerText(),/Selling price\s*\$9\.00[\s\S]*Cost\s*\$6\.00/,'600 × $0.01 own stock, 50 % markup');assert.match(await bomRow('GRM188R71C104KA01D').innerText(),/\$6\.00/,'the table total is the cost, like the unit price');
 const bomTotal=page.getByRole('region',{name:'BOM total'}),tv=async label=>+(await bomTotal.locator('.bom-totals div',{has:page.locator('dt',{hasText:new RegExp('^'+label+'$')})}).locator('dd').innerText()).split('\n')[0].replace(/[^\d.-]/g,'');
 await page.getByRole('button',{name:'Next: Bare PCB',exact:true}).click();
 const bare=page.getByRole('region',{name:'Bare PCB setup'});
 // Gerber upload: the bare board drawn in 2D, its size and copper layers filled into the form.
 // The BOM came from the board in the 3D view (CTRL-01): its bare board is there before any upload.
 await bare.getByText(/From the board this BOM was loaded from: CTRL-01/).waitFor();await bare.getByRole('img',{name:/^Top of the bare board from CTRL-01, 100 × 67 mm$/}).waitFor();
 assert.match(await bare.getByLabel('From the Gerber files').innerText(),/CTRL-01[\s\S]*100 × 67 mm[\s\S]*Copper layers\s+4/);
 // An uploaded Gerber set replaces it.
 await bare.getByLabel('Upload Gerber files').setInputFiles('public/samples/sample-gerber.zip');
 // The upload goes on by itself: the board joins Board studio; this BOM already has lines, so they are kept.
 await page.getByText(/added to Board studio\. Your BOM lines are kept/).waitFor({timeout:30000});
 {const facts=bare.getByLabel('From the Gerber files');await facts.getByText('sample-gerber.zip').waitFor();assert.match(await facts.innerText(),/sample-gerber\.zip[\s\S]*100 × 67 mm[\s\S]*Copper layers\s+2[\s\S]*14[\s\S]*0\.4 mm/);
  assert.equal(await bare.getByLabel('Bare PCB material').inputValue(),'fr4','FR-4 is chosen when no material was');
  const top=bare.getByRole('img',{name:/^Top of the bare board from sample-gerber\.zip, 100 × 67 mm$/});await top.waitFor();assert.ok(await top.evaluate(i=>i.complete&&i.naturalWidth>100),'the top face is drawn');
  await bare.getByRole('group',{name:'Board face'}).getByRole('button',{name:'Bottom'}).click();
  assert.equal(await bare.getByRole('img',{name:/^Bottom of the bare board .*seen from below$/}).evaluate(i=>getComputedStyle(i).transform!=='none'),true,'the bottom is mirrored, as seen from below');
  assert.match(await bare.innerText(),/On the quote: FR-4, 2 layers, 100 x 67 mm[\s\S]*Gerber sample-gerber\.zip/)}
 await bare.getByLabel('Bare PCB material').selectOption('aluminium');await bare.getByLabel('PCB board type').selectOption({index:1});
 assert.match(await bare.getByLabel('Selected bare PCB').getByRole('definition').first().innerText(),/Aluminium core \(MCPCB\), 2 layers, 100 × 67 mm/);assert.match(await bare.innerText(),/Price not entered/,'an estimate is not a price');
 // The fab's quote form: choices follow the material, and each option shows in the charge details and the quote line.
 assert.deepEqual(await bare.getByRole('group',{name:'Solder mask colour'}).getByRole('radio').evaluateAll(r=>r.map(x=>x.value)),['white','black'],'aluminium boards come in white or black');
 await bare.getByRole('group',{name:'Surface finish'}).locator('label',{hasText:'ENIG'}).click();assert.equal(await bare.getByRole('group',{name:'Surface finish'}).getByRole('radio',{name:'ENIG'}).isChecked(),true);
 {const charges=await bare.getByRole('group',{name:'Estimated charge details'}).innerText();assert.match(charges,/Surface finish: ENIG/);assert.match(charges,/Build time\s+\d+–\d+ working days/)}
 assert.match(await bare.innerText(),/On the quote: Aluminium core \(MCPCB\), 2 layers, 100 x 67 mm, 1\.6 mm, White mask, black silkscreen, ENIG/);
 await bare.getByLabel('PCB price per board').fill('2');
 // The BOM demo: a priced demo BOM with a spotlight on each feature and a list of every step. Jumping in
 // the list opens what the step needs; ending it brings back this BOM exactly as it was.
 {const own=await page.evaluate(()=>localStorage.getItem('semicobot-bom-tool-v1'));
  await page.getByRole('button',{name:'Watch the demo'}).click();const demo=page.locator('.bt-card');await demo.waitFor();
  assert.match(await demo.innerText(),/Start · 1 of 16[\s\S]*A full BOM, ready to explore/);await page.locator('.bom-demo-note').waitFor();
  const steps=page.getByRole('navigation',{name:'Demo steps'});assert.equal(await steps.getByRole('button').count(),16);
  await steps.getByRole('button',{name:/Every market price/}).click();await page.getByRole('region',{name:'Offers across all markets'}).waitFor();
  assert.match(await page.getByRole('status',{name:'Best to get'}).innerText(),/Best to get/i);assert.equal(await steps.locator('[aria-current="step"]').innerText().then(x=>x.trim().endsWith('Every market price')),true);
  await steps.getByRole('button',{name:/The bare board from its Gerber/}).click();await page.getByRole('img',{name:/^Top of the bare board from sample-gerber\.zip/}).waitFor({timeout:20000});
  await demo.getByRole('button',{name:'End the demo'}).click();await page.getByText('Demo finished. Your own BOM is back.').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('semicobot-bom-tool-v1')),own,'the BOM is back exactly as it was');assert.equal(await page.locator('.bom-demo-note').count(),0);
  await page.getByRole('button',{name:'Next: Bare PCB',exact:true}).click();assert.equal(await bare.getByLabel('PCB price per board').inputValue(),'2','the demo ends on Components; the bare board kept its price')}
 await page.getByRole('button',{name:'Next: Enclosure',exact:true}).click();
 const enclosure=page.getByRole('region',{name:'Enclosure and box setup'});
 await enclosure.getByLabel('Enclosure material',{exact:true}).selectOption('ABS plastic');
 await enclosure.getByLabel('Enclosure unit cost (USD)').fill('1.25');
 await enclosure.getByLabel('One-time tooling cost (USD)').fill('50');
 // An off-the-shelf enclosure needs no mould; a custom one gets its mould on the same page, priced from the maker's quote.
 const mouldStep=page.getByRole('region',{name:'Mould'});assert.equal(await mouldStep.count(),0,'no mould for an off-the-shelf enclosure');
 await enclosure.getByRole('group',{name:'Enclosure kind'}).getByRole('button',{name:'Custom moulded'}).click();await mouldStep.waitFor();assert.match(await mouldStep.innerText(),/ABS plastic, base and lid moulded together[\s\S]*Plastic per enclosure[\s\S]*Cycle time[\s\S]*Clamp force/);
 assert.match(await mouldStep.getByRole('list').first().innerText(),/Protolabs[\s\S]*Capability not confirmed/,'the mould makers come from the Vendors page');
 await mouldStep.getByRole('button',{name:'Select Protolabs',exact:true}).click();assert.equal(await mouldStep.getByLabel('Mould maker').inputValue(),'Protolabs');
 await mouldStep.getByLabel('Mould tooling cost').fill('50');await mouldStep.getByLabel('Moulded enclosure unit price').fill('1.25');
 await page.getByRole('button',{name:'Next: Quotation',exact:true}).click();
 const extras=page.getByRole('region',{name:'Shipping'});const pcbCost=await tv('Selected bare PCB cost');assert.equal(pcbCost,200,'2 × 100 boards');
 await extras.getByLabel('Mouser flat shipping charge').fill('20');await extras.getByLabel('DigiKey flat shipping charge').fill('15');await extras.getByLabel('DigiKey free shipping above').fill('1000000');await extras.getByLabel('Delivery cost to the customer').fill('30');
 assert.equal(await tv('Actual shipping cost'),65);assert.equal(await tv('Shipping charged to customer'),65);
 const sub=await tv('Selling subtotal before shipping'),cost=await tv('Component cost'),paid=await tv('Customer total'),profit=await tv('Net profit');
 assert.equal(Math.round(paid*100),Math.round((sub+65)*100),'customer total = selling subtotal + shipping charged');assert.equal(Math.round(profit*100),Math.round((paid-cost-pcbCost-175-65)*100),'net profit formula');
 await extras.getByLabel('Offer Free Shipping').check({force:true});assert.match(await bomTotal.innerText(),/Shipping charged to customer\s*Free shipping/);
 assert.equal(Math.round(await tv('Customer total')*100),Math.round(sub*100));assert.equal(Math.round((profit-await tv('Net profit'))*100),6500,'free shipping comes out of net profit');
 await page.getByRole('group',{name:'Currency'}).getByRole('button',{name:'₹ INR'}).click();assert.match(await bomTotal.locator('.grand dd').innerText(),/^₹/);assert.equal(Math.round(await tv('Customer total')/90),Math.round(sub));
 await page.getByRole('button',{name:'Quotation PDF'}).first().click();const qd=page.getByRole('dialog',{name:'Quotation'});await qd.waitFor();
 await qd.getByLabel('Company').fill('Semi Cobot Pvt Ltd');await qd.getByLabel('Customer').fill('Orion Boards');assert.match(await qd.innerText(),/Shipping\s*Free/);
 const [pdf]=await Promise.all([page.waitForEvent('download'),qd.getByRole('button',{name:'Download PDF'}).click()]);assert.match(pdf.suggestedFilename(),/^Quotation-Q-\d{8}-\d{3}\.pdf$/);
 {const file=out('quotation.pdf');await pdf.saveAs(file);const text=(await import('node:fs')).readFileSync(file,'latin1');assert.ok(text.startsWith('%PDF'));
  for(const w of ['QUOTATION','Semi Cobot Pvt Ltd','Orion Boards','Component package','ABS plastic','Aluminium core','Free shipping','Shipping is free of charge.','INR','test rate'])assert.ok(text.includes(w),'quotation PDF mentions '+w);
  for(const w of ['LD1117S33TR','Net profit','EMS Surplus','Mouser','DigiKey','markup','margin'])assert.ok(!text.includes(w),'quotation PDF keeps out '+w)}
 if(await qd.isVisible())await qd.getByRole('button',{name:'Close dialog'}).click();
 // Save list: the whole BOM is kept to come back to.
 {const oc=page.getByRole('region',{name:'Save or continue'});assert.match(await oc.innerText(),/Bare PCB priced[\s\S]*Enclosure custom moulded[\s\S]*Mould Protolabs/);
  assert.equal(await oc.getByRole('button',{name:/Continue to production/}).isDisabled(),true,'the customer is needed to continue');
  await oc.getByLabel('Customer').fill('Orion Boards');await oc.getByRole('button',{name:'Save list'}).click();await page.getByText(/saved \(revision 1\)\. Open it again from Saved lists\./).waitFor()}
 await page.reload();await page.getByRole('heading',{name:'BOM tool',level:1}).waitFor();await bomRows.first().waitFor();assert.equal(await bomRows.count(),9,'the BOM is kept');
 await page.unroute('**/api/compare?**');
 await page.getByRole('navigation').getByRole('button',{name:/^Production/}).click();await page.getByRole('heading',{name:'Production',level:1}).waitFor();
 const quote2=page.getByRole('region',{name:'New request'});await quote2.getByLabel('Quantity of boards').fill('200');assert.match(await quote2.getByRole('status').innerText(),/No line is free today/);
 const floorJobs=page.getByRole('region',{name:'Jobs on the floor'});await floorJobs.getByRole('button',{name:'Complete SMT'}).first().click();
 await page.getByRole('region',{name:'Calculator log'}).getByText(/Motor driver MD-3 Rev B: SMT done\. Finish (moves to|stays)/).waitFor();
 assert.match(await floorJobs.innerText(),/ahead of plan|behind plan|on plan/);
 await floorJobs.getByRole('button',{name:'Mark finished'}).last().click();await page.getByText(/marked finished/).waitFor();assert.match(await page.locator('.prod-stats').innerText(),/SMT LINES FREE[\s\S]*1\s*of 2/i);
 // Saved lists → reopen → Continue to production: the list becomes a job that runs the whole chain, then shows as ordered.
 await page.getByRole('navigation').getByRole('button',{name:/^Saved lists/}).click();const saved=page.getByRole('region',{name:'Saved lists'});await saved.waitFor();
 assert.match(await saved.innerText(),/CTRL-01[\s\S]*Orion Boards[\s\S]*PCB · custom moulded/);
 await saved.getByRole('button',{name:'Open'}).first().click();await page.getByRole('heading',{name:'BOM tool',level:1}).waitFor();
 await page.getByRole('navigation',{name:'BOM workflow'}).getByRole('button',{name:/Quotation$/}).click();
 {const oc=page.getByRole('region',{name:'Save or continue'});assert.equal(await oc.getByLabel('Customer').inputValue(),'Orion Boards','reopened exactly as saved');
  const due=new Date(Date.now()+40*864e5).toISOString().slice(0,10);await oc.getByLabel('Requested delivery').fill(due);
  await oc.getByRole('button',{name:/Continue to production/}).click();await page.getByText(/for Orion Boards is in production/).waitFor()}
 await page.getByRole('navigation').getByRole('button',{name:/^Production/}).click();const chainJobs=page.getByRole('region',{name:'Jobs on the floor'});
 const orion=chainJobs.locator('.job-row',{hasText:'Orion Boards'});await orion.waitFor();
 assert.match(await orion.locator('.stage-groups').innerText(),/Material[\s\S]*Incoming check[\s\S]*QA incoming[\s\S]*Kitting[\s\S]*Storing[\s\S]*Factory line[\s\S]*SMT[\s\S]*PCBA[\s\S]*THT[\s\S]*Wave soldering[\s\S]*QA line[\s\S]*Assembly[\s\S]*Testing[\s\S]*Final product[\s\S]*Final QC and pack/i);
 assert.match(await orion.innerText(),/quote Q-\d{8}-\d{3}/,'the job keeps the quotation it came from');
 await page.getByRole('navigation').getByRole('button',{name:/^Saved lists/}).click();assert.match(await page.getByRole('region',{name:'Saved lists'}).locator('.job-link').first().innerText(),/^(Incoming check|QA incoming|Kitting|Storing|SMT|PCBA|THT|Wave soldering|QA line|Assembly|Testing|Final QC and pack|Finished) · CTRL-01/,'the ordered list links to its job and shows where it is');
 assert.equal(await page.getByRole('region',{name:'Saved lists'}).getByLabel(/status$/).first().inputValue(),'ordered');
 // Vendors: every kind in one registry; a vendor added here appears in the BOM tool's pickers.
 await page.getByRole('navigation').getByRole('button',{name:/^Vendors/}).click();const vtabs=page.getByRole('tablist',{name:'Vendor kinds'});assert.equal(await vtabs.getByRole('tab').count(),8);
 await vtabs.getByRole('tab',{name:/^Mould/}).click();const vlist=page.getByRole('region',{name:'Mould makers and moulders'});assert.match(await vlist.innerText(),/Protolabs[\s\S]*Capabilities\s*Not confirmed yet/);
 await vlist.getByLabel('Vendor name').fill('Pune Tool Room');await vlist.getByRole('button',{name:'Register vendor'}).click();await vlist.getByText('Pune Tool Room').waitFor();
 // Vendor register: the products a vendor has, offered on matching BOM lines.
 {const card=vlist.locator('.vendor-card',{hasText:'Pune Tool Room'});await card.getByRole('button',{name:/Products this vendor has \(0\)/}).click();
  await card.getByLabel('Part number for Pune Tool Room').fill('SS14');await card.getByLabel('Stock').fill('4000');await card.getByLabel('Unit price').fill('3.5');await card.getByRole('button',{name:'Add product'}).click();
  await page.getByText('SS14 added to Pune Tool Room. BOM lines with this part number now show it as an offer.').waitFor();assert.match(await card.innerText(),/SS14[\s\S]*4,000 in stock[\s\S]*₹3\.5 each/)}
 await vtabs.getByRole('tab',{name:/^Distributor/}).click();assert.match(await page.getByRole('region',{name:'Distributors'}).innerText(),/DigiKey[\s\S]*API (connected|not set up)/);
 // Help: quick start, the BOM demo chapters, where prices come from, every production stage, every page and questions.
 await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('heading',{name:'Help',level:1}).waitFor();
 for(const r of ['Quick start','BOM demo','Where prices come from','Production stages','Pages','Questions'])await page.getByRole('region',{name:r}).waitFor();
 assert.match(await page.getByRole('region',{name:'Where prices come from'}).innerText(),/Internal stock[\s\S]*Authorised distributors[\s\S]*Registered vendors[\s\S]*Open market/);
 assert.equal(await page.getByRole('region',{name:'Production stages'}).locator('li').count(),12);
 await page.getByRole('navigation').getByRole('button',{name:/^Overview/}).click();assert.match(await page.getByRole('region',{name:'Product flow'}).innerText(),/Part master[\s\S]*Internal stock[\s\S]*BOM tool[\s\S]*Saved lists[\s\S]*Material[\s\S]*Factory line[\s\S]*Assembly[\s\S]*Testing[\s\S]*Final product/i);
 // Studio inspector: Compare suppliers asks every supplier at once and draws the radar (live keys optional).
 await page.goto('http://127.0.0.1:5173/#Board%20studio');await page.getByLabel('Board',{exact:true}).selectOption('reference');await page.getByRole('button',{name:'2D',exact:true}).click();await svgPart(/^U1 /).hover();
 await page.getByRole('button',{name:'Compare suppliers'}).click();const cmp=page.getByRole('dialog').getByRole('region',{name:/Supplier comparison for /});
 await cmp.getByRole('list',{name:'Suppliers queried'}).waitFor({timeout:45000});assert.equal(await cmp.getByRole('list',{name:'Suppliers queried'}).getByRole('listitem').count(),6);
 assert.match(await cmp.innerText(),/Mouser[\s\S]*TME[\s\S]*Master Electronics[\s\S]*Google Shopping/);
 if(await cmp.locator('.radar').count())assert.match(await cmp.locator('.radar').getAttribute('aria-label'),/Supplier radar: .+ \d+/);
 await page.getByRole('button',{name:'Close dialog'}).click();
 // Board knowledge: the board type is recognised, missing supporting parts are planned and placed, then removed.
 await page.goto('http://127.0.0.1:5173/#Board%20studio');const bk=page.getByRole('region',{name:'Board knowledge'});await bk.getByText('This looks like').waitFor({timeout:20000});
 assert.match(await bk.innerText(),/STM32 \/ Cortex-M development board/);const listBefore=await page.locator('.board-list-item').count();
 const missing=Number((await bk.innerText()).match(/(\d+) parts? missing/)[1]);assert.ok(missing>0);
 await bk.getByRole('button',{name:/Add \d+ missing part/}).click();await bk.getByText(/Nothing missing/).waitFor();assert.match(await bk.innerText(),new RegExp(missing+' planned'));
 assert.equal(await page.locator('.board-list-item').count(),listBefore+missing,'suggested parts join the component list');
 await bk.getByRole('button',{name:/Remove \d+ suggested/}).click();assert.equal(await page.locator('.board-list-item').count(),listBefore);
 await bk.getByRole('button',{name:/All board types/}).click();await page.getByRole('heading',{name:'Board types'}).waitFor();assert.ok(await page.locator('.btype').count()>=55);
 await page.getByLabel('Search board types').fill('stepper');assert.match(await page.locator('.btype-grid').innerText(),/Stepper motor driver/);
 // Exploded layer view: components, silkscreen, mask, copper circuit and core pulled apart and labelled.
 await page.goto('http://127.0.0.1:5173/#Board%20studio');await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForTimeout(600);
 await page.getByRole('button',{name:'Separate the layers'}).click();const legend=page.getByRole('group',{name:'Board layers'});await legend.waitFor();
 assert.match(await legend.innerText(),/Components · top[\s\S]*Copper circuit · top[\s\S]*Core · FR-4[\s\S]*Copper circuit · bottom/);await page.getByText('LAYERS SEPARATED').waitFor();
 await legend.getByRole('button',{name:'Circuit only'}).click();assert.equal(await legend.getByRole('button',{name:/Components · top/}).getAttribute('aria-pressed'),'false');assert.equal(await legend.getByRole('button',{name:/Copper circuit · top/}).getAttribute('aria-pressed'),'true');
 await legend.getByRole('button',{name:'All layers'}).click();
 // In the layer view a click selects the part for the inspector, with or without the gripper, and never opens the details dialog.
 await page.getByRole('button',{name:'Gripper',exact:true}).click();assert.match(await page.locator('.grip-status').innerText(),/join them to use the gripper/);
 {const box=await page.locator('.canvas-host canvas').boundingBox();let spot=null;for(let y=box.y+60;y<box.y+box.height-60&&!spot;y+=14)for(let x=box.x+60;x<box.x+box.width-60;x+=14){await page.mouse.move(x,y);await page.waitForTimeout(8);if(await page.locator('.board-tip.visible').count()){spot=[x,y];break}}
  assert.ok(spot,'a separated part can be hovered');await page.mouse.click(...spot);await page.waitForTimeout(500);assert.equal(await page.locator('dialog[open]').count(),0,'no details dialog in the layer view');
  assert.doesNotMatch(await page.locator('.grip-status').innerText(),/Picking|Holding/,'the hidden gripper does not pick');
  await page.mouse.move(spot[0],spot[1]);await page.mouse.down();await page.mouse.move(spot[0]+70,spot[1]+30,{steps:5});await page.mouse.move(spot[0],spot[1],{steps:5});await page.mouse.up();assert.equal(await page.locator('dialog[open]').count(),0,'a drag back to the start is not a click')}
 await page.getByRole('button',{name:'Gripper',exact:true}).click();
 await page.getByRole('button',{name:'Full screen'}).click();await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('board-view'));await page.getByRole('button',{name:'Exit full screen'}).click();await page.waitForFunction(()=>!document.fullscreenElement);
 await page.getByRole('button',{name:'Join the layers'}).click();assert.equal(await legend.count(),0);
 // Cobot gripper: pick a part in 3D, put it back by clicking empty space, assemble the board, program file round trip.
 await page.goto('http://127.0.0.1:5173/#Board%20studio');await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForTimeout(600);
 await page.getByRole('button',{name:'Gripper',exact:true}).click();const gripStatus=page.locator('.grip-status');await gripStatus.filter({hasText:'Gripper ready'}).waitFor();
 const canvas=await page.locator('.canvas-host canvas').boundingBox();let spot=null;
 for(let y=canvas.y+canvas.height*.35;y<canvas.y+canvas.height*.7&&!spot;y+=18)for(let x=canvas.x+canvas.width*.3;x<canvas.x+canvas.width*.7;x+=18){await page.mouse.move(x,y);await page.waitForTimeout(20);if(await page.locator('.board-tip.visible').count()){spot=[x,y];break}}
 assert.ok(spot,'found a component on the 3D board');await page.mouse.click(...spot);
 await gripStatus.filter({hasText:/^Holding /}).waitFor({timeout:15000});const held=(await gripStatus.innerText()).match(/^Holding (\S+)/)[1];
 assert.match(await page.locator('.inspector').innerText(),new RegExp('^'+held),'the picked part is shown beside the model');
 await page.mouse.click(canvas.x+12,canvas.y+canvas.height-60);await gripStatus.filter({hasText:'Gripper ready'}).waitFor({timeout:15000});
 await page.getByRole('button',{name:'Assemble board'}).click();await gripStatus.filter({hasText:/^Placing 1\//}).waitFor();
 await gripStatus.filter({hasText:'Assembled'}).waitFor({timeout:150000});assert.match(await gripStatus.innerText(),/Assembled 19 parts from the placement data · worst placement error 0\.000 mm, 0\.00°/);
 const programDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export gripper program'}).click();const program=await programDownload;await program.saveAs(out('gripper-program.csv'));
 const {readFile:readText,writeFile:writeText}=await import('node:fs/promises');const programCsv=await readText(out('gripper-program.csv'),'utf8');
 assert.match(programCsv,/^# semi-cobot gripper program · CTRL-01/);assert.equal(programCsv.trim().split('\n').length,21,'header, column row and 19 placements');
 await writeText(out('gripper-import.csv'),'Designator,Mid X,Mid Y\nU1,0,0\nNOPE7,1,1\n');
 await page.locator('input[aria-label="Gripper program file"]').setInputFiles(out('gripper-import.csv'));await gripStatus.filter({hasText:'Placing 1/1 · U1'}).waitFor();
 await gripStatus.filter({hasText:'Assembled 1 part from gripper-import.csv'}).waitFor({timeout:60000});assert.match(await gripStatus.innerText(),/1 designator not on this board · 18 board parts not in the file/);
 await page.getByRole('button',{name:'Assemble board'}).click();await page.getByRole('button',{name:'Stop assembly'}).click();await gripStatus.filter({hasText:'Assembly stopped'}).waitFor();
 await page.getByRole('button',{name:'Gripper',exact:true}).click();assert.equal(await gripStatus.count(),0);
 // Production line view: seven machines, boards flow through on the schedule, and each machine opens into its own cycle with process data.
 await page.getByRole('button',{name:'Line',exact:true}).click();const fl=page.getByRole('region',{name:'Production line'});await fl.waitFor();
 const stationButtons=fl.getByRole('button',{name:/^Open /});assert.equal(await stationButtons.count(),7);
 assert.deepEqual(await stationButtons.evaluateAll(b=>b.map(x=>x.getAttribute('aria-label'))),['Open PCB loader','Open Solder paste printer','Open Solder paste inspection','Open Pick-and-place','Open Reflow oven','Open Automated optical inspection','Open X-ray inspection']);
 await fl.getByRole('button',{name:'Full screen'}).click();await page.waitForFunction(()=>document.fullscreenElement?.getAttribute('aria-label')==='Production line');await fl.getByRole('button',{name:'Exit full screen'}).click();await page.waitForFunction(()=>!document.fullscreenElement);
 await fl.getByRole('group',{name:'Speed'}).getByRole('button',{name:'50×'}).click();await fl.getByRole('button',{name:'Run production'}).click();
 await page.waitForFunction(()=>{const s=document.querySelector('.factory-time')?.textContent||'';return !/^0\.0 s/.test(s)});
 await fl.getByRole('button',{name:'Pause production'}).click();
 await fl.getByRole('slider',{name:'Production time'}).evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,el.max);el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.waitForFunction(()=>{const [a,b]=(document.querySelector('.factory-time')?.textContent||'').split(' / ');return a&&a===b});
 const flShot=(await fl.locator('.factory-view').screenshot()).toString('base64');
 const flColours=await page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height).data;const s=new Set();let lum=0,top=0,n=0,nt=0;for(let k=0;k<d.length;k+=32){s.add((d[k]>>4)+','+(d[k+1]>>4)+','+(d[k+2]>>4));const l=.2126*d[k]+.7152*d[k+1]+.0722*d[k+2];lum+=l;n++;if(k<d.length*.15){top+=l;nt++}}return {colours:s.size,mean:lum/n,top:top/nt}},flShot);
 // Inside the closed hall: lit, not a dark box (mean brightness of the view and of its top band, the roof).
 assert.ok(flColours.colours>40,'the line renders machines, conveyor and boards ('+flColours.colours+' colours)');assert.ok(flColours.mean>90&&flColours.top>60,'the hall is lit (mean '+Math.round(flColours.mean)+', roof band '+Math.round(flColours.top)+')');if(process.env.SHOW_STATS)console.log('line view',flColours);
 for(const name of ['PCB loader','Solder paste printer','Solder paste inspection','Pick-and-place','Reflow oven','Automated optical inspection','X-ray inspection']){
  await fl.getByRole('button',{name:'Open '+name}).click();await fl.getByRole('heading',{name}).waitFor();
  await fl.locator('.factory-steps li').first().waitFor({timeout:15000});assert.ok(await fl.locator('.factory-steps li').count()>=1,name+' has steps');
  await fl.locator('.factory-data').filter({hasText:/\S/}).waitFor({timeout:15000});await fl.locator('.factory-step').waitFor();
  if(name==='X-ray inspection'){await fl.getByRole('table',{name:'X-ray results'}).waitFor();assert.equal(await fl.getByRole('img',{name:/computer screen|X-ray image of/}).count(),0,'the X-ray image is only on the computer in the 3D view')}
  await fl.getByRole('button',{name:'Line',exact:true}).click();await fl.getByRole('button',{name:'Open '+name}).waitFor()}
 await page.getByRole('button',{name:'3D',exact:true}).click();await page.locator('.canvas-host canvas').waitFor();
 // Market stacking chart under the 3D model: one row per part number with stock by supplier.
 const market=page.getByRole('region',{name:'Market for this board'});await market.getByRole('button',{name:'Refresh',exact:true}).waitFor({timeout:90000});
 assert.equal(await market.locator('tr.market-row').count(),9,'one row per distinct part number on the reference board');assert.match(await market.locator('table.market-table > thead').innerText(),/^Component\s+On board\s+\S[\s\S]*Total stock/,'components first, then one column per supplier');
 assert.match(await market.locator('tr.market-row').first().innerText(),/GRM188R71C104KA01D[\s\S]*C1–C6[\s\S]*×6 per board/);
 assert.match(await market.locator('.market-summary').innerText(),/BOARDS THE MARKET CAN SUPPLY[\s\S]*PARTS COST PER BOARD/i);
 const ssListing=market.getByRole('table',{name:'Market listing for SS14'});await ssListing.waitFor();assert.ok(await ssListing.locator('tbody tr').count()>=1,'every row opens into its market listing');
 await market.getByRole('button',{name:'Close the market listing for SS14'}).click();assert.equal(await ssListing.count(),0);await market.getByRole('button',{name:'Open the market listing for SS14'}).click();await ssListing.waitFor();
 assert.equal(await page.getByRole('button',{name:/Gemini/}).count(),0,'no Gemini in Board studio');
 await page.getByRole('button',{name:'Show bottom side'}).click();await page.getByText('BOTTOM VIEW').waitFor();await page.getByRole('button',{name:'Show top side'}).click();
 await market.getByRole('button',{name:'Compare all markets for STM32F407VGT6'}).click();await page.getByRole('dialog').getByRole('region',{name:/Supplier comparison for STM32F407VGT6/}).waitFor();await page.getByRole('button',{name:'Close dialog'}).click();
 // Gerber fabrication set: exact outline, copper, mask, legend and drills; components from X2 pad attributes.
 // Gerber files with no component data: parts are inferred from pads, drills and silkscreen (Gemini is stubbed here).
 {const {unzip,zipStored}=await import('../src/unzip.js');const {readFile:rf,writeFile:wf}=await import('node:fs/promises');
  const bare=(await unzip(await rf('public/samples/sample-gerber.zip'))).filter(f=>!/\.pos$/.test(f.name)).map(f=>({name:f.name.split('/').pop(),data:new TextDecoder().decode(f.bytes).replace(/%TO\.[PC],[^%]*%\n/g,'')}));
  await wf(out('bare-gerber.zip'),zipStored(bare));
  await page.route('**/api/identify',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Gemini is unavailable right now. Please try again in a minute.'})}));
  await page.getByRole('button',{name:'Import blueprint'}).first().click();await page.getByLabel('Upload board blueprint').setInputFiles(out('bare-gerber.zip'));
  await page.locator('.studio-note',{hasText:/19 components were inferred from the pads, drills and silkscreen/}).waitFor({timeout:60000});
  await page.waitForTimeout(1500);assert.equal(await page.locator('.toast',{hasText:/Gemini/}).count(),0,'Gemini does not run');
  await page.locator('.refetch-note',{hasText:/no value or part number in these files/}).waitFor();
  assert.equal(await page.locator('.board-list-item').count()>=19,true,'inferred parts are listed');
  await page.getByRole('button',{name:'Separate the layers'}).click();await page.getByRole('group',{name:'Board layers'}).getByRole('button',{name:/Silkscreen · top/}).waitFor({timeout:60000});await page.getByRole('button',{name:'Join the layers'}).click();
  await page.unroute('**/api/identify');page.once('dialog',d=>d.accept());await page.locator('button[title*="Remove"]').first().click()}
 await page.getByRole('button',{name:'Import blueprint'}).first().click();await page.getByLabel('Upload board blueprint').setInputFiles('public/samples/sample-gerber.zip');
 await page.getByText(/sample gerber imported: 19 components placed/).waitFor({timeout:60000});
 assert.match(await page.locator('.studio-note').innerText(),/Gerber set sample-gerber\.zip: 6 Gerber layers, 14 drill hits · components from Gerber X2 pad attributes/);
 const surface=await page.evaluate(async()=>{const b=JSON.parse(localStorage.getItem('semicobot-boards-v1')).at(-1);const im=new Image();im.src=b.surface.top;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);
  const at=(mx,my)=>[...x.getImageData(Math.round((mx+b.width/2)/b.width*im.width),Math.round((my+b.height/2)/b.height*im.height),1,1).data].slice(0,3);return {mask:at(-40,-20),pad:at(-10.35,-9.525),hole:at(-46,-30),bottom:!!b.surface.bottom,w:b.width,h:b.height}});
 assert.deepEqual([surface.w,surface.h,surface.bottom],[100,67,true]);
 assert.ok(surface.mask[1]>surface.mask[0]+40&&surface.mask[1]>surface.mask[2],'solder mask is green: '+surface.mask);
 assert.ok(surface.pad[0]>180&&surface.pad[1]>150&&surface.pad[2]<130,'exposed pad is gold: '+surface.pad);assert.ok(Math.max(...surface.hole)<30,'mounting hole is dark: '+surface.hole);
 await page.getByRole('button',{name:'2D',exact:true}).click();await svgPart(/^U1 /).hover();assert.match(await page.locator('.board-tip').innerText(),/STM32F407VGT6/);
 await page.getByRole('button',{name:'3D',exact:true}).click();assert.equal(await market.locator('tr.market-row').count(),9);
 page.once('dialog',d=>d.accept());await page.locator('button[title*="Remove"],button[aria-label*="Remove"]').first().click().catch(()=>{});
 await page.getByRole('navigation').getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'Workspace overview'}).waitFor();
 await bento.getByRole('button',{name:/Open studio/}).click();await page.getByRole('heading',{name:/Board studio/}).first().waitFor();await page.getByRole('navigation').getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'Workspace overview'}).waitFor();
 await page.getByRole('button',{name:'Inventory',exact:true}).click();
 await page.getByRole('textbox',{name:'Search components'}).fill('SS14');assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'View SS14',exact:true}).click();await page.getByRole('dialog').waitFor();
 await page.getByLabel('Stock on hand',{exact:true}).fill('123');await page.getByRole('button',{name:'Save stock'}).click();await page.getByRole('button',{name:'Close dialog'}).click();
 assert.match(await page.locator('tbody').innerText(),/123/);await page.reload();assert.match(await page.locator('tbody').innerText(),/123/);
 await page.getByRole('textbox',{name:'Search components'}).fill('');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Excel',exact:true}).click();const download=await downloadPromise;await download.saveAs(out('test-export.xlsx'));
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(out('test-export.xlsx'));assert.equal(wb.worksheets[0].rowCount,13);assert.equal(wb.worksheets[0].getCell('A1').value,'MPN');
 await page.getByRole('button',{name:'Add component',exact:true}).click();await page.getByLabel('Manufacturer part number',{exact:true}).fill('TEST-123');await page.getByLabel('Manufacturer',{exact:true}).fill('Test');await page.getByLabel('Description',{exact:true}).fill('Test component');await page.getByLabel('Package',{exact:true}).fill('SOT-23');await page.getByLabel('Storage location').fill('A1');await page.getByRole('dialog').getByRole('button',{name:'Add component',exact:true}).click();
 await page.getByRole('textbox',{name:'Search components'}).fill('TEST-123');assert.equal(await page.locator('tbody tr').count(),1);
 const inputBook=new ExcelJS.Workbook();const sheet=inputBook.addWorksheet('Inventory');sheet.addRow(['MPN','Manufacturer','Stock','Minimum stock','Unit price USD']);sheet.addRow(['IMPORT-456','Test Inc',25,50,.25]);await inputBook.xlsx.writeFile(out('import-test.xlsx'));
 await page.getByRole('button',{name:'Import Excel',exact:true}).click();await page.getByLabel('Upload Excel workbook').setInputFiles(out('import-test.xlsx'));await page.getByText('1 components imported.',{exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Search components'}).fill('IMPORT-456');assert.equal(await page.locator('tbody tr').count(),1);
 // Reference board: hover identification in 2D and 3D, click for details.
 await page.getByRole('button',{name:'Board studio 3D',exact:true}).click();await page.getByRole('button',{name:'2D',exact:true}).click();
 await svgPart(/^U2 /).hover();await page.locator('.board-tip.visible').waitFor();assert.match(await page.locator('.board-tip').innerText(),/LM1117MPX-3\.3/);assert.match(await page.locator('.inspector').innerText(),/LM1117MPX-3\.3[\s\S]*Low stock[\s\S]*PART MASTER[\s\S]*LDO 3\.3V 800mA[\s\S]*SOT-223/,'part master knowledge beside the model');
 await svgPart(/^D1 /).hover();assert.match(await page.locator('.board-tip').innerText(),/SS14[\s\S]*Schottky[\s\S]*Cathode/);
 await svgPart(/^D1 /).click();await page.getByRole('heading',{name:'D1 · Component details'}).waitFor();assert.match(await page.getByRole('dialog').innerText(),/SS14/);await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'3D',exact:true}).click();await page.locator('.canvas-host canvas').waitFor();await page.waitForTimeout(600);
 const canvasBox=await page.locator('.canvas-host canvas').boundingBox();const cx=canvasBox.x+canvasBox.width/2,cy=canvasBox.y+canvasBox.height/2;
 await page.mouse.move(cx-40,cy-40);await page.mouse.move(cx,cy);await page.locator('.board-tip.visible').waitFor();assert.match(await page.locator('.board-tip').innerText(),/U1[\s\S]*STM32F407VGT6/);
 await page.mouse.click(cx,cy);await page.getByRole('heading',{name:'U1 · Component details'}).waitFor();assert.match(await page.getByRole('dialog').innerText(),/Cortex-M4 1MB 168MHz[\s\S]*Alternates to review[\s\S]*STM32F407VET6/);await page.getByRole('button',{name:'Close dialog'}).click();await page.screenshot({path:out('studio.png'),fullPage:true});
 // Blueprint import: KiCad board becomes an interactive model linked to inventory.
 await page.getByRole('button',{name:'Import blueprint',exact:true}).click();await page.getByLabel('Upload board blueprint').setInputFiles('public/samples/sample-board.kicad_pcb');
 await page.getByRole('heading',{name:'Sensor hub'}).waitFor();assert.match(await page.locator('.board-panel .panel-heading').innerText(),/70 × 45 mm · 2 layers · 8 components · 3 in inventory/);
 await page.locator('.canvas-host canvas').waitFor();await page.waitForTimeout(500);await page.screenshot({path:out('blueprint-3d.png'),fullPage:true});
 await page.getByRole('button',{name:'2D',exact:true}).click();await svgPart(/^D1 SS14/).hover();assert.match(await page.locator('.board-tip').innerText(),/SS14[\s\S]*Low stock/);
 await svgPart(/^R1 10k/).hover();assert.match(await page.locator('.board-tip').innerText(),/10 kΩ/,'value-only labels explained from the part master');
 await svgPart(/^R1 10k/).click();await page.getByRole('heading',{name:'R1 · Component details'}).waitFor();assert.match(await page.getByRole('dialog').innerText(),/Not in inventory[\s\S]*Bottom[\s\S]*Matched by value/);
 await page.getByRole('dialog').getByRole('button',{name:'Add to inventory'}).click();assert.equal(await page.getByLabel('Manufacturer part number',{exact:true}).inputValue(),'10k');
 await page.getByLabel('Manufacturer',{exact:true}).fill('Yageo');await page.getByLabel('Storage location').fill('C-09');await page.getByRole('dialog').getByRole('button',{name:'Add component',exact:true}).click();await page.getByText('Component added to inventory and linked to the board.').waitFor();
 assert.match(await page.locator('.board-panel .panel-heading').innerText(),/4 in inventory/);await page.screenshot({path:out('blueprint-2d.png'),fullPage:true});
 // BOM with references names parts on the active board; imported boards survive a reload.
 const bomBook=new ExcelJS.Workbook();const bomSheet=bomBook.addWorksheet('BOM');bomSheet.addRow(['Reference','MPN','Quantity']);bomSheet.addRow(['C1','GRM188R71C104KA01D',1]);await bomBook.xlsx.writeFile(out('bom-test.xlsx'));
 await page.getByRole('button',{name:'Import BOM',exact:true}).click();await page.getByLabel('Upload Excel workbook').setInputFiles(out('bom-test.xlsx'));await page.getByText(/1 references named on Sensor hub/).waitFor();
 assert.match(await page.locator('.board-panel .panel-heading').innerText(),/5 in inventory/);
 await page.reload();await page.getByRole('heading',{name:'Sensor hub'}).waitFor();assert.match(await page.locator('.board-panel .panel-heading').innerText(),/5 in inventory/);
 await page.getByRole('button',{name:'Import blueprint',exact:true}).click();await page.getByRole('button',{name:'Pick-and-place file',exact:true}).click();await page.getByRole('heading',{name:'sample placement'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Board'}).locator('option').count(),3);
 await page.getByRole('button',{name:'Remove sample placement'}).click();await page.getByRole('heading',{name:'Sensor hub'}).waitFor();
 // Picture blueprints: the in-repo template PDF (text layer, labels attach) and, when SAMPLE_PDF is set, a real annotated motherboard PDF.
 await page.getByRole('button',{name:'Import blueprint',exact:true}).click();await page.getByLabel('Board width (mm)').fill('160');await page.getByLabel('Upload board blueprint').setInputFiles('public/samples/template-picture-blueprint.pdf');
 await page.locator('.board-panel .panel-heading h2').filter({hasText:/template picture blueprint/i}).waitFor({timeout:90000});
 {const heading=await page.locator('.board-panel .panel-heading').innerText();assert.match(heading,/160 × 1\d\d mm/);const count=+heading.match(/(\d+) components/)[1];assert.ok(count>=12&&count<=20,`template components: ${count}`);assert.match(heading,/[1-9] in inventory/,'SS14 and LM1117 labels link to inventory')}
 await page.locator('.canvas-host canvas').waitFor();await page.waitForTimeout(700);await page.screenshot({path:out('picture-template-3d.png'),fullPage:true});
 await page.getByRole('button',{name:'2D',exact:true}).click();await page.locator('.board-svg image').waitFor();
 await svgPart(/Main controller IC/).hover();assert.match(await page.locator('.board-tip').innerText(),/Main controller IC[\s\S]*Not in inventory/);
 await svgPart(/^D1 SS14/).hover();assert.match(await page.locator('.board-tip').innerText(),/SS14[\s\S]*Diodes Incorporated[\s\S]*Cathode/);assert.match(await page.locator('.inspector').innerText(),/Schottky barrier diode 1A 40V[\s\S]*Low-drop rectification/);
 await page.screenshot({path:out('picture-template-2d.png'),fullPage:true});
 if(process.env.SAMPLE_PDF){
  await page.getByRole('button',{name:'Import blueprint',exact:true}).click();await page.getByLabel('Board width (mm)').fill('305');await page.getByLabel('Upload board blueprint').setInputFiles(process.env.SAMPLE_PDF);
  await page.locator('.board-panel .panel-heading h2').filter({hasText:/motherboard/i}).waitFor({timeout:120000});const heading=await page.locator('.board-panel .panel-heading').innerText();assert.match(heading,/305 × 2[3-6]\d mm/,'ATX-like aspect from the detected board');
  const count=+heading.match(/(\d+) components/)[1];assert.ok(count>=30,`expected at least 30 detected components, got ${count}`);
  assert.match(await page.locator('.studio-note').innerText(),/no selectable text/i);
  await page.getByRole('button',{name:'3D',exact:true}).click();await page.locator('.canvas-host canvas').waitFor();await page.waitForTimeout(800);await page.screenshot({path:out('picture-3d.png'),fullPage:true});
  await page.getByRole('button',{name:'2D',exact:true}).click();await page.locator('.board-svg image').waitFor();await page.screenshot({path:out('picture-2d.png'),fullPage:true});
  await page.getByRole('button',{name:/^Remove /}).click();
 }
 await page.getByRole('button',{name:/^Remove /}).click();await page.getByRole('heading',{name:'Sensor hub'}).waitFor();
 // Component databank: every part the company knows (part master, saved look-ups, inventory, all boards), sorted into the catalogue.
 // A part that is not listed is looked up (stubbed Google search: no SerpApi quota) and stays in the databank.
 await page.getByRole('button',{name:'Part master',exact:true}).click();const dir=page.getByRole('region',{name:'Component databank'});await dir.waitFor();
 const total=()=>dir.locator('.count-label').innerText().then(s=>+s.replace(/\D/g,''));const dbTotal=await total();assert.ok(dbTotal>=2683,'the whole part master and more: '+dbTotal);
 assert.equal(await dir.locator('.dir-table tbody tr').count(),100,'first 100 rows');await dir.getByRole('button',{name:'Show more'}).click();assert.equal(await dir.locator('.dir-table tbody tr').count(),600);
 const srcGroup=dir.getByRole('group',{name:'Source'});await srcGroup.getByRole('button',{name:'Boards'}).click();assert.match(await dir.locator('.dir-table tbody').innerText(),/GRM188R71C104KA01D/);
 await srcGroup.getByRole('button',{name:'Inventory'}).click();assert.match(await dir.locator('.dir-table tbody').innerText(),/STM32F407VGT6/);await srcGroup.getByRole('button',{name:'All'}).click();
 const cats=dir.getByRole('navigation',{name:'Component categories'});await cats.getByRole('button',{name:'Expand all'}).click();assert.equal(await cats.locator('.dir-node').filter({hasNotText:/^Unclassified/}).count(),527,'10 categories, 101 types, 416 subtypes');
 await cats.getByRole('button',{name:/^Zener/}).first().click();const zener=await dir.locator('.dir-table tbody tr').allInnerTexts();assert.ok(zener.length>0&&zener.every(r=>/Voltage-reference diode › Zener/.test(r)),'only Zener diodes');await cats.getByRole('button',{name:'All',exact:true}).click();
 let infoCalls=0;await page.route('**/api/partinfo?*',async route=>{infoCalls++;const mpn=new URL(route.request().url()).searchParams.get('mpn');await route.fulfill({contentType:'application/json',body:JSON.stringify({mpn,manufacturer:'Texas Instruments',title:mpn+' buck converter',description:'3.8-V to 36-V, 3-A synchronous step-down converter.',package:'SO-8',datasheet:'https://www.ti.com/lit/ds/symlink/lmr33630.pdf',specs:[{name:'Package',value:'SO-8'}],links:[{title:mpn+' datasheet',link:'https://www.ti.com/lit/ds/symlink/lmr33630.pdf',source:'ti.com'}],source:'serpapi',fetchedAt:'2026-10-29T00:00:00Z'})})});
 const dirSearch=dir.getByRole('textbox',{name:'Search the databank'});
 await dirSearch.fill('LM358P');await dirSearch.press('Enter');await dir.locator('.dir-open').waitFor();assert.match(await dir.locator('.dir-open').innerText(),/Dual op-amp/);assert.equal(infoCalls,0,'the part master answers before any search');
 await dirSearch.fill('TPSM365R6RDNR');await dirSearch.press('Enter');await page.getByText('TPSM365R6RDNR added to the databank').waitFor();assert.equal(infoCalls,1);
 const newRow=dir.locator('.dir-table tbody tr').first();assert.match(await newRow.innerText(),/TPSM365R6RDNR[\s\S]*Power-management IC › Buck[\s\S]*Texas Instruments[\s\S]*Google/);assert.match(await dir.locator('.dir-open').innerText(),/step-down converter[\s\S]*Package SO-8/);
 assert.equal(await total(),dbTotal+1,'the new part stays in the databank');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('semicobot-part-details-v1')).TPSM365R6RDNR.manufacturer),'Texas Instruments','saved in this browser');
 await dirSearch.fill('');await dirSearch.fill('TPSM365R6RDNR');await dirSearch.press('Enter');await dir.locator('.dir-open').waitFor();assert.equal(infoCalls,1,'the second search is answered locally');
 await dir.getByRole('button',{name:'Add TPSM365R6RDNR to inventory'}).click();assert.equal(await page.getByLabel('Manufacturer part number',{exact:true}).inputValue(),'TPSM365R6RDNR');assert.equal(await page.getByLabel('Manufacturer',{exact:true}).inputValue(),'Texas Instruments');assert.equal(await page.getByLabel('Package',{exact:true}).inputValue(),'SO-8');await page.getByRole('button',{name:'Close dialog'}).click();
 await dirSearch.fill('STM32F407VGT6');await dir.getByRole('button',{name:'Open STM32F407VGT6 in inventory'}).click();await page.getByRole('dialog').getByRole('button',{name:'STM32F407VET6'}).click();await page.getByRole('dialog').getByRole('region',{name:'Supplier comparison for STM32F407VET6'}).waitFor();await page.getByRole('button',{name:'Close dialog'}).click();
 await dirSearch.fill('');const dbNow=await total();
 const [jsonDl]=await Promise.all([page.waitForEvent('download'),dir.getByRole('button',{name:'Export JSON'}).click()]);const exported=JSON.parse((await import('node:fs')).readFileSync(await jsonDl.path(),'utf8'));
 assert.equal(exported.format,'semi-cobot-components');assert.equal(exported.components.length,dbNow,'the whole databank');assert.ok(exported.components.every(c=>'main_category' in c&&'component_type' in c&&'subtype' in c&&'mounting_style' in c));assert.ok(exported.components.some(c=>c.subtype==='Multilayer (MLCC)'));assert.equal(exported.saved.TPSM365R6RDNR.manufacturer,'Texas Instruments');
 const [xlsDl]=await Promise.all([page.waitForEvent('download'),dir.getByRole('button',{name:'Export Excel'}).click()]);const dirBook=new ExcelJS.Workbook();await dirBook.xlsx.readFile(await xlsDl.path());
 assert.deepEqual(dirBook.worksheets.map(w=>w.name),['Components','Catalogue','Board']);assert.equal(dirBook.getWorksheet('Components').rowCount,dbNow+1,'header and every part');assert.equal(dirBook.getWorksheet('Catalogue').rowCount,417);
 assert.ok(dirBook.getWorksheet('Components').getSheetValues().some(r=>r&&r[3]==='Multilayer (MLCC)'&&String(r[4]).startsWith('GRM188')));
 {const wbIn=new ExcelJS.Workbook();const sh=wbIn.addWorksheet('Components');sh.addRow(['MPN','Manufacturer','Description','Package']);sh.addRow(['AP63203WU-7','Diodes Incorporated','3.8-32V 2A synchronous buck converter','TSOT-26']);await wbIn.xlsx.writeFile(out('part-details.xlsx'))}
 await dir.locator('input[aria-label="Import part details Excel"]').setInputFiles(out('part-details.xlsx'));await page.getByText('1 part detail imported').waitFor();
 await dirSearch.fill('AP63203WU-7');await dirSearch.press('Enter');await dir.locator('.dir-open').waitFor();assert.match(await dir.locator('.dir-table tbody tr').first().innerText(),/Diodes Incorporated[\s\S]*Imported/);assert.equal(infoCalls,1,'Excel-imported details need no search');
 const {writeFile:writeJson}=await import('node:fs/promises');await writeJson(out('part-details.json'),JSON.stringify([{mpn:'TPS7A0233',manufacturer:'Texas Instruments',description:'200 mA LDO',package:'SOT-23-5',links:[{title:'x',link:'javascript:alert(1)'}]}]));
 await dir.locator('input[aria-label="Import part details JSON"]').setInputFiles(out('part-details.json'));await page.getByText('1 part detail imported').waitFor();
 await dirSearch.fill('TPS7A0233');await dirSearch.press('Enter');await dir.locator('.dir-open').waitFor();assert.equal(infoCalls,1,'imported details need no search');assert.doesNotMatch(await dir.innerHTML(),/javascript:/);
 await page.unroute('**/api/partinfo?*');
 assert.equal(await page.getByRole('navigation').getByRole('button',{name:'Sourcing'}).count(),0,'the Sourcing page is gone');const nexar=await page.evaluate(()=>fetch('/api/search?provider=nexar&mpn=SS14').then(async r=>[r.status,(await r.json()).error]));assert.equal(nexar[0],503);assert.match(nexar[1],/not connected/);
 // Check all target widths and keyboard focus, using a clean sample workspace.
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('semicobot-tour-v1','done')});await page.goto('http://127.0.0.1:5173/#Overview');await page.reload();
 await page.getByRole('region',{name:'Get started'}).getByRole('button',{name:'Load sample data'}).click();await page.getByText('Sample components and jobs loaded.').waitFor();
 const exportPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Excel',exact:true}).click();await(await exportPromise).saveAs(out('semi-cobot-component-directory.xlsx'));
 for(const width of [1440,1024,768,375]){await page.setViewportSize({width,height:900});await page.waitForTimeout(300);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`horizontal page overflow at ${width}`);await page.screenshot({path:out(`viewport-${width}.png`),fullPage:true});}
 await page.goto('http://127.0.0.1:5173/#Board%20studio');await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow in Board studio at 375');await page.screenshot({path:out('studio-375.png'),fullPage:true});await page.goto('http://127.0.0.1:5173/#Overview');await page.waitForTimeout(300);
 await page.getByRole('button',{name:'Toggle navigation'}).click();await page.getByRole('button',{name:'Inventory',exact:true}).click();assert.equal(await page.locator('.sidebar.open').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
 // Sign out returns to the intro page; signing in again opens the workspace.
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Sign out'}).click();await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();await signIn();await page.getByRole('button',{name:'Sign out'}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: intro page with a motherboard-assembly background video, admin and member sign-up, sign-in/sign-out and a locked API, theme switch, board knowledge and board types, exploded layer view (no details dialog, gripper-safe), full screen, Gerber component inference, overview bento, production capacity and stage calculator, production line with machine views, full screen and the X-ray computer, supplier radar, market stacking chart with open listings, 3D back side, Gerber import, cobot gripper pick/SMT assembly/program file, search, stock persistence, add, Excel roundtrip/import, hover identification in 2D and 3D, blueprint import (KiCad + pick-and-place + picture PDFs), part master knowledge in inspector/tooltip/dialogs, component databank (part master, look-ups, inventory, boards) with the full catalogue, Excel and JSON, add-from-board, BOM reference linking, board persistence, API errors, responsive widths, mobile navigation, keyboard focus.');
}finally{await browser.close()}
