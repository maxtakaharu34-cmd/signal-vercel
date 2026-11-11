import {validAutomation} from './timeline.mjs';
import {validMarketHistory} from './market-bars.mjs';
export function validateCheckpoint(value){
 if(!value||value.schemaVersion!==1||!Number.isSafeInteger(value.total)||value.total<72||!Number.isInteger(value.seed)||value.seed<0||!Number.isInteger(value.rngState)||value.rngState<0||value.rngState>4294967295)return false;
 if(value.automation!==undefined&&!validAutomation(value.automation))return false;
 const c=value.config;if(!c||![-1,0,1].includes(c.direction)||!Number.isInteger(c.volatility)||c.volatility<1||c.volatility>10||![1,2,5,10].includes(c.speed))return false;
 if(!Array.isArray(value.rows)||value.rows.length<72||value.rows.length>120)return false;
 const last=value.rows.at(-1),anchor=value.automation;
 if(!validMarketHistory(value.market,anchor?.originTime??last?.time,anchor?.startPrice??last?.close))return false;
 return value.rows.every(r=>r&&[r.open,r.high,r.low,r.close,r.time].every(Number.isFinite)&&r.open>0&&r.close>0&&r.low>0&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)&&Number.isSafeInteger(r.time)&&r.time>=0);
}
