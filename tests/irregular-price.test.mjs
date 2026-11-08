import test from 'node:test';import assert from 'node:assert/strict';
import {initialCheckpoint,DEFAULT_SIGNAL,validateScene} from '../web/engine.mjs';
import {projectScene,startAutomation,schedulePriceUpgrade,newerFrame} from '../web/timeline.mjs';
const NOW=Date.parse('2026-11-09T00:00:00Z');
const scene=seed=>({id:1,version:22,checkpoint:initialCheckpoint(seed),signal:DEFAULT_SIGNAL,announcement:'',updated_at:new Date(NOW).toISOString()});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function correlation(a,b){const ma=mean(a),mb=mean(b);let cross=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;cross+=x*y;aa+=x*x;bb+=y*y}return cross/Math.sqrt(aa*bb)}
function samples(record,count=6000){const rows=[];for(let t=120;t<=count;t+=120)rows.push(...projectScene(record,NOW+t*1000).checkpoint.rows);return rows}
function legacy(){const r=startAutomation(scene(20261105),0,NOW);delete r.checkpoint.automation.priceModel;delete r.checkpoint.automation.modelSeed;return r}
test('new automatic scenarios use reproducible irregular paths without the old ten-step cycle',()=>{
 for(const seed of [7,42,20261105]){
  const r=scene(seed);r.checkpoint.config.volatility=10;const running=startAutomation(r,0,NOW);assert.equal(running.checkpoint.automation.priceModel,2);
  const rows=samples(running),returns=rows.slice(1).map((c,i)=>Math.log(c.close/rows[i].close));
  assert.ok(Math.abs(correlation(returns.slice(1),returns.slice(0,-1)))<.15);
  assert.ok(Math.abs(correlation(returns.slice(10),returns.slice(0,-10)))<.15);
  const body=rows.map(c=>Math.abs(c.close-c.open)/(c.high-c.low));assert.ok(mean(body)>.3&&mean(body)<.8);assert.ok(mean(body.map(x=>x>.95?1:0))<.35);
  for(let i=1;i<rows.length;i++){assert.equal(rows[i].open,rows[i-1].close);assert.ok(rows[i].low>0&&rows[i].low<=Math.min(rows[i].open,rows[i].close)&&rows[i].high>=Math.max(rows[i].open,rows[i].close))}
  const deviation=[];for(let i=0;i<returns.length-120;i+=120){const w=returns.slice(i,i+120),m=mean(w);deviation.push(Math.sqrt(mean(w.map(x=>(x-m)**2))))}assert.ok(Math.max(...deviation)/Math.min(...deviation)>1.7);
  assert.deepEqual(projectScene(running,NOW+5432000),projectScene(structuredClone(running),NOW+5432000));
 }
});
test('legacy checkpoint stays on its original prices until a shared scheduled handover',()=>{
 const old=legacy(),now=NOW+300000,at=NOW+315000,next=schedulePriceUpgrade(old,at,now);next.version=23;
 assert.ok(validateScene(next));assert.equal(next.checkpoint.automation.priceModel,2);assert.deepEqual(projectScene(next,now).checkpoint.rows,projectScene(old,now).checkpoint.rows);
 for(const t of [now,at-1,at])assert.deepEqual(projectScene(next,t).checkpoint.rows,projectScene(old,t).checkpoint.rows);
 const before=projectScene(next,at-1),first=projectScene(next,at),after=projectScene(next,at+1000);
 assert.equal(after.checkpoint.rows.at(-1).open,first.checkpoint.rows.at(-1).close);assert.ok(newerFrame(first,before));assert.ok(newerFrame(after,first));
 assert.equal(first.clock.step,0);assert.ok(before.clock.step>300);
 const later=projectScene(next,at+3000);for(const row of first.checkpoint.rows){const match=later.checkpoint.rows.find(r=>r.time===row.time);if(match)assert.deepEqual(row,match)}
 assert.throws(()=>schedulePriceUpgrade(old,now,now));assert.throws(()=>schedulePriceUpgrade(old,now+61000,now));
});
test('old model rejects unsupported versions and activation metadata cannot nest',()=>{
 const r=startAutomation(scene(7),0,NOW);r.checkpoint.automation.priceModel=999;assert.equal(validateScene(r),false);r.checkpoint.automation.priceModel=2;r.checkpoint.automation.previousAutomation=null;assert.equal(validateScene(r),false);
});
