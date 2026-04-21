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
const DATA_UPDATED = "2026-04-20"; // YYYY-MM-DD — stats through April 20

// wOBA weights (standard)
const wBB = 0.69, wHBP = 0.72, w1B = 0.88, w2B = 1.24, w3B = 1.56, wHR = 2.00;

// ── CCAA League Constants ──
// These are seeded with current-data values and AUTO-RECALIBRATED at the bottom
// of this file from the actual batters/pitchers arrays. Do not hand-edit unless
// you're changing season-start defaults.
let LG_AVG         = 0.312;  // CCAA league avg AVG
let LG_OBP         = 0.411;  // CCAA league avg OBP
let LG_WOBA        = 0.363;  // CCAA league avg wOBA
let WOBA_SCALE     = 0.883;  // wOBA/lgOBP-style scaling factor
let LG_R_PA        = 0.193;  // runs per PA (CCAA avg; MLB≈0.115)
let LG_BABIP       = 0.368;  // CCAA league avg BABIP — used for color thresholds
let LG_ERA         = 4.83;   // CCAA league ERA
let LG_K9          = 8.0;    // CCAA league avg K/9
let LG_BB9         = 4.9;    // CCAA league avg BB/9
let LG_WHIP        = 1.57;   // CCAA league avg WHIP — used for color thresholds
// Dynamic color thresholds derived from league averages (auto-set by recalcLeagueAvgs)
let BABIP_LO       = 0.313;  // .15 below lgBABIP
let BABIP_HI       = 0.423;  // .15 above lgBABIP
let WHIP_LO        = 1.33;   // .15 below lgWHIP (elite)
let WHIP_HI        = 1.81;   // .15 above lgWHIP (rough)
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
    overall: "11-3",
    leagueRecord: "2-1",
    wins: 11, losses: 3, ties: 0,
    leagueWins: 2, leagueLosses: 1,
    caRank: 422,
    gp: 14,
    teamBavg: .384, teamOBP: .486, teamSLG: .501,
    teamERA: 2.55, teamIP: 93.1
  },
  {
    id: "pioneer-valley",
    name: "Pioneer Valley",
    mascot: "Panthers",
    location: "Santa Maria, CA",
    coach: "Cody Smith",
    colors: "Teal, Black",
    league: "CCAA - Ocean",
    overall: "10-6-2",
    leagueRecord: "4-1",
    wins: 10, losses: 6, ties: 2,
    leagueWins: 4, leagueLosses: 1,
    caRank: 476,
    gp: 14,
    teamBavg: .281, teamOBP: .400, teamSLG: .348,
    teamERA: 2.61, teamIP: 94
  },
  {
    id: "nipomo",
    name: "Nipomo",
    mascot: "Titans",
    location: "Nipomo, CA",
    coach: "Caleb Buendia",
    colors: "Black, Cardinal, Silver",
    league: "CCAA - Ocean",
    overall: "10-9",
    leagueRecord: "2-1",
    wins: 10, losses: 9, ties: 0,
    leagueWins: 2, leagueLosses: 1,
    caRank: 494,
    gp: 19,
    teamBavg: .326, teamOBP: .403, teamSLG: .379,
    teamERA: 5.60, teamIP: 118.2
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "10-9-1",
    leagueRecord: "5-1",
    wins: 10, losses: 9, ties: 1,
    leagueWins: 5, leagueLosses: 1,
    caRank: 184,
    gp: 20,
    teamBavg: .319, teamOBP: .390, teamSLG: .436,
    teamERA: 2.78, teamIP: 120.2
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "11-8",
    leagueRecord: "5-1",
    wins: 11, losses: 8, ties: 0,
    leagueWins: 5, leagueLosses: 1,
    caRank: 270,
    gp: 19,
    teamBavg: .308, teamOBP: .409, teamSLG: .394,
    teamERA: 3.88, teamIP: 130
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
    overall: "13-7",
    leagueRecord: "4-5",
    wins: 13, losses: 7, ties: 0,
    leagueWins: 4, leagueLosses: 5,
    caRank: 183,
    gp: 20,
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
    overall: "9-12",
    leagueRecord: "1-8",
    wins: 9, losses: 12, ties: 0,
    leagueWins: 1, leagueLosses: 8,
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
    overall: "9-13",
    leagueRecord: "2-5",
    wins: 9, losses: 13, ties: 0,
    leagueWins: 2, leagueLosses: 5,
    caRank: 511,
    gp: 22,
    teamBavg: .283, teamOBP: .385, teamSLG: .361,
    teamERA: 3.39, teamIP: 140.1
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "S.D. Harrow",
    colors: "Navy, Vegas Gold",
    league: "CCAA - Mountain",
    overall: "10-7",
    leagueRecord: "4-5",
    wins: 10, losses: 7, ties: 0,
    leagueWins: 4, leagueLosses: 5,
    caRank: 213,
    gp: null,
    teamBavg: null, teamOBP: null, teamSLG: null,
    teamERA: null, teamIP: null,
    noStats: true
  },
  {
    id: "atascadero",
    name: "Atascadero",
    mascot: "Greyhounds",
    location: "Atascadero, CA",
    coach: "Samm Spears",
    colors: "Orange, Gray",
    league: "CCAA - Sunset",
    overall: "7-14",
    leagueRecord: "4-5",
    wins: 7, losses: 14, ties: 0,
    leagueWins: 4, leagueLosses: 5,
    caRank: 640,
    gp: 21,
    teamBavg: .224, teamOBP: .371, teamSLG: .291,
    teamERA: 4.87, teamIP: 129.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "6-9",
    leagueRecord: "0-7",
    wins: 6, losses: 9, ties: 0,
    leagueWins: 0, leagueLosses: 7,
    caRank: 794,
    gp: 15,
    teamBavg: .326, teamOBP: .427, teamSLG: .380,
    teamERA: 5.02, teamIP: 92
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
  buildBatter("Atascadero","S. Ernst","Sr",15,.250,40,36,5,9,3,1,0,0,4,17,0,0,.325,.278,.603),
  buildBatter("Atascadero","C. Knoph","Jr",7,.200,6,5,0,1,2,0,0,0,1,3,0,0,.333,.200,.533),
  buildBatter("Atascadero","E. Wanner","Sr",19,.160,71,50,11,8,6,1,0,0,14,6,2,2,.353,.180,.533),
  buildBatter("Atascadero","V. Rivera","Sr",5,.250,5,4,1,1,1,0,0,0,1,2,0,0,.400,.250,.650),
  buildBatter("Atascadero","A. Madrigal","Sr",8,.333,8,6,2,2,1,1,0,0,2,2,0,0,.500,.500,1.000),
  buildBatter("Atascadero","M. Cullen","Jr",10,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","M. Zepeda","Sr",20,.188,61,48,6,9,6,2,1,0,9,10,0,0,.316,.271,.587),
  buildBatter("Atascadero","R. Brown","Sr",12,.154,13,13,2,2,0,0,0,0,0,4,0,0,.154,.154,.308),
  buildBatter("Atascadero","W. Azelton","So",20,.178,62,45,6,8,9,3,1,0,10,17,5,2,.371,.289,.660),
  buildBatter("Atascadero","J. Litten","So",20,.250,61,48,6,12,7,2,0,0,6,14,4,2,.367,.292,.659),
  buildBatter("Atascadero","W. Litten","Sr",20,.344,74,61,9,21,16,5,1,0,6,13,7,0,.459,.459,.918),
  buildBatter("Atascadero","M. Beck","Jr",20,.167,35,30,9,5,2,0,0,0,4,8,1,0,.286,.167,.453),
  buildBatter("Atascadero","A. Donaldson","So",15,.222,46,36,6,8,3,0,0,0,8,11,1,0,.378,.222,.600),
  buildBatter("Atascadero","W. Witt","Sr",19,.245,75,49,16,12,5,4,0,1,24,18,2,0,.507,.388,.895),
  buildBatter("Atascadero","C. Savino","Fr",4,.143,11,7,1,1,1,0,0,0,4,4,0,0,.455,.143,.598),
  buildBatter("Atascadero","T. Knutson","So",3,.000,5,4,0,0,0,0,0,0,1,3,0,0,.200,.000,.200),
  buildBatter("Atascadero","D. Mitchell","Sr",15,.222,59,54,7,12,8,4,1,0,3,10,2,0,.288,.333,.621),

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
  buildBatter("Nipomo","B. Hageman","So",18,.517,73,60,21,31,10,3,0,0,4,6,2,1,.552,.567,1.119),
  buildBatter("Nipomo","E. Silveira-19","Sr",18,.362,69,58,10,21,15,4,0,0,7,8,4,0,.464,.431,.895),
  buildBatter("Nipomo","G. Groshart","Sr",17,.350,67,60,7,21,26,9,0,0,3,4,2,2,.388,.500,.888),
  buildBatter("Nipomo","L. Hobbs","Sr",18,.357,74,56,31,20,4,1,0,0,6,2,11,1,.500,.375,.875),
  buildBatter("Nipomo","L. Hobbs","Fr",18,.320,61,50,6,16,9,2,0,0,8,4,2,0,.433,.360,.793),
  buildBatter("Nipomo","C. Moulden","So",18,.355,68,62,13,22,18,6,0,0,4,8,2,0,.412,.452,.864),
  buildBatter("Nipomo","E. Silveira-3","Sr",18,.298,50,47,8,14,7,1,0,0,2,6,0,1,.320,.319,.639),
  buildBatter("Nipomo","T. Oxley","Sr",17,.194,47,36,7,7,2,1,0,0,9,16,1,1,.362,.222,.584),
  buildBatter("Nipomo","T. Barr","Sr",14,.235,37,34,2,8,6,1,0,0,1,13,1,1,.270,.265,.535),
  buildBatter("Nipomo","H. Roesner","Jr",15,.167,20,18,4,3,1,0,0,0,2,5,0,0,.250,.167,.417),
  buildBatter("Nipomo","K. Simonson","So",16,.167,32,30,2,5,3,0,0,0,0,6,0,2,.156,.167,.323),
  buildBatter("Nipomo","A. Mendoza","Jr",9,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Nipomo","J. Lanier","Sr",5,.000,2,2,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","Z. Garibay","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","F. Callaghan","Jr",3,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","M. Marlett","Jr",3,.000,2,0,1,0,0,0,0,0,1,0,1,0,1.000,.000,1.000),

  // PASO ROBLES
  buildBatter("Paso Robles","M. Garcia","Sr",18,.400,71,60,25,24,10,5,1,0,10,7,1,0,.493,.517,1.010),
  buildBatter("Paso Robles","B. Lowry","Jr",18,.400,69,55,15,22,20,3,1,1,10,8,1,3,.478,.545,1.023),
  buildBatter("Paso Robles","T. Freitas","Sr",18,.328,68,61,14,20,12,7,0,0,3,1,3,1,.382,.443,.825),
  buildBatter("Paso Robles","C. Prieto","Jr",18,.333,59,51,12,17,11,5,0,0,3,7,1,2,.368,.431,.799),
  buildBatter("Paso Robles","K. Magdaleno","Jr",8,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","E. Dobroth","Jr",18,.356,69,59,16,21,17,2,1,0,5,10,4,1,.435,.424,.859),
  buildBatter("Paso Robles","E. Rendon","So",17,.305,65,59,12,18,12,4,1,2,2,7,3,1,.354,.508,.862),
  buildBatter("Paso Robles","X. Hermanson","Jr",17,.261,55,46,8,12,11,5,0,0,6,5,1,1,.352,.370,.722),
  buildBatter("Paso Robles","J. Soboleski","Jr",18,.314,58,51,11,16,8,7,1,0,6,10,1,0,.397,.490,.887),
  buildBatter("Paso Robles","G. Berlingeri","Sr",3,.429,7,7,2,3,0,0,0,0,0,2,0,0,.429,.429,.858),
  buildBatter("Paso Robles","C. Glover","Sr",12,.154,19,13,3,2,1,0,0,0,3,5,1,0,.353,.154,.507),
  buildBatter("Paso Robles","C. Contreras","Jr",15,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","E. Nevarez","Jr",5,.400,5,5,1,2,1,2,0,0,0,1,0,0,.400,.800,1.200),
  buildBatter("Paso Robles","J. Lopez","Jr",6,.667,4,3,0,2,0,0,0,0,0,0,0,0,.667,.667,1.334),
  buildBatter("Paso Robles","L. Christensen","Jr",11,.083,14,12,2,1,0,0,0,0,1,4,0,0,.154,.083,.237),
  buildBatter("Paso Robles","N. Contreras","Jr",11,.077,13,13,1,1,0,0,0,0,0,7,0,0,.077,.077,.154),
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
  buildBatter("San Luis Obispo","P. Wyatt","Jr",21,.281,79,64,13,18,14,1,0,0,7,4,3,1,.373,.297,.670),
  buildBatter("San Luis Obispo","G. Bramble","Sr",16,.263,62,57,13,15,9,5,0,1,5,11,0,0,.323,.404,.727),
  buildBatter("San Luis Obispo","N. Soderin","Sr",19,.200,20,15,9,3,1,0,0,0,4,7,1,0,.400,.200,.600),
  buildBatter("San Luis Obispo","B. Schafer","Jr",19,.243,57,37,10,9,3,3,0,0,14,5,1,0,.462,.324,.786),
  buildBatter("San Luis Obispo","D. Wilson","Jr",18,.188,17,16,1,3,3,0,0,0,1,3,0,0,.235,.188,.422),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",21,.312,83,77,14,24,11,5,1,0,5,11,0,0,.354,.403,.757),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",21,.328,69,58,13,19,15,2,0,0,6,15,4,0,.426,.362,.788),
  buildBatter("San Luis Obispo","C. Stephens","Jr",21,.323,76,65,16,21,12,3,1,0,11,12,0,0,.421,.400,.821),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","T. Blaney","So",21,.320,62,50,13,16,7,3,0,1,12,10,0,0,.452,.440,.892),
  buildBatter("San Luis Obispo","J. Riley","Jr",21,.444,80,63,8,28,13,3,0,0,15,8,1,1,.550,.492,1.042),
  buildBatter("San Luis Obispo","J. Taylor","Sr",20,.304,54,46,9,14,11,2,0,3,8,14,0,0,.407,.543,.950),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",5,.000,6,6,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","F. Avrett","Jr",13,.375,17,16,2,6,8,3,0,0,0,8,0,1,.353,.563,.916),

  // SANTA MARIA
  buildBatter("Santa Maria","Z. Camacho","Fr",2,.500,4,4,2,2,0,1,0,0,0,1,0,0,.500,.750,1.250),
  buildBatter("Santa Maria","J. Reyes","Sr",6,.000,5,5,3,0,1,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("Santa Maria","J. Gaitan","So",7,.000,6,5,1,0,0,0,0,0,1,2,0,0,.167,.000,.167),
  buildBatter("Santa Maria","U. Rodriguez","Fr",15,.233,43,30,11,7,5,1,0,0,11,4,2,0,.465,.267,.732),
  buildBatter("Santa Maria","J. Medina-21","Sr",13,.244,45,41,9,10,6,2,0,0,4,9,0,0,.311,.293,.604),
  buildBatter("Santa Maria","D. Martin","Sr",15,.326,57,46,16,15,8,5,0,0,9,4,2,0,.456,.435,.891),
  buildBatter("Santa Maria","O. Sedano","So",4,.667,5,3,2,2,3,0,0,0,2,0,0,0,.800,.667,1.467),
  buildBatter("Santa Maria","J. Medina-30","Sr",15,.455,57,44,16,20,8,2,1,0,13,9,0,0,.579,.545,1.124),
  buildBatter("Santa Maria","A. Ybarra","Sr",15,.268,49,41,6,11,6,2,0,0,7,9,1,0,.388,.317,.705),
  buildBatter("Santa Maria","J. Calderon","Sr",15,.404,53,47,10,19,8,0,0,0,3,2,1,1,.442,.404,.846),
  buildBatter("Santa Maria","A. Rice","So",15,.304,50,46,8,14,10,0,0,0,2,8,2,0,.360,.304,.664),
  buildBatter("Santa Maria","A. Rice","Fr",14,.286,38,35,4,10,8,3,0,0,3,7,0,0,.342,.371,.713),
  buildBatter("Santa Maria","B. Alejo","Jr",15,.400,56,50,6,20,18,4,0,0,1,5,4,1,.446,.480,.926),
  buildBatter("Santa Maria","I. Barajas","So",3,.000,2,1,1,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Santa Maria","F. Chavez","Sr",11,.300,14,10,2,3,3,0,0,0,3,2,1,0,.500,.300,.800),

  // SANTA YNEZ
  buildBatter("Santa Ynez","M. Skidmore","Sr",16,.339,70,62,23,21,12,7,0,0,6,10,1,0,.406,.452,.858),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",16,.360,68,50,18,18,14,7,1,0,14,6,4,0,.529,.540,1.069),
  buildBatter("Santa Ynez","E. Roberts","So",15,.435,57,46,14,20,13,7,0,0,7,9,3,1,.526,.587,1.113),
  buildBatter("Santa Ynez","T. Jeckell","Jr",16,.434,58,53,22,23,21,7,0,0,5,4,0,0,.483,.566,1.049),
  buildBatter("Santa Ynez","S. Rhea","Jr",16,.279,56,43,14,12,10,1,0,0,6,11,4,1,.407,.302,.709),
  buildBatter("Santa Ynez","J. Glover","Jr",16,.516,70,62,25,32,33,4,3,3,5,8,1,2,.543,.823,1.366),
  buildBatter("Santa Ynez","C. Palmer","Jr",10,.182,19,11,5,2,2,0,0,0,6,4,2,0,.526,.182,.708),
  buildBatter("Santa Ynez","B. Cram","So",16,.380,60,50,17,19,7,0,0,0,8,6,1,0,.475,.380,.855),
  buildBatter("Santa Ynez","K. Heiduk","So",16,.481,68,54,27,26,17,4,1,1,12,11,2,0,.588,.648,1.236),
  buildBatter("Santa Ynez","A. Lewis","Fr",5,.200,13,10,4,2,4,0,0,0,2,2,0,1,.308,.200,.508),
  buildBatter("Santa Ynez","D. Pulido","Sr",16,.417,68,48,23,20,17,5,0,1,14,4,4,2,.559,.583,1.142),

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
  buildBatter("Templeton","L. Olsen","Sr",22,.279,89,68,18,19,6,8,0,0,16,17,4,1,.438,.397,.835),
  buildBatter("Templeton","C. Sims","Jr",21,.397,78,73,21,29,6,2,2,0,2,9,3,0,.436,.479,.915),
  buildBatter("Templeton","L. Rivera","Jr",21,.347,83,72,16,25,14,3,1,0,7,7,1,2,.402,.417,.819),
  buildBatter("Templeton","A. Abatti","Jr",16,.065,39,31,1,2,5,1,0,0,5,13,1,1,.211,.097,.308),
  buildBatter("Templeton","J. Beckwith","So",22,.300,64,50,8,15,11,2,0,0,8,9,2,0,.417,.340,.757),
  buildBatter("Templeton","R. Garcia","Jr",16,.207,34,29,4,6,4,0,1,1,4,11,0,1,.294,.379,.673),
  buildBatter("Templeton","L. Stetz","Sr",20,.413,73,63,13,26,14,3,3,0,6,6,4,0,.493,.556,1.049),
  buildBatter("Templeton","N. Capaci","Jr",21,.271,61,48,10,13,4,2,0,0,9,18,2,1,.400,.313,.712),
  buildBatter("Templeton","J. Buys","Jr",17,.241,38,29,2,7,4,1,0,0,6,14,1,2,.368,.276,.644),
  buildBatter("Templeton","E. Abatti","Fr",11,.077,17,13,2,1,3,0,0,0,4,6,0,0,.294,.077,.371),
  buildBatter("Templeton","N. Argain","Sr",17,.231,30,26,3,6,3,1,0,0,2,5,0,0,.286,.269,.555),
  buildBatter("Templeton","T. Miller","So",10,.259,30,27,4,7,5,3,0,0,3,4,0,0,.333,.370,.703),
  buildBatter("Templeton","W. Patch","Sr",10,.286,16,14,3,4,1,1,0,0,2,6,0,0,.375,.357,.732),
  buildBatter("Templeton","C. Hamilton","So",18,.158,50,38,3,6,6,1,0,0,9,20,2,1,.340,.184,.524),

  // MISSION COLLEGE PREP
  buildBatter("Mission College Prep","A. Johnson","Jr",9,0.520,31,25,5,13,8,3,0,0,4,0,0,1,0.567,0.640,1.207),
  buildBatter("Mission College Prep","R. Engle","So",12,0.400,47,40,10,16,9,4,0,2,4,10,1,0,0.467,0.650,1.117),
  buildBatter("Mission College Prep","H. Drake","Sr",12,0.381,50,42,9,16,3,2,0,0,8,4,0,0,0.480,0.429,0.909),
  buildBatter("Mission College Prep","J. Villa","Sr",12,0.375,52,48,12,18,5,2,0,0,2,5,1,1,0.404,0.417,0.821),
  buildBatter("Mission College Prep","B. Augustine","Jr",7,0.333,9,9,0,3,2,0,1,0,0,2,0,0,0.333,0.556,0.889),
  buildBatter("Mission College Prep","N. Bender","So",2,0.333,3,3,1,1,4,0,0,1,0,0,0,0,0.333,1.333,1.667),
  buildBatter("Mission College Prep","T. Bernal","Jr",6,0.316,21,19,4,6,5,0,0,1,2,3,0,0,0.381,0.474,0.855),
  buildBatter("Mission College Prep","C. Mott","Jr",11,0.269,33,26,5,7,1,3,0,0,5,4,0,0,0.387,0.385,0.772),
  buildBatter("Mission College Prep","J. Esparza","Jr",12,0.268,46,41,6,11,10,2,0,0,3,3,0,0,0.318,0.317,0.635),
  buildBatter("Mission College Prep","B. May","Jr",10,0.238,26,21,3,5,2,1,0,1,4,8,1,0,0.385,0.429,0.813),
  buildBatter("Mission College Prep","J. Cortez","Sr",11,0.226,39,31,4,7,2,1,0,0,7,14,1,0,0.385,0.258,0.643),
  buildBatter("Mission College Prep","B. Orfila","Jr",10,0.208,29,24,3,5,5,2,0,1,4,6,0,0,0.321,0.417,0.738),
  buildBatter("Mission College Prep","C. Treanor","Jr",4,0.000,8,7,2,0,0,0,0,0,1,1,0,0,0.125,0.000,0.125),
  buildBatter("Mission College Prep","B. Burt","Jr",4,0.000,4,4,0,0,0,0,0,0,0,2,0,0,0.000,0.000,0.000),
  buildBatter("Mission College Prep","J. Marsalek","So",2,0.000,5,5,0,0,0,0,0,0,0,3,0,0,0.000,0.000,0.000),
  buildBatter("Mission College Prep","R. Cordova","So",1,0.000,1,1,0,0,0,0,0,0,0,1,0,0,0.000,0.000,0.000),
  buildBatter("Mission College Prep","E. Engle","Jr",6,0.000,5,4,2,0,0,0,0,0,1,1,0,0,0.200,0.000,0.200),
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
  buildPitcher("Atascadero","W. Azelton","So",3.34,3,2,35.2,46,24,17,10,31,9),
  buildPitcher("Atascadero","W. Witt","Sr",3.50,2,3,38,37,27,19,20,28,12),
  buildPitcher("Atascadero","D. Mitchell","Sr",5.01,1,4,22.1,37,28,16,9,14,6),
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
  buildPitcher("Nipomo","E. Silveira-19","Sr",2.60,6,2,37.2,27,23,14,21,37,9),
  buildPitcher("Nipomo","E. Silveira-3","Sr",6.30,2,2,23.1,25,31,21,24,27,9),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.50,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","G. Groshart","Sr",7.00,0,2,12,15,17,12,15,12,5),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.42,1,1,12,15,14,11,15,4,5),
  buildPitcher("Nipomo","K. Simonson","So",6.00,0,0,2.1,1,2,2,3,2,2),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.25,0,0,8,18,7,6,5,4,4),
  buildPitcher("Nipomo","Z. Garibay","Sr",7.87,0,0,2.2,5,3,3,1,1,3),
  buildPitcher("Nipomo","F. Callaghan","Jr",5.25,0,0,4,5,3,3,4,3,2),
  buildPitcher("Nipomo","J. Lanier","Sr",31.50,0,0,0.2,3,3,3,1,1,1),
  buildPitcher("Nipomo","M. Marlett","Jr",0,0,0,0,2,2,2,0,0,1),

  // PASO ROBLES
  buildPitcher("Paso Robles","E. Rendon","So",1.62,4,0,30.1,13,8,7,28,53,9),
  buildPitcher("Paso Robles","M. Garcia","Sr",1.56,0,0,9,3,2,2,5,16,7),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.96,2,1,26,29,18,11,10,26,7),
  buildPitcher("Paso Robles","T. Freitas","Sr",2.52,1,0,16.2,11,14,6,9,17,6),
  buildPitcher("Paso Robles","B. Lowry","Jr",5.60,0,0,15,14,16,12,7,18,7),
  buildPitcher("Paso Robles","S. Roby","Sr",4.00,0,0,14,16,10,8,9,8,5),
  buildPitcher("Paso Robles","J. Soboleski","Jr",2.52,0,0,8.1,8,4,3,4,4,5),
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
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.54,5,1,29.2,29,18,15,10,19,6),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",13.12,0,0,5.1,11,11,10,3,4,5),
  buildPitcher("San Luis Obispo","L. Drenckpohl","Sr",18.00,0,0,2.1,2,6,6,6,1,1),
  buildPitcher("San Luis Obispo","T. Blaney","So",2.62,1,0,8,11,6,3,3,3,4),
  buildPitcher("San Luis Obispo","J. Riley","Jr",2.76,1,2,25.1,25,17,10,7,20,7),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.64,4,4,45,50,25,17,19,54,9),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",3.15,0,0,6.2,8,7,3,6,3,7),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",4.28,1,1,18,25,21,11,10,18,7),

  // SANTA MARIA
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.85,0,0,8.2,9,10,6,5,9,3),
  buildPitcher("Santa Maria","J. Medina-21","Sr",6.42,0,0,12,17,11,11,11,15,5),
  buildPitcher("Santa Maria","D. Martin","Sr",4.78,0,0,26.1,34,19,18,8,37,7),
  buildPitcher("Santa Maria","J. Medina-30","Sr",5.17,0,0,21.2,22,27,16,26,39,10),
  buildPitcher("Santa Maria","A. Ybarra","Sr",0.00,0,0,1,1,0,0,0,0,1),
  buildPitcher("Santa Maria","J. Calderon","Sr",4.67,0,0,3,2,2,2,4,3,2),
  buildPitcher("Santa Maria","A. Rice","Fr",19.09,0,0,3.2,12,15,10,5,2,3),
  buildPitcher("Santa Maria","B. Alejo","Jr",1.79,0,0,15.2,13,10,4,5,9,6),

  // SANTA YNEZ
  buildPitcher("Santa Ynez","E. Roberts","So",1.64,3,0,25.2,25,6,6,5,33,7),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",2.19,4,2,38.1,30,21,12,19,62,8),
  buildPitcher("Santa Ynez","S. Rhea","Jr",4.67,0,0,3,1,2,2,4,4,2),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.36,0,0,8.1,8,7,4,7,16,4),
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
  buildPitcher("Templeton","L. Olsen","Sr",0.00,1,1,7.1,4,2,0,3,4,3),
  buildPitcher("Templeton","C. Sims","Jr",3.50,0,0,6,6,5,3,5,3,3),
  buildPitcher("Templeton","L. Rivera","Jr",3.09,4,0,43,46,27,19,20,36,9),
  buildPitcher("Templeton","A. Abatti","Jr",1.73,0,0,24.1,19,20,6,12,23,7),
  buildPitcher("Templeton","R. Garcia","Jr",4.85,0,0,13,17,10,9,6,7,6),
  buildPitcher("Templeton","N. Capaci","Jr",0.00,0,0,0.2,0,0,0,0,1,1),
  buildPitcher("Templeton","N. Argain","Sr",5.50,2,1,35.2,46,42,28,24,26,12),
  buildPitcher("Templeton","W. Patch","Sr",2.25,1,0,9.1,11,5,3,8,10,4),

  // MISSION COLLEGE PREP
  buildPitcher("Mission College Prep","H. Drake","Sr",4.38,2,1,8.0,6,0,5,7,4,5),
  buildPitcher("Mission College Prep","B. Augustine","Jr",1.97,2,1,10.2,13,0,3,6,8,5),
  buildPitcher("Mission College Prep","N. Bender","So",11.12,0,0,5.2,10,0,9,3,5,2),
  buildPitcher("Mission College Prep","T. Bernal","Jr",5.38,0,0,13.0,18,0,10,6,12,4),
  buildPitcher("Mission College Prep","C. Mott","Jr",10.50,0,0,2.0,3,0,3,1,1,1),
  buildPitcher("Mission College Prep","B. May","Jr",4.04,0,0,8.2,7,0,5,8,7,7),
  buildPitcher("Mission College Prep","J. Cortez","Sr",0.00,0,0,1.0,1,0,0,0,0,1),
  buildPitcher("Mission College Prep","B. Orfila","Jr",5.92,1,3,26.0,41,0,22,10,15,7),
  buildPitcher("Mission College Prep","C. Treanor","Jr",9.54,0,1,3.2,6,0,5,3,2,3),
  buildPitcher("Mission College Prep","B. Burt","Jr",16.80,0,1,3.1,8,0,8,4,1,2),
];

// ============================================================
// STANDINGS DATA — update W/L records each week
// ============================================================
const standingsData = {
  mountain: [
    { abbr:"SJ",  name:"St. Joseph",          lw:8, ll:1, ow:16, ol:4,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:5, ll:4, ow:14, ol:7,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:5, ll:4, ow:13, ol:7,  ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:4, ll:5, ow:13, ol:7,  ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:4, ll:5, ow:10, ol:7,  ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:1, ll:8, ow:9,  ol:12, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:6, ll:2, ow:12, ol:9,  ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:5, ll:1, ow:10, ol:9,  ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:4, ll:5, ow:7,  ol:14, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:2, ll:5, ow:9,  ol:13, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:6, ow:5,  ol:16, ot:0 },
  ],
  ocean: [
    { abbr:"SY",  name:"Santa Ynez",     lw:4, ll:1, ow:13, ol:3,  ot:0 },
    { abbr:"PV",  name:"Pioneer Valley", lw:4, ll:1, ow:11, ol:6,  ot:2 },
    { abbr:"NIP", name:"Nipomo",         lw:2, ll:1, ow:10, ol:9,  ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:0, ll:7, ow:6,  ol:9,  ot:0 },
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
