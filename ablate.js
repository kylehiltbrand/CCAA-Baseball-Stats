/* Ablation. Every piece of the model has to earn its place against the
   backtest, otherwise it is decoration. */
const M = require('./projmodel.js');
const B = require('./backtest.js');
const L = M.L;
const { T, C, SEASONS } = M;

const HOLDOUTS = ['2024-25', '2025-26'];

function runBat(mutate) {
  const saved = JSON.parse(JSON.stringify(M.AGE));
  const savedPT = Object.assign({}, M.PT_BAT);
  mutate && mutate();
  const errs = [];
  HOLDOUTS.forEach(key => {
    B.backtestSet(key, 'bat').forEach(s => {
      if ((s.actual.pa || 0) < 40) return;
      const act = B.wobaOf(s.actual) / C[key].wOBA;
      const p = M.projectBatter(s.chain, s.actual.year, key);
      if (!p || !p.wobaRel || !isFinite(act)) return;
      errs.push(p.wobaRel - act);
    });
  });
  Object.keys(saved).forEach(k => Object.assign(M.AGE[k], saved[k]));
  Object.assign(M.PT_BAT, savedPT);
  return { rmse: B.rmse(errs), bias: errs.reduce((a, b) => a + b, 0) / errs.length, n: errs.length };
}

const zero = () => Object.keys(M.AGE).forEach(k =>
  ['bb', 'k', 'hr', 'babip'].forEach(f => M.AGE[k][f] = 0));

console.log('=== BATTER ABLATION (RMSE / bias) ===');
const base = runBat(null);
console.log('  full model             ' + base.rmse.toFixed(4) + '   ' +
  (base.bias >= 0 ? '+' : '') + base.bias.toFixed(4));
const noAge = runBat(zero);
console.log('  aging curve OFF        ' + noAge.rmse.toFixed(4) + '   ' +
  (noAge.bias >= 0 ? '+' : '') + noAge.bias.toFixed(4));
const noHR = runBat(() => Object.keys(M.AGE).forEach(k => M.AGE[k].hr = 0));
console.log('  HR aging OFF           ' + noHR.rmse.toFixed(4) + '   ' +
  (noHR.bias >= 0 ? '+' : '') + noHR.bias.toFixed(4));
const noBabipAge = runBat(() => Object.keys(M.AGE).forEach(k => M.AGE[k].babip = 0));
console.log('  BABIP aging OFF        ' + noBabipAge.rmse.toFixed(4) + '   ' +
  (noBabipAge.bias >= 0 ? '+' : '') + noBabipAge.bias.toFixed(4));
[0.25, 0.5, 0.75].forEach(s => {
  const r = runBat(() => Object.keys(M.AGE).forEach(k =>
    ['bb', 'k', 'hr', 'babip'].forEach(f => M.AGE[k][f] *= s)));
  console.log('  aging scaled x' + s + '        ' + r.rmse.toFixed(4) + '   ' +
    (r.bias >= 0 ? '+' : '') + r.bias.toFixed(4));
});

/* Regression-strength sweep: multiply every k by a factor. Higher = regress
   harder toward league average. */
console.log('\n=== REGRESSION STRENGTH SWEEP (k multiplier) ===');
const K0 = Object.assign({}, M.K_BAT);
[0.5, 0.75, 1, 1.5, 2, 3, 5].forEach(mult => {
  Object.keys(K0).forEach(f => M.K_BAT[f] = K0[f] * mult);
  const r = runBat(null);
  console.log('  x' + String(mult).padEnd(5) + '  RMSE ' + r.rmse.toFixed(4) +
    '   bias ' + (r.bias >= 0 ? '+' : '') + r.bias.toFixed(4));
});
Object.keys(K0).forEach(f => M.K_BAT[f] = K0[f]);

/* Season weights */
console.log('\n=== SEASON WEIGHT SWEEP ===');
const W0 = M.SEASON_W.slice();
[[5, 4, 3, 2], [5, 3, 2, 1], [6, 3, 1, 1], [1, 1, 1, 1], [5, 0, 0, 0]].forEach(w => {
  w.forEach((x, i) => M.SEASON_W[i] = x);
  const r = runBat(null);
  console.log('  [' + w.join(',') + ']'.padEnd(4) + '   RMSE ' + r.rmse.toFixed(4) +
    '   bias ' + (r.bias >= 0 ? '+' : '') + r.bias.toFixed(4));
});
W0.forEach((x, i) => M.SEASON_W[i] = x);

/* ---------------- pitchers ---------------- */
function runPit() {
  const errs = [];
  HOLDOUTS.forEach(key => {
    B.backtestSet(key, 'pit').forEach(s => {
      const ip = L.ipToF(s.actual.ip); if (ip < 15) return;
      const act = ((s.actual.er || 0) / ip) / C[key].lgER_IP;
      const p = M.projectPitcher(s.chain, s.actual.year, key);
      if (!p || !p.eraRel || !isFinite(act) || !act) return;
      errs.push(p.eraRel - act);
    });
  });
  return { rmse: B.rmse(errs), bias: errs.reduce((a, b) => a + b, 0) / errs.length, n: errs.length };
}

console.log('\n=== PITCHER REGRESSION SWEEP ===');
const KP0 = Object.assign({}, M.K_PIT);
[1, 2, 3, 5, 8, 15, 40].forEach(mult => {
  Object.keys(KP0).forEach(f => M.K_PIT[f] = KP0[f] * mult);
  const r = runPit();
  console.log('  k x' + String(mult).padEnd(4) + '  RMSE ' + r.rmse.toFixed(4) +
    '   bias ' + (r.bias >= 0 ? '+' : '') + r.bias.toFixed(4) + '  n=' + r.n);
});
Object.keys(KP0).forEach(f => M.K_PIT[f] = KP0[f]);
console.log('  league-average baseline RMSE 0.3713');
