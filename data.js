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
//
// ── ERA BASIS ──
// CCAA games are seven innings. Every p.era stored below is MaxPreps' printed
// value, which is ER*7/IP. LG_ERA is therefore computed the same way, and
// calcPWAR divides by 7. Do not switch either to 9 without switching both:
// mixing the two silently inflates ERA+ and pWAR by a factor of 9/7.
// history.js uses the same basis, so ERA+ is comparable across seasons.
//
// ── JERSEY NUMBERS ──
// See assignJerseys() near the bottom. Numbers exist so that history.js can
// match players across seasons when a roster carries two of the same name.
// ============================================================

// ── Last updated date — change this every time you push new stats ──
const DATA_UPDATED = "2026-06-01"; // YYYY-MM-DD — end of season (Mission College Prep final)

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
let LG_ERA         = 3.75;   // CCAA league ERA — SEVEN-inning basis (ER*7/IP). See ERA BASIS note in header.
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
  // /7 to match the seven-inning ERA basis: (lgERA - ERA)/IP_per_game gives the
  // per-inning run differential, which is then scaled by innings pitched.
  const raa = (LG_ERA - era) / 7 * ip;
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
    overall: "23-6-1",
    leagueRecord: "13-2",
    wins: 23, losses: 6, ties: 1,
    leagueWins: 13, leagueLosses: 2,
    caRank: 49,
    gp: 30,
    teamBavg: .282, teamOBP: .392, teamSLG: .382,
    teamERA: 2.66, teamIP: 208
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "24-9",
    leagueRecord: "10-5",
    wins: 24, losses: 9, ties: 0,
    leagueWins: 10, leagueLosses: 5,
    caRank: 48,
    gp: 33,
    teamBavg: .339, teamOBP: .435, teamSLG: .518,
    teamERA: 2.13, teamIP: 223
  },
  {
    id: "santa-ynez",
    name: "Santa Ynez",
    mascot: "Pirates",
    location: "Santa Ynez, CA",
    coach: "Craig Gladstone",
    colors: "Orange, Black",
    league: "CCAA - Ocean",
    overall: "17-8",
    leagueRecord: "6-3",
    wins: 17, losses: 8, ties: 0,
    leagueWins: 6, leagueLosses: 3,
    caRank: 410,
    gp: 25,
    teamBavg: .346, teamOBP: .458, teamSLG: .462,
    teamERA: 1.93, teamIP: 163.1
  },
  {
    id: "pioneer-valley",
    name: "Pioneer Valley",
    mascot: "Panthers",
    location: "Santa Maria, CA",
    coach: "Cody Smith",
    colors: "Teal, Black",
    league: "CCAA - Ocean",
    overall: "15-10-2",
    leagueRecord: "6-3",
    wins: 15, losses: 10, ties: 2,
    leagueWins: 6, leagueLosses: 3,
    caRank: 468,
    gp: 27,
    teamBavg: .257, teamOBP: .373, teamSLG: .319,
    teamERA: 3.06, teamIP: 181
  },
  {
    id: "nipomo",
    name: "Nipomo",
    mascot: "Titans",
    location: "Nipomo, CA",
    coach: "Caleb Buendia",
    colors: "Black, Cardinal, Silver",
    league: "CCAA - Ocean",
    overall: "14-14",
    leagueRecord: "5-4",
    wins: 14, losses: 14, ties: 0,
    leagueWins: 5, leagueLosses: 4,
    caRank: 474,
    gp: 28,
    teamBavg: .322, teamOBP: .399, teamSLG: .381,
    teamERA: 5.50, teamIP: 178.1
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "13-14-1",
    leagueRecord: "7-5",
    wins: 13, losses: 14, ties: 1,
    leagueWins: 7, leagueLosses: 5,
    caRank: 306,
    gp: 28,
    teamBavg: .304, teamOBP: .379, teamSLG: .419,
    teamERA: 3.33, teamIP: 174.2
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "18-11",
    leagueRecord: "10-2",
    wins: 18, losses: 11, ties: 0,
    leagueWins: 10, leagueLosses: 2,
    caRank: 305,
    gp: 29,
    teamBavg: .322, teamOBP: .414, teamSLG: .411,
    teamERA: 3.77, teamIP: 197
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "17-12",
    leagueRecord: "8-7",
    wins: 17, losses: 12, ties: 0,
    leagueWins: 8, leagueLosses: 7,
    caRank: 154,
    gp: 29,
    teamBavg: .318, teamOBP: .427, teamSLG: .447,
    teamERA: 3.97, teamIP: 194
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "16-13",
    leagueRecord: "5-10",
    wins: 16, losses: 13, ties: 0,
    leagueWins: 5, leagueLosses: 10,
    caRank: 245,
    gp: 29,
    teamBavg: .302, teamOBP: .386, teamSLG: .412,
    teamERA: 4.04, teamIP: 189
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "11-17",
    leagueRecord: "3-12",
    wins: 11, losses: 17, ties: 0,
    leagueWins: 3, leagueLosses: 12,
    caRank: 390,
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
    overall: "14-16",
    leagueRecord: "5-7",
    wins: 14, losses: 16, ties: 0,
    leagueWins: 5, leagueLosses: 7,
    caRank: 473,
    gp: 30,
    teamBavg: .290, teamOBP: .387, teamSLG: .376,
    teamERA: 3.02, teamIP: 197.1
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "S.D. Harrow",
    colors: "Navy, Vegas Gold",
    league: "CCAA - Mountain",
    overall: "12-12",
    leagueRecord: "6-9",
    wins: 12, losses: 12, ties: 0,
    leagueWins: 6, leagueLosses: 9,
    caRank: 220,
    gp: 24,
    teamBavg: .323, teamOBP: .409, teamSLG: .437,
    teamERA: 5.18, teamIP: 158
  },
  {
    id: "atascadero",
    name: "Atascadero",
    mascot: "Greyhounds",
    location: "Atascadero, CA",
    coach: "Samm Spears",
    colors: "Orange, Gray",
    league: "CCAA - Sunset",
    overall: "10-18",
    leagueRecord: "6-6",
    wins: 10, losses: 18, ties: 0,
    leagueWins: 6, leagueLosses: 6,
    caRank: 543,
    gp: 28,
    teamBavg: .228, teamOBP: .372, teamSLG: .289,
    teamERA: 4.31, teamIP: 183.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "10-11",
    leagueRecord: "1-8",
    wins: 10, losses: 11, ties: 0,
    leagueWins: 1, leagueLosses: 8,
    caRank: 752,
    gp: 21,
    teamBavg: .327, teamOBP: .417, teamSLG: .382,
    teamERA: 4.51, teamIP: 132
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
    caRank: 688,
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
  buildBatter("Arroyo Grande","R. Servin","Jr",33,.475,136,99,41,47,34,16,3,5,32,11,4,1,.610,.848,1.458),
  buildBatter("Arroyo Grande","A. Winter","Jr",29,.467,78,60,20,28,11,1,0,0,7,8,7,2,.553,.483,1.036),
  buildBatter("Arroyo Grande","T. Kurth","Sr",29,.398,111,93,21,37,31,8,0,7,11,14,3,2,.468,.710,1.178),
  buildBatter("Arroyo Grande","B. Paz","Fr",31,.341,99,85,24,29,25,4,2,7,8,21,2,1,.406,.682,1.088),
  buildBatter("Arroyo Grande","R. Bronson","Sr",22,.333,43,39,8,13,9,2,0,2,3,10,0,0,.381,.538,.919),
  buildBatter("Arroyo Grande","J. Stumph","Jr",30,.325,102,80,18,26,14,4,1,1,15,10,2,1,.439,.438,.876),
  buildBatter("Arroyo Grande","J. Ralph","Jr",33,.324,127,111,26,36,10,6,0,2,13,13,2,1,.402,.432,.834),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",22,.316,25,19,2,6,4,1,0,0,6,9,0,0,.480,.368,.848),
  buildBatter("Arroyo Grande","O. King","Jr",18,.308,16,13,3,4,1,0,0,0,3,6,0,0,.438,.308,.746),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",27,.296,62,54,11,16,9,3,0,1,6,14,1,0,.377,.407,.784),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",30,.294,83,68,11,20,10,4,0,0,11,12,1,0,.400,.353,.753),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",32,.286,123,105,27,30,30,3,0,6,7,14,9,2,.374,.486,.860),
  buildBatter("Arroyo Grande","M. Richwine","Sr",29,.277,77,65,14,18,17,3,0,2,6,18,3,0,.365,.415,.780),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",18,.250,27,24,10,6,5,0,1,0,2,6,1,0,.333,.333,.666),
  buildBatter("Arroyo Grande","K. Warwick","Jr",25,.206,39,34,9,7,2,0,1,0,0,11,4,0,.289,.265,.554),
  buildBatter("Arroyo Grande","Z. Johnson","Jr",17,.000,1,1,0,0,1,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Arroyo Grande","G. Pope","Sr",16,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Arroyo Grande","M. Hicks","Sr",8,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // ATASCADERO
  buildBatter("Atascadero","M. Cullen","Jr",11,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","W. Litten","Sr",28,.287,105,87,12,25,22,5,1,1,7,18,10,1,.400,.402,.802),
  buildBatter("Atascadero","A. Donaldson","So",23,.271,75,59,12,16,3,0,0,0,12,14,3,0,.419,.271,.690),
  buildBatter("Atascadero","D. Mitchell","Sr",23,.263,84,76,11,20,11,6,1,0,4,12,3,0,.325,.368,.693),
  buildBatter("Atascadero","W. Witt","Sr",27,.246,106,69,20,17,9,5,0,1,33,26,2,0,.500,.362,.862),
  buildBatter("Atascadero","J. Litten","So",27,.239,85,67,10,16,8,4,0,0,10,19,4,3,.357,.299,.656),
  buildBatter("Atascadero","M. Zepeda","Sr",28,.236,89,72,7,17,10,2,1,0,13,16,0,0,.353,.292,.645),
  buildBatter("Atascadero","S. Ernst","Sr",23,.203,70,59,6,12,4,1,0,0,8,30,3,0,.329,.220,.549),
  buildBatter("Atascadero","C. Knoph","Jr",8,.200,6,5,0,1,2,0,0,0,1,3,0,0,.333,.200,.533),
  buildBatter("Atascadero","E. Wanner","Sr",27,.194,103,72,18,14,10,3,0,0,21,9,2,3,.378,.236,.614),
  buildBatter("Atascadero","W. Azelton","So",25,.188,68,48,8,9,9,3,1,0,13,19,5,2,.397,.292,.689),
  buildBatter("Atascadero","A. Madrigal","Sr",13,.176,19,17,2,3,2,1,0,0,2,9,0,0,.263,.235,.498),
  buildBatter("Atascadero","R. Brown","Sr",15,.176,19,17,4,3,0,0,0,0,2,7,0,0,.263,.176,.439),
  buildBatter("Atascadero","M. Beck","Jr",26,.171,48,41,11,7,3,0,0,0,5,12,1,0,.277,.171,.448),
  buildBatter("Atascadero","V. Rivera","Sr",6,.125,9,8,1,1,1,0,0,0,1,4,0,0,.222,.125,.347),
  buildBatter("Atascadero","C. Savino","Fr",5,.111,13,9,1,1,1,0,0,0,4,5,0,0,.385,.111,.496),
  buildBatter("Atascadero","N. Simon","Sr",1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Atascadero","T. Knutson","So",3,.000,5,4,0,0,0,0,0,0,1,3,0,0,.200,.000,.200),
  // CABRILLO
  buildBatter("Cabrillo","G. Barraza","Sr",26,.354,90,79,37,28,9,2,0,1,7,9,3,1,.422,.418,.840),
  buildBatter("Cabrillo","M. Koff","Sr",25,.375,77,64,13,24,13,8,0,0,6,11,2,1,.438,.500,.938),
  buildBatter("Cabrillo","J. Clark","So",23,.260,60,50,7,13,9,1,0,0,5,21,1,1,.333,.280,.613),
  buildBatter("Cabrillo","F. Hernandez","Jr",26,.256,90,82,8,21,9,3,2,0,4,14,3,1,.311,.341,.652),
  buildBatter("Cabrillo","J. Low","Sr",21,.244,49,41,3,10,2,3,0,0,5,6,3,0,.367,.317,.684),
  buildBatter("Cabrillo","L. Vorce","Jr",14,.243,41,37,3,9,2,0,0,0,3,1,0,1,.300,.243,.543),
  buildBatter("Cabrillo","C. Sunndeniyage","Jr",25,.260,56,50,5,13,1,0,0,0,2,10,3,1,.327,.260,.587),
  buildBatter("Cabrillo","F. Lopez","Sr",26,.225,88,71,15,16,8,3,0,0,13,21,2,1,.356,.268,.624),
  buildBatter("Cabrillo","C. Powell","Jr",26,.200,92,80,15,16,3,4,0,0,11,10,1,0,.304,.250,.554),
  buildBatter("Cabrillo","M. Cerna-Medina","So",7,.200,6,5,0,1,0,0,0,0,1,2,0,0,.333,.200,.533),
  buildBatter("Cabrillo","L. Ragoza","Jr",19,.185,31,27,3,5,1,0,0,0,2,10,2,0,.290,.185,.475),
  buildBatter("Cabrillo","D. Vineyard","So",9,.118,20,17,3,2,0,0,0,0,2,7,1,0,.167,.118,.285),
  buildBatter("Cabrillo","I. Lopez","So",10,.042,29,24,1,1,2,0,0,0,3,6,1,0,.179,.042,.221),
  buildBatter("Cabrillo","A. Torres","Sr",13,.038,26,26,1,1,0,0,0,0,0,7,0,0,.038,.038,.076),
  buildBatter("Cabrillo","E. Bradshaw","Fr",1,1.000,1,1,0,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  buildBatter("Cabrillo","K. Sousa","Fr",2,.000,3,2,1,0,0,0,0,0,1,2,0,0,.333,.000,.333),
  buildBatter("Cabrillo","L. Rounds","So",3,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",29,.429,115,84,40,36,25,13,1,5,19,13,12,0,.583,.786,1.369),
  buildBatter("Morro Bay","E. Brown","Sr",27,.368,77,68,20,25,14,0,0,0,7,4,2,0,.442,.368,.810),
  buildBatter("Morro Bay","C. White","Sr",28,.345,116,87,23,30,36,4,0,6,12,13,3,14,.388,.598,.986),
  buildBatter("Morro Bay","C. Wilkinson","Sr",27,.326,99,86,18,28,23,10,1,1,13,17,0,0,.414,.500,.914),
  buildBatter("Morro Bay","J. Deovlet","So",29,.310,104,87,16,27,16,6,0,0,12,7,3,2,.404,.379,.783),
  buildBatter("Morro Bay","T. Gray","Sr",29,.281,105,96,10,27,12,5,0,0,3,15,5,1,.333,.333,.666),
  buildBatter("Morro Bay","C. Waldon","Jr",26,.273,85,77,9,21,9,4,0,0,5,18,3,0,.341,.325,.666),
  buildBatter("Morro Bay","E. Davis","Sr",26,.266,84,79,13,21,9,2,0,0,4,17,0,1,.298,.291,.589),
  buildBatter("Morro Bay","J. Skaggs","Sr",26,.250,71,68,12,17,4,2,0,0,1,9,2,0,.282,.279,.561),
  buildBatter("Morro Bay","C. League","Fr",26,.184,45,38,14,7,4,1,0,0,6,9,0,1,.289,.211,.500),
  buildBatter("Morro Bay","B. Walker","",21,.095,27,21,3,2,0,0,0,0,3,6,3,0,.296,.095,.391),
  buildBatter("Morro Bay","V. Nelson","",10,.000,6,5,1,0,0,0,0,0,0,1,1,0,.167,.000,.167),
  buildBatter("Morro Bay","H. Stow","",3,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  // NIPOMO
  buildBatter("Nipomo","B. Hageman","So",25,.488,99,82,32,40,12,4,0,0,7,7,2,1,.533,.537,1.070),
  buildBatter("Nipomo","J. Anderson","Sr",7,.375,8,8,2,3,0,0,1,0,0,4,0,0,.375,.625,1.000),
  buildBatter("Nipomo","G. Groshart","Sr",24,.353,95,85,13,30,31,12,0,0,5,4,3,2,.400,.494,.894),
  buildBatter("Nipomo","C. Moulden","So",26,.348,100,92,18,32,28,7,0,0,5,10,2,0,.394,.424,.818),
  buildBatter("Nipomo","E. Silveira-19","Sr",27,.337,102,89,15,30,20,4,0,0,8,12,4,1,.412,.382,.794),
  buildBatter("Nipomo","E. Silveira-3","Sr",27,.333,78,72,9,24,14,2,1,0,4,7,0,1,.364,.389,.753),
  buildBatter("Nipomo","L. Hobbs","Sr",27,.346,111,81,44,28,4,2,0,0,9,2,20,1,.514,.370,.884),
  buildBatter("Nipomo","T. Barr","Sr",23,.300,68,60,4,18,16,3,1,0,6,18,1,1,.368,.383,.751),
  buildBatter("Nipomo","L. Hobbs","Fr",26,.293,88,75,9,22,11,2,0,0,10,6,2,0,.391,.320,.711),
  buildBatter("Nipomo","T. Oxley","Sr",26,.213,75,61,13,13,4,3,0,0,11,26,1,1,.338,.262,.600),
  buildBatter("Nipomo","J. Lanier","Sr",7,.200,5,5,1,1,1,0,0,0,0,1,0,0,.200,.200,.400),
  buildBatter("Nipomo","H. Roesner","Jr",19,.192,28,26,5,5,1,1,0,0,2,8,0,0,.250,.231,.481),
  buildBatter("Nipomo","K. Simonson","So",20,.167,39,36,2,6,3,0,0,0,1,8,0,2,.179,.167,.346),
  buildBatter("Nipomo","K. Thomas","So",10,.000,3,1,1,0,0,0,0,0,1,0,1,0,.667,.000,.667),
  buildBatter("Nipomo","Z. Garibay","Sr",6,.000,2,2,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","F. Callaghan","Jr",6,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","A. Mendoza","Jr",10,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  // PASO ROBLES
  buildBatter("Paso Robles","K. Magdaleno","Jr",11,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","J. Lopez","Jr",11,.444,13,9,2,4,2,1,0,0,3,2,0,0,.583,.556,1.139),
  buildBatter("Paso Robles","G. Berlingeri","Sr",5,.400,11,10,2,4,0,0,0,0,1,2,0,0,.455,.400,.855),
  buildBatter("Paso Robles","B. Lowry","Jr",26,.390,94,77,21,30,22,4,1,1,13,11,1,3,.468,.506,.974),
  buildBatter("Paso Robles","M. Garcia","Sr",25,.373,96,83,28,31,15,6,1,1,10,11,3,0,.458,.506,.964),
  buildBatter("Paso Robles","T. Freitas","Sr",26,.330,97,88,18,29,14,8,0,0,4,2,3,1,.375,.420,.795),
  buildBatter("Paso Robles","C. Prieto","Jr",24,.328,75,64,14,21,13,7,0,0,6,10,1,2,.384,.438,.822),
  buildBatter("Paso Robles","J. Soboleski","Jr",26,.299,86,77,15,23,12,9,1,1,7,17,1,0,.365,.481,.846),
  buildBatter("Paso Robles","E. Dobroth","Jr",26,.298,98,84,20,25,18,3,1,0,9,15,4,1,.388,.357,.745),
  buildBatter("Paso Robles","X. Hermanson","Jr",25,.292,79,65,14,19,14,6,0,1,10,7,2,1,.397,.431,.828),
  buildBatter("Paso Robles","E. Rendon","So",25,.266,87,79,16,21,18,5,1,3,2,11,5,1,.322,.468,.790),
  buildBatter("Paso Robles","E. Nevarez","Jr",8,.214,14,14,1,3,3,2,0,0,0,6,0,0,.214,.357,.571),
  buildBatter("Paso Robles","C. Glover","Sr",19,.179,37,28,4,5,1,1,0,0,5,7,2,0,.343,.214,.557),
  buildBatter("Paso Robles","L. Christensen","Jr",14,.158,21,19,2,3,0,0,0,0,1,6,0,0,.200,.158,.358),
  buildBatter("Paso Robles","C. Contreras","Jr",17,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","N. Contreras","Jr",16,.077,13,13,1,1,0,0,0,0,0,7,0,0,.077,.077,.154),
  buildBatter("Paso Robles","S. Roby","Sr",7,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Paso Robles","L. Ross","Sr",2,.000,2,2,1,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  // PIONEER VALLEY
  buildBatter("Pioneer Valley","J. Romero","So",2,.500,3,2,1,1,0,0,0,0,1,0,0,0,.667,.500,1.167),
  buildBatter("Pioneer Valley","I. Enriquez","Jr",25,.411,92,73,19,30,18,3,0,1,14,5,4,1,.522,.493,1.015),
  buildBatter("Pioneer Valley","K. Milner","Jr",19,.407,67,54,8,22,19,7,0,1,12,10,1,0,.522,.593,1.115),
  buildBatter("Pioneer Valley","D. Cortez","So",27,.325,99,83,21,27,13,12,1,0,15,17,1,0,.434,.494,.928),
  buildBatter("Pioneer Valley","I. Martinez","Sr",19,.241,38,29,5,7,6,0,0,0,6,11,1,0,.389,.241,.630),
  buildBatter("Pioneer Valley","L. Dreier","Jr",13,.250,21,16,7,4,1,0,0,0,4,5,1,0,.429,.250,.679),
  buildBatter("Pioneer Valley","I. Garcia","Jr",17,.235,18,17,0,4,2,0,0,0,1,8,0,0,.278,.235,.513),
  buildBatter("Pioneer Valley","M. Rosas","Sr",24,.234,74,64,10,15,7,1,0,0,5,20,4,0,.329,.250,.579),
  buildBatter("Pioneer Valley","J. Rojas","Sr",21,.233,39,30,6,7,7,0,0,0,6,6,1,0,.378,.233,.611),
  buildBatter("Pioneer Valley","K. Owen","Sr",23,.228,62,57,9,13,4,1,0,0,2,7,2,1,.274,.246,.520),
  buildBatter("Pioneer Valley","J. Lopez","Sr",26,.222,82,72,11,16,14,1,2,0,4,21,2,2,.275,.292,.567),
  buildBatter("Pioneer Valley","U. Ponce","Jr",19,.208,56,48,12,10,9,2,1,0,5,19,2,0,.309,.292,.601),
  buildBatter("Pioneer Valley","E. Ponce","Sr",26,.207,100,82,26,17,3,0,1,0,11,14,6,0,.343,.232,.575),
  buildBatter("Pioneer Valley","M. Andrade","Jr",19,.182,57,44,7,8,9,2,0,0,9,16,2,0,.345,.227,.572),
  buildBatter("Pioneer Valley","J. Valdez","Jr",17,.167,18,12,5,2,0,0,0,0,3,5,3,0,.444,.167,.611),
  buildBatter("Pioneer Valley","J. Medina","Jr",16,.111,21,18,2,2,2,0,0,0,2,10,1,0,.200,.111,.311),
  buildBatter("Pioneer Valley","L. Rodriguez","So",5,.091,13,11,3,1,0,0,0,0,1,4,1,0,.231,.091,.322),
  buildBatter("Pioneer Valley","M. Botello","Jr",6,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Pioneer Valley","J. Beltran","Jr",15,.000,6,4,3,0,0,0,0,0,2,2,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","D. Dahl","So",2,.000,6,4,0,0,0,0,0,0,2,0,0,0,.333,.000,.333),
  // RIGHETTI
  buildBatter("Righetti","E. Barcenas","Sr",6,1.000,3,2,0,2,1,1,0,0,1,0,0,0,1.000,1.500,2.500),
  buildBatter("Righetti","K. Walker","Jr",29,.466,114,103,37,48,29,13,1,5,9,8,1,1,.509,.757,1.266),
  buildBatter("Righetti","G. Cole","So",23,.419,89,74,23,31,7,4,0,0,11,8,0,1,.488,.473,.961),
  buildBatter("Righetti","N. Roberts","Sr",29,.364,111,88,21,32,19,6,2,1,15,13,5,3,.468,.511,.979),
  buildBatter("Righetti","N. Kesner","Sr",28,.342,103,73,23,25,17,2,1,0,18,16,10,1,.520,.397,.917),
  buildBatter("Righetti","M. Anderson","Sr",29,.317,118,104,16,33,16,5,1,1,11,15,2,0,.393,.413,.806),
  buildBatter("Righetti","Z. Andersen","So",28,.288,97,73,10,21,20,5,0,5,18,21,5,0,.458,.562,1.020),
  buildBatter("Righetti","M. Villegas","So",21,.256,52,39,10,10,7,1,1,1,13,17,0,0,.442,.410,.852),
  buildBatter("Righetti","M. Andersen","Jr",23,.255,62,55,6,14,11,3,0,1,4,16,0,2,.295,.364,.659),
  buildBatter("Righetti","D. Nevarez","Sr",29,.254,89,71,10,18,15,6,0,1,10,19,4,1,.372,.380,.752),
  buildBatter("Righetti","N. Verduzco","So",28,.238,84,63,16,15,7,1,0,0,18,14,0,0,.407,.254,.661),
  buildBatter("Righetti","C. Campa","So",11,.231,13,13,2,3,3,1,0,0,0,1,0,0,.231,.308,.539),
  buildBatter("Righetti","N. Nevarez","Fr",4,.200,6,5,0,1,0,0,0,0,1,0,0,0,.333,.200,.533),
  buildBatter("Righetti","J. Rodriguez","Sr",21,.182,12,11,4,2,0,0,0,0,1,4,0,0,.250,.182,.432),
  buildBatter("Righetti","I. Quintanar","Jr",11,.115,29,26,4,3,3,0,0,0,2,7,0,1,.172,.115,.287),
  buildBatter("Righetti","N. Lancor","Sr",23,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  buildBatter("Righetti","D. Tovar","Jr",6,.000,7,5,1,0,0,0,0,0,1,3,1,0,.286,.000,.286),
  buildBatter("Righetti","R. Harney","Sr",5,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Righetti","G. Rodriguez","Sr",13,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Righetti","I. Rocha","So",14,.000,0,0,1,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","J. Riley","Jr",29,.402,111,92,12,37,19,4,0,0,17,14,1,1,.495,.446,.941),
  buildBatter("San Luis Obispo","F. Avrett","Jr",15,.389,19,18,2,7,9,3,0,0,0,8,0,1,.368,.556,.924),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",29,.358,114,106,25,38,16,5,1,0,7,11,0,0,.398,.425,.823),
  buildBatter("San Luis Obispo","T. Blaney","So",29,.347,89,75,20,26,19,7,1,3,14,13,0,0,.449,.587,1.036),
  buildBatter("San Luis Obispo","J. Taylor","Sr",28,.343,80,67,13,23,20,4,0,4,11,21,1,1,.438,.582,1.020),
  buildBatter("San Luis Obispo","P. Wyatt","Jr",29,.330,109,88,22,29,17,2,0,0,11,6,5,1,.429,.352,.781),
  buildBatter("San Luis Obispo","C. Stephens","Jr",29,.308,108,91,20,28,14,4,1,0,17,14,0,0,.417,.374,.791),
  buildBatter("San Luis Obispo","B. Schafer","Jr",26,.298,82,57,16,17,5,4,0,0,17,7,2,0,.474,.368,.842),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",29,.288,96,80,15,23,18,2,0,0,10,24,5,0,.400,.313,.712),
  buildBatter("San Luis Obispo","G. Bramble","Sr",24,.278,87,79,19,22,16,7,0,1,7,12,0,1,.333,.405,.738),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Soderin","Sr",25,.200,26,20,13,4,1,0,0,0,5,9,1,0,.385,.200,.585),
  buildBatter("San Luis Obispo","D. Wilson","Jr",24,.167,20,18,1,3,3,0,0,0,2,3,0,0,.250,.167,.417),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",6,.000,7,7,0,0,0,0,0,0,0,5,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","J. Giordano","Jr",9,1.000,1,1,0,1,0,1,0,0,0,0,0,0,1.000,2.000,3.000),
  buildBatter("San Luis Obispo","C. Torell","So",1,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // SANTA MARIA
  buildBatter("Santa Maria","J. Medina-30","Sr",21,.422,81,64,20,27,11,3,2,0,17,13,0,0,.543,.531,1.074),
  buildBatter("Santa Maria","B. Alejo","Jr",20,.406,76,69,10,28,20,7,0,0,2,6,4,1,.447,.507,.954),
  buildBatter("Santa Maria","J. Calderon","Sr",21,.371,72,62,13,23,9,0,0,0,7,4,1,1,.437,.371,.808),
  buildBatter("Santa Maria","A. Ybarra","Sr",21,.333,71,63,10,21,11,4,0,0,7,13,1,0,.408,.397,.805),
  buildBatter("Santa Maria","D. Martin","Sr",17,.327,65,52,17,17,10,5,0,0,11,7,2,0,.462,.423,.885),
  buildBatter("Santa Maria","U. Rodriguez","Fr",17,.324,50,37,12,12,7,2,0,0,11,5,2,0,.500,.378,.878),
  buildBatter("Santa Maria","J. Medina-21","Sr",19,.300,68,60,15,18,7,2,0,0,7,11,1,0,.382,.333,.715),
  buildBatter("Santa Maria","O. Sedano","So",8,.286,17,14,3,4,4,1,0,0,3,6,0,0,.412,.357,.769),
  buildBatter("Santa Maria","I. Barajas","So",6,.286,8,7,1,2,1,0,0,0,0,2,1,0,.375,.286,.661),
  buildBatter("Santa Maria","A. Rice","So",21,.273,70,66,10,18,12,0,0,0,2,9,2,0,.314,.273,.587),
  buildBatter("Santa Maria","A. Rice","Fr",19,.269,55,52,6,14,10,3,0,0,3,13,0,0,.309,.327,.636),
  buildBatter("Santa Maria","F. Chavez","Sr",17,.250,30,24,3,6,3,0,0,0,5,7,1,0,.400,.250,.650),
  buildBatter("Santa Maria","Z. Camacho","Fr",4,.250,4,4,2,1,0,1,0,0,0,1,0,0,.250,.500,.750),
  buildBatter("Santa Maria","J. Reyes","Sr",8,.000,5,5,4,0,1,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("Santa Maria","J. Gaitan","So",9,.000,6,5,1,0,0,0,0,0,1,2,0,0,.167,.000,.167),
  // SANTA YNEZ
  buildBatter("Santa Ynez","J. Glover","Jr",25,.506,102,83,30,42,41,6,4,4,16,11,1,2,.578,.819,1.397),
  buildBatter("Santa Ynez","D. Pulido","Sr",25,.403,100,72,24,29,21,7,0,1,18,8,7,2,.545,.542,1.087),
  buildBatter("Santa Ynez","T. Jeckell","Jr",25,.386,91,83,27,32,25,9,0,0,8,8,0,0,.440,.494,.934),
  buildBatter("Santa Ynez","K. Heiduk","So",24,.375,99,80,30,30,20,4,1,1,14,16,3,1,.480,.488,.968),
  buildBatter("Santa Ynez","E. Roberts","So",24,.353,88,68,20,24,13,8,0,0,11,16,7,1,.483,.471,.954),
  buildBatter("Santa Ynez","B. Cram","So",25,.314,88,70,22,22,7,0,0,0,15,9,1,0,.442,.314,.756),
  buildBatter("Santa Ynez","M. Skidmore","Sr",25,.303,105,89,29,27,14,9,0,0,12,13,2,1,.394,.404,.798),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",25,.282,100,78,23,22,17,8,1,0,17,12,4,1,.430,.410,.840),
  buildBatter("Santa Ynez","S. Rhea","Jr",19,.235,65,51,14,12,10,1,0,0,7,14,4,1,.365,.255,.620),
  buildBatter("Santa Ynez","A. Lewis","Fr",14,.231,33,26,7,6,9,1,0,0,3,3,0,2,.290,.269,.559),
  buildBatter("Santa Ynez","C. Palmer","Jr",11,.182,19,11,5,2,2,0,0,0,6,4,2,0,.526,.182,.708),
  // ST. JOSEPH
  buildBatter("St. Joseph","A. Bluem","Jr",30,.426,118,101,35,43,22,9,0,6,11,2,5,1,.500,.693,1.193),
  buildBatter("St. Joseph","M. Majewski","Jr",29,.368,94,76,18,28,12,8,0,1,10,12,7,0,.484,.513,.997),
  buildBatter("St. Joseph","C. Chanley","Sr",30,.359,114,92,20,33,23,5,1,3,10,2,10,2,.465,.533,.998),
  buildBatter("St. Joseph","M. Kon","Sr",23,.308,76,65,5,20,13,1,0,0,6,14,3,2,.382,.323,.705),
  buildBatter("St. Joseph","C. Goncalves","Jr",30,.304,108,92,10,28,24,3,0,0,8,12,5,3,.380,.337,.717),
  buildBatter("St. Joseph","S. Grupe","So",11,.286,16,14,2,4,2,0,0,0,1,1,1,0,.375,.286,.661),
  buildBatter("St. Joseph","E. Hendricks","So",22,.263,48,38,13,10,0,1,0,0,6,3,4,0,.417,.289,.706),
  buildBatter("St. Joseph","L. Woodruff","So",23,.250,59,52,10,13,15,3,0,2,3,16,2,0,.316,.423,.739),
  buildBatter("St. Joseph","M. O'Keefe","Jr",20,.244,52,41,6,10,7,1,0,1,8,12,1,1,.373,.341,.714),
  buildBatter("St. Joseph","S. Covarrubias","Sr",28,.194,103,72,22,14,7,3,0,1,26,19,4,0,.431,.278,.709),
  buildBatter("St. Joseph","R. Roemling","Sr",21,.188,58,48,8,9,3,1,0,0,7,11,2,0,.316,.208,.524),
  buildBatter("St. Joseph","X. Horta","So",28,.181,86,72,7,13,8,2,0,0,9,8,0,3,.262,.208,.470),
  buildBatter("St. Joseph","R. Aparicio","Sr",13,.077,13,13,0,1,0,0,0,0,0,1,0,0,.077,.077,.154),
  buildBatter("St. Joseph","J. Chavez","So",27,.062,17,16,5,1,1,0,0,0,1,2,0,0,.118,.063,.180),
  buildBatter("St. Joseph","R. Schaffer","So",4,.000,3,1,0,0,0,0,0,0,0,0,2,0,.667,.000,.667),
  buildBatter("St. Joseph","L. Soares","So",3,.000,3,3,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  buildBatter("St. Joseph","R. Regnier","So",3,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  // TEMPLETON
  buildBatter("Templeton","L. Stetz","Sr",27,.395,99,86,17,34,21,4,4,0,7,8,5,1,.465,.535,1.000),
  buildBatter("Templeton","L. Rivera","Jr",29,.390,116,100,23,39,17,4,2,0,11,12,1,2,.447,.470,.917),
  buildBatter("Templeton","C. Sims","Jr",29,.382,110,102,25,39,13,6,2,0,3,10,4,1,.418,.480,.898),
  buildBatter("Templeton","N. Capaci","Jr",29,.301,90,73,13,22,8,5,0,0,13,24,2,1,.416,.370,.786),
  buildBatter("Templeton","J. Beckwith","So",30,.288,92,73,11,21,13,2,2,0,11,16,2,1,.391,.370,.761),
  buildBatter("Templeton","L. Olsen","Sr",30,.273,124,99,24,27,9,12,0,0,19,25,5,1,.411,.394,.805),
  buildBatter("Templeton","J. Buys","Jr",23,.267,40,30,4,8,5,1,0,0,7,14,1,2,.400,.300,.700),
  buildBatter("Templeton","N. Argain","Sr",22,.267,34,30,4,8,5,1,0,0,2,6,0,0,.312,.300,.612),
  buildBatter("Templeton","E. Abatti","Fr",19,.235,45,34,7,8,5,2,0,0,9,12,1,1,.400,.294,.694),
  buildBatter("Templeton","W. Patch","Sr",13,.222,21,18,4,4,1,1,0,0,3,7,0,0,.333,.278,.611),
  buildBatter("Templeton","C. Hamilton","So",26,.196,69,56,5,11,9,1,0,0,10,25,2,1,.333,.214,.547),
  buildBatter("Templeton","R. Garcia","Jr",23,.179,52,39,4,7,5,1,1,1,10,17,0,1,.340,.333,.673),
  buildBatter("Templeton","T. Miller","So",16,.179,43,39,5,7,6,3,0,0,4,10,0,0,.256,.256,.512),
  buildBatter("Templeton","A. Abatti","Jr",22,.062,40,32,1,2,5,1,0,0,5,14,1,1,.205,.094,.299),
  // MISSION COLLEGE PREP
  buildBatter("Mission College Prep","T. Bernal","Jr",18,.462,61,52,15,24,18,2,2,2,8,7,1,0,.541,.692,1.233),
  buildBatter("Mission College Prep","J. Villa","Sr",24,.387,99,93,24,36,13,4,0,1,2,9,2,2,.404,.462,.866),
  buildBatter("Mission College Prep","H. Drake","Sr",24,.380,94,79,22,30,15,4,2,1,13,8,2,0,.479,.519,.998),
  buildBatter("Mission College Prep","R. Engle","So",23,.380,85,71,14,27,22,6,1,3,9,16,3,0,.470,.620,1.090),
  buildBatter("Mission College Prep","A. Johnson","Jr",21,.377,75,61,13,23,11,5,0,0,10,3,1,1,.466,.459,.925),
  buildBatter("Mission College Prep","N. Bender","So",2,.333,3,3,1,1,4,0,0,1,0,0,0,0,.333,1.333,1.667),
  buildBatter("Mission College Prep","C. Mott","Jr",23,.322,70,59,10,19,8,4,0,0,8,8,1,0,.412,.390,.802),
  buildBatter("Mission College Prep","B. Augustine","Jr",12,.308,14,13,1,4,4,0,1,0,0,5,1,0,.357,.462,.819),
  buildBatter("Mission College Prep","B. Orfila","Jr",21,.294,62,51,7,15,8,4,0,1,9,14,1,0,.410,.431,.841),
  buildBatter("Mission College Prep","J. Esparza","Jr",23,.273,84,77,12,21,15,2,0,0,4,6,0,1,.305,.299,.604),
  buildBatter("Mission College Prep","J. Cortez","Sr",22,.204,69,54,10,11,6,3,0,0,13,22,1,0,.368,.259,.627),
  buildBatter("Mission College Prep","B. May","Jr",15,.200,31,25,4,5,2,1,0,1,5,11,1,0,.355,.360,.715),
  buildBatter("Mission College Prep","E. Engle","Jr",11,.182,13,11,4,2,0,0,0,0,2,3,0,0,.308,.182,.490),
  buildBatter("Mission College Prep","B. Burt","Jr",9,.100,12,10,1,1,0,1,0,0,2,6,0,0,.250,.200,.450),
  buildBatter("Mission College Prep","C. Treanor","Jr",10,.000,17,14,3,0,0,0,0,0,3,2,0,0,.176,.000,.176),
  buildBatter("Mission College Prep","J. Marsalek","So",2,.000,5,5,0,0,0,0,0,0,0,3,0,0,.000,.000,.000),
  buildBatter("Mission College Prep","R. Cordova","So",1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // LOMPOC
  // (No individual stats available — team record only)
];

const pitchers = [
  // ARROYO GRANDE
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.72,0,0,9.2,8,1,1,6,9,7),
  buildPitcher("Arroyo Grande","G. Pope","Sr",1.26,0,0,61,42,21,11,26,53,14),
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.39,0,0,35.1,23,19,7,11,32,10),
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",1.53,0,0,36.2,32,11,8,8,22,15),
  buildPitcher("Arroyo Grande","O. King","Jr",2.10,0,0,16.2,12,8,5,12,23,8),
  buildPitcher("Arroyo Grande","J. Ralph","Jr",3.00,0,0,3,4,3,1,0,0,1),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",3.34,0,0,35.2,29,18,17,11,29,10),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.50,0,0,28,31,31,14,21,18,8),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),
  // ATASCADERO
  buildPitcher("Atascadero","W. Azelton","So",2.80,3,3,55,61,32,22,17,44,13),
  buildPitcher("Atascadero","W. Witt","Sr",3.58,3,6,56.2,52,42,29,27,43,16),
  buildPitcher("Atascadero","C. Knoph","Jr",4.54,1,2,12.1,12,11,8,9,8,5),
  buildPitcher("Atascadero","D. Mitchell","Sr",5.97,2,5,29.1,56,38,25,14,17,9),
  buildPitcher("Atascadero","J. Litten","So",7.00,0,0,7,8,7,7,8,6,4),
  buildPitcher("Atascadero","V. Rivera","Sr",7.64,0,0,3.2,6,4,4,3,2,3),
  buildPitcher("Atascadero","A. Madrigal","Sr",7.78,1,1,9,9,12,10,11,4,6),
  buildPitcher("Atascadero","M. Cullen","Jr",9.48,0,0,10.1,18,18,14,6,7,10),
  // CABRILLO
  buildPitcher("Cabrillo","J. Clark","So",3.00,0,1,18.2,18,13,8,9,15,10),
  buildPitcher("Cabrillo","J. Low","Sr",4.26,3,7,49.1,49,38,30,21,29,11),
  buildPitcher("Cabrillo","M. Koff","Sr",5.91,1,0,21.1,28,19,18,16,22,11),
  buildPitcher("Cabrillo","C. Powell","Jr",6.12,0,1,16,23,18,14,4,9,6),
  buildPitcher("Cabrillo","F. Lopez","Sr",6.92,0,6,28.1,39,44,28,34,15,9),
  buildPitcher("Cabrillo","L. Rounds","So",7.00,0,0,3,4,5,3,2,0,1),
  buildPitcher("Cabrillo","J. Heidt","Jr",8.88,1,3,17.1,36,33,22,7,3,7),
  buildPitcher("Cabrillo","I. Lopez","So",10.50,0,1,6,12,13,9,4,5,3),
  buildPitcher("Cabrillo","L. Vorce","Jr",28.00,0,1,1,1,5,4,5,0,1),
  // MORRO BAY
  buildPitcher("Morro Bay","H. Stow","",1.40,1,0,5,9,5,1,4,1,2),
  buildPitcher("Morro Bay","J. Skaggs","Sr",1.75,0,0,4,4,1,1,2,2,3),
  buildPitcher("Morro Bay","E. Brown","Sr",3.21,4,5,61,72,37,28,15,58,16),
  buildPitcher("Morro Bay","C. League","Fr",3.50,1,0,20,20,14,10,8,18,11),
  buildPitcher("Morro Bay","C. White","Sr",3.50,1,2,18,20,13,9,5,17,14),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",3.76,4,2,41,45,31,22,10,28,12),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","E. Davis","Sr",5.97,4,3,29.1,36,31,25,15,17,12),
  buildPitcher("Morro Bay","J. Deovlet","So",6.00,0,0,7,11,6,6,2,5,3),
  buildPitcher("Morro Bay","M. Miner","Jr",52.50,0,0,0.2,17,9,5,4,1,2),
  // NIPOMO
  buildPitcher("Nipomo","E. Silveira-19","Sr",3.19,7,4,63.2,53,46,29,41,57,14),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.25,0,0,8,18,7,6,5,4,4),
  buildPitcher("Nipomo","E. Silveira-3","Sr",5.36,5,2,47,53,48,36,44,50,13),
  buildPitcher("Nipomo","K. Simonson","So",6.00,0,0,2.1,1,2,2,3,2,2),
  buildPitcher("Nipomo","G. Groshart","Sr",6.30,0,2,13.1,16,17,12,17,13,7),
  buildPitcher("Nipomo","F. Callaghan","Jr",6.30,0,2,6.2,10,8,6,4,4,5),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.42,1,1,12,15,14,11,15,4,5),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.50,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","J. Lanier","Sr",7.41,0,0,5.2,10,10,6,4,2,2),
  buildPitcher("Nipomo","Z. Garibay","Sr",22.91,0,1,3.2,11,12,12,4,2,4),
  buildPitcher("Nipomo","K. Thomas","So",0.00,0,0,0,2,2,2,0,0,1),
  // PASO ROBLES
  buildPitcher("Paso Robles","M. Garcia","Sr",1.40,0,0,10,3,2,2,5,17,8),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.40,3,1,43.2,47,23,15,16,43,11),
  buildPitcher("Paso Robles","E. Rendon","So",2.62,5,0,45.1,23,22,17,42,75,13),
  buildPitcher("Paso Robles","T. Freitas","Sr",3.58,2,0,29.1,25,25,15,14,30,10),
  buildPitcher("Paso Robles","J. Soboleski","Jr",3.71,0,0,11.1,16,7,6,7,6,6),
  buildPitcher("Paso Robles","S. Roby","Sr",5.88,0,0,16.2,19,16,14,15,11,7),
  buildPitcher("Paso Robles","B. Lowry","Jr",6.43,0,0,16.1,19,20,15,9,20,9),
  buildPitcher("Paso Robles","X. Hermanson","Jr",0.00,0,0,2,2,1,0,0,0,2),
  // PIONEER VALLEY
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.71,1,2,32.2,35,23,8,13,22,8),
  buildPitcher("Pioneer Valley","D. Cortez","So",1.97,1,0,10.2,11,6,3,5,12,8),
  buildPitcher("Pioneer Valley","J. Romero","So",2.10,0,0,3.1,2,2,1,1,0,1),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",2.33,5,1,36,30,22,12,16,32,11),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",2.47,1,1,22.2,21,12,8,7,17,8),
  buildPitcher("Pioneer Valley","M. Botello","Jr",2.80,0,0,5,7,2,2,2,5,5),
  buildPitcher("Pioneer Valley","I. Garcia","Jr",2.83,4,2,29.2,22,14,12,12,24,10),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",3.54,3,1,29.2,30,21,15,23,23,12),
  buildPitcher("Pioneer Valley","I. Martinez","Sr",5.00,0,2,7,12,11,5,4,3,4),
  buildPitcher("Pioneer Valley","J. Medina","Jr",14.00,0,1,1,2,2,2,1,3,1),
  buildPitcher("Pioneer Valley","J. Lopez","Sr",23.10,0,0,3.1,12,13,11,5,1,2),
  // RIGHETTI
  buildPitcher("Righetti","K. Walker","Jr",2.80,5,2,50,46,29,20,15,39,10),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","I. Rocha","So",3.56,5,2,55,66,35,28,19,33,12),
  buildPitcher("Righetti","M. Anderson","Sr",4.94,1,0,11.1,7,10,8,9,8,4),
  buildPitcher("Righetti","N. Lancor","Sr",5.08,3,3,30.1,37,29,22,17,23,15),
  buildPitcher("Righetti","G. Rodriguez","Sr",5.08,2,2,31.2,35,28,23,12,12,12),
  buildPitcher("Righetti","E. Barcenas","Sr",5.25,0,0,2.2,0,2,2,3,3,2),
  buildPitcher("Righetti","C. Viker","Sr",6.00,0,0,2.1,4,6,2,4,2,3),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  buildPitcher("Righetti","A. Stevens","Fr",0.00,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","M. Villegas","So",0.00,0,0,0,0,0,0,0,0,1),
  buildPitcher("Righetti","D. Nevarez","Sr",0.00,0,0,0,0,0,0,0,0,1),
  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.85,6,5,59,70,37,24,25,66,13),
  buildPitcher("San Luis Obispo","J. Riley","Jr",3.10,2,2,29.1,30,20,13,10,25,9),
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.63,6,2,46.1,52,32,24,21,28,10),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",3.67,2,1,21,25,21,11,13,21,8),
  buildPitcher("San Luis Obispo","T. Blaney","So",4.28,2,0,18,20,14,11,10,13,7),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",4.38,0,0,8,9,9,5,9,4,8),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",10.50,0,0,7.1,14,14,11,5,7,6),
  buildPitcher("San Luis Obispo","L. Drenckpohl","Sr",18.00,0,0,2.1,2,6,6,6,1,1),
  buildPitcher("San Luis Obispo","C. Torell","So",0.00,0,0,2,1,0,0,1,5,1),
  // SANTA MARIA
  buildPitcher("Santa Maria","B. Alejo","Jr",1.80,1,0,23.1,20,15,6,7,18,8),
  buildPitcher("Santa Maria","D. Martin","Sr",4.41,0,0,33.1,39,22,21,11,38,8),
  buildPitcher("Santa Maria","J. Medina-30","Sr",4.49,0,0,39,40,41,25,39,66,15),
  buildPitcher("Santa Maria","J. Calderon","Sr",4.67,0,0,3,2,2,2,4,3,2),
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.85,0,0,8.2,9,10,6,5,9,3),
  buildPitcher("Santa Maria","J. Medina-21","Sr",5.60,0,0,20,22,17,16,20,28,8),
  buildPitcher("Santa Maria","A. Rice","Fr",19.09,0,0,3.2,12,15,10,5,2,3),
  buildPitcher("Santa Maria","A. Ybarra","Sr",0.00,0,0,1,1,0,0,0,0,1),
  // SANTA YNEZ
  buildPitcher("Santa Ynez","E. Roberts","So",1.33,5,0,47.1,51,15,9,11,42,11),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",1.52,6,4,69,51,34,15,28,95,13),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.68,1,0,8.1,5,2,2,5,11,8),
  buildPitcher("Santa Ynez","C. Palmer","Jr",2.02,3,0,17.1,7,6,5,11,22,5),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.77,0,1,13,10,10,7,15,22,7),
  buildPitcher("Santa Ynez","S. Rhea","Jr",5.25,0,1,4,6,7,3,5,6,3),
  buildPitcher("Santa Ynez","A. Lewis","Fr",6.46,0,0,4.1,5,5,4,4,4,3),
  // ST. JOSEPH
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.74,1,0,19,9,10,2,11,14,9),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.14,8,2,52.1,44,23,16,11,67,11),
  buildPitcher("St. Joseph","C. Chanley","Sr",2.18,5,2,35.1,27,15,11,24,37,10),
  buildPitcher("St. Joseph","X. Horta","So",2.51,4,1,39,38,22,14,21,40,10),
  buildPitcher("St. Joseph","L. Woodruff","So",2.86,5,0,36.2,28,18,15,11,26,12),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",3.71,0,0,5.2,8,7,3,1,5,5),
  buildPitcher("St. Joseph","R. Schaffer","So",6.00,0,1,7,9,8,6,8,4,3),
  buildPitcher("St. Joseph","R. Roemling","Sr",6.75,0,0,9.1,13,11,9,6,10,6),
  buildPitcher("St. Joseph","S. Grupe","So",21.00,0,0,1,3,3,3,1,0,1),
  buildPitcher("St. Joseph","C. Goncalves","Jr",0.00,0,0,0.2,0,0,0,0,1,1),
  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,3,1,15.1,9,4,0,7,9,6),
  buildPitcher("Templeton","A. Abatti","Jr",1.83,2,0,38.1,38,36,10,19,33,11),
  buildPitcher("Templeton","L. Rivera","Jr",3.19,4,0,48.1,56,35,22,22,40,11),
  buildPitcher("Templeton","W. Patch","Sr",3.32,2,0,12.2,18,9,6,8,11,6),
  buildPitcher("Templeton","R. Garcia","Jr",3.94,0,0,16,18,10,9,6,9,9),
  buildPitcher("Templeton","N. Argain","Sr",4.07,3,1,55,63,52,32,31,39,17),
  buildPitcher("Templeton","C. Sims","Jr",4.90,0,0,10,8,9,7,9,5,4),
  buildPitcher("Templeton","N. Capaci","Jr",0.00,0,0,0.2,0,0,0,0,1,1),
  buildPitcher("Templeton","J. Buys","Jr",0.00,0,0,0,0,0,0,0,0,1),
  // MISSION COLLEGE PREP
  buildPitcher("Mission College Prep","J. Cortez","Sr",0.00,0,0,1.0,1,0,0,0,0,1),
  buildPitcher("Mission College Prep","T. Bernal","Jr",3.10,3,2,40.2,44,20,18,15,38,10),
  buildPitcher("Mission College Prep","B. Augustine","Jr",3.43,2,1,16.1,23,15,8,9,10,9),
  buildPitcher("Mission College Prep","B. May","Jr",4.61,1,0,13.2,15,12,9,11,9,11),
  buildPitcher("Mission College Prep","B. Orfila","Jr",5.15,4,5,51.2,70,43,38,27,41,13),
  buildPitcher("Mission College Prep","C. Treanor","Jr",6.22,0,1,9.0,11,10,8,5,5,7),
  buildPitcher("Mission College Prep","C. Mott","Jr",7.74,0,0,6.1,9,7,7,4,4,5),
  buildPitcher("Mission College Prep","H. Drake","Sr",10.16,2,2,10.1,12,17,15,17,7,8),
  buildPitcher("Mission College Prep","N. Bender","So",11.12,0,0,5.2,10,9,9,3,5,2),
  buildPitcher("Mission College Prep","B. Burt","Jr",16.80,0,1,3.1,8,10,8,4,1,2),
];

// ============================================================
// STANDINGS DATA — update W/L records each week
// ============================================================
const standingsData = {
  mountain: [
    { abbr:"SJ",  name:"St. Joseph",          lw:13,ll:2, ow:23, ol:6,  ot:1 },
    { abbr:"AG",  name:"Arroyo Grande",        lw:10,ll:5, ow:24, ol:9,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:8, ll:7, ow:17, ol:12, ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:6, ll:9, ow:12, ol:12, ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:5, ll:10,ow:16, ol:13, ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:3, ll:12,ow:11, ol:17, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:10,ll:2, ow:18, ol:11, ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:7, ll:5, ow:13, ol:14, ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:6, ll:6, ow:10, ol:18, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:5, ll:7, ow:14, ol:16, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:10,ow:5,  ol:21, ot:0 },
  ],
  ocean: [
    { abbr:"SY",  name:"Santa Ynez",     lw:6, ll:3, ow:17, ol:8,  ot:0 },
    { abbr:"PV",  name:"Pioneer Valley", lw:6, ll:3, ow:15, ol:10,  ot:2 },
    { abbr:"NIP", name:"Nipomo",         lw:5, ll:4, ow:14, ol:14, ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:1, ll:8, ow:10, ol:11, ot:0 },
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
  // SEVEN innings, not nine. MaxPreps prints high school ERA as ER*7/IP, which is
  // what every p.era below already is. Computing the league constant on a nine-inning
  // basis made LG_ERA 29% too high and inflated every ERA+ and pWAR on the site.
  const newERA  = tIP > 0 ? (tER * 7) / tIP : LG_ERA;
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

// ===================== JERSEY NUMBERS =====================
// history.js stores a jersey number on every archived row so that same-named
// teammates can be told apart when matching players across seasons. The 2026
// MaxPreps captures did not carry numbers into this file, so `num` is
// reconstructed from what is recoverable:
//
//   1. Rows already using the "-NN" duplicate-name suffix convention
//      (E. Silveira-3, J. Medina-30, etc.)
//   2. Anything listed in JERSEY_OVERRIDES below
//
// Everything else gets num: null, which is harmless. A number only matters when
// a roster carries two players with the same abbreviated name. Add entries here
// as numbers become available; nothing else needs to change.
const JERSEY_OVERRIDES = {
  // "Team|Name": jersey
  // Nipomo carries two L. Hobbs and Santa Maria two A. Rice this season without
  // the -NN suffix. They are separable by class year, and history.js falls back
  // to class year when no number is present, but adding real numbers here is the
  // more reliable fix.
};

function assignJerseys() {
  const apply = p => {
    const m = /-(\d+)$/.exec(p.name);
    if (m) { p.num = parseInt(m[1], 10); return; }
    const o = JERSEY_OVERRIDES[p.team + '|' + p.name];
    p.num = (o === undefined) ? null : o;
  };
  batters.forEach(apply);
  pitchers.forEach(apply);
}

// Run on load
assignJerseys();
recalcLeagueAvgs();

