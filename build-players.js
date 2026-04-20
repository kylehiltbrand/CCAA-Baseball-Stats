#!/usr/bin/env node
// ============================================================
// build-players.js — generates static player pages + OG card PNGs
// ============================================================
// Run locally:   node build-players.js
// Run in CI:     npm run build (via Vercel build command)
//
// Reads: data.js (batters[], pitchers[], teams[]) + local team logo PNGs
// Writes:
//   - player/<team-slug>/<player-slug>.html  (redirect page with meta tags)
//   - player/og/<team-slug>/<player-slug>.png (1200x630 unfurl card)
//
// Each generated HTML file:
//   - OG/Twitter meta tags with player name, team, and key stats
//   - og:image points to the per-player PNG card
//   - Instant redirect to /stats.html#player=...&team=...&d=...
//
// Humans clicking the link land on the real app. Unfurlers (iMessage,
// Slack, Twitter, Discord, LinkedIn) read the meta tags first.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Resvg } = require('@resvg/resvg-js');

// ── Config ─────────────────────────────────────────────────
const SITE_URL = 'https://ccaabaseballstats.com';
const OUTPUT_DIR = path.join(__dirname, 'player');
const OG_DIR = path.join(OUTPUT_DIR, 'og');
const DATA_FILE = path.join(__dirname, 'data.js');
const LOGO_DIR = __dirname; // team logos (ag.png, ata.png, ...) sit in repo root

// ── Load data.js in a sandbox ──────────────────────────────
// data.js is written for the browser but has no DOM deps, so we can
// evaluate it in a Node vm sandbox and pull out batters/pitchers/teams.
const dataSrc = fs.readFileSync(DATA_FILE, 'utf8');
const sandbox = { Math, console };
vm.createContext(sandbox);
// Run data.js, then pull the names we need out of the sandbox's global scope.
// `const` declarations in a script don't show up as properties on the context
// object, so we append a small exporter that copies them onto globalThis.
const exporter = `
globalThis.__ccaa__ = {
  batters: typeof batters !== 'undefined' ? batters : null,
  pitchers: typeof pitchers !== 'undefined' ? pitchers : null,
  teams: typeof teams !== 'undefined' ? teams : null,
  DATA_UPDATED: typeof DATA_UPDATED !== 'undefined' ? DATA_UPDATED : null,
};
`;
vm.runInContext(dataSrc + '\n' + exporter, sandbox);

const { batters, pitchers, teams, DATA_UPDATED } = sandbox.__ccaa__ || {};

if (!batters || !pitchers || !teams) {
  console.error('ERROR: data.js did not expose batters/pitchers/teams.');
  process.exit(1);
}

console.log(`Loaded ${batters.length} batters, ${pitchers.length} pitchers, ${teams.length} teams.`);
console.log(`Data updated: ${DATA_UPDATED}`);

// ── Team metadata (mirrors stats.html LOGOS + TC maps) ─────
// Logo filenames are relative to the repo root — Vercel serves them and
// they also exist on disk at build time so we can embed them into SVG.
const LOGO_FILES = {
  "Arroyo Grande": "ag.png",
  "Atascadero": "ata.png",
  "Cabrillo": "cabrillo.png",
  "Lompoc": "lompoc.png",
  "Mission College Prep": "mp.png",
  "St. Joseph": "sj.png",
  "Morro Bay": "mb.png",
  "Nipomo": "nipomo.png",
  "Paso Robles": "paso.png",
  "Pioneer Valley": "pv.png",
  "Righetti": "righetti.png",
  "San Luis Obispo": "slo.png",
  "Santa Maria": "santa_maria.png",
  "Santa Ynez": "santa_ynez.png",
  "Templeton": "templeton.png",
};
// Muted team palettes — mirror TC in stats.html. `bg` is a dark backdrop,
// `fg` is the accent (for team abbreviation fallback), `a` is the short code.
const TEAM_COLORS = {
  "St. Joseph":           { bg: "#2d4a1e", fg: "#a8d5a2", a: "SJ"  },
  "Arroyo Grande":        { bg: "#3a3010", fg: "#f0d080", a: "AG"  },
  "Righetti":             { bg: "#2d1a4a", fg: "#c4a0f0", a: "RHS" },
  "Morro Bay":            { bg: "#0f2a40", fg: "#80c8f0", a: "MB"  },
  "Mission College Prep": { bg: "#0e2d5e", fg: "#6bb8ff", a: "MP"  },
  "Lompoc":               { bg: "#1a1a2e", fg: "#90a8e0", a: "LOM" },
  "Paso Robles":          { bg: "#2a1010", fg: "#e08080", a: "PAS" },
  "San Luis Obispo":      { bg: "#1a1a2e", fg: "#c8b060", a: "SLO" },
  "Atascadero":           { bg: "#2a1810", fg: "#e09060", a: "ATA" },
  "Templeton":            { bg: "#1a2a1a", fg: "#90c890", a: "TMP" },
  "Cabrillo":             { bg: "#1a1a1a", fg: "#c8b060", a: "CAB" },
  "Nipomo":               { bg: "#1a1a2a", fg: "#a0a0c8", a: "NIP" },
  "Pioneer Valley":       { bg: "#0f2a2a", fg: "#80c8c8", a: "PV"  },
  "Santa Ynez":           { bg: "#2a1a10", fg: "#e0a060", a: "SY"  },
  "Santa Maria":          { bg: "#2a0f0f", fg: "#e08080", a: "SM"  },
};
// Cache base64-encoded logos so we only read each file once.
const LOGO_CACHE = {};
function getLogoDataUri(team) {
  if (team in LOGO_CACHE) return LOGO_CACHE[team];
  const fname = LOGO_FILES[team];
  if (!fname) { LOGO_CACHE[team] = null; return null; }
  const p = path.join(LOGO_DIR, fname);
  if (!fs.existsSync(p)) {
    console.warn(`  (logo missing for ${team}: ${fname} — falling back to abbreviation)`);
    LOGO_CACHE[team] = null;
    return null;
  }
  const b64 = fs.readFileSync(p).toString('base64');
  const mime = fname.toLowerCase().endsWith('.png') ? 'image/png' :
               fname.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  LOGO_CACHE[team] = `data:${mime};base64,${b64}`;
  return LOGO_CACHE[team];
}

// Friendly DATA_UPDATED label for the card footer. "2026-04-17" → "Apr 17".
function formatUpdatedLabel(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  return `Stats through ${months[mm-1]} ${dd}`;
}
const UPDATED_LABEL = formatUpdatedLabel(DATA_UPDATED);

// ── Slug helper ────────────────────────────────────────────
function slugify(s) {
  return s
    .toLowerCase()
    .replace(/\./g, '')        // drop periods (A. Winter -> a winter)
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, '');   // trim leading/trailing hyphens
}

// ── Build unified player list ──────────────────────────────
// One page per distinct player. Normally (team, name) is unique, so that's
// the key. When duplicate names exist on the same team (e.g., two L. Hobbs
// on Nipomo, one Sr + one Fr), we add `year` to the key so their
// batter + pitcher lines group together on ONE page per human player.
// We still carry a PA/IP disambiguator in the URL for the frontend
// modal to find the exact row — the frontend logic is unchanged.
const playerMap = new Map();

// First pass: detect duplicate names on the same team across the union of
// batters and pitchers. If the same (team, name) has distinct `year` values,
// we treat year as part of the identity.
const identityBuckets = new Map(); // `${team}|${name}` -> Set of years
function trackIdentity(team, name, year) {
  const k = `${team}|${name}`;
  if (!identityBuckets.has(k)) identityBuckets.set(k, new Set());
  identityBuckets.get(k).add(year || '');
}
batters.forEach(b => trackIdentity(b.team, b.name, b.year));
pitchers.forEach(p => trackIdentity(p.team, p.name, p.year));

function playerKey(team, name, year) {
  const bucket = identityBuckets.get(`${team}|${name}`);
  const needsYear = bucket && bucket.size > 1;
  return needsYear ? `${team}|${name}|${year || ''}` : `${team}|${name}`;
}

// Also need PA/IP disambiguation if a player somehow has TWO batter rows
// with the same (team, name, year). Rare, but we detect it.
const batterRowCounts = new Map();
batters.forEach(b => {
  const k = playerKey(b.team, b.name, b.year) + '|bat';
  batterRowCounts.set(k, (batterRowCounts.get(k) || 0) + 1);
});
const pitcherRowCounts = new Map();
pitchers.forEach(p => {
  const k = playerKey(p.team, p.name, p.year) + '|pit';
  pitcherRowCounts.set(k, (pitcherRowCounts.get(k) || 0) + 1);
});

function addRole(team, name, year, role, row) {
  const key = playerKey(team, name, year);
  if (!playerMap.has(key)) {
    playerMap.set(key, { team, name, year, roles: {}, batterDisamb: null, pitcherDisamb: null });
  }
  const entry = playerMap.get(key);
  entry.roles[role] = row;
  if (role === 'batter' && batterRowCounts.get(key + '|bat') > 1) entry.batterDisamb = row.pa;
  if (role === 'pitcher' && pitcherRowCounts.get(key + '|pit') > 1) entry.pitcherDisamb = row.ip;
}

batters.forEach(b => addRole(b.team, b.name, b.year, 'batter', b));
pitchers.forEach(p => addRole(p.team, p.name, p.year, 'pitcher', p));

console.log(`Unique player pages to generate: ${playerMap.size}`);

// ── OG description builder ─────────────────────────────────
// Pulls the player's key stats. For two-way players, shows a hitting
// slash line + a pitching line. For single-role, shows the best 3-4 stats.
function buildDescription(entry) {
  const b = entry.roles.batter;
  const p = entry.roles.pitcher;
  const parts = [];
  if (b && b.pa >= 5) {
    const avg = b.avg != null ? b.avg.toFixed(3).replace(/^0/, '') : '---';
    const obp = b.obp != null ? b.obp.toFixed(3).replace(/^0/, '') : '---';
    const slg = b.slg != null ? b.slg.toFixed(3).replace(/^0/, '') : '---';
    const slash = `${avg}/${obp}/${slg}`;
    const extras = [];
    if (b.hr > 0) extras.push(`${b.hr} HR`);
    if (b.rbi > 0) extras.push(`${b.rbi} RBI`);
    if (b.wrc_plus != null) extras.push(`${b.wrc_plus} wRC+`);
    parts.push(`Hitting: ${slash}${extras.length ? ' • ' + extras.join(', ') : ''}`);
  }
  if (p && p.ip > 0) {
    const era = p.era != null ? p.era.toFixed(2) : '---';
    const whip = p.whip != null ? p.whip.toFixed(2) : '---';
    const extras = [];
    extras.push(`${p.ip} IP`);
    if (p.k != null) extras.push(`${p.k} K`);
    if (p.era_plus != null) extras.push(`${p.era_plus} ERA+`);
    parts.push(`Pitching: ${era} ERA, ${whip} WHIP • ${extras.join(', ')}`);
  }
  if (parts.length === 0) {
    parts.push(`${entry.team} • CCAA ${teamLeague(entry.team)}`);
  }
  return parts.join(' | ');
}

function teamLeague(team) {
  const t = teams.find(x => x.name === team);
  if (!t) return '';
  // "CCAA - Mountain" -> "Mountain"
  const m = (t.league || '').match(/-\s*(\w+)/);
  return m ? m[1] : '';
}

// ── OG card SVG generator ──────────────────────────────────
// Builds a 1200x630 SVG card for a player. Rasterized to PNG by resvg.
//
// Layout:
//   Top bar (gold accent line)
//   Header row: team logo (or fallback badge) + team name + league/year
//   Player name (large, serves as the visual anchor)
//   Role label ("HITTER" / "PITCHER" / "TWO-WAY")
//   Stat tiles row (4 tiles for one-way, 2 rows of tiles for two-way)
//   Footer: ccaabaseballstats.com + stats-through date

// SVG-safe text escape (XML predefined entities — apostrophe goes to &#39;)
function svgEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Pick a color for wRC+ / ERA+ based on value (green = elite, red = poor).
// Returns a dark-theme-safe hex. Mirrors the spirit of your table color bands.
function rcColor(val) {
  if (val == null) return '#e2e8f0';
  if (val >= 130) return '#5dcaa5'; // teal-ish green, matches your site
  if (val >= 100) return '#e2e8f0';
  if (val >= 80)  return '#8b9cb5';
  return '#e07b7b';
}
function eraPlusColor(val) {
  // Same thresholds as wRC+ (convention: 100 is avg, higher is better).
  return rcColor(val);
}

// Format a batter slash to ".613/.667/.645". Leading zero dropped.
function fmtSlash(b) {
  const f = v => v != null ? v.toFixed(3).replace(/^0/, '') : '---';
  return `${f(b.avg)}/${f(b.obp)}/${f(b.slg)}`;
}

// Build a single stat tile. Returns SVG string.
// label is uppercased small text; value is the big number (optional color).
function statTile(x, y, w, h, label, value, valueColor = '#e2e8f0', valueSize = 52) {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#161b22" stroke="#21293a" stroke-width="1"/>
  <text x="${x + 20}" y="${y + 34}" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="500" fill="#8b9cb5" letter-spacing="2">${svgEscape(label)}</text>
  <text x="${x + 20}" y="${y + h - 22}" font-family="Rajdhani, Inter, sans-serif" font-size="${valueSize}" font-weight="700" fill="${valueColor}">${svgEscape(value)}</text>`;
}

// Two-way detection: must have meaningful PA AND meaningful IP.
function isTwoWay(entry) {
  const b = entry.roles.batter;
  const p = entry.roles.pitcher;
  return b && p && b.pa >= 15 && p.ip >= 5;
}

function buildCardSvg(entry) {
  const { team, name, year, roles } = entry;
  const b = roles.batter;
  const p = roles.pitcher;
  const tc = TEAM_COLORS[team] || { bg: '#222', fg: '#aaa', a: (team || '').slice(0, 3).toUpperCase() };
  const logoUri = getLogoDataUri(team);

  // Header row pieces
  const teamBadge = logoUri
    ? `<image x="60" y="60" width="68" height="68" href="${logoUri}" preserveAspectRatio="xMidYMid meet"/>`
    : `<rect x="60" y="60" width="68" height="68" rx="8" fill="${tc.bg}"/>
       <text x="94" y="107" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="${tc.fg}" text-anchor="middle">${svgEscape(tc.a)}</text>`;

  const league = teamLeague(team).toUpperCase();
  const yr = year ? ` • ${svgEscape(year.toUpperCase())}` : '';
  const metaLine = `CCAA${league ? ' • ' + league : ''}${yr}`;

  // Player name — scale down if very long so it fits 1080px wide area
  // Rough estimate: at 80px, ~15 chars fit. Scale if longer.
  let nameSize = 88;
  if (name.length > 16) nameSize = 74;
  if (name.length > 20) nameSize = 64;

  // Role label
  let roleLabel;
  if (isTwoWay(entry)) roleLabel = 'TWO-WAY';
  else if (b && b.pa > 0) roleLabel = 'HITTER';
  else if (p && p.ip > 0) roleLabel = 'PITCHER';
  else roleLabel = '';

  // Stat tiles — layout depends on role
  let statsSvg = '';
  if (isTwoWay(entry)) {
    // Split card: hitting row (top) + pitching row (bottom), smaller tiles.
    const rowH = 90;
    const gap = 20;
    // Hitting row — y=380
    const hY = 380;
    const tile1W = 230, tile2W = 140, tile3W = 140, tile4W = 210;
    const hX1 = 60, hX2 = hX1 + tile1W + gap, hX3 = hX2 + tile2W + gap, hX4 = hX3 + tile3W + gap;
    statsSvg += `
  <text x="60" y="${hY - 14}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="500" fill="#f0a500" letter-spacing="2">HITTING</text>
  ${statTile(hX1, hY, tile1W, rowH, 'SLASH LINE', fmtSlash(b), '#e2e8f0', 34)}
  ${statTile(hX2, hY, tile2W, rowH, 'wRC+', b.wrc_plus != null ? String(b.wrc_plus) : '—', rcColor(b.wrc_plus), 44)}
  ${statTile(hX3, hY, tile3W, rowH, 'oWAR', b.owar != null ? (b.owar >= 0 ? '+' : '') + b.owar.toFixed(1) : '—', '#e2e8f0', 44)}
  ${statTile(hX4, hY, tile4W, rowH, 'GP · PA · HR · RBI', `${b.gp ?? '—'} · ${b.pa ?? '—'} · ${b.hr ?? 0} · ${b.rbi ?? 0}`, '#e2e8f0', 30)}`;
    // Pitching row — y=500
    const pY = 500;
    statsSvg += `
  <text x="60" y="${pY - 14}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="500" fill="#f0a500" letter-spacing="2">PITCHING</text>
  ${statTile(hX1, pY, tile1W, rowH, 'ERA / WHIP', `${p.era != null ? p.era.toFixed(2) : '—'} / ${p.whip != null ? p.whip.toFixed(2) : '—'}`, '#e2e8f0', 32)}
  ${statTile(hX2, pY, tile2W, rowH, 'ERA+', p.era_plus != null ? String(p.era_plus) : '—', eraPlusColor(p.era_plus), 44)}
  ${statTile(hX3, pY, tile3W, rowH, 'pWAR', p.pwar != null ? (p.pwar >= 0 ? '+' : '') + p.pwar.toFixed(1) : '—', '#e2e8f0', 44)}
  ${statTile(hX4, pY, tile4W, rowH, 'IP · K · W-L', `${p.ip ?? '—'} · ${p.k ?? 0} · ${p.w ?? 0}-${p.l ?? 0}`, '#e2e8f0', 30)}`;
  } else if (b && b.pa > 0) {
    // Single-role: hitter. Big tiles at y=380, 130 tall.
    const y = 380;
    const h = 130;
    const gap = 20;
    const t1W = 320, t2W = 170, t3W = 170, t4W = 260;
    const x1 = 60, x2 = x1 + t1W + gap, x3 = x2 + t2W + gap, x4 = x3 + t3W + gap;
    statsSvg = `
  ${statTile(x1, y, t1W, h, 'SLASH LINE', fmtSlash(b), '#e2e8f0', 44)}
  ${statTile(x2, y, t2W, h, 'wRC+', b.wrc_plus != null ? String(b.wrc_plus) : '—', rcColor(b.wrc_plus), 56)}
  ${statTile(x3, y, t3W, h, 'oWAR', b.owar != null ? (b.owar >= 0 ? '+' : '') + b.owar.toFixed(1) : '—', '#e2e8f0', 56)}
  ${statTile(x4, y, t4W, h, 'GP · PA · HR · RBI', `${b.gp ?? '—'} · ${b.pa ?? '—'} · ${b.hr ?? 0} · ${b.rbi ?? 0}`, '#e2e8f0', 40)}`;
  } else if (p && p.ip > 0) {
    // Single-role: pitcher.
    const y = 380;
    const h = 130;
    const gap = 20;
    const t1W = 280, t2W = 170, t3W = 170, t4W = 300;
    const x1 = 60, x2 = x1 + t1W + gap, x3 = x2 + t2W + gap, x4 = x3 + t3W + gap;
    statsSvg = `
  ${statTile(x1, y, t1W, h, 'ERA / WHIP', `${p.era != null ? p.era.toFixed(2) : '—'} / ${p.whip != null ? p.whip.toFixed(2) : '—'}`, '#e2e8f0', 42)}
  ${statTile(x2, y, t2W, h, 'ERA+', p.era_plus != null ? String(p.era_plus) : '—', eraPlusColor(p.era_plus), 56)}
  ${statTile(x3, y, t3W, h, 'pWAR', p.pwar != null ? (p.pwar >= 0 ? '+' : '') + p.pwar.toFixed(1) : '—', '#e2e8f0', 56)}
  ${statTile(x4, y, t4W, h, 'IP · K · W-L', `${p.ip ?? '—'} · ${p.k ?? 0} · ${p.w ?? 0}-${p.l ?? 0}`, '#e2e8f0', 40)}`;
  }

  const teamDisplay = svgEscape(team.toUpperCase());
  const nameDisplay = svgEscape(name);
  const metaDisplay = svgEscape(metaLine);
  const roleDisplay = svgEscape(roleLabel);

  // Name vertical position depends on size. Baseline target ~290.
  const nameY = 260 + Math.round((88 - nameSize) / 2);
  // Role label position: just below name baseline, with a small accent line.
  const roleY = isTwoWay(entry) ? 340 : 340;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d1117"/>
  <rect x="0" y="0" width="1200" height="6" fill="#f0a500"/>

  ${teamBadge}
  <text x="148" y="90" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="500" fill="#8b9cb5" letter-spacing="2">${teamDisplay}</text>
  <text x="148" y="120" font-family="Inter, system-ui, sans-serif" font-size="16" font-weight="400" fill="#4a5568" letter-spacing="3">${metaDisplay}</text>

  <text x="60" y="${nameY}" font-family="Rajdhani, Inter, sans-serif" font-size="${nameSize}" font-weight="700" fill="#e2e8f0">${nameDisplay}</text>

  <rect x="60" y="${roleY - 34}" width="44" height="2" fill="#f0a500"/>
  <text x="60" y="${roleY}" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="500" fill="#8b9cb5" letter-spacing="2">${roleDisplay}</text>

  ${statsSvg}

  <rect x="60" y="590" width="1080" height="1" fill="#21293a"/>
  <text x="60" y="${isTwoWay(entry) ? 618 : 618}" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="500" fill="#8b9cb5">ccaabaseballstats.com</text>
  <text x="1140" y="${isTwoWay(entry) ? 618 : 618}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="400" fill="#4a5568" text-anchor="end">${svgEscape(UPDATED_LABEL)}</text>
</svg>`;
}

// Rasterize SVG to PNG at 1200x630.
function rasterizeSvg(svgString) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      // resvg falls back to system fonts — fine for Inter/Rajdhani which are
      // common. In CI the container has DejaVu Sans as fallback.
      loadSystemFonts: true,
      defaultFontFamily: 'Inter',
    },
    background: '#0d1117',
  });
  return resvg.render().asPng();
}

// Writes the OG PNG for an entry. Returns the /player/og/... path.
function writeOgPng(entry) {
  const { team, name, year } = entry;
  const identityBucket = identityBuckets.get(`${team}|${name}`);
  const namesakesExist = identityBucket && identityBucket.size > 1;
  const yearSlug = namesakesExist && year ? '-' + slugify(year) : '';
  const fileName = `${slugify(name)}${yearSlug}.png`;
  const dir = path.join(OG_DIR, slugify(team));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  const svg = buildCardSvg(entry);
  const png = rasterizeSvg(svg);
  fs.writeFileSync(filePath, png);
  return `/player/og/${slugify(team)}/${fileName}`;
}



function renderPlayerPage(entry, ogImagePath) {
  const { team, name, year, roles, batterDisamb, pitcherDisamb } = entry;
  const title = `${name} — ${team}`;
  const description = buildDescription(entry);

  // The frontend's hash autoload hardcodes tab='hitting' and uses `d` as
  // the disambiguator for finding the batter row (matches on PA for batters,
  // IP for pitchers). If multiple distinct humans share team+name (e.g.,
  // two L. Hobbs on Nipomo — Sr and Fr), we MUST send a `d=` param or
  // the frontend will pick whichever row appears first in the array.
  const identityBucket = identityBuckets.get(`${team}|${name}`);
  const namesakesExist = identityBucket && identityBucket.size > 1;
  let d = null;
  if (roles.batter && (batterDisamb != null || namesakesExist)) {
    d = roles.batter.pa;
  } else if (roles.pitcher && (pitcherDisamb != null || namesakesExist)) {
    d = roles.pitcher.ip;
  }

  const hashParts = [
    `player=${encodeURIComponent(name)}`,
    `team=${encodeURIComponent(team)}`,
  ];
  if (d != null) hashParts.push(`d=${encodeURIComponent(d)}`);
  const redirectTarget = `/stats.html#${hashParts.join('&')}`;

  // Canonical URL — use year when years disambiguate this name on this team.
  // Otherwise just team/player slug.
  const needsYearSlug = namesakesExist;
  const yearSlug = needsYearSlug && year ? '-' + slugify(year) : '';
  const canonicalPath = `/player/${slugify(team)}/${slugify(name)}${yearSlug}.html`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  const tTitle = escape(title);
  const tDesc = escape(description);
  const tName = escape(name);
  const tRedirect = escape(redirectTarget);
  const tCanonical = escape(canonicalUrl);
  const ogImageUrl = `${SITE_URL}${ogImagePath}`;
  const tOgImage = escape(ogImageUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${tTitle} | CCAA Baseball Stats</title>

<!-- Favicons -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0d1117">

<!-- Canonical -->
<link rel="canonical" href="${tCanonical}">

<!-- Description -->
<meta name="description" content="${tDesc}">

<!-- Open Graph -->
<meta property="og:type" content="profile">
<meta property="og:site_name" content="CCAA Baseball Stats">
<meta property="og:url" content="${tCanonical}">
<meta property="og:title" content="${tTitle}">
<meta property="og:description" content="${tDesc}">
<meta property="og:image" content="${tOgImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${tTitle}">
<meta property="og:image:type" content="image/png">
<meta property="profile:username" content="${tName}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${tCanonical}">
<meta name="twitter:title" content="${tTitle}">
<meta name="twitter:description" content="${tDesc}">
<meta name="twitter:image" content="${tOgImage}">

<!-- Fast redirect for humans (fires only if JS runs; meta refresh is fallback) -->
<meta http-equiv="refresh" content="0; url=${tRedirect}">
<script>window.location.replace(${JSON.stringify(redirectTarget)});</script>

<style>
body{font-family:system-ui,sans-serif;background:#0d1117;color:#e2e8f0;
     display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
a{color:#f0a500}
</style>
</head>
<body>
<div>
  <h1 style="font-size:1.2rem;margin:0 0 .5rem">${tTitle}</h1>
  <p style="color:#8b9cb5;margin:0 0 1rem">Loading player profile…</p>
  <p><a href="${tRedirect}">Continue to ${tName}'s stats →</a></p>
</div>
</body>
</html>`;
}

// Compute the canonical output path for an entry (matches the canonicalPath logic above).
function outputPathFor(entry) {
  const { team, name, year } = entry;
  const identityBucket = identityBuckets.get(`${team}|${name}`);
  const needsYearSlug = identityBucket && identityBucket.size > 1;
  const yearSlug = needsYearSlug && year ? '-' + slugify(year) : '';
  return path.join(OUTPUT_DIR, slugify(team), `${slugify(name)}${yearSlug}.html`);
}

// ── Write files ────────────────────────────────────────────
// Clean existing output dir first so stale players (traded, moved, etc.) don't linger.
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(OG_DIR, { recursive: true });

let written = 0;
let pngsWritten = 0;
let pngFailed = 0;
const t0 = Date.now();
for (const entry of playerMap.values()) {
  // Generate OG PNG first — if it fails, fall back to site-wide og-image.
  let ogPath = '/og-image.png';
  try {
    ogPath = writeOgPng(entry);
    pngsWritten++;
  } catch (err) {
    pngFailed++;
    if (pngFailed <= 3) {
      console.warn(`  PNG generation failed for ${entry.team} / ${entry.name}: ${err.message}`);
    }
  }
  const filePath = outputPathFor(entry);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderPlayerPage(entry, ogPath), 'utf8');
  written++;
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`✓ Wrote ${written} player pages and ${pngsWritten} OG card PNGs in ${elapsed}s`);
if (pngFailed > 0) console.log(`  (${pngFailed} PNGs failed — those pages fall back to site-wide og-image.png)`);
console.log(`  Example: ${SITE_URL}/player/arroyo-grande/a-winter.html`);
console.log(`  OG card: ${SITE_URL}/player/og/arroyo-grande/a-winter.png`);
