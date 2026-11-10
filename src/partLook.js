// How a component looks, from its package, type and value: the drawing family for PartImage.jsx, a
// resistor's value from its value text or part number, its SMD marking and its colour bands.
// Resistance in ohms from a value or part number: "10k", "4K7", "10 kΩ", "RC0603FR-0710KL", "CRCW060310K0FKEA".
export function ohmsOf(text=''){
 const t=String(text).toUpperCase().replace(/Ω|OHMS?/g,'R');
 const yageo=t.match(/^RC\d{4}[A-Z]{2}-\d{2}(\d+[RKM]\d*)L?$/);const vishay=t.match(/^CRCW\d{4}(\d+[RKM]\d*)/);
 const m=(yageo||vishay)?[0,(yageo||vishay)[1]]:t.match(/(?:^|[^A-Z0-9.])(\d+(?:\.\d+)?[RKM]\d*|\d+(?:\.\d+)?\s?[KM]?R?)(?=$|[^A-Z0-9])/);
 if(!m)return null;const s=m[1].replace(/\s/g,'').replace(/([KM])R$/,'$1');const p=s.match(/^(\d+)(?:\.(\d+))?([RKM])?(\d*)$/);if(!p)return null;
 const mult={R:1,K:1e3,M:1e6}[p[3]||'R'];const v=Number(p[1]+'.'+(p[2]||p[4]||'0'))*mult;return v>0&&v<1e9?v:null;
}
// Three-digit SMD marking (103 = 10 kΩ) and the four colour bands of a through-hole resistor.
export function smdCode(ohms){if(!ohms)return '';if(ohms<10)return String(ohms).replace('.','R');const e=Math.floor(Math.log10(ohms))-1;return String(Math.round(ohms/10**e)).slice(0,2)+e}
const BAND=['#1b1b1b','#7a4a1f','#c8312a','#e07b28','#e3c22e','#3f8f4a','#2c5aa8','#7b4bb0','#8c8c8c','#f2f2f2'];
export function colourBands(ohms){if(!ohms)return [BAND[1],BAND[0],BAND[2],'#c9a35a'];const e=Math.max(0,Math.floor(Math.log10(ohms))-1),d=String(Math.round(ohms/10**e)).padEnd(2,'0');return [BAND[+d[0]],BAND[+d[1]],BAND[Math.min(9,e)],'#c9a35a']}

export function familyOf(p={}){
 const pk=String(p.package||'').toUpperCase(),t=String(p.type||'').toLowerCase(),txt=[p.category,p.description,p.mpn,p.value].join(' ').toUpperCase();
 if(t==='resistor'||/RESISTOR|^RC\d{4}|^CRCW|^ERJ/.test(txt)&&!/IC |MCU|REGULATOR/.test(txt))return /AXIAL|THT|DIP|MF\b|CFR/.test(pk+' '+txt)?'axialR':'chipR';
 if(t==='capacitor'||/CAPACITOR|^GRM|^CL\d{2}|^C\d{4}/.test(txt)){if(/TANT/.test(pk+txt))return 'tantalum';if(/RADIAL|ELEC|CP\b|ALUM|ELECTROLYTIC|\d+\s?[UΜ]F.*\d+\s?V/.test(pk+' '+txt)&&!/X7R|X5R|C0G|NP0|CERAMIC|\b0[2-8]0[1-5]\b/.test(pk+' '+txt))return 'electrolytic';return 'chipC'}
 if(/QFP|LQFP|TQFP/.test(pk))return 'qfp';if(/QFN|DFN|BGA|LGA|SON|MLF|CSP/.test(pk))return 'qfn';
 if(/DIP|PDIP/.test(pk))return 'dip';if(/SOIC|SOP|SSOP|TSSOP|MSOP|SO-?\d/.test(pk))return 'soic';
 if(/TO-?220|TO-?247|TO-?263|D2PAK|DPAK|TO-?252/.test(pk))return 'to220';if(/TO-?92/.test(pk))return 'to92';
 if(/SOT|SC-?70|SC-?88/.test(pk))return 'sot';
 if(t==='led'||/\bLED\b/.test(txt))return 'led';
 if(t==='diode'||/DIODE|RECTIFIER|SCHOTTKY|ZENER|TVS|SOD|\bSM[ABC]\b|DO-?\d/.test(pk+' '+txt))return /DO-?41|DO-?35|AXIAL/.test(pk)?'axialD':'diode';
 if(t==='crystal'||/CRYSTAL|OSCILLATOR|RESONATOR|HC-?49|\bMHZ\b/.test(txt))return 'crystal';
 if(t==='inductor'||/INDUCTOR|FERRITE|CHOKE/.test(txt))return 'inductor';
 if(t==='connector'||/CONN|USB|HEADER|JACK|SOCKET|TERMINAL|RECEPT/.test(pk+' '+txt))return /USB/.test(pk+txt)?'usb':'header';
 if(/MICROCONTROLLER|MCU|PROCESSOR|FPGA/.test(txt))return 'qfp';
 return 'chip';
}

