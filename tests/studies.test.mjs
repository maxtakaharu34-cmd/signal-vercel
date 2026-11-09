import test from 'node:test';
import assert from 'node:assert/strict';
import {studySeries,studySvg} from '../web/studies.mjs';
import {metrics} from '../web/lib/analytics.mjs';
import {initialCheckpoint} from '../web/engine.mjs';
import {chartGeometry} from '../web/render.mjs';

test('RSI warmup and flat, rising and falling reference series use finite Wilder values',()=>{
 const rows=value=>Array.from({length:30},(_,i)=>({time:i,open:value(i),high:value(i),low:value(i),close:value(i)}));
 const flat=studySeries(rows(()=>100));assert.ok(flat.slice(0,14).every(row=>row.rsi===null));assert.ok(flat.slice(14).every(row=>row.rsi===50));assert.ok(flat.every(row=>row.macd===0&&row.signal===0&&row.histogram===0));
 assert.equal(studySeries(rows(i=>100+i)).at(-1).rsi,100);assert.equal(studySeries(rows(i=>100-i)).at(-1).rsi,0);
});
test('historical study points match indicator snapshots at that point and cannot read future candles',()=>{
 const rows=initialCheckpoint().rows,series=studySeries(rows);
 for(const index of [14,20,35,71]){const snapshot=metrics(rows.slice(0,index+1)),point=series[index];assert.equal(point.rsi,snapshot.rsi);assert.equal(point.macd,snapshot.macd);assert.equal(point.signal,snapshot.macdSignal);assert.equal(point.histogram,snapshot.macd-snapshot.macdSignal)}
});
test('study cursor aligns with the selected candle for narrow and wide charts; constant MACD has no invalid geometry',()=>{
 const rows=Array.from({length:72},(_,i)=>({time:i,close:100})),series=studySeries(rows);
 for(const width of [264,358,960])for(const count of [36,72]){const svg=studySvg(series,{kind:'macd',width,count,hover:9}),x=22+9*chartGeometry(width,380,count).step;assert.ok(svg.includes(`class="study-crosshair" x1="${x}"`));assert.doesNotMatch(svg,/NaN|Infinity/)}
});
