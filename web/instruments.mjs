import {createIrregularPath} from './irregular-price.mjs';

export const DEFAULT_INSTRUMENT = 'DEMO';
const pairs = [
 ['JPY',12000000,0],['USD',80000,2],['EUR',73000,2],['GBP',62000,2],
 ['AUD',125000,2],['CAD',110000,2],['CHF',71000,2],['NZD',136000,2],
 ['HKD',624000,1],['SGD',108000,2],['KRW',110000000,0],['TWD',2530000,0],
 ['ETH',26,4],['SOL',535,3],['XRP',38000,2],['BNB',135,3],
 ['ADA',160000,1],['DOGE',460000,1],['LTC',940,3],['AVAX',3100,2],
];

const index = {id:DEFAULT_INSTRUMENT,label:'共通指数',digits:3,spreadTicks:6};
export const INSTRUMENTS = [index,...pairs.map(([currency,reference,digits])=>({
 id:'BTC/'+currency,label:'BTC/'+currency,reference,digits,
 spreadTicks:Math.max(2,2*Math.round(reference*10**digits*.00004)),
}))];
const byId = new Map(INSTRUMENTS.map(instrument=>[instrument.id,instrument]));
export const instrumentInfo = id => byId.get(id) ?? index;

const btcPath = createIrregularPath(0x4ba91c71,6);
const currencyPaths = new Map(pairs.map(([currency],i)=>['BTC/'+currency,createIrregularPath(0x3a1f37b7+2417*i,i<12?4:8)]));

export function instrumentPrice(id,step,indexPrice) {
 const instrument=instrumentInfo(id);
 if(instrument.id===DEFAULT_INSTRUMENT)return indexPrice;
 const btc=.36*Math.tanh(btcPath.value(step)/.36);
 const currency=.36*Math.tanh(currencyPaths.get(id).value(step)/.36);
 return instrument.reference*Math.exp(btc-currency);
}

const formatters = new Map();
export function formatRate(value,id,sign=false){
 if(value==null)return '—';
 const {digits}=instrumentInfo(id),key=digits+':'+sign;
 if(!formatters.has(key))formatters.set(key,new Intl.NumberFormat('ja-JP',{
  minimumFractionDigits:digits,maximumFractionDigits:digits,signDisplay:sign?'exceptZero':'auto',
 }));
 return formatters.get(key).format(value);
}
