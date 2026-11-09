import {directionLabel} from './engine.mjs';

export function sceneChanges(published,draft){
 const changes=[],add=(label,before,after)=>{if(before!==after)changes.push({label,before:String(before||'未設定'),after:String(after||'未設定')})};
 const before=published.checkpoint,after=draft.checkpoint;
 add('価格の方向',directionLabel(before.config.direction),directionLabel(after.config.direction));
 add('生成速度',before.config.speed+'倍',after.config.speed+'倍');
 add('値動きの大きさ',before.config.volatility+' / 10',after.config.volatility+' / 10');
 add('シグナルの方向',directionLabel(published.signal.direction),directionLabel(draft.signal.direction));
 add('期待度',published.signal.level,draft.signal.level);
 add('シグナルの補足',published.signal.note,draft.signal.note);
 add('お知らせ',published.announcement,draft.announcement);
 if(before.total!==after.total)add('生成本数',before.total+'本',after.total+'本');
 else if(JSON.stringify(before.rows)!==JSON.stringify(after.rows))add('ローソク足','公開中の生成履歴','プレビューの生成履歴に置き換え');
 return changes;
}

export function renderChanges(document,changes){
 const container=document.getElementById('publishDiff'),list=document.getElementById('publishDiffRows');if(!container||!list)return;
 container.hidden=!changes.length;list.replaceChildren();
 for(const change of changes){const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd'),before=document.createElement('span'),arrow=document.createElement('span'),after=document.createElement('strong');
  label.textContent=change.label;before.textContent=change.before;before.className='diff-before';arrow.textContent=' → ';arrow.setAttribute('aria-label','から');after.textContent=change.after;value.append(before,arrow,after);row.append(label,value);list.append(row);
 }
}
