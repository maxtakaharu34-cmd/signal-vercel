export const QUOTE_SIDES = ['bid', 'ask', 'mid'];
export const QUOTE_LABELS = {bid:'Bid', ask:'Ask', mid:'中心値'};

const TICKS_PER_POINT = 1000;
const SPREAD_TICKS = 6;

export function quotePair(price) {
 const midTicks = Math.round(price * TICKS_PER_POINT);
 const bidTicks = Math.max(1, midTicks - SPREAD_TICKS / 2);
 return {
  bid:bidTicks / TICKS_PER_POINT,
  ask:(bidTicks + SPREAD_TICKS) / TICKS_PER_POINT,
  spread:SPREAD_TICKS / TICKS_PER_POINT,
 };
}

// Both quote functions are monotone in the simulated index. Projecting the
// existing OHLC therefore gives the same extrema as projecting each tick.
export function quoteCandles(rows, side) {
 if (side !== 'bid' && side !== 'ask') return rows;
 return rows.map(({time, open, high, low, close}) => ({
  time,
  open:quotePair(open)[side],
  high:quotePair(high)[side],
  low:quotePair(low)[side],
  close:quotePair(close)[side],
 }));
}
