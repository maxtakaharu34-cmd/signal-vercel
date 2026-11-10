// Exercise the installed Lightweight Charts implementation with a no-op Canvas.
// This checks engine integration, not rendered pixels or physical gestures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import * as library from 'lightweight-charts';
import {createTerminalChart} from '../web/terminal-chart.mjs';
import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
import {projectScene,startAutomation} from '../web/timeline.mjs';

test('the installed chart engine accepts real frames, indicator panes, buffer rotation and cleanup',async()=>{
 const window=new Window(),saved=new Map();let controller,api;
 for(const [key,value] of Object.entries({window,document:window.document,navigator:window.navigator,location:window.location,HTMLElement:window.HTMLElement,ResizeObserver:window.ResizeObserver,requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window)})){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 }
 window.HTMLCanvasElement.prototype.getContext=function(){
  return this.testContext??=new Proxy({canvas:this,measureText:text=>({width:String(text).length*6,actualBoundingBoxAscent:9,actualBoundingBoxDescent:3}),createLinearGradient:()=>({addColorStop(){}}),getImageData:()=>({data:new Uint8ClampedArray([0,0,0,255])})},{get:(target,key)=>key in target?target[key]:()=>{}});
 };
 window.document.body.innerHTML='<div id="chart"></div>';const element=window.document.getElementById('chart');element.getBoundingClientRect=()=>({width:390,height:500,left:0,top:0,right:390,bottom:500});
 const now=Date.parse('2026-11-10T01:00:00Z'),source=startAutomation({checkpoint:initialCheckpoint(),signal:DEFAULT_SIGNAL},1,now),frame=step=>projectScene(source,now+step*1000);
 try{
  controller=createTerminalChart({element,window,library:{...library,createChart(el,options){const parse=color=>{const named={black:'#000000',white:'#ffffff'},hex=(named[color]||color).replace(/^#([a-f0-9])([a-f0-9])([a-f0-9])$/i,'#$1$1$2$2$3$3');return /^#[a-f0-9]{6}$/i.test(hex)?[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16)).concat(1):null};api=library.createChart(el,{...options,layout:{...options.layout,colorParsers:[parse]},autoSize:false,width:390,height:500});return api}}});
  for(const study of ['none','rsi','macd','none']){controller.update({record:frame(200),study});assert.equal(api.panes().length,study==='none'?1:2)}
  await new Promise(resolve=>setTimeout(resolve,30));
  api.timeScale().setVisibleLogicalRange({from:10,to:45});await new Promise(resolve=>setTimeout(resolve,30));assert.equal(controller.state().following,false);
  controller.update({record:frame(205)});await new Promise(resolve=>setTimeout(resolve,30));const visible=api.timeScale().getVisibleLogicalRange();assert.ok(Math.abs(visible.from-5)<.01);assert.ok(Math.abs(visible.to-40)<.01);
  controller.follow();controller.update({record:frame(206),study:'rsi'});assert.ok(element.querySelectorAll('canvas').length>=2);
 }finally{
  controller?.destroy();await window.happyDOM.close();for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
 }
});
