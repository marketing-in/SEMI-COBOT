// The BOM demo: a complete, ready-priced BOM for the guided tour, so every feature has something to
// show without a supplier lookup. It replaces the user's BOM only while the demo runs (bomTool keeps a
// backup and restores it); demo prices are illustrative, not quotes. Part numbers are real parts.

const day=864e5;
const offer=(o)=>({condition:'New',authorized:true,marketType:'authorized',moq:1,mult:1,lifecycle:'Active',...o});
const dk=(mpn,maker,desc,stock,breaks,extra={})=>offer({mpn,manufacturer:maker,description:desc,seller:'DigiKey',source:'digikey',stock,priceUsd:breaks[0][1],breaksUsd:breaks.map(([qty,price])=>({qty,price})),factoryLeadDays:extra.factoryLeadDays??84,
 compliance:{rohs:'ROHS3 Compliant',reach:'REACH Unaffected',msl:extra.msl||'1 (Unlimited)',hts:extra.hts||'8542.39.0001'},url:'https://www.digikey.in/en/products/result?keywords='+encodeURIComponent(mpn),...extra});
const mo=(mpn,maker,desc,stock,breaks,extra={})=>offer({mpn,manufacturer:maker,description:desc,seller:'Mouser',source:'mouser',stock,priceUsd:breaks[0][1],breaksUsd:breaks.map(([qty,price])=>({qty,price})),
 compliance:{rohs:'RoHS Compliant',hts:extra.hts||'8542390001'},url:'https://www.mouser.in/c/?q='+encodeURIComponent(mpn),...extra});

const PARTS=[
 {mpn:'STM32G431CBT6',manufacturer:'STMicroelectronics',description:'ARM Cortex-M4 MCU, 170 MHz, 128 KB flash, motor-control timers',package:'LQFP-48',type:'ic',refs:['U1'],qty:1,
  offers:[dk('STM32G431CBT6','STMicroelectronics','IC MCU 32BIT 128KB FLASH 48LQFP',3410,[[1,4.86],[10,4.37],[100,3.62],[250,3.44]]),mo('STM32G431CBT6','STMicroelectronics','ARM Microcontrollers - MCU Mainstream Arm Cortex-M4',2120,[[1,4.91],[10,4.41],[100,3.66],[250,3.47]])]},
 {mpn:'DRV8323RSRGZR',manufacturer:'Texas Instruments',description:'Three-phase smart gate driver with buck regulator and current-sense amplifiers',package:'VQFN-48',type:'ic',refs:['U2'],qty:1,
  offers:[dk('DRV8323RSRGZR','Texas Instruments','IC MOTOR DRIVER 6V-60V 48VQFN',212,[[1,6.28],[10,5.64],[100,4.71],[250,4.48]],{factoryLeadDays:126}),mo('DRV8323RSRGZR','Texas Instruments','Gate Drivers 65-V max 3-phase smart gate driver',96,[[1,6.35],[10,5.71],[100,4.77]],{factoryLeadDays:126})],
  manualOffers:[{id:'demo-ems-1',mpn:'DRV8323RSRGZR',manufacturer:'Texas Instruments',seller:'EMS Surplus Pvt Ltd',source:'manual',marketType:'ems-excess',authorized:false,condition:'New, sealed reel',stock:1500,
   priceOriginal:330,currencyOriginal:'INR',moq:500,dateCode:'2533',coc:true,contact:'sales@example.com',note:'Excess from a cancelled build, factory sealed'}]},
 {mpn:'CSD18540Q5B',manufacturer:'Texas Instruments',description:'60 V N-channel NexFET power MOSFET, 1.8 mΩ',package:'VSON-CLIP-8',type:'transistor',refs:['Q1','Q2','Q3','Q4','Q5','Q6'],qty:6,
  offers:[dk('CSD18540Q5B','Texas Instruments','MOSFET N-CH 60V 100A 8VSON',18450,[[1,1.92],[10,1.58],[100,1.21],[1000,0.98]],{hts:'8541.29.0095'}),mo('CSD18540Q5B','Texas Instruments','MOSFETs 60-V N channel NexFET',9800,[[1,1.95],[10,1.61],[100,1.24],[1000,1.01]],{hts:'8541290095'})]},
 {mpn:'LM358DR',manufacturer:'Texas Instruments',description:'Dual general-purpose operational amplifier',package:'SOIC-8',type:'ic',refs:['U3','U4'],qty:2,
  offers:[dk('LM358DR','Texas Instruments','IC OPAMP GP 2 CIRCUIT 8SOIC',96200,[[1,0.42],[10,0.29],[100,0.17],[1000,0.11]]),mo('LM358DR','Texas Instruments','Operational Amplifiers - Op Amps Dual Op Amp',61500,[[1,0.43],[10,0.3],[100,0.18],[1000,0.12]]),
   offer({mpn:'LM358DR',seller:'Aion FX',source:'serpapi',marketType:'marketplace',authorized:false,condition:null,stock:null,priceUsd:0.03,breaksUsd:[],title:'LM358 dual op amp IC SOP-8 (10 pcs)',url:'https://www.google.com/search?tbm=shop&q=LM358DR',lifecycle:null})]},
 {mpn:'GRM188R71H104KA93D',manufacturer:'Murata',description:'100 nF 50 V X7R 0603 ceramic capacitor',package:'0603',type:'capacitor',refs:Array.from({length:24},(_,i)=>'C'+(i+1)),qty:24,
  offers:[dk('GRM188R71H104KA93D','Murata Electronics','CAP CER 0.1UF 50V X7R 0603',2840000,[[1,0.1],[10,0.035],[100,0.0151],[4000,0.0068]],{hts:'8532.24.0020'}),mo('GRM188R71H104KA93D','Murata','Multilayer Ceramic Capacitors MLCC 0.1uF 50V',1260000,[[1,0.1],[10,0.036],[100,0.016],[4000,0.0071]],{hts:'8532240020'})]},
 {mpn:'RC0603FR-0710KL',manufacturer:'YAGEO',description:'10 kΩ ±1% 0.1 W 0603 thick-film resistor',package:'0603',type:'resistor',refs:Array.from({length:18},(_,i)=>'R'+(i+1)),qty:18,
  offers:[dk('RC0603FR-0710KL','YAGEO','RES 10K OHM 1% 1/10W 0603',9100000,[[1,0.1],[10,0.016],[100,0.0071],[5000,0.0021]],{hts:'8533.21.0030'}),mo('RC0603FR-0710KL','YAGEO','Thick Film Resistors - SMD 10K ohm 1%',3500000,[[1,0.1],[10,0.017],[100,0.0074],[5000,0.0023]],{hts:'8533210030'})]},
 {mpn:'EEE-FK1V471P',manufacturer:'Panasonic',description:'470 µF 35 V aluminium electrolytic, SMD can 10 × 10.2 mm',package:'SMD can 10x10.2',type:'capacitor',refs:['C25','C26'],qty:2,
  offers:[dk('EEE-FK1V471P','Panasonic Electronic Components','CAP ALUM 470UF 20% 35V SMD',7400,[[1,0.98],[10,0.79],[100,0.58],[500,0.49]],{hts:'8532.22.0085'}),mo('EEE-FK1V471P','Panasonic','Aluminum Electrolytic Capacitors - SMD 35V 470uF',3150,[[1,1.01],[10,0.82],[100,0.6]],{hts:'8532220085'})]},
 {mpn:'MAX485CPA+',manufacturer:'Analog Devices',description:'RS-485 transceiver, 2.5 Mbps, through-hole',package:'PDIP-8',type:'ic',refs:['U5'],qty:1,lifecycle:'Obsolete',
  offers:[dk('MAX485CPA+','Analog Devices / Maxim Integrated','IC TRANSCEIVER HALF 1/1 8DIP',140,[[1,4.12],[10,3.74]],{lifecycle:'Obsolete',discontinued:true,suggestedReplacement:'MAX485ECPA+',factoryLeadDays:null})]},
 {mpn:'NCV8720BMT330TBG',manufacturer:'onsemi',description:'3.3 V 300 mA low-dropout regulator',package:'WDFN-6',type:'ic',refs:['U6'],qty:1,
  offers:[dk('NCV8720BMT330TBG','onsemi','IC REG LINEAR 3.3V 300MA 6WDFN',22100,[[1,0.46],[10,0.36],[100,0.24],[1000,0.17]]),mo('NCV8720BMT330TBG','onsemi','LDO Voltage Regulators 3.3V 300mA',8700,[[1,0.48],[10,0.37],[100,0.25]])]}];

// The sample Gerber set shipped in public/samples (100 x 67 mm, 2 layers) is the demo's bare board.
export const DEMO_GERBER='/samples/sample-gerber.zip';

export function demoBomState(now=Date.now()){
 const at=new Date(now-2*36e5).toISOString(),market=new Date(now-36e5).toISOString();
 const rows=PARTS.map((p,i)=>({id:'demo-'+i,source:'auto',margin:null,fetchedAt:at,marketAt:market,marketStatus:'ok',providers:['DigiKey','Mouser'],image:null,lifecycle:p.lifecycle||'Active',manualOffers:[],...p}));
 return {demo:true,project:'Demo · Motor controller MC-200 rev B',from:'',boards:250,margin:18,method:'markup',rows,pricedAt:at,
  pcb:{material:'fr4',choice:'',widthMm:100,heightMm:67,layers:2,spec:{finish:'enig',color:'blue'},gerber:{name:'sample-gerber.zip',widthMm:100,heightMm:67,layers:2,hits:14,slots:0,minHoleMm:.4,outline:true,mask:true,silk:true,files:8,warnings:[]},unit:{v:1.85,c:'USD'},margin:12,vendor:'JLCPCB'},
  shipping:{deliveryCost:{v:1800,c:'INR'},note:'Courier to customer, Pune',free:false,charge:null},
  supplierRules:{DigiKey:{flat:{v:20,c:'USD'},freeAbove:{v:100,c:'USD'}},Mouser:{flat:{v:20,c:'USD'},freeAbove:{v:100,c:'USD'}}},
  cart:[],bids:[],shopping:false,cols:{},sort:{key:'',dir:1},history:{},hikes:{three:3,nine:9},purchases:{},createdAt:new Date(now-3*day).toISOString()}}

// The tour's steps: chapter, icon (a lucide name, drawn by BomTour), the data-tour target to spotlight,
// the card text, and act(actions) to put the BOM tool in the state the step shows.
export const BOM_STEPS=[
 {ch:'Start',icon:'Sparkles',target:'bom-steps',title:'A full BOM, ready to explore',text:'This demo loads a priced motor-controller BOM with nine real parts, a bare PCB from its Gerber files and shipping. Your own BOM is set aside and comes back when the demo ends.',act:a=>a.step(1)},
 {ch:'Components',icon:'Gauge',target:'bom-summary',title:'The BOM at a glance',text:'Project, number of lines, how many part numbers matched a distributor, production quantity, BoM cost and parts at risk, in one line.'},
 {ch:'Components',icon:'Upload',target:'bom-cta',title:'Bring in a BOM',text:'Upload an Excel or CSV BoM, or load the parts of a board from the Board studio. Add all to list puts every priced line on the purchase list.'},
 {ch:'Components',icon:'Table2',target:'bom-grid',title:'Every line analysed',text:'A drawing of each part, its brand and stock, four scores from 0 to 100 (resilience, quality, economics, sustainability), the unit price and one action. Click a column to sort.'},
 {ch:'Components',icon:'TriangleAlert',target:'bom-risk',title:'Parts at risk',text:'Lines that are end of life or short of stock are tagged. Hover the tag for the reasons: here the RS-485 transceiver is obsolete and the gate driver has thin stock.'},
 {ch:'Components',icon:'IndianRupee',target:'currency',title:'Rupees or dollars',text:'Every price on the site switches between INR and USD at the live rate, shown with its source and time under the BOM.'},
 {ch:'Part detail',icon:'Cpu',target:'ov-cards',title:'Open any part',text:'Clicking a line opens its overview: general data, availability across distributors, lifecycle and compliance (RoHS, REACH, certificate, HS code).',act:a=>a.openRow('demo-1')},
 {ch:'Part detail',icon:'Trophy',target:'ov-best',title:'Best to get',text:'The offer to buy for this quantity, weighing price, stock and how certain the offer is. One click makes it the BOM line\'s supplier.'},
 {ch:'Part detail',icon:'Store',target:'ov-offers',title:'Every market price',text:'Distributors, Google Shopping listings and excess stock, each with every price break, lead time, date code and an uncertainty score. Bid on excess stock or chat with the seller.'},
 {ch:'Purchase list',icon:'ClipboardList',target:'bom-list',title:'A purchase list, not a cart',text:'Add all to list grouped every priced line by supplier, ready to download as a CSV for each supplier\'s BoM upload. Nothing is ordered from here.',act:a=>{a.closeRow();a.addAll()}},
 {ch:'Bare PCB',icon:'CircuitBoard',target:'pcb-gerber',title:'The bare board from its Gerber',text:'Upload the Gerber ZIP, or load the BOM from a board imported as Gerber and it comes along by itself. The board is drawn in 2D, top or bottom, and its size and layers fill the form.',act:a=>a.step(0)},
 {ch:'Bare PCB',icon:'SlidersHorizontal',target:'pcb-options',title:'The fab\'s quote form',text:'Thickness, mask colour, finish, copper, vias and the rest, limited to what each material allows. The drawing follows the colours you pick: this board is blue with ENIG.'},
 {ch:'Bare PCB',icon:'Receipt',target:'pcb-charges',title:'Charge details',text:'An itemised estimate with the build time, until you enter the fab\'s real price per board.'},
 {ch:'Quote',icon:'Calculator',target:'bom-totals',title:'Totals and profit',text:'Component and PCB cost, selling subtotal, supplier shipping, delivery, customer total and net profit, each shipping cost counted once.',act:a=>a.step(3)},
 {ch:'Quote',icon:'FileText',target:'bom-quote',title:'Quotation PDF',text:'A customer quote in INR or USD with the full board spec. Your costs, suppliers and profit never appear on it.'},
 {ch:'Finish',icon:'CheckCircle2',target:null,title:'That\'s the BOM tool',text:'Finish to bring back your own BOM. Watch this demo again any time from the BOM tool or from Help.'}];
