// These are local display preferences, never scenario data or account state.
const KEY='fx-demo-display-v1';
export function readDisplayPreferences(window){
 try{const value=JSON.parse(window.localStorage.getItem(KEY)||'{}');return {colors:value.colors==='intl'?'intl':'jp',maxBars:[36,72].includes(value.maxBars)?value.maxBars:null,changeBase:value.changeBase==='period'?'period':'previous'}}catch{return {colors:'jp',maxBars:null,changeBase:'previous'}}
}
export function saveDisplayPreferences(window,value){
 try{window.localStorage.setItem(KEY,JSON.stringify({colors:value.colors==='intl'?'intl':'jp',maxBars:[36,72].includes(value.maxBars)?value.maxBars:null,changeBase:value.changeBase==='period'?'period':'previous'}))}catch{}
}
export function quoteChange(rows,{base='previous',count=72}={}){
 const last=rows.at(-1);if(!last)return 0;
 const reference=base==='period'?rows.slice(-count)[0].open:rows.at(-2)?.close??last.open;
 return reference?(last.close/reference-1)*100:0;
}
export function createPriceStreak(){
 let previous=null,sign=0,length=0;
 return row=>{if(!row)return null;if(!previous){previous={...row};return null}if(previous.time===row.time&&previous.close===row.close)return null;
  const next=Math.sign(row.close-previous.close);previous={...row};length=next&&next===sign?length+1:next?1:0;sign=next;return length>=3?(sign>0?'up':'down'):null;
 };
}
