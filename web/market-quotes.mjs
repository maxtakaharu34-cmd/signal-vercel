import {instrumentInfo} from './instruments.mjs';

export const QUOTE_SIDES = ['bid', 'ask', 'mid'];
export const QUOTE_LABELS = {bid:'Bid', ask:'Ask', mid:'中心値'};

export function quotePair(price,instrument) {
 const {digits,spreadTicks}=instrumentInfo(instrument);
 const scale=10**digits;
 const midTicks = Math.round(price * scale);
 const bidTicks = Math.max(1, midTicks - spreadTicks / 2);
 return {
  bid:bidTicks / scale,
  ask:(bidTicks + spreadTicks) / scale,
  spread:spreadTicks / scale,
 };
}

// Both quote functions are monotone in the simulated index. Projecting the
// existing OHLC therefore gives the same extrema as projecting each tick.
export function quoteCandles(rows, side,instrument) {
 if (side !== 'bid' && side !== 'ask') return rows;
 return rows.map(({time, open, high, low, close}) => ({
  time,
  open:quotePair(open,instrument)[side],
  high:quotePair(high,instrument)[side],
  low:quotePair(low,instrument)[side],
  close:quotePair(close,instrument)[side],
 }));
}
