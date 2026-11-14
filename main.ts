// btc-cent-forecast-01 entry: 4-hour-ahead BTC/USD point forecast.
//
// Model (chosen by walk-forward backtest on the kit's practice window, Nov 7-11 2026):
// the 4-hour log-return of BTC is, to first order, unpredictable - every
// momentum/drift extrapolation I tested made the mean absolute error WORSE
// (up to +270% for short-horizon drift chasing), and the house persistence
// baseline is a hard benchmark to beat. The one adjustment that improved the
// score in most evaluation slices was a small mean reversion: shrink the
// checkpoint close part-way toward its 12-hour exponential mean in log space.
//
//   forecast = last * exp(0.1 * (ema12h(log price) - log(last)))
//
// Backtest numbers (MAE in cents; persistence = 100%):
//   - walk-forward inside the 6 practice cases, 96 checkpoints:  rev k=0.1  -2.4%
//   - dense pooled checkpoints, 81 points (60-min step + 5 case ends): -2.2%
//   - 10 non-overlapping 4h blocks, Nov 9-11:                       -1.0%
//   - the 5 practice case ends (exact actuals):                      +3.5% (worse)
// The effect is small and within noise on any single slice, so the fraction
// is kept deliberately small (0.1): it takes only a tenth of the gap, wins
// 46 of 81 paired points, and bounds the downside if the edge is spurious
// (the 5-endpoint penalty is +3.5% at k=0.1 versus +6.9% at k=0.2, while
// the dense-pooled gain is nearly the same, -2.2% versus -2.9%). Larger
// fractions and every drift/momentum variant were tested and rejected:
// drift extrapolation made the score worse by up to +270%.
//
// Runtime: Node 22, standard library only, no network. Reads every *.in file
// in $MAKEFUN_INPUT_DIR (else /input) and writes <id>.out to
// $MAKEFUN_OUTPUT_DIR (else /output) as {"forecasts":[{"case":"<id>","price":n}]}.
// Fully deterministic: no randomness, no wall-clock use, one pass over the
// prices, so two runs write byte-identical output.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** Largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Half-life, in minutes, of the exponential mean the close reverts toward. */
const REVERSION_HALF_LIFE_MIN = 720; // 12 hours
/** Fraction of the log gap to that mean that the forecast closes. */
const REVERSION_FRACTION = 0.1;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number =>
  Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/**
 * Exponentially weighted mean of the log closes, ending at the checkpoint.
 * Computed in one forward pass; the decay is applied per minute so the
 * weight of a close halves every REVERSION_HALF_LIFE_MIN minutes.
 */
function logEma(prices: number[]): number {
  const lambda = Math.pow(0.5, 1 / REVERSION_HALF_LIFE_MIN);
  let mean = Math.log(prices[0] as number);
  for (let i = 1; i < prices.length; i++) {
    mean = lambda * mean + (1 - lambda) * Math.log(prices[i] as number);
  }
  return mean;
}

/** Forecast for one market: last close pulled toward its 12h log mean. */
function forecast(market: CaseMarket): number {
  if (!Array.isArray(market.prices) || market.prices.length === 0) {
    throw new Error(`market ${market.id} has no prices`);
  }
  // Last finite close (the checkpoint close); scan back if the tail is bad.
  let last = NaN;
  for (let i = market.prices.length - 1; i >= 0; i--) {
    const v = market.prices[i] as number;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      last = v;
      break;
    }
  }
  if (!Number.isFinite(last)) {
    throw new Error(`market ${market.id} has no finite positive price`);
  }
  const clean = market.prices.filter(
    (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  );
  if (clean.length === 0) throw new Error(`market ${market.id} has no usable prices`);
  const gap = logEma(clean) - Math.log(last);
  return price5(last * Math.exp(REVERSION_FRACTION * gap));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR)
  .filter((f) => f.endsWith('.in'))
  .sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) {
    throw new Error(`${file} does not hold exactly one market`);
  }
  const price = forecast(c.markets[0] as CaseMarket);
  writeFileSync(
    join(OUTPUT_DIR, `${id}.out`),
    `${JSON.stringify({ forecasts: [{ case: id, price }] })}\n`,
  );
}
