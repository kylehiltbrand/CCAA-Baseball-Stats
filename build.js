/* Builds the frozen 2027 projection file the site loads.

   Percentile bands are NOT assumed normal. They come from the model's own
   observed error: every held-out player-season in the backtest yields a ratio
   of actual to projected, and a player's band is the quantile spread of that
   ratio among his comparables. If the model is badly calibrated for a type of
   player, the bands for that type get wider automatically. */

const fs = require('fs');
const M = require('./projmodel.js');
const B = require('./backtest.js');
const L = M.L;
const { T, C, SEASONS, CLASS, D } = M;

const CUR = '2025-26';
const TARGET_LABEL = '2027';
const lg = C[CUR];                       // 2027 league level assumed to hold at 2026

/* ---------- comparables -------------------------------------------------- */
const FEATS = ['k', 'bb', 'hr', 'babip', 'pa'];
function featVec(f) {
  return [f.k, f.bb, f.hr, f.babip, Math.log(Math.max(10, f.pa))];
}
const pool = B.resid.filter(r => r.ratio != null && isFinite(r.ratio) && r.f);
const P_VEC = pool.map(r => featVec(r.f));
const mu = FEATS.map((_, i) => P_VEC.reduce((s, v) => s + v[i], 0) / P_VEC.length);
const sd = FEATS.map((_, i) => {
  const m = mu[i];
  return Math.sqrt(P_VEC.reduce((s, v) => s + (v[i] - m) ** 2, 0) / P_VEC.length) || 1;
});
const z = v => v.map((x, i) => (x - mu[i]) / sd[i]);
const P_Z = P_VEC.map(z);

const N_COMPS = 25;
/* `self` excludes the player's own held-out season from his comp cohort. The
   backtest pool includes 2025-26 as a target year, so without this a returning
   player can be listed as his own most-similar comparable — which looks silly
   and, worse, leaks his own outcome into the band that is supposed to describe
   how players like him have historically done. */
function comps(f, toClass, self) {
  const q = z(featVec(f));
  const scored = P_Z.map((v, i) => {
    if (self && pool[i].name === self.n && pool[i].team === self.t) return { i, d: Infinity };
    let d = 0;
    for (let j = 0; j < v.length; j++) d += (v[j] - q[j]) ** 2;
    /* Same class transition is a real similarity axis, not a filter: a
       penalty rather than a hard cut, so a thin class never runs out of comps. */
    const same = pool[i].toClass === toClass ? 0 : 1.0;
    return { i, d: Math.sqrt(d) + same };
  }).filter(x => isFinite(x.d)).sort((a, b) => a.d - b.d).slice(0, N_COMPS);
  return scored.map(s => pool[s.i]);
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ---------- derived stats, computed WITHOUT re-regressing ---------------- */
/* The projected line is already a regressed talent estimate. Running it back
   through calcWRC_plus and calcOWAR, which regress again by PA, would shrink
   it twice. These mirror the data.js formulas with the regression weight
   pinned at 1. */
function projWRC(woba) {
  return Math.round(((woba - lg.wOBA) / D.WOBA_SCALE / lg.R_PA + 1) * 100);
}
function projOWAR(wrc, pa) {
  const raa = ((wrc - 100) / 100) * (pa / 600) * D.RAA_PER_600;
  const rar = raa - D.REPL_RUNS_600 * (pa / 600);
  return Math.round((rar / D.RUNS_PER_WIN) * 10) / 10;
}
function projERAplus(era) {
  return Math.round(Math.min((lg.ERA / era) * 100, 275));
}
function projPWAR(era, ip) {
  const raa = (lg.ERA - era) / 7 * ip;
  return Math.round(((raa + D.REPL_RUNS_IP * ip) / D.RUNS_PER_WIN) * 10) / 10;
}

/* ---------- chain builder for the live season --------------------------- */
function chainFor(row, kind) {
  const out = [{ key: CUR, row }];
  const ti = SEASONS.indexOf(CUR);
  for (let g = 1; g <= ti; g++) {
    const k = SEASONS[ti - g];
    const hit = L.findEarlier(row, L.buildIndex(T[k][kind]), g);
    if (hit) out.push({ key: k, row: hit.row });
  }
  return out;
}

const nextClass = y => {
  const i = CLASS.indexOf(y);
  return i >= 0 && i + 1 < 4 ? CLASS[i + 1] : null;
};

/* ---------- batters ------------------------------------------------------ */
const MIN_PA_2026 = 15;
const batOut = [];
D.batters.forEach(row => {
  const to = nextClass(row.year);
  if (!to) return;                        // seniors graduate; blank class excluded
  if ((row.pa || 0) < MIN_PA_2026) return;
  const chain = chainFor(row, 'bat');
  const p = M.projectBatter(chain, to, CUR);
  if (!p || !p.pa) return;

  const cs = comps({ k: p.rel.k, bb: p.rel.bb, hr: p.rel.hr, babip: p.rel.babip, pa: p.anchorPA },
                   to, { n: row.name, t: row.team });
  const ratios = cs.map(c => c.ratio).sort((a, b) => a - b);
  const q = pp => quantile(ratios, pp);

  /* Bands are normalised by the comp cohort's own median, so they straddle the
     projection rather than shifting it. The point estimate is left alone on
     purpose: pooled across all 198 held-out seasons the median actual-over-
     projected ratio is 1.003, so the model is already centred, and multiplying
     each player by the median of his own 25-comp cohort would inject that
     cohort's sampling noise into the forecast for no gain. What the comps ARE
     good for is the SHAPE of the spread, which is what gets used. */
  const med = q(0.50) || 1;
  const mkWOBA = r => Math.round(p.woba * (r / med) * 1000) / 1000;
  const w50 = Math.round(p.woba * 1000) / 1000;
  const wrc = projWRC(p.woba);

  batOut.push({
    id: row.team + '|' + row.name + '|' + row.pa,
    n: row.name, t: row.team, y: to, y26: row.year,
    pa26: row.pa, woba26: row.woba, wrc26: row.wrc_plus, owar26: row.owar,
    seasons: p.seasonsUsed,
    pa: p.pa,
    avg: Math.round(p.avg * 1000) / 1000,
    obp: Math.round(p.obp * 1000) / 1000,
    slg: Math.round(p.slg * 1000) / 1000,
    hr: Math.round(p.hr * 10) / 10,
    bb: Math.round(p.bb), k: Math.round(p.k), h: Math.round(p.h),
    babip: Math.round(p.babip * 1000) / 1000,
    woba: w50,
    wrc: wrc,
    owar: projOWAR(wrc, p.pa),
    // percentile band on wOBA and wRC+, from the comp cohort's actual outcomes
    w20: mkWOBA(q(0.20)), w80: mkWOBA(q(0.80)),
    wrc20: projWRC(p.woba * q(0.20) / med), wrc80: projWRC(p.woba * q(0.80) / med),
    comps: cs.slice(0, 3).map(c => ({ n: c.name, t: c.team, s: c.season }))
  });
});

/* ---------- pitchers ----------------------------------------------------- */
const MIN_IP_2026 = 8;
/* Pitcher bands use one pooled residual spread rather than a per-player comp
   cohort. Forty-six matched pitcher pairs will not support conditioning; a
   nearest-neighbour band built on that would be a spread of two or three
   observations dressed up as a distribution. */
const PIT_RATIOS = B.presid.filter(r => r.ratio != null && isFinite(r.ratio))
  .map(r => r.ratio).sort((a, b) => a - b);
/* The pooled median is 0.91: among pitchers who held 15+ IP the following year,
   actual ER/IP came in about 9% BELOW projection. That is not treated as a
   calibration error and the point estimates are not shifted down by it, because
   the sample conditions on keeping the job — the arms that lost innings are not
   in it, and quietly making every returning pitcher 9% better on the strength of
   a survivor sample is how a projection system loses its credibility. The number
   is reported on the page instead, so a reader can apply it if they disagree. */
const PIT_MED = (function () {
  const i = (PIT_RATIOS.length - 1) * 0.5, lo = Math.floor(i), hi = Math.ceil(i);
  return PIT_RATIOS.length ? PIT_RATIOS[lo] + (PIT_RATIOS[hi] - PIT_RATIOS[lo]) * (i - lo) : 1;
})();
const pitOut = [];
D.pitchers.forEach(row => {
  const to = nextClass(row.year);
  if (!to) return;
  const ip26 = L.ipToF(row.ip);
  if (ip26 < MIN_IP_2026) return;
  const chain = chainFor(row, 'pit');
  const p = M.projectPitcher(chain, to, CUR);
  if (!p || !p.ip || !isFinite(p.era)) return;

  const pr = PIT_RATIOS;
  const era = Math.round(p.era * 100) / 100;
  pitOut.push({
    id: row.team + '|' + row.name + '|' + row.ip,
    n: row.name, t: row.team, y: to, y26: row.year,
    ip26: row.ip, era26: row.era, pwar26: row.pwar, eraplus26: row.era_plus,
    seasons: p.seasonsUsed,
    ip: Math.round(p.ip * 10) / 10,
    era, whip: Math.round(p.whip * 100) / 100,
    k9: Math.round(p.k9 * 10) / 10, bb9: Math.round(p.bb9 * 10) / 10,
    kpct: Math.round(p.kpct * 10) / 10,
    eraplus: projERAplus(era),
    pwar: projPWAR(era, p.ip),
    // pitcher bands use the pooled residual spread; there are too few matched
    // pitcher pairs to condition them on comparables the way batters do
    era20: Math.round(p.era * (quantile(pr, 0.20) / PIT_MED) * 100) / 100,
    era80: Math.round(p.era * (quantile(pr, 0.80) / PIT_MED) * 100) / 100
  });
});

batOut.sort((a, b) => b.owar - a.owar);
pitOut.sort((a, b) => b.pwar - a.pwar);

/* ---------- model card: everything the methodology section reports -------- */
function rmseOf(arr) { return Math.sqrt(arr.reduce((s, x) => s + x * x, 0) / arr.length); }
const batErr = B.resid.map(r => r.projRel - r.actRel);
const pitErr = B.presid.map(r => r.projRel - r.actRel);
const batLg = B.resid.map(r => 1 - r.actRel);
const pitLg = B.presid.map(r => 1 - r.actRel);

const card = {
  built: new Date().toISOString().slice(0, 10),
  target: TARGET_LABEL,
  dataThrough: D.DATA_UPDATED,
  seasons: SEASONS,
  seasonWeights: M.SEASON_W,
  ageScale: M.AGE_SCALE,
  pitKMult: M.PIT_K_MULT,
  kBat: M.K_BAT, kPit: M.K_PIT,
  aging: M.AGE,
  retention: M.RETENTION,
  pt: { bat: M.PT_BAT, pit: M.PT_PIT },
  lg: {
    wOBA: Math.round(lg.wOBA * 1000) / 1000,
    ERA: Math.round(lg.ERA * 100) / 100,
    BB: Math.round(lg.lgBB * 1000) / 1000,
    K: Math.round(lg.lgK * 1000) / 1000,
    HR: Math.round(lg.lgHR * 10000) / 10000,
    BABIP: Math.round(lg.lgBABIP * 1000) / 1000
  },
  backtest: {
    batN: B.resid.length,
    batRMSE: Math.round(rmseOf(batErr) * 10000) / 10000,
    batBaseRMSE: Math.round(rmseOf(batLg) * 10000) / 10000,
    batBias: Math.round((batErr.reduce((a, b) => a + b, 0) / batErr.length) * 10000) / 10000,
    pitN: B.presid.length,
    pitRMSE: Math.round(rmseOf(pitErr) * 10000) / 10000,
    pitBaseRMSE: Math.round(rmseOf(pitLg) * 10000) / 10000,
    paMAE: Math.round(B.mae(B.resid.filter(r => r.projPA && r.actualPA)
      .map(r => r.projPA - r.actualPA)) * 10) / 10
  },
  pitMedianRatio: Math.round(PIT_MED * 1000) / 1000,
  counts: { batters: batOut.length, pitchers: pitOut.length }
};

const header = `/* ============================================================================
   CCAA BASEBALL — proj2027.js
   FROZEN 2027 player projections. Generated ${card.built} from data.js
   (through ${card.dataThrough}) plus the ${SEASONS.length}-season archive in history.js.

   DO NOT EDIT BY HAND AND DO NOT REGENERATE CASUALLY.

   This file is deliberately static. A projection that silently changes every
   time a stat update is pushed cannot be scored against what actually happens,
   and a forecast nobody can score is not a forecast. Regenerate only when you
   intend to publish a new, separately dated set — then keep the old file so the
   two can be compared in June.

   Rebuild:  node build.js      (writes proj2027.js)
   Validate: node backtest.js   (scores the model against held-out seasons)
   Ablate:   node ablate.js     (checks each component still earns its place)

   Everything here is CCAA-calibrated. Nothing is an MLB baseline.
   ============================================================================ */

`;

const out = header +
  'const PROJ_CARD = ' + JSON.stringify(card, null, 1) + ';\n\n' +
  'const PROJ_BAT = ' + JSON.stringify(batOut) + ';\n\n' +
  'const PROJ_PIT = ' + JSON.stringify(pitOut) + ';\n\n' +
  "if (typeof module !== 'undefined' && module.exports)\n" +
  '  module.exports = { PROJ_CARD, PROJ_BAT, PROJ_PIT };\n';

fs.writeFileSync(__dirname + '/proj2027.js', out);

console.log('\n=== BUILT proj2027.js ===');
console.log('  batters  ' + batOut.length + '   pitchers ' + pitOut.length);
console.log('  size     ' + (out.length / 1024).toFixed(1) + ' KB');
console.log('\n  top 10 projected hitters by oWAR:');
batOut.slice(0, 10).forEach((b, i) => console.log('   ' + String(i + 1).padStart(2) + '. ' +
  b.n.padEnd(18) + b.t.padEnd(21) + b.y + '  ' + String(b.pa).padStart(3) + ' PA  ' +
  '.' + String(Math.round(b.woba * 1000)).padStart(3, '0') + ' wOBA  ' +
  String(b.wrc).padStart(3) + ' wRC+  ' + (b.owar > 0 ? '+' : '') + b.owar + ' oWAR' +
  '   [' + b.wrc20 + '-' + b.wrc80 + ']'));
console.log('\n  top 8 projected pitchers by pWAR:');
pitOut.slice(0, 8).forEach((p, i) => console.log('   ' + String(i + 1).padStart(2) + '. ' +
  p.n.padEnd(18) + p.t.padEnd(21) + p.y + '  ' + String(p.ip).padStart(5) + ' IP  ' +
  p.era.toFixed(2) + ' ERA  ' + String(p.eraplus).padStart(3) + ' ERA+  ' +
  (p.pwar > 0 ? '+' : '') + p.pwar + ' pWAR   [' + p.era20.toFixed(2) + '-' + p.era80.toFixed(2) + ']'));
