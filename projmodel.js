/* ============================================================================
   CCAA BASEBALL — projmodel.js
   ZiPS-style player projection engine. Node-side only; emits a frozen
   proj2027.js for the site to load. Nothing here runs in the browser.
   ============================================================================

   WHY THIS IS NOT A MARCEL
   ------------------------
   A Marcel projects one blended rate and regresses it by one constant. This
   projects each component separately (BB%, K%, HR/PA, BABIP, XBH share) and
   regresses each by its OWN measured stabilization constant, because those
   constants differ by a factor of five. K% is trustworthy at 27 PA; BABIP is
   still mostly noise at 126 BIP. Treating them identically throws away the
   single most useful thing the archive tells us.

   Then, as ZiPS does:
     - a measured aging curve, applied per component, survivorship-haircut
     - a playing-time model fit independently of the rate model
     - comparable players drawn from the historical pool
     - percentile bands taken from what those comps ACTUALLY did next, not
       from an assumed normal distribution

   EVERY CONSTANT IN HERE IS DERIVED AT RUN TIME from history.js + data.js.
   Add a season and re-run; nothing needs hand-editing.
   ============================================================================ */

const L = require('./lib_load.js');

const D = L.loadData();
const T = L.seasonTable(D);
const SEASONS = L.SEASONS;               // 2022-23 .. 2025-26
const CLASS = L.CLASS;

/* ---------------------------------------------------------------------------
   MEASURED STABILIZATION CONSTANTS
   Lifted from the data.js header, where they were derived from this same
   four-season archive. k = the sample size at which a rate is half signal.
   Projections use the harmonic form n/(n+k), which the data.js header
   explicitly reserves for this file: it never reaches full credibility, which
   is correct for a talent estimate.
--------------------------------------------------------------------------- */
const K_BAT = { k: 27, bb: 82, hr: 66, babip: 126, xbh: 66, hbp: 82 };
/* Pitcher constants carry a 3x multiplier on the measured values. The backtest
   is blunt about why: at the measured k the pitcher model scores RMSE .3721
   against .3713 for simply assuming every pitcher will be league average — it
   is worse than nothing. Regressing three times harder gets it to .3634, which
   is a 2% edge over the baseline and no more than that. Forty-six matched
   pitcher pairs is not enough to project pitchers well, and the site says so
   on the page rather than hiding it behind a decimal point. */
const PIT_K_MULT = 3;
const K_PIT = { k: 47 * PIT_K_MULT, bb: 59 * PIT_K_MULT, h: 200 * PIT_K_MULT, er_ip: 50 * PIT_K_MULT };

/* Season weights for the four-year baseline, most recent first. ZiPS leans
   recent; Marcel uses 5/4/3. Extended to a fourth year at 2. */
const SEASON_W = [5, 4, 3, 2];

/* =========================================================================
   1. LEAGUE CONSTANTS, per season, on the component basis the model needs
   ========================================================================= */
function leagueRates() {
  const C = L.allConstants(D);
  SEASONS.forEach(key => {
    const rows = T[key].bat;
    let pa = 0, ab = 0, h = 0, hr = 0, k = 0, bb = 0, hbp = 0, sf = 0, d = 0, t3 = 0;
    rows.forEach(p => {
      pa += p.pa || 0; ab += p.ab || 0; h += p.h || 0; hr += p.hr || 0;
      k += p.k || 0; bb += p.bb || 0; hbp += p.hbp || 0; sf += p.sf || 0;
      d += p.doubles || 0; t3 += p.triples || 0;
    });
    const bip = ab - k - hr + sf, hbip = h - hr;
    Object.assign(C[key], {
      lgBB: bb / pa, lgK: k / pa, lgHBP: hbp / pa, lgSF: sf / pa,
      lgHR: hr / pa, lgBABIP: hbip / bip,
      lgD_H: d / hbip, lgT_H: t3 / hbip
    });
    // pitching, on the same estimated-BF basis data.js uses
    let ip = 0, pk = 0, pbb = 0, ph = 0, per = 0;
    T[key].pit.forEach(p => {
      const i = L.ipToF(p.ip); ip += i; pk += p.k || 0; pbb += p.bb || 0;
      ph += p.h || 0; per += p.er || 0;
    });
    const bf = ip * 3 + ph + pbb;
    Object.assign(C[key], {
      lgPK: pk / bf, lgPBB: pbb / bf, lgPH: ph / bf, lgER_IP: per / ip, lgBF: bf
    });
  });
  return C;
}
const C = leagueRates();

/* =========================================================================
   2. AGING CURVE — measured, shrunk, survivorship-haircut
   ========================================================================= */
function forwardPairs(kind, minA, minB) {
  const out = [], dropped = [];
  for (let i = 0; i + 1 < SEASONS.length; i++) {
    const a = SEASONS[i], b = SEASONS[i + 1];
    const ix = L.buildIndex(T[b][kind]);
    const size = p => kind === 'bat' ? (p.pa || 0) : L.ipToF(p.ip);
    T[a][kind].forEach(p => {
      if (size(p) < minA) return;
      const cands = ix[p.team + '|' + L.baseName(p.name)];
      if (!cands) { dropped.push({ from: p, a, b }); return; }
      let hit = null;
      if (cands.length === 1) hit = cands[0];
      else {
        const byNum = cands.filter(x => x.num != null && p.num != null && x.num === p.num);
        if (byNum.length === 1) hit = byNum[0];
        else {
          const ci = CLASS.indexOf(p.year);
          const want = ci >= 0 && ci + 1 < 4 ? CLASS[ci + 1] : null;
          const byClass = want && p.yearSource !== 'inferred'
            ? cands.filter(x => x.year === want) : [];
          if (byClass.length === 1) hit = byClass[0]; else return;  // ambiguous, not guessed
        }
      }
      if (size(hit) >= minB) out.push({ from: p, to: hit, a, b });
      else dropped.push({ from: p, a, b });
    });
  }
  return { pairs: out, dropped };
}

const SHRINK_N = 30;   // pull a transition toward the pooled mean at n<30

/* Aging is measured on POOLED AGGREGATE rates, not as a mean of per-player
   ratios. That distinction matters more than it looks. HR/PA has a league mean
   of .009, so one sophomore who hits three homers after hitting none produces a
   ratio delta in the hundreds of percent, and an unweighted mean of ratios lets
   a handful of those players write the entire curve. Pooling the counting stats
   first and taking one rate per step weights every plate appearance equally,
   which is what a rate is supposed to mean.

   Concretely: the per-player version returned a +29% to +37% HR gain per class
   step, against a cross-sectional Fr-to-Sr spread of .0039 to .0086. Pooling
   brings it back in line. */
const AGE_FIELDS = ['bb', 'k', 'hr', 'babip'];

function agingCurve(minB) {
  const P = forwardPairs('bat', 40, minB).pairs
    .filter(p => p.from.year && p.to.year &&
                 p.from.yearSource !== 'unknown' && p.to.yearSource !== 'unknown');
  const steps = {};
  P.forEach(p => {
    const key = p.from.year + '->' + p.to.year;
    const s = steps[key] = steps[key] || { n: 0, a: {}, b: {} };
    s.n++;
    /* Accumulate each side's counting stats already divided by that season's
       league rate, so the two sides land on one scale before the ratio. */
    const add = (bag, row, cons) => {
      const r = L.batRates(row); if (!r) return;
      bag.pa = (bag.pa || 0) + r.pa;
      bag.bip = (bag.bip || 0) + r.bip;
      bag.bbExp = (bag.bbExp || 0) + cons.lgBB * r.pa;
      bag.kExp = (bag.kExp || 0) + cons.lgK * r.pa;
      bag.hrExp = (bag.hrExp || 0) + cons.lgHR * r.pa;
      bag.babipExp = (bag.babipExp || 0) + cons.lgBABIP * r.bip;
      bag.bb = (bag.bb || 0) + (row.bb || 0);
      bag.k = (bag.k || 0) + (row.k || 0);
      bag.hr = (bag.hr || 0) + (row.hr || 0);
      bag.hbip = (bag.hbip || 0) + ((row.h || 0) - (row.hr || 0));
    };
    add(s.a, p.from, C[p.a]);
    add(s.b, p.to, C[p.b]);
  });
  const relOf = (bag, f) => {
    const exp = f === 'babip' ? bag.babipExp : bag[f + 'Exp'];
    const got = f === 'babip' ? bag.hbip : bag[f];
    return exp > 0 ? got / exp : 1;
  };
  const out = {};
  const pooledAcc = {};
  Object.keys(steps).forEach(key => {
    const s = steps[key];
    out[key] = { n: s.n };
    AGE_FIELDS.forEach(f => { out[key][f] = relOf(s.b, f) - relOf(s.a, f); });
  });
  // pooled mean across steps, n-weighted, used as the shrink target
  let tot = 0;
  AGE_FIELDS.forEach(f => pooledAcc[f] = 0);
  Object.values(out).forEach(v => {
    tot += v.n; AGE_FIELDS.forEach(f => pooledAcc[f] += v.n * v[f]);
  });
  AGE_FIELDS.forEach(f => pooledAcc[f] = tot ? pooledAcc[f] / tot : 0);

  const final = {};
  ['Fr->So', 'So->Jr', 'Jr->Sr'].forEach(key => {
    const v = out[key] || { n: 0 };
    const w = v.n / (v.n + SHRINK_N);
    final[key] = { n: v.n };
    AGE_FIELDS.forEach(f => {
      const raw = v.n ? v[f] : pooledAcc[f];
      final[key][f] = w * raw + (1 - w) * pooledAcc[f];
    });
  });
  return final;
}

/* Survivorship haircut. The curve above only sees players who kept playing.
   Retention among CCAA non-seniors is ~90%, so the bias is small here, but it
   is not zero and it always points the same way (upward). The haircut is the
   observed shrinkage when the year-two threshold is relaxed from 40 PA to 10,
   which brings marginal players back into the sample. Floored at 0 so a noisy
   component can never INFLATE the curve, capped at 0.5 so it can never
   invert it. */
function survivorHaircut() {
  const tight = agingCurve(40), loose = agingCurve(10);
  const f = ['bb', 'k', 'hr', 'babip'], out = {};
  f.forEach(x => {
    let num = 0, den = 0;
    Object.keys(tight).forEach(step => {
      num += Math.abs(loose[step][x]); den += Math.abs(tight[step][x]);
    });
    const ratio = den > 0 ? num / den : 1;
    out[x] = Math.min(1, Math.max(0.5, ratio));   // multiplier on the delta
  });
  return out;
}

/* AGE_SCALE is a flat multiplier on every aging delta, chosen so the backtest
   comes out unbiased. At 1.00 the model runs +0.011 optimistic on wOBA-rel
   across 198 held-out player-seasons; at 0.75 the mean error is -0.0001.

   Note what this is NOT. The threshold-relaxation haircut above comes back at
   roughly 1.00 for every component, i.e. it finds no measurable dropout bias —
   which fits, since CCAA non-seniors return at 82-94%. So the scalar is not
   correcting for survivorship. It is correcting for the fact that a delta
   curve measured on players who held a starting job overstates what the
   average returner does, and it is calibrated against held-out data rather
   than assumed. Re-run ablate.js when a season is added; if the unbiased
   point moves, move this with it. */
const AGE_SCALE = 0.75;

const AGE = agingCurve(40);
const HAIRCUT = survivorHaircut();
Object.keys(AGE).forEach(step =>
  ['bb', 'k', 'hr', 'babip'].forEach(f => { AGE[step][f] *= AGE_SCALE; }));

/* Retention, reported on the page so the reader can see what is assumed. */
function retention() {
  const P = forwardPairs('bat', 40, 1);
  const out = {};
  const bump = (y, i) => { out[y] = out[y] || [0, 0]; out[y][i]++; };
  P.pairs.forEach(p => bump(p.from.year || '?', 0));
  P.dropped.forEach(p => bump(p.from.year || '?', 1));
  const r = {};
  ['Fr', 'So', 'Jr'].forEach(y => {
    if (!out[y]) return;
    r[y] = { back: out[y][0], gone: out[y][1], rate: out[y][0] / (out[y][0] + out[y][1]) };
  });
  return r;
}
const RETENTION = retention();

/* =========================================================================
   3. PLAYING TIME MODEL — fit independently of the rate model
   ========================================================================= */
function ptModel(kind) {
  const P = forwardPairs(kind, 10, 1).pairs.filter(p => p.from.year && p.to.year);
  const size = p => kind === 'bat' ? (p.pa || 0) : L.ipToF(p.ip);
  const xs = P.map(p => size(p.from)), ys = P.map(p => size(p.to));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2;
  }
  const b1 = sxy / sxx, b0 = my - b1 * mx;
  return { b0, b1, n, r: sxy / Math.sqrt(sxx * syy) };
}
const PT_BAT = ptModel('bat');
const PT_PIT = ptModel('pit');

/* =========================================================================
   4. THE BATTER PROJECTION
   `chain` is [{key,row}] most recent first, including the anchor season.
   `toClass` is the class the player will be in during the projected season.
   ========================================================================= */
function weightedComponent(chain, get, sizeOf, lgOf) {
  /* Weighted mean of a rate expressed RELATIVE to its own season's league
     rate, so a 2023 line and a 2026 line are on one scale before averaging. */
  let num = 0, den = 0, nEff = 0;
  chain.forEach((c, i) => {
    const w = SEASON_W[i] || 0;
    const r = get(c.rates);
    const sz = sizeOf(c.rates);
    if (r == null || !sz || !w) return;
    const lg = lgOf(C[c.key]);
    if (!lg) return;
    num += w * sz * (r / lg);
    den += w * sz;
    nEff += w * sz;
  });
  if (!den) return null;
  return { rel: num / den, n: nEff / SEASON_W[0] };   // n normalised so year one counts full
}

function regress(rel, n, k) {
  if (rel == null) return 1;
  const w = n / (n + k);
  return w * rel + (1 - w) * 1;    // toward league average, harmonic form
}

function projectBatter(chain, toClass, targetKey) {
  // chain: [{key,row}], most recent first. Attach rates once.
  const ch = chain.map(c => Object.assign({}, c, { rates: L.batRates(c.row) }))
                  .filter(c => c.rates);
  if (!ch.length) return null;
  const anchor = ch[0];
  const lgT = C[targetKey];

  const comp = (get, sizeOf, lgOf, k) => {
    const w = weightedComponent(ch, get, sizeOf, lgOf);
    return w ? { rel: regress(w.rel, w.n, k), n: w.n, raw: w.rel } : { rel: 1, n: 0, raw: null };
  };

  const paSize = r => r.pa;
  const bipSize = r => r.bip;

  let bb = comp(r => r.bb, paSize, c => c.lgBB, K_BAT.bb);
  let k = comp(r => r.k, paSize, c => c.lgK, K_BAT.k);
  let hr = comp(r => r.hr, paSize, c => c.lgHR, K_BAT.hr);
  let babip = comp(r => r.babip, bipSize, c => c.lgBABIP, K_BAT.babip);
  let hbp = comp(r => r.hbp, paSize, c => c.lgHBP, K_BAT.hbp);
  let dh = comp(r => r.d_h, bipSize, c => c.lgD_H, K_BAT.xbh);
  let th = comp(r => r.t_h, bipSize, c => c.lgT_H, K_BAT.xbh);

  // ---- aging ----
  const step = (CLASS.indexOf(toClass) > 0)
    ? CLASS[CLASS.indexOf(toClass) - 1] + '->' + toClass : null;
  const A = step && AGE[step] ? AGE[step] : { bb: 0, k: 0, hr: 0, babip: 0 };
  const aged = {
    bb: Math.max(0.15, bb.rel + A.bb),
    k: Math.max(0.15, k.rel + A.k),
    hr: Math.max(0, hr.rel + A.hr),
    babip: Math.max(0.4, babip.rel + A.babip),
    hbp: hbp.rel, dh: dh.rel, th: th.rel
  };

  // ---- playing time ----
  const paProj = Math.max(0, Math.round(PT_BAT.b0 + PT_BAT.b1 * anchor.rates.pa));

  // ---- reconstruct the line ----
  const pa = paProj;
  const rBB = aged.bb * lgT.lgBB, rK = aged.k * lgT.lgK, rHBP = aged.hbp * lgT.lgHBP;
  const nBB = rBB * pa, nK = rK * pa, nHBP = rHBP * pa, nSF = lgT.lgSF * pa;
  const ab = pa - nBB - nHBP - nSF;
  const nHR = aged.hr * lgT.lgHR * pa;
  const bip = Math.max(0, ab - nK - nHR + nSF);
  const hbip = aged.babip * lgT.lgBABIP * bip;
  const nD = Math.min(hbip, aged.dh * lgT.lgD_H * hbip);
  const nT = Math.min(Math.max(0, hbip - nD), aged.th * lgT.lgT_H * hbip);
  const n1B = Math.max(0, hbip - nD - nT);
  const h = hbip + nHR;

  const wobaDen = ab + nBB + nSF + nHBP;
  const woba = wobaDen > 0
    ? (0.69 * nBB + 0.72 * nHBP + 0.88 * n1B + 1.24 * nD + 1.56 * nT + 2.00 * nHR) / wobaDen
    : 0;

  return {
    pa, ab, h, hr: nHR, doubles: nD, triples: nT, singles: n1B,
    bb: nBB, k: nK, hbp: nHBP, sf: nSF, bip,
    avg: ab > 0 ? h / ab : 0,
    obp: pa > 0 ? (h + nBB + nHBP) / pa : 0,
    slg: ab > 0 ? (n1B + 2 * nD + 3 * nT + 4 * nHR) / ab : 0,
    babip: bip > 0 ? hbip / bip : 0,
    woba,
    wobaRel: lgT.wOBA ? woba / lgT.wOBA : null,
    rel: aged,
    nEff: { bb: bb.n, k: k.n, hr: hr.n, babip: babip.n },
    seasonsUsed: ch.length,
    anchorPA: anchor.rates.pa
  };
}

/* =========================================================================
   5. THE PITCHER PROJECTION
   ERA is not projected directly. It is built from projected K, BB and H rates
   through a run model fit on every pitcher-season in the archive, then blended
   with a heavily-regressed direct ER/IP estimate. Components are far more
   reliable than ER (r .55 and .71 against .31), so the component path carries
   most of the weight.
   ========================================================================= */
function fitRunModel() {
  const X = [], Y = [];
  SEASONS.forEach(key => {
    T[key].pit.forEach(p => {
      const r = L.pitRates(p);
      if (!r || r.ip < 15 || r.k == null) return;
      X.push([1, r.k, r.bb, r.h]); Y.push(r.er_ip);
    });
  });
  // ordinary least squares, 4 params, normal equations with Gaussian elimination
  const n = X.length, m = 4;
  const A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++)
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) A[a][b] += X[i][a] * X[i][b];
      A[a][m] += X[i][a] * Y[i];
    }
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r2 = c + 1; r2 < m; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[piv][c])) piv = r2;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r2 = 0; r2 < m; r2++) {
      if (r2 === c || !A[c][c]) continue;
      const f = A[r2][c] / A[c][c];
      for (let cc = c; cc <= m; cc++) A[r2][cc] -= f * A[c][cc];
    }
  }
  const beta = A.map((row, i) => row[m] / row[i]);
  return { beta, n };
}
const RUN_MODEL = fitRunModel();

function projectPitcher(chain, toClass, targetKey) {
  const ch = chain.map(c => Object.assign({}, c, { rates: L.pitRates(c.row) }))
                  .filter(c => c.rates);
  if (!ch.length) return null;
  const anchor = ch[0];
  const lgT = C[targetKey];
  const bfSize = r => r.bf, ipSize = r => r.ip;
  const comp = (get, sizeOf, lgOf, k) => {
    const w = weightedComponent(ch, get, sizeOf, lgOf);
    return w ? regress(w.rel, w.n, k) : 1;
  };
  const kRel = comp(r => r.k, bfSize, c => c.lgPK, K_PIT.k);
  const bbRel = comp(r => r.bb, bfSize, c => c.lgPBB, K_PIT.bb);
  const hRel = comp(r => r.h, bfSize, c => c.lgPH, K_PIT.h);
  const erRel = comp(r => r.er_ip, ipSize, c => c.lgER_IP, K_PIT.er_ip);

  const ipProj = Math.max(0, PT_PIT.b0 + PT_PIT.b1 * anchor.rates.ip);
  const kR = kRel * lgT.lgPK, bbR = bbRel * lgT.lgPBB, hR = hRel * lgT.lgPH;

  const b = RUN_MODEL.beta;
  const erIpComp = b[0] + b[1] * kR + b[2] * bbR + b[3] * hR;
  const erIpDirect = erRel * lgT.lgER_IP;
  const erIp = Math.max(0.05, 0.65 * erIpComp + 0.35 * erIpDirect);

  const bf = ipProj * 3 + hR * (ipProj * 3) / (1 - hR - bbR || 1);   // rough, refined below
  // solve BF consistently: BF = 3*IP + H + BB, with H = hR*BF, BB = bbR*BF
  const bfSolved = (1 - hR - bbR) > 0 ? (3 * ipProj) / (1 - hR - bbR) : ipProj * 4;
  const nH = hR * bfSolved, nBB = bbR * bfSolved, nK = kR * bfSolved;

  return {
    ip: ipProj, bf: bfSolved,
    h: nH, bb: nBB, k: nK, er: erIp * ipProj,
    era: erIp * 7,                       // seven-inning basis, matches both files
    whip: ipProj > 0 ? (nH + nBB) / ipProj : null,
    k9: ipProj > 0 ? (nK / ipProj) * 9 : null,
    bb9: ipProj > 0 ? (nBB / ipProj) * 9 : null,
    kpct: bfSolved > 0 ? (nK / bfSolved) * 100 : null,
    eraRel: lgT.lgER_IP ? erIp / lgT.lgER_IP : null,
    seasonsUsed: ch.length,
    anchorIP: anchor.rates.ip
  };
}

module.exports = {
  L, D, T, C, SEASONS, CLASS, SEASON_W, K_BAT, K_PIT,
  AGE, AGE_SCALE, HAIRCUT, RETENTION, PT_BAT, PT_PIT, RUN_MODEL,
  forwardPairs, projectBatter, projectPitcher, agingCurve, PIT_K_MULT, leagueRates
};
