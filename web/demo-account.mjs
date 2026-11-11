import {DEFAULT_INSTRUMENT,instrumentPrice} from './instruments.mjs';
import {quotePair} from './market-quotes.mjs';

export const DEMO_START_BALANCE=1000000;
export const DEMO_LEVERAGES=[1,10,25,50,100,200,300];
export const DEMO_DEFAULT_LEVERAGE=25;
export const LIQUIDATION_RATIO=.5;
export const isManaged=order=>Number.isFinite(order.margin);

function units(order){return order.quantity*(order.instrument===DEFAULT_INSTRUMENT?1:.01);}

function yenRate(instrument,step){
 if(instrument===DEFAULT_INSTRUMENT||instrument==='BTC/JPY')return 1;
 return instrumentPrice('BTC/JPY',step)/instrumentPrice(instrument,step);
}

export function marginFor(order,price,step){
 return Math.ceil(price*units(order)*yenRate(order.instrument,step)/order.leverage);
}

export function accountProfit(position,price,step){
 const signed=position.side==='buy'?price-position.open.price:position.open.price-price;
 return Math.round(signed*units(position)*yenRate(position.instrument,step))||0;
}

export function accountMarket(row){
 const cache=new Map();
 return instrument=>{
  if(!cache.has(instrument))cache.set(instrument,quotePair(instrumentPrice(instrument,row.time,row.close),instrument));
  return cache.get(instrument);
 };
}

export function accountSnapshot(balance,positions,pending,row){
 let margin=0,reserved=0,profit=0;
 const quotes=row?accountMarket(row):null;
 for(const position of positions){
  if(position.close||!isManaged(position))continue;
  margin+=position.margin;
  if(quotes){
   const quote=quotes(position.instrument);
   profit+=accountProfit(position,position.side==='buy'?quote.bid:quote.ask,row.time);
  }
 }
 for(const order of pending)if(order.status==='pending'&&isManaged(order))reserved+=order.margin;
 const equity=balance+profit;
 return {balance,margin,reserved,profit,equity,available:equity-margin-reserved,ratio:margin?equity/margin:null};
}
