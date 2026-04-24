// ============================================================
// CCAA Baseball 2025-26 — data.js
// ============================================================
// THIS IS THE ONLY FILE YOU NEED TO UPDATE EACH WEEK.
//
// To update stats:
//   1. Upload new MaxPreps PDFs to Claude
//   2. Claude replaces the batters[] and pitchers[] arrays below
//   3. Also update team records in the standings/teams objects if needed
//   4. Update DATA_UPDATED below to today's date
//   5. Replace this file in GitHub → Vercel auto-deploys
//
// DO NOT edit stats.html, standings.html, teams.html, or index.html
// unless you're changing the site layout/design.
// ============================================================

// ── Last updated date — change this every time you push new stats ──
const DATA_UPDATED = "2026-04-23"; // YYYY-MM-DD — stats through April 23

// wOBA weights (standard)
const wBB = 0.69, wHBP = 0.72, w1B = 0.88, w2B = 1.24, w3B = 1.56, wHR = 2.00;

// ── CCAA League Constants ──
// These are seeded with current-data values and AUTO-RECALIBRATED at the bottom
// of this file from the actual batters/pitchers arrays. Do not hand-edit unless
// you're changing season-start defaults.
let LG_AVG         = 0.304;  // CCAA league avg AVG
let LG_OBP         = 0.404;  // CCAA league avg OBP
let LG_WOBA        = 0.356;  // CCAA league avg wOBA
let WOBA_SCALE     = 0.881;  // wOBA/lgOBP-style scaling factor
let LG_R_PA        = 0.188;  // runs per PA (CCAA avg; MLB≈0.115)
let LG_BABIP       = 0.363;  // CCAA league avg BABIP — used for color thresholds
let LG_ERA         = 4.80;   // CCAA league ERA
let LG_K9          = 8.0;    // CCAA league avg K/9
let LG_BB9         = 4.9;    // CCAA league avg BB/9
let LG_WHIP        = 1.59;   // CCAA league avg WHIP — used for color thresholds
// Dynamic color thresholds derived from league averages (auto-set by recalcLeagueAvgs)
let BABIP_LO       = 0.309;  // .15 below lgBABIP
let BABIP_HI       = 0.417;  // .15 above lgBABIP
let WHIP_LO        = 1.35;   // .15 below lgWHIP (elite)
let WHIP_HI        = 1.83;   // .15 above lgWHIP (rough)
const RUNS_PER_WIN  = 6.0;    // scaled for HS run environment — produces meaningful WAR per short season
const REPL_RUNS_600 = -33.4;  // replacement-level runs per 600 PA (scaled)
const RAA_PER_600   = 95.1;   // runs above avg per 600 PA swing
// Regression anchors — full credibility at these thresholds
const WRC_FULL_PA   = 80;     // PA for full wRC+ credibility
const ERA_FULL_IP   = 40;     // IP for full ERA+ credibility — higher threshold gives regression room to separate elite arms
const REPL_WRC      = 65;     // wRC+ at replacement level — below this = negative oWAR
const WAR_FULL_PA   = 80;     // PA for full oWAR credibility
const WAR_FULL_IP   = 30;     // IP for full pWAR credibility

function calcWOBA(bb, hbp, h, doubles, triples, hr, ab, sf) {
  const singles = h - doubles - triples - hr;
  const num = wBB*bb + wHBP*hbp + w1B*singles + w2B*doubles + w3B*triples + wHR*hr;
  const den = ab + bb + (sf||0) + hbp;
  return den > 0 ? num / den : 0;
}

function calcWRC_plus(woba, pa) {
  if (!pa || pa < 10) return null;
  const wRC = ((woba - LG_WOBA) / WOBA_SCALE + LG_R_PA) * pa;
  const lgWRC = LG_R_PA * pa;
  const raw = lgWRC > 0 ? (wRC / lgWRC) * 100 : 100;
  // Asymmetric regression: above-avg → anchor 100, below-avg → anchor replacement level (65)
  const weight = Math.min(pa / WRC_FULL_PA, 1.0);
  const anchor = raw >= 100 ? 100 : REPL_WRC;
  return Math.round(raw * weight + anchor * (1 - weight));
}

function calcOWAR(wRC_plus, pa) {
  if (wRC_plus === null || pa < 15) return null;
  const weight = Math.min(pa / WAR_FULL_PA, 1.0);
  const raa = ((wRC_plus - 100) / 100) * (pa / 600) * RAA_PER_600;
  const rar = raa - REPL_RUNS_600 * (pa / 600);
  const raw = rar / RUNS_PER_WIN;
  return Math.round(raw * weight * 10) / 10;
}

function calcKper9(k, ip) {
  return ip > 0 ? Math.round((k / ip) * 9 * 10) / 10 : null;
}

function calcKBB(k, bb) {
  return bb > 0 ? Math.round((k / bb) * 100) / 100 : null;
}

function calcERA_plus(era, ip) {
  if (!era || era <= 0 || !ip) return null;
  const raw = (LG_ERA / era) * 100;                        // no premature cap — let regression do the work
  const weight = Math.min(ip / ERA_FULL_IP, 1.0);
  const regressed = raw * weight + 100 * (1 - weight);
  return Math.round(Math.min(regressed, 275));              // cap at 275 AFTER regression — preserves separation between elite arms
}

function calcPWAR(era, ip) {
  if (ip < 5) return null;
  const weight = Math.min(ip / WAR_FULL_IP, 1.0);
  const raa = (LG_ERA - era) / 9 * ip;
  const rar = raa + (0.03 * ip);
  const raw = rar / RUNS_PER_WIN;
  return Math.round(raw * weight * 10) / 10;
}

function calcBBK(bb, k) {
  return k > 0 ? Math.round((bb / k) * 100) / 100 : null;
}

function calcBABIP(h, hr, ab, k, sf) {
  const denom = ab - k - hr + (sf||0);
  if (denom <= 0) return null;
  return Math.round(((h - hr) / denom) * 1000) / 1000;
}

function calcWHIP(bb, h, ip) {
  if (!ip || ip <= 0) return null;
  return Math.round(((bb + h) / ip) * 100) / 100;
}

// ===================== TEAMS =====================
const teams = [
  {
    id: "st-joseph",
    name: "St. Joseph",
    mascot: "Knights",
    location: "Santa Maria, CA",
    coach: "Tino Estrada",
    colors: "Black, Green, Yellow",
    league: "CCAA - Mountain",
    overall: "16-4-1",
    leagueRecord: "8-1",
    wins: 16, losses: 4, ties: 1,
    leagueWins: 8, leagueLosses: 1,
    caRank: 36,
    gp: 21,
    teamBavg: .274, teamOBP: .394, teamSLG: .379,
    teamERA: 2.53, teamIP: 144
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "14-7",
    leagueRecord: "5-4",
    wins: 14, losses: 7, ties: 0,
    leagueWins: 5, leagueLosses: 4,
    caRank: 76,
    gp: 21,
    teamBavg: .338, teamOBP: .422, teamSLG: .483,
    teamERA: 1.92, teamIP: 138.1
  },
  {
    id: "santa-ynez",
    name: "Santa Ynez",
    mascot: "Pirates",
    location: "Santa Ynez, CA",
    coach: "Craig Gladstone",
    colors: "Orange, Black",
    league: "CCAA - Ocean",
    overall: "14-4",
    leagueRecord: "5-2",
    wins: 14, losses: 4, ties: 0,
    leagueWins: 5, leagueLosses: 2,
    caRank: 331,
    gp: 18,
    teamBavg: .377, teamOBP: .478, teamSLG: .508,
    teamERA: 2.18, teamIP: 119
  },
  {
    id: "pioneer-valley",
    name: "Pioneer Valley",
    mascot: "Panthers",
    location: "Santa Maria, CA",
    coach: "Cody Smith",
    colors: "Teal, Black",
    league: "CCAA - Ocean",
    overall: "12-7-2",
    leagueRecord: "5-2",
    wins: 12, losses: 7, ties: 2,
    leagueWins: 5, leagueLosses: 2,
    caRank: 487,
    gp: 19,
    teamBavg: .261, teamOBP: .391, teamSLG: .329,
    teamERA: 2.83, teamIP: 126
  },
  {
    id: "nipomo",
    name: "Nipomo",
    mascot: "Titans",
    location: "Nipomo, CA",
    coach: "Caleb Buendia",
    colors: "Black, Cardinal, Silver",
    league: "CCAA - Ocean",
    overall: "11-10",
    leagueRecord: "3-2",
    wins: 11, losses: 10, ties: 0,
    leagueWins: 3, leagueLosses: 2,
    caRank: 489,
    gp: 21,
    teamBavg: .323, teamOBP: .403, teamSLG: .376,
    teamERA: 5.24, teamIP: 132.1
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "10-11-1",
    leagueRecord: "5-3",
    wins: 10, losses: 11, ties: 1,
    leagueWins: 5, leagueLosses: 3,
    caRank: 250,
    gp: 22,
    teamBavg: .312, teamOBP: .388, teamSLG: .424,
    teamERA: 3.09, teamIP: 133.2
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "14-9",
    leagueRecord: "8-2",
    wins: 14, losses: 9, ties: 0,
    leagueWins: 8, leagueLosses: 2,
    caRank: 282,
    gp: 23,
    teamBavg: .312, teamOBP: .411, teamSLG: .391,
    teamERA: 3.63, teamIP: 158
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "13-7",
    leagueRecord: "5-4",
    wins: 13, losses: 7, ties: 0,
    leagueWins: 5, leagueLosses: 4,
    caRank: 135,
    gp: 19,
    teamBavg: .346, teamOBP: .452, teamSLG: .485,
    teamERA: 3.65, teamIP: 120.2
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "13-8",
    leagueRecord: "4-6",
    wins: 13, losses: 8, ties: 0,
    leagueWins: 4, leagueLosses: 6,
    caRank: 183,
    gp: 21,
    teamBavg: .302, teamOBP: .387, teamSLG: .409,
    teamERA: 3.95, teamIP: 129.1
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "10-12",
    leagueRecord: "2-8",
    wins: 10, losses: 12, ties: 0,
    leagueWins: 2, leagueLosses: 8,
    caRank: 352,
    gp: null,
    teamBavg: null, teamOBP: null, teamSLG: null,
    teamERA: null, teamIP: null,
    noStats: true
  },
  {
    id: "templeton",
    name: "Templeton",
    mascot: "Eagles",
    location: "Templeton, CA",
    coach: "N/A",
    colors: "Green, Silver, White",
    league: "CCAA - Sunset",
    overall: "10-13",
    leagueRecord: "3-5",
    wins: 10, losses: 13, ties: 0,
    leagueWins: 3, leagueLosses: 5,
    caRank: 538,
    gp: 23,
    teamBavg: .283, teamOBP: .384, teamSLG: .359,
    teamERA: 3.15, teamIP: 151.1
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "S.D. Harrow",
    colors: "Navy, Vegas Gold",
    league: "CCAA - Mountain",
    overall: "10-8",
    leagueRecord: "4-6",
    wins: 10, losses: 8, ties: 0,
    leagueWins: 4, leagueLosses: 6,
    caRank: 210,
    gp: 18,
    teamBavg: .324, teamOBP: .411, teamSLG: .438,
    teamERA: 4.92, teamIP: 118
  },
  {
    id: "atascadero",
    name: "Atascadero",
    mascot: "Greyhounds",
    location: "Atascadero, CA",
    coach: "Samm Spears",
    colors: "Orange, Gray",
    league: "CCAA - Sunset",
    overall: "7-15",
    leagueRecord: "4-6",
    wins: 7, losses: 15, ties: 0,
    leagueWins: 4, leagueLosses: 6,
    caRank: 604,
    gp: 22,
    teamBavg: .218, teamOBP: .368, teamSLG: .281,
    teamERA: 4.72, teamIP: 139.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "7-10",
    leagueRecord: "1-8",
    wins: 7, losses: 10, ties: 0,
    leagueWins: 1, leagueLosses: 8,
    caRank: 722,
    gp: 17,
    teamBavg: .324, teamOBP: .420, teamSLG: .373,
    teamERA: 5.07, teamIP: 105
  },
  {
    id: "cabrillo",
    name: "Cabrillo",
    mascot: "Conquistadores",
    location: "Lompoc, CA",
    coach: "Cole Osborne",
    colors: "Black, Gold, White",
    league: "CCAA - Sunset",
    overall: "4-15",
    leagueRecord: "1-5",
    wins: 4, losses: 15, ties: 0,
    leagueWins: 1, leagueLosses: 5,
    caRank: 711,
    gp: 17,
    teamBavg: .227, teamOBP: .314, teamSLG: .276,
    teamERA: 6.17, teamIP: 110
  }
];

// ===================== PLAYER STATS =====================
function buildBatter(team, name, year, gp, avg, pa, ab, r, h, rbi, doubles, triples, hr, bb, k, hbp, sf, obp, slg, ops) {
  const woba = calcWOBA(bb, hbp, h, doubles, triples, hr, ab, sf||0);
  const wrc = calcWRC_plus(woba, pa);
  const owar = calcOWAR(wrc, pa);
  const bbk = calcBBK(bb, k);
  const babip = calcBABIP(h, hr, ab, k, sf||0);
  const proj40owar = (owar !== null && gp && gp >= 5) ? Math.round((owar / gp) * 40 * 10) / 10 : null;
  return { team, name, year, gp, avg, pa, ab, r, h, rbi, doubles, triples, hr, bb, k, hbp, sf:sf||0, obp, slg, ops, woba: Math.round(woba*1000)/1000, wrc_plus: wrc, owar, bbk, babip, proj40owar };
}

function buildPitcher(team, name, year, era, w, l, ip, h, r, er, bb, k, app) {
  const k9 = calcKper9(k, ip);
  const kbb = calcKBB(k, bb);
  const era_plus = calcERA_plus(era, ip);
  const pwar = calcPWAR(era, ip);
  const whip = calcWHIP(bb, h, ip);
  const bf_est = ip > 0 ? (ip * 3 + h + bb) : null;
  const kpct = bf_est && bf_est > 0 ? (k / bf_est) * 100 : null;
  const proj40pwar = (pwar !== null && app && app >= 3) ? Math.round((pwar / app) * 40 * 10) / 10 : null;
  return { team, name, year, era, w, l, ip, h, r, er, bb, k, app, k9, kbb, era_plus, pwar, whip, kpct, proj40pwar };
}

const batters = [
  // ARROYO GRANDE
  buildBatter("Arroyo Grande","A. Winter","Jr",17,.613,39,31,10,19,7,1,0,0,2,1,5,1,.667,.645,1.312),
  buildBatter("Arroyo Grande","R. Servin","Jr",21,.477,85,65,23,31,17,9,0,3,18,8,1,1,.588,.754,1.342),
  buildBatter("Arroyo Grande","O. King","Jr",12,.375,10,8,3,3,1,0,0,0,2,4,0,0,.500,.375,.875),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",20,.328,72,64,14,21,21,1,0,5,4,9,3,1,.389,.578,.967),
  buildBatter("Arroyo Grande","T. Kurth","Sr",17,.327,60,52,9,17,14,6,0,2,5,8,1,1,.390,.558,.948),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",19,.317,50,41,7,13,5,3,0,0,5,6,1,0,.404,.390,.794),
  buildBatter("Arroyo Grande","M. Richwine","Sr",19,.273,51,44,10,12,8,2,0,1,4,14,0,0,.333,.386,.719),
  buildBatter("Arroyo Grande","B. Paz","Fr",19,.310,48,42,11,13,12,2,0,3,4,11,0,1,.362,.571,.933),
  buildBatter("Arroyo Grande","J. Stumph","Jr",18,.306,64,49,13,15,9,3,0,0,11,5,2,0,.452,.367,.819),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",19,.300,45,40,9,12,7,2,0,1,5,10,0,0,.378,.425,.803),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",15,.235,21,17,1,4,3,1,0,0,4,9,0,0,.381,.294,.675),
  buildBatter("Arroyo Grande","J. Ralph","Jr",21,.333,86,75,16,25,9,4,0,1,8,5,2,1,.407,.427,.834),
  buildBatter("Arroyo Grande","K. Warwick","Jr",15,.185,28,27,3,5,1,0,1,0,0,10,0,0,.185,.259,.444),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",12,.278,21,18,8,5,4,0,0,0,2,5,1,0,.381,.278,.659),
  buildBatter("Arroyo Grande","R. Bronson","Sr",14,.292,27,24,3,7,6,0,0,1,2,6,0,0,.346,.417,.763),

  // ATASCADERO
  buildBatter("Atascadero","S. Ernst","Sr",16,.225,46,40,5,9,4,1,0,0,5,20,1,0,.326,.250,.576),
  buildBatter("Atascadero","C. Knoph","Jr",7,.200,6,5,0,1,2,0,0,0,1,3,0,0,.333,.200,.533),
  buildBatter("Atascadero","E. Wanner","Sr",20,.164,77,55,12,9,6,1,0,0,15,8,2,2,.351,.182,.533),
  buildBatter("Atascadero","V. Rivera","Sr",5,.250,5,4,1,1,1,0,0,0,1,2,0,0,.400,.250,.650),
  buildBatter("Atascadero","A. Madrigal","Sr",9,.286,9,7,2,2,1,1,0,0,2,3,0,0,.444,.429,.873),
  buildBatter("Atascadero","M. Cullen","Jr",10,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","M. Zepeda","Sr",21,.226,67,53,6,12,8,2,1,0,10,10,0,0,.349,.302,.651),
  buildBatter("Atascadero","R. Brown","Sr",12,.154,13,13,2,2,0,0,0,0,0,4,0,0,.154,.154,.308),
  buildBatter("Atascadero","W. Azelton","So",21,.178,62,45,6,8,9,3,1,0,10,17,5,2,.371,.289,.660),
  buildBatter("Atascadero","J. Litten","So",21,.226,67,53,7,12,7,2,0,0,7,15,4,2,.348,.264,.612),
  buildBatter("Atascadero","W. Litten","Sr",21,.328,80,64,10,21,16,5,1,0,7,14,9,0,.462,.438,.900),
  buildBatter("Atascadero","M. Beck","Jr",21,.147,40,34,9,5,2,0,0,0,4,10,1,0,.256,.147,.403),
  buildBatter("Atascadero","A. Donaldson","So",16,.220,52,41,6,9,3,0,0,0,9,11,1,0,.373,.220,.593),
  buildBatter("Atascadero","W. Witt","Sr",20,.231,80,52,17,12,5,4,0,1,26,19,2,0,.500,.365,.865),
  buildBatter("Atascadero","C. Savino","Fr",4,.143,11,7,1,1,1,0,0,0,4,4,0,0,.455,.143,.598),
  buildBatter("Atascadero","T. Knutson","So",3,.000,5,4,0,0,0,0,0,0,1,3,0,0,.200,.000,.200),
  buildBatter("Atascadero","D. Mitchell","Sr",16,.220,65,59,8,13,8,4,1,0,3,11,2,0,.281,.322,.603),

  // CABRILLO
  buildBatter("Cabrillo","C. Powell","Jr",20,.194,69,62,11,12,3,4,0,0,7,9,0,0,.275,.258,.533),
  buildBatter("Cabrillo","I. Lopez","So",10,.042,29,24,1,1,2,0,0,0,3,6,1,1,.179,.042,.221),
  buildBatter("Cabrillo","G. Barraza","Sr",20,.328,69,61,13,20,5,0,0,0,5,8,2,1,.391,.328,.719),
  buildBatter("Cabrillo","M. Koff","Sr",19,.333,57,45,12,15,7,5,0,0,6,7,2,0,.434,.444,.878),
  buildBatter("Cabrillo","J. Clark","So",18,.314,44,35,6,11,7,1,0,0,4,15,1,1,.390,.343,.733),
  buildBatter("Cabrillo","F. Lopez","Sr",20,.250,66,56,9,14,5,2,0,0,6,17,2,1,.338,.286,.624),
  buildBatter("Cabrillo","F. Hernandez","Jr",20,.254,69,63,8,16,7,2,2,0,3,13,2,1,.304,.349,.653),
  buildBatter("Cabrillo","E. Bradshaw","Fr",1,1.000,1,1,0,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  buildBatter("Cabrillo","L. Ragoza","Jr",15,.211,22,19,3,4,1,0,0,0,2,7,1,0,.318,.211,.529),
  buildBatter("Cabrillo","L. Vorce","Jr",12,.281,36,32,3,9,2,0,0,0,3,1,0,1,.343,.281,.624),
  buildBatter("Cabrillo","M. Cerna-Medina","So",4,.200,6,5,0,1,0,0,0,0,1,2,0,0,.333,.200,.533),
  buildBatter("Cabrillo","C. Sunndeniyage","Jr",19,.250,39,36,3,9,0,0,0,0,2,9,0,1,.289,.250,.539),
  buildBatter("Cabrillo","J. Low","Sr",17,.241,36,29,2,7,2,3,0,0,4,4,0,0,.389,.345,.734),
  buildBatter("Cabrillo","A. Torres","Sr",10,.053,19,19,0,1,0,0,0,0,0,7,0,0,.053,.053,.106),
  buildBatter("Cabrillo","D. Vineyard","So",4,.167,15,12,2,2,0,0,0,0,2,5,1,0,.231,.167,.398),

  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",20,.424,78,59,30,25,19,8,1,4,11,9,8,0,.564,.797,1.361),
  buildBatter("Morro Bay","C. White","Sr",19,.414,81,58,17,24,25,2,0,4,11,4,0,12,.432,.655,1.087),
  buildBatter("Morro Bay","E. Brown","Sr",19,.375,54,48,17,18,8,0,0,0,4,1,2,0,.444,.375,.819),
  buildBatter("Morro Bay","C. Wilkinson","Sr",18,.382,67,55,15,21,14,7,1,0,12,12,0,0,.493,.545,1.038),
  buildBatter("Morro Bay","T. Gray","Sr",20,.297,71,64,6,19,9,4,0,0,2,8,4,1,.352,.359,.711),
  buildBatter("Morro Bay","J. Deovlet","So",20,.283,72,60,9,17,14,3,0,0,8,4,2,2,.375,.333,.708),
  buildBatter("Morro Bay","E. Davis","Sr",17,.236,58,55,8,13,7,2,0,0,2,13,0,1,.259,.273,.532),
  buildBatter("Morro Bay","C. Waldon","Jr",18,.204,60,54,8,11,5,1,0,0,3,11,3,0,.283,.222,.505),
  buildBatter("Morro Bay","J. Skaggs","Sr",17,.237,41,38,6,9,2,2,0,0,1,6,2,0,.293,.289,.582),
  buildBatter("Morro Bay","C. League","Fr",17,.194,36,31,11,6,4,1,0,0,4,7,0,1,.278,.226,.504),
  buildBatter("Morro Bay","B. Walker","",14,.059,22,17,3,1,0,0,0,0,2,5,3,0,.273,.059,.332),
  buildBatter("Morro Bay","V. Nelson","",5,.000,4,3,1,0,0,0,0,0,0,1,1,0,.250,.000,.250),
  buildBatter("Morro Bay","H. Stow","",3,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),

  // NIPOMO
  buildBatter("Nipomo","J. Anderson","Sr",6,.500,4,4,1,2,0,0,0,0,0,2,0,0,.500,.500,1.000),
  buildBatter("Nipomo","B. Hageman","So",20,.508,80,65,25,33,11,3,0,0,6,6,2,1,.554,.554,1.108),
  buildBatter("Nipomo","E. Silveira-19","Sr",20,.344,76,64,11,22,17,4,0,0,7,10,4,1,.434,.406,.840),
  buildBatter("Nipomo","G. Groshart","Sr",19,.354,74,65,10,23,27,10,0,0,5,4,2,2,.405,.508,.913),
  buildBatter("Nipomo","L. Hobbs","Sr",20,.323,82,62,32,20,4,1,0,0,6,2,13,1,.476,.339,.815),
  buildBatter("Nipomo","L. Hobbs","Fr",20,.298,68,57,6,17,9,2,0,0,8,5,2,0,.403,.333,.736),
  buildBatter("Nipomo","C. Moulden","So",20,.368,75,68,15,25,21,6,0,0,5,8,2,0,.427,.456,.883),
  buildBatter("Nipomo","E. Silveira-3","Sr",20,.333,54,51,8,17,9,1,0,0,2,7,0,1,.352,.353,.705),
  buildBatter("Nipomo","T. Oxley","Sr",19,.214,54,42,8,9,3,2,0,0,9,19,1,1,.358,.262,.620),
  buildBatter("Nipomo","T. Barr","Sr",16,.231,44,39,3,9,8,1,0,0,3,13,1,1,.295,.256,.551),
  buildBatter("Nipomo","H. Roesner","Jr",15,.167,20,18,4,3,1,0,0,0,2,5,0,0,.250,.167,.417),
  buildBatter("Nipomo","K. Simonson","So",17,.182,35,33,2,6,3,0,0,0,0,6,0,2,.171,.182,.353),
  buildBatter("Nipomo","A. Mendoza","Jr",9,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Nipomo","J. Lanier","Sr",5,.000,2,2,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","Z. Garibay","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","F. Callaghan","Jr",4,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","M. Marlett","Jr",4,.000,2,0,1,0,0,0,0,0,1,0,1,0,1.000,.000,1.000),

  // PASO ROBLES
  buildBatter("Paso Robles","M. Garcia","Sr",20,.379,77,66,26,25,12,5,1,0,10,8,1,0,.468,.485,.953),
  buildBatter("Paso Robles","B. Lowry","Jr",20,.426,76,61,16,26,21,4,1,1,11,8,1,3,.500,.574,1.074),
  buildBatter("Paso Robles","T. Freitas","Sr",20,.338,76,68,15,23,13,7,0,0,3,1,3,2,.382,.441,.823),
  buildBatter("Paso Robles","C. Prieto","Jr",20,.321,65,56,13,18,11,6,0,0,4,8,1,2,.365,.429,.794),
  buildBatter("Paso Robles","K. Magdaleno","Jr",8,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","E. Dobroth","Jr",20,.328,77,64,17,21,17,2,1,0,8,11,4,1,.429,.391,.820),
  buildBatter("Paso Robles","E. Rendon","So",19,.295,67,61,12,18,12,4,1,2,2,7,3,1,.343,.492,.835),
  buildBatter("Paso Robles","X. Hermanson","Jr",19,.260,61,50,9,13,11,5,0,0,8,6,1,1,.367,.360,.727),
  buildBatter("Paso Robles","J. Soboleski","Jr",20,.316,64,57,11,18,10,8,1,0,6,11,1,0,.391,.491,.882),
  buildBatter("Paso Robles","G. Berlingeri","Sr",3,.429,7,7,2,3,0,0,0,0,0,2,0,0,.429,.429,.858),
  buildBatter("Paso Robles","C. Glover","Sr",14,.111,25,18,3,2,1,0,0,0,4,7,1,0,.304,.111,.415),
  buildBatter("Paso Robles","C. Contreras","Jr",16,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","E. Nevarez","Jr",6,.250,8,8,1,2,1,2,0,0,0,3,0,0,.250,.500,.750),
  buildBatter("Paso Robles","J. Lopez","Jr",8,.500,7,4,1,2,0,0,0,0,2,0,0,0,.667,.500,1.167),
  buildBatter("Paso Robles","L. Christensen","Jr",11,.083,14,12,2,1,0,0,0,0,1,4,0,0,.154,.083,.237),
  buildBatter("Paso Robles","N. Contreras","Jr",12,.077,13,13,1,1,0,0,0,0,0,7,0,0,.077,.077,.154),
  buildBatter("Paso Robles","S. Roby","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // PIONEER VALLEY
  buildBatter("Pioneer Valley","I. Enriquez","Jr",17,.435,62,46,16,20,15,2,0,1,11,3,4,1,.565,.543,1.108),
  buildBatter("Pioneer Valley","K. Milner","Jr",15,.457,54,46,7,21,18,6,0,1,7,7,1,0,.537,.652,1.189),
  buildBatter("Pioneer Valley","L. Dreier","Jr",11,.214,19,14,6,3,1,0,0,0,4,4,1,0,.421,.214,.635),
  buildBatter("Pioneer Valley","D. Cortez","So",19,.333,69,57,16,19,9,8,0,0,11,12,1,0,.449,.474,.923),
  buildBatter("Pioneer Valley","M. Rosas","Sr",16,.282,47,39,8,11,5,1,0,0,4,12,3,1,.391,.308,.699),
  buildBatter("Pioneer Valley","I. Martinez","Sr",12,.188,21,16,5,3,5,0,0,0,5,4,0,0,.381,.188,.568),
  buildBatter("Pioneer Valley","I. Garcia","Jr",10,.250,9,8,2,2,1,0,0,0,1,4,0,0,.333,.250,.583),
  buildBatter("Pioneer Valley","U. Ponce","Jr",17,.205,51,44,11,9,9,2,1,0,4,18,2,1,.300,.295,.595),
  buildBatter("Pioneer Valley","E. Ponce","Sr",18,.273,70,55,24,15,1,1,0,1,9,8,5,1,.420,.309,.729),
  buildBatter("Pioneer Valley","J. Lopez","Sr",18,.163,55,49,7,8,9,1,1,1,2,15,1,2,.208,.224,.432),
  buildBatter("Pioneer Valley","K. Owen","Sr",15,.184,43,38,4,7,3,1,0,0,2,5,2,1,.256,.211,.467),
  buildBatter("Pioneer Valley","J. Medina","Jr",12,.118,20,17,2,2,2,0,0,0,2,9,1,0,.211,.118,.329),
  buildBatter("Pioneer Valley","J. Valdez","Jr",13,.167,18,12,5,2,0,0,0,0,3,5,3,0,.444,.167,.611),
  buildBatter("Pioneer Valley","M. Andrade","Jr",15,.194,43,31,7,6,8,1,0,0,8,11,2,2,.390,.226,.616),
  buildBatter("Pioneer Valley","J. Rojas","Sr",13,.111,13,9,1,1,2,0,0,0,3,2,1,0,.385,.111,.496),
  buildBatter("Pioneer Valley","M. Botello","Jr",5,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Pioneer Valley","J. Beltran","Jr",10,.000,6,4,2,0,0,0,0,0,2,1,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","L. Rodriguez","So",2,.000,4,3,2,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Pioneer Valley","D. Dahl","So",2,.000,6,4,0,0,0,0,0,0,2,0,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","J. Romero","So",2,.500,3,2,0,1,0,0,0,0,1,0,0,0,.667,.500,1.167),

  // RIGHETTI
  buildBatter("Righetti","K. Walker","Jr",19,.525,70,61,23,32,17,11,0,3,8,3,0,1,.571,.852,1.423),
  buildBatter("Righetti","G. Cole","So",19,.417,72,60,20,25,5,3,0,0,8,7,0,1,.478,.467,.945),
  buildBatter("Righetti","N. Kesner","Sr",19,.420,68,50,17,21,15,2,1,0,14,10,2,1,.552,.500,1.052),
  buildBatter("Righetti","N. Roberts","Sr",19,.451,68,51,15,23,16,4,1,1,13,4,1,3,.544,.627,1.171),
  buildBatter("Righetti","M. Villegas","So",13,.320,34,25,8,8,6,1,1,1,9,13,0,0,.500,.560,1.060),
  buildBatter("Righetti","M. Anderson","Sr",19,.319,77,69,12,22,9,1,0,1,6,10,2,0,.390,.377,.767),
  buildBatter("Righetti","Z. Andersen","So",18,.250,58,44,8,11,13,3,0,5,10,16,3,0,.421,.659,1.080),
  buildBatter("Righetti","N. Verduzco","So",18,.250,53,40,11,10,6,1,0,0,11,10,0,0,.412,.275,.687),
  buildBatter("Righetti","D. Nevarez","Sr",19,.239,56,46,6,11,9,3,0,0,7,12,3,0,.375,.304,.679),
  buildBatter("Righetti","M. Andersen","Jr",13,.238,24,21,2,5,6,2,0,0,1,3,0,1,.261,.333,.594),
  buildBatter("Righetti","J. Rodriguez","Sr",12,.200,11,10,3,2,0,0,0,0,1,4,0,0,.273,.200,.473),
  buildBatter("Righetti","I. Quintanar","Jr",6,.182,13,11,2,2,1,0,0,0,2,4,0,0,.308,.182,.490),
  buildBatter("Righetti","N. Nevarez","Fr",4,.200,6,5,0,1,0,0,0,0,1,0,0,0,.333,.200,.533),
  buildBatter("Righetti","C. Campa","So",5,.333,6,6,1,2,3,1,0,0,0,1,0,0,.333,.500,.833),
  buildBatter("Righetti","E. Barcenas","Sr",5,1.000,3,2,0,2,1,1,0,0,1,0,0,0,1.000,1.500,2.500),
  buildBatter("Righetti","R. Harney","Sr",3,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Righetti","N. Lancor","Sr",16,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  buildBatter("Righetti","D. Tovar","Jr",5,.000,6,4,1,0,0,0,0,0,1,2,1,0,.333,.000,.333),
  buildBatter("Righetti","G. Rodriguez","Sr",11,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","P. Wyatt","Jr",23,.292,88,72,16,21,15,1,0,0,8,6,3,1,.381,.306,.687),
  buildBatter("San Luis Obispo","G. Bramble","Sr",18,.270,69,63,15,17,11,6,0,1,6,11,0,0,.333,.413,.746),
  buildBatter("San Luis Obispo","N. Soderin","Sr",20,.200,20,15,10,3,1,0,0,0,4,7,1,0,.400,.200,.600),
  buildBatter("San Luis Obispo","B. Schafer","Jr",21,.310,65,42,12,13,4,3,0,0,15,5,2,0,.508,.381,.889),
  buildBatter("San Luis Obispo","D. Wilson","Jr",19,.188,17,16,1,3,3,0,0,0,1,3,0,0,.235,.188,.422),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",23,.321,91,84,17,27,12,5,1,0,6,11,0,0,.367,.405,.772),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",23,.302,76,63,13,19,15,2,0,0,7,18,5,0,.413,.333,.746),
  buildBatter("San Luis Obispo","C. Stephens","Jr",23,.324,85,71,17,23,12,3,1,0,14,12,0,0,.435,.394,.829),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","T. Blaney","So",23,.333,69,57,14,19,9,4,0,1,12,11,0,0,.449,.456,.905),
  buildBatter("San Luis Obispo","J. Riley","Jr",23,.423,88,71,8,30,14,3,0,0,15,10,1,1,.523,.465,.988),
  buildBatter("San Luis Obispo","J. Taylor","Sr",22,.300,61,50,9,15,13,2,0,3,11,17,0,0,.426,.520,.946),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",5,.000,6,6,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","J. Giordano","Jr",7,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","F. Avrett","Jr",13,.375,17,16,2,6,8,3,0,0,0,8,0,1,.353,.563,.916),

  // SANTA MARIA
  buildBatter("Santa Maria","Z. Camacho","Fr",2,.500,4,4,2,2,0,1,0,0,0,1,0,0,.500,.750,1.250),
  buildBatter("Santa Maria","J. Reyes","Sr",7,.000,5,5,4,0,1,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("Santa Maria","J. Gaitan","So",9,.000,6,5,1,0,0,0,0,0,1,2,0,0,.167,.000,.167),
  buildBatter("Santa Maria","U. Rodriguez","Fr",15,.233,43,30,11,7,5,1,0,0,11,4,2,0,.465,.267,.732),
  buildBatter("Santa Maria","J. Medina-21","Sr",15,.271,53,48,11,13,7,2,0,0,4,10,1,0,.340,.313,.652),
  buildBatter("Santa Maria","D. Martin","Sr",17,.327,65,52,17,17,10,5,0,0,11,7,2,0,.462,.423,.885),
  buildBatter("Santa Maria","O. Sedano","So",4,.667,5,3,2,2,3,0,0,0,2,0,0,0,.800,.667,1.467),
  buildBatter("Santa Maria","J. Medina-30","Sr",17,.420,65,50,16,21,9,3,1,0,15,10,0,0,.554,.520,1.074),
  buildBatter("Santa Maria","A. Ybarra","Sr",17,.271,56,48,8,13,6,2,0,0,7,10,1,0,.375,.313,.688),
  buildBatter("Santa Maria","J. Calderon","Sr",17,.396,60,53,11,21,8,0,0,0,4,3,1,1,.441,.396,.837),
  buildBatter("Santa Maria","A. Rice","So",17,.288,56,52,10,15,11,0,0,0,2,8,2,0,.339,.288,.627),
  buildBatter("Santa Maria","A. Rice","Fr",16,.293,44,41,5,12,10,3,0,0,3,8,0,0,.341,.366,.707),
  buildBatter("Santa Maria","B. Alejo","Jr",17,.397,64,58,7,23,18,4,0,0,1,5,4,1,.438,.466,.904),
  buildBatter("Santa Maria","I. Barajas","So",3,.000,2,1,1,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Santa Maria","F. Chavez","Sr",13,.312,20,16,2,5,3,0,0,0,3,3,1,0,.450,.313,.762),

  // SANTA YNEZ
  buildBatter("Santa Ynez","M. Skidmore","Sr",18,.324,79,71,23,23,12,8,0,0,6,11,1,0,.385,.437,.822),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",18,.333,75,57,18,19,14,7,1,0,14,6,4,0,.493,.491,.984),
  buildBatter("Santa Ynez","E. Roberts","So",17,.396,64,53,15,21,13,7,0,0,7,10,3,1,.484,.528,1.012),
  buildBatter("Santa Ynez","T. Jeckell","Jr",18,.426,66,61,24,26,21,7,0,0,5,4,0,0,.470,.541,1.011),
  buildBatter("Santa Ynez","S. Rhea","Jr",17,.261,60,46,14,12,10,1,0,0,7,11,4,1,.397,.283,.680),
  buildBatter("Santa Ynez","J. Glover","Jr",18,.515,77,66,26,34,35,5,3,4,8,8,1,2,.558,.864,1.422),
  buildBatter("Santa Ynez","C. Palmer","Jr",10,.182,19,11,5,2,2,0,0,0,6,4,2,0,.526,.182,.708),
  buildBatter("Santa Ynez","B. Cram","So",18,.357,67,56,17,20,7,0,0,0,9,6,1,0,.455,.357,.812),
  buildBatter("Santa Ynez","K. Heiduk","So",18,.429,77,63,28,27,17,4,1,1,12,14,2,0,.532,.571,1.103),
  buildBatter("Santa Ynez","A. Lewis","Fr",7,.167,16,12,4,2,4,0,0,0,2,2,0,1,.267,.167,.434),
  buildBatter("Santa Ynez","D. Pulido","Sr",18,.434,75,53,23,23,19,6,0,1,14,4,6,2,.573,.604,1.177),

  // ST. JOSEPH
  buildBatter("St. Joseph","A. Bluem","Jr",21,.425,83,73,28,31,16,7,0,6,7,2,3,0,.494,.767,1.261),
  buildBatter("St. Joseph","E. Hendricks","So",17,.296,35,27,11,8,0,1,0,0,6,1,2,0,.457,.333,.790),
  buildBatter("St. Joseph","C. Chanley","Sr",21,.361,80,61,14,22,14,4,1,2,7,1,10,2,.488,.557,1.045),
  buildBatter("St. Joseph","L. Woodruff","So",19,.262,49,42,8,11,14,3,0,1,3,11,2,0,.340,.405,.745),
  buildBatter("St. Joseph","C. Goncalves","Jr",21,.311,75,61,9,19,16,3,0,0,7,11,5,2,.413,.361,.774),
  buildBatter("St. Joseph","M. Majewski","Jr",20,.277,60,47,8,13,7,3,0,0,8,10,4,0,.424,.340,.764),
  buildBatter("St. Joseph","M. O'Keefe","Jr",16,.273,42,33,5,9,7,1,0,1,7,9,1,1,.405,.394,.799),
  buildBatter("St. Joseph","S. Covarrubias","Sr",19,.200,73,50,15,10,3,2,0,0,19,12,3,0,.444,.240,.684),
  buildBatter("St. Joseph","M. Kon","Sr",14,.263,45,38,2,10,8,0,0,0,4,11,2,1,.356,.263,.619),
  buildBatter("St. Joseph","X. Horta","So",20,.191,58,47,3,9,7,1,0,0,6,7,0,3,.268,.213,.481),
  buildBatter("St. Joseph","R. Roemling","Sr",14,.148,34,27,2,4,0,1,0,0,5,7,1,1,.303,.185,.488),
  buildBatter("St. Joseph","S. Grupe","So",9,.300,12,10,2,3,2,0,0,0,1,1,1,0,.417,.300,.717),
  buildBatter("St. Joseph","J. Chavez","So",20,.071,14,14,5,1,1,0,0,0,0,1,0,0,.071,.071,.142),
  buildBatter("St. Joseph","R. Aparicio","Sr",10,.000,7,7,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("St. Joseph","L. Soares","So",3,.000,3,3,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  buildBatter("St. Joseph","R. Regnier","So",3,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // TEMPLETON
  buildBatter("Templeton","L. Olsen","Sr",23,.278,95,72,19,20,6,8,0,0,18,17,4,1,.442,.389,.831),
  buildBatter("Templeton","C. Sims","Jr",22,.410,83,78,22,32,8,4,2,0,2,9,3,0,.446,.513,.959),
  buildBatter("Templeton","L. Rivera","Jr",22,.359,89,78,18,28,15,3,1,0,7,7,1,2,.409,.423,.832),
  buildBatter("Templeton","A. Abatti","Jr",17,.065,39,31,1,2,5,1,0,0,5,13,1,1,.211,.097,.308),
  buildBatter("Templeton","J. Beckwith","So",23,.273,69,55,8,15,11,2,0,0,8,11,2,0,.385,.309,.694),
  buildBatter("Templeton","R. Garcia","Jr",17,.200,36,30,4,6,4,0,1,1,4,11,0,1,.286,.367,.653),
  buildBatter("Templeton","L. Stetz","Sr",21,.388,78,67,13,26,16,3,3,0,7,7,4,0,.474,.522,.996),
  buildBatter("Templeton","N. Capaci","Jr",22,.269,66,52,10,14,4,2,0,0,10,19,2,1,.400,.308,.708),
  buildBatter("Templeton","J. Buys","Jr",18,.241,38,29,2,7,4,1,0,0,6,14,1,2,.368,.276,.644),
  buildBatter("Templeton","E. Abatti","Fr",12,.188,22,16,3,3,3,0,0,0,5,6,1,0,.409,.188,.596),
  buildBatter("Templeton","N. Argain","Sr",18,.231,30,26,3,6,3,1,0,0,2,5,0,0,.286,.269,.555),
  buildBatter("Templeton","T. Miller","So",11,.219,35,32,4,7,5,3,0,0,3,7,0,0,.286,.313,.598),
  buildBatter("Templeton","W. Patch","Sr",10,.286,16,14,3,4,1,1,0,0,2,6,0,0,.375,.357,.732),
  buildBatter("Templeton","C. Hamilton","So",19,.171,53,41,4,7,6,1,0,0,9,20,2,1,.340,.195,.535),

  // MISSION COLLEGE PREP
  buildBatter("Mission College Prep","A. Johnson","Jr",15,.475,50,40,10,19,9,4,0,0,7,1,0,1,.542,.575,1.117),
  buildBatter("Mission College Prep","T. Bernal","Jr",12,.471,39,34,10,16,13,1,1,1,5,5,0,0,.538,.647,1.186),
  buildBatter("Mission College Prep","H. Drake","Sr",18,.397,70,58,18,23,9,3,2,0,12,6,0,0,.500,.517,1.017),
  buildBatter("Mission College Prep","J. Villa","Sr",18,.382,74,68,17,26,9,2,0,0,2,5,2,2,.405,.412,.817),
  buildBatter("Mission College Prep","R. Engle","So",18,.370,66,54,12,20,14,6,1,2,8,12,2,0,.469,.630,1.098),
  buildBatter("Mission College Prep","B. Augustine","Jr",11,.364,12,11,1,4,4,0,1,0,0,3,1,0,.417,.545,.962),
  buildBatter("Mission College Prep","C. Mott","Jr",17,.333,50,42,9,14,6,4,0,0,5,6,1,0,.417,.429,.845),
  buildBatter("Mission College Prep","N. Bender","So",2,.333,3,3,1,1,4,0,0,1,0,0,0,0,.333,1.333,1.667),
  buildBatter("Mission College Prep","B. Orfila","Jr",15,.278,43,36,3,10,7,3,0,1,5,11,1,0,.381,.444,.825),
  buildBatter("Mission College Prep","J. Esparza","Jr",17,.268,62,56,10,15,14,2,0,0,3,4,0,1,.300,.304,.604),
  buildBatter("Mission College Prep","J. Cortez","Sr",17,.220,54,41,8,9,5,3,0,0,11,18,1,0,.396,.293,.689),
  buildBatter("Mission College Prep","B. May","Jr",13,.200,30,25,3,5,2,1,0,1,4,11,1,0,.333,.360,.693),
  buildBatter("Mission College Prep","C. Treanor","Jr",9,.000,16,13,3,0,0,0,0,0,3,2,0,0,.188,.000,.188),
  buildBatter("Mission College Prep","B. Burt","Jr",7,.000,8,6,1,0,0,0,0,0,2,4,0,0,.250,.000,.250),
  buildBatter("Mission College Prep","J. Marsalek","So",2,.000,5,5,0,0,0,0,0,0,0,3,0,0,.000,.000,.000),
  buildBatter("Mission College Prep","R. Cordova","So",1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Mission College Prep","E. Engle","Jr",9,.000,8,7,3,0,0,0,0,0,1,3,0,0,.125,.000,.125),

  // LOMPOC
  // (No individual stats available — team record only)
];

const pitchers = [
  // ARROYO GRANDE
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.27,0,0,27.2,16,10,5,5,25,6),
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.32,0,0,22,12,4,1,6,11,10),
  buildPitcher("Arroyo Grande","G. Pope","Sr",0.93,0,0,30,18,10,4,12,20,8),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.00,0,0,4.1,4,0,0,3,4,4),
  buildPitcher("Arroyo Grande","O. King","Jr",2.27,0,0,12.1,10,6,4,5,16,6),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",2.55,0,0,22,12,8,8,8,17,6),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.85,0,0,20,19,22,11,17,13,6),
  buildPitcher("Arroyo Grande","J. Ralph","Jr",0,0,0,0,3,4,3,1,0,1),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),

  // ATASCADERO
  buildPitcher("Atascadero","W. Azelton","So",3.21,3,2,43.2,53,29,20,11,35,10),
  buildPitcher("Atascadero","W. Witt","Sr",3.50,2,3,38,37,27,19,20,28,12),
  buildPitcher("Atascadero","D. Mitchell","Sr",4.89,1,5,24.1,41,29,17,13,17,7),
  buildPitcher("Atascadero","J. Litten","So",7.00,0,0,6,7,6,6,6,6,3),
  buildPitcher("Atascadero","M. Cullen","Jr",9.00,0,0,9.1,15,14,12,5,6,9),
  buildPitcher("Atascadero","C. Knoph","Jr",8.84,0,2,6.1,7,8,8,7,3,4),
  buildPitcher("Atascadero","A. Madrigal","Sr",8.75,1,1,8,9,12,10,10,4,5),
  buildPitcher("Atascadero","V. Rivera","Sr",7.64,0,0,3.2,6,4,4,3,2,3),

  // CABRILLO
  buildPitcher("Cabrillo","J. Low","Sr",3.74,3,5,39.1,32,27,21,19,27,9),
  buildPitcher("Cabrillo","J. Heidt","Jr",7.88,1,2,13.1,25,20,15,4,2,5),
  buildPitcher("Cabrillo","C. Powell","Jr",6.12,0,1,16,23,18,14,4,9,6),
  buildPitcher("Cabrillo","J. Clark","So",3.34,0,0,14.2,15,11,7,8,14,8),
  buildPitcher("Cabrillo","F. Lopez","Sr",7.20,0,5,23.1,31,38,24,30,13,8),
  buildPitcher("Cabrillo","M. Koff","Sr",6.30,1,0,13.1,16,13,12,12,15,8),
  buildPitcher("Cabrillo","I. Lopez","So",10.50,0,1,6,12,13,9,4,5,3),
  buildPitcher("Cabrillo","L. Rounds","So",7.00,0,0,3,4,5,3,2,0,1),
  buildPitcher("Cabrillo","L. Vorce","Jr",28.00,0,1,1,1,5,4,5,0,1),

  // MORRO BAY
  buildPitcher("Morro Bay","E. Brown","Sr",2.98,3,3,40,43,21,17,8,35,12),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",2.20,3,1,28.2,24,16,9,6,21,8),
  buildPitcher("Morro Bay","E. Davis","Sr",5.40,3,2,23.1,27,22,18,10,12,8),
  buildPitcher("Morro Bay","C. White","Sr",5.56,1,1,11.1,15,9,9,2,10,9),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","J. Skaggs","Sr",2.33,0,0,3,2,1,1,2,1,2),
  buildPitcher("Morro Bay","H. Stow","",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Deovlet","So",2.80,0,0,5,6,2,2,2,3,2),
  buildPitcher("Morro Bay","C. League","Fr",6.75,1,0,9.1,13,12,9,6,8,5),
  buildPitcher("Morro Bay","M. Miner","Jr",52.50,0,0,0.2,17,9,5,4,1,2),

  // NIPOMO
  buildPitcher("Nipomo","E. Silveira-19","Sr",2.66,7,2,44.2,36,30,17,24,41,10),
  buildPitcher("Nipomo","E. Silveira-3","Sr",5.25,2,2,29.1,32,33,22,26,32,10),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.50,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","G. Groshart","Sr",7.00,0,2,12,15,17,12,15,12,5),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.42,1,1,12,15,14,11,15,4,5),
  buildPitcher("Nipomo","K. Simonson","So",6.00,0,0,2.1,1,2,2,3,2,2),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.25,0,0,8,18,7,6,5,4,4),
  buildPitcher("Nipomo","Z. Garibay","Sr",7.87,0,0,2.2,5,3,3,1,1,3),
  buildPitcher("Nipomo","F. Callaghan","Jr",4.50,0,1,4.2,8,5,3,4,3,3),
  buildPitcher("Nipomo","J. Lanier","Sr",31.50,0,0,0.2,3,3,3,1,1,1),
  buildPitcher("Nipomo","M. Marlett","Jr",0,0,0,0,2,2,2,0,0,1),

  // PASO ROBLES
  buildPitcher("Paso Robles","E. Rendon","So",2.02,4,0,34.2,14,12,10,35,57,10),
  buildPitcher("Paso Robles","M. Garcia","Sr",1.56,0,0,9,3,2,2,5,16,7),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.80,2,1,30,35,19,12,11,29,8),
  buildPitcher("Paso Robles","T. Freitas","Sr",3.62,1,0,19.1,18,18,10,10,20,7),
  buildPitcher("Paso Robles","B. Lowry","Jr",6.56,0,0,16,18,20,15,8,19,8),
  buildPitcher("Paso Robles","S. Roby","Sr",4.00,0,0,14,16,10,8,9,8,5),
  buildPitcher("Paso Robles","J. Soboleski","Jr",2.25,0,0,9.1,10,4,3,5,4,6),
  buildPitcher("Paso Robles","X. Hermanson","Jr",0.00,0,0,1.1,2,1,0,0,0,1),
  buildPitcher("Paso Robles","C. Walker","Sr",0,0,0,0,2,0,0,4,0,1),

  // PIONEER VALLEY
  buildPitcher("Pioneer Valley","I. Garcia","Jr",0.64,3,1,22,9,3,2,5,19,6),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",2.49,2,1,19.2,19,14,7,11,22,7),
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.50,1,0,14,13,11,3,8,11,4),
  buildPitcher("Pioneer Valley","D. Cortez","So",1.97,1,0,10.2,11,6,3,5,12,8),
  buildPitcher("Pioneer Valley","M. Botello","Jr",3.50,0,0,4,7,2,2,2,5,4),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",3.13,3,1,22.1,23,14,10,11,18,8),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",2.80,1,1,20,16,9,8,7,15,6),
  buildPitcher("Pioneer Valley","I. Martinez","Sr",2.47,0,1,5.2,9,8,2,3,3,3),
  buildPitcher("Pioneer Valley","J. Medina","Jr",14.00,0,1,1,2,2,2,1,3,1),
  buildPitcher("Pioneer Valley","J. Lopez","Sr",23.10,0,0,3.1,12,13,11,5,1,2),
  buildPitcher("Pioneer Valley","J. Romero","So",2.10,0,0,3.1,2,2,1,1,0,1),

  // RIGHETTI
  buildPitcher("Righetti","I. Rocha","So",2.60,4,1,32.1,41,15,12,10,19,7),
  buildPitcher("Righetti","K. Walker","Jr",1.94,2,0,18,19,9,5,4,18,5),
  buildPitcher("Righetti","G. Rodriguez","Sr",4.53,2,1,29.1,31,23,19,11,12,10),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","N. Lancor","Sr",4.57,3,2,23,26,20,15,11,19,10),
  buildPitcher("Righetti","E. Barcenas","Sr",7.00,0,0,2,0,2,2,3,3,1),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  buildPitcher("Righetti","A. Stevens","Fr",0.00,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","M. Anderson","Sr",2.33,0,0,3,3,2,1,0,1,2),
  buildPitcher("Righetti","C. Viker","Sr",6.00,0,0,2.1,4,6,2,4,2,3),

  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.25,6,1,36.2,34,21,17,15,21,7),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",13.12,0,0,5.1,11,11,10,3,4,5),
  buildPitcher("San Luis Obispo","L. Drenckpohl","Sr",18.00,0,0,2.1,2,6,6,6,1,1),
  buildPitcher("San Luis Obispo","T. Blaney","So",2.80,1,0,10,12,7,4,5,5,5),
  buildPitcher("San Luis Obispo","J. Riley","Jr",2.76,1,2,25.1,25,17,10,7,20,7),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.80,5,4,50,56,28,20,22,59,10),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",3.15,0,0,6.2,8,7,3,6,3,7),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",4.28,1,1,18,25,21,11,10,18,7),

  // SANTA MARIA
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.85,0,0,8.2,9,10,6,5,9,3),
  buildPitcher("Santa Maria","J. Medina-21","Sr",6.42,0,0,12,17,11,11,11,15,5),
  buildPitcher("Santa Maria","D. Martin","Sr",4.41,0,0,33.1,39,22,21,11,38,8),
  buildPitcher("Santa Maria","J. Medina-30","Sr",5.92,0,0,26,33,36,22,30,43,11),
  buildPitcher("Santa Maria","A. Ybarra","Sr",0.00,0,0,1,1,0,0,0,0,1),
  buildPitcher("Santa Maria","J. Calderon","Sr",4.67,0,0,3,2,2,2,4,3,2),
  buildPitcher("Santa Maria","A. Rice","Fr",19.09,0,0,3.2,12,15,10,5,2,3),
  buildPitcher("Santa Maria","B. Alejo","Jr",2.02,0,0,17.1,15,11,5,5,11,7),

  // SANTA YNEZ
  buildPitcher("Santa Ynez","E. Roberts","So",1.53,3,0,32,32,7,7,8,37,8),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",2.01,5,2,45.1,33,22,13,21,74,9),
  buildPitcher("Santa Ynez","S. Rhea","Jr",4.67,0,0,3,1,2,2,4,4,2),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.28,0,0,10.2,8,8,5,10,20,5),
  buildPitcher("Santa Ynez","C. Palmer","Jr",1.71,3,0,16.1,5,5,4,11,22,4),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.83,1,0,7.2,5,2,2,4,9,6),
  buildPitcher("Santa Ynez","A. Lewis","Fr",7.00,0,0,4,5,5,4,4,4,2),

  // ST. JOSEPH
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.66,0,0,10.2,6,9,1,9,7,7),
  buildPitcher("St. Joseph","L. Woodruff","So",2.54,5,0,30.1,21,13,11,9,24,10),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.56,5,2,38.1,32,21,14,8,50,8),
  buildPitcher("St. Joseph","X. Horta","So",2.21,3,1,25.1,17,11,8,13,26,6),
  buildPitcher("St. Joseph","C. Chanley","Sr",2.66,3,1,23.2,21,10,9,17,25,7),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",4.50,0,0,4.2,8,7,3,1,5,4),
  buildPitcher("St. Joseph","S. Grupe","So",21.00,0,0,1,3,3,3,1,0,1),

  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,1,1,10.1,6,2,0,5,7,4),
  buildPitcher("Templeton","C. Sims","Jr",3.50,0,0,6,6,5,3,5,3,3),
  buildPitcher("Templeton","L. Rivera","Jr",3.09,4,0,43,46,27,19,20,36,9),
  buildPitcher("Templeton","A. Abatti","Jr",1.66,0,0,25.1,19,22,6,16,24,8),
  buildPitcher("Templeton","R. Garcia","Jr",4.85,0,0,13,17,10,9,6,7,6),
  buildPitcher("Templeton","N. Capaci","Jr",0.00,0,0,0.2,0,0,0,0,1,1),
  buildPitcher("Templeton","N. Argain","Sr",4.59,2,1,42.2,49,45,28,27,34,13),
  buildPitcher("Templeton","W. Patch","Sr",2.25,1,0,9.1,11,5,3,8,10,4),

  // MISSION COLLEGE PREP
  buildPitcher("Mission College Prep","T. Bernal","Jr",3.38,2,1,29.0,32,16,14,10,29,7),
  buildPitcher("Mission College Prep","B. Orfila","Jr",4.88,3,3,33.0,43,26,23,15,28,9),
  buildPitcher("Mission College Prep","B. Augustine","Jr",2.05,2,1,13.2,19,11,4,8,10,7),
  buildPitcher("Mission College Prep","B. May","Jr",4.20,1,0,11.2,12,8,7,9,8,8),
  buildPitcher("Mission College Prep","H. Drake","Sr",7.00,2,1,10.0,9,10,10,14,7,7),
  buildPitcher("Mission College Prep","C. Treanor","Jr",5.25,0,1,6.2,9,6,5,3,4,5),
  buildPitcher("Mission College Prep","N. Bender","So",11.12,0,0,5.2,10,9,9,3,5,2),
  buildPitcher("Mission College Prep","C. Mott","Jr",5.25,0,0,4.0,4,3,3,1,2,3),
  buildPitcher("Mission College Prep","B. Burt","Jr",16.80,0,1,3.1,8,10,8,4,1,2),
  buildPitcher("Mission College Prep","J. Cortez","Sr",0.00,0,0,1.0,1,0,0,0,0,1),

];

// ============================================================
// STANDINGS DATA — update W/L records each week
// ============================================================
const standingsData = {
  mountain: [
    { abbr:"SJ",  name:"St. Joseph",          lw:8, ll:1, ow:16, ol:4,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:5, ll:4, ow:14, ol:7,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:5, ll:4, ow:13, ol:7,  ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:4, ll:6, ow:10, ol:8,  ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:4, ll:6, ow:13, ol:8,  ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:2, ll:8, ow:10, ol:12, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:8, ll:2, ow:14, ol:9,  ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:5, ll:3, ow:10, ol:11, ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:4, ll:6, ow:7,  ol:15, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:3, ll:5, ow:10, ol:13, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:6, ow:5,  ol:16, ot:0 },
  ],
  ocean: [
    { abbr:"SY",  name:"Santa Ynez",     lw:5, ll:2, ow:14, ol:4,  ot:0 },
    { abbr:"PV",  name:"Pioneer Valley", lw:5, ll:2, ow:12, ol:7,  ot:2 },
    { abbr:"NIP", name:"Nipomo",         lw:3, ll:2, ow:11, ol:10, ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:1, ll:8, ow:7,  ol:10, ot:0 },
  ]
};

// ============================================================
// AUTO-RECALIBRATION
// Recompute league averages from the actual batters/pitchers data
// every time this file loads, then re-run the derived stats so
// wRC+, ERA+, oWAR, pWAR, BABIP/WHIP color thresholds, etc. all
// reflect the CURRENT season's true CCAA baseline.
// ============================================================
function ipToFloat(ip) {
  // Baseball convention: '38.1' = 38⅓, '38.2' = 38⅔
  if (ip === null || ip === undefined) return 0;
  const s = ip.toString();
  if (!s.includes('.')) return parseFloat(s) || 0;
  const [whole, frac] = s.split('.');
  const w = parseInt(whole) || 0;
  if (frac === '1') return w + 1/3;
  if (frac === '2') return w + 2/3;
  return parseFloat(s) || 0;
}

function recalcLeagueAvgs() {
  // ── HITTING ──
  let tBB=0, tHBP=0, t1B=0, t2B=0, t3B=0, tHR=0, tAB=0, tSF=0, tH=0, tK=0, tPA=0, tR=0;
  batters.forEach(b => {
    tBB += b.bb||0; tHBP += b.hbp||0; tHR += b.hr||0; tAB += b.ab||0; tSF += b.sf||0;
    t2B += b.doubles||0; t3B += b.triples||0; tH += b.h||0; tK += b.k||0;
    tPA += b.pa||0; tR += b.r||0;
    t1B += (b.h||0) - (b.doubles||0) - (b.triples||0) - (b.hr||0);
  });

  const wobaNum = wBB*tBB + wHBP*tHBP + w1B*t1B + w2B*t2B + w3B*t3B + wHR*tHR;
  const wobaDen = tAB + tBB + tSF + tHBP;
  const newWOBA = wobaDen > 0 ? wobaNum / wobaDen : LG_WOBA;
  const newAVG  = tAB > 0 ? tH / tAB : LG_AVG;
  const newOBP  = (tAB + tBB + tHBP + tSF) > 0 ? (tH + tBB + tHBP) / (tAB + tBB + tHBP + tSF) : LG_OBP;
  const newRPA  = tPA > 0 ? tR / tPA : LG_R_PA;
  const babipDen = tAB - tK - tHR + tSF;
  const newBABIP = babipDen > 0 ? (tH - tHR) / babipDen : LG_BABIP;

  // ── PITCHING ──
  let tIP=0, tER=0, tBBp=0, tKp=0, tHp=0;
  pitchers.forEach(p => {
    const ip = ipToFloat(p.ip);
    tIP += ip; tER += p.er||0; tBBp += p.bb||0; tKp += p.k||0; tHp += p.h||0;
  });
  const newERA  = tIP > 0 ? (tER * 9) / tIP : LG_ERA;
  const newK9   = tIP > 0 ? (tKp * 9) / tIP : LG_K9;
  const newBB9  = tIP > 0 ? (tBBp * 9) / tIP : LG_BB9;
  const newWHIP = tIP > 0 ? (tBBp + tHp) / tIP : LG_WHIP;

  // ── REASSIGN constants ──
  LG_AVG    = Math.round(newAVG  * 1000) / 1000;
  LG_OBP    = Math.round(newOBP  * 1000) / 1000;
  LG_WOBA   = Math.round(newWOBA * 1000) / 1000;
  LG_R_PA   = Math.round(newRPA  * 1000) / 1000;
  LG_BABIP  = Math.round(newBABIP* 1000) / 1000;
  LG_ERA    = Math.round(newERA  * 100)  / 100;
  LG_K9     = Math.round(newK9   * 10)   / 10;
  LG_BB9    = Math.round(newBB9  * 10)   / 10;
  LG_WHIP   = Math.round(newWHIP * 100)  / 100;
  WOBA_SCALE = LG_OBP > 0 ? Math.round((LG_WOBA / LG_OBP) * 1000) / 1000 : WOBA_SCALE;

  // ── DYNAMIC COLOR THRESHOLDS ──
  // ±~15% from league average → "above avg / below avg" coloring on tables
  BABIP_LO = Math.round(LG_BABIP * 0.85 * 1000) / 1000;
  BABIP_HI = Math.round(LG_BABIP * 1.15 * 1000) / 1000;
  WHIP_LO  = Math.round(LG_WHIP  * 0.85 * 100)  / 100;  // lower=better, so this is "elite" line
  WHIP_HI  = Math.round(LG_WHIP  * 1.15 * 100)  / 100;  // and this is "rough" line

  // ── REBUILD derived stats so wRC+/ERA+/oWAR/pWAR reflect new baseline ──
  batters.forEach(b => {
    b.woba = Math.round(calcWOBA(b.bb, b.hbp, b.h, b.doubles, b.triples, b.hr, b.ab, b.sf||0) * 1000) / 1000;
    b.wrc_plus = calcWRC_plus(b.woba, b.pa);
    b.owar = calcOWAR(b.wrc_plus, b.pa);
    b.proj40owar = (b.owar !== null && b.gp && b.gp >= 5) ? Math.round((b.owar / b.gp) * 40 * 10) / 10 : null;
  });
  pitchers.forEach(p => {
    p.era_plus = calcERA_plus(p.era, p.ip);
    p.pwar = calcPWAR(p.era, p.ip);
    p.proj40pwar = (p.pwar !== null && p.app && p.app >= 3) ? Math.round((p.pwar / p.app) * 40 * 10) / 10 : null;
  });
}

// Run on load
recalcLeagueAvgs();
