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
const DATA_UPDATED = "2026-05-09"; // YYYY-MM-DD — stats through May 9

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
    overall: "22-5-1",
    leagueRecord: "13-2",
    wins: 22, losses: 5, ties: 1,
    leagueWins: 13, leagueLosses: 2,
    caRank: 34,
    gp: 28,
    teamBavg: .285, teamOBP: .398, teamSLG: .384,
    teamERA: 2.32, teamIP: 190
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "20-8",
    leagueRecord: "10-5",
    wins: 20, losses: 8, ties: 0,
    leagueWins: 10, leagueLosses: 5,
    caRank: 74,
    gp: 28,
    teamBavg: .339, teamOBP: .431, teamSLG: .502,
    teamERA: 1.98, teamIP: 187.1
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
    caRank: 415,
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
    overall: "14-9-2",
    leagueRecord: "6-3",
    wins: 14, losses: 9, ties: 2,
    leagueWins: 6, leagueLosses: 3,
    caRank: 510,
    gp: 25,
    teamBavg: .261, teamOBP: .382, teamSLG: .323,
    teamERA: 2.98, teamIP: 167
  },
  {
    id: "nipomo",
    name: "Nipomo",
    mascot: "Titans",
    location: "Nipomo, CA",
    coach: "Caleb Buendia",
    colors: "Black, Cardinal, Silver",
    league: "CCAA - Ocean",
    overall: "13-12",
    leagueRecord: "5-4",
    wins: 13, losses: 12, ties: 0,
    leagueWins: 5, leagueLosses: 4,
    caRank: 444,
    gp: 25,
    teamBavg: .318, teamOBP: .398, teamSLG: .366,
    teamERA: 5.04, teamIP: 158.1
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "12-13-1",
    leagueRecord: "7-5",
    wins: 12, losses: 13, ties: 1,
    leagueWins: 7, leagueLosses: 5,
    caRank: 281,
    gp: 26,
    teamBavg: .307, teamOBP: .382, teamSLG: .422,
    teamERA: 3.20, teamIP: 162
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "17-10",
    leagueRecord: "10-2",
    wins: 17, losses: 10, ties: 0,
    leagueWins: 10, leagueLosses: 2,
    caRank: 268,
    gp: 27,
    teamBavg: .320, teamOBP: .413, teamSLG: .406,
    teamERA: 3.75, teamIP: 183
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "16-11",
    leagueRecord: "8-7",
    wins: 16, losses: 11, ties: 0,
    leagueWins: 8, leagueLosses: 7,
    caRank: 160,
    gp: 27,
    teamBavg: .331, teamOBP: .441, teamSLG: .470,
    teamERA: 3.89, teamIP: 169.1
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "15-12",
    leagueRecord: "5-10",
    wins: 15, losses: 12, ties: 0,
    leagueWins: 5, leagueLosses: 10,
    caRank: 255,
    gp: 26,
    teamBavg: .303, teamOBP: .386, teamSLG: .413,
    teamERA: 4.17, teamIP: 168
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "11-16",
    leagueRecord: "3-12",
    wins: 11, losses: 16, ties: 0,
    leagueWins: 3, leagueLosses: 12,
    caRank: 367,
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
    overall: "12-15",
    leagueRecord: "5-7",
    wins: 12, losses: 15, ties: 0,
    leagueWins: 5, leagueLosses: 7,
    caRank: 527,
    gp: 27,
    teamBavg: .285, teamOBP: .385, teamSLG: .365,
    teamERA: 3.22, teamIP: 178.1
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "S.D. Harrow",
    colors: "Navy, Vegas Gold",
    league: "CCAA - Mountain",
    overall: "12-11",
    leagueRecord: "6-9",
    wins: 12, losses: 11, ties: 0,
    leagueWins: 6, leagueLosses: 9,
    caRank: 197,
    gp: 23,
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
    overall: "10-16",
    leagueRecord: "6-6",
    wins: 10, losses: 16, ties: 0,
    leagueWins: 6, leagueLosses: 6,
    caRank: 564,
    gp: 26,
    teamBavg: .226, teamOBP: .369, teamSLG: .288,
    teamERA: 4.18, teamIP: 172.1
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
    caRank: 753,
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
    overall: "5-21",
    leagueRecord: "2-10",
    wins: 5, losses: 21, ties: 0,
    leagueWins: 2, leagueLosses: 10,
    caRank: 709,
    gp: 26,
    teamBavg: .244, teamOBP: .328, teamSLG: .291,
    teamERA: 5.91, teamIP: 161
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
  buildBatter("Arroyo Grande","A. Winter","Jr",24,.543,57,46,15,25,10,1,0,0,5,3,5,1,.614,.565,1.179),
  buildBatter("Arroyo Grande","R. Servin","Jr",28,.465,115,86,35,40,27,12,2,4,25,8,3,1,.591,.791,1.382),
  buildBatter("Arroyo Grande","T. Kurth","Sr",24,.403,90,77,15,31,25,7,0,4,7,12,3,1,.466,.649,1.115),
  buildBatter("Arroyo Grande","B. Paz","Fr",26,.343,77,67,19,23,19,3,1,5,6,15,1,1,.400,.642,1.042),
  buildBatter("Arroyo Grande","R. Bronson","Sr",19,.343,39,35,7,12,8,1,0,2,3,8,0,0,.395,.543,.938),
  buildBatter("Arroyo Grande","O. King","Jr",17,.308,16,13,3,4,1,0,0,0,3,6,0,0,.438,.308,.746),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",19,.316,23,19,1,6,4,1,0,0,4,9,0,0,.435,.368,.803),
  buildBatter("Arroyo Grande","J. Ralph","Jr",28,.316,113,98,21,31,9,5,0,1,12,7,2,1,.398,.398,.796),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",27,.299,102,87,22,26,28,1,0,6,7,12,6,2,.382,.517,.899),
  buildBatter("Arroyo Grande","J. Stumph","Jr",25,.299,87,67,18,20,12,4,1,1,15,9,2,0,.440,.433,.873),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",24,.289,52,45,9,13,7,3,0,1,5,10,1,0,.373,.422,.795),
  buildBatter("Arroyo Grande","M. Richwine","Sr",24,.283,63,53,12,15,13,2,0,2,6,14,1,0,.367,.434,.801),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",26,.283,72,60,11,17,10,4,0,0,8,9,1,0,.377,.350,.727),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",16,.227,25,22,8,5,4,0,0,0,2,6,1,0,.320,.227,.547),
  buildBatter("Arroyo Grande","K. Warwick","Jr",22,.182,37,33,7,6,2,0,1,0,0,11,3,0,.250,.242,.492),
  buildBatter("Arroyo Grande","Z. Johnson","Jr",14,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Arroyo Grande","M. Hicks","Sr",7,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // ATASCADERO
  buildBatter("Atascadero","S. Ernst","Sr",21,.218,63,55,5,12,4,1,0,0,6,26,2,0,.317,.236,.553),
  buildBatter("Atascadero","C. Knoph","Jr",8,.200,6,5,0,1,2,0,0,0,1,3,0,0,.333,.200,.533),
  buildBatter("Atascadero","E. Wanner","Sr",25,.209,96,67,18,14,10,3,0,0,19,9,2,3,.385,.254,.639),
  buildBatter("Atascadero","V. Rivera","Sr",6,.125,9,8,1,1,1,0,0,0,1,4,0,0,.222,.125,.347),
  buildBatter("Atascadero","A. Madrigal","Sr",12,.133,17,15,2,2,1,1,0,0,2,8,0,0,.235,.200,.435),
  buildBatter("Atascadero","M. Cullen","Jr",10,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","M. Zepeda","Sr",26,.224,84,67,7,15,10,2,1,0,13,14,0,0,.350,.284,.634),
  buildBatter("Atascadero","R. Brown","Sr",14,.188,17,16,4,3,0,0,0,0,1,6,0,0,.235,.188,.422),
  buildBatter("Atascadero","W. Azelton","So",24,.170,65,47,6,8,9,3,1,0,11,19,5,2,.369,.277,.646),
  buildBatter("Atascadero","J. Litten","So",25,.222,80,63,9,14,8,4,0,0,9,17,4,3,.342,.286,.628),
  buildBatter("Atascadero","W. Litten","Sr",26,.309,98,81,11,25,22,5,1,1,7,18,9,1,.418,.432,.850),
  buildBatter("Atascadero","M. Beck","Jr",24,.175,47,40,11,7,3,0,0,0,5,12,1,0,.283,.175,.458),
  buildBatter("Atascadero","A. Donaldson","So",21,.264,68,53,11,14,3,0,0,0,11,13,3,0,.418,.264,.682),
  buildBatter("Atascadero","W. Witt","Sr",25,.250,99,64,19,16,9,4,0,1,31,23,2,0,.505,.359,.864),
  buildBatter("Atascadero","N. Simon","Sr",1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Atascadero","C. Savino","Fr",5,.111,13,9,1,1,1,0,0,0,4,5,0,0,.385,.111,.496),
  buildBatter("Atascadero","T. Knutson","So",3,.000,5,4,0,0,0,0,0,0,1,3,0,0,.200,.000,.200),
  buildBatter("Atascadero","D. Mitchell","Sr",21,.246,77,69,11,17,8,5,1,0,4,11,3,0,.316,.348,.664),
  // CABRILLO
  buildBatter("Cabrillo","C. Powell","Jr",26,.200,92,80,15,16,3,4,0,0,11,10,1,0,.304,.250,.554),
  buildBatter("Cabrillo","I. Lopez","So",10,.042,29,24,1,1,2,0,0,0,3,6,1,0,.179,.042,.221),
  buildBatter("Cabrillo","G. Barraza","Sr",26,.354,90,79,37,28,9,2,0,1,7,9,3,1,.422,.418,.840),
  buildBatter("Cabrillo","M. Koff","Sr",25,.375,77,64,13,24,13,8,0,0,6,11,2,1,.438,.500,.938),
  buildBatter("Cabrillo","J. Clark","So",23,.260,60,50,7,13,9,1,0,0,5,21,1,1,.333,.280,.613),
  buildBatter("Cabrillo","F. Lopez","Sr",26,.225,88,71,15,16,8,3,0,0,13,21,2,1,.356,.268,.624),
  buildBatter("Cabrillo","F. Hernandez","Jr",26,.256,90,82,8,21,9,3,2,0,4,14,3,1,.311,.341,.652),
  buildBatter("Cabrillo","E. Bradshaw","Fr",1,1.000,1,1,0,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  buildBatter("Cabrillo","L. Ragoza","Jr",19,.185,31,27,3,5,1,0,0,0,2,10,2,0,.290,.185,.475),
  buildBatter("Cabrillo","L. Vorce","Jr",14,.243,41,37,3,9,2,0,0,0,3,1,0,1,.300,.243,.543),
  buildBatter("Cabrillo","M. Cerna-Medina","So",7,.200,6,5,0,1,0,0,0,0,1,2,0,0,.333,.200,.533),
  buildBatter("Cabrillo","L. Rounds","So",3,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Cabrillo","C. Sunndeniyage","Jr",25,.260,56,50,5,13,1,0,0,0,2,10,3,1,.327,.260,.587),
  buildBatter("Cabrillo","J. Low","Sr",21,.244,49,41,3,10,2,3,0,0,5,6,3,0,.367,.317,.684),
  buildBatter("Cabrillo","A. Torres","Sr",13,.038,26,26,1,1,0,0,0,0,0,7,0,0,.038,.038,.076),
  buildBatter("Cabrillo","K. Sousa","Fr",2,.000,3,2,1,0,0,0,0,0,1,2,0,0,.333,.000,.333),
  buildBatter("Cabrillo","D. Vineyard","So",9,.118,20,17,3,2,0,0,0,0,2,7,1,0,.167,.118,.285),
  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",26,.427,102,75,37,32,23,12,1,5,16,11,11,0,.578,.813,1.391),
  buildBatter("Morro Bay","E. Brown","Sr",25,.369,72,65,19,24,11,0,0,0,5,3,2,0,.431,.369,.800),
  buildBatter("Morro Bay","C. White","Sr",25,.351,103,77,20,27,31,3,0,5,11,13,2,13,.388,.584,.972),
  buildBatter("Morro Bay","J. Deovlet","So",26,.329,93,79,14,26,15,5,0,0,10,6,2,2,.409,.392,.801),
  buildBatter("Morro Bay","C. Wilkinson","Sr",24,.316,89,76,17,24,18,7,1,1,13,17,0,0,.416,.474,.890),
  buildBatter("Morro Bay","T. Gray","Sr",26,.282,93,85,8,24,9,5,0,0,2,13,5,1,.333,.341,.674),
  buildBatter("Morro Bay","C. Waldon","Jr",23,.265,76,68,8,18,9,4,0,0,5,17,3,0,.342,.324,.666),
  buildBatter("Morro Bay","E. Davis","Sr",23,.261,74,69,11,18,8,2,0,0,4,15,0,1,.297,.290,.587),
  buildBatter("Morro Bay","J. Skaggs","Sr",23,.241,61,58,8,14,3,2,0,0,1,8,2,0,.279,.276,.555),
  buildBatter("Morro Bay","C. League","Fr",23,.200,41,35,11,7,4,1,0,0,5,8,0,1,.293,.229,.522),
  buildBatter("Morro Bay","B. Walker","",18,.056,24,18,3,1,0,0,0,0,3,6,3,0,.292,.056,.348),
  buildBatter("Morro Bay","V. Nelson","",8,.000,4,3,1,0,0,0,0,0,0,1,1,0,.250,.000,.250),
  buildBatter("Morro Bay","H. Stow","",3,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  // NIPOMO
  buildBatter("Nipomo","J. Anderson","Sr",6,.500,4,4,1,2,0,0,0,0,0,2,0,0,.500,.500,1.000),
  buildBatter("Nipomo","H. Roesner","Jr",17,.136,24,22,4,3,1,0,0,0,2,7,0,0,.208,.136,.344),
  buildBatter("Nipomo","E. Silveira-3","Sr",24,.333,68,63,8,21,9,2,0,0,3,7,0,1,.358,.365,.723),
  buildBatter("Nipomo","T. Oxley","Sr",23,.212,65,52,11,11,3,2,0,0,10,23,1,1,.344,.250,.594),
  buildBatter("Nipomo","K. Simonson","So",19,.167,38,36,2,6,3,0,0,0,0,8,0,2,.158,.167,.325),
  buildBatter("Nipomo","J. Lanier","Sr",5,.000,2,2,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","B. Hageman","So",24,.481,96,79,30,38,12,4,0,0,7,7,2,1,.528,.532,1.060),
  buildBatter("Nipomo","G. Groshart","Sr",21,.356,82,73,10,26,28,10,0,0,5,4,2,2,.402,.493,.895),
  buildBatter("Nipomo","K. Thomas","So",8,.000,3,1,1,0,0,0,0,0,1,0,1,0,.667,.000,.667),
  buildBatter("Nipomo","C. Moulden","So",24,.349,91,83,16,29,27,7,0,0,5,9,2,0,.400,.434,.834),
  buildBatter("Nipomo","L. Hobbs","Sr",24,.333,98,72,40,24,4,1,0,0,9,2,16,1,.500,.347,.847),
  buildBatter("Nipomo","Z. Garibay","Sr",5,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","L. Hobbs","Fr",24,.279,81,68,7,19,10,2,0,0,10,5,2,0,.388,.309,.697),
  buildBatter("Nipomo","F. Callaghan","Jr",6,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","A. Mendoza","Jr",9,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  buildBatter("Nipomo","T. Barr","Sr",20,.245,57,49,3,12,10,1,0,0,6,16,1,1,.333,.265,.598),
  buildBatter("Nipomo","E. Silveira-19","Sr",24,.351,90,77,14,27,20,4,0,0,8,10,4,1,.433,.403,.836),
  // PASO ROBLES
  buildBatter("Paso Robles","G. Berlingeri","Sr",5,.400,11,10,2,4,0,0,0,0,1,2,0,0,.455,.400,.855),
  buildBatter("Paso Robles","J. Soboleski","Jr",24,.319,79,72,15,23,12,9,1,1,6,13,1,0,.380,.514,.894),
  buildBatter("Paso Robles","T. Freitas","Sr",24,.321,92,84,19,27,15,8,0,0,3,1,3,2,.359,.417,.776),
  buildBatter("Paso Robles","S. Roby","Sr",7,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Paso Robles","B. Lowry","Jr",24,.423,88,71,20,30,22,4,1,1,13,10,1,3,.500,.549,1.049),
  buildBatter("Paso Robles","C. Glover","Sr",17,.208,33,24,4,5,1,1,0,0,5,7,2,0,.387,.250,.637),
  buildBatter("Paso Robles","C. Contreras","Jr",16,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","L. Ross","Sr",2,.000,2,2,1,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  buildBatter("Paso Robles","E. Rendon","So",23,.288,81,73,16,21,17,5,1,3,2,8,5,1,.346,.507,.853),
  buildBatter("Paso Robles","E. Dobroth","Jr",24,.299,91,77,19,23,18,2,1,0,9,14,4,1,.396,.351,.747),
  buildBatter("Paso Robles","M. Garcia","Sr",23,.360,88,75,27,27,13,5,1,0,10,9,3,0,.455,.453,.908),
  buildBatter("Paso Robles","C. Prieto","Jr",22,.317,69,60,13,19,12,6,0,0,4,9,1,2,.358,.417,.775),
  buildBatter("Paso Robles","E. Nevarez","Jr",8,.214,14,14,1,3,3,2,0,0,0,6,0,0,.214,.357,.571),
  buildBatter("Paso Robles","X. Hermanson","Jr",23,.283,73,60,13,17,13,6,0,1,10,6,1,1,.389,.433,.822),
  buildBatter("Paso Robles","J. Lopez","Jr",10,.444,13,9,2,4,2,1,0,0,3,2,0,0,.583,.556,1.139),
  buildBatter("Paso Robles","L. Christensen","Jr",13,.118,19,17,2,2,0,0,0,0,1,5,0,0,.167,.118,.285),
  buildBatter("Paso Robles","K. Magdaleno","Jr",10,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","N. Contreras","Jr",15,.077,13,13,1,1,0,0,0,0,0,7,0,0,.077,.077,.154),
  // PIONEER VALLEY
  buildBatter("Pioneer Valley","D. Cortez","So",25,.338,92,77,21,26,12,12,0,0,14,15,1,0,.446,.494,.940),
  buildBatter("Pioneer Valley","M. Rosas","Sr",22,.224,67,58,9,13,7,1,0,0,5,18,3,1,.318,.241,.559),
  buildBatter("Pioneer Valley","L. Dreier","Jr",13,.250,21,16,7,4,1,0,0,0,4,5,1,0,.429,.250,.679),
  buildBatter("Pioneer Valley","U. Ponce","Jr",19,.208,56,48,12,10,9,2,1,0,5,19,2,1,.309,.292,.601),
  buildBatter("Pioneer Valley","J. Lopez","Sr",24,.185,75,65,9,12,11,1,1,0,4,20,2,2,.247,.231,.478),
  buildBatter("Pioneer Valley","J. Rojas","Sr",19,.167,32,24,5,4,4,0,0,0,5,4,1,2,.333,.167,.500),
  buildBatter("Pioneer Valley","E. Ponce","Sr",24,.227,93,75,26,17,3,1,0,1,11,12,6,1,.370,.253,.623),
  buildBatter("Pioneer Valley","J. Medina","Jr",15,.111,21,18,2,2,2,0,0,0,2,10,1,0,.200,.111,.311),
  buildBatter("Pioneer Valley","M. Botello","Jr",5,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Pioneer Valley","J. Beltran","Jr",13,.000,6,4,2,0,0,0,0,0,2,2,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","L. Rodriguez","So",3,.167,8,6,3,1,0,0,0,0,1,3,1,0,.375,.167,.542),
  buildBatter("Pioneer Valley","M. Andrade","Jr",19,.182,57,44,7,8,9,2,0,0,9,16,2,2,.345,.227,.572),
  buildBatter("Pioneer Valley","I. Enriquez","Jr",23,.439,85,66,19,29,18,3,0,1,14,5,4,1,.553,.530,1.083),
  buildBatter("Pioneer Valley","J. Valdez","Jr",16,.167,18,12,5,2,0,0,0,0,3,5,3,0,.444,.167,.611),
  buildBatter("Pioneer Valley","K. Owen","Sr",21,.222,59,54,7,12,4,1,0,0,2,7,2,1,.271,.241,.512),
  buildBatter("Pioneer Valley","I. Garcia","Jr",15,.267,16,15,0,4,2,0,0,0,1,6,0,0,.312,.267,.579),
  buildBatter("Pioneer Valley","D. Dahl","So",2,.000,6,4,0,0,0,0,0,0,2,0,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","I. Martinez","Sr",17,.269,35,26,5,7,6,0,0,0,7,9,2,0,.424,.269,.693),
  buildBatter("Pioneer Valley","J. Romero","So",2,.500,3,2,1,1,0,0,0,0,1,0,0,0,.667,.500,1.167),
  buildBatter("Pioneer Valley","K. Milner","Jr",17,.458,60,48,7,22,19,7,0,1,11,7,1,0,.567,.667,1.234),
  // RIGHETTI
  buildBatter("Righetti","N. Roberts","Sr",26,.408,98,76,19,31,19,6,2,1,15,8,4,3,.510,.579,1.089),
  buildBatter("Righetti","M. Villegas","So",19,.256,51,39,10,10,7,1,1,1,12,17,0,0,.431,.410,.841),
  buildBatter("Righetti","K. Walker","Jr",26,.506,100,89,36,45,27,13,1,5,9,6,1,1,.550,.843,1.393),
  buildBatter("Righetti","D. Nevarez","Sr",26,.242,77,62,8,15,12,5,0,1,9,16,3,0,.365,.371,.736),
  buildBatter("Righetti","M. Anderson","Sr",26,.326,105,92,14,30,15,3,1,1,10,13,2,0,.404,.413,.817),
  buildBatter("Righetti","N. Lancor","Sr",22,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  buildBatter("Righetti","D. Tovar","Jr",6,.000,7,5,1,0,0,0,0,0,1,3,1,0,.286,.000,.286),
  buildBatter("Righetti","E. Barcenas","Sr",6,1.000,3,2,0,2,1,1,0,0,1,0,0,0,1.000,1.500,2.500),
  buildBatter("Righetti","R. Harney","Sr",5,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Righetti","I. Quintanar","Jr",10,.125,27,24,4,3,3,0,0,0,2,6,0,1,.185,.125,.310),
  buildBatter("Righetti","N. Nevarez","Fr",4,.200,6,5,0,1,0,0,0,0,1,0,0,0,.333,.200,.533),
  buildBatter("Righetti","C. Campa","So",9,.250,12,12,1,3,3,1,0,0,0,1,0,0,.250,.333,.583),
  buildBatter("Righetti","G. Rodriguez","Sr",13,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Righetti","M. Andersen","Jr",20,.279,50,43,5,12,10,3,0,1,4,12,0,2,.327,.419,.746),
  buildBatter("Righetti","N. Kesner","Sr",25,.391,91,64,21,25,17,2,1,0,17,14,8,1,.556,.453,1.009),
  buildBatter("Righetti","J. Rodriguez","Sr",19,.182,12,11,4,2,0,0,0,0,1,4,0,0,.250,.182,.432),
  buildBatter("Righetti","N. Verduzco","So",25,.232,74,56,15,13,6,1,0,0,15,14,0,0,.394,.250,.644),
  buildBatter("Righetti","I. Rocha","So",12,.000,0,0,1,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Righetti","Z. Andersen","So",25,.286,84,63,9,18,15,4,0,5,15,19,5,0,.458,.587,1.045),
  buildBatter("Righetti","G. Cole","So",21,.406,78,64,21,26,5,3,0,0,10,7,0,1,.480,.453,.933),
  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","J. Riley","Jr",27,.412,103,85,12,35,18,4,0,0,16,12,1,1,.505,.459,.964),
  buildBatter("San Luis Obispo","F. Avrett","Jr",15,.389,19,18,2,7,9,3,0,0,0,8,0,1,.368,.556,.924),
  buildBatter("San Luis Obispo","T. Blaney","So",27,.343,82,70,17,24,17,6,1,2,12,13,0,0,.439,.543,.982),
  buildBatter("San Luis Obispo","J. Taylor","Sr",26,.339,74,62,11,21,17,4,0,3,11,19,1,0,.446,.548,.994),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",27,.337,106,98,24,33,14,5,1,0,7,11,0,0,.381,.408,.789),
  buildBatter("San Luis Obispo","C. Stephens","Jr",27,.325,100,83,19,27,14,4,1,0,17,12,0,0,.440,.398,.838),
  buildBatter("San Luis Obispo","P. Wyatt","Jr",27,.317,101,82,20,26,17,1,0,0,11,6,3,1,.412,.329,.741),
  buildBatter("San Luis Obispo","B. Schafer","Jr",24,.314,75,51,15,16,4,4,0,0,16,5,2,0,.493,.392,.885),
  buildBatter("San Luis Obispo","G. Bramble","Sr",22,.288,80,73,17,21,15,7,0,1,6,11,0,1,.338,.425,.763),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",27,.280,89,75,15,21,18,2,0,0,8,23,5,0,.386,.307,.693),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Soderin","Sr",24,.200,26,20,13,4,1,0,0,0,5,9,1,0,.385,.200,.585),
  buildBatter("San Luis Obispo","D. Wilson","Jr",22,.167,19,18,1,3,3,0,0,0,1,3,0,0,.211,.167,.378),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",6,.000,7,7,0,0,0,0,0,0,0,5,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","J. Giordano","Jr",9,1.000,1,1,0,1,0,1,0,0,0,0,0,0,1.000,2.000,3.000),
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
  buildBatter("St. Joseph","A. Bluem","Jr",28,.430,108,93,34,40,20,8,0,6,10,2,4,1,.500,.710,1.210),
  buildBatter("St. Joseph","C. Chanley","Sr",28,.369,105,84,19,31,23,5,1,3,9,2,10,2,.476,.560,1.036),
  buildBatter("St. Joseph","M. Majewski","Jr",27,.368,85,68,17,25,11,8,0,0,9,12,7,0,.488,.485,.973),
  buildBatter("St. Joseph","C. Goncalves","Jr",28,.321,99,84,10,27,24,3,0,0,7,12,5,3,.394,.357,.751),
  buildBatter("St. Joseph","S. Grupe","So",10,.308,15,13,2,4,2,0,0,0,1,1,1,0,.400,.308,.708),
  buildBatter("St. Joseph","M. Kon","Sr",21,.304,67,56,4,17,12,0,0,0,6,13,3,2,.388,.304,.692),
  buildBatter("St. Joseph","E. Hendricks","So",20,.278,46,36,13,10,0,1,0,0,6,3,4,0,.435,.306,.741),
  buildBatter("St. Joseph","L. Woodruff","So",21,.261,53,46,9,12,15,3,0,2,3,13,2,0,.333,.457,.790),
  buildBatter("St. Joseph","M. O'Keefe","Jr",20,.244,52,41,6,10,7,1,0,1,8,12,1,1,.373,.341,.714),
  buildBatter("St. Joseph","S. Covarrubias","Sr",26,.200,95,65,20,13,4,3,0,0,25,17,4,0,.447,.246,.693),
  buildBatter("St. Joseph","X. Horta","So",26,.172,77,64,4,11,8,1,0,0,8,8,0,3,.253,.188,.440),
  buildBatter("St. Joseph","R. Roemling","Sr",19,.171,50,41,7,7,2,1,0,0,6,11,2,0,.306,.195,.501),
  buildBatter("St. Joseph","R. Aparicio","Sr",13,.077,13,13,0,1,0,0,0,0,0,1,0,0,.077,.077,.154),
  buildBatter("St. Joseph","J. Chavez","So",26,.062,17,16,5,1,1,0,0,0,1,2,0,0,.118,.063,.180),
  buildBatter("St. Joseph","R. Schaffer","So",2,.000,2,0,0,0,0,0,0,0,0,0,2,0,1.000,.000,1.000),
  buildBatter("St. Joseph","L. Soares","So",3,.000,3,3,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  buildBatter("St. Joseph","R. Regnier","So",3,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  // TEMPLETON
  buildBatter("Templeton","L. Olsen","Sr",27,.256,111,86,20,22,8,8,0,0,19,21,5,1,.414,.349,.763),
  buildBatter("Templeton","C. Sims","Jr",26,.398,99,93,23,37,9,5,2,0,2,9,4,0,.434,.495,.929),
  buildBatter("Templeton","L. Rivera","Jr",26,.363,104,91,21,33,16,4,2,0,9,12,1,2,.417,.451,.868),
  buildBatter("Templeton","A. Abatti","Jr",20,.065,39,31,1,2,5,1,0,0,5,13,1,1,.211,.097,.308),
  buildBatter("Templeton","J. Beckwith","So",27,.292,83,65,10,19,12,2,1,0,10,12,2,1,.397,.354,.751),
  buildBatter("Templeton","R. Garcia","Jr",20,.167,46,36,4,6,4,0,1,1,7,16,0,1,.295,.306,.601),
  buildBatter("Templeton","L. Stetz","Sr",24,.413,88,75,15,31,18,3,4,0,7,7,5,1,.489,.560,1.049),
  buildBatter("Templeton","N. Capaci","Jr",26,.277,80,65,11,18,7,4,0,0,11,22,2,1,.392,.338,.730),
  buildBatter("Templeton","J. Buys","Jr",21,.267,39,30,4,8,5,1,0,0,6,14,1,2,.385,.300,.685),
  buildBatter("Templeton","E. Abatti","Fr",16,.240,36,25,6,6,4,1,0,0,9,6,1,1,.444,.280,.724),
  buildBatter("Templeton","N. Argain","Sr",20,.231,30,26,3,6,3,1,0,0,2,5,0,0,.286,.269,.555),
  buildBatter("Templeton","T. Miller","So",14,.184,42,38,5,7,6,3,0,0,4,10,0,0,.262,.263,.525),
  buildBatter("Templeton","W. Patch","Sr",12,.267,17,15,3,4,1,1,0,0,2,6,0,0,.353,.333,.686),
  buildBatter("Templeton","C. Hamilton","So",23,.196,64,51,4,10,8,1,0,0,10,24,2,1,.344,.216,.560),
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
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.47,0,0,30,22,5,2,6,17,13),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.91,0,0,7.2,7,1,1,4,8,6),
  buildPitcher("Arroyo Grande","G. Pope","Sr",0.93,0,0,45,29,13,6,18,38,11),
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.30,0,0,32.1,21,18,6,10,28,8),
  buildPitcher("Arroyo Grande","O. King","Jr",1.87,0,0,15,11,7,4,9,20,7),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",3.58,0,0,29.1,24,15,15,9,24,8),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.50,0,0,28,31,31,14,21,18,8),
  buildPitcher("Arroyo Grande","J. Ralph","Jr",0.00,0,0,3,4,3,1,0,0,1),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),
  // ATASCADERO
  buildPitcher("Atascadero","C. Knoph","Jr",4.54,1,2,12.1,12,11,8,9,8,5),
  buildPitcher("Atascadero","V. Rivera","Sr",7.64,0,0,3.2,6,4,4,3,2,3),
  buildPitcher("Atascadero","A. Madrigal","Sr",7.78,1,1,9,9,12,10,11,4,6),
  buildPitcher("Atascadero","M. Cullen","Jr",9.0,0,0,9.1,15,14,12,5,6,9),
  buildPitcher("Atascadero","W. Azelton","So",2.92,3,3,52.2,59,31,22,14,43,12),
  buildPitcher("Atascadero","J. Litten","So",7.0,0,0,6,7,6,6,6,6,3),
  buildPitcher("Atascadero","W. Witt","Sr",3.02,3,4,51,46,33,22,22,38,14),
  buildPitcher("Atascadero","D. Mitchell","Sr",5.19,2,5,28.1,51,34,21,13,17,8),
  // CABRILLO
  buildPitcher("Cabrillo","C. Powell","Jr",6.12,0,1,16,23,18,14,4,9,6),
  buildPitcher("Cabrillo","I. Lopez","So",10.5,0,1,6,12,13,9,4,5,3),
  buildPitcher("Cabrillo","M. Koff","Sr",5.91,1,0,21.1,28,19,18,16,22,11),
  buildPitcher("Cabrillo","J. Clark","So",3.00,0,1,18.2,18,13,8,9,15,10),
  buildPitcher("Cabrillo","F. Lopez","Sr",6.92,0,6,28.1,39,44,28,34,15,9),
  buildPitcher("Cabrillo","L. Vorce","Jr",28.0,0,1,1,1,5,4,5,0,1),
  buildPitcher("Cabrillo","L. Rounds","So",7.0,0,0,3,4,5,3,2,0,1),
  buildPitcher("Cabrillo","J. Low","Sr",4.26,3,7,49.1,49,38,30,21,29,11),
  buildPitcher("Cabrillo","J. Heidt","Jr",8.88,1,3,17.1,36,33,22,7,3,7),
  // MORRO BAY
  buildPitcher("Morro Bay","E. Brown","Sr",3.44,4,4,55,65,35,27,12,50,15),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",3.41,3,2,39,42,28,19,10,26,11),
  buildPitcher("Morro Bay","E. Davis","Sr",6.63,3,3,25.1,33,29,24,13,13,11),
  buildPitcher("Morro Bay","C. White","Sr",3.94,1,2,16,19,13,9,4,14,12),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","J. Skaggs","Sr",2.33,0,0,3,2,1,1,2,1,2),
  buildPitcher("Morro Bay","H. Stow","",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Deovlet","So",2.80,0,0,5,6,2,2,2,3,2),
  buildPitcher("Morro Bay","C. League","Fr",4.38,1,0,16,17,14,10,8,14,9),
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
  buildPitcher("Nipomo","F. Callaghan","Jr",6.30,0,2,6.2,10,8,6,4,4,5),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.5,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","E. Silveira-19","Sr",3.02,7,3,55.2,50,41,24,36,51,12),
  // PASO ROBLES
  buildPitcher("Paso Robles","J. Soboleski","Jr",3.60,0,0,11.2,16,7,6,7,6,7),
  buildPitcher("Paso Robles","T. Freitas","Sr",3.21,2,0,28.1,24,23,13,13,27,9),
  buildPitcher("Paso Robles","S. Roby","Sr",5.88,0,0,16.2,19,16,14,15,11,7),
  buildPitcher("Paso Robles","B. Lowry","Jr",6.56,0,0,16,18,20,15,8,19,8),
  buildPitcher("Paso Robles","E. Rendon","So",1.89,5,0,40.2,15,15,11,39,66,12),
  buildPitcher("Paso Robles","M. Garcia","Sr",1.40,0,0,10,3,2,2,5,17,8),
  buildPitcher("Paso Robles","X. Hermanson","Jr",0,0,0,2,2,1,0,0,0,2),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.67,2,1,36.2,43,22,14,14,38,10),
  // PIONEER VALLEY
  buildPitcher("Pioneer Valley","D. Cortez","So",1.97,1,0,10.2,11,6,3,5,12,8),
  buildPitcher("Pioneer Valley","J. Lopez","Sr",23.1,0,0,3.1,12,13,11,5,1,2),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",2.67,1,1,21,16,9,8,7,16,7),
  buildPitcher("Pioneer Valley","J. Medina","Jr",14.0,0,1,1,2,2,2,1,3,1),
  buildPitcher("Pioneer Valley","M. Botello","Jr",3.5,0,0,4,7,2,2,2,5,4),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",3.71,3,1,28.1,29,21,15,23,23,11),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",2.31,4,1,33.1,27,21,11,14,30,10),
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.79,1,2,27.1,29,21,7,12,20,7),
  buildPitcher("Pioneer Valley","I. Garcia","Jr",1.52,4,1,27.2,15,8,6,9,24,9),
  buildPitcher("Pioneer Valley","I. Martinez","Sr",5.0,0,2,7,12,11,5,4,3,4),
  buildPitcher("Pioneer Valley","J. Romero","So",2.1,0,0,3.1,2,2,1,1,0,1),
  // RIGHETTI
  buildPitcher("Righetti","M. Villegas","So",0,0,0,0,0,0,0,0,0,1),
  buildPitcher("Righetti","K. Walker","Jr",2.03,4,0,31,28,16,9,9,30,7),
  buildPitcher("Righetti","D. Nevarez","Sr",0,0,0,0,0,0,0,0,0,1),
  buildPitcher("Righetti","M. Anderson","Sr",4.94,1,0,11.1,7,10,8,9,8,4),
  buildPitcher("Righetti","N. Lancor","Sr",5.19,3,3,29.2,36,29,22,16,22,14),
  buildPitcher("Righetti","E. Barcenas","Sr",5.25,0,0,2.2,0,2,2,3,3,2),
  buildPitcher("Righetti","G. Rodriguez","Sr",5.08,2,2,31.2,35,28,23,12,12,12),
  buildPitcher("Righetti","M. Andersen","Jr",3.5,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","I. Rocha","So",3.22,5,2,50,59,28,23,17,32,11),
  buildPitcher("Righetti","A. Stevens","Fr",0,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","C. Viker","Sr",6.0,0,0,2.1,4,6,2,4,2,3),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","J. Riley","Jr",2.82,1,2,27.1,28,18,11,8,22,8),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.72,6,4,54,61,29,21,24,62,11),
  buildPitcher("San Luis Obispo","T. Blaney","So",4.28,2,0,18,20,14,11,10,13,7),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",4.38,0,0,8,9,9,5,9,4,8),
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.55,6,2,43.1,47,30,22,21,23,9),
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
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.74,1,0,19,9,10,2,11,14,9),
  buildPitcher("St. Joseph","X. Horta","So",2.31,4,1,36.1,31,17,12,19,39,9),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.32,7,2,48.1,43,23,16,10,62,10),
  buildPitcher("St. Joseph","L. Woodruff","So",2.55,5,0,33,24,14,12,11,26,11),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","C. Chanley","Sr",2.18,5,2,35.1,27,15,11,24,37,10),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",3.71,0,0,5.2,8,7,3,1,5,5),
  buildPitcher("St. Joseph","R. Schaffer","So",5.25,0,0,1.1,2,2,1,3,0,1),
  buildPitcher("St. Joseph","S. Grupe","So",21.00,0,0,1,3,3,3,1,0,1),
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,3,1,13.1,7,2,0,5,9,5),
  buildPitcher("Templeton","C. Sims","Jr",4.90,0,0,10,8,9,7,9,5,4),
  buildPitcher("Templeton","L. Rivera","Jr",3.29,4,0,44.2,49,30,21,20,37,10),
  buildPitcher("Templeton","A. Abatti","Jr",1.75,2,0,36,34,33,9,18,33,10),
  buildPitcher("Templeton","R. Garcia","Jr",4.20,0,0,15,17,10,9,6,8,8),
  buildPitcher("Templeton","N. Capaci","Jr",0.00,0,0,0.2,0,0,0,0,1,1),
  buildPitcher("Templeton","J. Buys","Jr",0,0,0,0,0,0,0,0,0,1),
  buildPitcher("Templeton","N. Argain","Sr",4.77,2,1,47,58,52,32,29,35,15),
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
    { abbr:"SJ",  name:"St. Joseph",          lw:13,ll:2, ow:22, ol:5,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:10,ll:5, ow:20, ol:8,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:8, ll:7, ow:16, ol:11, ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:6, ll:9, ow:12, ol:11, ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:5, ll:10,ow:15, ol:12, ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:3, ll:12,ow:11, ol:16, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:10,ll:2, ow:17, ol:10, ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:7, ll:5, ow:12, ol:13, ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:6, ll:6, ow:10, ol:16, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:5, ll:7, ow:12, ol:15, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:10,ow:5,  ol:21, ot:0 },
  ],
  ocean: [
    { abbr:"SY",  name:"Santa Ynez",     lw:6, ll:3, ow:15, ol:6,  ot:0 },
    { abbr:"PV",  name:"Pioneer Valley", lw:6, ll:3, ow:14, ol:9,  ot:2 },
    { abbr:"NIP", name:"Nipomo",         lw:5, ll:4, ow:13, ol:12, ot:0 },
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
