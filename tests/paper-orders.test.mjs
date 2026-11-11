import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSide,orderPrice,positionProfit,validOrderQuantity,validOrderTrigger,matchPendingOrder} from '../web/paper-orders.mjs';
import {quotePair} from '../web/market-quotes.mjs';
import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
import {startAutomation,projectScene,createExecutionPriceReader} from '../web/timeline.mjs';
import {tradeLevels} from '../web/trade-levels.mjs';

test('both sides mark an immediate exit against the opposing quote and charge the spread in demo points',()=>{
 const quote=quotePair(100),quantity=3;
 for (const side of ['buy','sell']) {
  const price=orderPrice(side,quote);
  const position={side,quantity,open:{price}};
  assert.equal(positionProfit(position,orderPrice(closeSide(side),quote)),-0.018);
  const favorable=quotePair(side==='buy'?101:99);
  assert.equal(positionProfit(position,orderPrice(closeSide(side),favorable)),2.982);
 }
});

test('demo order quantity must be a whole number in the displayed range',()=>{
 for (const quantity of [1,10,1000]) assert.equal(validOrderQuantity(quantity),true);
 for (const quantity of [0,-1,1.5,1001,NaN,'1']) assert.equal(validOrderQuantity(quantity),false);
});

test('conditional orders require the proper side of the current quote and execute at the first qualifying quote',()=>{
 const quote=quotePair(100);
 for(const [side,type,target,beforeCrossing,crossing] of [
  ['buy','limit',99.900,100.3,99.89],['sell','limit',100.1,100,100.12],
  ['buy','stop',100.1,99.89,100.12],['sell','stop',99.9,100.3,99.89],
 ]){
  assert.equal(validOrderTrigger(side,type,target,quote),true);
  assert.equal(validOrderTrigger(side,type,orderPrice(side,quote),quote),false);
  assert.equal(validOrderTrigger(side,type,target+0.0001,quote),false);
  const prices=[100,beforeCrossing,crossing,100];
  const order={side,type,target,cursor:{time:0,close:100}};
  const result=matchPendingOrder(order,{first:0,last:3,closeAt:i=>prices[i]??null});
  assert.deepEqual(result,{status:'filled',price:orderPrice(side,quotePair(crossing)),step:2});
 }
});

test('a pending order waits on the same price and stops for discontinuous history',()=>{
 const order={side:'buy',type:'limit',target:99,cursor:{time:100,close:100}};
 const frame=(first,last,closes)=>({first,last,closeAt:i=>closes[i]??null});
 assert.deepEqual(matchPendingOrder(order,frame(100,101,{100:100,101:100})),{status:'pending',cursor:{time:101,close:100}});
 for(const reader of [frame(1,72,{}),frame(102,104,{104:98}),frame(100,101,{100:101,101:98}),frame(100,103,{100:100,103:98})]){
  assert.deepEqual(matchPendingOrder(order,reader),{status:'review'});
 }
});

test('another tab may deliver an older frame without stopping or filling a working order',()=>{
 const order={side:'buy',type:'limit',target:99,cursor:{time:100,close:100,version:4}};
 const stale={version:4,first:1,last:99,closeAt:()=>98};
 assert.deepEqual(matchPendingOrder(order,stale),{status:'pending',cursor:order.cursor});
 assert.deepEqual(matchPendingOrder(order,{...stale,version:3,last:101}),{status:'pending',cursor:order.cursor});
 assert.deepEqual(matchPendingOrder(order,{...stale,version:5}),{status:'review'});
});

test('missed executable closes can be recovered from an unchanged simulation anchor',()=>{
 const time=Date.parse('2026-11-11T01:00:00Z');
 const scene=startAutomation({checkpoint:initialCheckpoint(),signal:DEFAULT_SIGNAL},1,time);
 const earlier=projectScene(scene,time+2000).checkpoint.rows.at(-1);
 const later=projectScene(scene,time+300000).checkpoint;
 const reader=createExecutionPriceReader(later);
 assert.ok(later.rows[0].time>earlier.time);
 assert.equal(reader.closeAt(earlier.time),earlier.close);
 assert.equal(reader.closeAt(reader.last+1),null);
});

test('only working orders and open positions contribute to trade lines and equal prices share a line',()=>{
 const positions=[{id:'p1',side:'buy',open:{price:100,time:2},close:null},{id:'p2',side:'buy',open:{price:101,time:1},close:{price:102}}];
 const pending=[{id:'o1',side:'sell',type:'limit',target:100,time:3,status:'pending'},{id:'o2',side:'buy',type:'stop',target:103,time:4,status:'review'}];
 const grouped=tradeLevels({positions,pending});
 assert.equal(grouped.length,1);
 assert.deepEqual(grouped[0].ids,['o1','p1']);
 assert.equal(grouped[0].price,100);
 assert.equal(tradeLevels({positions,pending},{orderLines:false})[0].title,'建玉 買');
 assert.equal(tradeLevels({positions,pending},{positionLines:false})[0].title,'指値 売');
});
