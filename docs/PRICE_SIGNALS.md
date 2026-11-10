# Price-derived demo signals (model 2)

Automatic signals describe the common synthetic price path. They do not use
market data, estimate future returns, or represent a probability of success.
The administrator changes future price-generation settings; those settings
are not inputs to signal scoring. Manual mode remains explicitly labelled.

## Evidence

- Use only closed synthetic prices at or before the absolute decision candle.
- Evaluate every three candles, on one shared grid that survives re-anchoring.
- Normalize 8-, 24-, and 48-return net changes by their squared-return energy;
  combine them with weights 0.3 / 0.4 / 0.3.
- Reduce strength when horizons disagree, returns alternate, or one isolated
  move accounts for most of the recent movement. A flat path has zero strength.
- Smooth four decision scores with weights 0.4 / 0.3 / 0.2 / 0.1.
- Require two readings beyond 0.24 to confirm direction; release below 0.12.
  Confirmation expires after eight decision samples without renewed evidence.
- Six strength thresholds are 0 / 0.24 / 0.39 / 0.54 / 0.69 / 0.84. Two readings
  confirm a level; a 0.06 release margin avoids marginal boundary chatter.
  Level confirmation expires after four samples. Levels need not cycle.
- Missing, invalid, or incomplete current prices yield a waiting state.

The model reports direction, relative strength, and a phase such as acceleration,
weakening, short-term counter-movement, or confirmed reversal. These custom
features are not ADX, ATR, a TradingView rating, or a calibrated trading model.

## Continuity and cost

Each new scenario retains at most 120 contiguous prior closes. This supports
confirmation across direction and speed changes without rewriting candles.
Existing saved scenarios need no migration. Projection does not mutate the
stored record or increment its revision. Price generation and RNG are unchanged.

Evaluation has bounded lookback and uses no future samples. Under the same
model and scenario, later reads do not revise earlier signal samples. A model
release can change recomputed historical signal labels; stored audit events
remain unchanged. No prediction-accuracy claim follows from this design.

## Verification

`npm test` covers flat and choppy paths, sustained trends, isolated jumps,
counter-spikes, reversals, price-scale invariance, missing data, causal bounded
lookback, reload consistency, re-anchoring, owner authorization, and actual UI
actions through the API adapter.

For a saved public snapshot and a saved baseline timeline module, run:

```
node scripts/audit-price-signals.mjs BASELINE_MODULE SCENE_JSON OUTPUT_JSON
```

The audit asserts identical price candles and RNG across both signal models.
Its retrospective coherence counts are diagnostic checks against past prices,
not future forecasting accuracy, trading performance, or a backtest.
