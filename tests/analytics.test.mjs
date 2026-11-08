import test from 'node:test';import assert from 'node:assert/strict';import {sma,ema,rma,metrics} from '../web/lib/analytics.mjs';
const flat=Array.from({length:40},(_,time)=>({time,open:100,high:101,low:99,close:100}));
test('SMA requires enough samples and averages exact windows',()=>assert.deepEqual(sma([1,2,3,4,5],3),[null,null,2,3,4]));
test('EMA leaves a constant series unchanged',()=>assert.deepEqual(ema([100,100,100],20),[100,100,100]));
test('flat market has neutral RSI, zero MACD and zero band width',()=>{const m=metrics(flat);assert.equal(m.rsi,50);assert.equal(m.macd,0);assert.equal(m.macdSignal,0);assert.equal(m.sma,100);assert.equal(m.ema,100);assert.equal(m.band.upper,100);assert.equal(m.band.lower,100);assert.equal(m.atr,2)});
test('RSI responds to strictly rising and falling candles',()=>{const rising=flat.map((r,i)=>({...r,close:100+i})),falling=flat.map((r,i)=>({...r,close:100-i}));assert.equal(metrics(rising).rsi,100);assert.equal(metrics(falling).rsi,0)});
test('short input keeps unavailable rolling indicators empty',()=>{const m=metrics(flat.slice(0,3));assert.equal(m.sma,null);assert.equal(m.rsi,null);assert.equal(m.atr,null);assert.equal(m.band,null)});
test('indicator calculation never mutates candle history',()=>{const before=structuredClone(flat);metrics(flat);assert.deepEqual(flat,before)});

test('Wilder RSI retains smoothed gains across consecutive reversals',()=>{const closes=[...Array.from({length:15},(_,i)=>100+i),113,112],rows=closes.map((close,time)=>({time,open:close,high:close+1,low:close-1,close}));assert.ok(Math.abs(metrics(rows).rsi-86.22448979591837)<1e-10)});
test('RMA warmup and ATR decay follow Wilder rather than a rolling simple mean',()=>{assert.deepEqual(rma([2,2,2,8,2],3),[null,null,2,4,10/3]);const rows=Array.from({length:16},(_,time)=>({time,open:100,close:100,high:time===14?107:101,low:time===14?93:99}));assert.ok(Math.abs(metrics(rows).atr-548/196)<1e-10)});
