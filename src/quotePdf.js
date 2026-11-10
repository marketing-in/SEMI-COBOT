// Customer quotation with grouped selling amounts and planning ranges.
// Amounts print with the currency code because the standard PDF fonts have no rupee sign.

const COPPER=[176,96,46],INK=[34,33,30],MUTED=[110,108,102],RULE=[214,210,200];

export async function quotePdf(q){
 const {jsPDF}=await import('jspdf');const mod=await import('jspdf-autotable');const autoTable=mod.autoTable||mod.default;
 const doc=new jsPDF({unit:'mm',format:'a4'}),W=doc.internal.pageSize.getWidth(),M=16;
 const conv=usd=>q.currency==='INR'?usd*q.inrPerUsd:usd;
 const cents=v=>Math.round(conv(v)*100);
 const cur=v=>q.currency+' '+new Intl.NumberFormat(q.currency==='INR'?'en-IN':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v/100);
 const text=(s,x,y,o={})=>{doc.setFont('helvetica',o.bold?'bold':'normal');doc.setFontSize(o.size||9);doc.setTextColor(...(o.color||INK));doc.text(String(s??''),x,y,o.align?{align:o.align}:undefined)};
 // Header: who quotes (left), the document and its numbers (right).
 text(q.from.company||'Your company',M,20,{bold:true,size:15});
 let y=26;for(const line of String(q.from.address||'').split(/\n/).filter(Boolean).slice(0,4)){text(line,M,y,{color:MUTED});y+=4.4}
 if(q.from.contact){text(q.from.contact,M,y,{color:MUTED});y+=4.4}
 text('QUOTATION',W-M,20,{bold:true,size:16,color:COPPER,align:'right'});
 [['Quote no.',q.number],['Date',q.date],['Valid until',q.validUntil]].forEach(([k,v],i)=>{text(k,W-M-43,28+i*5,{color:MUTED});text(v,W-M,28+i*5,{align:'right',bold:true})});
 y=Math.max(y,44)+4;doc.setDrawColor(...RULE);doc.line(M,y,W-M,y);y+=7;
 text('Prepared for',M,y,{color:MUTED,size:8});text(q.to.customer||'Customer',M,y+5,{bold:true,size:11});if(q.to.contact)text(q.to.contact,M,y+10,{color:MUTED});
 text('Scope',W/2+4,y,{color:MUTED,size:8});text(q.scope,W/2+4,y+5,{bold:true,size:10});text(`${q.boards.toLocaleString('en-IN')} board${q.boards===1?'':'s'}`,W/2+4,y+10,{color:MUTED});
 y+=18;
 const pending=q.totals.missing||0,comp=cents(q.totals.componentsSell);
 const pcb=q.pcb&&!q.pcb.onRequest?cents(q.pcb.amount):0,box=q.enclosure&&!q.enclosure.onRequest?cents(q.enclosure.amount):0;
 const body=[];
 if(q.componentLines)body.push(['Component package',`${q.componentLines-pending} priced line(s)${pending?`; ${pending} pending`:''}`,pending>=q.componentLines?'Price on request':cur(comp)]);
 if(q.pcb)body.push(['Bare PCB',q.pcb.label,q.pcb.onRequest?'Price on request':cur(pcb)]);
 if(q.enclosure)body.push(['Enclosure',q.enclosure.label,q.enclosure.onRequest?'Price on request':cur(box)]);
 const ship=q.shipping||{free:false,amount:0},shipNote=ship.free?'Free shipping'+(ship.note?' ('+ship.note+')':''):(ship.note||'Freight and packing');
 const shipAmt=ship.free||ship.tbc?0:cents(ship.amount||0),total=comp+pcb+box+shipAmt;
 body.push(['Shipping',shipNote,ship.free?'Free':ship.tbc?'To be confirmed':cur(shipAmt)]);
 autoTable(doc,{startY:y,margin:{left:M,right:M},head:[['Scope','Description',`Amount (${q.currency})`]],body,
  styles:{font:'helvetica',fontSize:8,textColor:INK,cellPadding:{top:1.8,bottom:1.8,left:2,right:2},lineColor:RULE,lineWidth:.1},
  headStyles:{fillColor:[244,241,234],textColor:INK,fontStyle:'bold'},alternateRowStyles:{fillColor:[251,250,247]},
  columnStyles:{0:{cellWidth:41,fontStyle:'bold'},2:{cellWidth:42,halign:'right'}},
  didDrawPage:()=>{const H=doc.internal.pageSize.getHeight();text(`${q.from.company||''}  ·  ${q.number}`,M,H-8,{size:7,color:MUTED});text(`Page ${doc.internal.getNumberOfPages()}`,W-M,H-8,{size:7,color:MUTED,align:'right'})}});
 // Totals, right-aligned under the table.
 y=doc.lastAutoTable.finalY+9;const H=doc.internal.pageSize.getHeight();if(y>H-70){doc.addPage();y=24}
 text('Pricing outlook',M,y,{bold:true,size:11,color:COPPER});y+=7;
 text('Current total',M,y,{bold:true,size:11});text(cur(total),W-M,y,{bold:true,size:11,align:'right'});y+=6;
 text('Per build unit',M,y,{color:MUTED});text(cur(q.boards?Math.round(total/q.boards):0),W-M,y,{align:'right',color:MUTED});y+=6;
 for(const r of q.ranges||[]){
  text(`In ${r.days} days (estimate)`,M,y,{color:MUTED});
  text(cur(total+cents(r.low-q.totals.customerTotal))+' - '+cur(total+cents(r.high-q.totals.customerTotal)),W-M,y,{align:'right'});y+=6;
 }
 y+=5;
 // Terms.
 text('Terms',M,y,{bold:true,size:9});y+=5;
 const terms=[`Quote valid until ${q.validUntil}, subject to stock and price confirmation at order. ${q.priced?'Oldest displayed supplier check: '+q.priced+'.':''}`,
  q.ranges?.length?'The 3-day and 9-day ranges are planning estimates for the priced scope. They vary component prices while keeping board, enclosure and shipping charges fixed.':'',
  q.currency==='INR'?`Prices in INR, converted at 1 USD = INR ${q.inrPerUsd.toFixed(2)}${q.rateSource?` (${q.rateSource}${q.rateTime?', rate of '+q.rateTime:''})`:''}.`:'Prices in US dollars.',
  ship.free?'Shipping is free of charge.':ship.tbc?'Shipping charges will be confirmed with the order.':'',
  pending||q.pcb?.onRequest||q.enclosure?.onRequest?'Pending scope and items marked "Price on request" are excluded from the total.':'',
  ...String(q.notes||'').split(/\n/).filter(Boolean)].filter(Boolean);
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...MUTED);
 for(const t of terms){const wrapped=doc.splitTextToSize(t,W-2*M);if(y+wrapped.length*4>H-14){doc.addPage();y=24}doc.text(wrapped,M,y);y+=wrapped.length*4+1.5}
 return doc.output('blob');
}

export function quoteNumber(date=new Date()){const d=date.toISOString().slice(0,10).replace(/-/g,'');return 'Q-'+d+'-'+String(Math.floor(Math.random()*900)+100)}
