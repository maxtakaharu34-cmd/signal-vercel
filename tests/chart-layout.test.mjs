import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {chartSvg,chartGeometry,chartHitIndex} from '../web/render.mjs';
import {initialCheckpoint} from '../web/engine.mjs';

test('candle bodies fit their slots and price labels stay inside phone and desktop charts',async()=>{
 const window=new Window(),rows=initialCheckpoint().rows;
 try{for(const [width,height,count] of [[240,240,72],[280,280,36],[360,280,72],[768,380,72],[1200,380,72]]){
  const svg=window.document.createElementNS('http://www.w3.org/2000/svg','svg');svg.innerHTML=chartSvg(rows,{width,height,maxBars:count});
  const candles=[...svg.querySelectorAll('rect')].filter(e=>!e.hasAttribute('rx')||e.getAttribute('rx')==='.5');assert.equal(candles.length,count);
  const g=chartGeometry(width,height,count);assert.ok(g.candleWidth<g.step);
  for(const candle of candles){const x=Number(candle.getAttribute('x')),y=Number(candle.getAttribute('y')),w=Number(candle.getAttribute('width')),h=Number(candle.getAttribute('height'));assert.ok(x>=0&&x+w<g.right);assert.ok(y>=g.top&&y+h<=g.bottom+1.2)}
  for(const label of svg.querySelectorAll('text')){assert.ok(Number(label.getAttribute('x'))>=0&&Number(label.getAttribute('x'))<width);assert.ok(Number(label.getAttribute('y'))<height)}
  assert.equal(chartHitIndex(-100,width,count),0);assert.equal(chartHitIndex(width+100,width,count),count-1);
  for(let i=0;i<count;i++)assert.equal(chartHitIndex(22+i*g.step,width,count),i);
 }}finally{await window.happyDOM.close()}
});
