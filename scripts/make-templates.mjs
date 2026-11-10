// Generates the downloadable templates in public/samples: a pick-and-place CSV and a picture
// blueprint PDF (hand-built, with a real text layer so labels attach to the drawn outlines).
import {writeFileSync} from 'node:fs';

const csv=`# semi-cobot placement template. One row per component, positions in millimetres from the board's bottom-left corner.
# Ref = reference designator, Val = value or manufacturer part number, Package = footprint/package name, Rot = rotation in degrees (counter-clockwise), Side = top or bottom.
Ref,Val,Package,PosX,PosY,Rot,Side
U1,STM32F407VGT6,LQFP-100_14x14mm,50.000,33.000,0,top
U2,LM1117MPX-3.3,SOT-223,18.000,20.000,90,top
D1,SS14,SMA,18.000,42.000,0,top
C1,100nF,0603,32.000,10.000,0,top
R1,10k,0603,32.000,58.000,0,top
J1,USB4110-GF-A,USB_C_Receptacle,5.000,33.000,90,top
`;
writeFileSync('public/samples/template-placement.csv',csv);

// --- Picture blueprint template (A4 landscape, points) -------------------------------------------
const esc=s=>s.replace(/[\\()]/g,m=>'\\'+m);
const ops=[];
ops.push('0.07 0.22 0.52 rg 0 0 842 595 re f');            // blueprint background
ops.push('1 1 1 RG 2 w 50 50 742 495 re S');               // board outline
const text=(s,x,y,size=11)=>ops.push(`BT /F1 ${size} Tf 1 1 1 rg ${x} ${y} Td (${esc(s)}) Tj ET`);
const outline=(x,y,w,h)=>ops.push(`1 1 1 RG 1.5 w ${x} ${y} ${w} ${h} re S`);
const filled=(x,y,w,h)=>ops.push(`1 1 1 rg ${x} ${y} ${w} ${h} re f`);
text('PICTURE BLUEPRINT TEMPLATE  -  draw every component as a closed outline and write its name right next to it',60,562,13);
text('Board outline: one big rectangle. Set the real board width in millimetres when you import this page.',60,546,9);
outline(330,290,130,130);text('Main controller IC (U1)',330,278);
outline(90,430,300,22);text('DIMM memory slot (J1)',90,458);
outline(560,430,140,22);text('Front panel header (J2)',560,458);
outline(120,300,44,22);text('Schottky diode SS14 (D1)',120,328);
for(let i=0;i<4;i++)filled(500+i*24,320,16,16);text('Capacitors 100nF (C1-C4)',500,344);
outline(200,190,32,32);text('VRM MOSFET (Q1)',200,228);
outline(500,200,34,22);text('Crystal 8 MHz (Y1)',500,228);
outline(600,290,44,44);text('Choke / inductor (L1)',600,340);
outline(735,240,40,64);text('USB connector (J3)',690,310);
filled(700,150,12,12);text('Status LED (LED1)',690,170);
outline(300,120,120,40);text('Voltage regulator LM1117 (U2)',300,166);
text('Tip: labels closer than about one tenth of the page to an outline are attached automatically. Part numbers in labels (SS14, LM1117) link to inventory.',60,62,9);
const stream=ops.join('\n');
const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
 `<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n${stream}\nendstream`,
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
 '<< /Title (semi-cobot picture blueprint template) /Producer (semi-cobot) >>',
];
let pdf='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[];
objects.forEach((body,i)=>{offsets.push(Buffer.byteLength(pdf,'latin1'));pdf+=`${i+1} 0 obj\n${body}\nendobj\n`});
const xref=Buffer.byteLength(pdf,'latin1');
pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync('public/samples/template-picture-blueprint.pdf',Buffer.from(pdf,'latin1'));
console.log('templates written: template-placement.csv, template-picture-blueprint.pdf');
