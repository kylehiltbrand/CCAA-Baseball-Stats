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
const DATA_UPDATED = "2026-05-06"; // YYYY-MM-DD — stats through May 5

// wOBA weights (standard)
const wBB = 0.69, wHBP = 0.72, w1B = 0.88, w2B = 1.24, w3B = 1.56, wHR = 2.00;

// ── CCAA League Constants ──
// These are seeded with current-data values and AUTO-RECALIBRATED at the bottom
// of this file from the actual batters/pitchers arrays. Do not hand-edit unless
// you're changing season-start defaults.
let LG_AVG         = 0.304;  // CCAA league avg AVG
let LG_OBP         = 0.403;  // CCAA league avg OBP
let LG_WOBA        = 0.356;  // CCAA league avg wOBA
let WOBA_SCALE     = 0.884;  // wOBA/lgOBP-style scaling factor
let LG_R_PA        = 0.188;  // runs per PA (CCAA avg; MLB≈0.115)
let LG_BABIP       = 0.362;  // CCAA league avg BABIP — used for color thresholds
let LG_ERA         = 4.75;   // CCAA league ERA
let LG_K9          = 8.0;    // CCAA league avg K/9
let LG_BB9         = 4.8;    // CCAA league avg BB/9
let LG_WHIP        = 1.59;   // CCAA league avg WHIP — used for color thresholds
// Dynamic color thresholds derived from league averages (auto-set by recalcLeagueAvgs)
let BABIP_LO       = 0.308;  // .15 below lgBABIP
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
    overall: "20-5-1",
    leagueRecord: "11-2",
    wins: 20, losses: 5, ties: 1,
    leagueWins: 11, leagueLosses: 2,
    caRank: 34,
    gp: 26,
    teamBavg: .284, teamOBP: .398, teamSLG: .379,
    teamERA: 2.27, teamIP: 176
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "18-8",
    leagueRecord: "8-5",
    wins: 18, losses: 8, ties: 0,
    leagueWins: 8, leagueLosses: 5,
    caRank: 63,
    gp: 26,
    teamBavg: .342, teamOBP: .434, teamSLG: .507,
    teamERA: 2.14, teamIP: 173.1
  },
  {
    id: "santa-ynez",
    name: "Santa Ynez",
    mascot: "Pirates",
    location: "Santa Ynez, CA",
    coach: "Craig Gladstone",
    colors: "Orange, Black",
    league: "CCAA - Ocean",
    overall: "15-6",
    leagueRecord: "6-3",
    wins: 15, losses: 6, ties: 0,
    leagueWins: 6, leagueLosses: 3,
    caRank: 379,
    gp: 21,
    teamBavg: .360, teamOBP: .466, teamSLG: .478,
    teamERA: 2.07, teamIP: 138.2
  },
  {
    id: "pioneer-valley",
    name: "Pioneer Valley",
    mascot: "Panthers",
    location: "Santa Maria, CA",
    coach: "Cody Smith",
    colors: "Teal, Black",
    league: "CCAA - Ocean",
    overall: "13-9-2",
    leagueRecord: "5-3",
    wins: 13, losses: 9, ties: 2,
    leagueWins: 5, leagueLosses: 3,
    caRank: 482,
    gp: 24,
    teamBavg: .258, teamOBP: .378, teamSLG: .320,
    teamERA: 3.02, teamIP: 160
  },
  {
    id: "nipomo",
    name: "Nipomo",
    mascot: "Titans",
    location: "Nipomo, CA",
    coach: "Caleb Buendia",
    colors: "Black, Cardinal, Silver",
    league: "CCAA - Ocean",
    overall: "13-11",
    leagueRecord: "5-3",
    wins: 13, losses: 11, ties: 0,
    leagueWins: 5, leagueLosses: 3,
    caRank: 460,
    gp: 24,
    teamBavg: .327, teamOBP: .406, teamSLG: .377,
    teamERA: 4.96, teamIP: 152.1
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "12-12-1",
    leagueRecord: "7-4",
    wins: 12, losses: 12, ties: 1,
    leagueWins: 7, leagueLosses: 4,
    caRank: 240,
    gp: 25,
    teamBavg: .314, teamOBP: .388, teamSLG: .433,
    teamERA: 3.07, teamIP: 155
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "16-9",
    leagueRecord: "10-2",
    wins: 16, losses: 9, ties: 0,
    leagueWins: 10, leagueLosses: 2,
    caRank: 247,
    gp: 25,
    teamBavg: .323, teamOBP: .417, teamSLG: .407,
    teamERA: 3.62, teamIP: 170
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "16-9",
    leagueRecord: "8-5",
    wins: 16, losses: 9, ties: 0,
    leagueWins: 8, leagueLosses: 5,
    caRank: 141,
    gp: 25,
    teamBavg: .332, teamOBP: .439, teamSLG: .477,
    teamERA: 3.75, teamIP: 162.1
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "13-11",
    leagueRecord: "4-9",
    wins: 13, losses: 11, ties: 0,
    leagueWins: 4, leagueLosses: 9,
    caRank: 227,
    gp: 24,
    teamBavg: .298, teamOBP: .378, teamSLG: .400,
    teamERA: 4.10, teamIP: 153.2
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "11-14",
    leagueRecord: "3-10",
    wins: 11, losses: 14, ties: 0,
    leagueWins: 3, leagueLosses: 10,
    caRank: 348,
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
    overall: "11-15",
    leagueRecord: "4-7",
    wins: 11, losses: 15, ties: 0,
    leagueWins: 4, leagueLosses: 7,
    caRank: 533,
    gp: 26,
    teamBavg: .282, teamOBP: .386, teamSLG: .364,
    teamERA: 3.35, teamIP: 171.1
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "S.D. Harrow",
    colors: "Navy, Vegas Gold",
    league: "CCAA - Mountain",
    overall: "11-10",
    leagueRecord: "5-8",
    wins: 11, losses: 10, ties: 0,
    leagueWins: 5, leagueLosses: 8,
    caRank: 210,
    gp: 21,
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
    overall: "9-16",
    leagueRecord: "5-6",
    wins: 9, losses: 16, ties: 0,
    leagueWins: 5, leagueLosses: 6,
    caRank: 593,
    gp: 25,
    teamBavg: .224, teamOBP: .365, teamSLG: .286,
    teamERA: 4.36, teamIP: 165.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "8-10",
    leagueRecord: "1-8",
    wins: 8, losses: 10, ties: 0,
    leagueWins: 1, leagueLosses: 8,
    caRank: 760,
    gp: 18,
    teamBavg: .329, teamOBP: .423, teamSLG: .382,
    teamERA: 4.81, teamIP: 112
  },
  {
    id: "cabrillo",
    name: "Cabrillo",
    mascot: "Conquistadores",
    location: "Lompoc, CA",
    coach: "Cole Osborne",
    colors: "Black, Gold, White",
    league: "CCAA - Sunset",
    overall: "5-20",
    leagueRecord: "2-9",
    wins: 5, losses: 20, ties: 0,
    leagueWins: 2, leagueLosses: 9,
    caRank: 689,
    gp: 24,
    teamBavg: .249, teamOBP: .334, teamSLG: .297,
    teamERA: 6.10, teamIP: 148
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
  buildBatter("Arroyo Grande","A. Winter","Jr",22,.590,50,39,13,23,9,1,0,0,5,1,5,1,.660,.615,1.275),
  buildBatter("Arroyo Grande","R. Servin","Jr",26,.457,108,81,32,37,23,12,2,3,23,8,3,1,.583,.765,1.348),
  buildBatter("Arroyo Grande","T. Kurth","Sr",22,.394,83,71,15,28,25,7,0,4,7,11,2,1,.457,.662,1.119),
  buildBatter("Arroyo Grande","B. Paz","Fr",24,.377,71,61,19,23,19,3,1,5,6,13,1,1,.435,.705,1.140),
  buildBatter("Arroyo Grande","O. King","Jr",16,.333,15,12,3,4,1,0,0,0,3,5,0,0,.467,.333,.800),
  buildBatter("Arroyo Grande","R. Bronson","Sr",17,.333,37,33,6,11,8,0,0,2,3,7,0,0,.389,.515,.904),
  buildBatter("Arroyo Grande","J. Stumph","Jr",23,.317,82,63,17,20,12,4,1,1,14,8,2,0,.456,.460,.916),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",18,.316,23,19,1,6,4,1,0,0,4,9,0,0,.435,.368,.803),
  buildBatter("Arroyo Grande","J. Ralph","Jr",26,.309,108,94,19,29,9,5,0,1,11,6,2,1,.389,.394,.783),
  buildBatter("Arroyo Grande","M. Richwine","Sr",23,.294,61,51,12,15,13,2,0,2,6,14,1,0,.379,.451,.830),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",23,.289,51,45,9,13,7,3,0,1,5,10,0,0,.360,.422,.782),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",24,.278,66,54,11,15,9,4,0,0,8,8,1,0,.381,.352,.733),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",15,.238,24,21,8,5,4,0,0,0,2,5,1,0,.333,.238,.571),
  buildBatter("Arroyo Grande","K. Warwick","Jr",20,.188,35,32,7,6,2,0,1,0,0,10,2,0,.235,.250,.485),
  buildBatter("Arroyo Grande","Z. Johnson","Jr",13,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Arroyo Grande","M. Hicks","Sr",7,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // ATASCADERO
  buildBatter("Atascadero","S. Ernst","Sr",20,.212,59,52,5,11,4,1,0,0,6,24,1,0,.305,.231,.536),
  buildBatter("Atascadero","C. Knoph","Jr",7,.200,6,5,0,1,2,0,0,0,1,3,0,0,.333,.200,.533),
  buildBatter("Atascadero","E. Wanner","Sr",24,.203,92,64,17,13,10,2,0,0,18,9,2,3,.379,.234,.613),
  buildBatter("Atascadero","V. Rivera","Sr",6,.125,9,8,1,1,1,0,0,0,1,4,0,0,.222,.125,.347),
  buildBatter("Atascadero","A. Madrigal","Sr",11,.133,17,15,2,2,1,1,0,0,2,8,0,0,.235,.200,.435),
  buildBatter("Atascadero","M. Cullen","Jr",10,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","M. Zepeda","Sr",25,.219,80,64,6,14,9,2,1,0,12,13,0,0,.342,.281,.623),
  buildBatter("Atascadero","R. Brown","Sr",14,.188,17,16,4,3,0,0,0,0,1,6,0,0,.235,.188,.422),
  buildBatter("Atascadero","W. Azelton","So",24,.170,65,47,6,8,9,3,1,0,11,19,5,2,.369,.277,.646),
  buildBatter("Atascadero","J. Litten","So",24,.213,76,61,8,13,7,3,0,0,8,16,4,2,.333,.262,.595),
  buildBatter("Atascadero","W. Litten","Sr",25,.325,94,77,11,25,21,5,1,1,7,18,9,1,.436,.455,.891),
  buildBatter("Atascadero","M. Beck","Jr",23,.162,43,37,10,6,2,0,0,0,4,12,1,0,.262,.162,.424),
  buildBatter("Atascadero","A. Donaldson","So",20,.275,64,51,10,14,3,0,0,0,11,13,1,0,.413,.275,.688),
  buildBatter("Atascadero","W. Witt","Sr",24,.242,95,62,18,15,7,4,0,1,30,23,2,0,.500,.355,.855),
  buildBatter("Atascadero","N. Simon","Sr",1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Atascadero","C. Savino","Fr",5,.111,13,9,1,1,1,0,0,0,4,5,0,0,.385,.111,.496),
  buildBatter("Atascadero","T. Knutson","So",3,.000,5,4,0,0,0,0,0,0,1,3,0,0,.200,.000,.200),
  buildBatter("Atascadero","D. Mitchell","Sr",20,.246,72,65,9,16,8,5,1,0,4,11,2,0,.310,.354,.664),
  // CABRILLO
  buildBatter("Cabrillo","C. Powell","Jr",24,.203,85,74,13,15,3,4,0,0,10,9,1,0,.306,.257,.563),
  buildBatter("Cabrillo","I. Lopez","So",10,.042,29,24,1,1,2,0,0,0,3,6,1,1,.179,.042,.221),
  buildBatter("Cabrillo","G. Barraza","Sr",24,.342,83,73,36,25,9,2,0,1,6,9,3,1,.410,.411,.821),
  buildBatter("Cabrillo","M. Koff","Sr",23,.397,71,58,13,23,11,7,0,0,6,11,2,1,.463,.517,.980),
  buildBatter("Cabrillo","J. Clark","So",21,.267,54,45,7,12,9,1,0,0,4,18,1,1,.333,.289,.622),
  buildBatter("Cabrillo","F. Lopez","Sr",24,.231,81,65,13,15,5,2,0,0,12,20,2,1,.362,.262,.624),
  buildBatter("Cabrillo","F. Hernandez","Jr",24,.253,83,75,8,19,8,3,2,0,4,14,3,1,.313,.347,.660),
  buildBatter("Cabrillo","E. Bradshaw","Fr",1,1.000,1,1,0,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  buildBatter("Cabrillo","L. Ragoza","Jr",18,.200,29,25,3,5,1,0,0,0,2,10,2,0,.310,.200,.510),
  buildBatter("Cabrillo","L. Vorce","Jr",14,.243,41,37,3,9,2,0,0,0,3,1,0,1,.300,.243,.543),
  buildBatter("Cabrillo","M. Cerna-Medina","So",6,.200,6,5,0,1,0,0,0,0,1,2,0,0,.333,.200,.533),
  buildBatter("Cabrillo","L. Rounds","So",3,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Cabrillo","C. Sunndeniyage","Jr",23,.289,50,45,5,13,1,0,0,0,2,9,1,1,.347,.289,.636),
  buildBatter("Cabrillo","J. Low","Sr",20,.237,46,38,2,9,2,3,0,0,5,5,3,0,.370,.316,.686),
  buildBatter("Cabrillo","A. Torres","Sr",11,.045,22,22,0,1,0,0,0,0,0,7,0,0,.045,.045,.090),
  buildBatter("Cabrillo","K. Sousa","Fr",2,.000,3,2,1,0,0,0,0,0,1,2,0,0,.333,.000,.333),
  buildBatter("Cabrillo","D. Vineyard","So",7,.143,17,14,3,2,0,0,0,0,2,5,1,0,.200,.143,.343),
  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",24,.414,93,70,34,29,20,11,1,4,13,10,10,0,.559,.771,1.330),
  buildBatter("Morro Bay","E. Brown","Sr",23,.379,65,58,18,22,9,0,0,0,5,2,2,0,.446,.379,.825),
  buildBatter("Morro Bay","C. White","Sr",23,.362,94,69,17,25,28,2,0,4,11,9,1,13,.394,.565,.959),
  buildBatter("Morro Bay","C. Wilkinson","Sr",22,.328,80,67,15,22,14,7,1,0,13,16,0,0,.438,.463,.901),
  buildBatter("Morro Bay","J. Deovlet","So",24,.301,85,73,12,22,15,5,0,0,8,6,2,2,.376,.370,.746),
  buildBatter("Morro Bay","T. Gray","Sr",24,.299,84,77,8,23,9,5,0,0,2,10,4,1,.345,.364,.709),
  buildBatter("Morro Bay","E. Davis","Sr",21,.250,67,64,9,16,7,2,0,0,2,15,0,1,.269,.281,.550),
  buildBatter("Morro Bay","C. Waldon","Jr",21,.238,69,63,8,15,8,3,0,0,3,15,3,0,.304,.286,.590),
  buildBatter("Morro Bay","J. Skaggs","Sr",21,.216,54,51,6,11,3,2,0,0,1,8,2,0,.259,.255,.514),
  buildBatter("Morro Bay","C. League","Fr",21,.206,40,34,11,7,4,1,0,0,5,8,0,1,.300,.235,.535),
  buildBatter("Morro Bay","B. Walker","",17,.056,24,18,3,1,0,0,0,0,3,6,3,0,.292,.056,.348),
  buildBatter("Morro Bay","V. Nelson","",7,.000,4,3,1,0,0,0,0,0,0,1,1,0,.250,.000,.250),
  buildBatter("Morro Bay","H. Stow","",3,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  // NIPOMO
  buildBatter("Nipomo","J. Anderson","Sr",6,.500,4,4,1,2,0,0,0,0,0,2,0,0,.500,.500,1.000),
  buildBatter("Nipomo","H. Roesner","Jr",17,.136,24,22,4,3,1,0,0,0,2,7,0,0,.208,.136,.344),
  buildBatter("Nipomo","E. Silveira-3","Sr",23,.350,64,60,8,21,9,2,0,0,2,7,0,1,.365,.383,.748),
  buildBatter("Nipomo","T. Oxley","Sr",22,.220,62,50,9,11,3,2,0,0,9,22,1,1,.344,.260,.604),
  buildBatter("Nipomo","K. Simonson","So",18,.176,36,34,2,6,3,0,0,0,0,6,0,2,.167,.176,.343),
  buildBatter("Nipomo","J. Lanier","Sr",5,.000,2,2,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","B. Hageman","So",23,.507,92,75,29,38,12,4,0,0,7,7,2,1,.553,.560,1.113),
  buildBatter("Nipomo","G. Groshart","Sr",21,.356,82,73,10,26,28,10,0,0,5,4,2,2,.402,.493,.895),
  buildBatter("Nipomo","K. Thomas","So",7,.000,2,0,1,0,0,0,0,0,1,0,1,0,1.000,.000,1.000),
  buildBatter("Nipomo","C. Moulden","So",23,.354,87,79,16,28,25,7,0,0,5,9,2,0,.407,.443,.850),
  buildBatter("Nipomo","L. Hobbs","Sr",23,.343,94,70,38,24,4,1,0,0,8,2,15,1,.500,.357,.857),
  buildBatter("Nipomo","Z. Garibay","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","L. Hobbs","Fr",23,.262,78,65,6,17,9,2,0,0,10,5,2,0,.377,.292,.669),
  buildBatter("Nipomo","F. Callaghan","Jr",5,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","A. Mendoza","Jr",9,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Nipomo","T. Barr","Sr",19,.261,54,46,3,12,10,1,0,0,6,16,1,1,.352,.283,.635),
  buildBatter("Nipomo","E. Silveira-19","Sr",23,.370,86,73,14,27,20,4,0,0,8,10,4,1,.453,.425,.878),
  // PASO ROBLES
  buildBatter("Paso Robles","G. Berlingeri","Sr",4,.375,8,8,2,3,0,0,0,0,0,2,0,0,.375,.375,.750),
  buildBatter("Paso Robles","J. Soboleski","Jr",23,.338,75,68,15,23,12,9,1,1,6,13,1,0,.400,.544,.944),
  buildBatter("Paso Robles","T. Freitas","Sr",23,.338,88,80,19,27,15,8,0,0,3,1,3,2,.375,.438,.812),
  buildBatter("Paso Robles","S. Roby","Sr",6,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Paso Robles","B. Lowry","Jr",23,.423,87,71,19,30,22,4,1,1,12,10,1,3,.494,.549,1.043),
  buildBatter("Paso Robles","C. Glover","Sr",16,.190,30,21,3,4,1,1,0,0,5,7,2,0,.393,.238,.631),
  buildBatter("Paso Robles","C. Contreras","Jr",16,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","L. Ross","Sr",1,.000,0,0,1,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Paso Robles","E. Rendon","So",22,.300,78,70,16,21,17,5,1,3,2,8,5,1,.359,.529,.888),
  buildBatter("Paso Robles","E. Dobroth","Jr",23,.311,88,74,19,23,18,2,1,0,9,13,4,1,.409,.365,.774),
  buildBatter("Paso Robles","M. Garcia","Sr",22,.366,84,71,27,26,13,5,1,0,10,8,3,0,.464,.465,.929),
  buildBatter("Paso Robles","C. Prieto","Jr",22,.317,69,60,13,19,12,6,0,0,4,9,1,2,.358,.417,.775),
  buildBatter("Paso Robles","E. Nevarez","Jr",8,.214,14,14,1,3,3,2,0,0,0,6,0,0,.214,.357,.571),
  buildBatter("Paso Robles","X. Hermanson","Jr",22,.283,72,60,12,17,13,6,0,1,9,6,1,1,.380,.433,.813),
  buildBatter("Paso Robles","J. Lopez","Jr",9,.429,11,7,2,3,1,1,0,0,3,1,0,0,.600,.571,1.171),
  buildBatter("Paso Robles","L. Christensen","Jr",13,.118,19,17,2,2,0,0,0,0,1,5,0,0,.167,.118,.285),
  buildBatter("Paso Robles","K. Magdaleno","Jr",9,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","N. Contreras","Jr",15,.077,13,13,1,1,0,0,0,0,0,7,0,0,.077,.077,.154),
  // PIONEER VALLEY
  buildBatter("Pioneer Valley","D. Cortez","So",24,.315,88,73,19,23,11,11,0,0,14,15,1,0,.432,.466,.898),
  buildBatter("Pioneer Valley","M. Rosas","Sr",21,.222,63,54,8,12,5,1,0,0,5,16,3,1,.323,.241,.564),
  buildBatter("Pioneer Valley","L. Dreier","Jr",12,.250,21,16,6,4,1,0,0,0,4,5,1,0,.429,.250,.679),
  buildBatter("Pioneer Valley","U. Ponce","Jr",19,.208,56,48,12,10,9,2,1,0,5,19,2,1,.309,.292,.601),
  buildBatter("Pioneer Valley","J. Lopez","Sr",23,.188,71,64,8,12,10,1,1,0,2,20,2,1,.232,.234,.466),
  buildBatter("Pioneer Valley","J. Rojas","Sr",18,.190,28,21,5,4,3,0,0,0,5,4,1,1,.370,.190,.560),
  buildBatter("Pioneer Valley","E. Ponce","Sr",23,.225,89,71,26,16,2,1,0,1,11,11,6,1,.375,.254,.629),
  buildBatter("Pioneer Valley","J. Medina","Jr",15,.111,21,18,2,2,2,0,0,0,2,10,1,0,.200,.111,.311),
  buildBatter("Pioneer Valley","M. Botello","Jr",5,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Pioneer Valley","J. Beltran","Jr",12,.000,6,4,2,0,0,0,0,0,2,2,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","L. Rodriguez","So",2,.000,4,3,2,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Pioneer Valley","M. Andrade","Jr",19,.182,57,44,7,8,9,2,0,0,9,16,2,2,.345,.227,.572),
  buildBatter("Pioneer Valley","I. Enriquez","Jr",22,.444,81,63,17,28,16,3,0,1,13,5,4,1,.556,.540,1.096),
  buildBatter("Pioneer Valley","J. Valdez","Jr",15,.167,18,12,5,2,0,0,0,0,3,5,3,0,.444,.167,.611),
  buildBatter("Pioneer Valley","K. Owen","Sr",20,.212,57,52,6,11,4,1,0,0,2,7,2,1,.263,.231,.494),
  buildBatter("Pioneer Valley","I. Garcia","Jr",15,.267,16,15,0,4,2,0,0,0,1,6,0,0,.312,.267,.579),
  buildBatter("Pioneer Valley","D. Dahl","So",2,.000,6,4,0,0,0,0,0,0,2,0,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","I. Martinez","Sr",16,.250,31,24,5,6,5,0,0,0,6,9,1,2,.400,.250,.650),
  buildBatter("Pioneer Valley","J. Romero","So",2,.500,3,2,1,1,0,0,0,0,1,0,0,0,.667,.500,1.167),
  buildBatter("Pioneer Valley","K. Milner","Jr",16,.458,58,48,7,22,19,7,0,1,9,7,1,0,.552,.667,1.219),
  // RIGHETTI
  buildBatter("Righetti","N. Roberts","Sr",25,.431,93,72,19,31,18,6,2,1,15,7,3,3,.527,.611,1.138),
  buildBatter("Righetti","M. Villegas","So",18,.256,51,39,10,10,7,1,1,1,12,17,0,0,.431,.410,.841),
  buildBatter("Righetti","K. Walker","Jr",25,.500,95,84,34,42,24,13,1,5,9,6,1,1,.547,.857,1.404),
  buildBatter("Righetti","D. Nevarez","Sr",25,.237,73,59,7,14,12,4,0,1,8,16,3,0,.357,.356,.713),
  buildBatter("Righetti","M. Anderson","Sr",25,.341,101,88,14,30,15,3,1,1,10,11,2,0,.420,.432,.852),
  buildBatter("Righetti","N. Lancor","Sr",21,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  buildBatter("Righetti","D. Tovar","Jr",6,.000,7,5,1,0,0,0,0,0,1,3,1,0,.286,.000,.286),
  buildBatter("Righetti","E. Barcenas","Sr",6,1.000,3,2,0,2,1,1,0,0,1,0,0,0,1.000,1.500,2.500),
  buildBatter("Righetti","R. Harney","Sr",5,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Righetti","I. Quintanar","Jr",10,.125,27,24,4,3,3,0,0,0,2,6,0,1,.185,.125,.310),
  buildBatter("Righetti","N. Nevarez","Fr",4,.200,6,5,0,1,0,0,0,0,1,0,0,0,.333,.200,.533),
  buildBatter("Righetti","C. Campa","So",8,.273,11,11,1,3,3,1,0,0,0,1,0,0,.273,.364,.637),
  buildBatter("Righetti","G. Rodriguez","Sr",12,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Righetti","M. Andersen","Jr",19,.316,45,38,5,12,10,3,0,1,4,10,0,2,.364,.474,.838),
  buildBatter("Righetti","N. Kesner","Sr",24,.407,86,59,21,24,16,2,1,0,17,14,8,1,.576,.475,1.051),
  buildBatter("Righetti","J. Rodriguez","Sr",18,.182,12,11,3,2,0,0,0,0,1,4,0,0,.250,.182,.432),
  buildBatter("Righetti","N. Verduzco","So",24,.218,71,55,14,12,6,1,0,0,13,14,0,0,.368,.236,.604),
  buildBatter("Righetti","I. Rocha","So",11,.000,0,0,1,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Righetti","Z. Andersen","So",24,.262,79,61,9,16,15,4,0,5,14,19,3,0,.423,.574,.997),
  buildBatter("Righetti","G. Cole","So",20,.397,75,63,20,25,5,3,0,0,8,7,0,1,.458,.444,.902),
  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","J. Riley","Jr",25,.418,97,79,11,33,15,3,0,0,16,11,1,1,.515,.456,.971),
  buildBatter("San Luis Obispo","F. Avrett","Jr",15,.389,19,18,2,7,9,3,0,0,0,8,0,1,.368,.556,.924),
  buildBatter("San Luis Obispo","T. Blaney","So",25,.359,76,64,16,23,16,5,1,2,12,12,0,0,.461,.563,1.024),
  buildBatter("San Luis Obispo","J. Taylor","Sr",24,.316,68,57,10,18,14,3,0,3,11,18,0,0,.426,.526,.952),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",25,.337,100,92,22,31,14,5,1,0,7,11,0,0,.384,.413,.797),
  buildBatter("San Luis Obispo","C. Stephens","Jr",25,.321,94,78,19,25,14,4,1,0,16,12,0,0,.436,.397,.833),
  buildBatter("San Luis Obispo","P. Wyatt","Jr",25,.325,97,80,19,26,17,1,0,0,9,6,3,1,.409,.338,.746),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",25,.304,83,69,15,21,18,2,0,0,8,19,5,0,.415,.333,.748),
  buildBatter("San Luis Obispo","B. Schafer","Jr",22,.289,69,45,12,13,4,3,0,0,16,5,2,0,.492,.356,.848),
  buildBatter("San Luis Obispo","G. Bramble","Sr",20,.290,76,69,17,20,14,7,0,1,6,11,0,1,.342,.435,.777),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Soderin","Sr",22,.222,23,18,12,4,1,0,0,0,4,8,1,0,.391,.222,.613),
  buildBatter("San Luis Obispo","D. Wilson","Jr",20,.188,17,16,1,3,3,0,0,0,1,3,0,0,.235,.188,.422),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",5,.000,6,6,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","J. Giordano","Jr",7,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // SANTA MARIA
  buildBatter("Santa Maria","Z. Camacho","Fr",3,.250,4,4,2,1,0,1,0,0,0,1,0,0,.250,.500,.750),
  buildBatter("Santa Maria","J. Reyes","Sr",7,.000,5,5,4,0,1,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("Santa Maria","J. Gaitan","So",9,.000,6,5,1,0,0,0,0,0,1,2,0,0,.167,.000,.167),
  buildBatter("Santa Maria","U. Rodriguez","Fr",15,.233,43,30,11,7,5,1,0,0,11,4,2,0,.465,.267,.732),
  buildBatter("Santa Maria","J. Medina-21","Sr",16,.269,57,52,12,14,7,2,0,0,4,10,1,0,.333,.308,.641),
  buildBatter("Santa Maria","D. Martin","Sr",17,.327,65,52,17,17,10,5,0,0,11,7,2,0,.462,.423,.885),
  buildBatter("Santa Maria","O. Sedano","So",5,.333,8,6,2,2,3,0,0,0,2,2,0,0,.500,.333,.833),
  buildBatter("Santa Maria","J. Medina-30","Sr",18,.434,69,53,18,23,9,3,2,0,16,10,0,0,.565,.566,1.131),
  buildBatter("Santa Maria","A. Ybarra","Sr",18,.346,60,52,9,18,10,3,0,0,7,11,1,0,.433,.404,.837),
  buildBatter("Santa Maria","J. Calderon","Sr",18,.411,64,56,13,23,8,0,0,0,5,3,1,1,.460,.411,.871),
  buildBatter("Santa Maria","A. Rice","So",18,.304,60,56,10,17,12,0,0,0,2,8,2,0,.350,.304,.654),
  buildBatter("Santa Maria","A. Rice","Fr",17,.289,48,45,5,13,10,3,0,0,3,11,0,0,.333,.356,.689),
  buildBatter("Santa Maria","B. Alejo","Jr",18,.387,68,62,8,24,19,4,0,0,1,6,4,1,.426,.452,.878),
  buildBatter("Santa Maria","I. Barajas","So",4,.000,2,1,1,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Santa Maria","F. Chavez","Sr",14,.263,24,19,2,5,3,0,0,0,4,5,1,0,.417,.263,.680),
  // SANTA YNEZ
  buildBatter("Santa Ynez","M. Skidmore","Sr",21,.299,90,77,26,23,12,8,0,0,10,11,2,0,.393,.403,.796),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",21,.294,86,68,19,20,16,8,1,0,14,11,4,0,.442,.441,.883),
  buildBatter("Santa Ynez","E. Roberts","So",20,.390,74,59,15,23,13,7,0,0,9,11,4,1,.493,.508,1.001),
  buildBatter("Santa Ynez","T. Jeckell","Jr",21,.408,77,71,25,29,23,7,0,0,6,7,0,0,.455,.507,.962),
  buildBatter("Santa Ynez","S. Rhea","Jr",18,.245,63,49,14,12,10,1,0,0,7,14,4,1,.377,.265,.642),
  buildBatter("Santa Ynez","J. Glover","Jr",21,.534,88,73,27,39,37,5,3,4,12,8,1,2,.591,.849,1.440),
  buildBatter("Santa Ynez","C. Palmer","Jr",10,.182,19,11,5,2,2,0,0,0,6,4,2,0,.526,.182,.708),
  buildBatter("Santa Ynez","B. Cram","So",21,.312,76,64,17,20,7,0,0,0,10,8,1,0,.413,.313,.726),
  buildBatter("Santa Ynez","K. Heiduk","So",20,.420,84,69,29,29,18,4,1,1,12,15,3,0,.524,.551,1.075),
  buildBatter("Santa Ynez","A. Lewis","Fr",10,.150,24,20,5,3,4,0,0,0,2,3,0,1,.217,.150,.367),
  buildBatter("Santa Ynez","D. Pulido","Sr",21,.426,86,61,24,26,20,6,0,1,15,7,7,2,.565,.574,1.139),
  // ST. JOSEPH
  buildBatter("St. Joseph","A. Bluem","Jr",26,.442,100,86,33,38,19,8,0,6,10,2,3,1,.510,.744,1.254),
  buildBatter("St. Joseph","C. Chanley","Sr",26,.364,97,77,17,28,18,5,1,2,8,2,10,2,.474,.532,1.006),
  buildBatter("St. Joseph","M. Majewski","Jr",25,.361,77,61,13,22,9,7,0,0,9,12,6,0,.487,.475,.962),
  buildBatter("St. Joseph","M. Kon","Sr",19,.327,59,49,3,16,12,0,0,0,5,12,3,2,.407,.327,.734),
  buildBatter("St. Joseph","C. Goncalves","Jr",26,.312,91,77,10,24,21,3,0,0,7,12,5,2,.396,.351,.747),
  buildBatter("St. Joseph","S. Grupe","So",10,.308,15,13,2,4,2,0,0,0,1,1,1,0,.400,.308,.708),
  buildBatter("St. Joseph","E. Hendricks","So",18,.276,38,29,11,8,0,1,0,0,6,2,3,0,.447,.310,.757),
  buildBatter("St. Joseph","L. Woodruff","So",20,.244,52,45,8,11,14,3,0,1,3,13,2,0,.320,.378,.698),
  buildBatter("St. Joseph","M. O'Keefe","Jr",20,.244,52,41,6,10,7,1,0,1,8,12,1,1,.373,.341,.714),
  buildBatter("St. Joseph","X. Horta","So",24,.186,71,59,4,11,7,1,0,0,7,8,0,3,.261,.203,.464),
  buildBatter("St. Joseph","S. Covarrubias","Sr",24,.183,88,60,17,11,3,2,0,0,23,15,4,0,.437,.217,.654),
  buildBatter("St. Joseph","R. Roemling","Sr",17,.171,44,35,5,6,0,1,0,0,6,9,2,0,.326,.200,.526),
  buildBatter("St. Joseph","R. Aparicio","Sr",12,.077,13,13,0,1,0,0,0,0,0,1,0,0,.077,.077,.154),
  buildBatter("St. Joseph","J. Chavez","So",24,.062,17,16,5,1,1,0,0,0,1,2,0,0,.118,.063,.180),
  buildBatter("St. Joseph","L. Soares","So",3,.000,3,3,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  buildBatter("St. Joseph","R. Regnier","So",3,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  // TEMPLETON
  buildBatter("Templeton","L. Olsen","Sr",26,.256,107,82,20,21,8,8,0,0,19,20,5,1,.421,.354,.775),
  buildBatter("Templeton","C. Sims","Jr",25,.404,95,89,23,36,9,5,2,0,2,9,4,0,.442,.506,.948),
  buildBatter("Templeton","L. Rivera","Jr",25,.356,100,87,20,31,16,4,2,0,9,12,1,2,.414,.448,.862),
  buildBatter("Templeton","A. Abatti","Jr",19,.065,39,31,1,2,5,1,0,0,5,13,1,1,.211,.097,.308),
  buildBatter("Templeton","J. Beckwith","So",26,.302,80,63,10,19,11,2,1,0,10,12,2,0,.413,.365,.778),
  buildBatter("Templeton","R. Garcia","Jr",20,.167,46,36,4,6,4,0,1,1,7,16,0,1,.295,.306,.601),
  buildBatter("Templeton","L. Stetz","Sr",23,.394,84,71,14,28,17,3,4,0,7,7,5,1,.476,.549,1.025),
  buildBatter("Templeton","N. Capaci","Jr",25,.262,76,61,11,16,7,3,0,0,11,22,2,1,.387,.311,.698),
  buildBatter("Templeton","J. Buys","Jr",20,.267,39,30,3,8,5,1,0,0,6,14,1,2,.385,.300,.685),
  buildBatter("Templeton","E. Abatti","Fr",15,.217,32,23,5,5,3,1,0,0,8,6,1,0,.438,.261,.699),
  buildBatter("Templeton","N. Argain","Sr",19,.231,30,26,3,6,3,1,0,0,2,5,0,0,.286,.269,.555),
  buildBatter("Templeton","T. Miller","So",13,.200,39,35,5,7,5,3,0,0,4,10,0,0,.282,.286,.568),
  buildBatter("Templeton","W. Patch","Sr",12,.267,17,15,3,4,1,1,0,0,2,6,0,0,.353,.333,.686),
  buildBatter("Templeton","C. Hamilton","So",22,.188,61,48,4,9,8,1,0,0,10,24,2,1,.344,.208,.552),
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
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.53,0,0,26.1,18,5,2,6,16,12),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.91,0,0,7.2,7,1,1,4,8,6),
  buildPitcher("Arroyo Grande","G. Pope","Sr",1.11,0,0,38,26,13,6,17,28,10),
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.45,0,0,29,20,14,6,5,26,7),
  buildPitcher("Arroyo Grande","O. King","Jr",1.87,0,0,15,11,7,4,9,20,7),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",3.58,0,0,29.1,24,15,15,9,24,8),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.50,0,0,28,31,31,14,21,18,8),
  buildPitcher("Arroyo Grande","J. Ralph","Jr",0.00,0,0,3,4,3,1,0,0,1),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),
  // ATASCADERO
  buildPitcher("Atascadero","C. Knoph","Jr",8.84,0,2,6.1,7,8,8,7,3,4),
  buildPitcher("Atascadero","V. Rivera","Sr",7.64,0,0,3.2,6,4,4,3,2,3),
  buildPitcher("Atascadero","A. Madrigal","Sr",8.75,1,1,8,9,12,10,10,4,5),
  buildPitcher("Atascadero","M. Cullen","Jr",9.0,0,0,9.1,15,14,12,5,6,9),
  buildPitcher("Atascadero","W. Azelton","So",2.92,3,3,52.2,59,31,22,14,43,12),
  buildPitcher("Atascadero","J. Litten","So",7.0,0,0,6,7,6,6,6,6,3),
  buildPitcher("Atascadero","W. Witt","Sr",3.02,3,4,51,46,33,22,22,38,14),
  buildPitcher("Atascadero","D. Mitchell","Sr",5.19,2,5,28.1,51,34,21,13,17,8),
  // CABRILLO
  buildPitcher("Cabrillo","C. Powell","Jr",6.12,0,1,16,23,18,14,4,9,6),
  buildPitcher("Cabrillo","I. Lopez","So",10.5,0,1,6,12,13,9,4,5,3),
  buildPitcher("Cabrillo","M. Koff","Sr",6.06,1,0,17.1,22,16,15,14,17,10),
  buildPitcher("Cabrillo","J. Clark","So",2.94,0,0,16.2,17,11,7,8,14,9),
  buildPitcher("Cabrillo","F. Lopez","Sr",6.92,0,6,28.1,39,44,28,34,15,9),
  buildPitcher("Cabrillo","L. Vorce","Jr",28.0,0,1,1,1,5,4,5,0,1),
  buildPitcher("Cabrillo","L. Rounds","So",7.0,0,0,3,4,5,3,2,0,1),
  buildPitcher("Cabrillo","J. Low","Sr",4.46,3,6,42.1,39,34,27,20,28,10),
  buildPitcher("Cabrillo","J. Heidt","Jr",8.88,1,3,17.1,36,33,22,7,3,7),
  // MORRO BAY
  buildPitcher("Morro Bay","E. Brown","Sr",3.35,3,4,48,59,31,23,11,44,14),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",2.48,3,2,36.2,34,21,13,9,26,10),
  buildPitcher("Morro Bay","E. Davis","Sr",6.63,3,3,25.1,33,29,24,13,13,11),
  buildPitcher("Morro Bay","C. White","Sr",4.61,1,1,13.2,17,12,9,3,10,11),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","J. Skaggs","Sr",2.33,0,0,3,2,1,1,2,1,2),
  buildPitcher("Morro Bay","H. Stow","",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Deovlet","So",2.80,0,0,5,6,2,2,2,3,2),
  buildPitcher("Morro Bay","C. League","Fr",5.25,1,0,13.1,17,14,10,7,13,8),
  buildPitcher("Morro Bay","M. Miner","Jr",52.50,0,0,0.2,17,9,5,4,1,2),
  // NIPOMO
  buildPitcher("Nipomo","E. Silveira-3","Sr",4.5,4,2,42,45,38,27,36,47,12),
  buildPitcher("Nipomo","K. Simonson","So",6.0,0,0,2.1,1,2,2,3,2,2),
  buildPitcher("Nipomo","J. Lanier","Sr",31.5,0,0,0.2,3,3,3,1,1,1),
  buildPitcher("Nipomo","G. Groshart","Sr",6.81,0,2,12.1,15,17,12,17,12,6),
  buildPitcher("Nipomo","K. Thomas","So",0,0,0,0,2,2,2,0,0,1),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.42,1,1,12,15,14,11,15,4,5),
  buildPitcher("Nipomo","Z. Garibay","Sr",7.87,0,0,2.2,5,3,3,1,1,3),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.25,0,0,8,18,7,6,5,4,4),
  buildPitcher("Nipomo","F. Callaghan","Jr",3.71,0,1,5.2,8,5,3,4,4,4),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.5,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","E. Silveira-19","Sr",2.9,7,3,50.2,44,35,21,29,47,11),
  // PASO ROBLES
  buildPitcher("Paso Robles","J. Soboleski","Jr",3.6,0,0,11.2,16,7,6,7,6,7),
  buildPitcher("Paso Robles","T. Freitas","Sr",3.0,2,0,23.1,20,18,10,10,24,8),
  buildPitcher("Paso Robles","S. Roby","Sr",5.02,0,0,15.1,16,13,11,13,10,6),
  buildPitcher("Paso Robles","B. Lowry","Jr",6.56,0,0,16,18,20,15,8,19,8),
  buildPitcher("Paso Robles","E. Rendon","So",1.89,5,0,40.2,15,15,11,39,66,12),
  buildPitcher("Paso Robles","M. Garcia","Sr",1.4,0,0,10,3,2,2,5,17,8),
  buildPitcher("Paso Robles","X. Hermanson","Jr",0,0,0,1.1,2,1,0,0,0,1),
  buildPitcher("Paso Robles","C. Walker","Sr",0,0,0,0,2,0,0,4,0,1),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.67,2,1,36.2,43,22,14,14,38,10),
  // PIONEER VALLEY
  buildPitcher("Pioneer Valley","D. Cortez","So",1.97,1,0,10.2,11,6,3,5,12,8),
  buildPitcher("Pioneer Valley","J. Lopez","Sr",23.1,0,0,3.1,12,13,11,5,1,2),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",2.67,1,1,21,16,9,8,7,16,7),
  buildPitcher("Pioneer Valley","J. Medina","Jr",14.0,0,1,1,2,2,2,1,3,1),
  buildPitcher("Pioneer Valley","M. Botello","Jr",3.5,0,0,4,7,2,2,2,5,4),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",3.37,3,1,27,27,17,13,20,22,10),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",2.78,3,1,27.2,26,19,11,14,28,9),
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.79,1,2,27.1,29,21,7,12,20,7),
  buildPitcher("Pioneer Valley","I. Garcia","Jr",1.52,4,1,27.2,15,8,6,9,24,9),
  buildPitcher("Pioneer Valley","I. Martinez","Sr",5.0,0,2,7,12,11,5,4,3,4),
  buildPitcher("Pioneer Valley","J. Romero","So",2.1,0,0,3.1,2,2,1,1,0,1),
  // RIGHETTI
  buildPitcher("Righetti","M. Villegas","So",0,0,0,0,0,0,0,0,0,1),
  buildPitcher("Righetti","K. Walker","Jr",2.03,4,0,31,28,16,9,9,30,7),
  buildPitcher("Righetti","D. Nevarez","Sr",0,0,0,0,0,0,0,0,0,1),
  buildPitcher("Righetti","M. Anderson","Sr",4.94,1,0,11.1,7,10,8,9,8,4),
  buildPitcher("Righetti","N. Lancor","Sr",5.19,3,3,28.1,35,28,21,16,22,13),
  buildPitcher("Righetti","E. Barcenas","Sr",5.25,0,0,2.2,0,2,2,3,3,2),
  buildPitcher("Righetti","G. Rodriguez","Sr",5.13,2,2,30,34,27,22,11,12,11),
  buildPitcher("Righetti","M. Andersen","Jr",3.5,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","I. Rocha","So",2.74,5,1,46,53,21,18,14,31,10),
  buildPitcher("Righetti","A. Stevens","Fr",0,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","C. Viker","Sr",6.0,0,0,2.1,4,6,2,4,2,3),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","J. Riley","Jr",2.76,1,2,25.1,25,17,10,7,20,7),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.72,6,4,54,61,29,21,24,62,11),
  buildPitcher("San Luis Obispo","T. Blaney","So",3.82,1,0,11,14,9,6,6,5,6),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",3.15,0,0,6.2,8,7,3,6,3,7),
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.44,6,1,40.2,42,27,20,18,22,8),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",3.67,2,1,21,25,21,11,13,21,8),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",13.12,0,0,5.1,11,11,10,3,4,5),
  buildPitcher("San Luis Obispo","L. Drenckpohl","Sr",18.00,0,0,2.1,2,6,6,6,1,1),
  // SANTA MARIA
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.85,0,0,8.2,9,10,6,5,9,3),
  buildPitcher("Santa Maria","J. Medina-21","Sr",6.42,0,0,12,17,11,11,11,15,5),
  buildPitcher("Santa Maria","D. Martin","Sr",4.41,0,0,33.1,39,22,21,11,38,8),
  buildPitcher("Santa Maria","J. Medina-30","Sr",5.7,0,0,27,33,36,22,30,45,12),
  buildPitcher("Santa Maria","A. Ybarra","Sr",0,0,0,1,1,0,0,0,0,1),
  buildPitcher("Santa Maria","J. Calderon","Sr",4.67,0,0,3,2,2,2,4,3,2),
  buildPitcher("Santa Maria","A. Rice","Fr",19.09,0,0,3.2,12,15,10,5,2,3),
  buildPitcher("Santa Maria","B. Alejo","Jr",1.8,1,0,23.1,20,15,6,7,18,8),
  // SANTA YNEZ
  buildPitcher("Santa Ynez","E. Roberts","So",1.44,4,0,39,39,9,8,10,40,9),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",1.83,5,3,57.1,44,27,15,25,83,11),
  buildPitcher("Santa Ynez","S. Rhea","Jr",4.67,0,0,3,1,2,2,4,4,2),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.71,0,1,11.1,8,9,6,13,20,6),
  buildPitcher("Santa Ynez","C. Palmer","Jr",1.71,3,0,16.1,5,5,4,11,22,4),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.83,1,0,7.2,5,2,2,4,9,6),
  buildPitcher("Santa Ynez","A. Lewis","Fr",7.0,0,0,4,5,5,4,4,4,2),
  // ST. JOSEPH
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.84,1,0,16.2,9,10,2,9,12,8),
  buildPitcher("St. Joseph","X. Horta","So",1.89,3,1,33.1,26,14,9,17,36,8),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.32,7,2,48.1,43,23,16,10,62,10),
  buildPitcher("St. Joseph","L. Woodruff","So",2.54,5,0,30.1,21,13,11,9,24,10),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","C. Chanley","Sr",2.28,4,2,30.2,26,14,10,23,33,9),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",3.71,0,0,5.2,8,7,3,1,5,5),
  buildPitcher("St. Joseph","S. Grupe","So",21.00,0,0,1,3,3,3,1,0,1),
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0,3,1,13.1,7,2,0,5,9,5),
  buildPitcher("Templeton","C. Sims","Jr",4.9,0,0,10,8,9,7,9,5,4),
  buildPitcher("Templeton","L. Rivera","Jr",3.29,4,0,44.2,49,30,21,20,37,10),
  buildPitcher("Templeton","A. Abatti","Jr",2.1,0,0,30,28,30,9,18,28,9),
  buildPitcher("Templeton","R. Garcia","Jr",4.2,0,0,15,17,10,9,6,8,8),
  buildPitcher("Templeton","N. Capaci","Jr",0,0,0,0.2,0,0,0,0,1,1),
  buildPitcher("Templeton","J. Buys","Jr",0,0,0,0,0,0,0,0,0,1),
  buildPitcher("Templeton","N. Argain","Sr",4.87,2,1,46,57,52,32,29,35,14),
  buildPitcher("Templeton","W. Patch","Sr",3.28,1,0,10.2,14,7,5,8,11,5),
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
    { abbr:"SJ",  name:"St. Joseph",          lw:11,ll:2, ow:20, ol:5,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:8, ll:5, ow:18, ol:8,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:8, ll:5, ow:16, ol:9,  ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:5, ll:8, ow:11, ol:10, ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:4, ll:9, ow:13, ol:11, ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:3, ll:10,ow:11, ol:14, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:10,ll:2, ow:16, ol:9,  ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:7, ll:4, ow:12, ol:12, ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:5, ll:6, ow:9,  ol:16, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:4, ll:7, ow:11, ol:15, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:9, ow:5,  ol:20, ot:0 },
  ],
  ocean: [
    { abbr:"PV",  name:"Pioneer Valley", lw:5, ll:3, ow:13, ol:9,  ot:2 },
    { abbr:"SY",  name:"Santa Ynez",     lw:6, ll:3, ow:15, ol:6,  ot:0 },
    { abbr:"NIP", name:"Nipomo",         lw:5, ll:3, ow:13, ol:11, ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:1, ll:8, ow:8,  ol:10, ot:0 },
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
