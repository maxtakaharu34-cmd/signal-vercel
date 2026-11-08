import {metrics} from './lib/analytics.mjs';

// Context is calculated only from the shared synthetic OHLC. It is not a
// probability, a market feed, or another name for the administrator's signal.
export function marketContext(rows){
 if(!rows?.length)return null;
 const last=rows.at(-1),calc=metrics(rows),atr=calc.atr??0;
 const horizons=[8,24,60].map((period,i)=>{
  if(rows.length<=period)return {period,label:['短期','中期','長期'][i],direction:null,change:null};
  const reference=rows.at(-period-1).close,delta=last.close-reference;
  const threshold=Math.max(last.close*1e-8,atr*Math.sqrt(period)*.18);
  return {period,label:['短期','中期','長期'][i],direction:Math.abs(delta)<=threshold?0:Math.sign(delta),change:delta/reference*100};
 });
 const directional=horizons.filter(h=>h.direction!==null&&h.direction!==0),sides=new Set(directional.map(h=>h.direction));
 const agreement=sides.size>1?'期間ごとに方向が分かれています':sides.size===1?directional.length===3?'3期間の方向が一致':'一部の期間に方向感':'方向感が弱い状態';
 const trueRanges=rows.map((r,i)=>Math.max(r.high-r.low,i?Math.abs(r.high-rows[i-1].close):0,i?Math.abs(r.low-rows[i-1].close):0));
 const average=a=>a.length?a.reduce((sum,n)=>sum+n,0)/a.length:0;
 const recent=average(trueRanges.slice(-8)),base=average(trueRanges.slice(-32,-8));
 const volatilityRatio=base>0?recent/base:null;
 const volatility=volatilityRatio===null?'比較不可':volatilityRatio>1.3?'変動拡大':volatilityRatio<.7?'変動縮小':'通常範囲';
 const range=last.high-last.low,body=Math.abs(last.close-last.open),upper=last.high-Math.max(last.open,last.close),lower=Math.min(last.open,last.close)-last.low;
 const shape=range<=last.close*1e-10||body/range<.15?'小さな実体':upper/range>.55?'上ヒゲ優勢':lower/range>.55?'下ヒゲ優勢':body/range>.7?'実体優勢':'上下にヒゲ';
 const status=(value,threshold=0)=>Math.abs(value)<=threshold?0:Math.sign(value);
 const references=[
  {label:'SMA 20',direction:calc.sma===null?null:status(last.close-calc.sma,atr*.1),description:'終値と20本平均'},
  {label:'MACD',direction:status(calc.macd-calc.macdSignal,atr*.03),description:'MACDとシグナル線'},
  {label:'RSI 14',direction:calc.rsi===null?null:calc.rsi>55?1:calc.rsi<45?-1:0,description:'55超は上向き、45未満は下向き'}
 ];
 return {horizons,agreement,volatility,volatilityRatio,shape,bodyRatio:range>0?body/range:0,atrPercent:last.close?atr/last.close*100:0,references};
}
