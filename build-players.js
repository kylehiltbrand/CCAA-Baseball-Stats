#!/usr/bin/env node
// ============================================================
// build-players.js — generates static player pages with OG meta tags
// ============================================================
// Run locally:   node build-players.js
// Run in CI:     added to Vercel build command (see README section below)
//
// Reads: data.js (batters[], pitchers[], teams[])
// Writes: player/<team-slug>/<player-slug>.html for every unique player
//
// Each generated file contains:
//   - OG/Twitter meta tags with player name, team, and key stats
//   - Instant redirect to /stats.html#player=...&team=...&d=...
//
// Humans clicking the link land on the real app. Unfurlers (iMessage,
// Slack, Twitter, Discord, LinkedIn) read the meta tags first.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Config ─────────────────────────────────────────────────
const SITE_URL = 'https://ccaabaseballstats.com';
const OUTPUT_DIR = path.join(__dirname, 'player');
const DATA_FILE = path.join(__dirname, 'data.js');
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

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

// ── HTML template ──────────────────────────────────────────
function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPlayerPage(entry) {
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
<meta property="og:image" content="${DEFAULT_OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${tTitle}">
<meta property="profile:username" content="${tName}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${tCanonical}">
<meta name="twitter:title" content="${tTitle}">
<meta name="twitter:description" content="${tDesc}">
<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}">

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

let written = 0;
for (const entry of playerMap.values()) {
  const filePath = outputPathFor(entry);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderPlayerPage(entry), 'utf8');
  written++;
}

console.log(`✓ Wrote ${written} player pages to /player/`);
console.log(`  Example: ${SITE_URL}/player/arroyo-grande/a-winter.html`);
