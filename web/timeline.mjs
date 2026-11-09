import {createIrregularPath} from './irregular-price.mjs';
// A single deterministic simulation clock. Prices are synthetic and identical
// for everyone at a given server time; work is bounded to the last 120 candles.
const LEVELS=['極寒','寒気','晩秋','新春','初夏','猛暑'];
const TAU=18,RATE=.00012,LIMIT=.25;
export function validAutomation(a){return !!a&&a.schemaVersion===1&&Number.isSafeInteger(a.anchorMs)&&a.anchorMs>0&&Number.isSafeInteger(a.originTime)&&a.originTime>=0&&Number.isSafeInteger(a.originTotal)&&a.originTotal>=72&&Number.isFinite(a.startPrice)&&a.startPrice>0&&Number.isFinite(a.initialMomentum)&&Math.abs(a.initialMomentum)<=1&&Number.isInteger(a.baseRngState)&&a.baseRngState>=0&&a.baseRngState<=4294967295&&(a.priceModel===undefined||a.priceModel===2)&&(a.modelSeed===undefined||(Number.isInteger(a.modelSeed)&&a.modelSeed>=0&&a.modelSeed<=4294967295))&&(a.previousAutomation===undefined||(!!a.previousAutomation&&!a.previousAutomation.previousAutomation&&validAutomation(a.previousAutomation)))&&(a.initialSignalScore===undefined||(Number.isFinite(a.initialSignalScore)&&Math.abs(a.initialSignalScore)<=1))}
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
// Random-access, smooth value noise: no replay, client randomness or repeating
// sine-only signal cycle. The absolute candle index keeps phases across commands.
function signalNoise(seed,time,span,salt){
 const slot=Math.floor(time/span),fraction=time/span-slot,smooth=fraction*fraction*(3-2*fraction);
 const value=index=>{let x=(seed^Math.imul(index,0x45d9f3b)^salt)>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967295*2-1};
 return value(slot)+(value(slot+1)-value(slot))*smooth;
}
function signalTarget(checkpoint,step,samplePrice){
 const a=checkpoint.automation,time=a.originTime+step,momentum=timelineMomentum(checkpoint,step);
 const previous=Math.max(0,step-8),distance=step-previous;
 const impulse=distance?Math.tanh(Math.log(samplePrice(step)/samplePrice(previous))/distance/(.000025+.000018*checkpoint.config.volatility)):0;
 const settled=-Math.expm1(-step/30),trendWeight=.32+.5*Math.exp(-step/60);
 const trend=1.25*trendWeight*momentum,price=1.25*settled*.48*impulse;
 const variation=1.25*settled*(.66*signalNoise(checkpoint.seed,time,41,0x91ab)+.32*signalNoise(checkpoint.seed,time,17,0x71c3)+.14*signalNoise(checkpoint.seed,time,113,0x34e7));
 const scale=1/Math.max(1,Math.abs(trend+price+variation));
 return {trend:trend*scale,price:price*scale,variation:variation*scale};
}
export function signalDiagnostics(checkpoint,step,price=priceSampler(checkpoint)){
 const sample=Math.floor(step/3)*3,weights=[.4,.27,.17,.1,.06],parts={trend:0,price:0,variation:0};
 for(let i=0;i<weights.length;i++){const target=signalTarget(checkpoint,Math.max(0,sample-i*3),price);for(const key of Object.keys(parts))parts[key]+=weights[i]*target[key]}
 const blend=-Math.expm1(-sample/12),carry=(checkpoint.automation.initialSignalScore??checkpoint.automation.initialMomentum)*(1-blend);
 for(const key of Object.keys(parts))parts[key]*=blend;
 const score=Math.max(-1,Math.min(1,parts.trend+parts.price+parts.variation+carry));
 return {...parts,carry,score,sample};
}
function signalScore(checkpoint,step,price){return signalDiagnostics(checkpoint,step,price).score}
export function signalHistory(record,{count=20}={}){
 if(!validAutomation(record?.checkpoint?.automation)||!Number.isSafeInteger(record.clock?.step))return [];
 const checkpoint=record.checkpoint,a=checkpoint.automation,price=priceSampler(checkpoint),last=Math.floor(record.clock.step/3)*3,first=Math.max(0,last-(Math.max(1,Math.min(40,count))-1)*3),result=[];
 for(let step=first;step<=last;step+=3){const signal=automaticSignal(checkpoint,step,price);result.push({step,time:a.originTime+step,...signal})}
 return result;
}
function automaticSignal(checkpoint,step,price=priceSampler(checkpoint)){
 const score=signalScore(checkpoint,step,price),strength=Math.min(1,Math.abs(score)),direction=strength<.12?0:score>0?1:-1;
 const prior=Math.abs(signalScore(checkpoint,Math.max(0,step-6),price)),change=strength-prior;
 const phase=direction===0?'方向を見極め中':change>.035?'勢いが強まっています':change<-.035?'勢いが落ち着いています':'強弱を確認中';
 return {direction,level:LEVELS[Math.min(5,Math.floor(strength*6))],note:phase+'。共通の仮想価格の勢い・方向指示・不規則な揺れから自動算出。実際の市場予測ではありません。'};
}
export function projectScene(record,now=Date.now()){
 const checkpoint=record?.checkpoint,a=checkpoint?.automation;if(!validAutomation(a))return record;
 if(a.previousAutomation&&now<a.anchorMs)return projectScene({...record,checkpoint:{...checkpoint,automation:a.previousAutomation}},now);
 const price=priceSampler(checkpoint),step=automationStep(checkpoint,now),rows=checkpoint.rows.filter(row=>row.time<=a.originTime),first=Math.max(1,step-119);
 for(let i=first;i<=step;i++){
  const open=price(i-1),close=price(i);let high=Math.max(open,close),low=Math.min(open,close);
  for(let j=1;j<12;j++){const p=price(i-1+j/12);high=Math.max(high,p);low=Math.min(low,p)}
  rows.push({time:a.originTime+i,open,high,low,close});
 }
 const rngState=Number((BigInt(a.baseRngState)+BigInt(step)*12n*0x6D2B79F5n)&0xffffffffn);
 return {...record,checkpoint:{...checkpoint,total:a.originTotal+step,rows:rows.slice(-120),rngState},signal:automaticSignal(checkpoint,step,price),clock:{step,generatedAt:new Date(a.anchorMs+step*1000/checkpoint.config.speed).toISOString()}};
}
export function startAutomation(record,direction,now=Date.now()){
 if(![-1,0,1].includes(direction))throw Error('シナリオの方向を確認してください。');
 const current=projectScene(record,now),checkpoint=structuredClone(current.checkpoint),old=checkpoint.automation;
 const previousStep=validAutomation(old)?automationStep(checkpoint,now):0,initialSignalScore=validAutomation(old)?signalScore(checkpoint,previousStep):0,initialMomentum=validAutomation(old)?timelineMomentum(checkpoint,previousStep):0,last=checkpoint.rows.at(-1);
 checkpoint.config.direction=direction;
 checkpoint.automation={schemaVersion:1,priceModel:2,modelSeed:old?.modelSeed??((checkpoint.seed^checkpoint.rngState)>>>0),anchorMs:now,originTime:last.time,originTotal:checkpoint.total,startPrice:last.close,initialMomentum,initialSignalScore,baseRngState:checkpoint.rngState};
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
 const current=projectScene(record,now),checkpoint=structuredClone(current.checkpoint);delete checkpoint.automation;
 const stopped={...current,checkpoint};delete stopped.clock;return stopped;
}
export function newerFrame(incoming,current){return incoming.version>current.version||(incoming.version===current.version&&validAutomation(incoming.checkpoint?.automation)&&incoming.checkpoint.total>current.checkpoint.total)}
