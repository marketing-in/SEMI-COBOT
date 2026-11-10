import React,{createContext,useContext,useMemo} from 'react';
import {formatMoney,convert,toUsd,FALLBACK_INR_PER_USD} from './money.js';

// The display currency (INR or USD) and the rate behind it, shared by every page that shows money.
export const CurrencyContext=createContext({currency:'USD',inrPerUsd:FALLBACK_INR_PER_USD,source:'',updated:null,setCurrency(){}});

export function useMoney(){
 const c=useContext(CurrencyContext);
 return useMemo(()=>({...c,
  fmt:(usd,o)=>formatMoney(usd,c.currency,c.inrPerUsd,o),
  value:usd=>convert(usd,c.currency,c.inrPerUsd),
  fromInput:v=>toUsd(+v||0,c.currency,c.inrPerUsd),
  // Short form for charts and tiles: ₹4.2L, ₹1.3Cr, $12k.
  compact:usd=>{const v=convert(+usd||0,c.currency,c.inrPerUsd),a=Math.abs(v),s=v<0?'−':'',sym=c.currency==='INR'?'₹':'$';
   if(c.currency==='INR'){if(a>=1e7)return s+sym+(a/1e7).toFixed(a>=1e8?0:1)+'Cr';if(a>=1e5)return s+sym+(a/1e5).toFixed(a>=1e6?0:1)+'L'}
   if(a>=1e3)return s+sym+(a/1e3).toFixed(a>=1e4?0:1)+'k';return s+sym+a.toFixed(0)},
  symbol:c.currency==='INR'?'₹':'$'}),[c]);
}
