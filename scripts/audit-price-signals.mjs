// node scripts/audit-price-signals.mjs BASELINE_MODULE SHARED_SCENE_JSON OUTPUT_JSON
// Compare past-price coherence, not future trade accuracy or a simulated win rate.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {projectScene,signalDiagnostics} from '../web/timeline.mjs';
const [baselinePath,scenePath,outputPath]=process.argv.slice(2);
if(!outputPath)throw Error('Provide the saved baseline module, shared scene JSON and output JSON paths.');
const old=await import(pathToFileURL(resolve(baselinePath)).href),source=JSON.parse(await readFile(scenePath,'utf8'));
const levels=['極寒','寒気','晩秋','新春','初夏','猛暑'],a=source.checkpoint.automation,start=Math.max(120,source.clock.step-600),trace=[];
let oldTime=0,newTime=0,independentShare=0;
for(let i=0;i<200;i++){
 const step=start+i*3,now=a.anchorMs+(step+.1)*1000/source.checkpoint.config.speed;
 let began=performance.now();const before=old.projectScene(source,now);oldTime+=performance.now()-began;
 began=performance.now();const after=projectScene(source,now);newTime+=performance.now()-began;
 assert.deepEqual(after.checkpoint.rows,before.checkpoint.rows);assert.equal(after.checkpoint.rngState,before.checkpoint.rngState);
 const oldParts=old.signalDiagnostics(before.checkpoint,step),evidence=signalDiagnostics(after.checkpoint,step),rows=after.checkpoint.rows.slice(-25);
 independentShare+=Math.abs(oldParts.variation)/(Math.abs(oldParts.trend)+Math.abs(oldParts.price)+Math.abs(oldParts.variation)+Math.abs(oldParts.carry)||1);
 const returns=rows.slice(1).map((row,j)=>Math.log(row.close/rows[j].close)),net=returns.reduce((sum,value)=>sum+value,0),energy=Math.sqrt(returns.reduce((sum,value)=>sum+value*value,0));
 const z=energy?net/energy:0,efficiency=Math.abs(net)/(returns.reduce((sum,value)=>sum+Math.abs(value),0)||1);
 trace.push({step,time:after.clock.generatedAt,close:rows.at(-1).close,normalizedPastChange:z,pastEfficiency:efficiency,old:{...before.signal,levelIndex:levels.indexOf(before.signal.level)},new:{...after.signal,levelIndex:levels.indexOf(after.signal.level),score:evidence.score}});
}
function summarize(key){const histogram=Object.fromEntries(levels.map(level=>[level,0]));let changes=0,opposedStrong=0,coherentSamples=0,waiting=0;
 for(let i=0;i<trace.length;i++){const row=trace[i],value=row[key];histogram[value.level]++;if(!value.direction)waiting++;if(i&&(value.direction!==trace[i-1][key].direction||value.level!==trace[i-1][key].level))changes++;
  if(Math.abs(row.normalizedPastChange)>=1&&row.pastEfficiency>=.25){coherentSamples++;if(value.direction*Math.sign(row.normalizedPastChange)<0&&value.levelIndex>=3)opposedStrong++}
 }
 return {histogram,waiting,changes,strongSignalsOpposingCoherentPast24:opposedStrong,coherentPast24Samples:coherentSamples};
}
const result={scope:'200 historical synthetic observations; coherence with past prices, not prediction accuracy',version:source.version,priceRowsUnchanged:true,oldIndependentNoiseAbsoluteShare:independentShare/trace.length,averageProjectionMs:{old:oldTime/200,new:newTime/200},old:summarize('old'),new:summarize('new'),trace};
await writeFile(outputPath,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,trace:undefined},null,2));
