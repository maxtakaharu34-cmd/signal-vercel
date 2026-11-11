import test from 'node:test';
import assert from 'node:assert/strict';
import {marginFor,accountProfit,accountSnapshot,DEMO_START_BALANCE,LIQUIDATION_RATIO} from '../web/demo-account.mjs';
import {instrumentPrice} from '../web/instruments.mjs';

test('the BTC unit size, account currency and leverage determine reserved margin',()=>{
 const order={instrument:'BTC/JPY',quantity:2,leverage:300};
 assert.equal(marginFor(order,12000000,400),800);
 assert.equal(marginFor({...order,leverage:25},12000000,400),9600);
 const usd=instrumentPrice('BTC/USD',400),jpy=instrumentPrice('BTC/JPY',400);
 assert.equal(marginFor({...order,instrument:'BTC/USD'},usd,400),Math.ceil(jpy*.02/300));
 assert.equal(accountProfit({...order,side:'sell',open:{price:12000000}},11999000,400),20);
});

test('equity includes the closing quote and only working orders reserve margin',()=>{
 const position={instrument:'DEMO',side:'buy',quantity:1000,margin:100000,open:{price:1000},close:null};
 const pending=[{margin:2500,status:'pending'},{margin:5000,status:'review'},{margin:7000,status:'liquidation'}];
 const totals=accountSnapshot(DEMO_START_BALANCE,[position],pending,{time:1,close:50.003});
 assert.equal(totals.profit,-950000);
 assert.equal(totals.equity,50000);
 assert.equal(totals.available,-52500);
 assert.equal(totals.ratio,LIQUIDATION_RATIO);
 assert.equal(totals.reserved,2500);
});
