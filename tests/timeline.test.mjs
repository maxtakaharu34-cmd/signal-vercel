import test from 'node:test';import assert from 'node:assert/strict';
import {initialCheckpoint,DEFAULT_SIGNAL,validateScene} from '../web/engine.mjs';
import {startAutomation,stopAutomation,projectScene,newerFrame} from '../web/timeline.mjs';
const NOW=Date.parse('2026-11-06T03:00:00Z');
const scene=()=>({id:1,version:21,checkpoint:initialCheckpoint(),signal:{...DEFAULT_SIGNAL},announcement:'',updated_at:new Date(NOW).toISOString()});
test('all viewers derive the same common frame from server time without mutating the saved anchor',()=>{
 const original=scene(),running=startAutomation(original,1,NOW),before=JSON.stringify(running);
 const a=projectScene(running,NOW+32100),b=projectScene(structuredClone(running),NOW+32999);assert.deepEqual(a,b);assert.equal(JSON.stringify(running),before);assert.equal(a.clock.step,32);assert.ok(validateScene(a));assert.equal(original.checkpoint.automation,undefined);assert.ok(a.checkpoint.rows.at(-1).close>running.checkpoint.rows.at(-1).close);
});
test('an upward instruction builds strength gradually without a fixed six-stage ladder or a price jump',()=>{
 const running=startAutomation(scene(),1,NOW),initial=running.checkpoint.rows.at(-1).close;assert.equal(running.checkpoint.rows.at(-1).close,initial);assert.equal(running.signal.level,'極寒');
 const samples=Array.from({length:21},(_,i)=>projectScene(running,NOW+i*3000).signal);assert.ok(new Set(samples.map(s=>s.level)).size>=4);assert.equal(samples.at(-1).direction,1);assert.notEqual(samples.at(-1).level,'極寒');assert.ok(samples.slice(0,3).every(s=>s.direction>=0));
 const first=projectScene(running,NOW+1000).checkpoint.rows.at(-1);assert.equal(first.open,initial);assert.ok(Math.abs(first.close/initial-1)<.002);
});
test('direction changes preserve existing candles and reverse momentum gradually',()=>{
 const running=startAutomation(scene(),1,NOW),before=projectScene(running,NOW+60000),turn=startAutomation(running,-1,NOW+60000);
 assert.deepEqual(turn.checkpoint.rows,before.checkpoint.rows);assert.equal(turn.signal.direction,1);assert.equal(projectScene(turn,NOW+61000).signal.direction,1);assert.equal(projectScene(turn,NOW+120000).signal.direction,-1);assert.ok(projectScene(turn,NOW+180000).checkpoint.rows.at(-1).close<turn.checkpoint.rows.at(-1).close);
 const a=projectScene(turn,NOW+65000),b=projectScene(turn,NOW+66000);for(const row of a.checkpoint.rows){const match=b.checkpoint.rows.find(x=>x.time===row.time);if(match)assert.deepEqual(row,match)}
});
test('long closed-page gaps take bounded work, retain valid OHLC and restore an identical continuation',()=>{
 const running=startAutomation(scene(),-1,NOW),future=NOW+365*10*86400000,a=projectScene(running,future),b=projectScene(a,future);
 assert.equal(a.checkpoint.rows.length,120);assert.ok(validateScene(a));assert.deepEqual(a,b);assert.ok(a.checkpoint.total>1e8);for(const c of a.checkpoint.rows){assert.ok(Number.isFinite(c.close)&&c.close>0);assert.ok(c.high>=c.open&&c.high>=c.close&&c.low<=c.open&&c.low<=c.close)}
});
test('stopping freezes the last common frame and a later start continues at that price',()=>{
 const running=startAutomation(scene(),1,NOW),stopped=stopAutomation(running,NOW+15500);assert.equal(stopped.checkpoint.automation,undefined);assert.equal(stopped.clock,undefined);assert.deepEqual(projectScene(stopped,NOW+999999),stopped);const resume=startAutomation(stopped,0,NOW+20000);assert.equal(resume.checkpoint.rows.at(-1).close,stopped.checkpoint.rows.at(-1).close);assert.equal(resume.checkpoint.config.direction,0);
});
test('a stable configuration revision accepts newer clock frames and ignores older or duplicate frames',()=>{
 const running=startAutomation(scene(),1,NOW),a=projectScene(running,NOW+1000),b=projectScene(running,NOW+2000);assert.ok(newerFrame(b,a));assert.equal(newerFrame(a,b),false);assert.equal(newerFrame(a,a),false);assert.ok(newerFrame({...a,version:22},b));assert.equal(newerFrame({...b,version:20},a),false);
});
test('invalid clock metadata is rejected and clock rewind does not generate historical candles',()=>{
 const running=startAutomation(scene(),1,NOW);assert.deepEqual(projectScene(running,NOW-10000).checkpoint.rows,running.checkpoint.rows);running.checkpoint.automation.initialMomentum=2;assert.equal(validateScene(running),false);
});

test('a flat automatic scenario also updates its signal from the shared synthetic oscillation',()=>{const running=startAutomation(scene(),0,NOW),samples=Array.from({length:60},(_,i)=>projectScene(running,NOW+(i+1)*1000).signal);assert.ok(new Set(samples.map(s=>s.direction)).size>=2);assert.ok(new Set(samples.map(s=>s.level)).size>=2);assert.deepEqual(projectScene(running,NOW+15000).signal,projectScene(structuredClone(running),NOW+15000).signal)});

test('signals keep varying after the initial ramp in all three scenarios',()=>{
 for(const direction of [-1,0,1]){
  const running=startAutomation(scene(),direction,NOW),samples=Array.from({length:500},(_,i)=>projectScene(running,NOW+(300+i*3)*1000).signal);
  assert.equal(new Set(samples.map(s=>s.level)).size,6);
  assert.ok(samples.some(s=>s.direction===0));
  if(direction!==0)assert.ok(samples.filter(s=>s.direction===direction).length>samples.length*.6);
  assert.ok(samples.some((s,i)=>i&&s.level!==samples[i-1].level));
 }
});
test('the shared three-step hold prevents second-by-second label flicker',()=>{
 const running=startAutomation(scene(),0,NOW);
 for(let t=120;t<300;t+=3){const a=projectScene(running,NOW+t*1000).signal;assert.deepEqual(projectScene(running,NOW+(t+1)*1000).signal,a);assert.deepEqual(projectScene(running,NOW+(t+2)*1000).signal,a)}
});
test('a direction command preserves the current signal before gradually changing it',()=>{
 const running=startAutomation(scene(),1,NOW),at=NOW+733000,before=projectScene(running,at),turn=startAutomation(running,-1,at);
 assert.equal(turn.signal.direction,before.signal.direction);assert.equal(turn.signal.level,before.signal.level);
 assert.deepEqual(turn.checkpoint.rows,before.checkpoint.rows);
 assert.equal(validateScene({...turn,checkpoint:{...turn.checkpoint,automation:{...turn.checkpoint.automation,initialSignalScore:Infinity}}}),false);
});
test('late signals include temporary reversals and do not repeat the same short cycle',()=>{
 const running=startAutomation(scene(),1,NOW),start=86400;
 const samples=Array.from({length:300},(_,i)=>projectScene(running,NOW+(start+i*3)*1000).signal);
 assert.ok(samples.some(s=>s.direction===-1));assert.ok(samples.some(s=>s.direction===1));
 assert.notDeepEqual(samples.slice(0,60),samples.slice(60,120));
});
