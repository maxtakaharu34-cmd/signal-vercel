import test from 'node:test';import assert from 'node:assert/strict';import {csvCell,eventsCsv,sceneJson} from '../web/exports.mjs';import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
test('CSV exports preserve multiline text while neutralizing spreadsheet formula strings',()=>{
 assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');assert.equal(csvCell('hello\nworld'),'"hello\nworld"');assert.equal(csvCell(-1),'"-1"');
 const text=eventsCsv([{version:2,created_at:'2026-11-05',label:'=test',detail:{config:{direction:1,volatility:3,speed:2},signal:{direction:-1,level:'極寒',note:'日本語,改行\n引用"'},announcement:'@SUM(1)'}}]);assert.ok(text.startsWith('\ufeff'));assert.match(text,/'=test/);assert.match(text,/'@SUM/);assert.match(text,/上昇/);assert.match(text,/下降/);assert.ok(text.includes('日本語,改行\n引用""'));
});
test('snapshot export contains the acknowledged revision and no identity or session fields',()=>{
 const record={version:4,updated_at:'now',checkpoint:initialCheckpoint(),signal:{...DEFAULT_SIGNAL},announcement:'共通',actor_site_id:'private actor',session:'private session'};const value=JSON.parse(sceneJson(record,new Date('2026-11-05T00:00:00Z')));assert.equal(value.simulation,true);assert.equal(value.version,4);assert.deepEqual(value.checkpoint,record.checkpoint);assert.equal(value.exportedAt,'2026-11-05T00:00:00.000Z');assert.ok(!('session'in value));assert.ok(!('actor_site_id'in value));
});
