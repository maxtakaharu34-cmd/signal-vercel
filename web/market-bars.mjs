export const SIGNAL_PERIOD = 15;
export const CHART_PERIODS = [1, SIGNAL_PERIOD, 60];
export const MAX_MARKET_BARS = 120;
const aggregatePeriods = CHART_PERIODS.slice(1);

// The simulated clock advances once per underlying price step. Keep its epoch
// across scenario changes so that completed bars keep their original times.
export function marketClock(checkpoint) {
 const anchor = checkpoint.automation;
 const boundary = anchor?.originTime ?? checkpoint.rows.at(-1).time;
 if (checkpoint.market?.through === boundary) return checkpoint.market;
 return anchor ? {epoch:Math.floor(anchor.anchorMs / 1000) - anchor.originTime, since:anchor.originTime + 1} : null;
}

export function validMarketHistory(history, boundary, close) {
 if (history === undefined) return true;
 if (!history || !Number.isSafeInteger(history.epoch) || !Number.isSafeInteger(history.through) || history.through < 0 || history.through !== boundary) return false;
 if (!Number.isSafeInteger(history.since) || history.since < 1 || history.since > history.through + 1) return false;
 const end = history.epoch + history.through;
 if (!Number.isSafeInteger(end) || end <= 0 || end > 8.64e12) return false;
 return aggregatePeriods.every(period => {
  const bars = history.bars?.[period];
  const first = Math.floor((history.epoch + history.since - 1) / period);
  const last = Math.floor((end - 1) / period);
  const expected = Math.min(MAX_MARKET_BARS, history.since > history.through ? 0 : last - first + 1);
  return Array.isArray(bars) && bars.length === expected && (!expected || bars.at(-1)?.close === close) && bars.every((bar, index) =>
   bar && bar.time === last - (bars.length - 1 - index) &&
   [bar.open, bar.high, bar.low, bar.close].every(value => Number.isFinite(value) && value > 0) &&
   bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close));
 });
}

export function aggregateMarketBars({period, epoch, first, through, previous = [], candleAt}) {
 const lastBucket = Math.floor((epoch + through - 1) / period);
 const earliest = lastBucket - MAX_MARKET_BARS + 1;
 const bars = previous.filter(bar => bar.time >= earliest);
 for (let time = Math.max(first, earliest * period - epoch + 1); time <= through; time++) {
  const candle = candleAt(time);
  const bucket = Math.floor((epoch + time - 1) / period);
  const last = bars.at(-1);
  if (last?.time === bucket) {
   bars[bars.length - 1] = {...last, high:Math.max(last.high, candle.high), low:Math.min(last.low, candle.low), close:candle.close};
  } else {
   const {open, high, low, close} = candle;
   bars.push({time:bucket, open, high, low, close});
  }
 }
 return bars;
}
