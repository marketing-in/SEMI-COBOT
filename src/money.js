// Money in two currencies. Every price is stored in US dollars (what the supplier APIs and the
// inventory use); INR is shown by converting with the live rate from /api/fx (inrPerUsd).
export const CURRENCIES=['INR','USD'];
export const FALLBACK_INR_PER_USD=83.33;

export const convert=(usd,currency,inrPerUsd=FALLBACK_INR_PER_USD)=>currency==='INR'?usd*inrPerUsd:usd;
export const toUsd=(amount,currency,inrPerUsd=FALLBACK_INR_PER_USD)=>currency==='INR'?amount/inrPerUsd:amount;

// Totals show two decimals; unit prices below one unit keep up to four so a 0.0046 resistor is not 0.00.
// INR uses Indian digit grouping (1,23,456.00).
export function formatMoney(usd,currency='USD',inrPerUsd=FALLBACK_INR_PER_USD,{unit=false}={}){
 const n=Number(usd);if(!Number.isFinite(n))return '—';const v=convert(n,currency,inrPerUsd);
 const max=unit&&Math.abs(v)<1&&v!==0?4:2;
 return new Intl.NumberFormat(currency==='INR'?'en-IN':'en-US',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:max}).format(v);
}
// PDF fonts have no rupee glyph, so documents print the currency code: "INR 1,23,456.00".
export function formatPlain(usd,currency='USD',inrPerUsd=FALLBACK_INR_PER_USD,{unit=false}={}){
 const n=Number(usd);if(!Number.isFinite(n))return '-';const v=convert(n,currency,inrPerUsd);const max=unit&&Math.abs(v)<1&&v!==0?4:2;
 return currency+' '+new Intl.NumberFormat(currency==='INR'?'en-IN':'en-US',{minimumFractionDigits:2,maximumFractionDigits:max}).format(v);
}
