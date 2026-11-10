import * as LightweightCharts from 'lightweight-charts';
import {metrics} from './lib/analytics.mjs';
import {studySeries} from './studies.mjs';
import {simulationTimestamp} from './timeline.mjs';

const timeFormat=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function candleTimeLabel(checkpoint,time){const stamp=simulationTimestamp(checkpoint,time);return stamp?timeFormat.format(new Date(stamp)):'T'+time}

// Absolute candle IDs survive a rolling 120-bar buffer and scenario re-anchors.
// They are internal horizontal keys, not Unix dates. Every displayed time uses
// candleTimeLabel, so a missing timestamp can never turn into a 1970 date.
export function resolveChartWindow(rows,{range=null,following=true,count=36,reset=false}={}){
 if(!rows.length)return null;
 const first=rows[0].time,last=rows.at(-1).time;
 const span=Math.min(rows.length+2,Math.max(8,!reset&&range?range.to-range.from:count+1));
 const from=following||reset?last+2-span:Math.max(first-1,Math.min(last+2-span,range?.from??first-1));
 return {from,to:from+span};
}

export function createTerminalChart({element,window,onInspect=()=>{},onViewport=()=>{},library=LightweightCharts}){
 // Keep the SVG renderer as an explicit compatibility fallback. DOM-only tests
 // do not claim to exercise Canvas; adapter tests inject a chart API separately.
 if(library===LightweightCharts&&!window.CanvasRenderingContext2D)return null;
 const {createChart,CandlestickSeries,LineSeries,HistogramSeries,ColorType,CrosshairMode,LineStyle}=library;
 let record=null,rows=[],range=null,following=true,selected=null,previousCount=null,previousStudy='none',previousColors=null,lastData=null,destroyed=false,writing=false;
 const format=time=>record?candleTimeLabel(record.checkpoint,Number(time)):'T'+time;
 const chart=createChart(element,{
  autoSize:true,
  layout:{
   background:{type:ColorType.Solid,color:'#fcfcfd'},
   textColor:'#485560',
   fontFamily:'system-ui, "Segoe UI", Arial, sans-serif',
   fontSize:11,
   attributionLogo:true,
   panes:{separatorColor:'#d7dde3',separatorHoverColor:'#b9c5d1',enableResize:true},
  },
  grid:{vertLines:{color:'#eceff2'},horzLines:{color:'#e0e5e9'}},
  crosshair:{mode:CrosshairMode.Normal,vertLine:{color:'#8996a6',labelBackgroundColor:'#34475d'},horzLine:{color:'#8996a6',labelBackgroundColor:'#34475d'}},
  rightPriceScale:{borderColor:'#cfd6dc',minimumWidth:64,scaleMargins:{top:.12,bottom:.1}},
  timeScale:{borderColor:'#cfd6dc',timeVisible:true,secondsVisible:true,rightOffset:2,minBarSpacing:3,fixLeftEdge:true,fixRightEdge:true,shiftVisibleRangeOnNewBar:false,tickMarkFormatter:format,tickMarkMaxCharacterLength:8},
  localization:{locale:'ja-JP',timeFormatter:format},
  handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
  handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true,axisDoubleClickReset:true},
 });
 const price=chart.addSeries(CandlestickSeries,{priceFormat:{type:'price',precision:3,minMove:.001},borderVisible:false,priceLineColor:'#485e75',priceLineStyle:LineStyle.Dashed});
 const lineOptions={lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};
 const maLine=chart.addSeries(LineSeries,{...lineOptions,color:'#bd8e35'});
 const upper=chart.addSeries(LineSeries,{...lineOptions,color:'#9cacc1',lineStyle:LineStyle.Dashed});
 const lower=chart.addSeries(LineSeries,{...lineOptions,color:'#9cacc1',lineStyle:LineStyle.Dashed});
 let studies=[];
 function palette(colors){return colors==='intl'?{up:'#16866b',down:'#d34c59'}:{up:'#de5149',down:'#327cc5'}}
 function configureStudy(kind){
  if(kind===previousStudy)return;
  for(const series of studies)chart.removeSeries(series);studies=[];previousStudy=kind;
  if(kind==='rsi'){
   const rsi=chart.addSeries(LineSeries,{...lineOptions,color:'#825bac',lineWidth:2,priceFormat:{type:'price',precision:1,minMove:.1},autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})},1);
   for(const value of [30,50,70])rsi.createPriceLine({price:value,color:'#d5dce5',lineStyle:LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});
   studies=[rsi];
  }else if(kind==='macd'){
   studies=[chart.addSeries(HistogramSeries,{priceLineVisible:false,lastValueVisible:false,priceFormat:{type:'price',precision:3,minMove:.001}},1),chart.addSeries(LineSeries,{...lineOptions,color:'#327cc5'},1),chart.addSeries(LineSeries,{...lineOptions,color:'#bd8e35'},1)];
  }
  chart.panes()[0]?.setStretchFactor(3);
  chart.panes()[1]?.setStretchFactor(1);
 }
 function viewport(){onViewport({following,range:range&&{...range},selectionTime:selected})}
 const onRange=logical=>{
  if(writing||destroyed||!logical||!rows.length)return;
  range={from:rows[0].time+logical.from,to:rows[0].time+logical.to};following=logical.to>=rows.length-1;viewport();
 };
 const onCrosshair=event=>{
  if(writing||destroyed)return;
  const time=typeof event.time==='number'&&rows.some(row=>row.time===event.time)?event.time:null;
  if(time===selected)return;selected=time;onInspect(time);
 };
 chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);chart.subscribeCrosshairMove(onCrosshair);
 function update({record:next,ma=true,bands=false,study='none',colors='jp',maxBars=null,selectionTime=null}){
  if(destroyed)return;
  record=next;const count=maxBars??(element.getBoundingClientRect().width<600?36:72),nextRows=next.checkpoint.rows;
  const reset=previousCount!==count||rows.length&&nextRows.at(-1).time<rows.at(-1).time;
  const savedRange=resolveChartWindow(nextRows,{range,following,count,reset});
  const dataChanged=JSON.stringify(nextRows)!==lastData,studyChanged=study!==previousStudy,colorChanged=colors!==previousColors;
  writing=true;
  try{
   const previousSelection=selected;rows=nextRows;selected=rows.some(row=>row.time===selectionTime)?selectionTime:null;
   configureStudy(study);
   const {up,down}=palette(colors);
   if(colorChanged){price.applyOptions({upColor:up,downColor:down,wickUpColor:up,wickDownColor:down});previousColors=colors}
   maLine.applyOptions({visible:ma});upper.applyOptions({visible:bands});lower.applyOptions({visible:bands});
   if(dataChanged||studyChanged||colorChanged){
    price.setData(rows.map(({time,open,high,low,close})=>({time,open,high,low,close})));
    const overlays=metrics(rows).overlays;
    maLine.setData(rows.map((row,i)=>overlays.sma[i]===null?{time:row.time}:{time:row.time,value:overlays.sma[i]}));
    for(const [series,key] of [[upper,'upper'],[lower,'lower']])series.setData(rows.map((row,i)=>overlays.bands[i]?{time:row.time,value:overlays.bands[i][key]}:{time:row.time}));
    const values=studySeries(rows);
    if(study==='rsi')studies[0].setData(values.map(row=>row.rsi===null?{time:row.time}:{time:row.time,value:row.rsi}));
    if(study==='macd')for(const [index,key] of ['histogram','macd','signal'].entries())studies[index].setData(values.map(row=>({time:row.time,value:row[key],...(index===0?{color:row.histogram>=0?up:down}:{})})));
    lastData=JSON.stringify(rows);
   }
   if(savedRange&&(dataChanged||reset||studyChanged)){
    range=savedRange;if(reset)following=true;
    chart.timeScale().setVisibleLogicalRange({from:range.from-rows[0].time,to:range.to-rows[0].time});
   }
   previousCount=count;
   // Native pointer movement owns its Y position and pane. Only keyboard
   // selection or new data needs a programmatic candle-ID re-anchor.
   if(selected!==null&&(selected!==previousSelection||dataChanged))chart.setCrosshairPosition(rows.find(row=>row.time===selected).close,selected,price);
   else if(selected===null&&previousSelection!==null)chart.clearCrosshairPosition();
  }finally{writing=false}
  viewport();
 }
 return {update,follow(){following=true;range=null;previousCount=null;selected=null;writing=true;try{chart.clearCrosshairPosition()}finally{writing=false}},state:()=>({following,range:range&&{...range},selectionTime:selected}),destroy(){if(destroyed)return;destroyed=true;chart.unsubscribeCrosshairMove(onCrosshair);chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);chart.remove()}};
}
