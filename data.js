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
const LG_WOBA       = 0.360;  // CCAA league avg wOBA
const WOBA_SCALE    = 0.884;  // wOBA/lgOBP ratio for this run environment
const LG_R_PA       = 0.190;  // runs per PA (CCAA avg; MLB≈0.115)
const LG_ERA        = 4.81;   // CCAA league ERA
const RUNS_PER_WIN  = 6.0;    // scaled for HS run environment — produces meaningful WAR per short season
const REPL_RUNS_600 = -33.4;  // replacement-level runs per 600 PA (scaled)
const RAA_PER_600   = 95.1;   // runs above avg per 600 PA swing
// Regression anchors — full credibility at these thresholds
const WRC_FULL_PA   = 80;     // PA for full wRC+ credibility
const ERA_FULL_IP   = 40;     // IP for full ERA+ credibility
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
  // This lets poor hitters show negative WAR rather than getting pulled to average
  const weight = Math.min(pa / WRC_FULL_PA, 1.0);
  const anchor = raw >= 100 ? 100 : REPL_WRC;
  return Math.round(raw * weight + anchor * (1 - weight));
}

function calcOWAR(wRC_plus, pa) {
  if (wRC_plus === null || pa < 15) return null;
  const weight = Math.min(pa / WAR_FULL_PA, 1.0);
  // runs above average (negative if below-avg hitter)
  const raa = ((wRC_plus - 100) / 100) * (pa / 600) * RAA_PER_600;
  // runs above replacement (replacement is below average, so this adds value)
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
  const raw = (LG_ERA / era) * 100;
  // Regress toward 100 for small IP samples
  const weight = Math.min(ip / ERA_FULL_IP, 1.0);
  return Math.round(raw * weight + 100 * (1 - weight));
}

function calcPWAR(era, ip) {
  if (ip < 5) return null;
  const weight = Math.min(ip / WAR_FULL_IP, 1.0);
  const raa = (LG_ERA - era) / 9 * ip;
  const rar = raa + (0.03 * ip); // replacement bump
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
    overall: "13-2-1",
    leagueRecord: "6-1",
    wins: 13, losses: 2, ties: 1,
    leagueWins: 6, leagueLosses: 1,
    caRank: 25,
    gp: 16,
    teamBavg: .294, teamOBP: .418, teamSLG: .413,
    teamERA: 2.25, teamIP: 109
  },
  {
    id: "arroyo-grande",
    name: "Arroyo Grande",
    mascot: "Eagles",
    location: "Arroyo Grande, CA",
    coach: "N/A",
    colors: "Blue, Gold",
    league: "CCAA - Mountain",
    overall: "11-4",
    leagueRecord: "5-2",
    wins: 11, losses: 4, ties: 0,
    leagueWins: 5, leagueLosses: 2,
    caRank: 63,
    gp: 15,
    teamBavg: .355, teamOBP: .437, teamSLG: .508,
    teamERA: 1.97, teamIP: 96
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
    caRank: 392,
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
    overall: "10-4",
    leagueRecord: "4-1",
    wins: 10, losses: 4, ties: 0,
    leagueWins: 4, leagueLosses: 1,
    caRank: 313,
    gp: 13,
    teamBavg: .263, teamOBP: .391, teamSLG: .322,
    teamERA: 2.74, teamIP: 87
  },
  {
    id: "nipomo",
    name: "Nipomo",
    mascot: "Titans",
    location: "Nipomo, CA",
    coach: "Caleb Buendia",
    colors: "Black, Cardinal, Silver",
    league: "CCAA - Ocean",
    overall: "9-5",
    leagueRecord: "2-1",
    wins: 9, losses: 5, ties: 0,
    leagueWins: 2, leagueLosses: 1,
    caRank: 272,
    gp: 14,
    teamBavg: .316, teamOBP: .399, teamSLG: .366,
    teamERA: 4.18, teamIP: 87
  },
  {
    id: "paso-robles",
    name: "Paso Robles",
    mascot: "Bearcats",
    location: "Paso Robles, CA",
    coach: "N/A",
    colors: "Crimson, White",
    league: "CCAA - Sunset",
    overall: "9-6",
    leagueRecord: "5-1",
    wins: 9, losses: 6, ties: 0,
    leagueWins: 5, leagueLosses: 1,
    caRank: 142,
    gp: 15,
    teamBavg: .342, teamOBP: .423, teamSLG: .470,
    teamERA: 2.26, teamIP: 86.2
  },
  {
    id: "slo",
    name: "San Luis Obispo",
    mascot: "Tigers",
    location: "San Luis Obispo, CA",
    coach: "Sean Gabriel",
    colors: "Black, Gold",
    league: "CCAA - Sunset",
    overall: "9-6",
    leagueRecord: "5-1",
    wins: 9, losses: 6, ties: 0,
    leagueWins: 5, leagueLosses: 1,
    caRank: 267,
    gp: 15,
    teamBavg: .293, teamOBP: .396, teamSLG: .375,
    teamERA: 3.63, teamIP: 106
  },
  {
    id: "righetti",
    name: "Righetti",
    mascot: "Warriors",
    location: "Santa Maria, CA",
    coach: "Kyle Tognazzini",
    colors: "Purple, Gold",
    league: "CCAA - Mountain",
    overall: "8-5",
    leagueRecord: "4-3",
    wins: 8, losses: 5, ties: 0,
    leagueWins: 4, leagueLosses: 3,
    caRank: 157,
    gp: 13,
    teamBavg: .365, teamOBP: .474, teamSLG: .534,
    teamERA: 3.39, teamIP: 82.2
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    mascot: "Pirates",
    location: "Morro Bay, CA",
    coach: "Jarred Zill",
    colors: "Royal Blue, White",
    league: "CCAA - Mountain",
    overall: "8-5",
    leagueRecord: "3-4",
    wins: 8, losses: 5, ties: 0,
    leagueWins: 3, leagueLosses: 4,
    caRank: 127,
    gp: 13,
    teamBavg: .301, teamOBP: .378, teamSLG: .430,
    teamERA: 4.08, teamIP: 84
  },
  {
    id: "lompoc",
    name: "Lompoc",
    mascot: "Braves",
    location: "Lompoc, CA",
    coach: "J. Carlson",
    colors: "Navy, Gold",
    league: "CCAA - Mountain",
    overall: "7-8",
    leagueRecord: "1-6",
    wins: 7, losses: 8, ties: 0,
    leagueWins: 1, leagueLosses: 6,
    caRank: 251,
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
    overall: "6-9",
    leagueRecord: "1-3",
    wins: 6, losses: 9, ties: 0,
    leagueWins: 1, leagueLosses: 3,
    caRank: 576,
    gp: 15,
    teamBavg: .271, teamOBP: .377, teamSLG: .348,
    teamERA: 4.09, teamIP: 101
  },
  {
    id: "mission-prep",
    name: "Mission College Prep",
    mascot: "Royals",
    location: "San Luis Obispo, CA",
    coach: "E. Stewart",
    colors: "Navy, White",
    league: "CCAA - Mountain",
    overall: "5-7",
    leagueRecord: "2-5",
    wins: 5, losses: 7, ties: 0,
    leagueWins: 2, leagueLosses: 5,
    caRank: 296,
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
    overall: "4-10",
    leagueRecord: "2-4",
    wins: 4, losses: 10, ties: 0,
    leagueWins: 2, leagueLosses: 4,
    caRank: 580,
    gp: 14,
    teamBavg: .212, teamOBP: .378, teamSLG: .281,
    teamERA: 4.68, teamIP: 91.1
  },
  {
    id: "santa-maria",
    name: "Santa Maria",
    mascot: "Saints",
    location: "Santa Maria, CA",
    coach: "N/A",
    colors: "Red, White",
    league: "CCAA - Ocean",
    overall: "4-7",
    leagueRecord: "0-5",
    wins: 4, losses: 7, ties: 0,
    leagueWins: 0, leagueLosses: 5,
    caRank: 710,
    gp: 11,
    teamBavg: .309, teamOBP: .418, teamSLG: .349,
    teamERA: 4.47, teamIP: 72
  },
  {
    id: "cabrillo",
    name: "Cabrillo",
    mascot: "Conquistadores",
    location: "Lompoc, CA",
    coach: "Cole Osborne",
    colors: "Black, Gold, White",
    league: "CCAA - Sunset",
    overall: "2-13",
    leagueRecord: "1-5",
    wins: 2, losses: 13, ties: 0,
    leagueWins: 1, leagueLosses: 5,
    caRank: 748,
    gp: 15,
    teamBavg: .225, teamOBP: .318, teamSLG: .278,
    teamERA: 6.57, teamIP: 97
  }
];

// ===================== PLAYER STATS =====================
// Full batting and pitching rosters with advanced stat calculations

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
  // K% = K / estimated batters faced (K + (IP*~4.3 batters/inn approx))
  // Better: use actual BF proxy = AB_faced ≈ IP*3 + H + BB
  const bf_est = ip > 0 ? (ip * 3 + h + bb) : null;
  const kpct = bf_est && bf_est > 0 ? (k / bf_est) * 100 : null;
  return { team, name, year, era, w, l, ip, h, r, er, bb, k, app, k9, kbb, era_plus, pwar, kpct };
}

const batters = [
  // ARROYO GRANDE
  buildBatter("Arroyo Grande","A. Winter","Jr",14,.613,39,31,9,19,7,1,0,0,2,1,5,1,.667,.645,1.312),
  buildBatter("Arroyo Grande","R. Servin","Jr",15,.479,60,48,17,23,13,8,0,3,11,6,1,0,.583,.833,1.416),
  buildBatter("Arroyo Grande","O. King","Jr",8,.500,4,4,0,2,1,0,0,0,0,1,0,0,.500,.500,1.000),
  buildBatter("Arroyo Grande","T. Bournonville","Sr",14,.364,51,44,11,16,14,0,0,3,4,7,2,1,.431,.568,.999),
  buildBatter("Arroyo Grande","T. Kurth","Sr",14,.349,51,43,8,15,12,5,0,2,5,6,1,1,.420,.605,1.025),
  buildBatter("Arroyo Grande","C. Gotchal","Jr",14,.370,31,27,6,10,4,3,0,0,1,3,1,0,.414,.481,.895),
  buildBatter("Arroyo Grande","M. Richwine","Sr",13,.310,33,29,6,9,5,2,0,0,3,7,0,0,.375,.379,.754),
  buildBatter("Arroyo Grande","B. Paz","Fr",13,.318,26,22,5,7,7,2,0,1,3,8,0,1,.385,.545,.930),
  buildBatter("Arroyo Grande","J. Stumph","Jr",14,.308,50,39,13,12,6,3,0,0,9,4,1,0,.449,.385,.834),
  buildBatter("Arroyo Grande","J. Kreowski","Sr",13,.269,30,26,7,7,5,1,0,1,4,8,0,0,.367,.423,.790),
  buildBatter("Arroyo Grande","T. Winterberg","Jr",12,.250,18,16,1,4,3,1,0,0,2,9,0,0,.333,.313,.646),
  buildBatter("Arroyo Grande","J. Ralph","Jr",15,.259,60,54,10,14,6,1,0,1,4,5,2,0,.333,.333,.666),
  buildBatter("Arroyo Grande","K. Warwick","Jr",10,.235,17,17,3,4,1,0,1,0,0,7,0,0,.235,.353,.588),
  buildBatter("Arroyo Grande","C. Jaynes","Jr",8,.444,11,9,5,4,2,0,0,0,1,3,1,0,.545,.444,.989),

  // ATASCADERO
  buildBatter("Atascadero","M. Cullen","Jr",9,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  buildBatter("Atascadero","W. Witt","Sr",13,.273,52,33,12,9,3,2,0,1,18,10,1,0,.538,.424,.962),
  buildBatter("Atascadero","A. Donaldson","So",9,.278,26,18,3,5,1,0,0,0,7,7,0,0,.480,.278,.758),
  buildBatter("Atascadero","W. Litten","Sr",14,.293,53,41,5,12,13,3,1,0,6,9,6,0,.453,.415,.868),
  buildBatter("Atascadero","S. Ernst","Sr",9,.280,26,25,3,7,3,1,0,0,1,12,0,0,.308,.320,.628),
  buildBatter("Atascadero","D. Mitchell","Sr",9,.250,35,32,5,8,5,2,1,0,1,6,2,0,.314,.375,.689),
  buildBatter("Atascadero","E. Wanner","Sr",13,.176,51,34,10,6,4,0,0,0,13,3,1,1,.408,.176,.584),
  buildBatter("Atascadero","W. Azelton","So",14,.179,52,39,6,7,8,2,1,0,8,14,4,1,.365,.282,.647),
  buildBatter("Atascadero","M. Beck","Jr",14,.174,27,23,7,4,2,0,0,0,4,6,0,0,.296,.174,.470),
  buildBatter("Atascadero","J. Litten","So",14,.176,45,34,5,6,4,2,0,0,6,12,3,1,.341,.235,.576),
  buildBatter("Atascadero","M. Zepeda","Sr",14,.152,44,33,3,5,5,1,1,0,7,9,0,0,.300,.242,.542),

  // CABRILLO
  buildBatter("Cabrillo","M. Koff","Sr",14,.344,39,32,8,11,5,5,0,0,3,6,2,2,.432,.500,.932),
  buildBatter("Cabrillo","J. Clark","So",14,.360,33,25,5,9,5,1,0,0,3,11,1,1,.433,.400,.833),
  buildBatter("Cabrillo","L. Vorce","Jr",12,.281,36,32,3,9,2,0,0,0,3,1,0,1,.343,.281,.624),
  buildBatter("Cabrillo","F. Lopez","Sr",15,.250,47,40,5,10,4,2,0,0,4,12,2,1,.340,.300,.640),
  buildBatter("Cabrillo","G. Barraza","Sr",15,.233,50,43,8,10,2,0,0,0,5,8,2,0,.340,.233,.573),
  buildBatter("Cabrillo","C. Powell","Jr",15,.196,52,46,7,9,2,3,0,0,6,7,0,0,.288,.261,.549),
  buildBatter("Cabrillo","F. Hernandez","Jr",15,.196,51,46,6,9,2,2,1,0,3,10,2,0,.275,.283,.558),
  buildBatter("Cabrillo","L. Ragoza","Jr",11,.188,19,16,2,3,0,0,0,0,2,7,1,0,.316,.188,.504),

  // MORRO BAY
  buildBatter("Morro Bay","Q. Crotts","Sr",13,.500,49,38,20,19,13,6,1,4,5,4,6,0,.612,1.026,1.638),
  buildBatter("Morro Bay","C. White","Sr",12,.486,52,35,10,17,15,1,0,2,5,2,0,12,.423,.686,1.109),
  buildBatter("Morro Bay","E. Brown","Sr",12,.452,31,31,9,14,7,0,0,0,0,0,0,0,.452,.452,.904),
  buildBatter("Morro Bay","C. Wilkinson","Sr",13,.375,47,40,8,15,11,6,1,0,7,8,0,0,.468,.575,1.043),
  buildBatter("Morro Bay","T. Gray","Sr",13,.324,43,37,4,12,5,3,0,0,2,5,4,0,.419,.405,.824),
  buildBatter("Morro Bay","J. Deovlet","So",13,.257,45,35,6,9,11,2,0,0,6,3,2,2,.378,.314,.692),
  buildBatter("Morro Bay","E. Davis","Sr",11,.188,35,32,5,6,5,2,0,0,2,8,0,1,.229,.250,.479),
  buildBatter("Morro Bay","C. Waldon","Jr",12,.132,42,38,5,5,3,0,0,0,3,9,1,0,.214,.132,.346),

  // NIPOMO
  buildBatter("Nipomo","J. Anderson","Sr",5,.667,3,3,1,2,0,0,0,0,0,1,0,0,.667,.667,1.334),
  buildBatter("Nipomo","B. Hageman","So",13,.558,53,43,16,24,7,1,0,0,4,2,2,1,.600,.581,1.181),
  buildBatter("Nipomo","E. Silveira","Sr",13,.375,50,40,6,15,12,2,0,0,6,6,4,0,.500,.425,.925),
  buildBatter("Nipomo","G. Groshart","Sr",13,.333,53,48,5,16,23,7,0,0,3,4,1,1,.377,.479,.856),
  buildBatter("Nipomo","L. Hobbs","Sr",13,.349,53,43,21,15,4,1,0,0,3,2,6,1,.453,.372,.825),
  buildBatter("Nipomo","L. Hobbs","Fr",13,.257,43,35,4,9,6,2,0,0,6,4,1,0,.381,.314,.695),
  buildBatter("Nipomo","C. Moulden","So",13,.318,48,44,8,14,12,4,0,0,3,7,1,0,.375,.409,.784),
  buildBatter("Nipomo","E. Silveira","Sr",13,.278,38,36,4,10,5,1,0,0,1,5,0,1,.289,.306,.595),
  buildBatter("Nipomo","T. Oxley","Sr",12,.160,34,25,6,4,1,1,0,0,8,14,1,0,.382,.200,.582),

  // PASO ROBLES
  buildBatter("Paso Robles","M. Garcia","Sr",13,.442,53,43,20,19,9,4,1,0,9,1,1,0,.547,.581,1.128),
  buildBatter("Paso Robles","B. Lowry","Jr",13,.415,51,41,12,17,16,3,1,0,8,6,0,2,.490,.537,1.027),
  buildBatter("Paso Robles","T. Freitas","Sr",13,.381,49,42,11,16,10,6,0,0,3,0,3,1,.449,.524,.973),
  buildBatter("Paso Robles","C. Prieto","Jr",13,.375,47,40,10,15,9,5,0,0,3,4,1,2,.413,.500,.913),
  buildBatter("Paso Robles","K. Magdaleno","Jr",7,.500,7,6,5,3,1,1,0,0,1,0,0,0,.571,.667,1.238),
  buildBatter("Paso Robles","E. Dobroth","Jr",13,.357,51,42,13,15,13,2,1,0,5,7,4,0,.471,.452,.923),
  buildBatter("Paso Robles","E. Rendon","So",12,.326,47,43,10,14,11,3,0,2,1,6,2,1,.362,.535,.897),
  buildBatter("Paso Robles","X. Hermanson","Jr",12,.324,40,34,6,11,9,5,0,0,4,4,1,0,.410,.471,.881),
  buildBatter("Paso Robles","J. Soboleski","Jr",13,.308,45,39,9,12,6,4,1,0,5,7,1,0,.400,.462,.862),
  buildBatter("Paso Robles","G. Berlingeri","Sr",2,.600,5,5,2,3,0,0,0,0,0,1,0,0,.600,.600,1.200),

  // PIONEER VALLEY
  buildBatter("Pioneer Valley","I. Enriquez","Jr",12,.485,44,33,10,16,14,1,0,1,7,3,3,1,.591,.606,1.197),
  buildBatter("Pioneer Valley","K. Milner","Jr",10,.448,36,29,4,13,10,4,0,0,6,5,1,0,.556,.586,1.142),
  buildBatter("Pioneer Valley","L. Dreier","Jr",8,.375,12,8,4,3,1,0,0,0,3,1,1,0,.583,.375,.958),
  buildBatter("Pioneer Valley","D. Cortez","So",13,.317,51,41,12,13,7,6,0,0,10,7,0,0,.451,.463,.914),
  buildBatter("Pioneer Valley","M. Rosas","Sr",11,.286,35,28,7,8,2,1,0,0,3,8,3,1,.412,.321,.733),
  buildBatter("Pioneer Valley","I. Martinez","Sr",8,.222,13,9,1,2,2,0,0,0,4,0,0,0,.462,.222,.684),
  buildBatter("Pioneer Valley","I. Garcia","Jr",6,.250,4,4,1,1,0,0,0,0,0,0,0,0,.250,.250,.500),
  buildBatter("Pioneer Valley","U. Ponce","Jr",12,.219,35,32,6,7,4,1,0,0,1,14,1,1,.265,.250,.515),
  buildBatter("Pioneer Valley","E. Ponce","Sr",13,.244,52,41,16,10,1,1,0,1,6,5,4,1,.392,.293,.685),

  // RIGHETTI
  buildBatter("Righetti","K. Walker","Jr",13,.585,48,41,17,24,15,8,0,3,6,1,0,1,.625,1.000,1.625),
  buildBatter("Righetti","G. Cole","So",13,.514,48,37,15,19,5,3,0,0,7,5,0,1,.578,.595,1.173),
  buildBatter("Righetti","N. Kesner","Sr",13,.486,47,35,11,17,12,2,1,0,10,9,0,1,.587,.600,1.187),
  buildBatter("Righetti","N. Roberts","Sr",13,.457,48,35,9,16,13,4,1,1,10,4,1,2,.562,.714,1.276),
  buildBatter("Righetti","M. Villegas","So",12,.333,33,24,8,8,6,1,1,1,9,12,0,0,.515,.583,1.098),
  buildBatter("Righetti","M. Anderson","Sr",13,.347,54,49,10,17,5,1,0,1,4,7,1,0,.407,.429,.836),
  buildBatter("Righetti","Z. Andersen","So",12,.179,38,28,5,5,6,1,0,3,7,11,2,1,.378,.536,.914),
  buildBatter("Righetti","N. Verduzco","So",13,.250,44,32,9,8,6,1,0,0,10,6,0,0,.429,.281,.710),
  buildBatter("Righetti","D. Nevarez","Sr",13,.206,42,34,5,7,7,3,0,0,5,8,3,0,.357,.294,.651),

  // SAN LUIS OBISPO
  buildBatter("San Luis Obispo","J. Riley","Jr",15,.458,59,48,6,22,10,2,0,0,9,6,1,1,.542,.500,1.042),
  buildBatter("San Luis Obispo","J. Goodwin","Sr",15,.341,53,44,10,15,10,1,0,0,4,11,4,1,.442,.364,.806),
  buildBatter("San Luis Obispo","J. Taylor","Sr",14,.258,36,31,5,8,7,1,0,2,5,9,0,0,.361,.484,.845),
  buildBatter("San Luis Obispo","L. Drenckpohl","Sr",15,.321,59,53,9,17,9,3,1,0,5,10,0,0,.379,.415,.794),
  buildBatter("San Luis Obispo","C. Stephens","Jr",15,.319,56,47,11,15,9,3,1,0,9,8,0,0,.429,.426,.855),
  buildBatter("San Luis Obispo","T. Blaney","So",15,.303,42,33,10,10,4,2,0,1,9,8,0,0,.452,.455,.907),
  buildBatter("San Luis Obispo","G. Bramble","Sr",15,.263,62,57,13,15,9,5,0,1,5,11,0,0,.323,.404,.727),
  buildBatter("San Luis Obispo","P. Wyatt","Jr",15,.213,58,47,9,10,9,1,0,0,6,4,3,1,.333,.234,.567),

  // SANTA MARIA
  buildBatter("Santa Maria","O. Sedano","So",2,1.000,3,2,1,2,2,0,0,0,1,0,0,0,1.000,1.000,2.000),
  buildBatter("Santa Maria","B. Alejo","Jr",11,.421,42,38,5,16,11,3,0,0,0,3,4,0,.476,.500,.976),
  buildBatter("Santa Maria","J. Calderon","Sr",11,.432,42,37,7,16,6,0,0,0,2,2,1,1,.463,.432,.895),
  buildBatter("Santa Maria","J. Medina","Sr",11,.375,43,32,13,12,5,1,0,0,11,7,0,0,.535,.406,.941),
  buildBatter("Santa Maria","D. Martin","Sr",11,.324,43,34,12,11,6,3,0,0,7,3,2,0,.465,.412,.877),
  buildBatter("Santa Maria","A. Ybarra","Sr",11,.281,40,32,5,9,5,2,0,0,7,7,1,0,.425,.344,.769),
  buildBatter("Santa Maria","A. Rice","So",11,.306,40,36,6,11,9,0,0,0,2,5,2,0,.375,.306,.681),
  buildBatter("Santa Maria","A. Rice","Fr",10,.240,28,25,3,6,7,2,0,0,3,6,0,0,.321,.320,.641),
  buildBatter("Santa Maria","J. Medina","Sr",11,.235,38,34,5,8,5,1,0,0,4,8,0,0,.316,.265,.581),

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
  buildBatter("St. Joseph","A. Bluem","Jr",16,.474,67,57,26,27,14,7,0,5,7,2,3,0,.552,.860,1.412),
  buildBatter("St. Joseph","E. Hendricks","So",12,.500,18,12,10,6,0,1,0,0,6,1,0,0,.667,.583,1.250),
  buildBatter("St. Joseph","C. Chanley","Sr",16,.383,64,47,13,18,11,4,1,1,6,1,9,2,.516,.574,1.090),
  buildBatter("St. Joseph","L. Woodruff","So",14,.321,32,28,6,9,12,2,0,1,2,7,1,0,.387,.500,.887),
  buildBatter("St. Joseph","C. Goncalves","Jr",16,.354,59,48,9,17,16,3,0,0,5,8,4,2,.441,.417,.858),
  buildBatter("St. Joseph","M. Majewski","Jr",15,.229,44,35,6,8,7,3,0,0,8,7,1,0,.386,.314,.700),
  buildBatter("St. Joseph","M. O'Keefe","Jr",15,.258,40,31,5,8,7,1,0,1,7,9,1,1,.400,.387,.787),
  buildBatter("St. Joseph","S. Covarrubias","Sr",14,.154,58,39,15,6,1,1,0,0,17,8,1,0,.421,.179,.600),

  // TEMPLETON
  buildBatter("Templeton","L. Stetz","Sr",13,.409,50,44,10,18,8,3,3,0,3,6,3,0,.480,.614,1.094),
  buildBatter("Templeton","C. Sims","Jr",14,.400,55,50,14,20,3,1,1,0,2,6,3,0,.455,.460,.915),
  buildBatter("Templeton","L. Rivera","Jr",14,.319,57,47,11,15,11,1,0,0,6,6,1,2,.393,.340,.733),
  buildBatter("Templeton","N. Argain","Sr",12,.273,24,22,3,6,3,1,0,0,1,4,0,0,.304,.318,.622),
  buildBatter("Templeton","W. Patch","Sr",7,.273,13,11,3,3,1,1,0,0,2,4,0,0,.385,.364,.749),
  buildBatter("Templeton","L. Olsen","Sr",15,.244,61,45,14,11,4,5,0,0,13,11,3,0,.443,.356,.799),
  buildBatter("Templeton","J. Beckwith","So",15,.250,42,32,6,8,7,1,0,0,6,8,1,0,.385,.281,.666),
  buildBatter("Templeton","N. Capaci","Jr",14,.258,38,31,4,8,3,1,0,0,5,15,1,1,.368,.290,.658),
  buildBatter("Templeton","R. Garcia","Jr",13,.240,27,25,4,6,3,0,1,1,2,8,0,0,.296,.440,.736),
  buildBatter("Templeton","C. Hamilton","So",14,.207,40,29,3,6,6,1,0,0,8,14,2,1,.400,.241,.641),

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
  buildPitcher("Arroyo Grande","T. Winterberg","Jr",1.11,0,0,19,12,6,3,3,18,4),
  buildPitcher("Arroyo Grande","Z. Johnson","Jr",0.00,0,0,13.2,8,3,0,5,7,6),
  buildPitcher("Arroyo Grande","G. Pope","Sr",1.33,0,0,21,13,9,4,6,16,6),
  buildPitcher("Arroyo Grande","M. Hicks","Sr",0.00,0,0,1.1,2,0,0,2,2,2),
  buildPitcher("Arroyo Grande","O. King","Jr",2.62,0,0,8,8,5,3,4,11,4),
  buildPitcher("Arroyo Grande","T. Bournonville","Sr",2.88,0,0,17,10,7,7,6,11,5),
  buildPitcher("Arroyo Grande","J. Kreowski","Sr",3.50,0,0,16,15,15,8,13,8,5),

  // ATASCADERO
  buildPitcher("Atascadero","W. Azelton","So",3.20,2,2,30.2,37,20,14,9,28,7),
  buildPitcher("Atascadero","W. Witt","Sr",3.50,1,2,24,22,17,12,14,14,8),
  buildPitcher("Atascadero","D. Mitchell","Sr",4.73,1,2,13.1,21,16,9,4,7,4),
  buildPitcher("Atascadero","J. Litten","So",2.33,0,0,3,3,1,1,3,3,1),
  buildPitcher("Atascadero","M. Cullen","Jr",7.56,0,0,8.1,13,11,9,4,5,8),
  buildPitcher("Atascadero","C. Knoph","Jr",8.84,0,2,6.1,7,8,8,7,3,4),
  buildPitcher("Atascadero","A. Madrigal","Sr",12.25,0,1,4,6,9,7,4,2,4),

  // CABRILLO
  buildPitcher("Cabrillo","J. Low","Sr",5.12,1,5,27.1,20,26,20,14,19,7),
  buildPitcher("Cabrillo","J. Heidt","Jr",6.10,1,1,10.1,16,12,9,3,2,4),
  buildPitcher("Cabrillo","C. Powell","Jr",4.50,0,0,14,16,11,9,4,7,5),
  buildPitcher("Cabrillo","J. Clark","So",4.34,0,0,9.2,13,10,6,7,8,6),
  buildPitcher("Cabrillo","F. Lopez","Sr",7.45,0,5,20.2,28,35,22,25,11,7),
  buildPitcher("Cabrillo","M. Koff","Sr",10.50,0,0,8,14,13,12,8,9,6),
  buildPitcher("Cabrillo","I. Lopez","So",10.50,0,1,6,12,13,9,4,5,3),

  // MORRO BAY
  buildPitcher("Morro Bay","E. Brown","Sr",3.19,3,2,26.1,26,15,12,8,27,8),
  buildPitcher("Morro Bay","C. Wilkinson","Sr",2.21,2,1,19,17,11,6,3,17,6),
  buildPitcher("Morro Bay","E. Davis","Sr",6.12,2,2,16,21,18,14,7,7,5),
  buildPitcher("Morro Bay","C. White","Sr",5.65,1,0,8.2,11,7,7,2,8,6),
  buildPitcher("Morro Bay","Q. Crotts","Sr",0.00,0,0,2,0,0,0,0,3,1),

  // NIPOMO
  buildPitcher("Nipomo","E. Silveira","Sr",2.78,5,1,27.2,15,13,11,17,30,7),
  buildPitcher("Nipomo","E. Silveira","Sr",4.82,2,1,20.1,21,23,14,18,25,7),
  buildPitcher("Nipomo","A. Mendoza","Jr",3.97,0,0,12.1,12,7,7,9,10,6),
  buildPitcher("Nipomo","G. Groshart","Sr",4.74,0,1,10.1,10,12,7,11,11,4),
  buildPitcher("Nipomo","L. Hobbs","Sr",6.12,1,1,8,10,8,7,10,3,4),
  buildPitcher("Nipomo","L. Hobbs","Fr",5.60,0,0,5,13,4,4,4,1,3),

  // PASO ROBLES
  buildPitcher("Paso Robles","E. Rendon","So",1.64,4,0,21.1,9,6,5,24,38,7),
  buildPitcher("Paso Robles","M. Garcia","Sr",0.88,0,0,8,2,1,1,4,15,6),
  buildPitcher("Paso Robles","N. Contreras","Jr",1.67,2,1,21,20,9,5,4,20,5),
  buildPitcher("Paso Robles","T. Freitas","Sr",2.21,1,0,12.2,6,9,4,8,11,4),
  buildPitcher("Paso Robles","B. Lowry","Jr",4.90,0,0,10,9,10,7,4,14,5),
  buildPitcher("Paso Robles","S. Roby","Sr",4.90,0,0,10,12,9,7,6,6,4),

  // PIONEER VALLEY
  buildPitcher("Pioneer Valley","I. Garcia","Jr",0.54,2,0,13,7,2,1,3,8,4),
  buildPitcher("Pioneer Valley","J. Valdez","Jr",1.34,2,0,15.2,15,7,3,6,16,5),
  buildPitcher("Pioneer Valley","K. Owen","Sr",1.27,1,0,11,10,7,2,6,10,3),
  buildPitcher("Pioneer Valley","D. Cortez","So",2.21,1,0,6.1,6,2,2,3,6,5),
  buildPitcher("Pioneer Valley","J. Beltran","Jr",3.29,2,1,17,17,10,8,6,14,6),
  buildPitcher("Pioneer Valley","J. Rojas","Sr",3.65,1,1,15.1,12,9,8,5,12,5),

  // RIGHETTI
  buildPitcher("Righetti","I. Rocha","So",2.05,3,1,27.1,32,9,8,8,19,5),
  buildPitcher("Righetti","K. Walker","Jr",2.62,1,0,8,10,6,3,0,6,3),
  buildPitcher("Righetti","G. Rodriguez","Sr",3.05,2,0,20.2,17,12,9,8,5,8),
  buildPitcher("Righetti","M. Andersen","Jr",3.50,0,0,2,2,3,1,2,1,1),
  buildPitcher("Righetti","N. Lancor","Sr",4.62,2,2,16.2,17,15,11,10,11,7),
  buildPitcher("Righetti","E. Barcenas","Sr",7.00,0,0,2,0,2,2,3,3,1),
  buildPitcher("Righetti","G. Cole","So",10.50,0,1,4,7,6,6,4,4,2),

  // SAN LUIS OBISPO
  buildPitcher("San Luis Obispo","J. Riley","Jr",0.88,1,0,16,8,5,2,5,15,5),
  buildPitcher("San Luis Obispo","G. Bramble","Sr",3.54,5,1,29.2,29,18,15,10,19,6),
  buildPitcher("San Luis Obispo","J. Taylor","Sr",3.18,3,3,33,39,23,15,12,40,7),
  buildPitcher("San Luis Obispo","F. Avrett","Jr",4.38,0,1,16,24,20,10,7,16,6),
  buildPitcher("San Luis Obispo","D. Wilson","Jr",7.00,0,0,5,6,6,5,3,4,4),
  buildPitcher("San Luis Obispo","J. Giordano","Jr",0.00,0,0,3,3,3,0,1,0,4),

  // SANTA MARIA
  buildPitcher("Santa Maria","B. Alejo","Jr",0.88,0,0,8,4,1,1,1,5,3),
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
  buildPitcher("St. Joseph","R. Aparicio","Sr",0.75,0,0,9.1,4,6,1,7,6,6),
  buildPitcher("St. Joseph","L. Woodruff","So",2.19,3,0,22.1,17,9,7,7,17,7),
  buildPitcher("St. Joseph","M. Majewski","Jr",2.28,4,1,27.2,24,10,9,6,38,6),
  buildPitcher("St. Joseph","X. Horta","So",2.30,3,1,21.1,15,10,7,7,21,5),
  buildPitcher("St. Joseph","C. Chanley","Sr",2.56,3,0,13.2,7,6,5,14,12,5),
  buildPitcher("St. Joseph","R. Roemling","Sr",2.62,0,0,8,8,5,3,4,10,5),
  buildPitcher("St. Joseph","M. O'Keefe","Jr",4.50,0,0,4.2,8,7,3,1,5,4),

  // TEMPLETON
  buildPitcher("Templeton","L. Olsen","Sr",0.00,1,0,5,1,0,0,3,3,2),
  buildPitcher("Templeton","W. Patch","Sr",0.95,1,0,7.1,7,3,1,7,9,3),
  buildPitcher("Templeton","A. Abatti","Jr",1.88,0,0,22.1,17,20,6,12,22,6),
  buildPitcher("Templeton","L. Rivera","Jr",4.20,2,0,25,34,21,15,16,20,6),
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
    { abbr:"SJ",  name:"St. Joseph",          lw:6, ll:1, ow:13, ol:2,  ot:1, str:"W2" },
    { abbr:"AG",  name:"Arroyo Grande",        lw:5, ll:2, ow:11, ol:4,  ot:0, str:"W3" },
    { abbr:"RHS", name:"Righetti",             lw:4, ll:3, ow:8,  ol:5,  ot:0, str:"W4" },
    { abbr:"MB",  name:"Morro Bay",            lw:3, ll:4, ow:8,  ol:5,  ot:0, str:"L2" },
    { abbr:"MP",  name:"Mission College Prep", lw:2, ll:5, ow:5,  ol:7,  ot:0, str:"L3" },
    { abbr:"LOM", name:"Lompoc",               lw:1, ll:6, ow:7,  ol:8,  ot:0, str:"L5" },
  ],
  sunset: [
    { abbr:"SLO", name:"San Luis Obispo", lw:5, ll:1, ow:9,  ol:6,  ot:0, str:"W1" },
    { abbr:"PAS", name:"Paso Robles",     lw:5, ll:1, ow:9,  ol:6,  ot:0, str:"W4" },
    { abbr:"ATA", name:"Atascadero",      lw:2, ll:4, ow:4,  ol:10, ot:0, str:"L1" },
    { abbr:"TMP", name:"Templeton",       lw:1, ll:3, ow:6,  ol:9,  ot:0, str:"W2" },
    { abbr:"CAB", name:"Cabrillo",        lw:1, ll:5, ow:2,  ol:13, ot:0, str:"L2" },
  ],
  ocean: [
    { abbr:"PV",  name:"Pioneer Valley", lw:4, ll:1, ow:10, ol:4,  ot:0, str:"W5" },
    { abbr:"NIP", name:"Nipomo",         lw:2, ll:1, ow:9,  ol:5,  ot:0, str:"L2" },
    { abbr:"SY",  name:"Santa Ynez",    lw:2, ll:1, ow:11, ol:3,  ot:0, str:"W1" },
    { abbr:"SM",  name:"Santa Maria",   lw:0, ll:5, ow:4,  ol:7,  ot:0, str:"L2" },
  ]
};
