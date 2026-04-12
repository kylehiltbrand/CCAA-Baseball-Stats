// ============================================================
// CCAA Baseball 2025-26 — data.js
// ============================================================
// THIS IS THE ONLY FILE YOU NEED TO UPDATE EACH WEEK.
//
// To update stats:
//   1. Upload new MaxPreps PDFs to Claude
//   2. Claude replaces the batters[] and pitchers[] arrays below
//   3. Also update team records in the standings/teams objects if needed
//   4. Replace this file in GitHub → Vercel auto-deploys
//
// DO NOT edit stats.html, standings.html, teams.html, or index.html
// unless you're changing the site layout/design.
// ============================================================

// wOBA weights (standard)
const wBB = 0.69, wHBP = 0.72, w1B = 0.88, w2B = 1.24, w3B = 1.56, wHR = 2.00;

// ── CCAA League Constants (derived from 13-team 2025-26 data) ──
const LG_WOBA       = 0.358;  // CCAA league avg wOBA
const WOBA_SCALE    = 0.892;  // wOBA/lgOBP ratio for this run environment
const LG_R_PA       = 0.193;  // runs per PA (CCAA avg; MLB≈0.115)
const LG_ERA        = 4.83;   // CCAA league ERA
const RUNS_PER_WIN  = 6.0;    // scaled for HS run environment — produces meaningful WAR per short season
const REPL_RUNS_600 = -33.4;  // replacement-level runs per 600 PA (scaled)
const RAA_PER_600   = 95.1;   // runs above avg per 600 PA swing
// Regression anchors — full credibility at these thresholds
const WRC_FULL_PA   = 80;     // PA for full wRC+ credibility
const ERA_FULL_IP   = 25;     // IP for full ERA+ credibility (realistic for HS season)
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
  const raw = Math.min((LG_ERA / era) * 100, 250); // cap at 250 — prevents absurd values for tiny samples
  const weight = Math.min(ip / ERA_FULL_IP, 1.0);
  return Math.round(raw * weight + 100 * (1 - weight));
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
    overall: "14-4-1",
    leagueRecord: "6-1",
    wins: 14, losses: 4, ties: 1,
    leagueWins: 6, leagueLosses: 1,
    caRank: 34,
    gp: 19,
    teamBavg: .278, teamOBP: .398, teamSLG: .388,
    teamERA: 2.62, teamIP: 128
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "14-5",
    leagueRecord: "5-2",
    wins: 14, losses: 5, ties: 0,
    leagueWins: 5, leagueLosses: 2,
    caRank: 54,
    gp: 19,
    teamBavg: .355, teamOBP: .441, teamSLG: .510,
    teamERA: 1.99, teamIP: 123.1
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
    caRank: 388,
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
    caRank: 415,
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
    overall: "10-8",
    leagueRecord: "5-1",
    wins: 10, losses: 8, ties: 0,
    leagueWins: 5, leagueLosses: 1,
    caRank: 270,
    gp: 18,
    teamBavg: .300, teamOBP: .404, teamSLG: .388,
    teamERA: 4.04, teamIP: 123
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "11-6",
    leagueRecord: "4-3",
    wins: 11, losses: 6, ties: 0,
    leagueWins: 4, leagueLosses: 3,
    caRank: 143,
    gp: 17,
    teamBavg: .348, teamOBP: .463, teamSLG: .487,
    teamERA: 3.58, teamIP: 107.2
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "12-5",
    leagueRecord: "3-4",
    wins: 12, losses: 5, ties: 0,
    leagueWins: 3, leagueLosses: 4,
    caRank: 146,
    gp: 17,
    teamBavg: .312, teamOBP: .399, teamSLG: .420,
    teamERA: 4.07, teamIP: 110
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "9-10",
    leagueRecord: "1-6",
    wins: 9, losses: 10, ties: 0,
    leagueWins: 1, leagueLosses: 6,
    caRank: 265,
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
    caRank: 583,
    gp: 16,
    teamBavg: .275, teamOBP: .383, teamSLG: .354,
    teamERA: 3.82, teamIP: 108
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "E. Stewart",
    colors: "Navy, White",
    league: "CCAA - Mountain",
    overall: "7-7",
    leagueRecord: "2-5",
    wins: 7, losses: 7, ties: 0,
    leagueWins: 2, leagueLosses: 5,
    caRank: 305,
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
    caRank: 608,
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
    caRank: 768,
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
    caRank: 729,
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
  return { team, name, year, gp, avg, pa, ab, r, h, rbi, doubles, triples, hr, bb, k, hbp, sf:sf||0, obp, slg, ops, woba: Math.round(woba*1000)/1000, wrc_plus: wrc, owar, bbk };
}

function buildPitcher(team, name, year, era, w, l, ip, h, r, er, bb, k, app) {
  const k9 = calcKper9(k, ip);
  const kbb = calcKBB(k, bb);
  const era_plus = calcERA_plus(era, ip);
  const pwar = calcPWAR(era, ip);
  const bf_est = ip > 0 ? (ip * 3 + h + bb) : null;
  const kpct = bf_est && bf_est > 0 ? (k / bf_est) * 100 : null;
  return { team, name, year, era, w, l, ip, h, r, er, bb, k, app, k9, kbb, era_plus, pwar, kpct };
}

const batters = [
  // ARROYO GRANDE
  buildBatter("Arroyo Grande","A. Winter","Jr",17,.613,39,31,10,19,7,1,0,0,2,1,5,1,.667,.645,1.312),
  buildBatter("Arroyo Grande","R. Servin","Jr",19,.492,77,59,22,29,17,9,0,3,16,8,1,1,.597,.797,1.394),
  buildBatter("Arroyo Grande","O. King","Jr",11,.375,10,8,3,3,1,0,0,0,2,4,0,0,.500,.375,.875),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",18,.345,66,58,13,20,17,1,0,4,4,8,3,1,.409,.569,.978),
  buildBatter("Arroyo Grande","T. Kurth","Sr",15,.348,54,46,9,16,14,6,0,2,5,6,1,1,.415,.609,1.024),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",17,.371,44,35,7,13,5,3,0,0,5,4,1,0,.463,.457,.920),
  buildBatter("Arroyo Grande","M. Richwine","Sr",17,.308,46,39,10,12,8,2,0,1,4,9,0,3,.372,.436,.808),
  buildBatter("Arroyo Grande","B. Paz","Fr",17,.343,40,35,10,12,12,2,0,3,4,9,0,1,.400,.657,1.057),
  buildBatter("Arroyo Grande","J. Stumph","Jr",16,.302,58,43,13,13,9,3,0,0,11,4,2,2,.464,.372,.836),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",17,.314,40,35,9,11,7,2,0,1,5,8,0,0,.400,.457,.857),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",14,.235,21,17,1,4,3,1,0,0,4,9,0,0,.381,.294,.675),
  buildBatter("Arroyo Grande","J. Ralph","Jr",19,.348,78,69,15,24,9,4,0,1,6,5,2,1,.410,.449,.859),
  buildBatter("Arroyo Grande","K. Warwick","Jr",14,.185,28,27,3,5,1,0,1,0,0,10,0,1,.185,.259,.444),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",11,.294,20,17,8,5,4,0,0,0,2,5,1,0,.400,.294,.694),
  buildBatter("Arroyo Grande","R. Bronson","Sr",13,.304,26,23,3,7,6,0,0,1,2,5,0,1,.360,.435,.795),

  // ATASCADERO
  buildBatter("Atascadero","M. Cullen","Jr",10,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","W. Witt","Sr",16,.262,64,42,14,11,5,4,0,1,21,15,1,0,.516,.429,.945),
  buildBatter("Atascadero","A. Donaldson","So",12,.240,35,25,4,6,1,0,0,0,8,9,1,0,.441,.240,.681),
  buildBatter("Atascadero","W. Litten","Sr",17,.320,63,50,7,16,14,4,1,0,6,12,7,0,.460,.440,.900),
  buildBatter("Atascadero","S. Ernst","Sr",12,.233,33,30,4,7,3,1,0,0,3,16,0,0,.303,.267,.570),
  buildBatter("Atascadero","D. Mitchell","Sr",12,.209,47,43,6,9,5,2,1,0,2,8,2,0,.277,.302,.579),
  buildBatter("Atascadero","E. Wanner","Sr",16,.150,60,40,10,6,5,0,0,0,14,6,2,1,.386,.150,.536),
  buildBatter("Atascadero","W. Azelton","So",17,.163,59,43,6,7,9,2,1,0,9,16,5,2,.356,.256,.612),
  buildBatter("Atascadero","M. Beck","Jr",17,.160,30,25,7,4,2,0,0,0,4,7,1,0,.300,.160,.460),
  buildBatter("Atascadero","J. Litten","So",17,.231,52,39,5,9,6,2,0,0,6,13,4,2,.373,.282,.655),
  buildBatter("Atascadero","M. Zepeda","Sr",17,.205,51,39,5,8,5,2,1,0,8,9,0,4,.340,.308,.648),
  buildBatter("Atascadero","R. Brown","Sr",12,.154,13,13,2,2,0,0,0,0,0,4,0,0,.154,.154,.308),
  buildBatter("Atascadero","V. Rivera","Sr",5,.250,5,4,1,1,1,0,0,0,1,2,0,0,.400,.250,.650),

  // CABRILLO
  buildBatter("Cabrillo","M. Koff","Sr",16,.351,46,37,8,13,5,5,0,0,4,3,2,0,.429,.486,.915),
  buildBatter("Cabrillo","J. Clark","So",16,.333,39,30,6,10,5,1,0,0,4,13,1,1,.417,.367,.784),
  buildBatter("Cabrillo","J. Low","Sr",15,.174,29,23,2,4,2,2,0,0,4,4,0,2,.345,.261,.606),
  buildBatter("Cabrillo","L. Vorce","Jr",12,.281,36,32,3,9,2,0,0,0,3,1,0,1,.343,.281,.624),
  buildBatter("Cabrillo","F. Lopez","Sr",17,.244,54,45,6,11,4,2,0,0,5,15,2,1,.340,.289,.629),
  buildBatter("Cabrillo","G. Barraza","Sr",17,.260,57,50,10,13,2,0,0,0,5,8,2,0,.351,.260,.611),
  buildBatter("Cabrillo","C. Powell","Jr",17,.208,59,53,9,11,3,4,0,0,6,7,0,0,.288,.283,.571),
  buildBatter("Cabrillo","F. Hernandez","Jr",17,.212,57,52,7,11,2,2,1,0,3,12,2,0,.281,.288,.569),
  buildBatter("Cabrillo","L. Ragoza","Jr",13,.188,19,16,2,3,0,0,0,0,2,7,1,0,.316,.188,.504),
  buildBatter("Cabrillo","C. Sunndeniyage","Jr",16,.154,28,26,0,4,0,0,0,0,1,7,0,1,.185,.154,.339),
  buildBatter("Cabrillo","I. Lopez","So",10,.042,29,24,1,1,2,0,0,0,3,6,1,1,.179,.042,.221),
  buildBatter("Cabrillo","A. Torres","Sr",9,.125,16,16,0,2,1,0,0,1,0,5,0,0,.125,.250,.375),

  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",17,.510,66,49,27,25,19,8,1,4,9,6,8,0,.636,.959,1.595),
  buildBatter("Morro Bay","C. White","Sr",16,.426,69,47,15,20,19,2,0,2,10,2,0,12,.435,.596,1.031),
  buildBatter("Morro Bay","E. Brown","Sr",16,.439,45,41,15,18,8,0,0,0,3,0,1,0,.489,.439,.928),
  buildBatter("Morro Bay","C. Wilkinson","Sr",16,.396,59,48,12,19,14,6,1,0,11,9,0,0,.508,.563,1.070),
  buildBatter("Morro Bay","T. Gray","Sr",17,.321,60,53,6,17,9,4,0,0,2,8,4,1,.383,.396,.779),
  buildBatter("Morro Bay","J. Deovlet","So",17,.245,61,49,9,12,13,2,0,0,8,3,2,2,.361,.286,.647),
  buildBatter("Morro Bay","E. Davis","Sr",14,.227,47,44,7,10,6,2,0,0,2,11,0,1,.255,.273,.528),
  buildBatter("Morro Bay","C. Waldon","Jr",15,.222,50,45,8,10,5,1,0,0,3,10,2,0,.300,.244,.544),
  buildBatter("Morro Bay","J. Skaggs","Sr",14,.167,31,30,4,5,2,1,0,0,0,5,1,0,.194,.200,.394),

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
  buildBatter("Pioneer Valley","I. Enriquez","Jr",13,.514,49,37,13,19,15,2,0,1,8,3,3,1,.612,.649,1.261),
  buildBatter("Pioneer Valley","K. Milner","Jr",11,.515,41,33,6,17,14,5,0,1,7,5,1,0,.610,.758,1.368),
  buildBatter("Pioneer Valley","L. Dreier","Jr",8,.375,12,8,4,3,1,0,0,0,3,1,1,0,.583,.375,.958),
  buildBatter("Pioneer Valley","D. Cortez","So",14,.311,55,45,12,14,7,6,0,0,10,9,0,0,.436,.444,.880),
  buildBatter("Pioneer Valley","M. Rosas","Sr",12,.323,39,31,7,10,3,1,0,0,4,8,3,1,.447,.355,.802),
  buildBatter("Pioneer Valley","I. Martinez","Sr",9,.231,17,13,2,3,3,0,0,0,4,4,1,0,.412,.231,.643),
  buildBatter("Pioneer Valley","I. Garcia","Jr",7,.400,5,5,2,2,1,0,0,0,0,0,0,0,.400,.400,.800),
  buildBatter("Pioneer Valley","U. Ponce","Jr",13,.200,38,35,6,7,4,1,0,0,1,16,1,1,.243,.229,.472),
  buildBatter("Pioneer Valley","E. Ponce","Sr",14,.267,57,45,19,12,1,1,0,1,7,5,4,1,.411,.311,.722),
  buildBatter("Pioneer Valley","J. Lopez","Sr",14,.167,46,42,6,7,7,1,0,1,2,12,1,2,.205,.214,.419),
  buildBatter("Pioneer Valley","K. Owen","Sr",11,.167,35,30,2,5,2,0,0,0,2,4,2,1,.257,.167,.424),
  buildBatter("Pioneer Valley","J. Medina","Jr",8,.182,14,11,1,2,2,0,0,0,2,6,0,1,.308,.182,.490),
  buildBatter("Pioneer Valley","J. Valdez","Jr",10,.182,14,11,4,2,0,0,0,0,2,4,1,0,.357,.182,.539),
  buildBatter("Pioneer Valley","M. Andrade","Jr",11,.091,31,22,4,2,4,0,0,0,7,8,0,2,.310,.091,.401),

  // RIGHETTI
  buildBatter("Righetti","K. Walker","Jr",17,.500,63,54,22,27,16,9,0,3,8,3,0,1,.556,.833,1.389),
  buildBatter("Righetti","G. Cole","So",17,.442,64,52,19,23,5,3,0,0,8,7,0,1,.508,.500,1.008),
  buildBatter("Righetti","N. Kesner","Sr",17,.477,62,44,17,21,15,2,1,0,14,9,2,1,.607,.568,1.175),
  buildBatter("Righetti","N. Roberts","Sr",17,.457,62,46,14,21,15,4,1,1,13,4,1,2,.565,.652,1.217),
  buildBatter("Righetti","M. Villegas","So",12,.333,33,24,8,8,6,1,1,1,9,12,0,0,.515,.583,1.098),
  buildBatter("Righetti","M. Anderson","Sr",17,.333,70,63,12,21,8,1,0,1,5,9,2,0,.400,.397,.797),
  buildBatter("Righetti","Z. Andersen","So",16,.205,52,39,5,8,10,3,0,3,10,16,2,1,.392,.513,.905),
  buildBatter("Righetti","N. Verduzco","So",17,.243,50,37,11,9,6,1,0,0,11,9,0,2,.417,.270,.687),
  buildBatter("Righetti","D. Nevarez","Sr",17,.200,50,40,5,8,9,3,0,0,7,12,3,0,.360,.275,.635),
  buildBatter("Righetti","M. Andersen","Jr",11,.267,18,15,2,4,6,2,0,0,1,3,0,1,.294,.400,.694),

  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","J. Riley","Jr",18,.444,69,54,8,24,12,3,0,0,13,8,1,1,.551,.500,1.051),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",18,.327,59,49,10,16,12,1,0,0,5,14,4,0,.431,.347,.778),
  buildBatter("San Luis Obispo","J. Taylor","Sr",17,.289,44,38,7,11,11,2,0,3,6,12,0,0,.386,.579,.965),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",18,.312,70,64,13,20,10,3,1,0,5,11,0,0,.362,.391,.753),
  buildBatter("San Luis Obispo","C. Stephens","Jr",18,.321,65,56,12,18,12,3,1,0,9,11,0,0,.415,.411,.826),
  buildBatter("San Luis Obispo","T. Blaney","So",18,.300,52,40,13,12,5,2,0,1,12,9,0,0,.462,.425,.887),
  buildBatter("San Luis Obispo","G. Bramble","Sr",15,.263,62,57,13,15,9,5,0,1,5,11,0,0,.323,.404,.727),
  buildBatter("San Luis Obispo","P. Wyatt","Jr",18,.273,68,55,13,15,12,1,0,0,6,4,3,1,.369,.291,.660),
  buildBatter("San Luis Obispo","F. Avrett","Jr",12,.333,13,12,1,4,5,2,0,0,0,7,0,1,.308,.500,.808),
  buildBatter("San Luis Obispo","B. Schafer","Jr",16,.179,46,28,8,5,2,3,0,0,13,4,1,0,.452,.286,.738),

  // SANTA MARIA
  buildBatter("Santa Maria","O. Sedano","So",3,.667,5,3,1,2,3,0,0,0,2,0,0,0,.800,.667,1.467),
  buildBatter("Santa Maria","B. Alejo","Jr",12,.390,46,41,5,16,12,3,0,0,1,4,4,0,.457,.463,.920),
  buildBatter("Santa Maria","J. Calderon","Sr",12,.421,44,38,8,16,6,0,0,0,3,2,1,1,.465,.421,.886),
  buildBatter("Santa Maria","J. Medina","Sr",12,.429,47,35,15,15,8,1,1,0,12,7,0,0,.574,.514,1.088),
  buildBatter("Santa Maria","D. Martin","Sr",12,.297,47,37,13,11,6,3,0,0,8,3,2,0,.447,.378,.825),
  buildBatter("Santa Maria","A. Ybarra","Sr",12,.294,42,34,6,10,6,2,0,0,7,7,1,0,.429,.353,.782),
  buildBatter("Santa Maria","A. Rice","So",12,.342,42,38,7,13,9,0,0,0,2,5,2,0,.405,.342,.747),
  buildBatter("Santa Maria","A. Rice","Fr",11,.296,30,27,3,8,7,2,0,0,3,6,0,0,.367,.370,.737),
  buildBatter("Santa Maria","J. Medina","Sr",12,.263,42,38,8,10,6,2,0,0,4,8,0,0,.333,.316,.649),
  buildBatter("Santa Maria","U. Rodriguez","Fr",12,.192,35,26,10,5,4,1,0,0,7,4,2,0,.400,.231,.631),

  // SANTA YNEZ
  buildBatter("Santa Ynez","J. Glover","Jr",14,.483,63,58,20,28,26,4,2,2,3,8,1,1,.508,.724,1.232),
  buildBatter("Santa Ynez","K. Heiduk","So",14,.449,61,49,22,22,13,3,1,0,11,10,1,0,.557,.551,1.108),
  buildBatter("Santa Ynez","D. Pulido","Sr",14,.413,62,46,21,19,15,5,0,1,11,4,4,1,.548,.587,1.135),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",14,.386,61,44,17,17,13,6,1,0,13,5,4,0,.557,.568,1.125),
  buildBatter("Santa Ynez","E. Roberts","So",13,.425,50,40,11,17,11,6,0,0,7,8,2,1,.520,.575,1.095),
  buildBatter("Santa Ynez","B. Cram","So",14,.386,53,44,15,17,6,0,0,0,7,6,1,0,.481,.386,.867),
  buildBatter("Santa Ynez","T. Jeckell","Jr",14,.413,50,46,17,19,17,5,0,0,4,2,0,0,.460,.522,.982),
  buildBatter("Santa Ynez","M. Skidmore","Sr",14,.304,63,56,19,17,12,5,0,0,5,10,1,0,.371,.393,.764),
  buildBatter("Santa Ynez","S. Rhea","Jr",14,.286,54,42,14,12,10,1,0,0,5,11,4,1,.404,.310,.714),

  // ST. JOSEPH
  buildBatter("St. Joseph","A. Bluem","Jr",19,.446,75,65,26,29,14,7,0,5,7,2,3,0,.520,.785,1.305),
  buildBatter("St. Joseph","E. Hendricks","So",15,.350,27,20,10,7,0,1,0,0,6,1,1,0,.519,.400,.919),
  buildBatter("St. Joseph","C. Chanley","Sr",19,.352,72,54,14,19,13,4,1,2,7,1,9,2,.486,.574,1.060),
  buildBatter("St. Joseph","L. Woodruff","So",17,.278,42,36,7,10,14,3,0,1,2,10,2,0,.350,.444,.794),
  buildBatter("St. Joseph","C. Goncalves","Jr",19,.321,67,56,9,18,16,3,0,0,5,11,4,2,.403,.375,.778),
  buildBatter("St. Joseph","M. Majewski","Jr",18,.268,52,41,7,11,7,3,0,0,8,9,3,0,.423,.341,.764),
  buildBatter("St. Joseph","M. O'Keefe","Jr",16,.273,42,33,5,9,7,1,0,1,7,9,1,1,.405,.394,.799),
  buildBatter("St. Joseph","S. Covarrubias","Sr",17,.156,65,45,15,7,1,1,0,0,18,12,1,0,.406,.178,.584),
  buildBatter("St. Joseph","M. Kon","Sr",12,.290,37,31,1,9,8,0,0,0,4,6,1,1,.378,.290,.668),
  buildBatter("St. Joseph","X. Horta","So",18,.205,55,44,3,9,7,1,0,0,6,7,0,3,.283,.227,.510),
  buildBatter("St. Joseph","R. Roemling","Sr",14,.148,34,27,2,4,0,1,0,0,5,7,1,1,.303,.185,.488),

  // TEMPLETON
  buildBatter("Templeton","L. Stetz","Sr",14,.396,54,48,10,19,9,3,3,0,3,6,3,0,.463,.583,1.046),
  buildBatter("Templeton","C. Sims","Jr",15,.389,59,54,15,21,3,1,2,0,2,6,3,0,.441,.481,.922),
  buildBatter("Templeton","L. Rivera","Jr",15,.314,61,51,12,16,11,2,0,0,6,6,1,2,.383,.353,.736),
  buildBatter("Templeton","N. Argain","Sr",12,.273,24,22,3,6,3,1,0,0,1,4,0,0,.304,.318,.622),
  buildBatter("Templeton","W. Patch","Sr",8,.308,15,13,3,4,1,1,0,0,2,5,0,0,.400,.385,.785),
  buildBatter("Templeton","L. Olsen","Sr",16,.250,65,48,14,12,4,5,0,0,14,13,3,0,.446,.354,.800),
  buildBatter("Templeton","J. Beckwith","So",16,.265,46,34,7,9,8,1,0,0,8,8,1,0,.419,.294,.713),
  buildBatter("Templeton","N. Capaci","Jr",15,.273,42,33,6,9,3,1,0,0,7,15,1,1,.405,.303,.708),
  buildBatter("Templeton","R. Garcia","Jr",13,.240,27,25,4,6,3,0,1,1,2,8,0,0,.296,.440,.736),
  buildBatter("Templeton","C. Hamilton","So",15,.194,42,31,3,6,6,1,0,0,8,16,2,1,.381,.226,.607),

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
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.40,0,0,17.2,9,4,1,6,9,8),
  buildPitcher("Arroyo Grande","G. Pope","Sr",1.12,0,0,25,14,9,4,9,18,7),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.00,0,0,4.1,4,0,0,3,4,4),
  buildPitcher("Arroyo Grande","O. King","Jr",2.03,0,0,10.1,8,5,3,5,14,5),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",2.55,0,0,22,12,8,8,8,17,6),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.85,0,0,20,19,22,11,17,13,6),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),

  // ATASCADERO
  buildPitcher("Atascadero","W. Azelton","So",3.09,2,2,31.2,38,20,14,9,29,8),
  buildPitcher("Atascadero","W. Witt","Sr",4.15,1,3,27,29,23,16,15,17,9),
  buildPitcher("Atascadero","D. Mitchell","Sr",4.85,1,3,17.1,27,23,12,8,9,5),
  buildPitcher("Atascadero","J. Litten","So",7.00,0,0,6,7,6,6,6,6,3),
  buildPitcher("Atascadero","M. Cullen","Jr",9.00,0,0,9.1,15,14,12,5,6,9),
  buildPitcher("Atascadero","C. Knoph","Jr",8.84,0,2,6.1,7,8,8,7,3,4),
  buildPitcher("Atascadero","A. Madrigal","Sr",8.75,1,1,8,9,12,10,10,4,5),
  buildPitcher("Atascadero","V. Rivera","Sr",7.64,0,0,3.2,6,4,4,3,2,3),

  // CABRILLO
  buildPitcher("Cabrillo","J. Low","Sr",4.20,2,5,33.1,26,26,20,17,25,8),
  buildPitcher("Cabrillo","J. Heidt","Jr",6.10,1,1,10.1,16,12,9,3,2,4),
  buildPitcher("Cabrillo","C. Powell","Jr",6.12,0,1,16,23,18,14,4,9,6),
  buildPitcher("Cabrillo","J. Clark","So",3.59,0,0,13.2,15,11,7,8,13,7),
  buildPitcher("Cabrillo","F. Lopez","Sr",7.45,0,5,20.2,28,35,22,25,11,7),
  buildPitcher("Cabrillo","M. Koff","Sr",9.33,0,0,9,14,13,12,9,12,7),
  buildPitcher("Cabrillo","I. Lopez","So",10.50,0,1,6,12,13,9,4,5,3),
  buildPitcher("Cabrillo","L. Vorce","Jr",28.00,0,1,1,1,5,4,5,0,1),

  // MORRO BAY
  buildPitcher("Morro Bay","E. Brown","Sr",2.96,3,2,28.1,28,15,12,8,30,10),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",2.43,3,1,23,19,13,8,5,21,7),
  buildPitcher("Morro Bay","E. Davis","Sr",5.48,3,2,23,27,22,18,10,12,7),
  buildPitcher("Morro Bay","C. White","Sr",5.25,1,0,10.2,13,8,8,2,9,8),
  buildPitcher("Morro Bay","Q. Crotts","Sr",0.00,0,0,2,0,0,0,0,3,1),
  buildPitcher("Morro Bay","J. Skaggs","Sr",2.33,0,0,3,2,1,1,2,1,2),
  buildPitcher("Morro Bay","H. Stow","Sr",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Deovlet","So",2.80,0,0,5,6,2,2,2,3,2),

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
  buildPitcher("Pioneer Valley","I. Garcia","Jr",0.54,2,0,13,7,2,1,3,8,4),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",1.53,2,0,18.1,16,8,4,7,20,6),
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.27,1,0,11,10,7,2,6,10,3),
  buildPitcher("Pioneer Valley","D. Cortez","So",1.91,1,0,7.1,8,5,2,4,7,6),
  buildPitcher("Pioneer Valley","M. Botello","Jr",0.00,0,0,2,3,0,0,0,2,2),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",2.75,3,1,20.1,22,12,8,7,15,7),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",3.65,1,1,15.1,12,9,8,5,12,5),
  buildPitcher("Pioneer Valley","I. Martinez","Sr",3.82,0,1,3.2,8,8,2,3,2,2),
  buildPitcher("Pioneer Valley","J. Medina","Jr",14.00,0,1,1,2,2,2,1,3,1),
  buildPitcher("Pioneer Valley","J. Lopez","Sr",21.00,0,0,2,6,8,6,2,3,1),

  // RIGHETTI
  buildPitcher("Righetti","I. Rocha","So",2.46,3,1,31.1,39,14,11,9,19,6),
  buildPitcher("Righetti","K. Walker","Jr",2.33,2,0,12,11,7,4,4,11,4),
  buildPitcher("Righetti","G. Rodriguez","Sr",3.69,2,0,24.2,23,17,13,9,10,9),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","N. Lancor","Sr",4.85,3,2,21.2,24,19,15,11,17,9),
  buildPitcher("Righetti","E. Barcenas","Sr",7.00,0,0,2,0,2,2,3,3,1),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  buildPitcher("Righetti","A. Stevens","Fr",0.00,0,0,3,2,0,0,2,4,1),

  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","J. Riley","Jr",2.58,1,1,19,15,10,7,7,15,6),
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.54,5,1,29.2,29,18,15,10,19,6),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.87,3,4,39,44,24,16,16,46,8),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",4.28,1,1,18,25,21,11,10,18,7),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",13.12,0,0,5.1,11,11,10,3,4,5),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",2.33,0,0,6,8,6,2,3,3,6),

  // SANTA MARIA
  buildPitcher("Santa Maria","B. Alejo","Jr",0.54,0,0,13,4,1,1,1,7,4),
  buildPitcher("Santa Maria","A. Rice","Fr",2.10,0,0,3.1,5,4,1,3,2,2),
  buildPitcher("Santa Maria","D. Martin","Sr",4.50,0,0,23.1,32,16,15,6,30,6),
  buildPitcher("Santa Maria","J. Medina","Sr",4.96,0,0,18.1,21,23,13,22,31,8),
  buildPitcher("Santa Maria","J. Medina","Sr",6.42,0,0,12,17,11,11,11,15,5),
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.20,0,0,5,3,3,3,3,6,2),

  // SANTA YNEZ
  buildPitcher("Santa Ynez","C. Palmer","Jr",1.71,3,0,16.1,5,5,4,11,22,4),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.83,1,0,7.2,5,2,2,4,9,6),
  buildPitcher("Santa Ynez","E. Roberts","So",2.03,2,0,20.2,21,6,6,5,29,6),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",2.52,3,2,33.1,24,20,12,17,57,7),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.36,0,0,8.1,8,7,4,7,16,4),
  buildPitcher("Santa Ynez","S. Rhea","Jr",4.67,0,0,3,1,2,2,4,4,2),

  // ST. JOSEPH
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.66,0,0,10.2,6,9,1,9,7,7),
  buildPitcher("St. Joseph","L. Woodruff","So",1.86,4,0,26.1,17,9,7,7,21,9),
  buildPitcher("St. Joseph","M. Majewski","Jr",3.13,4,2,31.1,32,21,14,8,41,7),
  buildPitcher("St. Joseph","X. Horta","So",2.21,3,1,25.1,17,11,8,13,26,6),
  buildPitcher("St. Joseph","C. Chanley","Sr",3.37,3,1,18.2,15,10,9,15,21,6),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",4.50,0,0,4.2,8,7,3,1,5,4),

  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,1,0,5,1,0,0,3,3,2),
  buildPitcher("Templeton","W. Patch","Sr",0.95,1,0,7.1,7,3,1,7,9,3),
  buildPitcher("Templeton","A. Abatti","Jr",1.88,0,0,22.1,17,20,6,12,22,6),
  buildPitcher("Templeton","L. Rivera","Jr",3.28,3,0,32,34,22,15,16,27,7),
  buildPitcher("Templeton","R. Garcia","Jr",4.85,0,0,13,17,10,9,6,7,6),
  buildPitcher("Templeton","N. Argain","Sr",7.69,1,1,23.2,35,40,26,21,16,8),
  buildPitcher("Templeton","C. Sims","Jr",4.67,0,0,3,5,2,2,0,0,2),

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
    { abbr:"SJ",  name:"St. Joseph",          lw:6, ll:1, ow:14, ol:4,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:5, ll:2, ow:14, ol:5,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:4, ll:3, ow:11, ol:6,  ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:3, ll:4, ow:12, ol:5,  ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:2, ll:5, ow:7,  ol:7,  ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:1, ll:6, ow:9,  ol:10, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:5, ll:1, ow:10, ol:8,  ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:5, ll:1, ow:10, ol:8,  ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:2, ll:4, ow:5,  ol:12, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:1, ll:3, ow:8,  ol:11, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:1, ll:5, ow:4,  ol:15, ot:0 },
  ],
  ocean: [
    { abbr:"PV",  name:"Pioneer Valley", lw:4, ll:1, ow:10, ol:6,  ot:2 },
    { abbr:"SY",  name:"Santa Ynez",     lw:2, ll:1, ow:11, ol:3,  ot:0 },
    { abbr:"NIP", name:"Nipomo",         lw:2, ll:1, ow:9,  ol:9,  ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:0, ll:5, ow:5,  ol:7,  ot:0 },
  ]
};
