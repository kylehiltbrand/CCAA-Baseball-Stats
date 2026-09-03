/* Loads data.js (2025-26) and history.js (2022-23..2024-25) into one
   cross-season table of player-seasons, and resolves player identity across
   seasons so a 2026 junior can be traced back to his freshman year. */

const fs = require('fs');
const path = require('path');
const { HIST, HISTORY } = require('./history.js');

/* data.js is a browser script, not a module. Compile it and grab the globals. */
function loadData() {
  const src = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
  const m = new module.constructor();
  m._compile(src + '\nmodule.exports={batters,pitchers,teams,standingsData,' +
    'LG_WOBA,LG_R_PA,LG_AVG,LG_OBP,LG_ERA,LG_BABIP,WOBA_SCALE,DATA_UPDATED,' +
    'RUNS_PER_WIN,RAA_PER_600,REPL_RUNS_600,REPL_RUNS_IP,REPL_WRC,' +
    'calcWOBA,calcWRC_plus,calcOWAR,calcERA_plus,calcPWAR};',
    path.join(__dirname, 'data.js'));
  return m.exports;
}

const CUR = '2025-26';
const SEASONS = ['2022-23', '2023-24', '2024-25', CUR];
const CLASS = ['Fr', 'So', 'Jr', 'Sr'];
const ipToF = HIST.ipToF;
const baseName = HIST.baseName;

/* Season-level league constants, on one basis for all four seasons. */
function allConstants(D) {
  const out = {};
  HIST.seasons().forEach(k => { out[k] = HIST.constants(k); });
  // 2025-26 computed the same way from data.js rows
  const B = D.batters, P = D.pitchers;
  const s = (a, f) => a.reduce((t, x) => t + (x[f] || 0), 0);
  const pa = s(B, 'pa'), ab = s(B, 'ab'), h = s(B, 'h'), bb = s(B, 'bb');
  const hbp = s(B, 'hbp'), sf = s(B, 'sf'), r = s(B, 'r'), k = s(B, 'k');
  const d = s(B, 'doubles'), t3 = s(B, 'triples'), hr = s(B, 'hr');
  const ip = P.reduce((a, x) => a + ipToF(x.ip), 0);
  const den = ab + bb + sf + hbp, singles = h - d - t3 - hr;
  out[CUR] = {
    season: CUR, PA: pa, AB: ab, IP: Math.round(ip * 10) / 10,
    AVG: h / ab, OBP: (h + bb + hbp) / pa,
    wOBA: (0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * d + 1.56 * t3 + 2.00 * hr) / den,
    R_PA: r / pa, BB_pct: bb / pa, K_pct: k / pa,
    ERA: (s(P, 'er') * 7) / ip, K9: (s(P, 'k') * 9) / ip,
    WHIP: (s(P, 'bb') + s(P, 'h')) / ip
  };
  return out;
}

/* Normalised batter component rates. Everything a projection needs, derived
   once so the model never touches raw counting stats again. */
function batRates(p) {
  const pa = p.pa || 0;
  if (!pa) return null;
  const ab = p.ab || 0, h = p.h || 0, hr = p.hr || 0, k = p.k || 0;
  const d = p.doubles || 0, t3 = p.triples || 0, sf = p.sf || 0;
  const bip = ab - k - hr + sf;          // balls in play (SF are batted balls)
  const hbip = h - hr;                    // hits on balls in play
  return {
    pa, ab, bip,
    bb: (p.bb || 0) / pa,
    k: k / pa,
    hbp: (p.hbp || 0) / pa,
    sf: sf / pa,
    hr: hr / pa,
    babip: bip > 0 ? hbip / bip : null,
    // extra-base share OF hits in play, so reconstruction can never go negative
    d_h: hbip > 0 ? d / hbip : null,
    t_h: hbip > 0 ? t3 / hbip : null
  };
}

function pitRates(p) {
  const ip = ipToF(p.ip);
  if (!ip) return null;
  const bf = ip * 3 + (p.h || 0) + (p.bb || 0);   // same estimator data.js uses
  return {
    ip, bf,
    k: bf > 0 ? (p.k || 0) / bf : null,
    bb: bf > 0 ? (p.bb || 0) / bf : null,
    h: bf > 0 ? (p.h || 0) / bf : null,
    er_ip: (p.er || 0) / ip
  };
}

/* ---- identity resolution -------------------------------------------------
   Chains a player across seasons. Same team plus same base name is the
   primary key; jersey number or class-year distance breaks ties on rosters
   that carry duplicate names. Never guesses: an unresolved tie is dropped,
   not paired, which is the same contract history.js matchedPairs() honours. */
function classAt(year, gapBack) {
  const i = CLASS.indexOf(year);
  if (i < 0) return null;
  const j = i - gapBack;
  return j >= 0 ? CLASS[j] : null;
}

function buildIndex(rows) {
  const ix = {};
  rows.forEach(p => {
    const key = p.team + '|' + baseName(p.name);
    (ix[key] = ix[key] || []).push(p);
  });
  return ix;
}

/* Find `p` (from season `curKey`) in an earlier season's index. gapBack is how
   many seasons earlier. Returns {row, how} or null. */
function findEarlier(p, ix, gapBack) {
  const cands = ix[p.team + '|' + baseName(p.name)];
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return { row: cands[0], how: 'name' };
  const byNum = cands.filter(x => x.num != null && p.num != null && x.num === p.num);
  if (byNum.length === 1) return { row: byNum[0], how: 'num' };
  const want = classAt(p.year, gapBack);
  if (want && p.yearSource !== 'inferred') {
    const byClass = cands.filter(x => x.year === want);
    if (byClass.length === 1) return { row: byClass[0], how: 'class' };
  }
  return null;   // ambiguous — deliberately unresolved
}

/* Full table: { seasonKey: {bat:[], pit:[]} } with num present everywhere. */
function seasonTable(D) {
  const T = {};
  HIST.seasons().forEach(k => {
    const S = HIST.season(k);
    T[k] = { bat: S.batters, pit: S.pitchers };
  });
  T[CUR] = { bat: D.batters, pit: D.pitchers };
  return T;
}

/* For every player-season in `fromKey`, attach the chain of that same player's
   earlier seasons. Returns rows augmented with `.hist` = [{key,row,how}...]
   ordered most recent first. */
function withHistory(T, fromKey, kind) {
  const idx = SEASONS.indexOf(fromKey);
  const earlier = SEASONS.slice(0, idx);      // oldest..newest before fromKey
  const idxs = {};
  earlier.forEach(k => { idxs[k] = buildIndex(T[k][kind]); });
  const amb = [];
  const out = T[fromKey][kind].map(p => {
    const hist = [];
    for (let g = 1; g <= earlier.length; g++) {
      const k = SEASONS[idx - g];
      const hit = findEarlier(p, idxs[k], g);
      if (hit) hist.push({ key: k, row: hit.row, how: hit.how, gap: g });
      else if (idxs[k][p.team + '|' + baseName(p.name)]) amb.push({ p, k });
    }
    return Object.assign({}, p, { hist, _src: p });
  });
  return { rows: out, ambiguous: amb };
}

module.exports = {
  loadData, allConstants, seasonTable, withHistory, buildIndex, findEarlier,
  batRates, pitRates, ipToF, baseName, classAt,
  CUR, SEASONS, CLASS, HIST, HISTORY
};
