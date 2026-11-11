import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSide,orderPrice,positionProfit,validOrderQuantity} from '../web/paper-orders.mjs';
import {quotePair} from '../web/market-quotes.mjs';

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
