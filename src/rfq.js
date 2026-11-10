// One-click request for quotation: a mail to the supplier, written out with the part numbers,
// manufacturers, quantities, references, the wanted delivery date and the sender's company. It opens in
// the user's own mail program (mailto), so nothing is sent until they press Send. The To address is the
// supplier's quote email or contact from the Vendors page; when none is known the mail opens without one.
import {vendorsOf,loadVendorData} from './vendors.js';

export const emailOf=text=>(String(text||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[''])[0];
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');

// The supplier's email from the Vendors page: its quote email, or an address in its contact or notes.
export function vendorEmail(seller,data=loadVendorData()){
 const k=norm(seller);if(!k)return '';
 const list=vendorsOf(null,data);
 // Exact name first, then one name starting with the other ("DigiKey" and "Digi-Key Electronics").
 const v=list.find(x=>norm(x.name)===k)||list.find(x=>{const n=norm(x.name);return n.length>=4&&k.length>=4&&(n.startsWith(k)||k.startsWith(n))})||null;
 return v?emailOf(v.email)||emailOf(v.contact)||emailOf(v.notes):'';
}

const MAX=1800;// mail programs cut long mailto links; the rest is summarised
export function rfqMail({seller,to='',lines=[],project='',due='',from={},boards=null,date=new Date()}){
 const day=date.toISOString().slice(0,10);
 const subject=`Request for quotation${project?` – ${project}`:''} – ${lines.length} part${lines.length===1?'':'s'}`;
 const head=[`Dear ${seller||'Sales'} team,`,'',`Please quote the parts below${due?`, for delivery by ${due}`:''}. Kindly state the unit price at the quantity asked, price breaks, stock, lead time, MOQ, date code and the validity of the offer.`,
  project?`Project: ${project}${boards?` (${boards} boards)`:''}`:'',''].filter((x,i)=>x!==''||i<3);
 const rows=lines.map((l,i)=>`${i+1}. ${l.mpn}${l.manufacturer?` (${l.manufacturer})`:''} – quantity ${Math.max(1,Math.round(+l.qty||0)).toLocaleString('en-IN')}${l.refs?.length?` – ref ${[].concat(l.refs).slice(0,8).join(' ')}`:''}`);
 const sign=['','Thank you.','',from.contact||'',from.company||'',from.address||'',`Sent ${day}`].filter((x,i,a)=>x!==''||a[i-1]!=='');
 let body=[...head,...rows,...sign].join('\n');
 const href=b=>`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
 if(href(body).length>MAX){let n=rows.length;while(n>1&&href([...head,...rows.slice(0,n),`… and ${rows.length-n} more parts (list to follow).`,...sign].join('\n')).length>MAX)n--;
  body=[...head,...rows.slice(0,n),`… and ${rows.length-n} more parts (list to follow).`,...sign].join('\n')}
 return {to,subject,body,href:href(body)};
}
