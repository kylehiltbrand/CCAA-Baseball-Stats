/* Integrity checks on the frozen projection file. These are the ones that
   would produce a plausible-looking but wrong published forecast. */
const L = require('./lib_load.js');
const { PROJ_BAT, PROJ_PIT, PROJ_CARD } = require('./proj2027.js');
const D = L.loadData();
let fail = 0;
const ck = (label, cond, detail) => {
  if (cond) console.log('  ok    ' + label);
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  ' + detail : '')); }
};

// Santa Maria carries two A. Rice, both with null jersey numbers, so team+name
// is not unique in data.js. Key on the same id build.js emits.
const bIx = new Map(D.batters.map(b => [b.team + '|' + b.name + '|' + b.pa, b]));
const pIx = new Map(D.pitchers.map(p => [p.team + '|' + p.name + '|' + p.ip, p]));

// 1. no graduating seniors
ck('no seniors projected (batters)', PROJ_BAT.every(p => p.y26 !== 'Sr'),
   PROJ_BAT.filter(p => p.y26 === 'Sr').map(p => p.n).join(','));
ck('no seniors projected (pitchers)', PROJ_PIT.every(p => p.y26 !== 'Sr'));

// 2. class advances by exactly one
const NX = { Fr: 'So', So: 'Jr', Jr: 'Sr' };
ck('class advances one step', [...PROJ_BAT, ...PROJ_PIT].every(p => NX[p.y26] === p.y));

// 3. every projected player exists in data.js with matching 2026 line
ck('all batters trace to data.js', PROJ_BAT.every(p => {
  const r = bIx.get(p.id); return r && r.pa === p.pa26 && r.name === p.n; }));
ck('all pitchers trace to data.js', PROJ_PIT.every(p => {
  const r = pIx.get(p.id); return r && String(r.ip) === String(p.ip26); }));

// 4. no duplicate rows
const bk = PROJ_BAT.map(p => p.id);
ck('no duplicate batters', new Set(bk).size === bk.length);
const pk = PROJ_PIT.map(p => p.id);
ck('no duplicate pitchers', new Set(pk).size === pk.length);

// 5. every returner above the PA/IP floor is present (nobody silently dropped)
const expB = D.batters.filter(b => NX[b.year] && (b.pa || 0) >= 15).length;
ck('every eligible returning batter projected', PROJ_BAT.length === expB,
   PROJ_BAT.length + ' of ' + expB);
const expP = D.pitchers.filter(p => NX[p.year] && L.ipToF(p.ip) >= 8).length;
ck('every eligible returning pitcher projected', PROJ_PIT.length === expP,
   PROJ_PIT.length + ' of ' + expP);

// 6. bands must straddle the point estimate
ck('wRC+ bands straddle projection',
   PROJ_BAT.every(p => p.wrc20 <= p.wrc && p.wrc <= p.wrc80),
   PROJ_BAT.filter(p => !(p.wrc20 <= p.wrc && p.wrc <= p.wrc80)).map(p => p.n).join(','));
ck('ERA bands straddle projection',
   PROJ_PIT.every(p => p.era20 <= p.era && p.era <= p.era80));

// 7. no impossible or missing values
const finite = (o, keys) => keys.every(k => typeof o[k] === 'number' && isFinite(o[k]));
ck('batter fields finite', PROJ_BAT.every(p =>
   finite(p, ['pa','avg','obp','slg','woba','wrc','owar','babip','hr','bb','k'])));
ck('pitcher fields finite', PROJ_PIT.every(p =>
   finite(p, ['ip','era','whip','k9','bb9','eraplus','pwar'])));
ck('rate stats in range', PROJ_BAT.every(p =>
   p.avg > 0 && p.avg < .700 && p.obp >= p.avg && p.obp < .800 &&
   p.slg >= p.avg && p.babip > .150 && p.babip < .700));
ck('OBP >= AVG for all', PROJ_BAT.every(p => p.obp >= p.avg));
ck('projected PA plausible', PROJ_BAT.every(p => p.pa >= 20 && p.pa <= 180));
ck('projected ERA plausible', PROJ_PIT.every(p => p.era > 0.5 && p.era < 15));

// 8. comps present and well-formed
ck('every batter has 3 comps', PROJ_BAT.every(p => p.comps && p.comps.length === 3));
ck('comps name real players', PROJ_BAT.every(p =>
   p.comps.every(c => c.n && c.t && /^\d{4}-\d{2}$/.test(c.s))));
ck('no player is his own comp', PROJ_BAT.every(p =>
   p.comps.every(c => !(c.n === p.n && c.t === p.t))));

// 9. regression must actually pull toward league average
const lgW = PROJ_CARD.lg.wOBA;
const spread = a => { const m = a.reduce((s,x)=>s+x,0)/a.length;
  return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length); };
const projSpread = spread(PROJ_BAT.map(p => p.woba));
const actSpread = spread(PROJ_BAT.map(p => bIx.get(p.id).woba));
ck('projections less spread than 2026 actuals', projSpread < actSpread,
   projSpread.toFixed(4) + ' vs ' + actSpread.toFixed(4));

// 10. league coverage
const teams = new Set(PROJ_BAT.map(p => p.t));
ck('most programs represented', teams.size >= 13, teams.size + ' of 15');

console.log('\n  league wOBA ' + lgW + '  |  projected wOBA range ' +
  Math.min(...PROJ_BAT.map(p=>p.woba)).toFixed(3) + '-' +
  Math.max(...PROJ_BAT.map(p=>p.woba)).toFixed(3) +
  '  |  2026 actual range ' +
  Math.min(...PROJ_BAT.map(p=>bIx.get(p.id).woba)).toFixed(3) + '-' +
  Math.max(...PROJ_BAT.map(p=>bIx.get(p.id).woba)).toFixed(3));
console.log(fail ? '\n  ' + fail + ' FAILED' : '\n  ALL DATA CHECKS PASSED');
process.exit(fail ? 1 : 0);
