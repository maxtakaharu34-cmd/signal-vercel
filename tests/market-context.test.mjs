import test from 'node:test';import assert from 'node:assert/strict';
import {marketContext} from '../web/market-context.mjs';
import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
import {startAutomation,projectScene,signalHistory,signalDiagnostics,simulationTimestamp} from '../web/timeline.mjs';
const rows=change=>Array.from({length:80},(_,i)=>({time:i,open:100+i*change,close:100+i*change,high:101+i*change,low:99+i*change}));
test('three horizons use actual synthetic close changes and distinguish agreement from conflict',()=>{
 const up=marketContext(rows(1));assert.deepEqual(up.horizons.map(h=>h.direction),[1,1,1]);assert.equal(up.agreement,'3期間の方向が一致');
 const mixed=rows(1);for(let i=70;i<80;i++)mixed[i]={...mixed[i],open:170-(i-70)*.5,close:170-(i-70)*.5,high:171-(i-70)*.5,low:169-(i-70)*.5};const c=marketContext(mixed);assert.deepEqual(c.horizons.map(h=>h.direction),[-1,1,1]);assert.match(c.agreement,/分かれ/);
 assert.deepEqual(marketContext(rows(0)).horizons.map(h=>h.direction),[0,0,0]);
});
test('range expansion, zero ranges and insufficient context never fabricate a reading',()=>{
 const data=rows(0);for(let i=72;i<80;i++){data[i].high=108;data[i].low=92}assert.equal(marketContext(data).volatility,'変動拡大');
 const flat=rows(0).map(r=>({...r,high:r.close,low:r.close})),c=marketContext(flat);assert.equal(c.volatilityRatio,null);assert.equal(c.shape,'小さな実体');assert.ok(Number.isFinite(c.atrPercent));assert.ok(marketContext(data.slice(0,5)).horizons.every(h=>h.direction===null));assert.equal(marketContext([]),null);
});
test('price diagnostics match the displayed direction and level; history remains unchanged on reload',()=>{
 const now=100000,record=startAutomation({checkpoint:initialCheckpoint(),signal:DEFAULT_SIGNAL},1,now);
 for(const seconds of [0,3,15,60,321,86400]){const p=projectScene(record,now+seconds*1000),d=signalDiagnostics(p.checkpoint,p.clock.step);assert.ok(Math.abs(d.score)<=1);assert.equal(p.signal.direction,d.direction);assert.equal(p.signal.level,d.level);assert.equal(d.model,2);assert.equal('variation' in d,false);assert.equal(signalHistory(p).at(-1).level,p.signal.level);assert.deepEqual(signalHistory(p),signalHistory(projectScene(p,now+seconds*1000)));assert.ok(signalHistory(p).length<=20)}
 const before=projectScene(record,now+300000),after=projectScene(record,now+303000),a=signalHistory(before),b=signalHistory(after);for(const point of a){const next=b.find(p=>p.step===point.step);if(next)assert.deepEqual(next,point)}
 assert.deepEqual(signalHistory({checkpoint:initialCheckpoint()}),[]);
});

test('axis times reflect the actual simulation anchor and speed without inventing older timestamps',()=>{
 const now=Date.parse('2026-11-08T08:00:00Z'),r=startAutomation({checkpoint:initialCheckpoint(),signal:DEFAULT_SIGNAL},0,now);r.checkpoint.config.speed=2;const origin=r.checkpoint.automation.originTime;
 assert.equal(simulationTimestamp(r.checkpoint,origin+4),'2026-11-08T08:00:02.000Z');assert.equal(simulationTimestamp(r.checkpoint,origin-1),null);assert.equal(simulationTimestamp(initialCheckpoint(),50),null);
});
