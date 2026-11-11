import {series,candle,generator} from './lib/simulation.mjs';
import {validateCheckpoint} from './checkpoint.mjs';
export const LEVELS=['極寒','寒気','晩秋','新春','初夏','猛暑'];
export const DEFAULT_SIGNAL={direction:0,level:'新春',note:'管理者が設定したシミュレーション用の参考シグナルです。'};
export function initialCheckpoint(seed=20261105){const config={direction:0,volatility:3,speed:1},{rows,rng}=series(seed,config);return {schemaVersion:1,seed,total:72,config,rows,rngState:rng.state()}}
export function validateScene(value){return !!value&&validateCheckpoint(value.checkpoint)&&!!value.signal&&[-1,0,1].includes(value.signal.direction)&&LEVELS.includes(value.signal.level)&&typeof value.signal.note==='string'&&value.signal.note.length<=280&&typeof value.announcement==='string'&&value.announcement.length<=180}
export function createEngine(checkpoint=initialCheckpoint()){
 if(!validateCheckpoint(checkpoint))throw Error('シナリオデータの形式を確認してください。');
 let state=structuredClone(checkpoint),rng=generator(state.rngState);
 return {
 snapshot:()=>({...structuredClone(state),rngState:rng.state()}),
 configure(patch){if(state.automation)throw Error('自動シミュレーションを停止してから編集してください。');const next={...state,config:{...state.config,...patch}};if(!validateCheckpoint(next))throw Error('シナリオ設定の範囲が正しくありません。');state=next},
 step(){if(state.automation)throw Error('自動生成中は手動で足を追加できません。');delete state.market;const previous=state.rows.at(-1);state.rows.push(candle(previous.close,state.config,rng,previous.time+1));if(state.rows.length>120)state.rows.shift();state.total++;state.rngState=rng.state()},
 reset(seed=state.seed){state=initialCheckpoint(seed);rng=generator(state.rngState)}
 }
}
export const directionLabel=value=>value>0?'上昇':value<0?'下降':'横ばい';
export const directionCode=value=>value>0?'UP':value<0?'DOWN':'WAIT';
