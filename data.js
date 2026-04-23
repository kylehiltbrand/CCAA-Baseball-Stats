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
const DATA_UPDATED = "2026-04-22"; // YYYY-MM-DD — stats through April 22 (all 15 teams)

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
    overall: "17-4-1",
    leagueRecord: "9-1",
    wins: 17, losses: 4, ties: 1,
    leagueWins: 9, leagueLosses: 1,
    caRank: 30,
    gp: 22,
    teamBavg: .273, teamOBP: .392, teamSLG: .376,
    teamERA: 2.41, teamIP: 151
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "14-8",
    leagueRecord: "5-5",
    wins: 14, losses: 8, ties: 0,
    leagueWins: 5, leagueLosses: 5,
    caRank: 84,
    gp: 22,
    teamBavg: .334, teamOBP: .420, teamSLG: .476,
    teamERA: 1.97, teamIP: 145.1
  },
  {
    id: "santa-ynez",
    name: "Santa Ynez",
    mascot: "Pirates",
    location: "Santa Ynez, CA",
    coach: "Craig Gladstone",
    colors: "Orange, Black",
    league: "CCAA - Ocean",
    overall: "14-3",
    leagueRecord: "5-1",
    wins: 14, losses: 3, ties: 0,
    leagueWins: 5, leagueLosses: 1,
    caRank: 360,
    gp: 17,
    teamBavg: .390, teamOBP: .490, teamSLG: .528,
    teamERA: 2.22, teamIP: 110.1
  },
  {
    id: "pioneer-valley",
    name: "Pioneer Valley",
    mascot: "Panthers",
    location: "Santa Maria, CA",
    coach: "Cody Smith",
    colors: "Teal, Black",
    league: "CCAA - Ocean",
    overall: "11-7-2",
    leagueRecord: "4-2",
    wins: 11, losses: 7, ties: 2,
    leagueWins: 4, leagueLosses: 2,
    caRank: 469,
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
    overall: "10-10",
    leagueRecord: "2-2",
    wins: 10, losses: 10, ties: 0,
    leagueWins: 2, leagueLosses: 2,
    caRank: 450,
    gp: 20,
    teamBavg: .322, teamOBP: .402, teamSLG: .376,
    teamERA: 5.36, teamIP: 125.1
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "10-10-1",
    leagueRecord: "5-2",
    wins: 10, losses: 10, ties: 1,
    leagueWins: 5, leagueLosses: 2,
    caRank: 222,
    gp: 21,
    teamBavg: .314, teamOBP: .388, teamSLG: .428,
    teamERA: 3.02, teamIP: 127.2
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "13-9",
    leagueRecord: "7-2",
    wins: 13, losses: 9, ties: 0,
    leagueWins: 7, leagueLosses: 2,
    caRank: 298,
    gp: 22,
    teamBavg: .306, teamOBP: .407, teamSLG: .389,
    teamERA: 3.62, teamIP: 151
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "14-7",
    leagueRecord: "6-4",
    wins: 14, losses: 7, ties: 0,
    leagueWins: 6, leagueLosses: 4,
    caRank: 139,
    gp: 21,
    teamBavg: .346, teamOBP: .454, teamSLG: .475,
    teamERA: 3.69, teamIP: 134.2
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
    caRank: 162,
    gp: 21,
    teamBavg: .301, teamOBP: .383, teamSLG: .405,
    teamERA: 3.80, teamIP: 136.1
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
    overall: "7-9",
    leagueRecord: "1-7",
    wins: 7, losses: 9, ties: 0,
    leagueWins: 1, leagueLosses: 7,
    caRank: 791,
    gp: 16,
    teamBavg: .326, teamOBP: .424, teamSLG: .376,
    teamERA: 4.88, teamIP: 99
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
  buildBatter("Arroyo Grande","A. Winter","Jr",18,.613,39,31,10,19,7,1,0,0,2,1,5,1,.667,.645,1.312),
  buildBatter("Arroyo Grande","R. Servin","Jr",22,.485,89,68,26,33,17,9,1,3,18,8,2,1,.596,.779,1.375),
  buildBatter("Arroyo Grande","O. King","Jr",13,.375,10,8,3,3,1,0,0,0,2,4,0,0,.500,.375,.875),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",21,.324,76,68,15,22,22,1,0,5,4,11,3,1,.382,.559,.941),
  buildBatter("Arroyo Grande","T. Kurth","Sr",18,.345,64,55,9,19,15,6,0,2,5,9,1,1,.403,.564,.967),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",20,.302,53,43,7,13,6,3,0,0,6,7,1,0,.400,.372,.772),
  buildBatter("Arroyo Grande","M. Richwine","Sr",20,.277,55,47,10,13,8,2,0,1,4,14,1,0,.346,.383,.729),
  buildBatter("Arroyo Grande","B. Paz","Fr",20,.289,52,45,12,13,12,2,0,3,5,12,0,1,.353,.533,.886),
  buildBatter("Arroyo Grande","J. Stumph","Jr",19,.320,67,50,13,16,9,3,0,0,12,5,2,0,.469,.380,.849),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",20,.279,48,43,9,12,7,2,0,1,5,10,0,0,.354,.395,.749),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",16,.235,21,17,1,4,3,1,0,0,4,9,0,0,.381,.294,.675),
  buildBatter("Arroyo Grande","J. Ralph","Jr",22,.325,91,80,16,26,9,4,0,1,8,5,2,1,.396,.413,.808),
  buildBatter("Arroyo Grande","K. Warwick","Jr",16,.179,29,28,3,5,2,0,1,0,0,10,0,0,.179,.250,.429),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",13,.263,22,19,8,5,4,0,0,0,2,5,1,0,.364,.263,.627),
  buildBatter("Arroyo Grande","R. Bronson","Sr",15,.280,28,25,3,7,6,0,0,1,2,7,0,0,.333,.400,.733),

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
  buildBatter("Morro Bay","Q. Crotts","Sr",21,.413,82,63,31,26,19,8,1,4,11,10,8,0,.549,.762,1.311),
  buildBatter("Morro Bay","C. White","Sr",20,.393,84,61,17,24,25,2,0,4,11,5,0,12,.417,.623,1.040),
  buildBatter("Morro Bay","E. Brown","Sr",20,.353,57,51,17,18,8,0,0,0,4,2,2,0,.421,.353,.774),
  buildBatter("Morro Bay","C. Wilkinson","Sr",19,.362,70,58,15,21,14,7,1,0,12,12,0,0,.471,.517,.988),
  buildBatter("Morro Bay","T. Gray","Sr",21,.299,74,67,6,20,9,4,0,0,2,8,4,1,.351,.358,.709),
  buildBatter("Morro Bay","J. Deovlet","So",21,.302,75,63,10,19,15,4,0,0,8,4,2,2,.387,.365,.752),
  buildBatter("Morro Bay","E. Davis","Sr",18,.276,61,58,8,16,7,2,0,0,2,13,0,1,.295,.310,.605),
  buildBatter("Morro Bay","C. Waldon","Jr",19,.193,63,57,8,11,5,1,0,0,3,13,3,0,.270,.211,.481),
  buildBatter("Morro Bay","J. Skaggs","Sr",18,.244,44,41,6,10,3,2,0,0,1,6,2,0,.295,.293,.588),
  buildBatter("Morro Bay","C. League","Fr",18,.194,36,31,11,6,4,1,0,0,4,7,0,1,.278,.226,.504),
  buildBatter("Morro Bay","B. Walker","",15,.059,22,17,3,1,0,0,0,0,2,5,3,0,.273,.059,.332),
  buildBatter("Morro Bay","V. Nelson","",5,.000,4,3,1,0,0,0,0,0,0,1,1,0,.250,.000,.250),
  buildBatter("Morro Bay","H. Stow","",3,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),

  // NIPOMO
  buildBatter("Nipomo","J. Anderson","Sr",6,.500,4,4,1,2,0,0,0,0,0,2,0,0,.500,.500,1.000),
  buildBatter("Nipomo","B. Hageman","So",19,.516,76,62,23,32,10,3,0,0,5,6,2,1,.557,.565,1.122),
  buildBatter("Nipomo","E. Silveira-19","Sr",19,.350,72,60,10,21,16,4,0,0,7,8,4,1,.444,.417,.861),
  buildBatter("Nipomo","G. Groshart","Sr",18,.355,70,62,7,22,27,10,0,0,4,4,2,2,.400,.516,.916),
  buildBatter("Nipomo","L. Hobbs","Sr",19,.345,78,58,32,20,4,1,0,0,6,2,13,1,.500,.362,.862),
  buildBatter("Nipomo","L. Hobbs","Fr",19,.302,64,53,6,16,9,2,0,0,8,4,2,0,.413,.340,.753),
  buildBatter("Nipomo","C. Moulden","So",19,.344,71,64,13,22,19,6,0,0,5,8,2,0,.408,.438,.846),
  buildBatter("Nipomo","E. Silveira-3","Sr",19,.298,50,47,8,14,7,1,0,0,2,6,0,1,.320,.319,.639),
  buildBatter("Nipomo","T. Oxley","Sr",18,.211,50,38,7,8,2,1,0,0,9,17,1,1,.367,.237,.604),
  buildBatter("Nipomo","T. Barr","Sr",15,.243,40,37,2,9,6,1,0,0,1,13,1,1,.275,.270,.545),
  buildBatter("Nipomo","H. Roesner","Jr",15,.167,20,18,4,3,1,0,0,0,2,5,0,0,.250,.167,.417),
  buildBatter("Nipomo","K. Simonson","So",17,.182,35,33,2,6,3,0,0,0,0,6,0,2,.171,.182,.353),
  buildBatter("Nipomo","A. Mendoza","Jr",9,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Nipomo","J. Lanier","Sr",5,.000,2,2,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","Z. Garibay","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","F. Callaghan","Jr",4,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","M. Marlett","Jr",3,.000,2,0,1,0,0,0,0,0,1,0,1,0,1.000,.000,1.000),

  // PASO ROBLES
  buildBatter("Paso Robles","M. Garcia","Sr",19,.391,75,64,26,25,12,5,1,0,10,7,1,0,.480,.500,.980),
  buildBatter("Paso Robles","B. Lowry","Jr",19,.404,72,57,15,23,20,3,1,1,11,8,1,3,.486,.544,1.030),
  buildBatter("Paso Robles","T. Freitas","Sr",19,.328,72,64,14,21,13,7,0,0,3,1,3,2,.375,.438,.812),
  buildBatter("Paso Robles","C. Prieto","Jr",19,.340,62,53,13,18,11,6,0,0,4,7,1,2,.383,.453,.836),
  buildBatter("Paso Robles","K. Magdaleno","Jr",8,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","E. Dobroth","Jr",19,.333,73,63,16,21,17,2,1,0,5,10,4,1,.411,.397,.808),
  buildBatter("Paso Robles","E. Rendon","So",18,.295,67,61,12,18,12,4,1,2,2,7,3,1,.343,.492,.835),
  buildBatter("Paso Robles","X. Hermanson","Jr",18,.250,58,48,9,12,11,5,0,0,7,5,1,1,.351,.354,.705),
  buildBatter("Paso Robles","J. Soboleski","Jr",19,.315,61,54,11,17,8,7,1,0,6,11,1,0,.393,.481,.874),
  buildBatter("Paso Robles","G. Berlingeri","Sr",3,.429,7,7,2,3,0,0,0,0,0,2,0,0,.429,.429,.858),
  buildBatter("Paso Robles","C. Glover","Sr",13,.133,22,15,3,2,1,0,0,0,4,6,1,0,.350,.133,.483),
  buildBatter("Paso Robles","C. Contreras","Jr",16,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","E. Nevarez","Jr",5,.400,5,5,1,2,1,2,0,0,0,1,0,0,.400,.800,1.200),
  buildBatter("Paso Robles","J. Lopez","Jr",7,.667,5,3,0,2,0,0,0,0,1,0,0,0,.750,.667,1.417),
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
  buildBatter("Pioneer Valley","I. Garcia","Jr",10,.250,9,8,2,1,0,0,0,0,1,4,0,0,.333,.250,.583),
  buildBatter("Pioneer Valley","U. Ponce","Jr",17,.205,51,44,11,9,9,2,1,0,4,18,2,1,.300,.295,.595),
  buildBatter("Pioneer Valley","E. Ponce","Sr",18,.273,70,55,24,15,1,1,0,1,9,8,5,1,.420,.309,.729),
  buildBatter("Pioneer Valley","J. Lopez","Sr",18,.163,55,49,7,8,9,1,1,1,2,15,1,2,.208,.224,.432),
  buildBatter("Pioneer Valley","K. Owen","Sr",15,.184,43,38,4,7,3,1,0,0,2,5,2,1,.256,.211,.467),
  buildBatter("Pioneer Valley","J. Medina","Jr",12,.118,20,17,2,2,2,0,0,0,2,9,1,0,.211,.118,.329),
  buildBatter("Pioneer Valley","J. Valdez","Jr",13,.167,18,12,5,2,0,0,0,0,3,5,3,0,.444,.167,.611),
  buildBatter("Pioneer Valley","M. Andrade","Jr",15,.194,43,31,7,6,8,1,0,0,8,11,2,2,.390,.226,.616),
  buildBatter("Pioneer Valley","J. Rojas","Sr",13,.111,13,9,1,1,2,0,0,0,3,2,1,0,.385,.111,.496),
  buildBatter("Pioneer Valley","J. Romero","So",2,.500,3,2,1,1,0,0,0,0,1,0,0,0,.667,.500,1.167),
  buildBatter("Pioneer Valley","L. Rodriguez","So",2,.000,4,3,2,0,0,0,0,0,0,2,1,0,.250,.000,.250),
  buildBatter("Pioneer Valley","M. Botello","Jr",5,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Pioneer Valley","J. Beltran","Jr",10,.000,6,4,2,0,0,0,0,0,2,2,1,0,.333,.000,.333),
  buildBatter("Pioneer Valley","D. Dahl","So",2,.000,6,4,0,0,0,0,0,0,0,2,0,0,.333,.000,.333),

  // RIGHETTI
  buildBatter("Righetti","K. Walker","Jr",21,.514,79,70,27,36,19,12,0,3,8,4,0,1,.557,.814,1.371),
  buildBatter("Righetti","G. Cole","So",20,.397,75,63,20,25,5,3,0,0,8,7,0,1,.458,.444,.902),
  buildBatter("Righetti","N. Kesner","Sr",21,.436,77,55,21,24,16,2,1,0,16,12,4,1,.579,.509,1.088),
  buildBatter("Righetti","N. Roberts","Sr",21,.450,77,60,16,27,17,4,1,1,13,6,1,3,.532,.600,1.132),
  buildBatter("Righetti","M. Villegas","So",15,.300,41,30,9,9,7,1,1,1,11,14,0,0,.488,.500,.988),
  buildBatter("Righetti","M. Anderson","Sr",21,.329,86,76,13,25,12,2,0,1,7,10,2,0,.400,.395,.795),
  buildBatter("Righetti","Z. Andersen","So",20,.260,67,50,9,13,14,3,0,5,13,16,3,0,.439,.620,1.059),
  buildBatter("Righetti","N. Verduzco","So",20,.239,60,46,13,11,6,1,0,0,12,12,0,0,.397,.261,.658),
  buildBatter("Righetti","D. Nevarez","Sr",21,.224,61,49,6,11,9,3,0,0,8,13,3,0,.367,.286,.653),
  buildBatter("Righetti","M. Andersen","Jr",15,.296,33,27,2,8,8,2,0,0,3,6,0,2,.344,.370,.714),
  buildBatter("Righetti","J. Rodriguez","Sr",14,.200,11,10,3,2,0,0,0,0,1,4,0,0,.273,.200,.473),
  buildBatter("Righetti","I. Quintanar","Jr",6,.182,13,11,2,2,1,0,0,0,2,4,0,0,.308,.182,.490),
  buildBatter("Righetti","N. Nevarez","Fr",4,.200,6,5,0,1,0,0,0,0,1,0,0,0,.333,.200,.533),
  buildBatter("Righetti","C. Campa","So",6,.333,6,6,1,2,3,1,0,0,0,1,0,0,.333,.500,.833),
  buildBatter("Righetti","E. Barcenas","Sr",5,1.000,3,2,0,2,1,1,0,0,1,0,0,0,1.000,1.500,2.500),
  buildBatter("Righetti","R. Harney","Sr",4,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Righetti","N. Lancor","Sr",18,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  buildBatter("Righetti","D. Tovar","Jr",6,.000,7,5,1,0,0,0,0,0,1,3,1,0,.286,.000,.286),
  buildBatter("Righetti","G. Rodriguez","Sr",11,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","P. Wyatt","Jr",22,.279,84,68,14,19,14,1,0,0,8,5,3,1,.375,.294,.669),
  buildBatter("San Luis Obispo","G. Bramble","Sr",17,.279,66,61,14,17,11,6,0,1,5,11,0,0,.333,.426,.759),
  buildBatter("San Luis Obispo","N. Soderin","Sr",20,.200,20,15,10,3,1,0,0,0,4,7,1,0,.400,.200,.600),
  buildBatter("San Luis Obispo","B. Schafer","Jr",20,.263,61,38,12,10,4,3,0,0,15,5,2,0,.491,.342,.833),
  buildBatter("San Luis Obispo","D. Wilson","Jr",19,.188,17,16,1,3,3,0,0,0,1,3,0,0,.235,.188,.422),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",22,.312,87,80,16,25,11,5,1,0,6,11,0,0,.360,.400,.760),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",22,.311,73,61,13,19,15,2,0,0,7,18,4,0,.417,.344,.761),
  buildBatter("San Luis Obispo","C. Stephens","Jr",22,.324,81,68,16,22,12,3,1,0,13,12,0,0,.432,.397,.829),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","T. Blaney","So",22,.315,66,54,14,17,8,4,0,1,12,11,0,0,.439,.444,.883),
  buildBatter("San Luis Obispo","J. Riley","Jr",22,.418,84,67,8,28,14,3,0,0,15,9,1,1,.524,.463,.987),
  buildBatter("San Luis Obispo","J. Taylor","Sr",21,.312,58,48,9,15,13,2,0,3,10,15,0,0,.431,.542,.973),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",5,.000,6,6,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","F. Avrett","Jr",13,.375,17,16,2,6,8,3,0,0,0,8,0,1,.353,.563,.916),

  // SANTA MARIA
  buildBatter("Santa Maria","Z. Camacho","Fr",2,.500,4,4,2,2,0,1,0,0,0,1,0,0,.500,.750,1.250),
  buildBatter("Santa Maria","J. Reyes","Sr",7,.000,5,5,4,0,1,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("Santa Maria","J. Gaitan","So",8,.000,6,5,1,0,0,0,0,0,1,2,0,0,.167,.000,.167),
  buildBatter("Santa Maria","U. Rodriguez","Fr",15,.233,43,30,11,7,5,1,0,0,11,4,2,0,.465,.267,.732),
  buildBatter("Santa Maria","J. Medina-21","Sr",14,.295,49,44,10,13,7,2,0,0,4,9,1,0,.367,.341,.708),
  buildBatter("Santa Maria","D. Martin","Sr",16,.327,61,49,16,16,9,5,0,0,10,5,2,0,.459,.429,.888),
  buildBatter("Santa Maria","O. Sedano","So",4,.667,5,3,2,2,3,0,0,0,2,0,0,0,.800,.667,1.467),
  buildBatter("Santa Maria","J. Medina-30","Sr",16,.426,61,47,16,20,8,2,1,0,14,10,0,0,.557,.511,1.068),
  buildBatter("Santa Maria","A. Ybarra","Sr",16,.250,52,44,6,11,6,2,0,0,7,9,1,0,.365,.295,.660),
  buildBatter("Santa Maria","J. Calderon","Sr",16,.400,56,50,10,20,8,0,0,0,3,3,1,1,.436,.400,.836),
  buildBatter("Santa Maria","A. Rice","So",16,.286,53,49,9,14,10,0,0,0,2,8,2,0,.340,.286,.626),
  buildBatter("Santa Maria","A. Rice","Fr",15,.289,41,38,4,11,8,3,0,0,3,8,0,0,.341,.368,.709),
  buildBatter("Santa Maria","B. Alejo","Jr",16,.407,60,54,7,22,18,4,0,0,1,5,4,1,.450,.481,.931),
  buildBatter("Santa Maria","I. Barajas","So",3,.000,2,1,1,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Santa Maria","F. Chavez","Sr",12,.308,17,13,2,4,3,0,0,0,3,3,1,0,.471,.308,.779),

  // SANTA YNEZ
  buildBatter("Santa Ynez","M. Skidmore","Sr",17,.333,74,66,23,22,12,8,0,0,6,10,1,0,.397,.455,.852),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",17,.340,71,53,18,18,14,7,1,0,14,6,4,0,.507,.509,1.016),
  buildBatter("Santa Ynez","E. Roberts","So",16,.429,60,49,15,21,13,7,0,0,7,10,3,1,.517,.571,1.088),
  buildBatter("Santa Ynez","T. Jeckell","Jr",17,.429,61,56,23,24,21,7,0,0,5,4,0,0,.475,.554,1.029),
  buildBatter("Santa Ynez","S. Rhea","Jr",16,.279,56,43,14,12,10,1,0,0,6,11,4,1,.407,.302,.709),
  buildBatter("Santa Ynez","J. Glover","Jr",17,.531,73,64,26,34,35,5,3,4,6,8,1,2,.562,.891,1.453),
  buildBatter("Santa Ynez","C. Palmer","Jr",10,.182,19,11,5,2,2,0,0,0,6,4,2,0,.526,.182,.708),
  buildBatter("Santa Ynez","B. Cram","So",17,.377,63,53,17,20,7,0,0,0,8,6,1,0,.468,.377,.845),
  buildBatter("Santa Ynez","K. Heiduk","So",17,.466,72,58,28,27,17,4,1,1,12,11,2,0,.569,.621,1.190),
  buildBatter("Santa Ynez","A. Lewis","Fr",6,.167,16,12,4,2,4,0,0,0,2,2,0,1,.267,.167,.434),
  buildBatter("Santa Ynez","D. Pulido","Sr",17,.420,71,50,23,21,18,5,0,1,14,4,5,2,.563,.580,1.143),

  // ST. JOSEPH
  buildBatter("St. Joseph","A. Bluem","Jr",22,.434,86,76,28,33,17,8,0,6,7,2,3,0,.500,.776,1.276),
  buildBatter("St. Joseph","E. Hendricks","So",17,.296,35,27,11,8,0,1,0,0,6,1,2,0,.457,.333,.790),
  buildBatter("St. Joseph","C. Chanley","Sr",22,.359,83,64,14,23,14,4,1,2,7,1,10,2,.482,.547,1.029),
  buildBatter("St. Joseph","L. Woodruff","So",19,.262,49,42,8,11,14,3,0,1,3,11,2,0,.340,.405,.745),
  buildBatter("St. Joseph","C. Goncalves","Jr",22,.297,78,64,10,19,16,3,0,0,7,12,5,2,.397,.344,.741),
  buildBatter("St. Joseph","M. Majewski","Jr",21,.286,63,49,8,14,7,3,0,0,9,10,4,0,.435,.347,.782),
  buildBatter("St. Joseph","M. O'Keefe","Jr",17,.257,45,35,6,9,7,1,0,1,7,9,1,1,.386,.371,.757),
  buildBatter("St. Joseph","S. Covarrubias","Sr",20,.189,76,53,15,10,3,2,0,0,19,14,3,0,.427,.226,.653),
  buildBatter("St. Joseph","M. Kon","Sr",15,.275,48,40,2,11,8,0,0,0,4,12,3,1,.375,.275,.650),
  buildBatter("St. Joseph","X. Horta","So",21,.200,61,50,3,10,7,1,0,0,6,7,0,3,.271,.220,.491),
  buildBatter("St. Joseph","R. Roemling","Sr",14,.148,34,27,2,4,0,1,0,0,5,7,1,1,.303,.185,.488),
  buildBatter("St. Joseph","S. Grupe","So",9,.300,12,10,2,3,2,0,0,0,1,1,1,0,.417,.300,.717),
  buildBatter("St. Joseph","J. Chavez","So",21,.062,17,16,5,1,1,0,0,0,1,2,0,0,.118,.063,.180),
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
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.45,0,0,29,20,14,6,5,26,7),
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.32,0,0,22,12,4,1,6,11,10),
  buildPitcher("Arroyo Grande","G. Pope","Sr",1.27,0,0,33,22,13,6,15,25,9),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.00,0,0,4.1,4,0,0,3,4,4),
  buildPitcher("Arroyo Grande","O. King","Jr",1.87,0,0,15,11,7,4,9,20,7),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",2.55,0,0,22,12,8,8,8,17,6),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.85,0,0,20,19,22,11,17,13,6),
  buildPitcher("Arroyo Grande","J. Ralph","Jr",0,0,0,0,3,4,3,1,0,1),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0,0,0,0,2,2,1,0,0,1),

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
  buildPitcher("Morro Bay","C. Wilkinson","Sr",2.14,3,1,32.2,28,18,10,7,24,9),
  buildPitcher("Morro Bay","E. Davis","Sr",5.18,3,2,24.1,27,22,18,10,13,9),
  buildPitcher("Morro Bay","C. White","Sr",5.56,1,1,11.1,15,9,9,2,10,9),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","J. Skaggs","Sr",2.33,0,0,3,2,1,1,2,1,2),
  buildPitcher("Morro Bay","H. Stow","",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Deovlet","So",2.80,0,0,5,6,2,2,2,3,2),
  buildPitcher("Morro Bay","C. League","Fr",5.56,1,0,11.1,15,13,9,6,11,6),
  buildPitcher("Morro Bay","M. Miner","Jr",52.50,0,0,0.2,17,9,5,4,1,2),

  // NIPOMO
  buildPitcher("Nipomo","E. Silveira-19","Sr",2.60,6,2,37.2,27,23,14,21,37,9),
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
  buildPitcher("Paso Robles","N. Contreras","Jr",2.96,2,1,26,29,18,11,10,26,7),
  buildPitcher("Paso Robles","T. Freitas","Sr",3.62,1,0,19.1,18,18,10,10,20,7),
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
  buildPitcher("Pioneer Valley","J. Romero","So",2.10,0,0,3.1,2,2,1,1,0,1),

  // RIGHETTI
  buildPitcher("Righetti","I. Rocha","So",2.68,4,1,34,44,16,13,12,22,8),
  buildPitcher("Righetti","K. Walker","Jr",2.62,3,0,24,25,14,9,7,23,6),
  buildPitcher("Righetti","G. Rodriguez","Sr",4.53,2,1,29.1,31,23,19,11,12,10),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","N. Lancor","Sr",4.38,3,2,24,26,20,15,11,20,11),
  buildPitcher("Righetti","E. Barcenas","Sr",7.00,0,0,2,0,2,2,3,3,1),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  buildPitcher("Righetti","A. Stevens","Fr",0.00,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","M. Anderson","Sr",3.36,1,0,8.1,5,5,4,6,5,3),
  buildPitcher("Righetti","C. Viker","Sr",6.00,0,0,2.1,4,6,2,4,2,3),

  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.25,6,1,36.2,34,21,17,15,21,7),
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
  buildPitcher("Santa Maria","D. Martin","Sr",4.41,0,0,33.1,39,22,21,11,38,8),
  buildPitcher("Santa Maria","J. Medina-30","Sr",5.17,0,0,21.2,22,27,16,26,39,10),
  buildPitcher("Santa Maria","A. Ybarra","Sr",0.00,0,0,1,1,0,0,0,0,1),
  buildPitcher("Santa Maria","J. Calderon","Sr",4.67,0,0,3,2,2,2,4,3,2),
  buildPitcher("Santa Maria","A. Rice","Fr",19.09,0,0,3.2,12,15,10,5,2,3),
  buildPitcher("Santa Maria","B. Alejo","Jr",1.79,0,0,15.2,13,10,4,5,9,6),

  // SANTA YNEZ
  buildPitcher("Santa Ynez","E. Roberts","So",1.64,3,0,25.2,25,6,6,5,33,7),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",2.01,5,2,45.1,33,22,13,21,74,9),
  buildPitcher("Santa Ynez","S. Rhea","Jr",4.67,0,0,3,1,2,2,4,4,2),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.36,0,0,8.1,8,7,4,7,16,4),
  buildPitcher("Santa Ynez","C. Palmer","Jr",1.71,3,0,16.1,5,5,4,11,22,4),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.83,1,0,7.2,5,2,2,4,9,6),
  buildPitcher("Santa Ynez","A. Lewis","Fr",7.00,0,0,4,5,5,4,4,4,2),

  // ST. JOSEPH
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.66,0,0,10.2,6,9,1,9,7,7),
  buildPitcher("St. Joseph","L. Woodruff","So",2.54,5,0,30.1,21,13,11,9,24,10),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.16,6,2,45.1,38,21,14,10,57,9),
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
    { abbr:"SJ",  name:"St. Joseph",          lw:9, ll:1, ow:17, ol:4,  ot:1 },
    { abbr:"RHS", name:"Righetti",             lw:6, ll:4, ow:14, ol:7,  ot:0 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:5, ll:5, ow:14, ol:8,  ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:4, ll:5, ow:13, ol:7,  ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:4, ll:5, ow:10, ol:7,  ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:1, ll:8, ow:9,  ol:12, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:7, ll:2, ow:13, ol:9,  ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:5, ll:2, ow:10, ol:10, ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:4, ll:5, ow:7,  ol:14, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:2, ll:5, ow:9,  ol:13, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:6, ow:5,  ol:16, ot:0 },
  ],
  ocean: [
    { abbr:"SY",  name:"Santa Ynez",     lw:5, ll:1, ow:14, ol:3,  ot:0 },
    { abbr:"PV",  name:"Pioneer Valley", lw:4, ll:2, ow:11, ol:7,  ot:2 },
    { abbr:"NIP", name:"Nipomo",         lw:2, ll:2, ow:10, ol:10, ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:1, ll:7, ow:7,  ol:9,  ot:0 },
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
