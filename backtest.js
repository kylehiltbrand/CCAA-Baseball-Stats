/* Holds out a season, projects it from everything before it, and scores the
   result against three baselines. Also harvests the residual for every
   projected player, which is what the percentile bands on the site are built
   from: bands come from observed model error, not an assumed distribution. */

const M = require('./projmodel.js');
const L = M.L;
const { T, C, SEASONS, CLASS } = M;

/* Build the chain of prior seasons for a player in `targetKey`, looking only
   at seasons strictly before it. Returns [{key,row}] most recent first. */
function chainFor(row, targetKey, kind) {
  const ti = SEASONS.indexOf(targetKey);
  const out = [];
  for (let g = 1; g <= ti; g++) {
    const k = SEASONS[ti - g];
    const ix = L.buildIndex(T[k][kind]);
    const hit = L.findEarlier(row, ix, g);
    if (hit) out.push({ key: k, row: hit.row });
  }
  return out;
}

/* The set of players we could have projected INTO targetKey: anyone with at
   least one season before it, matched forward. Returns the actual target-season
   row alongside the chain that precedes it. */
function backtestSet(targetKey, kind) {
  const ti = SEASONS.indexOf(targetKey);
  if (ti < 1) return [];
  const out = [];
  T[targetKey][kind].forEach(actual => {
    const chain = chainFor(actual, targetKey, kind);
    if (!chain.length) return;
    out.push({ actual, chain, priorKey: chain[0].key });
  });
  return out;
}

function wobaOf(p) {
  const s = (p.h || 0) - (p.doubles || 0) - (p.triples || 0) - (p.hr || 0);
  const den = (p.ab || 0) + (p.bb || 0) + (p.sf || 0) + (p.hbp || 0);
  return den > 0 ? (0.69 * p.bb + 0.72 * p.hbp + 0.88 * s + 1.24 * p.doubles +
    1.56 * p.triples + 2.00 * p.hr) / den : null;
}

function rmse(a) { return Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length); }
function mae(a) { return a.reduce((s, x) => s + Math.abs(x), 0) / a.length; }

const HOLDOUTS = ['2024-25', '2025-26'];
const MIN_ACTUAL_PA = 40;

let resid = [];     // harvested for band construction
const score = { model: [], naive: [], marcel: [], league: [] };

HOLDOUTS.forEach(targetKey => {
  const set = backtestSet(targetKey, 'bat');
  const lgT = C[targetKey];
  set.forEach(s => {
    if ((s.actual.pa || 0) < MIN_ACTUAL_PA) return;
    const actRel = wobaOf(s.actual) / lgT.wOBA;
    if (!isFinite(actRel)) return;

    // the class the player was actually in during the target season
    const toClass = s.actual.year;
    const proj = M.projectBatter(s.chain, toClass, targetKey);
    if (!proj || !proj.wobaRel) return;

    // baseline: prior season carried forward, no regression, no aging
    const pw = wobaOf(s.chain[0].row);
    const naiveRel = pw != null ? pw / C[s.chain[0].key].wOBA : 1;

    // baseline: one blended wOBA, one regression constant (Marcel form)
    let num = 0, den = 0;
    s.chain.forEach((c, i) => {
      const w = M.SEASON_W[i] || 0, pa = c.row.pa || 0, wo = wobaOf(c.row);
      if (!w || !pa || wo == null) return;
      num += w * pa * (wo / C[c.key].wOBA); den += w * pa;
    });
    const nEff = den / M.SEASON_W[0];
    const blended = den ? num / den : 1;
    const wgt = nEff / (nEff + 71);                    // wOBA k from data.js
    const marcelRel = wgt * blended + (1 - wgt) * 1;

    score.model.push(proj.wobaRel - actRel);
    score.naive.push(naiveRel - actRel);
    score.marcel.push(marcelRel - actRel);
    score.league.push(1 - actRel);

    resid.push({
      season: targetKey, name: s.actual.name, team: s.actual.team,
      toClass, projRel: proj.wobaRel, actRel,
      ratio: proj.wobaRel > 0 ? actRel / proj.wobaRel : null,
      projPA: proj.pa, actualPA: s.actual.pa, anchorPA: proj.anchorPA,
      seasonsUsed: proj.seasonsUsed,
      // comp features, standardised later
      f: {
        k: proj.rel.k, bb: proj.rel.bb, hr: proj.rel.hr,
        babip: proj.rel.babip, pa: proj.anchorPA
      }
    });
  });
});

console.log('=== BATTER BACKTEST ===');
console.log('holdouts: ' + HOLDOUTS.join(', ') + '   n=' + score.model.length +
  '  (players with a prior season and ' + MIN_ACTUAL_PA + '+ PA in the held-out year)');
console.log('  error is projected wOBA/lg minus actual wOBA/lg\n');
console.log('  method            RMSE     MAE');
[['full model', 'model'], ['Marcel form', 'marcel'], ['prior yr raw', 'naive'],
 ['league avg', 'league']].forEach(([label, k]) => {
  console.log('  ' + label.padEnd(18) + rmse(score[k]).toFixed(4) + '  ' + mae(score[k]).toFixed(4));
});
const impr = 1 - rmse(score.model) / rmse(score.league);
console.log('\n  model explains ' + (100 * impr).toFixed(1) + '% of the RMSE gap vs assuming everyone is league average');
console.log('  vs Marcel form: ' + (100 * (1 - rmse(score.model) / rmse(score.marcel))).toFixed(1) + '% better RMSE');

/* Bias check: is the model systematically high or low? */
const meanErr = score.model.reduce((a, b) => a + b, 0) / score.model.length;
console.log('  mean error ' + (meanErr >= 0 ? '+' : '') + meanErr.toFixed(4) +
  '  (positive = model too optimistic)');

/* Playing time accuracy */
{
  const pa = resid.filter(r => r.projPA && r.actualPA);
  const e = pa.map(r => r.projPA - r.actualPA);
  console.log('\n  projected PA: MAE ' + mae(e).toFixed(1) + ' PA, mean error ' +
    ((e.reduce((a, b) => a + b, 0) / e.length) >= 0 ? '+' : '') +
    (e.reduce((a, b) => a + b, 0) / e.length).toFixed(1));
}

/* ---- pitchers ---- */
const pscore = { model: [], naive: [], league: [] };
const presid = [];
HOLDOUTS.forEach(targetKey => {
  const set = backtestSet(targetKey, 'pit');
  const lgT = C[targetKey];
  set.forEach(s => {
    const ipAct = L.ipToF(s.actual.ip);
    if (ipAct < 15) return;
    const actRel = ((s.actual.er || 0) / ipAct) / lgT.lgER_IP;
    if (!isFinite(actRel) || !actRel) return;
    const proj = M.projectPitcher(s.chain, s.actual.year, targetKey);
    if (!proj || !proj.eraRel) return;
    const pr = L.pitRates(s.chain[0].row);
    const naiveRel = pr ? pr.er_ip / C[s.chain[0].key].lgER_IP : 1;
    pscore.model.push(proj.eraRel - actRel);
    pscore.naive.push(naiveRel - actRel);
    pscore.league.push(1 - actRel);
    presid.push({
      season: targetKey, name: s.actual.name, team: s.actual.team,
      toClass: s.actual.year, projRel: proj.eraRel, actRel,
      ratio: proj.eraRel > 0 ? actRel / proj.eraRel : null,
      projIP: proj.ip, actualIP: ipAct
    });
  });
});
console.log('\n=== PITCHER BACKTEST ===  n=' + pscore.model.length + ' (15+ IP in held-out year)');
console.log('  error is projected ER/IP-rel minus actual ER/IP-rel');
console.log('  method            RMSE     MAE');
[['full model', 'model'], ['prior yr raw', 'naive'], ['league avg', 'league']].forEach(([label, k]) => {
  if (!pscore[k].length) return;
  console.log('  ' + label.padEnd(18) + rmse(pscore[k]).toFixed(4) + '  ' + mae(pscore[k]).toFixed(4));
});

module.exports = { resid, presid, backtestSet, chainFor, wobaOf, rmse, mae };
