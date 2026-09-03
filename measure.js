/* Measures the two empirical inputs the projection model needs that are not
   already in data.js: the class-year aging curve (per component) and the
   survivorship bias attached to it. Pools every adjacent-season transition
   on file: 2023->2024, 2024->2025, 2025->2026. */

const L = require('./lib_load.js');
const D = L.loadData();
const C = L.allConstants(D);
const T = L.seasonTable(D);

const TRANS = [['2022-23', '2023-24'], ['2023-24', '2024-25'], ['2024-25', '2025-26']];

function pairs(kind, minA, minB) {
  const out = [], dropped = [];
  TRANS.forEach(([a, b]) => {
    const ix = L.buildIndex(T[b][kind]);
    const size = p => kind === 'bat' ? (p.pa || 0) : L.ipToF(p.ip);
    T[a][kind].forEach(p => {
      if (size(p) < minA) return;
      // forward match: same resolver, run in the other direction
      const cands = ix[p.team + '|' + L.baseName(p.name)];
      let hit = null;
      if (!cands) { dropped.push({ from: p, a, b }); return; }
      if (cands.length === 1) hit = cands[0];
      else {
        const byNum = cands.filter(x => x.num != null && p.num != null && x.num === p.num);
        if (byNum.length === 1) hit = byNum[0];
        else {
          const i = L.CLASS.indexOf(p.year);
          const want = i >= 0 && i + 1 < 4 ? L.CLASS[i + 1] : null;
          const byClass = want && p.yearSource !== 'inferred'
            ? cands.filter(x => x.year === want) : [];
          if (byClass.length === 1) hit = byClass[0]; else return;  // ambiguous
        }
      }
      if (size(hit) >= minB) out.push({ from: p, to: hit, a, b });
      else dropped.push({ from: p, a, b });
    });
  });
  return { pairs: out, dropped };
}

/* ---------- reliability: year-over-year correlation on component rates ---- */
function corr(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

console.log('=== BATTER year-over-year reliability (40+ PA both ends) ===');
const P = pairs('bat', 40, 40);
console.log('pairs', P.pairs.length, ' dropped below threshold', P.dropped.length,
  ' retention', (100 * P.pairs.length / (P.pairs.length + P.dropped.length)).toFixed(1) + '%');

const comps = ['bb', 'k', 'hr', 'babip'];
const rel = {};
comps.forEach(c => {
  const xs = [], ys = [];
  P.pairs.forEach(p => {
    const a = L.batRates(p.from), b = L.batRates(p.to);
    if (!a || !b || a[c] == null || b[c] == null) return;
    // normalise each side to its own season's league level
    xs.push(a[c]); ys.push(b[c]);
  });
  rel[c] = corr(xs, ys);
  console.log('  ' + c.padEnd(6), 'n=' + String(xs.length).padStart(3), ' r=' + rel[c].toFixed(3));
});
// wOBA itself
{
  const wo = p => {
    const s = p.h - p.doubles - p.triples - p.hr, den = p.ab + p.bb + (p.sf || 0) + p.hbp;
    return den > 0 ? (0.69 * p.bb + 0.72 * p.hbp + 0.88 * s + 1.24 * p.doubles +
      1.56 * p.triples + 2.00 * p.hr) / den : null;
  };
  const xs = [], ys = [];
  P.pairs.forEach(p => { const a = wo(p.from), b = wo(p.to); if (a != null && b != null) { xs.push(a); ys.push(b); } });
  console.log('  wOBA  n=' + xs.length + '  r=' + corr(xs, ys).toFixed(3));
}

/* ---------- aging curve, per component, survivorship-aware ---------------- */
function agingCurve(minB, label) {
  const P2 = pairs('bat', 40, minB);
  const buckets = {};
  P2.pairs.forEach(p => {
    const from = p.from.year, to = p.to.year;
    if (!from || !to) return;
    if (p.from.yearSource === 'unknown' || p.to.yearSource === 'unknown') return;
    const step = from + '->' + to;
    const a = L.batRates(p.from), b = L.batRates(p.to);
    if (!a || !b) return;
    const ca = C[p.a], cb = C[p.b];
    const wo = r => {
      // reconstruct wOBA from rates, normalised to the 2025-26 environment
      return null;
    };
    // component deltas, each normalised to its own season's league rate
    const dl = {
      bb: (a.bb / ca.BB_pct) , bbTo: (b.bb / cb.BB_pct),
      k:  (a.k  / ca.K_pct)  , kTo:  (b.k  / cb.K_pct),
      hr: a.hr, hrTo: b.hr,
      babip: a.babip, babipTo: b.babip,
      pa: a.pa, paTo: b.pa
    };
    (buckets[step] = buckets[step] || []).push(dl);
  });
  console.log('\n=== AGING (' + label + ') ===');
  ['Fr->So', 'So->Jr', 'Jr->Sr'].forEach(step => {
    const a = buckets[step]; if (!a || a.length < 5) { console.log('  ' + step + '  n<5'); return; }
    const mean = f => a.reduce((s, x) => s + f(x), 0) / a.length;
    console.log('  ' + step + '  n=' + String(a.length).padStart(3) +
      '   BB%rel ' + (mean(x => x.bbTo - x.bb) >= 0 ? '+' : '') + mean(x => x.bbTo - x.bb).toFixed(3) +
      '   K%rel ' + (mean(x => x.kTo - x.k) >= 0 ? '+' : '') + mean(x => x.kTo - x.k).toFixed(3) +
      '   HR/PA ' + (mean(x => x.hrTo - x.hr) >= 0 ? '+' : '') + mean(x => x.hrTo - x.hr).toFixed(4) +
      '   BABIP ' + (mean(x => (x.babipTo ?? 0) - (x.babip ?? 0)) >= 0 ? '+' : '') + mean(x => (x.babipTo ?? 0) - (x.babip ?? 0)).toFixed(3) +
      '   PA ' + (mean(x => x.paTo - x.pa) >= 0 ? '+' : '') + mean(x => x.paTo - x.pa).toFixed(0));
  });
  return buckets;
}

agingCurve(40, 'survivors only, 40+ PA both ends');
agingCurve(10, 'inclusive, 10+ PA in year two');

/* ---------- survivorship: how many simply do not come back ---------------- */
console.log('\n=== RETENTION by class (40+ PA in year one) ===');
{
  const byc = {};
  const P3 = pairs('bat', 40, 1);
  P3.pairs.forEach(p => { const y = p.from.year || '?'; byc[y] = byc[y] || [0, 0]; byc[y][0]++; });
  P3.dropped.forEach(p => { const y = p.from.year || '?'; byc[y] = byc[y] || [0, 0]; byc[y][1]++; });
  Object.keys(byc).sort().forEach(y => {
    const [ret, gone] = byc[y];
    console.log('  ' + y.padEnd(3) + ' returned ' + String(ret).padStart(3) +
      '  did not ' + String(gone).padStart(3) +
      '  rate ' + (100 * ret / (ret + gone)).toFixed(1) + '%');
  });
}

/* ---------- playing time: PA_next given PA_prev --------------------------- */
console.log('\n=== PLAYING TIME (players who returned at all) ===');
{
  const P4 = pairs('bat', 10, 1);
  const rows = P4.pairs.filter(p => p.from.year && p.to.year);
  const xs = rows.map(p => p.from.pa), ys = rows.map(p => p.to.pa);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b1 = sxy / sxx, b0 = my - b1 * mx;
  console.log('  n=' + n + '  PA_next = ' + b0.toFixed(1) + ' + ' + b1.toFixed(3) + ' * PA_prev' +
    '   r=' + corr(xs, ys).toFixed(3));
  ['Fr', 'So', 'Jr'].forEach(y => {
    const g = rows.filter(p => p.from.year === y);
    if (g.length < 5) return;
    const resid = g.map(p => p.to.pa - (b0 + b1 * p.from.pa));
    console.log('    from ' + y + '  n=' + String(g.length).padStart(3) +
      '  mean residual ' + (resid.reduce((a, b) => a + b, 0) / g.length >= 0 ? '+' : '') +
      (resid.reduce((a, b) => a + b, 0) / g.length).toFixed(1) + ' PA');
  });
}

/* ---------- pitchers ------------------------------------------------------ */
console.log('\n=== PITCHER reliability (20+ IP both ends) ===');
{
  const PP = pairs('pit', 20, 20);
  console.log('  pairs', PP.pairs.length, ' dropped', PP.dropped.length);
  ['k', 'bb', 'h', 'er_ip'].forEach(c => {
    const xs = [], ys = [];
    PP.pairs.forEach(p => {
      const a = L.pitRates(p.from), b = L.pitRates(p.to);
      if (!a || !b || a[c] == null || b[c] == null) return;
      xs.push(a[c]); ys.push(b[c]);
    });
    if (xs.length >= 3) console.log('  ' + c.padEnd(6) + 'n=' + String(xs.length).padStart(3) + '  r=' + corr(xs, ys).toFixed(3));
  });
}
