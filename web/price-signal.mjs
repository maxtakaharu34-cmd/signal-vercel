// Causal, finite-memory signals from synthetic closes only. Neither a scenario
// direction nor an independent random field is an input to this calculation.
export const SIGNAL_STEP=3;
export const SIGNAL_LEVELS=['極寒','寒気','晩秋','新春','初夏','猛暑'];
const HORIZONS=[8,24,48],WEIGHTS=[.3,.4,.3],SMOOTH=[.4,.3,.2,.1];
const ENTER=.24,RELEASE=.12,LEVEL_THRESHOLDS=[0,.24,.39,.54,.69,.84];
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));

export function createPriceSignal(closeAt){
 const prices=new Map(),features=new Map(),scores=new Map();
 function close(time){if(!prices.has(time)){const value=closeAt(time);prices.set(time,Number.isFinite(value)&&value>0?value:null)}return prices.get(time)}
 function feature(time){
  if(features.has(time))return features.get(time);
  const values=Array.from({length:49},(_,i)=>close(time-48+i));
  if(values.some(value=>value===null)){const result={short:0,medium:0,long:0,efficiency:0,continuity:0,agreement:0,shockGate:0,raw:0,available:false};features.set(time,result);return result}
  const returns=values.slice(1).map((value,i)=>Math.log(value/values[i]));
  const component=HORIZONS.map(period=>{const recent=returns.slice(-period),net=recent.reduce((sum,value)=>sum+value,0),energy=Math.sqrt(recent.reduce((sum,value)=>sum+value*value,0));return energy>1e-12?Math.tanh(net/(1.6*energy)):0});
  const recent=returns.slice(-24),net=recent.reduce((sum,value)=>sum+value,0),gross=recent.reduce((sum,value)=>sum+Math.abs(value),0);
  const efficiency=gross>1e-12?Math.abs(net)/gross:0;
  const short=returns.slice(-12),shortGross=short.reduce((sum,value)=>sum+Math.abs(value),0);
  const continuity=Math.abs(short.reduce((sum,value)=>sum+(Math.abs(value)>1e-12?Math.sign(value):0),0))/12;
  const concentration=shortGross>1e-12?Math.max(...short.map(Math.abs))/shortGross:0;
  const shockGate=shortGross>1e-12?clamp((1-concentration)/.65):0;
  const agreement=Math.abs(component.reduce((sum,value,i)=>sum+WEIGHTS[i]*(Math.abs(value)>.12?Math.sign(value):0),0));
  const momentum=component.reduce((sum,value,i)=>sum+WEIGHTS[i]*value,0);
  const quality=.15+.5*Math.sqrt(efficiency)+.35*continuity;
  const raw=clamp(momentum*quality*shockGate*(.45+.55*agreement),-1,1);
  const result={short:component[0],medium:component[1],long:component[2],efficiency,continuity,agreement,shockGate,raw,available:true};features.set(time,result);return result;
 }
 function score(time){if(!scores.has(time))scores.set(time,feature(time).available?SMOOTH.reduce((sum,weight,i)=>sum+weight*feature(time-i*SIGNAL_STEP).raw,0):0);return scores.get(time)}
 function confirms(time,direction,threshold){return direction*score(time)>=threshold&&direction*score(time-SIGNAL_STEP)>=threshold}
 function at(time){
  const sample=Math.floor(time/SIGNAL_STEP)*SIGNAL_STEP,current=score(sample),sign=Math.sign(current),evidence=feature(sample);
  // Separate entry and release thresholds prevent one marginal reading from
  // flipping direction. Confirmation expires instead of holding indefinitely.
  const direction=Math.abs(current)>=RELEASE&&Array.from({length:8},(_,i)=>sample-i*SIGNAL_STEP).some(t=>confirms(t,sign,ENTER))?sign:0;
  let levelIndex=0;
  if(direction)for(let level=5;level>=1;level--){const threshold=LEVEL_THRESHOLDS[level];if(direction*current>=threshold-.06&&Array.from({length:4},(_,i)=>sample-i*SIGNAL_STEP).some(t=>confirms(t,direction,threshold))){levelIndex=level;break}}
  const previous=score(sample-6),change=Math.abs(current)-Math.abs(previous);
  const reversed=direction&&Array.from({length:8},(_,i)=>sample-(i+2)*SIGNAL_STEP).some(t=>confirms(t,-direction,ENTER));
  const phase=!evidence.available?'データ確認中':!direction?Math.abs(current)>=RELEASE?current>0?'上向き確認中':'下向き確認中':'方向感なし':reversed?'反転を確認':direction*evidence.short<-.12?'短期逆行':change<-.06?'勢いが減速':change>.06?'勢いが加速':direction>0?'上向き継続':'下向き継続';
  return {...evidence,score:current,direction,levelIndex,level:SIGNAL_LEVELS[levelIndex],phase,sample,model:2};
 }
 return {at};
}

export function signalFromEvidence(evidence){return {direction:evidence.direction,level:evidence.level,note:evidence.phase+'。仮想価格の方向・一致度・継続性から判定。実際の市場予測ではありません。'}}
