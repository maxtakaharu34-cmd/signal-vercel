const mean=a=>a.length?a.reduce((n,v)=>n+v,0)/a.length:null;
export function sma(values,period){return values.map((_,i)=>i+1<period?null:mean(values.slice(i+1-period,i+1)))}
export function ema(values,period){if(!values.length)return[];const alpha=2/(period+1);let previous=values[0];return values.map((v,i)=>previous=i===0?v:alpha*v+(1-alpha)*previous)}
// Wilder/RMA: seed with an n-sample mean, then alpha = 1/n.
export function rma(values,period){
 let previous=null;return values.map((value,i)=>{if(i+1<period)return null;previous=previous===null?mean(values.slice(0,period)):(previous*(period-1)+value)/period;return previous});
}
export function metrics(rows){
 const close=rows.map(r=>r.close),length=close.length;if(!length)return null;
 const ma=sma(close,20),exp=ema(close,20),fast=ema(close,12),slow=ema(close,26),macd=fast.map((v,i)=>v-slow[i]),signal=ema(macd,9);
 const band=close.map((_,i)=>{if(i<19)return null;const sample=close.slice(i-19,i+1),mid=ma[i],sd=Math.sqrt(mean(sample.map(v=>(v-mid)**2)));return {mid,upper:mid+sd*2,lower:mid-sd*2}});
 let rsi=null;if(length>=15){const changes=close.slice(1).map((v,i)=>v-close[i]),gain=rma(changes.map(v=>Math.max(0,v)),14).at(-1),loss=rma(changes.map(v=>Math.max(0,-v)),14).at(-1);rsi=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss)}
 const tr=rows.map((r,i)=>i===0?r.high-r.low:Math.max(r.high-r.low,Math.abs(r.high-rows[i-1].close),Math.abs(r.low-rows[i-1].close)));
 return {sma:ma.at(-1),ema:exp.at(-1),rsi,macd:macd.at(-1),macdSignal:signal.at(-1),atr:rma(tr,14).at(-1)??null,band:band.at(-1),overlays:{sma:ma,ema:exp,bands:band}};
}
