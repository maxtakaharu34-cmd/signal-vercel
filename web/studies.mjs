import {ema,rma} from './lib/analytics.mjs';

// Use the same seeded EMA and Wilder averages as the numeric indicator table.
// All periods are synthetic candles, never real-market minutes.
export function studySeries(rows){
 const close=rows.map(row=>row.close),changes=close.slice(1).map((value,i)=>value-close[i]);
 const gains=rma(changes.map(value=>Math.max(0,value)),14),losses=rma(changes.map(value=>Math.max(0,-value)),14);
 const fast=ema(close,12),slow=ema(close,26),macd=fast.map((value,i)=>value-slow[i]),signal=ema(macd,9);
 return rows.map((row,i)=>{const gain=gains[i-1],loss=losses[i-1];return {time:row.time,rsi:i<14?null:gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss),macd:macd[i],signal:signal[i],histogram:macd[i]-signal[i]}});
}

export function studySvg(series,{kind='rsi',count=36,width=960,height=92,hover=null}={}){
 const data=series.slice(-count);if(!data.length)return '';
 const right=width-80,step=(right-30)/data.length,x=i=>22+i*step,top=8,bottom=height-10;
 const extent=Math.max(.000001,...data.flatMap(row=>[Math.abs(row.macd),Math.abs(row.signal),Math.abs(row.histogram)]))*1.12;
 const y=value=>kind==='rsi'?top+(100-value)/100*(bottom-top):top+(extent-value)/(extent*2)*(bottom-top);
 const fmt=value=>kind==='rsi'?String(value):Number(value).toFixed(3);
 let svg=kind==='rsi'?`<rect x="8" y="${y(70)}" width="${right-8}" height="${y(30)-y(70)}" fill="#f4f6fb"/>`:'';
 for(const value of kind==='rsi'?[70,50,30]:[extent,0,-extent])svg+=`<line x1="8" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="#dce3ec" stroke-dasharray="3 4"/><text x="${width-66}" y="${y(value)+4}" fill="var(--chart-label)" font-family="monospace" font-size="11">${fmt(value)}</text>`;
 const path=(key,color)=>{let d='';data.forEach((row,i)=>{if(row[key]!==null)d+=(d?'L':'M')+x(i)+' '+y(row[key])+' '});return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/>`};
 if(kind==='rsi')svg+=path('rsi','#7954ac');
 else {data.forEach((row,i)=>{svg+=`<rect x="${x(i)-Math.min(6.4,step*.7)/2}" y="${Math.min(y(0),y(row.histogram))}" width="${Math.min(6.4,step*.7)}" height="${Math.max(.8,Math.abs(y(0)-y(row.histogram)))}" fill="var(--chart-${row.histogram>=0?'up':'down'})" opacity=".85"/>`});svg+=path('macd','#2775bd')+path('signal','#b87921')}
 if(hover!==null&&data[hover])svg+=`<line class="study-crosshair" x1="${x(hover)}" x2="${x(hover)}" y1="0" y2="${height}" stroke="#8798ae" stroke-dasharray="3 4"/>`;
 return svg;
}
