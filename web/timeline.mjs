import {createIrregularPath} from './irregular-price.mjs';
import {createPriceSignal,signalFromEvidence,SIGNAL_STEP} from './price-signal.mjs';
import {aggregateMarketBars,CHART_PERIODS,marketClock,SIGNAL_PERIOD} from './market-bars.mjs';
// A single deterministic simulation clock. Prices are synthetic and identical
// for everyone at a given server time; work is bounded to the last 120 candles.
const TAU=18,RATE=.00012,LIMIT=.25;
function validSignalContext(a){const c=a.signalContext;return c===undefined||!!c&&Number.isSafeInteger(c.firstTime)&&c.firstTime>=0&&Array.isArray(c.closes)&&c.closes.length>=1&&c.closes.length<=120&&c.firstTime+c.closes.length-1===a.originTime&&c.closes.every(value=>Number.isFinite(value)&&value>0)&&c.closes.at(-1)===a.startPrice}
export function validAutomation(a){return !!a&&validSignalContext(a)&&a.schemaVersion===1&&Number.isSafeInteger(a.anchorMs)&&a.anchorMs>0&&Number.isSafeInteger(a.originTime)&&a.originTime>=0&&Number.isSafeInteger(a.originTotal)&&a.originTotal>=72&&Number.isFinite(a.startPrice)&&a.startPrice>0&&Number.isFinite(a.initialMomentum)&&Math.abs(a.initialMomentum)<=1&&Number.isInteger(a.baseRngState)&&a.baseRngState>=0&&a.baseRngState<=4294967295&&(a.priceModel===undefined||a.priceModel===2)&&(a.modelSeed===undefined||(Number.isInteger(a.modelSeed)&&a.modelSeed>=0&&a.modelSeed<=4294967295))&&(a.previousAutomation===undefined||(!!a.previousAutomation&&!a.previousAutomation.previousAutomation&&validAutomation(a.previousAutomation)))&&(a.initialSignalScore===undefined||(Number.isFinite(a.initialSignalScore)&&Math.abs(a.initialSignalScore)<=1))}
export function automationStep(checkpoint,now=Date.now()){
 const a=checkpoint?.automation;if(!validAutomation(a))return 0;
 return Math.min(Number.MAX_SAFE_INTEGER-a.originTotal-1,Math.max(0,Math.floor((now-a.anchorMs)*checkpoint.config.speed/1000)));
}
export function simulationTimestamp(checkpoint,time){
 const a=checkpoint?.automation;if(!validAutomation(a)||time<a.originTime)return null;
 const ms=a.anchorMs+(time-a.originTime)*1000/checkpoint.config.speed;
 return Number.isFinite(ms)&&Math.abs(ms)<=8.64e15?new Date(ms).toISOString():null;
}
export function timelineMomentum(checkpoint,step){const a=checkpoint.automation;return checkpoint.config.direction+(a.initialMomentum-checkpoint.config.direction)*Math.exp(-step/TAU)}
function priceSampler(checkpoint){
 const a=checkpoint.automation,direction=checkpoint.config.direction;
 const path=a.priceModel===2?createIrregularPath(a.modelSeed??checkpoint.seed,checkpoint.config.volatility):null;
 const base=path?.value(a.originTime),phase=(checkpoint.seed%65536)/65536*Math.PI*2;
 const wave=t=>Math.sin(t*.63+phase)+.45*Math.sin(t*.17+phase*1.7);
 return step=>{
  const integral=direction*step+(a.initialMomentum-direction)*TAU*(-Math.expm1(-step/TAU));
  const drift=LIMIT*Math.tanh(RATE*integral/LIMIT);
  const movement=path?.value? .18*Math.tanh((path.value(a.originTime+step)-base)/.18):.000055*checkpoint.config.volatility*(wave(step)-wave(0));
  return Math.max(.001,a.startPrice*Math.exp(drift+movement));
 };
}
function simulationCandle(price, originTime, step) {
 const open = price(step - 1), close = price(step);
 let high = Math.max(open, close), low = Math.min(open, close);
 for (let tick = 1; tick < 12; tick++) {
  const value = price(step - 1 + tick / 12);
  high = Math.max(high, value);
  low = Math.min(low, value);
 }
 return {time:originTime + step, open, high, low, close};
}

// Orders use the closes that the price display can quote. Recover an unseen
// close from the current anchor only when its original path is still known.
export function createExecutionPriceReader(checkpoint) {
 const {automation:anchor, rows} = checkpoint;
 const closes = new Map(rows.map(row => [row.time,row.close]));
 const first = Math.min(rows[0].time,anchor?.originTime ?? Infinity);
 const last = rows.at(-1).time;
 let price;
 return {
  first, last,
  closeAt(time) {
   if (time < first || time > last) return null;
   if (!closes.has(time) && validAutomation(anchor) && time >= anchor.originTime) {
    price ??= priceSampler(checkpoint);
    closes.set(time,price(time-anchor.originTime));
   }
   return closes.get(time) ?? null;
  },
 };
}

// Fill only the part of the visible history missing from the server frame.
// Subsequent frames extend the cached bars with the same authoritative samples.
export function createMarketBarReader() {
 const cache = new Map();
 return function readBars(checkpoint, period) {
  if (!CHART_PERIODS.includes(period)) return [];
  const {automation:anchor, config, market, rows} = checkpoint;
  const clock = marketClock(checkpoint);
  if (!clock) return [];
  const {epoch, since} = clock, through = rows.at(-1).time;
  if (period === 1) return rows.filter(row => row.time >= since).map(row => ({...row, time:epoch + row.time - 1}));
  if (!validAutomation(anchor)) return market.bars[period];
  const key = [epoch, anchor.originTime, anchor.anchorMs, anchor.startPrice, anchor.initialMomentum, anchor.modelSeed ?? checkpoint.seed, anchor.priceModel, config.direction, config.volatility, config.speed].join(':');
  const cached = cache.get(period);
  const source = cached?.key === key && cached.through <= through ? cached : market?.through === anchor.originTime ? market : null;
  if (source === cached && cached.through === through) return cached.bars[period];
  const retained = new Map(rows.map(row => [row.time, row]));
  let price;
  const bars = aggregateMarketBars({
   period, epoch, first:(source?.through ?? anchor.originTime) + 1, through,
   previous:source?.bars[period],
   candleAt:time => retained.get(time) ?? simulationCandle(price ??= priceSampler(checkpoint), anchor.originTime, time - anchor.originTime),
  });
  cache.set(period, {key, through, bars:{[period]:bars}});
  return bars;
 };
}

function archiveMarket(checkpoint, through, now) {
 const read = createMarketBarReader();
 const clock = marketClock(checkpoint);
 return {
  epoch:clock?.epoch ?? Math.floor(now / 1000) - through,
  since:clock?.since ?? through + 1,
  through,
  bars:Object.fromEntries(CHART_PERIODS.slice(1).map(period => [period, read(checkpoint, period)])),
 };
}

function decisionTime(checkpoint, time) {
 const {epoch} = marketClock(checkpoint);
 return Math.floor((epoch + time) / SIGNAL_PERIOD) * SIGNAL_PERIOD - epoch;
}

export function signalTimestamp(checkpoint, time) {
 const clock = marketClock(checkpoint);
 const ms = clock ? (clock.epoch + time) * 1000 : NaN;
 return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null;
}

function contextFromRows(rows,originTime){
 const tail=rows.filter(row=>row.time<=originTime).slice(-120);if(!tail.length||tail.at(-1).time!==originTime)return undefined;
 let first=tail.length-1;while(first>0&&tail[first-1].time===tail[first].time-1)first--;
 return {firstTime:tail[first].time,closes:tail.slice(first).map(row=>row.close)};
}
function priceSignal(checkpoint,price=priceSampler(checkpoint)){
 const a=checkpoint.automation,context=a.signalContext??contextFromRows(checkpoint.rows,a.originTime);
 return createPriceSignal(time=>{const step=time-a.originTime;if(step>=0)return price(step);const index=time-(context?.firstTime??Infinity);return index>=0&&index<(context?.closes.length??0)?context.closes[index]:null},marketClock(checkpoint).epoch%SIGNAL_STEP);
}
export function signalDiagnostics(checkpoint,step,price=priceSampler(checkpoint)){
 const result=priceSignal(checkpoint,price).at(decisionTime(checkpoint,checkpoint.automation.originTime+step));
 return {...result,sample:result.sample-checkpoint.automation.originTime};
}
export function signalHistory(record,{count=20}={}){
 if(!validAutomation(record?.checkpoint?.automation)||!Number.isSafeInteger(record.clock?.step))return [];
 const checkpoint=record.checkpoint,a=checkpoint.automation,analyzer=priceSignal(checkpoint),last=decisionTime(checkpoint,a.originTime+record.clock.step);
 const first=Math.max(decisionTime(checkpoint,a.originTime+SIGNAL_PERIOD-1),last-(Math.max(1,Math.min(40,count))-1)*SIGNAL_PERIOD),result=[];
 for(let time=first;time<=last;time+=SIGNAL_PERIOD)result.push({step:time-a.originTime,time,...signalFromEvidence(analyzer.at(time))});
 // An anchor can sit between decision candles. Its last closed decision is
 // still visible, without pretending it has a new wall-clock timestamp.
 if(!result.length)result.push({step:last-a.originTime,time:last,...signalFromEvidence(analyzer.at(last))});
 return result;
}
function automaticSignal(checkpoint,step,price=priceSampler(checkpoint)){return signalFromEvidence(signalDiagnostics(checkpoint,step,price))}
export function projectScene(record,now=Date.now()){
 let checkpoint=record?.checkpoint;const a=checkpoint?.automation;if(!validAutomation(a))return record;const context=a.signalContext??contextFromRows(checkpoint.rows,a.originTime);if(context&&!a.signalContext)checkpoint={...checkpoint,automation:{...a,signalContext:context}};
 if(a.previousAutomation&&now<a.anchorMs){
  const previous={...checkpoint,automation:a.previousAutomation};
  delete previous.market;
  return projectScene({...record,checkpoint:previous},now);
 }
 const price=priceSampler(checkpoint),step=automationStep(checkpoint,now),rows=checkpoint.rows.filter(row=>row.time<=a.originTime),first=Math.max(1,step-119);
 for(let i=first;i<=step;i++)rows.push(simulationCandle(price,a.originTime,i));
 const rngState=Number((BigInt(a.baseRngState)+BigInt(step)*12n*0x6D2B79F5n)&0xffffffffn);
 return {...record,checkpoint:{...checkpoint,total:a.originTotal+step,rows:rows.slice(-120),rngState},signal:automaticSignal(checkpoint,step,price),clock:{step,generatedAt:new Date(a.anchorMs+step*1000/checkpoint.config.speed).toISOString()}};
}
export function startAutomation(record,direction,now=Date.now()){
 if(![-1,0,1].includes(direction))throw Error('シナリオの方向を確認してください。');
 const current=projectScene(record,now),checkpoint=structuredClone(current.checkpoint),old=checkpoint.automation;
 const previousStep=validAutomation(old)?automationStep(checkpoint,now):0,initialSignalScore=validAutomation(old)?signalDiagnostics(checkpoint,previousStep).score:0,initialMomentum=validAutomation(old)?timelineMomentum(checkpoint,previousStep):0,last=checkpoint.rows.at(-1);
 checkpoint.market=archiveMarket(checkpoint,last.time,now);
 checkpoint.config.direction=direction;
 checkpoint.automation={schemaVersion:1,priceModel:2,modelSeed:old?.modelSeed??((checkpoint.seed^checkpoint.rngState)>>>0),anchorMs:now,originTime:last.time,originTotal:checkpoint.total,startPrice:last.close,initialMomentum,initialSignalScore,baseRngState:checkpoint.rngState,signalContext:contextFromRows(checkpoint.rows,last.time)};
 return {...current,checkpoint,signal:automaticSignal(checkpoint,0),clock:{step:0,generatedAt:new Date(now).toISOString()}};
}
export function validAutomationSettings(settings){return !!settings&&[1,2,5,10].includes(settings.speed)&&Number.isInteger(settings.volatility)&&settings.volatility>=1&&settings.volatility<=10&&Object.keys(settings).every(key=>['speed','volatility'].includes(key))}
// Re-anchor at the shared current close. Existing candles and signal momentum
// survive a speed/volatility change; only subsequent synthetic steps are tuned.
export function tuneAutomation(record,settings,now=Date.now()){
 if(!validAutomation(record?.checkpoint?.automation)||!validAutomationSettings(settings))throw Error('自動更新の設定を確認してください。');
 const next=startAutomation(record,record.checkpoint.config.direction,now);
 Object.assign(next.checkpoint.config,settings);
 return next;
}
// Scheduled handover preserves all candles already seen before activation.
export function schedulePriceUpgrade(record,at,now=Date.now()){
 const a=record.checkpoint?.automation;
 if(!validAutomation(a)||a.priceModel===2)throw Error('稼働中の旧モデルを確認してください。');
 if(automationStep(record.checkpoint,now)<120||at<=now||at-now>60000)throw Error('モデル切替の時刻を確認してください。');
 const next=startAutomation(record,record.checkpoint.config.direction,at);
 next.checkpoint.automation.previousAutomation=structuredClone(a);
 return next;
}
export function stopAutomation(record,now=Date.now()){
 const current=projectScene(record,now),checkpoint=structuredClone(current.checkpoint);
 if(validAutomation(checkpoint.automation))checkpoint.market=archiveMarket(checkpoint,checkpoint.rows.at(-1).time,now);
 delete checkpoint.automation;
 const stopped={...current,checkpoint};delete stopped.clock;return stopped;
}
export function newerFrame(incoming,current){return incoming.version>current.version||(incoming.version===current.version&&validAutomation(incoming.checkpoint?.automation)&&incoming.checkpoint.total>current.checkpoint.total)}
