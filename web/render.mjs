import {validAutomation,signalDiagnostics,signalHistory,simulationTimestamp} from './timeline.mjs';
import {marketContext} from './market-context.mjs';
import {quoteChange} from './presentation.mjs';
import {metrics} from './lib/analytics.mjs';
import {studySeries,studySvg} from './studies.mjs';
import {LEVELS,directionLabel,directionCode} from './engine.mjs';
const number=(value,digits=3)=>value==null?'—':Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
function renderViewerQuote(element, price) {
 if (!element || element.textContent === price) return;
 const emphasis = element.ownerDocument.createElement('span');
 emphasis.className = 'quote-precision';
 emphasis.textContent = price.slice(-2);
 element.replaceChildren(price.slice(0, -2), emphasis);
}
const time=value=>value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'未公開';
const shortTime=value=>new Date(value).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hourCycle:'h23'});
export function chartGeometry(width,height,count){const right=width-80,top=24,bottom=height-48,step=(right-30)/count;return {right,top,bottom,plotHeight:bottom-top,step,candleWidth:Math.min(6.4,step*.7)}}
export function chartHitIndex(position,width,count){const {step}=chartGeometry(width,380,count);return Math.max(0,Math.min(count-1,Math.round((position-22)/step)))}
export function chartSvg(rows,{ma=true,bands=false,hover=null,width=960,height=380,maxBars=null,timeLabel=null}={}){
 const count=Math.min(maxBars??(width<600?36:72),rows.length),data=rows.slice(-count),calc=metrics(rows),offset=rows.length-data.length;
 const overlayValues=[...(bands?calc.overlays.bands.slice(offset).flatMap(b=>b?[b.upper,b.lower]:[]):[]),...(ma?calc.overlays.sma.slice(offset).filter(v=>v!=null):[])];
 const minimum=Math.min(...data.map(c=>c.low),...overlayValues),maximum=Math.max(...data.map(c=>c.high),...overlayValues),padding=Math.max((maximum-minimum)*.12,.02),low=minimum-padding,high=maximum+padding;
 const {right,top,bottom,plotHeight,step,candleWidth}=chartGeometry(width,height,data.length);
 const x=i=>22+i*step,y=value=>top+(high-value)/(high-low)*plotHeight;
 let svg='';const gridCount=height<200?4:6;for(let i=0;i<gridCount;i++){const yy=top+plotHeight*i/(gridCount-1);svg+=`<line x1="8" x2="${right}" y1="${yy}" y2="${yy}" stroke="var(--chart-grid, #344152)"/><text x="${width-66}" y="${yy+4}" fill="var(--chart-label, #a4afbe)" font-size="11" font-family="monospace">${number(high-(high-low)*i/(gridCount-1))}</text>`}
 const line=(values,color,dashed=false)=>{let path='';values.slice(offset).forEach((v,i)=>{if(v!=null)path+=(path?'L':'M')+x(i)+' '+y(v)+' '});return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" ${dashed?'stroke-dasharray="5 4"':''}/>`};
 if(ma)svg+=line(calc.overlays.sma,'var(--chart-ma, #cb9c48)');if(bands){svg+=line(calc.overlays.bands.map(b=>b?.upper??null),'var(--chart-band, #96afd0)',true)+line(calc.overlays.bands.map(b=>b?.lower??null),'var(--chart-band, #96afd0)',true)}
 data.forEach((c,i)=>{const color=c.close>=c.open?'var(--chart-up, #099b72)':'var(--chart-down, #db5362)';svg+=`<line x1="${x(i)}" x2="${x(i)}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${color}" stroke-width="1.2"/><rect x="${x(i)-candleWidth/2}" y="${Math.min(y(c.open),y(c.close))}" width="${candleWidth}" height="${Math.max(1.2,Math.abs(y(c.open)-y(c.close)))}" fill="${color}" class="candle-body${i===data.length-1?' latest-candle':''}" rx=".5"/>`});
 const last=data.at(-1);svg+=`<line x1="8" x2="${right}" y1="${y(last.close)}" y2="${y(last.close)}" stroke="#2b67b8" stroke-dasharray="4 4" opacity=".65"/><rect x="${width-72}" y="${y(last.close)-10}" width="70" height="20" rx="3" fill="#285e9d"/><text x="${width-37}" y="${y(last.close)+4}" text-anchor="middle" font-size="11" fill="white" font-family="monospace">${number(last.close)}</text>`;
 if(hover!=null&&data[hover])svg+=`<line class="crosshair-horizontal" x1="8" x2="${right}" y1="${y(data[hover].close)}" y2="${y(data[hover].close)}" stroke="#a7b6ca" stroke-dasharray="3 4"/><circle cx="${x(hover)}" cy="${y(data[hover].close)}" r="3" stroke="var(--chart-label, #e3eaf4)" fill="var(--chart-surface, #171e28)"/><line x1="${x(hover)}" x2="${x(hover)}" y1="15" y2="${bottom}" stroke="#8a9bae" stroke-dasharray="3 4"/>`;
 const ticks=timeLabel&&width<340?[0,count-1]:width<480?[0,Math.floor(count/2),count-1]:[0,Math.floor(count/4),Math.floor(count/2),Math.floor(count*3/4),count-1];
 for(const i of [...new Set(ticks)])if(data[i])svg+=`<text x="${x(i)}" y="${height-14}" text-anchor="${timeLabel?(i===0?'start':i===count-1?'end':'middle'):'middle'}" fill="var(--chart-label, #9aabc2)" font-size="11" font-family="monospace">${timeLabel?timeLabel(data[i]):'T'+String(data[i].time).padStart(3,'0')}</text>`;
 return svg;
}
function contextDirection(value){return value===null?'データ不足':value>0?'上向き':value<0?'下向き':'中立'}
function tone(value){return value>0?'up':value<0?'down':'neutral'}
const analysisRecords=new WeakMap();
function renderAnalysis(document,record){
 if(analysisRecords.get(document)===record)return;
 analysisRecords.set(document,record);
 const $=id=>document.getElementById(id),set=(id,value)=>{if($(id))$(id).textContent=value};
 const context=marketContext(record.checkpoint.rows);
 if($('contextHorizons'))$('contextHorizons').innerHTML=context.horizons.map(h=>`<div data-tone="${tone(h.direction)}"><span>${h.label} <small>${h.period}本</small></span><strong>${contextDirection(h.direction)}</strong><b class="mono">${h.change===null?'—':(h.change>=0?'+':'')+number(h.change,3)+'%'}</b></div>`).join('');
 set('contextAgreement',context.agreement);set('contextVolatility',context.volatility);set('contextVolatilityRatio',(context.volatilityRatio===null?'比較不可':number(context.volatilityRatio,2)+'倍')+' · 直近8本 / 前24本');set('contextShape',context.shape);set('contextAtr','ATR 14 / 終値 '+number(context.atrPercent,3)+'%');
 if($('contextReferences'))$('contextReferences').innerHTML=context.references.map(r=>`<div><span>${r.label}</span><strong data-tone="${tone(r.direction)}">${contextDirection(r.direction)}</strong><small>${r.description}</small></div>`).join('');
 const history=signalHistory(record),latest=history.at(-1),signalTime=h=>{const stamp=simulationTimestamp(record.checkpoint,h.time);return stamp?shortTime(stamp)+' JST':'T'+h.time};set('signalSample',latest?signalTime(latest):record.updated_at?time(record.updated_at):'—');
 if($('signalTrail')){
  $('signalTrail').innerHTML=history.map(h=>`<span role="img" aria-label="${signalTime(h)} · ${contextDirection(h.direction)} ${h.level}" data-tone="${tone(h.direction)}" data-strength="${LEVELS.indexOf(h.level)+1}" title="${signalTime(h)} · T${h.time} ${contextDirection(h.direction)} ${h.level}"></span>`).join('');
  $('signalTrail').setAttribute('aria-label',history.length?history.map(h=>'T'+h.time+' '+contextDirection(h.direction)+' '+h.level).join('、'):'手動設定のため、自動判定の履歴はありません');
 }
 set('signalTrailCaption',history.length?'現在のシナリオ · '+history.length+'判定 / 3ステップごと':'手動設定 · 自動判定の履歴なし');
 if($('signalBreakdown')){
  if(latest){const d=signalDiagnostics(record.checkpoint,record.clock.step);$('signalBreakdown').innerHTML=[['短期の勢い · 8本',d.short,true],['中期の勢い · 24本',d.medium,true],['長期の勢い · 48本',d.long,true],['方向の一致度',d.agreement,false],['値動きの継続性',d.efficiency,false],['合成スコア',d.score,true]].map(([label,value,signed])=>`<div><span>${label}</span><b class="mono" data-tone="${signed?tone(value):'neutral'}">${signed&&value>=0?'+':''}${number(value,3)}</b></div>`).join('')}
  else $('signalBreakdown').textContent='管理者による手動設定です。自動算出の内訳はありません。';
 }
}
export function renderScene(document,record,{ma=true,bands=false,study='none',hover=null,maxBars=null,changeBase='previous',externalChart=false,selectionTime=null}={}){
 const $=id=>document.getElementById(id),set=(id,value)=>{const e=$(id);if(e)e.textContent=value};
 if($('chartArea'))$('chartArea').dataset.study=study;const chartElement=externalChart?$('tradeChart'):$('chart'),rect=chartElement?.getBoundingClientRect(),width=Math.max(240,Math.round(rect?.width||960)),height=Math.max(116,Math.round(rect?.height||380)),visibleCount=Math.min(maxBars??(width<600?36:72),record.checkpoint.rows.length);
 const {checkpoint,signal}=record,rows=checkpoint.rows,data=rows.slice(-visibleCount),last=rows.at(-1),change=quoteChange(rows,{base:changeBase,count:visibleCount}),calc=metrics(rows),level=LEVELS.indexOf(signal.level);
 renderAnalysis(document,record);
 const running=validAutomation(checkpoint.automation);set('settingModel',running?(checkpoint.automation.priceModel===2?'不規則な値動き':'周期モデル（旧）'):'手動');set('settingRunState',running?'自動生成中':'手動／停止');set('generatedAt',running&&record.clock?.generatedAt?time(record.clock.generatedAt):'—');
 const card=$('signalCard');if(card){const tag=card.querySelector('.small-tag'),source=card.querySelector('.signal-source');if(tag)tag.textContent=running?'価格から判定':'管理者設定';if(source)source.textContent=running?signal.note.split('。')[0]+' · 仮想価格の変化から判定':'管理者が設定した仮想シナリオ'}
 const mobileSource=document.querySelector('.signal-bar-label');if(mobileSource)mobileSource.textContent=running?signal.note.split('。')[0]:'手動設定';
 const formattedPrice = number(last.close);
 if ($('mobileQuote')) {
  renderViewerQuote($('quote'), formattedPrice);
  renderViewerQuote($('mobileQuote'), formattedPrice);
 } else {
  set('quote', formattedPrice);
 }
 set('landscapeQuote',formattedPrice);set('priceChangeBase',changeBase==='period'?'表示期間の最初の足比':'直前の足比');set('mobileChangeBase',changeBase==='period'?'表示期間比':'直前足比');set('mobilePriceChange',(change>=0?'+':'')+number(change,2)+'%');$('mobilePriceChange')?.setAttribute('data-tone',change>=0?'up':'down');set('priceChange',(change>=0?'+':'')+number(change,2)+'%');$('priceChange')?.setAttribute('data-tone',change>=0?'up':'down');
 const selectedIndex=externalChart?rows.findIndex(row=>row.time===selectionTime):hover,selectionRows=externalChart?rows:data;if($('previousCandle'))$('previousCandle').disabled=selectedIndex===0;if($('nextCandle'))$('nextCandle').disabled=selectedIndex==null||selectedIndex<0||selectedIndex>=selectionRows.length-1;set('statHigh',number(Math.max(...data.map(c=>c.high))));set('statLow',number(Math.min(...data.map(c=>c.low))));set('statRange',number(Math.max(...data.map(c=>c.high))-Math.min(...data.map(c=>c.low))));set('statCount',String(checkpoint.total));
 const tone=signal.direction>0?'up':signal.direction<0?'down':'neutral',symbol=signal.direction>0?'▲':signal.direction<0?'▼':'―';set('mobileSignalDirection',signal.direction===0?'待機':directionLabel(signal.direction));$('mobileSignalDirection')?.setAttribute('data-icon',symbol);$('signalDirection')?.setAttribute('data-icon',symbol);$('mobileSignalBar')?.setAttribute('data-tone',tone);$('landscapeTicker')?.setAttribute('data-tone',tone);$('signalDetailsToggle')?.setAttribute('data-tone',tone);set('landscapeSignal',symbol+' '+(signal.direction===0?'待機':directionLabel(signal.direction))+' · '+signal.level);set('mobileSignalLevel',signal.level+' '+(level+1)+'/6');set('mobileScenario','価格の生成方向：'+directionLabel(checkpoint.config.direction)+(running?' · 自動生成':' · 管理者設定'));const differs=signal.direction!==checkpoint.config.direction;set('signalRelation','価格の生成方向は'+directionLabel(checkpoint.config.direction)+'、表示シグナルは'+(signal.direction===0?'待機':directionLabel(signal.direction))+'です。');if($('signalRelation'))$('signalRelation').hidden=!differs;set('signalCode',directionCode(signal.direction));set('signalDirection',signal.direction===0?'待機':directionLabel(signal.direction));$('signalCard')?.setAttribute('data-tone',signal.direction>0?'up':signal.direction<0?'down':'neutral');set('signalLevel',signal.level);set('signalFraction',`${level+1} / 6`);set('signalNote',signal.note);
 document.querySelectorAll('[data-mobile-level]').forEach(e=>{const current=Number(e.dataset.mobileLevel)===level;e.classList.toggle('active',current);e.classList.toggle('passed',Number(e.dataset.mobileLevel)<level);if(current)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current')});
 document.querySelectorAll('[data-level-bar]').forEach((e,i)=>e.classList.toggle('filled',i<=level));document.querySelectorAll('[data-level-label]').forEach(e=>{const current=Number(e.dataset.levelLabel)===level;e.classList.toggle('on',current);if(current)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current')});
 set('settingDirection',directionLabel(checkpoint.config.direction));set('settingSpeed',checkpoint.config.speed+'×');set('settingVolatility',checkpoint.config.volatility+' / 10');set('revision',record.version?'#'+String(record.version).padStart(4,'0'):'未同期');set('settingRevision',record.version?'#'+String(record.version).padStart(4,'0'):'未同期');set('updatedAt',record.updated_at?time(record.updated_at):'プレビュー');
 for(const [id,value] of Object.entries({metricRsi:calc.rsi,metricMacd:calc.macd,metricSma:calc.sma,metricEma:calc.ema,metricAtr:calc.atr,metricUpper:calc.band?.upper,metricLower:calc.band?.lower,metricSignal:calc.macdSignal}))set(id,number(value,id==='metricRsi'?1:3));
 const studyPanel=$('studyPanel');if(studyPanel){studyPanel.hidden=study==='none';set('chartIndicatorSummary',[ma?'MA20':null,bands?'BB':null,study==='none'?null:study.toUpperCase()].filter(Boolean).join(' · ')||'なし');if(study!=='none'){const series=studySeries(rows),sample=externalChart?(series.find(row=>row.time===selectionTime)||series.at(-1)):series.slice(-visibleCount)[hover??visibleCount-1]||series.at(-1);set('studyTitle',study==='rsi'?'RSI 14':'MACD 12,26,9');set('studyLegend',study==='rsi'?'基準線 30 / 50 / 70':'MACD / Signal / 差分');const value=study==='rsi'?number(sample.rsi,1):number(sample.macd);set('studyValue',value);const svg=$('studyChart');svg.setAttribute('viewBox',`0 0 ${width} 92`);svg.setAttribute('aria-description',study==='rsi'?'0から100の範囲、30・50・70の基準線を表示':'青線はMACD、黄線はシグナル線、棒はMACDとシグナル線の差分');svg.setAttribute('aria-label',(study==='rsi'?'RSI 14':'MACD 12,26,9')+' '+((externalChart?selectionTime===null:hover===null)?'最新':'選択足')+' '+value+(study==='macd'?'、シグナル線 '+number(sample.signal)+'、差分 '+number(sample.histogram):'')+'、ローソク足と同じ仮想データから計算');if(!externalChart)svg.innerHTML=studySvg(series,{kind:study,count:visibleCount,width,hover})}}const chart=$('chart');if(chart){chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.dataset.count=String(visibleCount);chart.dataset.width=String(width);if(!externalChart)chart.innerHTML=chartSvg(rows,{ma,bands,hover,width,height,maxBars,timeLabel:running?row=>{const ts=simulationTimestamp(checkpoint,row.time);return ts?shortTime(ts):'T'+row.time}:null})}set('visibleRange','直近'+visibleCount+'本を表示');const inspected=externalChart?selectionTime!==null:hover!==null,current=externalChart?(rows.find(row=>row.time===selectionTime)||last):data[hover??data.length-1]||last;const selectedAt=simulationTimestamp(checkpoint,current.time);set('selectedCandle',inspected?(selectedAt?shortTime(selectedAt)+' JST':'T'+current.time):'最新');set('axisTimeBasis',running?'JST · 1本＝1ステップ':'生成順 · 1本＝1ステップ');$('followLatest')?.setAttribute('aria-pressed',String(hover===null));for(const k of ['open','high','low','close'])set('ohlc-'+k,number(current[k]));
 const tbody=$('candleRows');if(tbody)tbody.innerHTML=rows.slice(-10).reverse().map(c=>{const stamp=simulationTimestamp(checkpoint,c.time),label=stamp?`<time datetime="${stamp}" title="${stamp}">${shortTime(stamp)}</time><small class="step-reference">T${c.time}</small>`:'T'+String(c.time).padStart(3,'0');return `<tr><td class="mono">${label}</td><td>${number(c.open)}</td><td>${number(c.high)}</td><td>${number(c.low)}</td><td class="weight">${number(c.close)}</td><td class="${c.close>=c.open?'positive':'negative'}">${c.close>=c.open?'+':''}${number((c.close/c.open-1)*100,3)}%</td></tr>`}).join('');
 set('announcementText',record.announcement);if($('announcement'))$('announcement').hidden=!record.announcement;
}
export function renderEvents(document,events){
 const host=document.getElementById('eventList');if(!host)return;host.replaceChildren();
 if(!events?.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='公開すると、変更内容がここに記録されます。';host.append(empty);return}
 for(const event of events){
  const item=document.createElement('div');item.className='timeline-item';const dot=document.createElement('span');dot.className='timeline-dot';
  const content=document.createElement('div'),label=document.createElement('p');label.className='timeline-label';label.textContent=event.label;
  const details=document.createElement('small');details.textContent=time(event.created_at)+' · #'+event.version;content.append(label,details);
  const d=event.detail;if(d){const expand=document.createElement('details');expand.className='event-details';const summary=document.createElement('summary');summary.textContent='設定内容を見る';const list=document.createElement('dl');
   const rows=[['シナリオ',d.config?directionLabel(d.config.direction)+' / 変動幅 '+d.config.volatility+' / 速度 '+d.config.speed+'×':'—'],['シグナル',d.signal?directionLabel(d.signal.direction)+' / '+d.signal.level:'—'],['補足',d.signal?.note||'なし'],['お知らせ',d.announcement||'なし'],['生成本数',d.total==null?'—':String(d.total)]];
   for(const [key,value] of rows){const row=document.createElement('div'),term=document.createElement('dt'),definition=document.createElement('dd');term.textContent=key;definition.textContent=value;row.append(term,definition);list.append(row)}expand.append(summary,list);content.append(expand)
  }
  item.append(dot,content);host.append(item)
 }
}
