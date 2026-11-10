import test from 'node:test';
import assert from 'node:assert/strict';
import {createPriceSignal} from '../web/price-signal.mjs';

test('flat prices and choppy sideways movement do not fabricate strong signals',()=>{
 for(const price of [()=>100,t=>100*Math.exp(.003*Math.sin(t*.5)),t=>100*Math.exp((t%2)*.001)]){
  const signal=createPriceSignal(price);for(let time=0;time<600;time+=3){const value=signal.at(time);assert.equal(value.direction,0);assert.equal(value.levelIndex,0)}
 }
});
test('sustained trends confirm gradually and can remain strong without a forced six-stage cycle',()=>{
 for(const direction of [-1,1]){const signal=createPriceSignal(time=>100*Math.exp(direction*.0003*Math.max(0,time)));
  assert.equal(signal.at(0).direction,0);assert.ok(signal.at(3).levelIndex<5);assert.equal(signal.at(30).direction,direction);assert.equal(signal.at(30).levelIndex,5);
  for(let time=60;time<600;time+=3){assert.equal(signal.at(time).direction,direction);assert.equal(signal.at(time).levelIndex,5)}
 }
});
test('an isolated jump and a one-candle counter-spike do not masquerade as confirmed new trends',()=>{
 const jump=createPriceSignal(time=>time>=50?105:100);for(let time=45;time<150;time+=3)assert.equal(jump.at(time).direction,0);
 const price=time=>100*Math.exp(.0003*Math.max(0,time)-(time===90?.01:0)),signal=createPriceSignal(price);
 assert.equal(signal.at(87).direction,1);for(let time=90;time<108;time+=3)assert.notEqual(signal.at(time).direction,-1);assert.equal(signal.at(132).direction,1);
});
test('a genuine reversal weakens the old trend, passes through confirmation, then follows the new prices',()=>{
 const price=time=>100*Math.exp(.0004*(time<=90?Math.max(0,time):180-time)),signal=createPriceSignal(price);
 assert.equal(signal.at(87).direction,1);assert.notEqual(signal.at(93).direction,-1);assert.equal(signal.at(150).direction,-1);
 const values=Array.from({length:24},(_,i)=>signal.at(90+i*3));assert.ok(values.some(value=>value.direction===0));assert.ok(values.some(value=>value.levelIndex<3));
});
test('normalization is price-scale independent and evaluation never uses future data',()=>{
 const price=time=>Math.exp(.0002*time+.001*Math.sin(time*.19)),a=createPriceSignal(time=>price(time)),b=createPriceSignal(time=>100000*price(time));
 for(let time=60;time<180;time+=3){assert.equal(a.at(time).direction,b.at(time).direction);assert.equal(a.at(time).levelIndex,b.at(time).levelIndex);assert.ok(Math.abs(a.at(time).score-b.at(time).score)<1e-9)}
 const now=123,called=[],bounded=createPriceSignal(time=>{called.push(time);assert.ok(time<=now);return price(time)});const before=bounded.at(now);assert.ok(called.length<200);assert.ok(now-Math.min(...called)<120);assert.deepEqual(bounded.at(now),before);
 const changedFuture=createPriceSignal(time=>time>now?1e12:price(time));assert.deepEqual(changedFuture.at(now),before);
});
test('missing or invalid prices produce a waiting state rather than a numeric certainty',()=>{
 for(const price of [()=>null,()=>NaN,()=>0,()=>Infinity]){const result=createPriceSignal(price).at(900);assert.equal(result.direction,0);assert.equal(result.levelIndex,0);assert.equal(result.score,0);assert.equal(result.available,false)}
 const missingCurrent=createPriceSignal(time=>time===900?null:100*Math.exp(.0003*time)).at(900);assert.equal(missingCurrent.direction,0);assert.equal(missingCurrent.score,0);assert.equal(missingCurrent.phase,'データ確認中');
});
