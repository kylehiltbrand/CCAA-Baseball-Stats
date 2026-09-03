/* ============================================================================
   CCAA BASEBALL — stabilization.js
   Derives the regression constants used by data.js from actual CCAA data.
   ----------------------------------------------------------------------------
   RUN:  node stabilization.js
   Requires history.js and data.js in the same directory. Reads only; writes
   nothing. Re-run it after adding a season and move the printed k values into
   the regression block in data.js if they have shifted.

   METHOD
   ------
   For a rate stat measured over n opportunities, the variance you observe
   across players is true-talent variance plus sampling noise:

       var_observed = var_true + var_event / n

   Taking the opportunity-weighted variance across the player pool and
   subtracting the expected sampling term leaves var_true, and

       k = var_event / var_true

   is the sample size at which the stat is half signal and half noise. It is
   also the correct shrinkage constant: an estimate regressed by k/(n+k) toward
   league average is the minimum-error estimate of true talent.

   WHAT k IS NOT
   -------------
   k is a talent-estimation constant. data.js uses the linear form min(n/k, 1)
   for its displayed WAR because WAR there is descriptive rather than
   predictive. Anything forecasting forward — projections.html — should use the
   harmonic form n/(n+k), which is what the math above actually implies.

   THE ER/IP CAVEAT
   ----------------
   The Poisson model used for ER/IP assumes runs arrive independently. They do
   not; they cluster within innings, so the model understates sampling variance
   and returns a k around 9 IP, which is far too fast to believe. The value
   carried in data.js (~50 IP) is backed out of observed year-over-year
   correlation instead. Both are printed below so the gap stays visible.
   ============================================================================ */

const fs = require('fs'), Module = require('module');
const { HIST } = require('./history.js');

const src = fs.readFileSync(__dirname + '/data.js', 'utf8');
const mod = new Module('data');
mod._compile(src + '\nmodule.exports={batters,pitchers};', __dirname + '/data.js');
const CURRENT = mod.exports;
const ipToF = HIST.ipToF;

const SEASONS = HIST.seasons().map(k => ({
  key: k, B: HIST.season(k).batters, P: HIST.season(k).pitchers
})).concat([{ key: '2025-26', B: CURRENT.batters, P: CURRENT.pitchers }]);

/* wOBA weights. Must stay identical to data.js and history.js. */
const W = { bb: 0.69, hbp: 0.72, s1: 0.88, d: 1.24, t: 1.56, hr: 2.00 };

const allB = [].concat(...SEASONS.map(s => s.B)).filter(b => (b.pa || 0) >= 20);
const allP = [].concat(...SEASONS.map(s => s.P)).filter(p => ipToF(p.ip) >= 5);
const BF  = p => 3 * ipToF(p.ip) + (p.h || 0) + (p.bb || 0);
const BIP = b => (b.ab || 0) - (b.k || 0) - (b.hr || 0) + (b.sf || 0);
const s1  = b => (b.h || 0) - (b.doubles || 0) - (b.triples || 0) - (b.hr || 0);

function kFor(rows, num, den, varEvent) {
  const pool = rows.filter(r => den(r) > 0);
  const N = pool.length, sumN = pool.reduce((a, r) => a + den(r), 0);
  const pbar = pool.reduce((a, r) => a + num(r), 0) / sumN;
  const ve = varEvent ? varEvent(pbar, pool) : pbar * (1 - pbar);
  let vobs = 0;
  pool.forEach(r => { const n = den(r); vobs += (n / sumN) * Math.pow(num(r) / n - pbar, 2); });
  const vtrue = vobs - ve * N / sumN;
  return { N, meanN: sumN / N, pbar, k: vtrue > 0 ? ve / vtrue : Infinity };
}

/* Variance of a single plate appearance's wOBA value, from pooled league
   event frequencies. Not binomial, so it gets its own estimator. */
function wobaEventVar(_, pool) {
  const acc = { bb: 0, hbp: 0, s1: 0, d: 0, t: 0, hr: 0 }; let n = 0;
  pool.forEach(b => {
    n += (b.ab || 0) + (b.bb || 0) + (b.sf || 0) + (b.hbp || 0);
    acc.bb += b.bb || 0; acc.hbp += b.hbp || 0; acc.s1 += s1(b);
    acc.d += b.doubles || 0; acc.t += b.triples || 0; acc.hr += b.hr || 0;
  });
  const out = n - Object.values(acc).reduce((a, x) => a + x, 0);
  let m1 = 0, m2 = 0;
  [[out, 0], [acc.bb, W.bb], [acc.hbp, W.hbp], [acc.s1, W.s1],
   [acc.d, W.d], [acc.t, W.t], [acc.hr, W.hr]].forEach(([c, v]) => {
    const p = c / n; m1 += p * v; m2 += p * v * v;
  });
  return m2 - m1 * m1;
}

const wobaNum = b => W.bb * (b.bb || 0) + W.hbp * (b.hbp || 0) + W.s1 * s1(b) +
                     W.d * (b.doubles || 0) + W.t * (b.triples || 0) + W.hr * (b.hr || 0);
const wobaDen = b => (b.ab || 0) + (b.bb || 0) + (b.sf || 0) + (b.hbp || 0);

const RESULTS = [
  ['K%  (hitter)',  kFor(allB, b => b.k || 0,  b => b.pa || 0), 'PA'],
  ['BB% (hitter)',  kFor(allB, b => b.bb || 0, b => b.pa || 0), 'PA'],
  ['HR% (hitter)',  kFor(allB, b => b.hr || 0, b => b.pa || 0), 'PA'],
  ['XBH% (hitter)', kFor(allB, b => (b.doubles||0)+(b.triples||0)+(b.hr||0), b => b.pa || 0), 'PA'],
  ['AVG',           kFor(allB, b => b.h || 0,  b => b.ab || 0), 'AB'],
  ['BABIP',         kFor(allB.filter(b => BIP(b) > 0), b => (b.h||0)-(b.hr||0), BIP), 'BIP'],
  ['wOBA',          kFor(allB, wobaNum, wobaDen, wobaEventVar), 'PA'],
  ['K%  (pitcher)', kFor(allP, p => p.k || 0,  BF), 'BF'],
  ['BB% (pitcher)', kFor(allP, p => p.bb || 0, BF), 'BF'],
  ['H%  (pitcher)', kFor(allP, p => p.h || 0,  BF), 'BF'],
  ['ER/IP (Poisson)', kFor(allP, p => p.er || 0, p => ipToF(p.ip), lam => lam), 'IP']
];

/* Year-over-year correlation, as an independent check on the variance route. */
function corr(pairs, f) {
  const xs = pairs.map(p => f(p.from)), ys = pairs.map(p => f(p.to));
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx*dy; sx += dx*dx; sy += dy*dy; }
  return sxy / Math.sqrt(sx * sy);
}
function pooled(kind, minA, minB) {
  const hops = [['2022-23', '2023-24'], ['2023-24', '2024-25'],
                ['2024-25', kind === 'bat' ? CURRENT.batters : CURRENT.pitchers]];
  let out = [];
  hops.forEach(([a, b]) => { out = out.concat(HIST.matchedPairs(a, b, { kind, minA, minB }).pairs); });
  return out;
}

console.log('\nCCAA STABILIZATION — pooled ' + SEASONS.length + ' seasons, ' +
            allB.length + ' batter-seasons (20+ PA), ' + allP.length + ' pitcher-seasons (5+ IP)\n');
console.log('  metric              k      league mean   pool mean n');
console.log('  ' + '-'.repeat(56));
RESULTS.forEach(([label, r, unit]) => console.log(
  '  ' + label.padEnd(17) +
  (isFinite(r.k) ? Math.round(r.k) : 'none').toString().padStart(5) + ' ' + unit.padEnd(4) +
  (r.pbar < 1 ? r.pbar.toFixed(3) : r.pbar.toFixed(2)).padStart(12) +
  Math.round(r.meanN).toString().padStart(13)));

const B = pooled('bat', 40, 40), P = pooled('pit', 20, 20);
const meanPA = B.reduce((a, p) => a + p.from.pa, 0) / B.length;
const meanIP = P.reduce((a, p) => a + ipToF(p.from.ip), 0) / P.length;
const rERA = corr(P, p => p.er / ipToF(p.ip));

console.log('\n  year-over-year check: ' + B.length + ' matched batter pairs (mean ' +
            meanPA.toFixed(0) + ' PA), ' + P.length + ' pitcher pairs (mean ' + meanIP.toFixed(0) + ' IP)');
console.log('  ' + '-'.repeat(56));
[['K%  (hitter)', p => p.k / p.pa, 27, meanPA],
 ['BB% (hitter)', p => p.bb / p.pa, 82, meanPA],
 ['wOBA', p => wobaNum(p) / wobaDen(p), 71, meanPA],
 ['AVG', p => p.h / p.ab, 77, meanPA * 0.85],
 ['BABIP', p => (p.h - p.hr) / Math.max(1, BIP(p)), 126, meanPA * 0.66]
].forEach(([label, f, k, n]) => {
  const r = corr(B, f), pred = n / (n + k);
  console.log('  ' + label.padEnd(17) + 'r ' + r.toFixed(3) +
              '   predicted ' + pred.toFixed(3) + '   persistence ' + (r / pred).toFixed(2));
});
console.log('\n  ER/IP  observed r ' + rERA.toFixed(3) + ' over ' + P.length + ' pairs.');
[0.65, 0.70, 0.75].forEach(tau => {
  const rel = rERA / tau;
  console.log('    implied k at persistence ' + tau.toFixed(2) + ': ' +
              (rel > 0 && rel < 1 ? (meanIP * (1 - rel) / rel).toFixed(0) + ' IP' : 'n/a'));
});
console.log('\n  data.js currently carries WRC_FULL_PA 71, ERA_FULL_IP 50,');
console.log('  WAR_FULL_PA 71, WAR_FULL_IP 50, REPL_RUNS_IP 0.229.\n');
