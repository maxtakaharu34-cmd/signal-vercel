// Chart API contract tests, not physical browser or Canvas visual verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalChart,resolveChartWindow,candleTimeLabel} from '../web/terminal-chart.mjs';
import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
import {projectScene,startAutomation,createMarketBarReader} from '../web/timeline.mjs';
import {metrics} from '../web/lib/analytics.mjs';
import {studySeries} from '../web/studies.mjs';
const now=Date.parse('2026-11-10T01:00:00Z');
const source=startAutomation({checkpoint:initialCheckpoint(),signal:DEFAULT_SIGNAL},1,now);
const frame=step=>projectScene(source,now+step*1000);
function fixture(){
 const api={series:[],removed:false,panes(){return Array.from({length:Math.max(0,...this.series.map(s=>s.pane))+1},()=>({setStretchFactor(){}}))},addSeries(type,options,pane=0){const s={type,options,pane,writes:0,setData(data){for(const row of data)for(const key of ['open','high','low','close','value'])if(key in row)assert.ok(Number.isFinite(row[key]),key);this.data=structuredClone(data);this.writes++},applyOptions(options){Object.assign(this.options,options)},createPriceLine(){}};this.series.push(s);return s},removeSeries(s){this.series=this.series.filter(item=>item!==s)},timeScale(){return scale},subscribeCrosshairMove(fn){this.crosshair=fn},unsubscribeCrosshairMove(){this.crosshair=null},setCrosshairPosition(price,time){this.cursor={price,time}},clearCrosshairPosition(){this.cursor=null},remove(){this.removed=true}};
 const scale={subscribeVisibleLogicalRangeChange(fn){this.onRange=fn},unsubscribeVisibleLogicalRangeChange(){this.onRange=null},setVisibleLogicalRange(range){this.range={...range};this.onRange?.(range)},applyOptions(options){this.options=options}};
 const library={createChart(element,options){api.options=options;return api},ColorType:{Solid:'solid'},CrosshairMode:{Normal:0},LineStyle:{Dashed:2},CandlestickSeries:'candle',LineSeries:'line',HistogramSeries:'histogram'};
 const inspected=[],viewport=[],controller=createTerminalChart({element:{getBoundingClientRect:()=>({width:390})},window:{},library,onInspect:time=>inspected.push(time),onViewport:value=>viewport.push(value)});
 return {api,scale,controller,inspected,viewport};
}
test('the adapter renders only authoritative OHLC, uses existing indicator math, and switches panes without leaking series',()=>{
 const f=fixture(),record=frame(200);try{
  f.controller.update({record,study:'rsi'});
  assert.deepEqual(f.api.series[0].data,record.checkpoint.rows);
  assert.equal(f.api.options.handleScale.pinch,true);assert.equal(f.api.options.handleScroll.horzTouchDrag,true);assert.equal(f.api.options.handleScroll.vertTouchDrag,false);
  assert.equal(f.api.series[1].data.at(-1).value,metrics(record.checkpoint.rows).sma);
  assert.equal(f.api.series[4].data.at(-1).value,studySeries(record.checkpoint.rows).at(-1).rsi);
  assert.equal(f.api.series.length,5);f.controller.update({record,study:'macd',colors:'intl'});assert.equal(f.api.series.length,7);
  assert.equal(f.api.series[4].data.at(-1).value,studySeries(record.checkpoint.rows).at(-1).histogram);
  f.controller.update({record,study:'none',ma:false,bands:true});assert.equal(f.api.series.length,4);assert.equal(f.api.series[1].options.visible,false);assert.equal(f.api.series[2].options.visible,true);
  const writes=f.api.series[0].writes;f.controller.update({record,ma:false,bands:true,selectionTime:record.checkpoint.rows[10].time});assert.equal(f.api.series[0].writes,writes);
 }finally{f.controller.destroy()}assert.equal(f.api.removed,true);assert.equal(f.scale.onRange,null);assert.equal(f.api.crosshair,null);
});
test('browsing and zoom survive live appends and buffer rotation; latest restores following',()=>{
 const f=fixture();try{
  const record=frame(200),first=record.checkpoint.rows[0].time;f.controller.update({record});
  f.scale.onRange({from:10,to:45});const range=f.controller.state().range;assert.equal(f.controller.state().following,false);
  f.controller.update({record:frame(205)});assert.deepEqual(f.controller.state().range,range);assert.deepEqual(f.scale.range,{from:5,to:40});
  f.controller.update({record:frame(500)});assert.equal(f.controller.state().range.from,frame(500).checkpoint.rows[0].time-1);assert.equal(f.controller.state().following,false);
  f.controller.follow();f.controller.update({record:frame(501)});assert.equal(f.controller.state().following,true);assert.equal(f.controller.state().range.to,frame(501).checkpoint.rows.at(-1).time+2);
  f.scale.onRange({from:100,to:121});f.controller.update({record:frame(502)});assert.equal(f.controller.state().range.to-f.controller.state().range.from,21);assert.equal(f.controller.state().range.to,frame(502).checkpoint.rows.at(-1).time+2);
  assert.ok(first>0);
 }finally{f.controller.destroy()}
});
test('inspection is anchored by candle ID and expired selections clear without rewriting prices',()=>{
 const f=fixture(),record=frame(200),selected=record.checkpoint.rows[40];try{
  f.controller.update({record});f.api.crosshair({time:selected.time});assert.deepEqual(f.inspected,[selected.time]);
  f.controller.update({record:frame(205),selectionTime:selected.time});assert.deepEqual(f.api.cursor,{time:selected.time,price:selected.close});
  f.controller.update({record:frame(500),selectionTime:selected.time});assert.equal(f.api.cursor,null);assert.equal(f.controller.state().selectionTime,null);
 }finally{f.controller.destroy()}
});
test('axis labels never treat generated indices as Unix dates and range resolution is bounded',()=>{
 const record=frame(200),time=record.checkpoint.rows.at(-1).time;
 assert.match(candleTimeLabel(record.checkpoint,time),/^\d{2}:\d{2}:\d{2}$/);assert.equal(candleTimeLabel(initialCheckpoint(),71),'T71');
 assert.equal(candleTimeLabel(record.checkpoint,0),'T0');assert.equal(resolveChartWindow([]),null);
 const range=resolveChartWindow(record.checkpoint.rows,{range:{from:-1e9,to:1e9},following:false});assert.ok(range.from>=record.checkpoint.rows[0].time-1);assert.ok(range.to<=time+2);
});
test('market candles and the crosshair use the true start times for every displayed period',()=>{
 const f=fixture(),record=frame(240),read=createMarketBarReader();
 try{
  for(const period of [60,15,1]){
   const rows=read(record.checkpoint,period),selected=rows.at(-2),marketView={rows,period};
   f.controller.update({record,marketView,study:'rsi',selectionTime:selected.time});
   assert.equal(f.api.series[0].data.at(-2).time,selected.time*period);
   assert.equal(f.api.series[4].data.at(-2).time,selected.time*period);
   assert.deepEqual(f.api.cursor,{time:selected.time*period,price:selected.close});
   f.api.crosshair({time:rows.at(-1).time*period});
   assert.equal(f.inspected.at(-1),rows.at(-1).time);
   assert.equal(f.scale.options.secondsVisible,period!==60);
  }
 }finally{f.controller.destroy()}
});
