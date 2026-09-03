# 2027 Player Projection Model

Offline build tooling for the Players tab on `projections.html`. None of this
ships to the site. It runs in Node against `data.js` + `history.js` and emits a
single frozen artifact, `proj2027.js`, which is the only file the browser loads.

## Rebuild

Put `data.js` and `history.js` in this directory, then:

```
node build.js        # writes proj2027.js
```

## Verify

```
node scopecheck.js   # global-scope collisions across data.js + proj2027.js + the page
node datacheck.js    # integrity of the frozen file (22 checks)
node backtest.js     # scores the model against held-out 2024-25 and 2025-26
node ablate.js       # confirms each component still earns its place
node measure.js      # raw empirical readouts: reliability, aging, retention, PT
python3 verify.py    # structural assertions on projections.html
python3 render_test.py   # headless render, both tabs, desktop + mobile
```

`splice.py` is the script that inserted the Players tab into `projections.html`.
It is kept for reference only. Do not re-run it against an already-spliced file.

## When a season is added

1. Add it to `history.js`, run its own `audit()`.
2. `node measure.js` — check the aging curve and reliability figures moved sensibly.
3. `node ablate.js` — the aging scalar in `projmodel.js` (`AGE_SCALE`, currently
   0.75) is chosen so the backtest is unbiased. If the unbiased point has moved,
   move the constant with it.
4. `node build.js`, then `node datacheck.js`.

## Do not regenerate proj2027.js casually

The published forecast is frozen on purpose. Regenerate only when you intend to
publish a new, separately dated set, and keep the old file so the two can be
compared against actuals in June.
