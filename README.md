# BTC 4-hour price forecaster

Entry for make.fun bounty `btc-cent-forecast-01`: forecast Bitcoin's USD
price 240 minutes after each checkpoint, from the 4,320 one-minute closes
of the 72 hours up to it. Scored by mean absolute error in cents; a prize
needs a score strictly below the house persistence baseline.

## Model

`main.ts` (Node 22, standard library only, no network) forecasts the
checkpoint close pulled a tenth of the way toward its 12-hour exponential
mean in log space:

```
forecast = last * exp(0.1 * (ema12h(log price) - log(last)))
```

Why: on the kit's practice window (Nov 7-11 2026) every momentum/drift
extrapolation I tested made the mean absolute error worse (up to +270%),
while this small mean reversion improved it in three of four evaluation
slices — walk-forward inside the practice cases −2.4%, dense pooled
checkpoints −2.2%, non-overlapping 4h blocks −1.0% — and wins 46 of 81
paired points. The fraction is kept at 0.1 on purpose: the edge is small
and noisy (the five practice case ends alone score +3.5% worse than
persistence), so the adjustment stays tiny and the downside bounded.

## Run

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `*.in` in the input dir, writes `<id>.out` as
`{"forecasts":[{"case":"<id>","price":<number>}]}`. Deterministic: two runs
write byte-identical output. About 35 ms per case, far under the 8 s cap.
