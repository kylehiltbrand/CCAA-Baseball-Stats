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
const DATA_UPDATED = "2026-05-14"; // YYYY-MM-DD — stats through May 13

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
    caRank: 37,
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
    overall: "21-8",
    leagueRecord: "10-5",
    wins: 21, losses: 8, ties: 0,
    leagueWins: 10, leagueLosses: 5,
    caRank: 70,
    gp: 29,
    teamBavg: .341, teamOBP: .434, teamSLG: .517,
    teamERA: 2.00, teamIP: 192.1
  },
  {
    id: "santa-ynez",
    name: "Santa Ynez",
    mascot: "Pirates",
    location: "Santa Ynez, CA",
    coach: "Craig Gladstone",
    colors: "Orange, Black",
    league: "CCAA - Ocean",
    overall: "15-7",
    leagueRecord: "6-3",
    wins: 15, losses: 7, ties: 0,
    leagueWins: 6, leagueLosses: 3,
    caRank: 458,
    gp: 22,
    teamBavg: .357, teamOBP: .462, teamSLG: .470,
    teamERA: 2.18, teamIP: 144.2
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
    caRank: 491,
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
    overall: "13-13",
    leagueRecord: "5-4",
    wins: 13, losses: 13, ties: 0,
    leagueWins: 5, leagueLosses: 4,
    caRank: 477,
    gp: 26,
    teamBavg: .321, teamOBP: .400, teamSLG: .375,
    teamERA: 5.33, teamIP: 165.1
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
    caRank: 305,
    gp: 26,
    teamBavg: .307, teamOBP: .383, teamSLG: .422,
    teamERA: 3.20, teamIP: 161.2
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "18-10",
    leagueRecord: "10-2",
    wins: 18, losses: 10, ties: 0,
    leagueWins: 10, leagueLosses: 2,
    caRank: 253,
    gp: 28,
    teamBavg: .323, teamOBP: .416, teamSLG: .415,
    teamERA: 3.76, teamIP: 190
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
    caRank: 166,
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
    overall: "16-12",
    leagueRecord: "5-10",
    wins: 16, losses: 12, ties: 0,
    leagueWins: 5, leagueLosses: 10,
    caRank: 195,
    gp: 28,
    teamBavg: .305, teamOBP: .389, teamSLG: .417,
    teamERA: 4.15, teamIP: 182
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
    overall: "13-15",
    leagueRecord: "5-7",
    wins: 13, losses: 15, ties: 0,
    leagueWins: 5, leagueLosses: 7,
    caRank: 481,
    gp: 28,
    teamBavg: .293, teamOBP: .391, teamSLG: .380,
    teamERA: 3.15, teamIP: 184.1
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
    caRank: 220,
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
    overall: "10-17",
    leagueRecord: "6-6",
    wins: 10, losses: 17, ties: 0,
    leagueWins: 6, leagueLosses: 6,
    caRank: 522,
    gp: 27,
    teamBavg: .227, teamOBP: .372, teamSLG: .289,
    teamERA: 4.26, teamIP: 177.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "9-10",
    leagueRecord: "1-8",
    wins: 9, losses: 10, ties: 0,
    leagueWins: 1, leagueLosses: 8,
    caRank: 769,
    gp: 19,
    teamBavg: .325, teamOBP: .416, teamSLG: .375,
    teamERA: 4.53, teamIP: 119
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
    caRank: 702,
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
  buildBatter("Arroyo Grande","A. Winter","Jr",25,.510,61,49,16,25,10,1,0,0,6,4,5,1,.590,.531,1.121),
  buildBatter("Arroyo Grande","R. Servin","Jr",29,.472,119,89,37,42,29,13,2,4,26,8,3,1,.597,.798,1.395),
  buildBatter("Arroyo Grande","T. Kurth","Sr",25,.407,94,81,17,33,28,7,0,6,7,12,3,1,.467,.716,1.183),
  buildBatter("Arroyo Grande","R. Bronson","Sr",20,.351,41,37,8,13,9,2,0,2,3,9,0,0,.400,.568,.968),
  buildBatter("Arroyo Grande","B. Paz","Fr",27,.338,81,71,21,24,21,3,1,6,6,16,1,1,.392,.662,1.054),
  buildBatter("Arroyo Grande","J. Ralph","Jr",29,.316,113,98,21,31,9,5,0,1,12,7,2,1,.398,.398,.796),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",20,.316,25,19,2,6,4,1,0,0,6,9,0,0,.480,.368,.848),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",28,.311,106,90,23,28,29,3,0,6,7,12,7,2,.396,.544,.940),
  buildBatter("Arroyo Grande","O. King","Jr",18,.308,16,13,3,4,1,0,0,0,3,6,0,0,.438,.308,.746),
  buildBatter("Arroyo Grande","J. Stumph","Jr",26,.299,87,67,18,20,12,4,1,1,15,9,2,0,.440,.433,.873),
  buildBatter("Arroyo Grande","M. Richwine","Sr",25,.291,65,55,13,16,14,3,0,2,6,15,1,0,.371,.455,.826),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",24,.289,52,45,9,13,7,3,0,1,5,10,1,0,.373,.422,.795),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",27,.274,74,62,11,17,10,4,0,0,8,10,1,0,.366,.339,.705),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",17,.250,27,24,9,6,5,0,1,0,2,6,1,0,.333,.333,.666),
  buildBatter("Arroyo Grande","K. Warwick","Jr",23,.206,39,34,8,7,2,0,1,0,0,11,4,0,.289,.265,.554),
  buildBatter("Arroyo Grande","Z. Johnson","Jr",15,.000,1,1,0,0,1,0,0,0,0,0,0,0,.000,.000,.000),
  buildBatter("Arroyo Grande","G. Pope","Sr",13,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Arroyo Grande","M. Hicks","Sr",8,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // ATASCADERO
  buildBatter("Atascadero","W. Litten","Sr",27,.301,101,83,12,25,22,5,1,1,7,18,10,1,.416,.422,.838),
  buildBatter("Atascadero","A. Donaldson","So",22,.273,71,55,11,15,3,0,0,0,12,13,3,0,.429,.273,.702),
  buildBatter("Atascadero","W. Witt","Sr",26,.258,102,66,20,17,9,5,0,1,32,24,2,0,.510,.379,.889),
  buildBatter("Atascadero","D. Mitchell","Sr",22,.250,80,72,11,18,8,5,1,0,4,11,3,0,.316,.347,.663),
  buildBatter("Atascadero","M. Zepeda","Sr",27,.235,85,68,7,16,10,2,1,0,13,14,0,0,.358,.294,.652),
  buildBatter("Atascadero","J. Litten","So",26,.219,82,64,9,14,8,4,0,0,10,18,4,3,.346,.281,.627),
  buildBatter("Atascadero","S. Ernst","Sr",22,.214,66,56,5,12,4,1,0,0,8,27,2,0,.333,.232,.565),
  buildBatter("Atascadero","E. Wanner","Sr",26,.200,99,70,18,14,10,3,0,0,19,9,2,3,.372,.243,.615),
  buildBatter("Atascadero","C. Knoph","Jr",8,.200,6,5,0,1,2,0,0,0,1,3,0,0,.333,.200,.533),
  buildBatter("Atascadero","A. Madrigal","Sr",13,.176,19,17,2,3,2,1,0,0,2,9,0,0,.263,.235,.498),
  buildBatter("Atascadero","R. Brown","Sr",15,.176,19,17,4,3,0,0,0,0,2,7,0,0,.263,.176,.439),
  buildBatter("Atascadero","M. Beck","Jr",25,.171,48,41,11,7,3,0,0,0,5,12,1,0,.277,.171,.448),
  buildBatter("Atascadero","W. Azelton","So",24,.170,65,47,6,8,9,3,1,0,11,19,5,2,.369,.277,.646),
  buildBatter("Atascadero","V. Rivera","Sr",6,.125,9,8,1,1,1,0,0,0,1,4,0,0,.222,.125,.347),
  buildBatter("Atascadero","C. Savino","Fr",5,.111,13,9,1,1,1,0,0,0,4,5,0,0,.385,.111,.496),
  buildBatter("Atascadero","M. Cullen","Jr",11,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
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
  buildBatter("Morro Bay","Q. Crotts","Sr",28,.432,112,81,40,35,25,13,1,5,19,13,12,0,.589,.802,1.391),
  buildBatter("Morro Bay","E. Brown","Sr",26,.379,75,66,20,25,14,0,0,0,7,3,2,0,.453,.379,.832),
  buildBatter("Morro Bay","C. White","Sr",27,.341,113,85,23,29,36,4,0,6,11,13,3,14,.381,.600,.981),
  buildBatter("Morro Bay","C. Wilkinson","Sr",26,.337,96,83,18,28,23,10,1,1,13,17,0,0,.427,.518,.945),
  buildBatter("Morro Bay","J. Deovlet","So",28,.321,101,84,16,27,16,6,0,0,12,6,3,2,.416,.393,.809),
  buildBatter("Morro Bay","T. Gray","Sr",28,.280,102,93,10,26,12,5,0,0,3,15,5,1,.333,.333,.666),
  buildBatter("Morro Bay","E. Davis","Sr",25,.273,82,77,13,21,9,2,0,0,4,16,0,1,.305,.299,.604),
  buildBatter("Morro Bay","J. Skaggs","Sr",25,.258,69,66,12,17,4,2,0,0,1,8,2,0,.290,.288,.578),
  buildBatter("Morro Bay","C. Waldon","Jr",25,.257,82,74,9,19,9,4,0,0,5,18,3,0,.329,.311,.640),
  buildBatter("Morro Bay","C. League","Fr",25,.184,45,38,14,7,4,1,0,0,6,9,0,1,.289,.211,.500),
  buildBatter("Morro Bay","B. Walker","",20,.095,27,21,3,2,0,0,0,0,3,6,3,0,.296,.095,.391),
  buildBatter("Morro Bay","V. Nelson","",10,.000,6,5,1,0,0,0,0,0,0,1,1,0,.167,.000,.167),
  buildBatter("Morro Bay","H. Stow","",3,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  // NIPOMO
  buildBatter("Nipomo","B. Hageman","So",24,.481,96,79,30,38,12,4,0,0,7,7,2,1,.528,.532,1.060),
  buildBatter("Nipomo","J. Anderson","Sr",7,.375,8,8,2,3,0,0,1,0,0,4,0,0,.375,.625,1.000),
  buildBatter("Nipomo","G. Groshart","Sr",22,.368,86,76,12,28,28,10,0,0,5,4,3,2,.419,.500,.919),
  buildBatter("Nipomo","C. Moulden","So",24,.349,91,83,16,29,27,7,0,0,5,9,2,0,.400,.434,.834),
  buildBatter("Nipomo","E. Silveira-19","Sr",25,.346,94,81,14,28,20,4,0,0,8,12,4,1,.426,.395,.821),
  buildBatter("Nipomo","E. Silveira-3","Sr",25,.343,72,67,8,23,12,2,1,0,3,7,0,1,.366,.403,.769),
  buildBatter("Nipomo","L. Hobbs","Sr",25,.338,102,74,43,25,4,1,0,0,9,2,18,1,.510,.351,.861),
  buildBatter("Nipomo","L. Hobbs","Fr",24,.279,81,68,7,19,10,2,0,0,10,5,2,0,.388,.309,.697),
  buildBatter("Nipomo","T. Barr","Sr",21,.264,61,53,3,14,11,2,0,0,6,17,1,1,.344,.302,.646),
  buildBatter("Nipomo","T. Oxley","Sr",24,.232,69,56,12,13,4,3,0,0,10,24,1,1,.353,.286,.639),
  buildBatter("Nipomo","J. Lanier","Sr",6,.200,5,5,1,1,1,0,0,0,0,1,0,0,.200,.200,.400),
  buildBatter("Nipomo","K. Simonson","So",19,.167,38,36,2,6,3,0,0,0,0,8,0,2,.158,.167,.325),
  buildBatter("Nipomo","H. Roesner","Jr",17,.136,24,22,4,3,1,0,0,0,2,7,0,0,.208,.136,.344),
  buildBatter("Nipomo","K. Thomas","So",8,.000,3,1,1,0,0,0,0,0,1,0,1,0,.667,.000,.667),
  buildBatter("Nipomo","Z. Garibay","Sr",6,.000,2,2,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","F. Callaghan","Jr",6,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Nipomo","A. Mendoza","Jr",10,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  // PASO ROBLES
  buildBatter("Paso Robles","K. Magdaleno","Jr",10,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","J. Lopez","Jr",10,.444,13,9,2,4,2,1,0,0,3,2,0,0,.583,.556,1.139),
  buildBatter("Paso Robles","B. Lowry","Jr",24,.423,88,71,20,30,22,4,1,1,13,10,1,3,.500,.549,1.049),
  buildBatter("Paso Robles","G. Berlingeri","Sr",5,.400,11,10,2,4,0,0,0,0,1,2,0,0,.455,.400,.855),
  buildBatter("Paso Robles","M. Garcia","Sr",23,.360,88,75,27,27,13,5,1,0,10,9,3,0,.455,.453,.908),
  buildBatter("Paso Robles","J. Soboleski","Jr",24,.319,79,72,15,23,12,9,1,1,6,13,1,0,.380,.514,.894),
  buildBatter("Paso Robles","C. Prieto","Jr",22,.317,69,60,13,19,12,6,0,0,4,9,1,2,.358,.417,.775),
  buildBatter("Paso Robles","T. Freitas","Sr",24,.317,89,82,18,26,14,8,0,0,3,1,3,1,.360,.415,.775),
  buildBatter("Paso Robles","E. Dobroth","Jr",24,.299,91,77,19,23,18,2,1,0,9,14,4,1,.396,.351,.747),
  buildBatter("Paso Robles","E. Rendon","So",23,.288,81,73,16,21,17,5,1,3,2,8,5,1,.346,.507,.853),
  buildBatter("Paso Robles","X. Hermanson","Jr",23,.283,73,60,13,17,13,6,0,1,10,6,1,1,.389,.433,.822),
  buildBatter("Paso Robles","E. Nevarez","Jr",8,.214,14,14,1,3,3,2,0,0,0,6,0,0,.214,.357,.571),
  buildBatter("Paso Robles","C. Glover","Sr",17,.208,33,24,4,5,1,1,0,0,5,7,2,0,.387,.250,.637),
  buildBatter("Paso Robles","L. Christensen","Jr",13,.118,19,17,2,2,0,0,0,0,1,5,0,0,.167,.118,.285),
  buildBatter("Paso Robles","C. Contreras","Jr",16,.105,20,19,3,2,3,1,0,0,1,3,0,0,.150,.158,.308),
  buildBatter("Paso Robles","N. Contreras","Jr",15,.077,13,13,1,1,0,0,0,0,0,7,0,0,.077,.077,.154),
  buildBatter("Paso Robles","S. Roby","Sr",7,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Paso Robles","L. Ross","Sr",2,.000,2,2,1,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  // PIONEER VALLEY
  buildBatter("Pioneer Valley","J. Romero","So",2,.500,3,2,1,1,0,0,0,0,1,0,0,0,.667,.500,1.167),
  buildBatter("Pioneer Valley","K. Milner","Jr",17,.458,60,48,7,22,19,7,0,1,11,7,1,0,.567,.667,1.234),
  buildBatter("Pioneer Valley","I. Enriquez","Jr",23,.439,85,66,19,29,18,3,0,1,14,5,4,1,.553,.530,1.083),
  buildBatter("Pioneer Valley","D. Cortez","So",25,.338,92,77,21,26,12,12,0,0,14,15,1,0,.446,.494,.940),
  buildBatter("Pioneer Valley","I. Garcia","Jr",15,.267,16,15,0,4,2,0,0,0,1,6,0,0,.312,.267,.579),
  buildBatter("Pioneer Valley","I. Martinez","Sr",17,.269,35,26,5,7,6,0,0,0,7,9,2,0,.424,.269,.693),
  buildBatter("Pioneer Valley","L. Dreier","Jr",13,.250,21,16,7,4,1,0,0,0,4,5,1,0,.429,.250,.679),
  buildBatter("Pioneer Valley","E. Ponce","Sr",24,.227,93,75,26,17,3,1,0,1,11,12,6,1,.370,.253,.623),
  buildBatter("Pioneer Valley","M. Rosas","Sr",22,.224,67,58,9,13,7,1,0,0,5,18,3,1,.318,.241,.559),
  buildBatter("Pioneer Valley","K. Owen","Sr",21,.222,59,54,7,12,4,1,0,0,2,7,2,1,.271,.241,.512),
  buildBatter("Pioneer Valley","U. Ponce","Jr",19,.208,56,48,12,10,9,2,1,0,5,19,2,1,.309,.292,.601),
  buildBatter("Pioneer Valley","J. Lopez","Sr",24,.185,75,65,9,12,11,1,1,0,4,20,2,2,.247,.231,.478),
  buildBatter("Pioneer Valley","M. Andrade","Jr",19,.182,57,44,7,8,9,2,0,0,9,16,2,2,.345,.227,.572),
  buildBatter("Pioneer Valley","L. Rodriguez","So",3,.167,8,6,3,1,0,0,0,0,1,3,1,0,.375,.167,.542),
  buildBatter("Pioneer Valley","J. Valdez","Jr",16,.167,18,12,5,2,0,0,0,0,3,5,3,0,.444,.167,.611),
  buildBatter("Pioneer Valley","J. Rojas","Sr",19,.167,32,24,5,4,4,0,0,0,5,4,1,2,.333,.167,.500),
  buildBatter("Pioneer Valley","J. Medina","Jr",15,.111,21,18,2,2,2,0,0,0,2,10,1,0,.200,.111,.311),
  buildBatter("Pioneer Valley","M. Botello","Jr",5,.000,4,4,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Pioneer Valley","J. Beltran","Jr",13,.000,6,4,2,0,0,0,0,0,2,2,0,0,.333,.000,.333),
  buildBatter("Pioneer Valley","D. Dahl","So",2,.000,6,4,0,0,0,0,0,0,2,0,0,0,.333,.000,.333),
  // RIGHETTI
  buildBatter("Righetti","E. Barcenas","Sr",6,1.000,3,2,0,2,1,1,0,0,1,0,0,0,1.000,1.500,2.500),
  buildBatter("Righetti","K. Walker","Jr",26,.506,100,89,36,45,27,13,1,5,9,6,1,1,.550,.843,1.393),
  buildBatter("Righetti","N. Roberts","Sr",26,.408,98,76,19,31,19,6,2,1,15,8,4,3,.510,.579,1.089),
  buildBatter("Righetti","G. Cole","So",21,.406,78,64,21,26,5,3,0,0,10,7,0,1,.480,.453,.933),
  buildBatter("Righetti","N. Kesner","Sr",25,.391,91,64,21,25,17,2,1,0,17,14,8,1,.556,.453,1.009),
  buildBatter("Righetti","M. Anderson","Sr",26,.326,105,92,14,30,15,3,1,1,10,13,2,0,.404,.413,.817),
  buildBatter("Righetti","Z. Andersen","So",25,.286,84,63,9,18,15,4,0,5,15,19,5,0,.458,.587,1.045),
  buildBatter("Righetti","M. Andersen","Jr",20,.279,50,43,5,12,10,3,0,1,4,12,0,2,.327,.419,.746),
  buildBatter("Righetti","M. Villegas","So",19,.256,51,39,10,10,7,1,1,1,12,17,0,0,.431,.410,.841),
  buildBatter("Righetti","C. Campa","So",9,.250,12,12,1,3,3,1,0,0,0,1,0,0,.250,.333,.583),
  buildBatter("Righetti","D. Nevarez","Sr",26,.242,77,62,8,15,12,5,0,1,9,16,3,0,.365,.371,.736),
  buildBatter("Righetti","N. Verduzco","So",25,.232,74,56,15,13,6,1,0,0,15,14,0,0,.394,.250,.644),
  buildBatter("Righetti","N. Nevarez","Fr",4,.200,6,5,0,1,0,0,0,0,1,0,0,0,.333,.200,.533),
  buildBatter("Righetti","J. Rodriguez","Sr",19,.182,12,11,4,2,0,0,0,0,1,4,0,0,.250,.182,.432),
  buildBatter("Righetti","I. Quintanar","Jr",10,.125,27,24,4,3,3,0,0,0,2,6,0,1,.185,.125,.310),
  buildBatter("Righetti","N. Lancor","Sr",22,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  buildBatter("Righetti","D. Tovar","Jr",6,.000,7,5,1,0,0,0,0,0,1,3,1,0,.286,.000,.286),
  buildBatter("Righetti","R. Harney","Sr",5,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  buildBatter("Righetti","G. Rodriguez","Sr",13,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  buildBatter("Righetti","I. Rocha","So",12,.000,0,0,1,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","J. Riley","Jr",28,.404,107,89,12,36,19,4,0,0,16,13,1,1,.495,.449,.944),
  buildBatter("San Luis Obispo","F. Avrett","Jr",15,.389,19,18,2,7,9,3,0,0,0,8,0,1,.368,.556,.924),
  buildBatter("San Luis Obispo","T. Blaney","So",28,.356,86,73,20,26,19,7,1,3,13,13,0,0,.453,.603,1.056),
  buildBatter("San Luis Obispo","J. Taylor","Sr",27,.344,77,64,12,22,20,4,0,4,11,20,1,1,.442,.594,1.036),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",28,.343,110,102,25,35,15,5,1,0,7,11,0,0,.385,.412,.797),
  buildBatter("San Luis Obispo","P. Wyatt","Jr",28,.321,105,84,22,27,17,2,0,0,11,6,5,1,.426,.345,.771),
  buildBatter("San Luis Obispo","B. Schafer","Jr",25,.315,79,54,16,17,5,4,0,0,17,6,2,0,.493,.389,.882),
  buildBatter("San Luis Obispo","C. Stephens","Jr",28,.310,104,87,19,27,14,4,1,0,17,13,0,0,.423,.379,.802),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",28,.295,93,78,15,23,18,2,0,0,9,24,5,0,.402,.321,.723),
  buildBatter("San Luis Obispo","G. Bramble","Sr",23,.289,84,76,19,22,16,7,0,1,7,12,0,1,.345,.421,.766),
  buildBatter("San Luis Obispo","J. Isaman","Sr",7,.231,14,13,3,3,1,0,0,0,0,2,0,1,.214,.231,.445),
  buildBatter("San Luis Obispo","N. Soderin","Sr",24,.200,26,20,13,4,1,0,0,0,5,9,1,0,.385,.200,.585),
  buildBatter("San Luis Obispo","D. Wilson","Jr",23,.167,20,18,1,3,3,0,0,0,2,3,0,0,.250,.167,.417),
  buildBatter("San Luis Obispo","N. Bennetti","Jr",2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  buildBatter("San Luis Obispo","Z. Wallace","Jr",6,.000,7,7,0,0,0,0,0,0,0,5,0,0,.000,.000,.000),
  buildBatter("San Luis Obispo","J. Giordano","Jr",9,1.000,1,1,0,1,0,1,0,0,0,0,0,0,1.000,2.000,3.000),
  buildBatter("San Luis Obispo","C. Torell","So",1,.000,0,0,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  // SANTA MARIA
  buildBatter("Santa Maria","J. Medina-30","Sr",19,.421,73,57,18,24,9,3,2,0,16,11,0,0,.548,.544,1.092),
  buildBatter("Santa Maria","J. Calderon","Sr",19,.397,67,58,13,23,9,0,0,0,6,3,1,1,.455,.397,.852),
  buildBatter("Santa Maria","B. Alejo","Jr",18,.387,68,62,8,24,19,4,0,0,1,6,4,1,.426,.452,.878),
  buildBatter("Santa Maria","D. Martin","Sr",17,.327,65,52,17,17,10,5,0,0,11,7,2,0,.462,.423,.885),
  buildBatter("Santa Maria","A. Ybarra","Sr",19,.321,64,56,9,18,10,3,0,0,7,12,1,0,.406,.375,.781),
  buildBatter("Santa Maria","J. Medina-21","Sr",17,.309,60,55,13,17,7,2,0,0,4,10,1,0,.367,.345,.712),
  buildBatter("Santa Maria","A. Rice","So",19,.305,63,59,10,18,12,0,0,0,2,8,2,0,.349,.305,.654),
  buildBatter("Santa Maria","A. Rice","Fr",18,.271,51,48,5,13,10,3,0,0,3,11,0,0,.314,.333,.647),
  buildBatter("Santa Maria","O. Sedano","So",6,.333,11,9,2,3,3,0,0,0,2,3,0,0,.455,.333,.788),
  buildBatter("Santa Maria","Z. Camacho","Fr",3,.250,4,4,2,1,0,1,0,0,0,1,0,0,.250,.500,.750),
  buildBatter("Santa Maria","I. Barajas","So",5,.250,5,4,1,1,0,0,0,0,0,1,1,0,.400,.250,.650),
  buildBatter("Santa Maria","U. Rodriguez","Fr",15,.233,43,30,11,7,5,1,0,0,11,4,2,0,.465,.267,.732),
  buildBatter("Santa Maria","F. Chavez","Sr",15,.227,27,22,2,5,3,0,0,0,4,7,1,0,.370,.227,.597),
  buildBatter("Santa Maria","J. Reyes","Sr",7,.000,5,5,4,0,1,0,0,0,0,4,0,0,.000,.000,.000),
  buildBatter("Santa Maria","J. Gaitan","So",9,.000,6,5,1,0,0,0,0,0,1,2,0,0,.167,.000,.167),
  // SANTA YNEZ
  buildBatter("Santa Ynez","J. Glover","Jr",22,.519,92,77,27,40,37,5,3,4,12,9,1,2,.576,.818,1.394),
  buildBatter("Santa Ynez","D. Pulido","Sr",22,.422,90,64,24,27,20,6,0,1,16,7,7,2,.562,.563,1.124),
  buildBatter("Santa Ynez","T. Jeckell","Jr",22,.405,81,74,25,30,23,7,0,0,7,7,0,0,.457,.500,.957),
  buildBatter("Santa Ynez","K. Heiduk","So",21,.397,88,73,29,29,18,4,1,1,12,16,3,0,.500,.521,1.021),
  buildBatter("Santa Ynez","E. Roberts","So",21,.377,78,61,17,23,13,7,0,0,10,12,5,1,.494,.492,.986),
  buildBatter("Santa Ynez","B. Cram","So",22,.318,79,66,18,21,7,0,0,0,11,8,1,0,.423,.318,.741),
  buildBatter("Santa Ynez","M. Skidmore","Sr",22,.312,94,80,26,25,14,8,0,0,10,11,2,1,.398,.413,.810),
  buildBatter("Santa Ynez","D. Aquistapace","Sr",22,.306,90,72,20,22,16,8,1,0,14,11,4,0,.444,.444,.888),
  buildBatter("Santa Ynez","S. Rhea","Jr",19,.235,65,51,14,12,10,1,0,0,7,14,4,1,.365,.255,.620),
  buildBatter("Santa Ynez","C. Palmer","Jr",11,.182,19,11,5,2,2,0,0,0,6,4,2,0,.526,.182,.708),
  buildBatter("Santa Ynez","A. Lewis","Fr",11,.143,25,21,5,3,4,0,0,0,2,3,0,1,.208,.143,.351),
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
  buildBatter("Templeton","L. Stetz","Sr",25,.418,92,79,17,33,21,4,4,0,7,7,5,1,.489,.570,1.059),
  buildBatter("Templeton","C. Sims","Jr",27,.400,103,95,25,38,11,5,2,0,3,9,4,1,.437,.495,.932),
  buildBatter("Templeton","L. Rivera","Jr",27,.376,108,93,22,35,16,4,2,0,10,12,1,2,.434,.462,.896),
  buildBatter("Templeton","J. Beckwith","So",28,.294,86,68,11,20,12,2,2,0,10,13,2,1,.395,.382,.777),
  buildBatter("Templeton","L. Olsen","Sr",28,.286,116,91,23,26,9,11,0,0,19,22,5,1,.431,.407,.838),
  buildBatter("Templeton","N. Capaci","Jr",27,.284,84,67,11,19,8,5,0,0,13,22,2,1,.410,.358,.768),
  buildBatter("Templeton","N. Argain","Sr",21,.267,34,30,4,8,5,1,0,0,2,6,0,0,.312,.300,.612),
  buildBatter("Templeton","J. Buys","Jr",22,.267,39,30,4,8,5,1,0,0,6,14,1,2,.385,.300,.685),
  buildBatter("Templeton","E. Abatti","Fr",17,.250,39,28,6,7,5,2,0,0,9,8,1,1,.436,.321,.757),
  buildBatter("Templeton","W. Patch","Sr",13,.222,21,18,4,4,1,1,0,0,3,7,0,0,.333,.278,.611),
  buildBatter("Templeton","C. Hamilton","So",24,.196,64,51,4,10,8,1,0,0,10,24,2,1,.344,.216,.560),
  buildBatter("Templeton","T. Miller","So",15,.184,42,38,5,7,6,3,0,0,4,10,0,0,.262,.263,.525),
  buildBatter("Templeton","R. Garcia","Jr",21,.167,46,36,4,6,4,0,1,1,7,16,0,1,.295,.306,.601),
  buildBatter("Templeton","A. Abatti","Jr",21,.062,40,32,1,2,5,1,0,0,5,14,1,1,.205,.094,.299),
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
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.72,0,0,9.2,8,1,1,6,9,7),
  buildPitcher("Arroyo Grande","G. Pope","Sr",0.93,0,0,45,29,13,6,18,38,11),
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.30,0,0,32.1,21,18,6,10,28,8),
  buildPitcher("Arroyo Grande","O. King","Jr",2.10,0,0,16.2,12,8,5,12,23,8),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.50,0,0,28,31,31,14,21,18,8),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",3.65,0,0,30.2,26,16,16,10,25,9),
  buildPitcher("Arroyo Grande","J. Ralph","Jr",0.00,0,0,3,4,3,1,0,0,1),
  buildPitcher("Arroyo Grande","R. Bronson","Sr",0.00,0,0,0,2,2,1,0,0,1),
  // ATASCADERO
  buildPitcher("Atascadero","W. Azelton","So",2.92,3,3,52.2,59,31,22,14,43,12),
  buildPitcher("Atascadero","W. Witt","Sr",3.17,3,5,53,48,37,24,22,43,15),
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
  buildPitcher("Morro Bay","E. Brown","Sr",3.44,4,4,55,65,35,27,12,50,15),
  buildPitcher("Morro Bay","C. League","Fr",3.50,1,0,20,20,14,10,8,18,11),
  buildPitcher("Morro Bay","C. White","Sr",3.71,1,2,17,19,13,9,5,15,13),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",3.76,4,2,41,45,31,22,10,28,12),
  buildPitcher("Morro Bay","Q. Crotts","Sr",4.67,0,0,3,2,4,2,2,5,2),
  buildPitcher("Morro Bay","E. Davis","Sr",5.97,4,3,29.1,36,31,25,15,17,12),
  buildPitcher("Morro Bay","J. Deovlet","So",6.00,0,0,7,11,6,6,2,5,3),
  buildPitcher("Morro Bay","M. Miner","Jr",52.50,0,0,0.2,17,9,5,4,1,2),
  // NIPOMO
  buildPitcher("Nipomo","E. Silveira-19","Sr",3.02,7,3,55.2,50,41,24,36,51,12),
  buildPitcher("Nipomo","E. Silveira-3","Sr",4.50,4,2,42,45,38,27,36,47,12),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.25,0,0,8,18,7,6,5,4,4),
  buildPitcher("Nipomo","K. Simonson","So",6.00,0,0,2.1,1,2,2,3,2,2),
  buildPitcher("Nipomo","F. Callaghan","Jr",6.30,0,2,6.2,10,8,6,4,4,5),
  buildPitcher("Nipomo","G. Groshart","Sr",6.30,0,2,13.1,16,17,12,17,13,7),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.42,1,1,12,15,14,11,15,4,5),
  buildPitcher("Nipomo","A. Mendoza","Jr",6.50,0,1,14,17,14,13,12,10,7),
  buildPitcher("Nipomo","J. Lanier","Sr",7.41,0,0,5.2,10,10,6,4,2,2),
  buildPitcher("Nipomo","K. Thomas","So",0.00,0,0,0,2,2,2,0,0,1),
  buildPitcher("Nipomo","Z. Garibay","Sr",22.91,0,1,3.2,11,12,12,4,2,4),
  // PASO ROBLES
  buildPitcher("Paso Robles","M. Garcia","Sr",1.40,0,0,10,3,2,2,5,17,8),
  buildPitcher("Paso Robles","E. Rendon","So",1.89,5,0,40.2,15,15,11,39,66,12),
  buildPitcher("Paso Robles","N. Contreras","Jr",2.67,2,1,36.2,43,22,14,14,38,10),
  buildPitcher("Paso Robles","X. Hermanson","Jr",0.00,0,0,2,2,1,0,0,0,2),
  buildPitcher("Paso Robles","T. Freitas","Sr",3.21,2,0,28.1,24,23,13,13,27,9),
  buildPitcher("Paso Robles","J. Soboleski","Jr",3.71,0,0,11.1,16,7,6,7,6,6),
  buildPitcher("Paso Robles","S. Roby","Sr",5.88,0,0,16.2,19,16,14,15,11,7),
  buildPitcher("Paso Robles","B. Lowry","Jr",6.56,0,0,16,18,20,15,8,19,8),
  // PIONEER VALLEY
  buildPitcher("Pioneer Valley","I. Garcia","Jr",1.52,4,1,27.2,15,8,6,9,24,9),
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.79,1,2,27.1,29,21,7,12,20,7),
  buildPitcher("Pioneer Valley","D. Cortez","So",1.97,1,0,10.2,11,6,3,5,12,8),
  buildPitcher("Pioneer Valley","J. Romero","So",2.10,0,0,3.1,2,2,1,1,0,1),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",2.31,4,1,33.1,27,21,11,14,30,10),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",2.67,1,1,21,16,9,8,7,16,7),
  buildPitcher("Pioneer Valley","M. Botello","Jr",3.50,0,0,4,7,2,2,2,5,4),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",3.71,3,1,28.1,29,21,15,23,23,11),
  buildPitcher("Pioneer Valley","I. Martinez","Sr",5.00,0,2,7,12,11,5,4,3,4),
  buildPitcher("Pioneer Valley","J. Medina","Jr",14.00,0,1,1,2,2,2,1,3,1),
  buildPitcher("Pioneer Valley","J. Lopez","Sr",23.10,0,0,3.1,12,13,11,5,1,2),
  // RIGHETTI
  buildPitcher("Righetti","K. Walker","Jr",2.03,4,0,31,28,16,9,9,30,7),
  buildPitcher("Righetti","I. Rocha","So",3.22,5,2,50,59,28,23,17,32,11),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","M. Anderson","Sr",4.94,1,0,11.1,7,10,8,9,8,4),
  buildPitcher("Righetti","G. Rodriguez","Sr",5.08,2,2,31.2,35,28,23,12,12,12),
  buildPitcher("Righetti","N. Lancor","Sr",5.19,3,3,29.2,36,29,22,16,22,14),
  buildPitcher("Righetti","E. Barcenas","Sr",5.25,0,0,2.2,0,2,2,3,3,2),
  buildPitcher("Righetti","C. Viker","Sr",6.00,0,0,2.1,4,6,2,4,2,3),
  buildPitcher("Righetti","G. Cole","So",7.41,1,1,5.2,7,6,6,6,6,3),
  buildPitcher("Righetti","A. Stevens","Fr",0.00,0,0,3,2,0,0,2,4,1),
  buildPitcher("Righetti","M. Villegas","So",0.00,0,0,0,0,0,0,0,0,1),
  buildPitcher("Righetti","D. Nevarez","Sr",0.00,0,0,0,0,0,0,0,0,1),
  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","J. Taylor","Sr",2.80,6,4,55,62,30,22,25,63,12),
  buildPitcher("San Luis Obispo","J. Riley","Jr",3.10,2,2,29.1,30,20,13,10,25,9),
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.55,6,2,43.1,47,30,22,21,23,9),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",3.67,2,1,21,25,21,11,13,21,8),
  buildPitcher("San Luis Obispo","T. Blaney","So",4.28,2,0,18,20,14,11,10,13,7),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",4.38,0,0,8,9,9,5,9,4,8),
  buildPitcher("San Luis Obispo","C. Torell","So",0.00,0,0,2,1,0,0,1,5,1),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",10.50,0,0,7.1,14,14,11,5,7,6),
  buildPitcher("San Luis Obispo","L. Drenckpohl","Sr",18.00,0,0,2.1,2,6,6,6,1,1),
  // SANTA MARIA
  buildPitcher("Santa Maria","B. Alejo","Jr",1.80,1,0,23.1,20,15,6,7,18,8),
  buildPitcher("Santa Maria","D. Martin","Sr",4.41,0,0,33.1,39,22,21,11,38,8),
  buildPitcher("Santa Maria","J. Medina-30","Sr",4.67,0,0,33,36,36,22,36,58,13),
  buildPitcher("Santa Maria","J. Calderon","Sr",4.67,0,0,3,2,2,2,4,3,2),
  buildPitcher("Santa Maria","U. Rodriguez","Fr",4.85,0,0,8.2,9,10,6,5,9,3),
  buildPitcher("Santa Maria","J. Medina-21","Sr",5.92,0,0,13,18,11,11,12,18,6),
  buildPitcher("Santa Maria","A. Rice","Fr",19.09,0,0,3.2,12,15,10,5,2,3),
  buildPitcher("Santa Maria","A. Ybarra","Sr",0.00,0,0,1,1,0,0,0,0,1),
  // SANTA YNEZ
  buildPitcher("Santa Ynez","E. Roberts","So",1.56,4,0,40.1,42,13,9,11,41,10),
  buildPitcher("Santa Ynez","K. Heiduk","So",1.68,1,0,8.1,5,2,2,5,11,7),
  buildPitcher("Santa Ynez","T. Jeckell","Jr",1.83,5,3,57.1,44,27,15,25,83,11),
  buildPitcher("Santa Ynez","C. Palmer","Jr",2.02,3,0,17.1,7,6,5,11,22,5),
  buildPitcher("Santa Ynez","J. Glover","Jr",3.77,0,1,13,10,10,7,15,22,7),
  buildPitcher("Santa Ynez","S. Rhea","Jr",5.25,0,1,4,6,7,3,5,6,3),
  buildPitcher("Santa Ynez","A. Lewis","Fr",6.46,0,0,4.1,5,5,4,4,4,3),
  // ST. JOSEPH
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.74,1,0,19,9,10,2,11,14,9),
  buildPitcher("St. Joseph","A. Bluem","Jr",0.00,0,0,2,2,0,0,0,1,2),
  buildPitcher("St. Joseph","C. Chanley","Sr",2.18,5,2,35.1,27,15,11,24,37,10),
  buildPitcher("St. Joseph","X. Horta","So",2.31,4,1,36.1,31,17,12,19,39,9),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.32,7,2,48.1,43,23,16,10,62,10),
  buildPitcher("St. Joseph","L. Woodruff","So",2.55,5,0,33,24,14,12,11,26,11),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",3.71,0,0,5.2,8,7,3,1,5,5),
  buildPitcher("St. Joseph","R. Schaffer","So",5.25,0,0,1.1,2,2,1,3,0,1),
  buildPitcher("St. Joseph","S. Grupe","So",21.00,0,0,1,3,3,3,1,0,1),
  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,3,1,15.1,9,4,0,7,9,6),
  buildPitcher("Templeton","A. Abatti","Jr",1.75,2,0,36,34,33,9,18,33,10),
  buildPitcher("Templeton","W. Patch","Sr",3.32,2,0,12.2,18,9,6,8,11,6),
  buildPitcher("Templeton","L. Rivera","Jr",3.29,4,0,44.2,49,30,21,20,37,10),
  buildPitcher("Templeton","R. Garcia","Jr",3.94,0,0,16,18,10,9,6,9,9),
  buildPitcher("Templeton","N. Argain","Sr",4.67,2,1,48,58,52,32,30,35,16),
  buildPitcher("Templeton","C. Sims","Jr",4.90,0,0,10,8,9,7,9,5,4),
  buildPitcher("Templeton","N. Capaci","Jr",0.00,0,0,0.2,0,0,0,0,1,1),
  buildPitcher("Templeton","J. Buys","Jr",0.00,0,0,0,0,0,0,0,0,1),
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
    { abbr:"AG",  name:"Arroyo Grande",        lw:10,ll:5, ow:21, ol:8,  ot:0 },
    { abbr:"RHS", name:"Righetti",             lw:8, ll:7, ow:16, ol:11, ot:0 },
    { abbr:"MP",  name:"Mission College Prep", lw:6, ll:9, ow:12, ol:11, ot:0 },
    { abbr:"MB",  name:"Morro Bay",            lw:5, ll:10,ow:16, ol:12, ot:0 },
    { abbr:"LOM", name:"Lompoc",               lw:3, ll:12,ow:11, ol:17, ot:0 },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:10,ll:2, ow:18, ol:10, ot:0 },
    { abbr:"PAS", name:"Paso Robles",     lw:7, ll:5, ow:12, ol:13, ot:1 },
    { abbr:"ATA", name:"Atascadero",      lw:6, ll:6, ow:10, ol:17, ot:0 },
    { abbr:"TMP", name:"Templeton",       lw:5, ll:7, ow:13, ol:15, ot:0 },
    { abbr:"CAB", name:"Cabrillo",        lw:2, ll:10,ow:5,  ol:21, ot:0 },
  ],
  ocean: [
    { abbr:"SY",  name:"Santa Ynez",     lw:6, ll:3, ow:15, ol:7,  ot:0 },
    { abbr:"PV",  name:"Pioneer Valley", lw:6, ll:3, ow:14, ol:9,  ot:2 },
    { abbr:"NIP", name:"Nipomo",         lw:5, ll:4, ow:13, ol:13, ot:0 },
    { abbr:"SM",  name:"Santa Maria",    lw:1, ll:8, ow:9,  ol:10, ot:0 },
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
