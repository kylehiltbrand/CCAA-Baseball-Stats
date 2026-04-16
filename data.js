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
const DATA_UPDATED = "2026-04-16"; // YYYY-MM-DD — stats through April 15

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
    overall: "15-4-1",
    leagueRecord: "7-1",
    wins: 15, losses: 4, ties: 1,
    leagueWins: 7, leagueLosses: 1,
    caRank: 36,
    gp: 20,
    teamBavg: .274, teamOBP: .396, teamSLG: .380,
    teamERA: 2.49, teamIP: 135
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "14-6",
    leagueRecord: "5-3",
    wins: 14, losses: 6, ties: 0,
    leagueWins: 5, leagueLosses: 3,
    caRank: 76,
    gp: 20,
    teamBavg: .342, teamOBP: .427, teamSLG: .491,
    teamERA: 1.89, teamIP: 129.1
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
    overall: "9-9",
    leagueRecord: "2-1",
    wins: 9, losses: 9, ties: 0,
    leagueWins: 2, leagueLosses: 1,
    caRank: 406,
    gp: 18,
    teamBavg: .321, teamOBP: .398, teamSLG: .374,
    teamERA: 5.52, teamIP: 111.2
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "10-8-1",
    leagueRecord: "5-1",
    wins: 10, losses: 8, ties: 1,
    leagueWins: 5, leagueLosses: 1,
    caRank: 169,
    gp: 18,
    teamBavg: .328, teamOBP: .403, teamSLG: .445,
    teamERA: 2.56, teamIP: 106.2
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
    overall: "12-6",
    leagueRecord: "5-3",
    wins: 12, losses: 6, ties: 0,
    leagueWins: 5, leagueLosses: 3,
    caRank: 135,
    gp: 18,
    teamBavg: .348, teamOBP: .458, teamSLG: .484,
    teamERA: 3.48, teamIP: 114.2
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "12-7",
    leagueRecord: "3-5",
    wins: 12, losses: 7, ties: 0,
    leagueWins: 3, leagueLosses: 5,
    caRank: 183,
    gp: 19,
    teamBavg: .301, teamOBP: .388, teamSLG: .400,
    teamERA: 4.01, teamIP: 122.1
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "9-11",
    leagueRecord: "1-7",
    wins: 9, losses: 11, ties: 0,
    leagueWins: 1, leagueLosses: 7,
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
    overall: "8-11",
    leagueRecord: "1-3",
    wins: 8, losses: 11, ties: 0,
    leagueWins: 1, leagueLosses: 3,
    caRank: 556,
    gp: 16,
    teamBavg: .275, teamOBP: .383, teamSLG: .354,
    teamERA: 3.82, teamIP: 108
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "S.D. Harrow",
    colors: "Navy, Vegas Gold",
    league: "CCAA - Mountain",
    overall: "9-7",
    leagueRecord: "3-5",
    wins: 9, losses: 7, ties: 0,
    leagueWins: 3, leagueLosses: 5,
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
    overall: "5-12",
    leagueRecord: "2-4",
    wins: 5, losses: 12, ties: 0,
    leagueWins: 2, leagueLosses: 4,
    caRank: 637,
    gp: 17,
    teamBavg: .214, teamOBP: .378, teamSLG: .281,
    teamERA: 5.12, teamIP: 109.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "5-7",
    leagueRecord: "0-5",
    wins: 5, losses: 7, ties: 0,
    leagueWins: 0, leagueLosses: 5,
    caRank: 763,
    gp: 12,
    teamBavg: .322, teamOBP: .433, teamSLG: .370,
    teamERA: 4.18, teamIP: 77
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
  buildBatter("Arroyo Grande","R. Servin","Jr",20,.468,80,62,22,29,17,9,0,3,16,8,1,1,.575,.758,1.333),
  buildBatter("Arroyo Grande","O. King","Jr",11,.375,10,8,3,3,1,0,0,0,2,4,0,0,.500,.375,.875),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",19,.333,68,60,13,20,17,1,0,4,4,9,3,1,.397,.550,.947),
  buildBatter("Arroyo Grande","T. Kurth","Sr",16,.333,56,48,9,16,14,6,0,2,5,8,1,1,.400,.583,.983),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",18,.351,46,37,7,13,5,3,0,0,5,5,1,0,.442,.432,.874),
  buildBatter("Arroyo Grande","M. Richwine","Sr",18,.293,48,41,10,12,8,2,0,1,4,11,0,0,.356,.415,.771),
  buildBatter("Arroyo Grande","B. Paz","Fr",18,.316,43,38,10,12,12,2,0,3,4,10,0,1,.372,.605,.977),
  buildBatter("Arroyo Grande","J. Stumph","Jr",17,.289,60,45,13,13,9,3,0,0,11,5,2,0,.448,.356,.804),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",18,.297,42,37,9,11,7,2,0,1,5,9,0,0,.381,.432,.813),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",14,.235,21,17,1,4,3,1,0,0,4,9,0,0,.381,.294,.675),
  buildBatter("Arroyo Grande","J. Ralph","Jr",20,.333,81,72,15,24,9,4,0,1,6,5,2,1,.395,.431,.826),
  buildBatter("Arroyo Grande","K. Warwick","Jr",15,.185,28,27,3,5,1,0,1,0,0,10,0,0,.185,.259,.444),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",11,.294,20,17,8,5,4,0,0,0,2,5,1,0,.400,.294,.694),
  buildBatter("Arroyo Grande","R. Bronson","Sr",13,.304,26,23,3,7,6,0,0,1,2,5,0,0,.360,.435,.795),

  // ATASCADERO
  buildBatter("Atascadero","M. Cullen","Jr",10,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","W. Witt","Sr",17,.250,68,44,14,11,5,4,0,1,22,15,2,0,.515,.409,.924),
  buildBatter("Atascadero","A. Donaldson","So",13,.241,39,29,4,7,1,0,0,0,8,10,1,0,.421,.241,.662),
  buildBatter("Atascadero","W. Litten","Sr",18,.333,67,54,8,18,14,4,1,0,6,13,7,0,.463,.444,.907),
  buildBatter("Atascadero","S. Ernst","Sr",13,.233,33,30,4,7,3,1,0,0,3,16,0,0,.303,.267,.570),
  buildBatter("Atascadero","D. Mitchell","Sr",13,.191,51,47,6,9,5,2,1,0,2,8,2,0,.255,.277,.532),
  buildBatter("Atascadero","E. Wanner","Sr",17,.140,63,43,10,6,5,0,0,0,14,6,2,1,.367,.140,.507),
  buildBatter("Atascadero","W. Azelton","So",18,.178,62,45,6,8,9,3,1,0,10,17,5,2,.371,.289,.660),
  buildBatter("Atascadero","M. Beck","Jr",18,.160,30,25,7,4,2,0,0,0,4,7,1,0,.300,.160,.460),
  buildBatter("Atascadero","J. Litten","So",18,.238,55,42,5,10,6,2,0,0,6,13,4,2,.370,.286,.656),
  buildBatter("Atascadero","M. Zepeda","Sr",18,.190,54,42,5,8,5,2,1,0,8,9,0,4,.320,.286,.606),
  buildBatter("Atascadero","R. Brown","Sr",12,.154,13,13,2,2,0,0,0,0,0,4,0,0,.154,.154,.308),
  buildBatter("Atascadero","V. Rivera","Sr",5,.250,5,4,1,1,1,0,0,0,1,2,0,0,.400,.250,.650),

  // CABRILLO
  buildBatter("Cabrillo","M. Koff","Sr",19,.333,57,45,12,15,7,5,0,0,6,7,2,0,.434,.444,.878),
  buildBatter("Cabrillo","J. Clark","So",18,.314,44,35,6,11,7,1,0,0,4,15,1,1,.390,.343,.733),
  buildBatter("Cabrillo","J. Low","Sr",17,.241,36,29,2,7,2,3,0,0,4,4,0,2,.389,.345,.734),
  buildBatter("Cabrillo","L. Vorce","Jr",12,.281,36,32,3,9,2,0,0,0,3,1,0,1,.343,.281,.624),
  buildBatter("Cabrillo","F. Lopez","Sr",20,.250,66,56,9,14,5,2,0,0,6,17,2,1,.338,.286,.624),
  buildBatter("Cabrillo","G. Barraza","Sr",20,.328,69,61,13,20,5,0,0,0,5,8,2,1,.391,.328,.719),
  buildBatter("Cabrillo","C. Powell","Jr",20,.194,69,62,11,12,3,4,0,0,7,9,0,0,.275,.258,.533),
  buildBatter("Cabrillo","F. Hernandez","Jr",20,.254,69,63,8,16,7,2,2,0,3,13,2,1,.304,.349,.653),
  buildBatter("Cabrillo","L. Ragoza","Jr",15,.211,22,19,3,4,1,0,0,0,2,7,1,0,.318,.211,.529),
  buildBatter("Cabrillo","C. Sunndeniyage","Jr",19,.250,39,36,3,9,0,0,0,0,2,9,0,1,.289,.250,.539),
  buildBatter("Cabrillo","I. Lopez","So",10,.042,29,24,1,1,2,0,0,0,3,6,1,1,.179,.042,.221),
  buildBatter("Cabrillo","A. Torres","Sr",10,.053,19,19,0,1,0,0,0,0,7,2,0,0,.053,.053,.106),

  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",19,.446,74,56,28,25,19,8,1,4,10,9,8,0,.581,.839,1.420),
  buildBatter("Morro Bay","C. White","Sr",18,.389,77,54,15,21,19,2,0,2,11,4,0,12,.416,.537,.953),
  buildBatter("Morro Bay","E. Brown","Sr",18,.391,51,46,15,18,8,0,0,0,3,1,2,0,.451,.391,.842),
  buildBatter("Morro Bay","C. Wilkinson","Sr",17,.392,63,51,14,20,14,6,1,0,12,10,0,0,.508,.549,1.057),
  buildBatter("Morro Bay","T. Gray","Sr",19,.311,68,61,6,19,9,4,0,0,2,8,4,1,.368,.377,.745),
  buildBatter("Morro Bay","J. Deovlet","So",19,.263,69,57,9,15,14,3,0,0,8,4,2,2,.362,.316,.678),
  buildBatter("Morro Bay","E. Davis","Sr",16,.231,55,52,8,12,7,2,0,0,2,13,0,1,.255,.269,.524),
  buildBatter("Morro Bay","C. Waldon","Jr",17,.216,57,51,8,11,5,1,0,0,3,10,3,0,.298,.235,.533),
  buildBatter("Morro Bay","J. Skaggs","Sr",16,.200,38,35,5,7,2,2,0,0,1,5,2,0,.263,.257,.520),
  buildBatter("Morro Bay","C. League","Fr",16,.194,36,31,11,6,4,1,0,0,4,7,0,1,.278,.226,.504),
  buildBatter("Morro Bay","B. Walker","",13,.059,22,17,3,1,0,0,0,0,2,5,3,0,.273,.059,.332),

  // NIPOMO
  buildBatter("Nipomo","J. Anderson","Sr",6,.500,4,4,1,2,0,0,0,0,0,2,0,0,.500,.500,1.000),
  buildBatter("Nipomo","B. Hageman","So",17,.518,68,56,20,29,9,3,0,0,4,6,2,1,.556,.571,1.127),
  buildBatter("Nipomo","E. Silveira","Sr",17,.352,64,54,8,19,13,3,0,0,6,8,4,0,.453,.407,.860),
  buildBatter("Nipomo","G. Groshart","Sr",16,.345,64,58,7,20,25,9,0,0,3,4,2,1,.391,.500,.891),
  buildBatter("Nipomo","L. Hobbs","Sr",17,.352,69,54,28,19,4,1,0,0,5,2,9,1,.478,.370,.848),
  buildBatter("Nipomo","L. Hobbs","Fr",17,.312,57,48,5,15,9,2,0,0,7,4,1,0,.411,.354,.765),
  buildBatter("Nipomo","C. Moulden","So",17,.345,63,58,12,20,17,6,0,0,3,7,2,0,.397,.448,.845),
  buildBatter("Nipomo","E. Silveira","Sr",17,.298,50,47,8,14,7,1,0,0,2,6,0,1,.320,.319,.639),
  buildBatter("Nipomo","T. Oxley","Sr",16,.188,43,32,6,6,2,1,0,0,9,14,1,1,.372,.219,.591),
  buildBatter("Nipomo","T. Barr","Sr",13,.233,33,30,2,7,5,0,0,0,1,11,1,1,.273,.233,.506),
  buildBatter("Nipomo","H. Roesner","Jr",14,.176,19,17,4,3,1,0,0,0,2,5,0,0,.263,.176,.439),
  buildBatter("Nipomo","K. Simonson","So",15,.148,28,27,2,4,2,0,0,0,0,5,0,1,.143,.148,.291),
  buildBatter("Nipomo","A. Mendoza","Jr",9,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Nipomo","J. Lanier","Sr",5,.000,2,2,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","Z. Garibay","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // PASO ROBLES
  buildBatter("Paso Robles","M. Garcia","Sr",16,.407,64,54,22,22,9,4,1,0,9,5,1,0,.500,.519,1.019),
  buildBatter("Paso Robles","B. Lowry","Jr",16,.408,62,49,13,20,18,3,1,0,10,7,0,3,.484,.510,.994),
  buildBatter("Paso Robles","T. Freitas","Sr",16,.333,61,54,13,18,12,6,0,0,3,0,3,1,.393,.444,.837),
  buildBatter("Paso Robles","C. Prieto","Jr",16,.348,53,46,12,16,10,5,0,0,3,6,1,2,.385,.457,.842),
  buildBatter("Paso Robles","K. Magdaleno","Jr",8,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","E. Dobroth","Jr",16,.358,62,53,15,19,14,2,1,0,5,9,4,0,.452,.434,.886),
  buildBatter("Paso Robles","E. Rendon","So",15,.308,58,52,12,16,11,4,1,2,2,6,3,1,.362,.538,.900),
  buildBatter("Paso Robles","X. Hermanson","Jr",15,.293,49,41,8,12,11,5,0,0,5,5,1,1,.375,.415,.790),
  buildBatter("Paso Robles","J. Soboleski","Jr",16,.311,52,45,10,14,8,6,1,0,6,10,1,0,.404,.489,.893),
  buildBatter("Paso Robles","G. Berlingeri","Sr",2,.600,5,5,2,3,0,0,0,0,0,1,0,0,.600,.600,1.200),

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
  buildBatter("Righetti","K. Walker","Jr",18,.534,67,58,23,31,17,11,0,3,8,3,0,1,.582,.879,1.461),
  buildBatter("Righetti","G. Cole","So",18,.429,68,56,20,24,5,3,0,0,8,7,0,1,.492,.482,.974),
  buildBatter("Righetti","N. Kesner","Sr",18,.447,65,47,17,21,15,2,1,0,14,9,2,1,.578,.532,1.110),
  buildBatter("Righetti","N. Roberts","Sr",18,.458,65,48,15,22,16,4,1,1,13,4,1,3,.554,.646,1.200),
  buildBatter("Righetti","M. Villegas","So",12,.333,33,24,8,8,6,1,1,1,9,12,0,0,.515,.583,1.098),
  buildBatter("Righetti","M. Anderson","Sr",18,.318,74,66,12,21,9,1,0,1,6,9,2,0,.392,.379,.771),
  buildBatter("Righetti","Z. Andersen","So",17,.214,55,42,6,9,10,3,0,3,10,16,2,0,.389,.500,.889),
  buildBatter("Righetti","N. Verduzco","So",18,.250,53,40,11,10,6,1,0,0,11,10,0,0,.412,.275,.687),
  buildBatter("Righetti","D. Nevarez","Sr",18,.233,53,43,5,10,9,3,0,0,7,12,3,0,.377,.302,.679),
  buildBatter("Righetti","M. Andersen","Jr",12,.222,21,18,2,4,6,2,0,0,1,3,0,1,.250,.333,.583),

  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","P. Wyatt","Jr",20,.274,75,62,13,17,14,1,0,0,6,4,3,1,.361,.290,.651),
  buildBatter("San Luis Obispo","G. Bramble","Sr",15,.263,62,57,13,15,9,5,0,1,5,11,0,0,.323,.404,.727),
  buildBatter("San Luis Obispo","N. Soderin","Sr",18,.200,20,15,8,3,1,0,0,0,4,7,1,0,.400,.200,.600),
  buildBatter("San Luis Obispo","B. Schafer","Jr",18,.212,53,33,10,7,2,3,0,0,14,4,1,0,.458,.303,.761),
  buildBatter("San Luis Obispo","D. Wilson","Jr",17,.231,14,13,1,3,3,0,0,0,1,1,0,0,.286,.231,.517),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",20,.315,79,73,14,23,10,5,1,0,5,11,0,0,.359,.411,.770),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",20,.345,66,55,13,19,15,2,0,0,6,15,4,1,.446,.382,.828),
  buildBatter("San Luis Obispo","C. Stephens","Jr",20,.328,72,61,15,20,12,3,1,0,11,12,0,0,.431,.410,.841),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","T. Blaney","So",20,.298,59,47,13,14,7,3,0,1,12,10,0,0,.441,.426,.867),
  buildBatter("San Luis Obispo","J. Riley","Jr",20,.433,76,60,8,26,13,3,0,0,14,8,1,1,.539,.483,1.022),
  buildBatter("San Luis Obispo","J. Taylor","Sr",19,.302,51,43,9,13,11,2,0,3,8,13,0,0,.412,.558,.970),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",5,.000,6,6,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","F. Avrett","Jr",13,.375,17,16,2,6,8,3,0,0,0,8,0,1,.353,.563,.916),

  // SANTA MARIA
  buildBatter("Santa Maria","O. Sedano","So",3,.667,5,3,1,2,3,0,0,0,2,0,0,0,.800,.667,1.467),
  buildBatter("Santa Maria","B. Alejo","Jr",13,.386,49,44,5,17,12,3,0,0,1,4,4,0,.449,.455,.904),
  buildBatter("Santa Maria","J. Calderon","Sr",13,.425,46,40,8,17,7,0,0,0,3,2,1,1,.467,.425,.892),
  buildBatter("Santa Maria","J. Medina","Sr",13,.447,50,38,15,17,8,1,1,0,12,8,0,0,.580,.526,1.106),
  buildBatter("Santa Maria","D. Martin","Sr",13,.282,50,39,13,11,6,3,0,0,9,4,2,0,.440,.359,.799),
  buildBatter("Santa Maria","A. Ybarra","Sr",13,.278,44,36,6,10,6,2,0,0,7,8,1,0,.409,.333,.742),
  buildBatter("Santa Maria","A. Rice","So",13,.325,44,40,7,13,9,0,0,0,2,6,2,0,.386,.325,.711),
  buildBatter("Santa Maria","A. Rice","Fr",12,.276,32,29,3,8,7,2,0,0,3,7,0,0,.344,.345,.689),
  buildBatter("Santa Maria","J. Medina","Sr",13,.244,45,41,9,10,6,2,0,0,4,9,0,0,.311,.293,.604),
  buildBatter("Santa Maria","U. Rodriguez","Fr",13,.185,37,27,10,5,4,1,0,0,8,4,2,0,.405,.222,.627),

  // SANTA YNEZ
  buildBatter("Santa Ynez","J. Glover","Jr",15,.492,66,59,22,29,28,4,2,2,4,8,1,2,.515,.729,1.244),
  buildBatter("Santa Ynez","K. Heiduk","So",15,.451,64,51,23,23,14,3,1,0,12,11,1,0,.562,.549,1.111),
  buildBatter("Santa Ynez","D. Pulido","Sr",15,.426,65,47,22,20,16,5,0,1,13,4,4,1,.569,.596,1.165),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",15,.370,64,46,18,17,13,6,1,0,14,6,4,0,.547,.543,1.090),
  buildBatter("Santa Ynez","E. Roberts","So",14,.429,53,42,12,18,12,6,0,0,7,8,3,1,.528,.571,1.099),
  buildBatter("Santa Ynez","B. Cram","So",15,.383,56,47,15,18,7,0,0,0,7,6,1,0,.473,.383,.856),
  buildBatter("Santa Ynez","T. Jeckell","Jr",15,.420,54,50,19,21,19,6,0,0,4,4,0,0,.463,.540,1.003),
  buildBatter("Santa Ynez","M. Skidmore","Sr",15,.322,67,59,21,19,12,6,0,0,6,10,1,1,.394,.424,.818),
  buildBatter("Santa Ynez","S. Rhea","Jr",15,.286,55,42,14,12,10,1,0,0,6,11,4,1,.415,.310,.725),

  // ST. JOSEPH
  buildBatter("St. Joseph","A. Bluem","Jr",20,.426,78,68,26,29,14,7,0,5,7,2,3,0,.500,.750,1.250),
  buildBatter("St. Joseph","E. Hendricks","So",16,.348,30,23,11,8,0,1,0,0,6,1,1,0,.500,.391,.891),
  buildBatter("St. Joseph","C. Chanley","Sr",20,.375,75,56,14,21,13,4,1,2,7,1,10,2,.507,.589,1.096),
  buildBatter("St. Joseph","L. Woodruff","So",18,.263,45,38,7,10,14,3,0,1,3,10,2,0,.349,.421,.770),
  buildBatter("St. Joseph","C. Goncalves","Jr",20,.310,70,58,9,18,16,3,0,0,6,11,4,2,.400,.362,.762),
  buildBatter("St. Joseph","M. Majewski","Jr",19,.279,55,43,7,12,7,3,0,0,8,9,3,0,.426,.349,.775),
  buildBatter("St. Joseph","M. O'Keefe","Jr",16,.273,42,33,5,9,7,1,0,1,7,9,1,1,.405,.394,.799),
  buildBatter("St. Joseph","S. Covarrubias","Sr",18,.152,68,46,15,7,1,1,0,0,19,12,2,0,.418,.174,.592),
  buildBatter("St. Joseph","M. Kon","Sr",13,.265,40,34,1,9,8,0,0,0,4,8,1,1,.350,.265,.615),
  buildBatter("St. Joseph","X. Horta","So",19,.191,58,47,3,9,7,1,0,0,6,7,0,3,.268,.213,.481),
  buildBatter("St. Joseph","R. Roemling","Sr",14,.148,34,27,2,4,0,1,0,0,5,7,1,0,.303,.185,.488),

  // TEMPLETON
  buildBatter("Templeton","L. Stetz","Sr",18,.407,67,59,13,24,13,3,3,0,4,6,4,1,.478,.559,1.037),
  buildBatter("Templeton","C. Sims","Jr",19,.418,72,67,20,28,6,2,2,0,2,7,3,2,.458,.507,.965),
  buildBatter("Templeton","L. Rivera","Jr",19,.375,75,64,16,24,14,3,1,0,7,6,1,2,.432,.453,.885),
  buildBatter("Templeton","N. Argain","Sr",15,.240,29,25,3,6,3,1,0,0,2,4,0,2,.296,.280,.576),
  buildBatter("Templeton","W. Patch","Sr",10,.286,16,14,3,4,1,1,0,0,2,6,0,0,.375,.357,.732),
  buildBatter("Templeton","L. Olsen","Sr",20,.262,81,61,17,16,6,5,0,0,15,15,4,1,.432,.344,.776),
  buildBatter("Templeton","J. Beckwith","So",20,.311,58,45,8,14,11,2,0,0,8,8,2,0,.436,.356,.792),
  buildBatter("Templeton","N. Capaci","Jr",19,.279,55,43,9,12,4,2,0,0,8,16,2,1,.407,.326,.733),
  buildBatter("Templeton","R. Garcia","Jr",14,.240,28,25,4,6,3,0,1,1,3,8,0,0,.321,.440,.761),
  buildBatter("Templeton","C. Hamilton","So",17,.167,48,36,3,6,6,1,0,0,9,18,2,1,.354,.194,.548),

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
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",0.88,0,0,24,13,6,3,4,23,5),
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.38,0,0,18.2,9,4,1,6,9,9),
  buildPitcher("Arroyo Grande","G. Pope","Sr",0.93,0,0,30,18,10,4,12,20,8),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.00,0,0,4.1,4,0,0,3,4,4),
  buildPitcher("Arroyo Grande","O. King","Jr",2.03,0,0,10.1,8,5,3,5,14,5),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",2.55,0,0,22,12,8,8,8,17,6),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.85,0,0,20,19,22,11,17,13,6),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),

  // ATASCADERO
  buildPitcher("Atascadero","W. Azelton","So",3.09,2,2,31.2,38,20,14,9,29,8),
  buildPitcher("Atascadero","W. Witt","Sr",4.50,1,3,28,33,25,18,15,17,10),
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
  buildPitcher("Cabrillo","M. Koff","Sr",6.30,0,1,13.1,16,13,12,12,15,8),
  buildPitcher("Cabrillo","I. Lopez","So",10.50,0,1,6,12,13,9,4,5,3),
  buildPitcher("Cabrillo","L. Vorce","Jr",28.00,0,1,1,1,5,4,5,0,1),

  // MORRO BAY
  buildPitcher("Morro Bay","E. Brown","Sr",2.94,3,3,33.1,36,18,14,8,32,11),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",2.20,3,1,28.2,24,16,9,6,21,8),
  buildPitcher("Morro Bay","E. Davis","Sr",5.48,3,2,23,27,22,18,10,12,7),
  buildPitcher("Morro Bay","C. White","Sr",5.56,1,1,11.1,15,9,9,2,10,9),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","J. Skaggs","Sr",2.33,0,0,3,2,1,1,2,1,2),
  buildPitcher("Morro Bay","H. Stow","Sr",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Deovlet","So",2.80,0,0,5,6,2,2,2,3,2),
  buildPitcher("Morro Bay","C. League","Fr",6.75,1,0,9.1,13,12,9,6,8,5),

  // NIPOMO
  buildPitcher("Nipomo","E. Silveira","Sr",2.79,5,2,32.2,23,22,13,20,34,8),
  buildPitcher("Nipomo","E. Silveira","Sr",6.30,2,2,23.1,25,31,21,24,27,8),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.50,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","G. Groshart","Sr",7.00,0,2,12,15,17,12,15,12,5),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.42,1,1,12,15,14,11,15,4,5),
  buildPitcher("Nipomo","K. Simonson","So",6.00,0,0,2.1,1,2,2,3,2,2),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.25,0,0,8,18,7,6,5,4,4),
  buildPitcher("Nipomo","Z. Garibay","Sr",7.87,0,0,2.2,5,3,3,1,1,3),
  buildPitcher("Nipomo","F. Callaghan","Jr",5.25,0,0,4,5,3,3,4,3,2),

  // PASO ROBLES
  buildPitcher("Paso Robles","E. Rendon","So",1.50,4,0,23.1,9,6,5,27,43,8),
  buildPitcher("Paso Robles","M. Garcia","Sr",1.56,0,0,9,3,2,2,5,16,7),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.24,2,1,25,25,15,8,9,26,6),
  buildPitcher("Paso Robles","T. Freitas","Sr",2.68,1,0,15.2,11,13,6,9,15,5),
  buildPitcher("Paso Robles","B. Lowry","Jr",5.83,0,0,12,12,13,10,4,16,6),
  buildPitcher("Paso Robles","S. Roby","Sr",4.00,0,0,14,16,10,8,9,8,5),
  buildPitcher("Paso Robles","J. Soboleski","Jr",1.11,0,0,6.1,2,2,1,4,2,4),

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
  buildPitcher("Righetti","G. Rodriguez","Sr",3.69,2,0,24.2,23,17,13,9,10,9),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","N. Lancor","Sr",4.85,3,2,21.2,24,19,15,11,17,9),
  buildPitcher("Righetti","E. Barcenas","Sr",7.00,0,0,2,0,2,2,3,3,1),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  buildPitcher("Righetti","A. Stevens","Fr",0.00,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","M. Anderson","Sr",2.33,0,0,3,3,2,1,0,1,2),
  buildPitcher("Righetti","C. Viker","Sr",6.00,0,0,2.1,4,6,2,4,2,3),

  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.54,5,1,29.2,29,18,15,10,19,6),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",13.12,0,0,5.1,11,11,10,3,4,5),
  buildPitcher("San Luis Obispo","L. Drenckpohl","Sr",18.00,0,0,2.1,2,6,6,6,1,1),
  buildPitcher("San Luis Obispo","T. Blaney","So",3.00,1,0,7,11,6,3,2,1,3),
  buildPitcher("San Luis Obispo","J. Riley","Jr",2.76,1,2,25.1,25,17,10,7,20,7),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.87,3,4,39,44,24,16,16,46,8),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",3.15,0,0,6.2,8,7,3,6,3,7),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",4.28,1,1,18,25,21,11,10,18,7),

  // SANTA MARIA
  buildPitcher("Santa Maria","B. Alejo","Jr",1.43,0,0,14.2,11,8,3,3,7,5),
  buildPitcher("Santa Maria","A. Rice","Fr",2.10,0,0,3.1,5,4,1,3,2,2),
  buildPitcher("Santa Maria","D. Martin","Sr",4.50,0,0,23.1,32,16,15,6,30,6),
  buildPitcher("Santa Maria","J. Medina","Sr",5.69,0,0,19.2,22,27,16,26,35,9),
  buildPitcher("Santa Maria","J. Medina","Sr",6.42,0,0,12,17,11,11,11,15,5),
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.20,0,0,5,3,3,3,3,6,2),

  // SANTA YNEZ
  buildPitcher("Santa Ynez","C. Palmer","Jr",1.71,3,0,16.1,5,5,4,11,22,4),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.83,1,0,7.2,5,2,2,4,9,6),
  buildPitcher("Santa Ynez","E. Roberts","So",2.03,2,0,20.2,21,6,6,5,29,6),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",2.19,4,2,38.1,30,21,12,19,62,8),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.36,0,0,8.1,8,7,4,7,16,4),
  buildPitcher("Santa Ynez","S. Rhea","Jr",4.67,0,0,3,1,2,2,4,4,2),

  // ST. JOSEPH
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.66,0,0,10.2,6,9,1,9,7,7),
  buildPitcher("St. Joseph","L. Woodruff","So",1.86,4,0,26.1,17,9,7,7,21,9),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.56,5,2,38.1,32,21,14,8,50,8),
  buildPitcher("St. Joseph","X. Horta","So",2.21,3,1,25.1,17,11,8,13,26,6),
  buildPitcher("St. Joseph","C. Chanley","Sr",3.37,3,1,18.2,15,10,9,15,21,6),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",4.50,0,0,4.2,8,7,3,1,5,4),
  buildPitcher("St. Joseph","S. Grupe","So",21.00,0,0,1,3,3,3,1,0,1),

  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,1,1,7.1,4,2,0,3,4,3),
  buildPitcher("Templeton","W. Patch","Sr",2.25,1,0,9.1,11,5,3,8,10,4),
  buildPitcher("Templeton","A. Abatti","Jr",1.88,0,0,22.1,17,20,6,12,22,6),
  buildPitcher("Templeton","L. Rivera","Jr",3.13,4,0,38,39,24,17,19,29,8),
  buildPitcher("Templeton","R. Garcia","Jr",4.85,0,0,13,17,10,9,6,7,6),
  buildPitcher("Templeton","N. Argain","Sr",6.13,2,1,29.2,37,40,26,21,21,10),
  buildPitcher("Templeton","C. Sims","Jr",3.50,0,0,6,6,5,3,5,3,3),

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
    { abbr:"SJ",  name:"St. Joseph",          lw:7, ll:1, ow:15, ol:4,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:5, ll:3, ow:14, ol:6,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:5, ll:3, ow:12, ol:6,  ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:3, ll:5, ow:12, ol:7,  ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:3, ll:5, ow:9,  ol:7,  ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:1, ll:7, ow:9,  ol:11, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:5, ll:2, ow:11, ol:9,  ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:5, ll:1, ow:10, ol:8,  ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:2, ll:5, ow:5,  ol:14, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:2, ll:3, ow:9,  ol:11, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:5, ow:5,  ol:15, ot:0 },
  ],
  ocean: [
    { abbr:"PV",  name:"Pioneer Valley", lw:4, ll:1, ow:11, ol:6,  ot:2 },
    { abbr:"SY",  name:"Santa Ynez",     lw:3, ll:1, ow:12, ol:3,  ot:0 },
    { abbr:"NIP", name:"Nipomo",         lw:2, ll:1, ow:9,  ol:9,  ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:0, ll:6, ow:5,  ol:8,  ot:0 },
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
