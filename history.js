/* ============================================================================
   CCAA BASEBALL — history.js
   Historical season archive. SEPARATE FROM data.js BY DESIGN.
   ============================================================================

   *** READ THIS FIRST IF YOU ARE ADDING A SEASON ***

   WHY THIS FILE IS SEPARATE FROM data.js
   --------------------------------------
   data.js runs recalcLeagueAvgs() on every page load, which sums EVERY row in
   its `batters` and `pitchers` arrays to derive the league constants that wRC+,
   ERA+, oWAR and pWAR are calibrated against.

   If historical rows were added to data.js, those constants would silently
   become a multi-year pooled average and every number on the live site would
   shift. There would be no error, just wrong output. So:

     data.js      = the CURRENT season only. Never add history to it.
     history.js   = every completed season. Never loaded by the live stat pages.

   Nothing here touches the live site unless a page explicitly loads this file.

   HOW TO ADD A SEASON
   -------------------
   1. Add a block to HISTORY keyed by season string ("2023-24", "2022-23").
   2. Fill `leagues` from the LEAGUE line in each team's MaxPreps PDF header.
      DO NOT copy the current alignment. It changes, a lot. Between 2024-25 and
      2025-26, Cabrillo moved Mountain->Sunset, Morro Bay Ocean->Mountain,
      and Pioneer Valley Sunset->Ocean. Between 2023-24 and 2024-25, EIGHT of
      the fifteen moved: Atascadero Mtn->Sun, Lompoc Sun->Mtn, Mission College
      Prep Sun->Mtn, Morro Bay Sun->Ocean, Paso Robles Ocean->Sun, San Luis
      Obispo Mtn->Sun, Santa Ynez Sun->Ocean, Templeton Ocean->Sun. And in
      2022-23 there was no Sunset league at all: the conference ran two leagues,
      Mountain and Ocean, and six of the eleven teams on file that year sit
      somewhere else in 2023-24. Any league-relative metric must use the
      alignment of its own season.
   3. Add team records from the OVERALL / LEAGUE line in the same header.
   4. Add batter rows with hb() and pitcher rows with hp(). Signatures below.
   5. Record any data-quality problems in `quality`. Be honest about them.
      Silent bad data is worse than flagged bad data.
   6. Run: node -e "require('./history.js').HIST.audit()"
      That reconciles every team against its printed season totals and prints
      anything that does not add up.

   FIELD CONVENTIONS
   -----------------
   year        "Fr" | "So" | "Jr" | "Sr" | "" when the PDF did not list one.
               Some MaxPreps team pages omit class year entirely. Where the
               player also appears in a later season, YEAR_BACKFILL below
               reconstructs it by counting backwards; those rows are tagged
               yearSource:"inferred" so any analysis can exclude them.
   num         Jersey number, or null. KEEP THIS. It is the only reliable way
               to separate same-named teammates (Morro Bay 2025 carried two
               C. White, two F. Ainley and two E. Davis; Santa Maria carried
               two J. Medina). Names alone will not resolve across seasons.
   name        Exactly as printed. Where a team has duplicate names, the row
               name is suffixed with the jersey number ("C. White-3") so the
               key stays unique. `baseName` strips that back off.
   ip          Baseball notation as a STRING: "38.1" = 38 1/3, "38.2" = 38 2/3.
               Use ipToF() to convert. Never parseFloat it directly.

   BUILDER SIGNATURES (positional, order matters, mirrors data.js)
   ---------------------------------------------------------------
   hb(team, name, year, num, gp, avg, pa, ab, r, h, rbi, dbl, tpl, hr,
      bb, k, hbp, sf, obp, slg, ops)
   hp(team, name, year, num, era, w, l, ip, h, r, er, bb, k, app)

   Derived stats are NOT stored here. They are computed on demand against the
   constants of the season being viewed, because those constants drift. The
   CCAA run environment moved measurably in one year:
       2022-23   AVG .285   R/PA .172   ERA 3.63   (itemised rows, 11 teams)
       2023-24   AVG .288   R/PA .179   ERA 3.15   (itemised rows)
       2024-25   AVG .285   R/PA .175   ERA 3.60   (itemised rows)
       2025-26   AVG .302   R/PA .184

   The 2022-23 line is NOT comparable to the three below it and should not be
   used as a league baseline without saying so. It covers 11 teams, not 15 or
   16; five CCAA members have no page in the archive for that year. See
   HISTORY["2022-23"].quality._missingTeams for how that number was arrived at.

   Batting average barely moved between 2023-24 and 2024-25 while league ERA rose
   14%. That is not a run-environment shift, it is a coverage artifact: the
   2023-24 itemised innings run 6% above the printed totals and several of the
   worst staffs are under-itemised. Weight cross-season pitching comparisons
   accordingly, and prefer R/PA to ERA when adjusting.

   Those 2024-25 figures are what constants("2024-25") actually returns, i.e.
   computed from the itemised rows in this file. The printed team totals give
   AVG .286 / R/PA .177 / ERA 3.55 across the same 15 teams. The gap is the
   missing-row problem below, not a transcription error. Use the itemised
   numbers, since those are the ones the player rows are consistent with.

   *** ERA BASIS — RESOLVED ***
   constants() computes ERA as ER * 7 / IP, because CCAA games are seven innings
   and that is the basis MaxPreps prints every individual ERA on.

   data.js formerly computed its league constant as ER * 9 / IP while storing
   seven-inning player ERAs, which made LG_ERA 4.83 against a true 3.75 and
   inflated every ERA+ and pWAR on the live site by a factor of 9/7. That is
   fixed: data.js now uses ER * 7 / IP and calcPWAR divides by 7. The two files
   are on one basis and ERA+ is comparable across seasons.

   If either file is ever changed, change both in the same commit.

   Rate stats are still NOT directly comparable across seasons, because league
   R/PA moved measurably year to year. Use HIST.eraAdjust() for that.
   ============================================================================ */

function hb(team, name, year, num, gp, avg, pa, ab, r, h, rbi, dbl, tpl, hr,
            bb, k, hbp, sf, obp, slg, ops) {
  return { team, name, year, num, gp, avg, pa, ab, r, h, rbi,
           doubles: dbl, triples: tpl, hr, bb, k, hbp, sf: sf || 0,
           obp, slg, ops, kind: 'bat' };
}
function hp(team, name, year, num, era, w, l, ip, h, r, er, bb, k, app) {
  return { team, name, year, num, era, w, l, ip, h, r, er, bb, k, app, kind: 'pit' };
}

/* Class years absent from the 2024-25 MaxPreps pages, reconstructed by counting
   back from the player's 2025-26 class in data.js. Applied at load and tagged
   yearSource:"inferred". Players who did not return in 2026 cannot be
   recovered this way and keep year:"" — they are excluded from aging curves
   automatically, since a curve needs both endpoints. */
const YEAR_BACKFILL = {
  /* 2023-24 is reconstructed from 2024-25, which is itself partly reconstructed
     from data.js, so some of these are two links down the chain. Only players
     whose base name is UNIQUE on the 2024-25 roster are inferred: Morro Bay
     fielded two F. Ainley, two C. White and two E. Davis that year, and guessing
     which one a 2023-24 row continues into would be worse than leaving it blank.
     Five of the 31 year-less 2023-24 rows are recoverable this way. */
  /* 2022-23 is FOUR links down the chain: data.js -> 2024-25 -> 2023-24 ->
     2022-23. Only three of the 66 year-less 2022-23 rows survive that many hops
     with a unique base name at every step. Everything else on the Mission
     College Prep and Morro Bay pages stays blank on purpose. */
  "2022-23": {
    "Mission College Prep": { "H. Drake":"Fr", "A. Clayton":"Fr" },
    "Morro Bay": { "Q. Crotts":"Fr" }
  },
  "2023-24": {
    "Mission College Prep": { "H. Drake":"So", "A. Clayton":"So" },
    "Morro Bay": { "T. Gray":"So", "Q. Crotts":"So", "E. Brown":"So" }
  },
  "2024-25": {
    "Mission College Prep": { "T. Bernal":"Jr", "B. Burt":"So", "J. Cortez":"Jr",
      "B. Orfila":"So", "B. May":"So", "H. Drake":"Jr", "B. Augustine":"So",
      "A. Clayton":"Jr" },
    "Morro Bay": { "Q. Crotts":"Jr", "J. Deovlet":"Fr", "C. White-3":"Jr",
      "C. Wilkinson":"Jr", "E. Davis-33":"Jr", "E. Brown":"Jr", "J. Skaggs":"Jr",
      "M. Miner":"So", "H. Stow":"Jr", "T. Gray":"Jr", "C. Gailey":"So" },
    "Nipomo": { "A. Mendoza":"So", "B. Hageman":"Fr", "G. Groshart":"Jr",
      "L. Hobbs":"Jr", "E. Silveira-19":"Jr", "E. Silveira-3":"Jr",
      "J. Lanier":"Jr" }
  }
};

const HISTORY = {

"2024-25": {
  season: "2024-25",
  label: "Spring 2025",

  /* League alignment AS IT WAS THAT YEAR. Three teams differ from 2025-26. */
  leagues: {
    "Arroyo Grande":"mountain", "Cabrillo":"mountain", "Lompoc":"mountain",
    "Mission College Prep":"mountain", "Righetti":"mountain", "St. Joseph":"mountain",
    "Atascadero":"sunset", "Paso Robles":"sunset", "Pioneer Valley":"sunset",
    "San Luis Obispo":"sunset", "Templeton":"sunset",
    "Morro Bay":"ocean", "Nipomo":"ocean", "Santa Maria":"ocean", "Santa Ynez":"ocean"
  },

  teams: [
    { name:"St. Joseph",           overall:"24-8",    leagueRecord:"13-2", w:24, l:8,  t:0, caRank:83,  coach:"Erik Morrison" },
    { name:"Morro Bay",            overall:"26-7",    leagueRecord:"12-0", w:26, l:7,  t:0, caRank:250, coach:"Jarred Zill" },
    { name:"Righetti",             overall:"16-12",   leagueRecord:"9-6",  w:16, l:12, t:0, caRank:244, coach:"Kyle Tognazzini" },
    { name:"Templeton",            overall:"16-13",   leagueRecord:"6-6",  w:16, l:13, t:0, caRank:379, coach:"N/A" },
    { name:"Paso Robles",          overall:"15-12",   leagueRecord:"7-5",  w:15, l:12, t:0, caRank:365, coach:"N/A" },
    { name:"Lompoc",               overall:"14-13",   leagueRecord:"7-8",  w:14, l:13, t:0, caRank:296, coach:"N/A" },
    { name:"San Luis Obispo",      overall:"13-14",   leagueRecord:"7-5",  w:13, l:14, t:0, caRank:386, coach:"Dean Treanor" },
    { name:"Atascadero",           overall:"13-15",   leagueRecord:"5-7",  w:13, l:15, t:0, caRank:414, coach:"Samm Spears" },
    { name:"Santa Maria",          overall:"13-8",    leagueRecord:"6-6",  w:13, l:8,  t:0, caRank:721, coach:"N/A" },
    { name:"Arroyo Grande",        overall:"13-16-1", leagueRecord:"6-9",  w:13, l:16, t:1, caRank:318, coach:"Steve Tolley" },
    { name:"Mission College Prep", overall:"12-12",   leagueRecord:"5-10", w:12, l:12, t:0, caRank:373, coach:"S.D. Harrow" },
    { name:"Pioneer Valley",       overall:"12-15",   leagueRecord:"5-7",  w:12, l:15, t:0, caRank:490, coach:"Cody Smith" },
    { name:"Santa Ynez",           overall:"11-11",   leagueRecord:"6-6",  w:11, l:11, t:0, caRank:741, coach:"N/A" },
    { name:"Cabrillo",             overall:"11-13",   leagueRecord:"5-10", w:11, l:13, t:0, caRank:385, coach:"Cole Osborne" },
    { name:"Nipomo",               overall:"9-16",    leagueRecord:"6-6",  w:9,  l:16, t:0, caRank:746, coach:"Jeff Gingrich" }
  ],

  /* Printed team season totals, used by HIST.audit() to detect rows MaxPreps
     omitted from its own player listing. Format: [PA,AB,R,H,BB,K] */
  printedTotals: {
    "Arroyo Grande":[981,835,155,231,98,174], "Atascadero":[876,764,143,210,59,181],
    "Cabrillo":[758,610,129,170,103,139],     "Mission College Prep":[730,604,150,192,96,115],
    "Morro Bay":[998,860,233,281,102,125],    "Nipomo":[783,668,147,209,80,123],
    "Paso Robles":[905,758,163,230,101,131],  "Pioneer Valley":[868,693,108,158,115,181],
    "Righetti":[911,776,145,245,101,183],     "San Luis Obispo":[816,682,115,158,93,137],
    "Santa Maria":[695,571,148,194,84,103],   "Santa Ynez":[699,574,137,152,83,145],
    "St. Joseph":[992,841,174,242,93,147],    "Templeton":[966,782,190,231,123,140],
    "Lompoc":[852,694,129,163,116,190]
  },

  quality: {
    /* Verified by reconciling every itemised row against the printed totals. */
    "Morro Bay": { completeness:0.767, pitchCompleteness:0.589, severity:"severe",
      note:"MaxPreps itemises only 765 of 998 PA. Roughly two to three regulars "+
           "are missing from the player listing entirely. The pitching side is "+
           "worse: 115.1 of 195.2 IP, so 80.1 IP and 62 strikeouts belong to "+
           "arms that never appear. Team-level rates are usable; anything "+
           "player-level for Morro Bay 2024-25 is incomplete, and any 'best "+
           "pitcher in the league' query will omit them. Notable because they "+
           "went 26-7 and 12-0 in league." },
    "St. Joseph":  { completeness:0.955, pitchCompleteness:0.955, severity:"minor" },
    "Righetti":    { completeness:1.000, pitchCompleteness:0.973, severity:"minor",
      note:"Batting itemises exactly. Pitching is 5.0 IP short, so a reliever "+
           "or two is missing from the pitcher listing only." },
    "Lompoc":      { completeness:0.972, pitchCompleteness:0.943, severity:"minor",
      note:"Also missing class year for 11 of 15 players, and Lompoc has no "+
           "2025-26 player data, so those years cannot be inferred either. "+
           "Pitching is 10.1 IP short of the printed total." },
    "Mission College Prep": { completeness:0.982, pitchCompleteness:1.000, severity:"minor" },
    "Santa Ynez":  { completeness:1.003, pitchCompleteness:1.000, severity:"minor",
      note:"Itemised rows sum 2 PA ABOVE the printed total. MaxPreps is "+
           "internally inconsistent here; not a transcription error." },
    "Nipomo":      { completeness:1.000, pitchCompleteness:1.013, severity:"minor",
      note:"Pitching itemises 2.0 IP ABOVE the printed total, the mirror of "+
           "the Santa Ynez batting case." },
    _classYearMissing: ["Mission College Prep","Morro Bay","Nipomo","Lompoc"],
    _source: "MaxPreps printable team_stats pages, pulled 2026-09-02"
  },

  batters: [
  // ARROYO GRANDE
  hb("Arroyo Grande","J. Kreowski","Jr",0,18,.083,28,24,4,2,2,1,0,0,2,12,1,0,.185,.125,.310),
  hb("Arroyo Grande","L. Whitney","Sr",2,27,.295,93,78,13,23,20,4,0,2,12,17,3,0,.409,.423,.832),
  hb("Arroyo Grande","E. Weller","Sr",3,25,.161,37,31,5,5,1,0,0,0,2,10,2,0,.257,.161,.418),
  hb("Arroyo Grande","B. Sweeney","Sr",6,30,.342,93,73,14,25,10,3,1,1,16,17,1,1,.462,.452,.914),
  hb("Arroyo Grande","J. Ralph","So",7,30,.250,114,96,27,24,11,1,0,0,14,15,4,0,.368,.260,.628),
  hb("Arroyo Grande","G. Pope","Jr",8,12,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Arroyo Grande","R. Payne","Sr",9,11,.118,20,17,1,2,4,0,0,0,2,6,0,1,.200,.118,.318),
  hb("Arroyo Grande","L. Plaza","Sr",10,30,.293,102,92,14,27,13,6,0,0,6,9,3,1,.353,.359,.712),
  hb("Arroyo Grande","C. Prazanowski","Sr",11,19,.000,1,1,2,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Arroyo Grande","M. Johnson","Jr",13,4,.000,3,2,1,0,0,0,0,0,1,0,0,0,.333,.000,.333),
  hb("Arroyo Grande","M. Richwine","Jr",14,19,.105,26,19,4,2,2,0,0,0,7,9,0,0,.346,.105,.451),
  hb("Arroyo Grande","R. Servin","So",16,14,.372,49,43,7,16,15,2,1,1,3,1,0,2,.396,.535,.931),
  hb("Arroyo Grande","L. Durham","Sr",18,11,null,1,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Arroyo Grande","M. Corner","Sr",19,22,.114,43,35,3,4,1,1,0,0,7,14,0,0,.262,.143,.405),
  hb("Arroyo Grande","I. Childress","Jr",20,12,.125,19,16,3,2,1,1,0,0,1,12,1,1,.211,.188,.398),
  hb("Arroyo Grande","J. Hill","Sr",22,30,.396,117,106,24,42,26,15,1,5,5,8,5,1,.444,.698,1.142),
  hb("Arroyo Grande","T. Bournonville","Jr",24,29,.280,103,93,11,26,11,3,1,2,7,18,0,2,.324,.398,.722),
  hb("Arroyo Grande","T. Kurth","Jr",28,29,.310,105,87,18,27,19,9,0,1,10,17,5,2,.404,.448,.852),
  hb("Arroyo Grande","R. Bronson","Jr",35,9,.143,17,14,1,2,0,0,0,0,1,4,2,0,.294,.143,.437),
  hb("Arroyo Grande","C. Christiansen","Sr",55,12,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),

  // ATASCADERO
  hb("Atascadero","S. Ernst","Jr",1,15,.176,19,17,5,3,0,0,0,0,2,6,0,0,.263,.176,.439),
  hb("Atascadero","E. Wanner","Jr",2,25,.157,65,51,10,8,7,0,0,0,7,15,1,0,.271,.157,.428),
  hb("Atascadero","T. De Brum","Sr",3,10,.083,13,12,2,1,1,0,0,0,0,8,1,0,.154,.083,.237),
  hb("Atascadero","U. Kaul","Sr",4,27,.429,101,98,18,42,27,10,3,0,0,10,2,1,.436,.592,1.028),
  hb("Atascadero","A. Madrigal","Jr",5,10,.000,2,2,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Atascadero","Z. Savino","Sr",7,27,.305,95,82,13,25,21,8,1,4,8,24,3,2,.379,.573,.952),
  hb("Atascadero","M. Zepeda","Jr",8,8,.222,12,9,3,2,0,0,0,0,3,3,0,0,.417,.222,.639),
  hb("Atascadero","G. Bowman","Sr",9,25,.128,54,47,8,6,3,2,0,0,4,19,1,0,.212,.170,.382),
  hb("Atascadero","T. Kerr","Sr",10,23,.255,62,55,13,14,6,1,1,0,3,9,3,0,.328,.309,.637),
  hb("Atascadero","E. Churchill","Sr",11,28,.286,90,77,14,22,10,7,1,1,5,18,5,1,.364,.442,.806),
  hb("Atascadero","W. Litten","Jr",13,26,.212,71,52,13,11,6,1,0,0,8,15,11,0,.423,.231,.654),
  hb("Atascadero","R. Gearhart","Sr",21,28,.283,102,92,17,26,18,5,0,4,4,22,6,0,.353,.467,.820),
  hb("Atascadero","W. Azelton","Fr",22,7,.000,3,3,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Atascadero","W. Witt","Jr",27,27,.254,84,71,12,18,9,1,2,2,10,16,1,0,.354,.408,.762),
  hb("Atascadero","V. Rivera","Jr",34,1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Atascadero","D. Mitchell","Jr",44,28,.337,102,95,15,32,17,6,0,1,5,12,1,0,.376,.432,.808),

  // CABRILLO
  hb("Cabrillo","B. Gregory","Sr",2,24,.338,97,74,24,25,11,4,2,1,16,2,6,1,.485,.486,.971),
  hb("Cabrillo","C. Powell","So",3,20,.226,65,53,7,12,3,0,0,0,7,7,4,0,.317,.226,.543),
  hb("Cabrillo","G. Barraza","Jr",4,24,.243,93,70,20,17,16,4,0,1,17,11,4,1,.413,.343,.756),
  hb("Cabrillo","P. Kingsley","Sr",5,4,.000,3,3,1,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Cabrillo","G. Rodriguez","Sr",6,24,.302,79,63,13,19,10,2,0,0,13,17,0,3,.405,.333,.738),
  hb("Cabrillo","F. Lopez","Jr",7,23,.148,67,54,9,8,3,0,0,0,8,24,1,2,.262,.148,.410),
  hb("Cabrillo","F. Hernandez","So",8,20,.281,73,57,11,16,18,1,0,0,10,13,3,1,.408,.298,.706),
  hb("Cabrillo","T. Kiesling","Sr",10,24,.390,89,77,12,30,13,6,2,1,9,22,1,2,.449,.558,1.007),
  hb("Cabrillo","L. Vorce","So",11,23,.318,76,66,12,21,4,1,0,0,10,7,5,0,.408,.333,.741),
  hb("Cabrillo","I. Lopez","Fr",13,7,.273,12,11,1,3,2,1,0,0,1,7,0,0,.333,.364,.697),
  hb("Cabrillo","C. Sunndeniyage","So",14,14,.143,9,7,4,1,0,0,0,0,1,1,0,0,.250,.143,.393),
  hb("Cabrillo","J. Low","Jr",15,14,.222,10,9,0,2,2,0,0,0,1,1,0,0,.222,.222,.444),
  hb("Cabrillo","T. Clark","Jr",19,2,null,0,0,0,1,0,0,0,0,0,0,0,0,null,null,null),
  hb("Cabrillo","A. Torres-22","Sr",22,4,.000,6,5,1,0,0,0,0,0,1,3,0,0,.167,.000,.167),
  hb("Cabrillo","M. Koff","Jr",23,24,.262,78,61,13,16,4,3,0,0,9,20,3,5,.384,.311,.695),
  hb("Cabrillo","A. Torres-24","Jr",24,1,null,1,0,0,0,0,0,0,0,1,0,0,0,1.000,null,1.000),

  // MISSION COLLEGE PREP  (no class years on the source page)
  hb("Mission College Prep","B. Augustine","",null,2,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Mission College Prep","T. Bernal","",null,21,.407,65,54,16,22,27,3,0,6,11,12,0,0,.508,.796,1.304),
  hb("Mission College Prep","B. Burt","",null,3,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Mission College Prep","J. Cortez","",null,15,.091,15,11,6,1,2,0,0,1,4,3,0,0,.333,.364,.697),
  hb("Mission College Prep","K. Crampton","",null,1,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Mission College Prep","T. Glenn","",2,23,.333,86,75,18,25,14,7,2,2,9,10,2,0,.419,.560,.979),
  hb("Mission College Prep","J. Villa","",4,23,.203,79,64,14,13,6,2,0,0,14,11,1,0,.354,.234,.588),
  hb("Mission College Prep","B. Orfila","",7,17,.400,18,15,6,6,5,2,0,1,3,6,0,0,.500,.733,1.233),
  hb("Mission College Prep","B. May","",7,3,.250,6,4,2,1,1,0,0,0,2,3,0,0,.500,.250,.750),
  hb("Mission College Prep","J. Miles","",8,21,.265,56,49,9,13,11,1,0,1,3,5,0,3,.291,.347,.638),
  hb("Mission College Prep","H. Drake","",9,21,.417,69,60,15,25,7,3,0,1,6,5,3,0,.493,.517,1.010),
  hb("Mission College Prep","B. Mott","",10,16,.429,49,42,9,18,4,5,0,2,6,3,1,0,.510,.690,1.200),
  hb("Mission College Prep","J. Hanchett","",15,22,.227,58,44,7,10,10,3,0,2,12,17,1,1,.397,.432,.829),
  hb("Mission College Prep","K. Hickman","",21,19,.426,56,47,19,20,16,5,0,5,7,9,1,1,.500,.851,1.351),
  hb("Mission College Prep","S. Broyles","",22,21,.250,52,40,5,10,6,0,0,2,5,7,6,1,.404,.400,.804),
  hb("Mission College Prep","A. Clayton","",28,16,.125,11,8,2,1,1,0,0,0,1,5,1,1,.273,.125,.398),
  hb("Mission College Prep","S. Connors","",32,19,.256,48,39,9,10,11,2,0,1,6,13,2,1,.375,.385,.760),
  hb("Mission College Prep","S. Rivas","",35,14,.341,48,41,10,14,10,4,0,2,5,4,1,1,.417,.585,1.002),

  // MORRO BAY  (no class years; roster listing incomplete, see quality)
  hb("Morro Bay","Q. Crotts","",1,32,.411,129,107,41,44,22,14,5,2,13,17,8,1,.504,.692,1.196),
  hb("Morro Bay","J. Deovlet","",2,31,.295,117,95,20,28,28,4,0,0,13,12,5,3,.397,.337,.734),
  hb("Morro Bay","C. White-3","",3,4,.267,18,15,5,4,3,3,0,0,3,0,0,0,.389,.467,.856),
  hb("Morro Bay","O. Grafton","",4,4,.333,4,3,1,1,2,0,0,0,1,1,0,0,.500,.333,.833),
  hb("Morro Bay","H. Davenport","",5,6,.250,5,4,2,1,1,0,0,0,0,2,1,0,.400,.250,.650),
  hb("Morro Bay","C. White-6","",6,1,.667,5,3,3,2,1,2,0,0,2,0,0,0,.800,1.333,2.133),
  hb("Morro Bay","F. Ainley-7","",7,4,.154,16,13,5,2,1,0,0,0,2,3,1,0,.312,.154,.466),
  hb("Morro Bay","J. Devolet","",9,2,.375,8,8,3,3,1,1,0,0,0,0,0,0,.375,.500,.875),
  hb("Morro Bay","C. Wilkenson","",9,2,.600,6,5,3,3,2,0,0,0,1,0,0,0,.667,.600,1.267),
  hb("Morro Bay","C. Wilkinson","",10,27,.330,104,91,24,30,18,9,3,0,13,15,0,0,.413,.495,.908),
  hb("Morro Bay","E. Best","",12,1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Morro Bay","F. Ainley-13","",13,25,.324,80,71,16,23,10,1,0,0,6,11,1,0,.385,.338,.723),
  hb("Morro Bay","M. Miner","",19,1,1.000,1,1,1,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("Morro Bay","B. Erkenbra","",22,21,.267,66,60,10,16,7,3,2,0,5,16,1,0,.333,.383,.716),
  hb("Morro Bay","B. Walker","",25,2,.500,2,2,1,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  hb("Morro Bay","T. Gray","",26,12,.412,41,34,11,14,13,4,1,0,4,1,3,0,.512,.588,1.100),
  hb("Morro Bay","E. Davis-28","",28,2,.143,8,7,4,1,3,0,0,0,1,2,0,0,.250,.143,.393),
  hb("Morro Bay","E. Davis-33","",33,10,.375,29,24,8,9,12,4,1,0,5,4,0,0,.483,.625,1.108),
  hb("Morro Bay","C. Gailey","",35,1,null,1,0,0,0,0,0,0,0,1,0,0,0,1.000,1.000,null),
  hb("Morro Bay","V. Nelson","",41,19,.269,33,26,10,7,9,2,0,0,4,6,1,1,.375,.346,.721),
  hb("Morro Bay","H. Stow","",47,2,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Morro Bay","E. Brown","",50,22,.333,4,3,2,1,1,0,0,0,1,0,0,0,.500,.333,.833),
  hb("Morro Bay","J. Skaggs","",51,29,.250,85,80,17,20,17,3,0,0,3,9,2,0,.294,.288,.582),
  hb("Morro Bay","J. Orozco","",55,1,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),

  // NIPOMO  (no class years on the source page)
  hb("Nipomo","J. Lanier","",null,13,.333,4,3,2,1,0,0,0,0,1,0,0,0,.500,.333,.833),
  hb("Nipomo","N. Potter","",null,12,.375,8,8,1,3,1,0,0,0,0,2,0,0,.375,.375,.750),
  hb("Nipomo","D. Hill","",1,18,.000,5,5,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Nipomo","A. Mendoza","",2,16,.273,18,11,4,3,1,0,0,0,4,4,2,0,.529,.273,.802),
  hb("Nipomo","E. Silveira-3","",3,21,.206,42,34,7,7,4,3,0,0,7,7,1,0,.357,.294,.651),
  hb("Nipomo","A. Willis","",5,24,.317,96,82,20,26,21,5,1,0,10,11,2,1,.400,.402,.802),
  hb("Nipomo","B. Hageman","",7,22,.323,70,62,13,20,6,0,0,0,7,17,0,1,.386,.323,.709),
  hb("Nipomo","G. Groshart","",8,21,.304,77,69,11,21,15,4,0,1,6,9,0,2,.351,.406,.757),
  hb("Nipomo","O. Ortega","",9,24,.267,77,60,18,16,4,0,0,0,11,9,5,0,.421,.267,.688),
  hb("Nipomo","C. Moulden","",10,22,.377,79,69,14,26,12,5,0,2,2,9,8,0,.456,.536,.992),
  hb("Nipomo","L. Hobbs","",11,20,.444,78,63,23,28,14,3,0,0,8,2,6,1,.538,.492,1.030),
  hb("Nipomo","B. Kent","",13,10,.000,3,3,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Nipomo","R. Barr","",17,24,.284,77,67,9,19,9,6,0,0,10,19,0,0,.377,.373,.750),
  hb("Nipomo","T. Barr","",18,20,.321,63,56,10,18,12,3,4,0,5,16,2,0,.397,.518,.915),
  hb("Nipomo","E. Silveira-19","",19,24,.276,86,76,15,21,18,4,1,3,9,14,1,0,.360,.474,.834),

  // PASO ROBLES
  hb("Paso Robles","J. Kozar","Sr",1,5,.167,6,6,1,1,0,0,0,0,0,3,0,0,.167,.167,.334),
  hb("Paso Robles","J. Soboleski","So",2,26,.280,84,75,15,21,5,7,0,0,6,17,1,1,.337,.373,.710),
  hb("Paso Robles","T. Freitas","Jr",3,26,.289,89,83,13,24,15,7,1,0,4,4,1,0,.330,.398,.728),
  hb("Paso Robles","S. Roby","Jr",4,7,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  hb("Paso Robles","C. Glover","Jr",5,22,.195,48,41,6,8,6,1,0,0,2,9,4,1,.292,.220,.512),
  hb("Paso Robles","C. Mercado","Sr",7,6,.250,5,4,2,1,3,0,0,0,1,0,0,0,.400,.250,.650),
  hb("Paso Robles","C. Contreras","So",8,25,.242,44,33,6,8,5,2,0,0,6,13,1,2,.357,.303,.660),
  hb("Paso Robles","K. Rickson","Sr",9,4,.500,6,4,2,2,2,0,0,0,1,1,0,0,.600,.500,1.100),
  hb("Paso Robles","E. Rendon","Fr",10,20,.231,44,39,2,9,4,2,0,0,2,6,3,0,.318,.282,.600),
  hb("Paso Robles","E. Dobroth","So",11,20,.323,73,65,15,21,15,4,0,3,5,11,3,0,.397,.523,.920),
  hb("Paso Robles","M. Garcia","Jr",13,27,.415,111,94,27,39,22,7,1,0,14,9,2,1,.495,.511,1.006),
  hb("Paso Robles","B. Hoier","Sr",14,22,.298,63,47,14,14,8,5,1,0,11,4,2,1,.443,.447,.890),
  hb("Paso Robles","X. Hermanson","So",19,26,.338,100,77,15,26,18,2,2,0,15,6,1,2,.442,.416,.858),
  hb("Paso Robles","L. Cook","Sr",21,9,.375,20,16,6,6,4,0,0,0,3,3,1,0,.500,.375,.875),
  hb("Paso Robles","C. Kozar","Sr",22,4,.444,12,9,4,4,4,0,0,0,1,1,2,0,.583,.444,1.027),
  hb("Paso Robles","C. Walker","Jr",23,14,.429,12,7,3,3,0,0,0,0,4,1,1,0,.667,.429,1.096),
  hb("Paso Robles","B. Lowry","So",27,27,.261,88,69,18,18,9,4,1,3,18,20,0,0,.414,.478,.892),
  hb("Paso Robles","N. Contreras","So",42,25,.300,87,80,11,24,11,3,0,0,5,20,1,0,.349,.338,.686),

  // PIONEER VALLEY
  hb("Pioneer Valley","A. Angulo","Sr",1,15,.200,6,5,1,1,1,0,0,0,0,1,1,0,.333,.200,.533),
  hb("Pioneer Valley","L. Ramirez","Sr",2,9,.125,21,16,1,2,2,0,0,0,3,6,1,0,.300,.125,.425),
  hb("Pioneer Valley","T. Zepeda","Sr",3,26,.266,102,79,18,21,10,5,0,0,14,17,5,4,.408,.329,.737),
  hb("Pioneer Valley","R. Ramirez","Sr",4,25,.295,64,44,9,13,6,0,0,0,14,14,3,3,.492,.295,.787),
  hb("Pioneer Valley","J. Lopez","Jr",5,22,.185,61,54,9,10,3,0,0,0,3,19,2,2,.254,.185,.439),
  hb("Pioneer Valley","D. Cortez","Fr",6,27,.294,105,85,16,25,16,8,0,0,10,16,7,1,.408,.388,.796),
  hb("Pioneer Valley","E. Ponce","Jr",7,17,.206,42,34,6,7,5,0,0,0,7,8,0,1,.341,.206,.547),
  hb("Pioneer Valley","C. Valdez","Sr",8,9,.000,14,8,5,0,1,0,0,0,5,3,1,0,.429,.000,.429),
  hb("Pioneer Valley","I. Enriquez","So",9,21,.346,78,52,11,18,8,1,0,0,17,11,7,1,.545,.365,.910),
  hb("Pioneer Valley","A. Placencia","Sr",10,13,.000,31,21,2,0,2,0,0,0,8,12,1,0,.300,.000,.300),
  hb("Pioneer Valley","B. Alcantar","Sr",12,8,.048,23,21,4,1,4,0,0,0,1,10,1,0,.130,.048,.178),
  hb("Pioneer Valley","J. Castillo","Sr",13,23,.186,70,59,6,11,3,1,0,0,8,13,2,1,.304,.203,.507),
  hb("Pioneer Valley","K. Owen","Jr",15,20,.245,62,53,5,13,8,1,0,1,4,12,2,1,.317,.321,.638),
  hb("Pioneer Valley","M. Rosas","Jr",16,22,.183,70,60,7,11,7,2,1,0,5,14,1,1,.254,.250,.504),
  hb("Pioneer Valley","I. Garcia","So",17,6,.500,7,6,2,3,0,0,0,0,1,2,0,0,.571,.500,1.071),
  hb("Pioneer Valley","M. Ramirez","Sr",18,19,.185,32,27,0,5,2,0,0,0,4,12,1,1,.290,.185,.475),
  hb("Pioneer Valley","K. Milner","So",20,23,.227,75,66,4,15,8,2,0,0,8,10,1,0,.320,.258,.578),

  // RIGHETTI
  hb("Righetti","T. DeVan","Sr",1,27,.365,101,85,15,31,14,6,0,1,11,15,3,2,.446,.471,.917),
  hb("Righetti","M. Villegas","Fr",2,3,.500,2,2,1,1,0,0,0,0,0,1,0,0,.500,.500,1.000),
  hb("Righetti","J. McMillan","Sr",3,28,.411,109,95,27,39,19,4,2,3,10,6,2,1,.472,.589,1.061),
  hb("Righetti","K. Walker","So",5,26,.203,73,64,8,13,8,1,0,0,8,11,0,1,.288,.219,.507),
  hb("Righetti","M. Anderson","Jr",7,28,.353,106,85,19,30,12,3,0,0,14,13,6,0,.476,.388,.864),
  hb("Righetti","J. McDonald","Jr",8,2,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Righetti","M. Andersen","So",11,3,.000,3,3,0,0,0,0,0,0,0,3,0,0,.000,.000,.000),
  hb("Righetti","M. Munar","Sr",12,7,.083,14,12,1,1,1,1,0,0,2,10,0,0,.214,.167,.381),
  hb("Righetti","D. Nevarez","Jr",17,26,.245,60,53,3,13,3,2,0,0,5,19,2,0,.333,.283,.616),
  hb("Righetti","N. Farris","Sr",21,24,.352,69,54,11,19,9,2,1,0,13,12,1,1,.478,.426,.904),
  hb("Righetti","A. Randolph","Sr",22,25,.125,22,16,1,2,1,0,0,0,5,10,0,0,.333,.125,.458),
  hb("Righetti","J. Castaneda","Sr",23,5,1.000,1,1,1,1,1,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("Righetti","H. Roman","Sr",24,18,.300,11,10,4,3,2,0,0,0,1,3,0,0,.364,.300,.664),
  hb("Righetti","B. Thayer","Sr",25,28,.300,112,100,18,30,12,3,1,1,7,26,2,0,.358,.380,.738),
  hb("Righetti","N. Lancor","Jr",26,7,.000,1,1,1,0,1,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Righetti","R. Bassett","Sr",27,28,.333,96,84,16,28,24,8,0,4,9,30,2,1,.406,.571,.977),
  hb("Righetti","N. Kesner","Jr",42,20,.333,55,45,10,15,3,2,0,0,9,11,1,0,.455,.378,.833),
  hb("Righetti","G. Cole","Fr",99,28,.292,75,65,9,19,12,5,1,0,7,12,1,0,.370,.400,.770),

  // SAN LUIS OBISPO
  hb("San Luis Obispo","P. Wyatt","So",2,27,.361,94,83,13,30,16,3,0,0,5,3,3,2,.409,.398,.807),
  hb("San Luis Obispo","G. Bramble","Jr",3,24,.173,67,52,8,9,3,1,0,0,10,15,2,1,.323,.192,.515),
  hb("San Luis Obispo","E. Lazanoff","Sr",4,12,.133,16,15,2,2,2,0,0,0,1,5,0,0,.188,.133,.321),
  hb("San Luis Obispo","G. Vigil","Sr",5,26,.227,96,75,16,17,7,4,0,1,13,13,7,0,.389,.320,.709),
  hb("San Luis Obispo","F. Hickey","Sr",6,25,.224,66,58,13,13,9,1,0,0,7,8,0,0,.308,.241,.549),
  hb("San Luis Obispo","L. Drenckpohl","Jr",7,19,.226,60,53,10,12,2,2,0,0,6,10,1,0,.317,.264,.581),
  hb("San Luis Obispo","T. Jepsen","Sr",8,16,.136,27,22,1,3,3,0,0,0,5,5,0,0,.296,.136,.432),
  hb("San Luis Obispo","H. Hall","Sr",9,26,.297,85,74,13,22,9,7,1,0,7,8,3,1,.376,.419,.795),
  hb("San Luis Obispo","J. Isaman","Jr",10,23,.246,69,57,7,14,7,3,0,0,9,4,2,1,.362,.298,.660),
  hb("San Luis Obispo","A. de la Motte","Jr",11,9,.083,17,12,4,1,0,0,0,0,4,3,1,0,.353,.083,.436),
  hb("San Luis Obispo","K. Toole","Sr",12,14,.143,17,14,2,2,2,1,0,0,0,6,2,0,.250,.214,.464),
  hb("San Luis Obispo","J. Riley","So",13,12,.200,12,10,0,2,0,0,0,0,2,5,0,0,.333,.200,.533),
  hb("San Luis Obispo","J. Taylor","Jr",21,12,.323,35,31,6,10,7,3,0,1,3,7,1,0,.400,.516,.916),
  hb("San Luis Obispo","B. Schafer","So",22,10,.185,29,27,4,5,4,0,0,0,1,6,0,0,.214,.185,.399),
  hb("San Luis Obispo","N. Soderin","Jr",23,12,.200,16,10,5,2,1,1,0,0,5,5,0,0,.467,.300,.767),
  hb("San Luis Obispo","J. Goodwin","Jr",24,19,.205,54,44,8,9,7,0,0,0,7,11,3,0,.352,.205,.557),
  hb("San Luis Obispo","E. Baird","Sr",27,12,.150,25,20,1,3,2,1,0,0,4,13,1,0,.320,.200,.520),
  hb("San Luis Obispo","F. Avrett","So",28,2,.000,2,2,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("San Luis Obispo","T. Blaney","Fr",33,11,.095,24,21,1,2,5,0,0,0,3,8,0,0,.208,.095,.303),
  hb("San Luis Obispo","J. Wilson","Fr",66,2,null,2,0,1,0,0,0,0,0,1,0,1,0,1.000,null,1.000),

  // SANTA MARIA
  hb("Santa Maria","D. Guerra","Sr",6,2,.000,2,2,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Santa Maria","J. Silva","Sr",8,19,.176,47,34,11,6,2,1,0,0,8,12,5,0,.404,.206,.610),
  hb("Santa Maria","J. Lupercio","Sr",11,8,.111,12,9,2,1,5,1,0,0,2,6,1,0,.333,.222,.555),
  hb("Santa Maria","J. Medina-13","Jr",13,18,.525,70,59,19,31,18,5,2,0,7,7,2,2,.571,.678,1.249),
  hb("Santa Maria","J. Medina-14","Jr",14,21,.426,79,68,13,29,25,3,5,0,7,12,1,3,.468,.618,1.086),
  hb("Santa Maria","J. Ibarra","Sr",16,9,.333,4,3,2,1,2,0,0,0,1,0,0,0,.500,.333,.833),
  hb("Santa Maria","J. Estrada","Sr",21,14,.200,48,40,11,8,2,0,0,0,3,9,5,0,.333,.200,.533),
  hb("Santa Maria","D. Martin","Jr",22,21,.377,85,61,30,23,22,5,2,0,19,12,4,1,.541,.525,1.066),
  hb("Santa Maria","M. Peinado","Sr",26,21,.380,84,71,21,27,13,3,0,0,12,6,0,1,.464,.423,.887),
  hb("Santa Maria","J. Gaitan","Fr",27,9,.318,23,22,5,7,4,0,1,0,1,6,0,0,.348,.409,.757),
  hb("Santa Maria","M. Martinez","Sr",30,3,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Santa Maria","A. Ybarra","Jr",31,21,.328,76,64,10,21,11,3,0,0,8,8,2,2,.408,.375,.783),
  hb("Santa Maria","A. Rice","Fr",35,21,.298,73,57,10,17,9,0,0,0,10,6,5,1,.438,.298,.736),
  hb("Santa Maria","O. Sedano","Fr",40,1,.500,2,2,0,1,0,0,0,0,0,0,0,0,.500,.500,1.000),
  hb("Santa Maria","B. Alejo","So",42,8,.407,27,27,3,11,7,4,0,0,0,6,0,0,.407,.556,.963),
  hb("Santa Maria","D. Villalovos","Jr",46,1,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Santa Maria","F. Chavez","Jr",47,19,.220,61,50,11,11,6,0,0,0,6,13,5,0,.361,.220,.581),

  // SANTA YNEZ
  hb("Santa Ynez","J. Duarte","So",1,20,.256,61,43,10,11,11,3,0,1,13,12,5,0,.475,.395,.870),
  hb("Santa Ynez","D. Aquistapace","Jr",2,21,.193,73,57,14,11,6,3,0,1,9,8,5,1,.347,.298,.645),
  hb("Santa Ynez","B. Flores","Sr",3,22,.288,83,66,18,19,15,4,2,0,11,16,3,3,.398,.409,.807),
  hb("Santa Ynez","T. Stevens","Sr",4,20,.185,35,27,7,5,3,1,0,0,5,10,2,0,.353,.222,.575),
  hb("Santa Ynez","R. Cassidy","Sr",6,14,.250,27,20,4,5,5,0,0,0,4,7,2,0,.423,.250,.673),
  hb("Santa Ynez","D. Ross","Sr",7,17,.250,39,36,6,9,3,1,0,0,3,8,0,0,.308,.278,.586),
  hb("Santa Ynez","N. Palacios","Sr",8,19,.184,47,38,9,7,6,0,0,0,8,11,0,0,.326,.184,.510),
  hb("Santa Ynez","K. Kays","Sr",9,16,.241,30,29,3,7,1,2,0,0,1,11,0,0,.267,.310,.577),
  hb("Santa Ynez","H. Blunt","Sr",10,12,.273,27,22,7,6,8,1,0,1,3,14,1,1,.370,.455,.825),
  hb("Santa Ynez","T. Minus","Sr",11,22,.258,72,62,11,16,11,1,0,1,7,18,3,0,.361,.323,.684),
  hb("Santa Ynez","J. Glover","So",14,22,.382,75,68,14,26,27,11,0,3,3,7,3,1,.427,.676,1.103),
  hb("Santa Ynez","P. Forsyth","Sr",16,19,.217,26,23,6,5,7,0,0,0,3,5,0,0,.308,.217,.525),
  hb("Santa Ynez","D. Pulido","Jr",21,10,.333,32,24,6,8,3,0,0,0,5,3,3,0,.500,.333,.833),
  hb("Santa Ynez","E. Roberts","Fr",25,21,.279,74,61,22,17,9,2,0,0,8,15,1,0,.371,.311,.682),

  // ST. JOSEPH
  hb("St. Joseph","N. Peinado","Sr",2,31,.263,116,99,20,26,11,5,2,0,15,19,2,0,.371,.354,.725),
  hb("St. Joseph","E. Furness","Sr",3,31,.323,113,99,29,32,30,7,0,10,8,18,4,2,.389,.697,1.086),
  hb("St. Joseph","J. Rodriguez","Sr",4,31,.265,102,83,13,22,16,4,1,2,15,12,1,2,.376,.410,.786),
  hb("St. Joseph","T. Ontiveros","Sr",5,15,.000,12,12,2,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("St. Joseph","T. Dugger","Jr",6,18,.364,38,33,10,12,5,2,0,0,2,12,2,0,.432,.424,.856),
  hb("St. Joseph","R. Roemling","Jr",7,27,.295,70,61,14,18,10,1,0,0,3,17,1,1,.333,.311,.644),
  hb("St. Joseph","S. Covarrubias","Jr",8,31,.284,98,81,14,23,9,2,0,1,12,9,3,0,.396,.346,.742),
  hb("St. Joseph","A. Bluem","So",10,30,.333,115,102,22,34,17,9,1,3,10,8,1,2,.391,.529,.920),
  hb("St. Joseph","C. Chanley","Jr",11,31,.337,112,92,21,31,20,4,0,3,9,12,8,3,.429,.478,.907),
  hb("St. Joseph","M. O'Keefe","So",15,11,1.000,1,1,0,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("St. Joseph","R. Aparicio","Jr",18,8,null,1,0,0,0,0,0,0,0,1,0,0,0,1.000,1.000,null),
  hb("St. Joseph","M. Majewski","So",19,17,.273,14,11,1,3,4,1,0,0,0,4,1,0,.333,.364,.697),
  hb("St. Joseph","E. Resendez","Fr",20,6,.222,10,9,1,2,0,0,0,0,1,4,0,0,.300,.222,.522),
  hb("St. Joseph","E. Klostermann","Sr",21,13,.238,21,21,1,5,0,0,0,0,0,2,0,0,.238,.238,.476),
  hb("St. Joseph","M. Kon","Jr",22,25,.150,22,20,3,3,2,0,0,0,0,7,0,1,.143,.150,.293),
  hb("St. Joseph","C. Goncalves","So",23,1,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("St. Joseph","D. Hernandez","Sr",24,30,.234,96,77,14,18,12,3,0,2,12,8,5,2,.365,.351,.716),
  hb("St. Joseph","B. Mosley","Sr",30,6,.000,5,4,0,0,0,0,0,0,1,0,0,0,.200,.000,.200),

  // TEMPLETON
  hb("Templeton","L. Olsen","Jr",1,28,.272,96,81,20,22,18,5,3,0,11,13,2,0,.372,.407,.779),
  hb("Templeton","C. Sims","So",2,26,.281,105,89,25,25,25,0,0,0,4,10,7,2,.353,.281,.634),
  hb("Templeton","W. Hagen","Sr",3,11,.316,22,19,4,6,4,1,0,0,3,5,0,0,.409,.368,.777),
  hb("Templeton","A. Abatti","So",4,18,.091,14,11,2,1,0,0,0,0,3,6,0,0,.286,.091,.377),
  hb("Templeton","L. Rivera","So",5,23,.340,58,50,11,17,4,0,0,0,5,9,0,1,.393,.340,.733),
  hb("Templeton","C. Dahlen","Sr",6,28,.282,112,85,18,24,14,5,0,0,20,16,6,1,.446,.341,.787),
  hb("Templeton","L. Stetz","Jr",8,28,.344,114,93,25,32,12,3,3,0,11,6,8,1,.451,.441,.892),
  hb("Templeton","C. Kline","Sr",9,28,.272,99,81,16,22,10,1,2,1,11,13,3,1,.375,.370,.745),
  hb("Templeton","I. Regalado","Sr",11,21,.209,52,43,6,9,4,0,0,0,7,12,1,1,.327,.209,.536),
  hb("Templeton","A. Raab","Sr",14,28,.424,113,85,33,36,25,10,4,2,22,15,6,0,.566,.706,1.272),
  hb("Templeton","N. Argain","Jr",17,18,.000,4,3,4,0,1,0,0,0,1,0,0,0,.250,.000,.250),
  hb("Templeton","W. Patch","Jr",21,3,.333,4,3,2,1,0,0,0,0,1,1,0,0,.500,.333,.833),
  hb("Templeton","R. Dennish","Sr",22,25,.304,55,46,9,14,8,2,0,0,4,13,4,0,.407,.348,.755),
  hb("Templeton","H. Camarena","So",24,6,.154,14,13,1,2,1,0,0,0,1,2,0,0,.214,.154,.368),
  hb("Templeton","B. Swan","Sr",28,28,.250,104,80,13,20,23,4,2,0,19,19,3,0,.412,.350,.762),

  // LOMPOC  (class year listed for only 4 of 15; none recoverable, no 2026 data)
  hb("Lompoc","A. Carlson","",null,5,.333,5,3,1,1,0,0,0,0,0,1,2,0,.600,.333,.933),
  hb("Lompoc","A. Vallarta","",3,27,.257,89,74,14,19,9,3,0,0,11,15,3,0,.375,.297,.672),
  hb("Lompoc","S. Bravo","Sr",5,25,.380,84,71,20,27,14,5,0,2,9,16,3,0,.470,.535,1.005),
  hb("Lompoc","R. Hendrickson","",6,25,.069,38,29,2,2,3,1,0,0,6,10,2,0,.270,.103,.373),
  hb("Lompoc","B. Bailey-7","",7,20,.130,28,23,2,3,0,0,0,0,4,10,1,0,.286,.130,.416),
  hb("Lompoc","S. Kubasiewicz","",9,27,.280,104,82,15,23,11,7,1,0,19,15,3,0,.433,.390,.823),
  hb("Lompoc","C. Baker","",10,27,.133,77,60,13,8,8,0,1,2,12,23,3,1,.303,.267,.570),
  hb("Lompoc","I. Lara","",11,19,.143,25,21,0,3,1,0,0,0,4,7,0,0,.280,.143,.423),
  hb("Lompoc","M. Jones","Fr",12,22,.147,42,34,8,5,6,0,0,0,5,11,1,1,.268,.147,.415),
  hb("Lompoc","R. Munoz","",13,26,.233,80,73,8,17,18,4,0,1,3,15,3,1,.288,.329,.617),
  hb("Lompoc","B. Bailey-15","",15,27,.298,98,84,19,25,6,5,0,0,11,25,2,0,.392,.357,.749),
  hb("Lompoc","J. Jones","",18,25,.170,64,47,7,8,6,3,1,0,11,24,6,0,.391,.277,.668),
  hb("Lompoc","K. Kubasiewicz","Jr",22,26,.257,91,74,13,19,17,4,0,0,14,12,2,0,.389,.311,.700),
  hb("Lompoc","R. Sanchez","Sr",23,10,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Lompoc","B. Barbosa","",35,2,.000,2,2,0,0,0,0,0,0,0,0,0,0,.000,.000,.000)
  ],

  pitchers: [
  // ARROYO GRANDE
  hp("Arroyo Grande","J. Kreowski","Jr",0,3.50,0,0,"22",26,17,11,21,21,10),
  hp("Arroyo Grande","L. Whitney","Sr",2,12.60,0,0,"1.2",5,3,3,2,1,1),
  hp("Arroyo Grande","B. Sweeney","Sr",6,13.30,0,0,"10",21,19,19,10,4,4),
  hp("Arroyo Grande","G. Pope","Jr",8,4.33,0,0,"21",19,16,13,7,23,12),
  hp("Arroyo Grande","C. Prazanowski","Sr",11,3.15,0,0,"13.1",14,12,6,14,11,8),
  hp("Arroyo Grande","R. Servin","So",16,0.00,0,0,"1",2,0,0,0,0,1),
  hp("Arroyo Grande","L. Durham","Sr",18,4.67,0,0,"30",29,27,20,21,30,10),
  hp("Arroyo Grande","T. Bournonville","Jr",24,2.15,0,0,"58.2",44,30,18,22,61,12),
  hp("Arroyo Grande","C. Coleman","Sr",32,14.54,0,0,"4.1",10,11,9,4,6,5),
  hp("Arroyo Grande","R. Bronson","Jr",35,7.00,0,0,"2",1,2,2,5,5,2),
  hp("Arroyo Grande","C. Christiansen","Sr",55,4.88,1,0,"33",46,26,23,16,40,11),

  // ATASCADERO
  hp("Atascadero","S. Ernst","Jr",1,5.60,0,1,"5",3,4,4,1,5,3),
  hp("Atascadero","U. Kaul","Sr",4,4.33,1,1,"21",22,18,13,21,18,11),
  hp("Atascadero","A. Madrigal","Jr",5,3.28,0,1,"10.2",6,7,5,10,4,8),
  hp("Atascadero","Z. Savino","Sr",7,2.33,1,1,"15",7,7,5,16,18,7),
  hp("Atascadero","T. Kerr","Sr",10,28.00,0,0,"1",2,4,4,3,0,1),
  hp("Atascadero","R. Gearhart","Sr",21,11.45,0,2,"7.1",11,16,12,17,11,6),
  hp("Atascadero","W. Azelton","Fr",22,3.40,2,0,"22.2",27,16,11,5,13,5),
  hp("Atascadero","W. Witt","Jr",27,3.72,2,6,"47",44,35,25,30,37,12),
  hp("Atascadero","M. Cullen","So",28,5.25,0,0,"1.1",3,1,1,1,1,1),
  hp("Atascadero","D. Mitchell","Jr",44,2.39,7,2,"55.2",55,25,19,14,23,11),

  // CABRILLO
  hp("Cabrillo","B. Gregory","Sr",2,2.68,1,2,"15.2",14,10,6,1,20,7),
  hp("Cabrillo","G. Barraza","Jr",4,2.00,2,0,"7",3,2,2,7,6,3),
  hp("Cabrillo","F. Lopez","Jr",7,5.14,1,3,"32.2",41,31,24,22,15,11),
  hp("Cabrillo","T. Kiesling","Sr",10,5.69,5,4,"55.1",67,50,45,23,37,13),
  hp("Cabrillo","L. Vorce","So",11,56.00,0,0,"1",4,9,8,4,1,1),
  hp("Cabrillo","J. Low","Jr",15,3.91,2,3,"34",42,25,19,10,20,10),
  hp("Cabrillo","M. Koff","Jr",23,4.94,0,0,"5.2",6,5,4,4,5,3),

  // MISSION COLLEGE PREP
  hp("Mission College Prep","T. Bernal","",null,3.76,4,2,"44.2",50,28,24,16,46,12),
  hp("Mission College Prep","B. Burt","",null,28.00,0,0,"1",3,4,4,2,1,1),
  hp("Mission College Prep","T. Glenn","",2,3.82,0,2,"11",13,8,6,6,12,5),
  hp("Mission College Prep","B. Orfila","",7,2.72,5,1,"28.1",25,18,11,16,17,10),
  hp("Mission College Prep","J. Miles","",8,1.05,1,0,"13.1",9,2,2,5,11,7),
  hp("Mission College Prep","H. Drake","",9,10.80,0,0,"11.2",19,19,18,11,10,7),
  hp("Mission College Prep","A. Clayton","",28,3.38,0,2,"37.1",50,20,18,19,29,12),

  // MORRO BAY
  hp("Morro Bay","Q. Crotts","",1,7.00,0,0,"1",1,1,1,0,0,1),
  hp("Morro Bay","J. Deovlet","",2,0.00,0,0,"2",4,3,0,0,0,2),
  hp("Morro Bay","C. White-3","",3,0.00,0,0,"3",1,1,0,3,3,2),
  hp("Morro Bay","C. White-6","",6,0.00,0,0,"1",0,0,0,0,2,1),
  hp("Morro Bay","F. Ainley-7","",7,0.00,0,0,"1",1,0,0,0,1,1),
  hp("Morro Bay","C. Wilkenson","",9,8.75,1,0,"4",5,5,5,5,3,2),
  hp("Morro Bay","C. Wilkinson","",10,1.17,0,1,"18",15,7,3,5,17,6),
  hp("Morro Bay","F. Ainley-13","",13,0.00,0,0,"1",2,3,0,0,1,1),
  hp("Morro Bay","E. Davis-28","",28,5.00,0,0,"7",6,6,5,3,2,2),
  hp("Morro Bay","E. Davis-33","",33,0.81,1,0,"8.2",4,2,1,6,4,4),
  hp("Morro Bay","V. Nelson","",41,4.20,0,0,"3.1",3,2,2,4,2,4),
  hp("Morro Bay","H. Stow","",47,3.00,1,0,"7",6,5,3,2,4,2),
  hp("Morro Bay","E. Brown","",50,2.22,7,2,"56.2",64,31,18,15,67,13),
  hp("Morro Bay","J. Skaggs","",51,8.40,0,0,"1.2",1,2,2,5,0,2),

  // NIPOMO
  hp("Nipomo","J. Lanier","",null,3.68,0,0,"13.1",18,9,7,11,7,12),
  hp("Nipomo","D. Hill","",1,4.63,0,0,"19.2",28,20,13,10,9,13),
  hp("Nipomo","A. Mendoza","",2,6.34,0,0,"32",38,30,29,23,10,14),
  hp("Nipomo","E. Silveira-3","",3,4.55,0,0,"20",25,23,13,24,28,9),
  hp("Nipomo","G. Groshart","",8,4.67,0,0,"15",11,15,10,22,20,6),
  hp("Nipomo","O. Ortega","",9,0.00,0,0,"0.2",1,0,0,0,1,1),
  hp("Nipomo","C. Moulden","",10,null,0,0,"0",2,2,2,0,0,1),
  hp("Nipomo","L. Hobbs","",11,5.75,0,0,"24.1",28,29,20,14,18,10),
  hp("Nipomo","B. Kent","",13,3.97,0,0,"12.1",13,10,7,9,8,10),
  hp("Nipomo","A. Cardenas","",15,7.00,0,0,"2",5,4,2,0,0,1),
  hp("Nipomo","R. Barr","",17,null,0,0,"0",0,0,0,0,0,1),
  hp("Nipomo","E. Silveira-19","",19,8.20,0,0,"13.2",16,19,16,18,19,7),

  // PASO ROBLES
  hp("Paso Robles","J. Kozar","Sr",1,28.00,0,0,"1",4,4,4,1,0,1),
  hp("Paso Robles","J. Soboleski","So",2,28.00,0,0,"1",2,4,4,4,0,2),
  hp("Paso Robles","T. Freitas","Jr",3,3.73,2,0,"15",11,10,8,8,22,5),
  hp("Paso Robles","S. Roby","Jr",4,4.50,1,0,"14",18,10,9,11,12,6),
  hp("Paso Robles","C. Mercado","Sr",7,3.42,1,0,"14.1",9,13,7,13,13,6),
  hp("Paso Robles","E. Rendon","Fr",10,2.55,0,1,"24.2",21,17,9,14,27,8),
  hp("Paso Robles","M. Garcia","Jr",13,7.35,0,0,"6.2",8,7,7,7,12,3),
  hp("Paso Robles","B. Hoier","Sr",14,4.45,0,0,"11",11,7,7,9,15,5),
  hp("Paso Robles","X. Hermanson","So",19,7.00,0,0,"1",1,1,1,2,1,1),
  hp("Paso Robles","C. Walker","Jr",23,2.03,2,0,"20.2",12,7,6,8,16,7),
  hp("Paso Robles","B. Lowry","So",27,2.62,1,0,"16",17,18,6,14,9,5),
  hp("Paso Robles","N. Contreras","So",42,1.56,4,0,"58.1",46,18,13,11,55,9),

  // PIONEER VALLEY
  hp("Pioneer Valley","A. Angulo","Sr",1,3.63,4,6,"54",74,44,28,19,34,12),
  hp("Pioneer Valley","R. Ramirez","Sr",4,2.50,1,1,"14",15,6,5,7,13,6),
  hp("Pioneer Valley","J. Lopez","Jr",5,17.50,0,0,"2",5,5,5,1,1,2),
  hp("Pioneer Valley","E. Ponce","Jr",7,3.00,0,0,"2.1",4,4,1,2,2,2),
  hp("Pioneer Valley","J. Castillo","Sr",13,1.25,1,2,"22.1",16,6,4,4,6,8),
  hp("Pioneer Valley","J. Valdez","So",14,6.00,0,0,"7",15,15,6,4,10,3),
  hp("Pioneer Valley","K. Owen","Jr",15,5.09,1,1,"11",12,11,8,6,13,5),
  hp("Pioneer Valley","I. Garcia","So",17,1.80,1,1,"11.2",21,17,3,2,6,4),
  hp("Pioneer Valley","M. Ramirez","Sr",18,2.84,3,4,"61.2",64,34,25,25,34,12),

  // RIGHETTI
  hp("Righetti","J. McMillan","Sr",3,1.58,4,3,"44.1",41,20,10,23,47,13),
  hp("Righetti","J. McDonald","Jr",8,3.50,0,0,"2",3,1,1,1,2,1),
  hp("Righetti","N. Farris","Sr",21,3.99,4,3,"40.1",42,36,23,23,35,14),
  hp("Righetti","J. Castaneda","Sr",23,2.10,0,0,"6.2",8,6,2,3,1,4),
  hp("Righetti","N. Lancor","Jr",26,0.81,1,0,"8.2",7,2,1,4,6,6),
  hp("Righetti","R. Bassett","Sr",27,3.00,5,4,"60.2",47,42,26,38,50,15),
  hp("Righetti","I. Rocha","Fr",28,1.56,2,0,"9",13,2,2,1,11,2),
  hp("Righetti","G. Cole","Fr",99,8.53,0,2,"10.2",17,16,13,9,6,5),

  // SAN LUIS OBISPO
  hp("San Luis Obispo","P. Wyatt","So",2,3.50,1,0,"2",5,2,1,1,1,1),
  hp("San Luis Obispo","G. Bramble","Jr",3,5.07,2,0,"9.2",12,9,7,5,10,5),
  hp("San Luis Obispo","F. Hickey","Sr",6,0.33,1,0,"21",17,1,1,4,8,13),
  hp("San Luis Obispo","T. Jepsen","Sr",8,4.64,1,4,"25.2",32,24,17,18,14,8),
  hp("San Luis Obispo","H. Hall","Sr",9,35.00,0,1,"1",3,5,5,3,0,1),
  hp("San Luis Obispo","J. Isaman","Jr",10,2.57,3,4,"49",53,33,18,19,39,11),
  hp("San Luis Obispo","K. Toole","Sr",12,3.25,3,3,"36.2",40,25,17,19,30,10),
  hp("San Luis Obispo","J. Riley","So",13,3.82,1,0,"14.2",17,17,8,3,8,9),
  hp("San Luis Obispo","J. Taylor","Jr",21,0.00,0,0,"1.2",2,2,0,1,1,1),
  hp("San Luis Obispo","E. Baird","Sr",27,10.04,0,0,"7.2",13,20,11,6,12,4),
  hp("San Luis Obispo","F. Avrett","So",28,0.00,0,0,"1",0,0,0,2,0,1),
  hp("San Luis Obispo","B. Longacre","Jr",34,0.00,0,0,"2",2,1,0,0,1,1),
  hp("San Luis Obispo","J. Wilson","Fr",66,5.25,0,1,"4",2,3,3,5,3,2),

  // SANTA MARIA
  hp("Santa Maria","J. Medina-13","Jr",13,2.12,1,0,"33",19,16,10,24,62,9),
  hp("Santa Maria","J. Medina-14","Jr",14,5.65,2,0,"26",39,23,21,19,38,10),
  hp("Santa Maria","J. Estrada","Sr",21,null,0,0,"0",0,0,0,0,0,1),
  hp("Santa Maria","D. Martin","Jr",22,1.61,1,0,"52.1",41,27,12,18,67,11),
  hp("Santa Maria","M. Peinado","Sr",26,1.75,0,0,"8",4,7,2,12,11,6),
  hp("Santa Maria","J. Gaitan","Fr",27,0.00,0,0,"0.1",0,0,0,0,0,1),
  hp("Santa Maria","A. Ybarra","Jr",31,10.92,0,0,"8.1",16,14,13,5,13,6),
  hp("Santa Maria","B. Alejo","So",42,6.30,0,0,"3.1",14,13,3,1,5,2),

  // SANTA YNEZ
  hp("Santa Ynez","J. Duarte","So",1,null,0,0,"0",2,2,2,0,0,1),
  hp("Santa Ynez","D. Aquistapace","Jr",2,21.00,0,0,"0.2",3,2,2,0,1,1),
  hp("Santa Ynez","T. Stevens","Sr",4,13.44,0,1,"8.1",17,18,16,11,10,8),
  hp("Santa Ynez","N. Palacios","Sr",8,1.24,0,0,"5.2",5,2,1,3,6,5),
  hp("Santa Ynez","K. Kays","Sr",9,2.58,5,3,"40.2",42,27,15,19,34,11),
  hp("Santa Ynez","T. Minus","Sr",11,1.59,4,6,"66",58,34,15,24,77,11),
  hp("Santa Ynez","J. Glover","So",14,21.00,0,0,"0.1",1,1,1,0,0,1),
  hp("Santa Ynez","P. Forsyth","Sr",16,47.25,0,0,"1.1",6,9,9,6,0,3),
  hp("Santa Ynez","E. Roberts","Fr",25,4.71,2,0,"16.1",20,11,11,8,15,5),

  // ST. JOSEPH
  hp("St. Joseph","N. Peinado","Sr",2,1.81,8,2,"65.2",49,22,17,14,58,12),
  hp("St. Joseph","E. Furness","Sr",3,0.00,0,0,"1",1,0,0,2,0,1),
  hp("St. Joseph","J. Rodriguez","Sr",4,3.76,2,3,"35.1",30,24,19,19,42,13),
  hp("St. Joseph","R. Roemling","Jr",7,0.84,3,1,"8.1",6,1,1,5,8,7),
  hp("St. Joseph","C. Chanley","Jr",11,4.20,1,0,"10",14,8,6,6,10,6),
  hp("St. Joseph","M. O'Keefe","So",15,8.25,0,0,"9.1",10,11,11,6,9,6),
  hp("St. Joseph","R. Schaffer","Fr",17,14.00,0,1,"3",3,6,6,5,2,2),
  hp("St. Joseph","R. Aparicio","Jr",18,0.00,0,0,"6",4,2,0,5,7,6),
  hp("St. Joseph","M. Majewski","So",19,2.71,8,1,"64.2",54,27,25,22,68,12),
  hp("St. Joseph","B. Mosley","Sr",30,3.00,1,0,"9.1",7,5,4,6,4,5),

  // TEMPLETON
  hp("Templeton","L. Olsen","Jr",1,4.38,0,1,"16",19,16,10,8,17,5),
  hp("Templeton","C. Sims","So",2,3.15,1,1,"13.1",7,8,6,8,8,6),
  hp("Templeton","A. Abatti","So",4,4.20,3,1,"31.2",36,26,19,26,32,15),
  hp("Templeton","L. Rivera","So",5,2.94,3,0,"16.2",14,10,7,13,20,6),
  hp("Templeton","C. Kline","Sr",9,4.23,4,4,"46.1",44,32,28,19,30,13),
  hp("Templeton","I. Regalado","Sr",11,4.31,2,1,"13",15,11,8,6,9,5),
  hp("Templeton","N. Argain","Jr",17,2.23,3,3,"53.1",50,35,17,27,34,10),
  hp("Templeton","R. Dennish","Sr",22,null,0,0,"0",0,0,0,0,0,1),

  // LOMPOC
  hp("Lompoc","R. Hendrickson","",6,5.56,1,1,"11.1",13,12,9,11,8,8),
  hp("Lompoc","B. Bailey-7","",7,5.53,0,0,"6.1",8,8,5,5,5,6),
  hp("Lompoc","S. Kubasiewicz","",9,7.00,0,0,"2",1,2,2,0,1,1),
  hp("Lompoc","I. Lara","",11,2.93,2,1,"28.2",36,25,12,17,19,12),
  hp("Lompoc","B. Bailey-15","",15,28.00,0,0,"1",6,4,4,0,0,1),
  hp("Lompoc","J. Jones","",18,1.41,8,3,"79.1",59,22,16,13,97,17),
  hp("Lompoc","K. Kubasiewicz","Jr",22,3.87,3,2,"25.1",37,18,14,8,17,8),
  hp("Lompoc","R. Sanchez","Sr",23,5.83,0,4,"18",27,20,15,7,5,9)
  ],

  /* Printed pitching season totals, for HIST.audit(). [IP,H,R,ER,BB,K] */
  printedPitchTotals: {
    "Arroyo Grande":["197",217,163,124,122,202], "Atascadero":["186.2",180,133,99,117,130],
    "Cabrillo":["151.1",177,132,108,71,104],     "Mission College Prep":["147.1",169,99,83,75,126],
    "Morro Bay":["195.2",187,114,72,77,168],     "Nipomo":["151",180,162,118,135,120],
    "Paso Robles":["183.2",160,116,80,102,182],  "Pioneer Valley":["186",226,142,85,70,119],
    "Righetti":["187.1",181,125,78,102,161],     "San Luis Obispo":["176",198,142,86,86,127],
    "Santa Maria":["131.1",133,100,60,79,196],   "Santa Ynez":["139.1",152,106,72,73,143],
    "St. Joseph":["222.2",184,109,92,93,215],    "Templeton":["190.1",185,139,96,108,150],
    "Lompoc":["182.1",198,114,79,64,160]
  }
},

"2023-24": {
  season: "2023-24",
  label: "Spring 2024",

  /* League alignment AS IT WAS THAT YEAR. Eight of the fifteen teams sit in a
     different league than they do in 2024-25. Do not carry alignment forward. */
  leagues: {
    "Arroyo Grande":"mountain", "Atascadero":"mountain", "Cabrillo":"mountain", "Righetti":"mountain", "San Luis Obispo":"mountain", "St. Joseph":"mountain",
    "Lompoc":"sunset", "Mission College Prep":"sunset", "Morro Bay":"sunset", "Pioneer Valley":"sunset", "Santa Ynez":"sunset",
    "Nipomo":"ocean", "Paso Robles":"ocean", "Santa Maria":"ocean", "Templeton":"ocean"
  },

  teams: [
    { name:"Cabrillo",              overall:"24-4",    leagueRecord:"13-2",  w:24,  l:4,   t:0, caRank:97,   coach:"Cole Osborne" },
    { name:"Pioneer Valley",        overall:"21-6",    leagueRecord:"8-4",   w:21,  l:6,   t:0, caRank:275,  coach:"Cody Smith" },
    { name:"Templeton",             overall:"20-7",    leagueRecord:"9-3",   w:20,  l:7,   t:0, caRank:478,  coach:"N/A" },
    { name:"Atascadero",            overall:"20-12",   leagueRecord:"7-8",   w:20,  l:12,  t:0, caRank:232,  coach:"Paul Teixeira" },
    { name:"Santa Maria",           overall:"16-9",    leagueRecord:"5-7",   w:16,  l:9,   t:0, caRank:775,  coach:"Matt Almaguer" },
    { name:"Mission College Prep",  overall:"16-11",   leagueRecord:"8-4",   w:16,  l:11,  t:0, caRank:417,  coach:"N/A" },
    { name:"Paso Robles",           overall:"16-12",   leagueRecord:"10-2",  w:16,  l:12,  t:0, caRank:462,  coach:"Jonathon Thornhill" },
    { name:"St. Joseph",            overall:"16-15",   leagueRecord:"9-6",   w:16,  l:15,  t:0, caRank:188,  coach:"Bryan Madsen" },
    { name:"Lompoc",                overall:"15-13",   leagueRecord:"9-3",   w:15,  l:13,  t:0, caRank:476,  coach:"N/A" },
    { name:"Righetti",              overall:"13-14",   leagueRecord:"5-10",  w:13,  l:14,  t:0, caRank:403,  coach:"Kyle Tognazzini" },
    { name:"Arroyo Grande",         overall:"12-18",   leagueRecord:"6-9",   w:12,  l:18,  t:0, caRank:446,  coach:"Steve Tolley" },
    { name:"Santa Ynez",            overall:"11-13",   leagueRecord:"3-9",   w:11,  l:13,  t:0, caRank:762,  coach:"Craig Gladstone" },
    { name:"Nipomo",                overall:"11-17",   leagueRecord:"6-6",   w:11,  l:17,  t:0, caRank:694,  coach:"Samm Spears" },
    { name:"San Luis Obispo",       overall:"10-19",   leagueRecord:"5-10",  w:10,  l:19,  t:0, caRank:472,  coach:"Dean Treanor" },
    { name:"Morro Bay",             overall:"7-17",    leagueRecord:"2-10",  w:7,   l:17,  t:0, caRank:737,  coach:"N/A" }
  ],

  /* Printed team season totals. Format: [PA,AB,R,H,BB,K] */
  printedTotals: {
    "Arroyo Grande":[930, 798, 138, 213, 86, 175],
    "Atascadero":[310, 267, 40, 67, 29, 72],
    "Cabrillo":[931, 731, 156, 220, 132, 157],
    "Lompoc":[903, 751, 138, 198, 120, 171],
    "Mission College Prep":[858, 717, 160, 206, 98, 162],
    "Morro Bay":[437, 369, 49, 79, 49, 83],
    "Nipomo":[848, 693, 160, 208, 108, 159],
    "Paso Robles":[903, 755, 183, 214, 106, 116],
    "Pioneer Valley":[894, 716, 150, 197, 108, 141],
    "Righetti":[844, 701, 125, 197, 93, 170],
    "San Luis Obispo":[866, 728, 116, 191, 90, 207],
    "Santa Maria":[833, 665, 214, 216, 141, 133],
    "Santa Ynez":[736, 608, 131, 172, 90, 156],
    "St. Joseph":[928, 764, 155, 223, 93, 158],
    "Templeton":[932, 731, 248, 270, 139, 115]
  },

  quality: {
    /* Reconciled row-by-row against the printed Season Totals on each team page. */

    "Atascadero": { completeness:null, pitchCompleteness:null, severity:"severe",
      note:"The printed Season Totals row on this page is the broken artifact, "+
           "not the player rows. MaxPreps prints 310 PA against 995 itemised and "+
           "68 IP against 203.2 itemised — roughly a third of the season. The "+
           "individual lines are internally consistent (every AVG, OBP, SLG and "+
           "ERA checks out against its own components), so use them and ignore "+
           "the totals. Reconciliation is skipped for this team in audit()." },

    "Morro Bay": { completeness:1.000, pitchCompleteness:1.000, severity:"severe",
      note:"Rows reconcile EXACTLY against the printed totals, which is why this "+
           "looks clean and is not. 437 PA and 94.2 IP across a listed 23-game "+
           "season works out to 19 PA and 4.1 IP per game; a seven-inning game "+
           "produces about 27 and 7. Roughly ten games are missing from MaxPreps "+
           "entirely, on both sides, and the printed totals are missing them too. "+
           "Playing-time counts for Morro Bay 2023-24 are therefore about 60% of "+
           "reality. Rate stats are usable; anything counting (WAR, totals, "+
           "leaderboards) is not." },

    "Lompoc": { completeness:1.000, pitchCompleteness:1.000, severity:"moderate",
      note:"PA, AB, R, H, BB, HBP and SF all reconcile exactly, but strikeouts do "+
           "not: 128 itemised against 171 printed. S. Bravo, A. Vallarta and "+
           "I. Lara have no K printed on their lines at all and are carried as 0, "+
           "so K% for those three is wrong and team K% is understated. On the "+
           "pitching side, B. Blake's line is internally impossible as printed "+
           "(ER above R) and his ER was recovered from the printed ERA; S. Bravo's "+
           "line could not be aligned to its columns at all and is carried as "+
           "zeroes. MaxPreps itself excludes Bravo from the team IP total, which "+
           "is how the printed 176.1 still reconciles." },

    "Pioneer Valley": { completeness:1.000, pitchCompleteness:1.000, severity:"moderate",
      note:"This page prints with pervasive blank cells; whole columns drop out "+
           "row by row. BB, K, HBP, SF and SH were reconstructed by solving each "+
           "line against its own printed OBP, SLG and PA rather than read off "+
           "directly. The reconstruction lands on the printed team totals exactly "+
           "for PA, AB, R, H and BB, and within one for K, HBP, SF and SH, so it "+
           "is sound in aggregate. One row does not close: Z. Saucedo's OBP "+
           "computes to .347 against a printed .338, so his SF or HBP is off by a "+
           "unit. Treat PV plate discipline at player level as derived, not read." },

    "San Luis Obispo": { completeness:1.032, pitchCompleteness:1.037, severity:"minor",
      note:"Itemised rows sum ABOVE the printed totals on both sides (28 PA and "+
           "7.0 IP). MaxPreps is internally inconsistent here; not a transcription "+
           "error. Also carries an unparseable jersey (J. Meyer, printed '23x'), "+
           "stored as num:null." },
    "Nipomo": { completeness:1.031, pitchCompleteness:1.054, severity:"minor",
      note:"Same pattern as San Luis Obispo: itemised rows exceed the printed "+
           "totals by 26 PA and 9.0 IP." },
    "Righetti": { completeness:0.975, pitchCompleteness:1.000, severity:"minor",
      note:"21 PA short. Pitching itemises exactly, and three pitchers "+
           "(E. Yanez, G. Moralez, T. Reid X) appear nowhere in the batting list." },
    "Templeton": { completeness:0.994, pitchCompleteness:0.981, severity:"minor" },
    "Arroyo Grande": { completeness:1.000, pitchCompleteness:1.042, severity:"minor",
      note:"Z. Tayman (34) and R. bronson (35) carry byte-identical batting AND "+
           "pitching lines. Both are counted in the printed batting total, which "+
           "reconciles exactly with both included, so they are kept as printed — "+
           "but one of them is almost certainly a MaxPreps duplication, and the "+
           "pitching total running 4.2% over is consistent with that." },
    "Paso Robles": { completeness:1.001, pitchCompleteness:1.000, severity:"minor" },
    "Cabrillo":    { completeness:0.999, pitchCompleteness:1.000, severity:"minor" },

    _classYearMissing: ["Mission College Prep","Morro Bay"],
    _printedTotalsCorrupt: ["Atascadero"],
    _nameHazards:
      "Morro Bay's 2024-25 roster carries BOTH 'C. Wilkenson' and 'C. Wilkinson' "+
      "as separate players, and both 'J. Deovlet' and 'J. Devolet'. The 2023-24 "+
      "page has only 'C. Wilkenson'. Which 2024-25 row it continues into is "+
      "unresolved, so no class year was inferred for him. Do not silently "+
      "normalise these spellings; the collision is real and matchedPairs is "+
      "built to refuse it rather than guess.",
    _source: "MaxPreps printable team_stats pages, pulled 2026-09-02"
  },

  batters: [
  // CABRILLO
  hb("Cabrillo","B. Gregory","Jr",2,28,.411,115,90,35,37,11,6,2,3,18,7,7,0,.539,.622,1.161),
  hb("Cabrillo","R. Hernandez","Sr",3,27,.260,97,73,8,19,15,3,1,0,12,11,8,3,.406,.329,.735),
  hb("Cabrillo","G. Barraza","So",4,28,.355,106,76,25,27,12,3,0,0,22,3,1,1,.500,.395,.895),
  hb("Cabrillo","B. Brockett","Sr",5,28,.183,90,71,13,13,8,1,0,0,13,23,1,1,.314,.197,.511),
  hb("Cabrillo","G. Rodriguez","Jr",6,26,.174,88,69,8,12,11,2,0,0,10,36,1,1,.284,.203,.487),
  hb("Cabrillo","S. Gallimore","Sr",7,28,.341,108,88,20,30,20,8,0,1,12,4,4,1,.438,.466,.904),
  hb("Cabrillo","F. Hernandez","Fr",9,17,.286,38,28,3,8,1,1,0,0,7,7,3,0,.474,.321,.795),
  hb("Cabrillo","T. Kiesling","Jr",10,28,.404,103,89,11,36,30,8,1,0,13,24,1,0,.485,.517,1.002),
  hb("Cabrillo","S. Downey","Sr",11,18,.083,20,12,6,1,0,0,0,0,3,8,3,0,.389,.083,.472),
  hb("Cabrillo","C. Powell","Fr",12,1,null,1,0,0,0,0,0,0,0,1,0,0,0,1.000,null,null),
  hb("Cabrillo","A. Parr","Jr",14,11,.222,32,27,3,6,3,2,0,0,5,13,0,0,.344,.296,.640),
  hb("Cabrillo","G. Mattis","Sr",15,26,.077,13,13,0,1,1,1,0,0,0,6,0,0,.077,.154,.231),
  hb("Cabrillo","L. Mabery","Sr",17,28,.322,107,87,21,28,18,6,1,0,13,13,4,2,.425,.414,.839),
  hb("Cabrillo","G. Coffin","Sr",19,3,.000,3,2,1,0,0,0,0,0,0,1,1,0,.333,.000,.333),
  hb("Cabrillo","D. Fowler","Sr",20,5,.333,9,6,2,2,1,0,0,0,3,1,0,0,.556,.333,.889),
  hb("Cabrillo","M. Koff","So",24,2,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),

  // PIONEER VALLEY
  hb("Pioneer Valley","A. Angulo","Jr",1,11,.286,9,7,1,2,2,1,0,0,1,3,0,0,.375,.428,.804),
  hb("Pioneer Valley","C. Ceja","Sr",2,8,null,13,10,0,0,1,0,0,0,2,4,0,0,.167,.000,.167),
  hb("Pioneer Valley","A. Garcia","Sr",3,9,null,5,3,1,0,0,0,0,0,2,1,0,0,.400,.000,.400),
  hb("Pioneer Valley","Z. Saucedo","Sr",4,23,.234,79,64,10,15,10,2,0,0,10,15,1,0,.338,.265,.604),
  hb("Pioneer Valley","J. Diaz-Resendez","Sr",5,25,.191,58,47,7,9,8,2,0,0,3,8,0,1,.235,.234,.469),
  hb("Pioneer Valley","J. Aguirre-Maldonado","Sr",6,4,null,4,3,0,0,1,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Pioneer Valley","R. Ramirez","Jr",7,10,.111,11,9,2,1,0,0,0,0,2,7,0,0,.273,.111,.384),
  hb("Pioneer Valley","C. Saucedo","Sr",8,18,.364,50,33,13,12,2,0,0,0,14,6,1,0,.562,.363,.926),
  hb("Pioneer Valley","E. Giddings","Sr",9,25,.379,102,87,24,33,17,3,0,0,11,16,1,0,.455,.413,.869),
  hb("Pioneer Valley","C. Garcia","Sr",10,27,.326,99,86,15,28,24,6,1,0,9,11,3,1,.404,.418,.823),
  hb("Pioneer Valley","J. Barajas","Sr",11,18,.214,37,28,6,6,8,0,0,0,2,5,5,1,.361,.214,.575),
  hb("Pioneer Valley","J. Garcia","Sr",12,27,.343,97,70,21,24,13,3,0,0,16,7,8,1,.505,.385,.891),
  hb("Pioneer Valley","A. Sandoval","Sr",13,26,.345,104,84,24,29,12,3,2,1,15,9,2,2,.447,.464,.911),
  hb("Pioneer Valley","M. Dedios","Sr",14,24,.250,65,52,9,13,5,0,0,0,7,12,5,0,.391,.250,.641),
  hb("Pioneer Valley","E. Ponce","So",15,1,.250,4,4,2,1,0,0,0,0,0,1,0,0,.250,.250,.500),
  hb("Pioneer Valley","T. Zepeda","Jr",16,22,.220,69,59,10,13,5,0,0,0,3,17,4,2,.294,.220,.514),
  hb("Pioneer Valley","J. Castillo","Jr",17,14,.171,38,35,1,6,2,1,0,0,2,5,1,0,.237,.200,.437),
  hb("Pioneer Valley","M. Ramirez","Jr",18,16,.143,41,28,2,4,9,0,0,0,7,10,0,5,.275,.142,.418),
  hb("Pioneer Valley","M. Rosas","So",19,2,null,5,4,1,0,1,0,0,0,1,3,0,0,.200,.000,.200),
  hb("Pioneer Valley","I. Enriquez","Fr",20,2,.333,4,3,1,1,3,0,0,0,1,0,0,0,.500,.333,.833),

  // TEMPLETON
  hb("Templeton","L. Olsen","So",1,19,.308,17,13,5,4,4,0,0,0,2,0,0,1,.375,.308,.683),
  hb("Templeton","A. Wall","Sr",2,9,.500,12,6,5,3,1,2,1,0,4,2,2,0,.750,1.167,1.917),
  hb("Templeton","M. Hamers","Sr",3,27,.419,104,93,25,39,14,5,0,0,7,4,1,1,.461,.473,.934),
  hb("Templeton","C. Sims","Fr",4,14,.200,7,5,2,1,0,0,0,0,2,1,0,0,.429,.200,.629),
  hb("Templeton","K. Sizemore","Sr",5,24,.324,53,37,15,12,11,2,0,0,9,14,7,0,.528,.378,.906),
  hb("Templeton","C. Dahlen","Jr",6,25,.338,84,65,18,22,17,4,0,0,14,9,3,2,.464,.400,.864),
  hb("Templeton","I. Regalado","Jr",7,6,.000,4,1,0,0,1,0,0,0,2,0,1,0,.750,.000,.750),
  hb("Templeton","L. Stetz","So",8,21,.433,80,60,25,26,15,0,2,0,8,5,9,2,.544,.500,1.044),
  hb("Templeton","C. Kline","Jr",9,26,.375,80,64,20,24,12,1,1,0,16,10,0,0,.500,.422,.922),
  hb("Templeton","Q. Winkler","Sr",11,25,.444,82,63,19,28,39,7,0,5,8,11,8,3,.537,.794,1.331),
  hb("Templeton","A. Raab","Jr",14,27,.397,99,73,31,29,25,9,3,0,25,12,0,1,.545,.603,1.148),
  hb("Templeton","N. Argain","So",17,17,.333,3,3,3,1,0,0,0,0,0,0,0,0,.333,.333,.666),
  hb("Templeton","M. Macconell","Sr",18,11,.375,13,8,3,3,1,1,0,0,3,2,2,0,.615,.500,1.115),
  hb("Templeton","K. Sobyra","Sr",21,26,.278,95,72,20,20,17,2,1,1,21,7,1,0,.447,.375,.822),
  hb("Templeton","R. Dennish","Jr",22,6,.286,7,7,2,2,2,0,0,0,0,1,0,0,.286,.286,.572),
  hb("Templeton","I. Kirschenstein","Sr",24,16,.294,21,17,5,5,5,0,0,0,3,6,1,0,.429,.294,.723),
  hb("Templeton","B. Swan","Jr",28,22,.231,65,52,13,12,13,1,0,0,9,17,1,3,.338,.250,.588),
  hb("Templeton","W. Hagen","Jr",33,12,.286,9,7,5,2,3,0,0,0,1,1,1,0,.444,.286,.730),
  hb("Templeton","E. Meyers","Sr",42,26,.438,91,80,32,35,15,3,0,0,5,12,5,0,.500,.475,.975),

  // ATASCADERO
  hb("Atascadero","G. Bowman","Jr",1,15,.250,31,24,7,6,2,0,0,0,6,9,1,0,.419,.250,.669),
  hb("Atascadero","S. Ernst","Fr",1,1,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Atascadero","J. Damery","Sr",2,31,.356,114,104,23,37,19,4,1,0,6,14,0,1,.387,.413,.800),
  hb("Atascadero","E. Wanner","So",3,2,.000,2,1,0,0,1,0,0,0,1,0,0,0,.500,.000,.500),
  hb("Atascadero","T. Debrum","Jr",3,17,.000,24,18,5,0,1,0,0,0,4,14,2,0,.250,.000,.250),
  hb("Atascadero","U. Kaul","Jr",4,30,.295,86,78,10,23,9,2,0,0,3,7,1,0,.329,.321,.650),
  hb("Atascadero","M. Cullen","Fr",6,2,.000,2,1,0,0,0,0,0,0,1,0,0,0,.500,.000,.500),
  hb("Atascadero","C. Viale","Sr",7,31,.293,102,92,18,27,14,6,0,1,8,25,0,0,.350,.391,.741),
  hb("Atascadero","J. Thompson","Sr",8,32,.242,123,99,25,24,12,3,1,0,18,11,3,0,.375,.293,.668),
  hb("Atascadero","T. Kerr","Jr",9,15,.214,29,28,3,6,6,0,0,0,1,4,0,0,.241,.214,.455),
  hb("Atascadero","L. Gibbons","Sr",10,31,.202,103,84,8,17,15,2,0,0,12,27,6,0,.343,.226,.569),
  hb("Atascadero","E. Churchill","Jr",11,14,.346,32,26,7,9,10,0,0,1,1,9,1,3,.355,.462,.817),
  hb("Atascadero","Z. Savino","So",13,32,.290,101,93,18,27,22,8,0,3,5,25,1,1,.330,.473,.803),
  hb("Atascadero","D. Cappel","Sr",18,32,.354,118,96,27,34,19,3,3,3,19,26,3,0,.475,.542,1.017),
  hb("Atascadero","C. Jeckell","Jr",19,18,.000,10,8,2,0,0,0,0,0,1,4,1,0,.200,.000,.200),
  hb("Atascadero","W. ?","Fr",20,2,.500,2,2,1,1,1,1,0,0,0,0,0,0,.500,1.000,1.500),
  hb("Atascadero","R. Gearhart","Jr",21,12,.368,26,19,2,7,2,2,0,0,3,3,4,0,.538,.474,1.012),
  hb("Atascadero","W. Witt","Jr",27,24,.348,31,23,12,8,6,1,0,0,7,8,0,0,.500,.391,.891),
  hb("Atascadero","J. Ramirez","Sr",28,1,null,1,0,1,0,0,0,0,0,1,0,0,0,1.000,null,null),
  hb("Atascadero","J. Lopez-Gastelum","Jr",30,1,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Atascadero","D. Mitchell","So",44,24,.340,57,50,10,17,5,5,0,0,5,13,1,0,.411,.440,.851),

  // SANTA MARIA
  hb("Santa Maria","A. Ybarra","So",2,9,.222,11,9,2,2,1,0,0,0,2,1,0,0,.364,.222,.586),
  hb("Santa Maria","E. Urias","Sr",7,25,.314,84,70,23,22,14,5,0,0,10,8,4,0,.429,.385,.815),
  hb("Santa Maria","M. Jordan","Sr",8,2,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Santa Maria","J. Andree","Sr",11,25,.317,82,63,23,20,15,6,0,0,16,9,3,0,.476,.412,.889),
  hb("Santa Maria","R. Escobedo","Sr",13,24,.242,83,62,20,15,15,3,0,0,19,12,2,0,.434,.290,.724),
  hb("Santa Maria","J. Medina-14","So",14,24,.278,82,72,15,20,17,4,0,0,9,15,0,1,.354,.333,.687),
  hb("Santa Maria","J. Silva","Jr",16,1,1.000,1,1,1,1,1,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("Santa Maria","A. Lugo","Sr",17,16,.353,45,34,11,12,9,2,1,0,8,11,2,1,.489,.470,.960),
  hb("Santa Maria","J. Estrada","Jr",21,11,.200,20,20,2,4,6,1,0,0,0,7,0,0,.200,.250,.450),
  hb("Santa Maria","D. Martin","So",22,25,.427,98,75,35,32,21,9,1,0,19,18,4,0,.561,.573,1.134),
  hb("Santa Maria","M. Peinado","Jr",26,24,.276,77,58,17,16,13,2,1,0,18,10,1,0,.455,.344,.800),
  hb("Santa Maria","D. Velasquez","Sr",27,10,.167,13,12,2,2,1,0,0,0,1,6,0,0,.231,.166,.398),
  hb("Santa Maria","J. Medina-30","So",30,25,.387,95,75,32,29,24,4,6,0,18,15,2,0,.516,.600,1.116),
  hb("Santa Maria","J. Lupercio","Sr",31,6,.143,8,7,1,1,3,0,0,0,0,6,1,0,.250,.142,.393),
  hb("Santa Maria","A. Mata","Sr",42,14,.375,51,40,14,15,12,1,0,0,10,5,1,0,.510,.400,.910),
  hb("Santa Maria","R. Guzman","Sr",50,23,.373,83,67,16,25,30,4,0,0,11,10,3,2,.470,.432,.903),

  // MISSION COLLEGE PREP
  hb("Mission College Prep","B. Orfila","Fr",null,18,.000,10,8,2,0,0,0,0,0,2,3,0,0,.200,.000,.200),
  hb("Mission College Prep","B. Warwick","",null,12,.400,7,5,0,2,2,0,0,0,2,0,0,0,.571,.400,.971),
  hb("Mission College Prep","T. Glenn","",2,24,.354,97,82,26,29,26,9,0,5,8,8,5,2,.433,.646,1.079),
  hb("Mission College Prep","J. Villa","",4,23,.352,67,54,14,19,2,2,0,0,11,8,0,0,.462,.388,.851),
  hb("Mission College Prep","J. Miles","",8,22,.254,66,59,10,15,9,1,0,2,5,12,2,0,.333,.372,.706),
  hb("Mission College Prep","H. Drake","",9,24,.301,85,73,14,22,12,8,0,4,8,6,3,1,.388,.575,.963),
  hb("Mission College Prep","B. Mott","",10,22,.303,91,76,18,23,13,2,0,3,11,16,3,0,.411,.447,.858),
  hb("Mission College Prep","I. Townsend","",11,22,.288,85,66,19,19,11,3,0,1,14,14,4,1,.435,.378,.814),
  hb("Mission College Prep","B. Sweeney","",12,14,.333,7,6,4,2,0,0,0,0,1,1,0,0,.429,.333,.762),
  hb("Mission College Prep","J. Hanchett","",15,24,.194,83,72,8,14,9,2,1,1,5,27,5,0,.293,.291,.585),
  hb("Mission College Prep","S. Broyles","",16,22,.298,50,47,7,14,11,3,0,4,2,13,1,0,.340,.617,.957),
  hb("Mission College Prep","J. Clipperton","",23,18,.235,19,17,4,4,1,0,0,0,1,7,0,1,.263,.235,.498),
  hb("Mission College Prep","K. Hickman","",27,21,.338,80,65,16,22,21,7,1,3,12,23,2,1,.450,.615,1.065),
  hb("Mission College Prep","A. Clayton","",28,15,.182,30,22,6,4,3,2,0,0,6,8,2,0,.400,.272,.673),
  hb("Mission College Prep","S. Connors","",32,21,.171,54,41,10,7,3,1,0,0,9,13,4,0,.370,.195,.565),
  hb("Mission College Prep","S. Rivas","",35,9,.417,27,24,2,10,13,1,0,1,1,3,1,0,.462,.583,1.045),

  // PASO ROBLES
  hb("Paso Robles","J. Kozar","Jr",null,1,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Paso Robles","D. Messina","So",null,4,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Paso Robles","M. Garcia","So",2,28,.266,108,94,22,25,20,5,0,0,10,9,3,1,.352,.319,.671),
  hb("Paso Robles","T. Freitas","So",3,26,.303,88,76,16,23,19,4,0,0,10,5,0,2,.375,.355,.730),
  hb("Paso Robles","C. Glover","So",5,18,.265,61,49,17,13,7,4,0,1,7,7,3,2,.377,.408,.785),
  hb("Paso Robles","A. Perry","So",7,20,.140,51,43,7,6,7,2,0,0,6,13,1,1,.255,.186,.441),
  hb("Paso Robles","K. Rickson","Jr",9,13,.303,34,33,7,10,11,2,0,0,0,7,1,0,.324,.363,.688),
  hb("Paso Robles","E. Dobroth","Fr",11,21,.264,65,53,12,14,8,2,0,0,6,10,6,0,.400,.301,.702),
  hb("Paso Robles","B. Hoier","Jr",14,28,.175,104,80,21,14,11,3,0,0,19,13,4,1,.356,.212,.568),
  hb("Paso Robles","X. Hermanson","Fr",19,13,.450,46,40,7,18,13,1,0,0,3,1,1,0,.500,.475,.975),
  hb("Paso Robles","L. Cook","Jr",21,25,.150,27,20,4,3,3,1,0,0,6,9,1,0,.370,.200,.570),
  hb("Paso Robles","C. Prieto","Fr",22,26,.268,73,56,17,15,8,4,0,0,15,7,0,0,.423,.339,.762),
  hb("Paso Robles","C. Mercado","Jr",24,11,.125,10,8,1,1,2,0,0,0,2,2,0,0,.300,.125,.425),
  hb("Paso Robles","J. Soboleski","Fr",27,27,.380,106,92,24,35,12,3,1,0,7,10,6,1,.453,.434,.888),
  hb("Paso Robles","K. Mitchell","Sr",31,28,.359,93,78,21,28,20,6,2,0,12,12,2,0,.457,.487,.944),
  hb("Paso Robles","G. Gataloi","Jr",33,14,.290,37,31,8,9,3,2,0,0,5,11,1,0,.405,.354,.760),

  // ST. JOSEPH
  hb("St. Joseph","J. Cervantes","Sr",2,28,.270,96,74,12,20,14,0,0,2,8,18,8,2,.391,.351,.742),
  hb("St. Joseph","E. Furness","Jr",3,26,.375,92,80,18,30,21,4,0,9,10,21,2,0,.457,.762,1.220),
  hb("St. Joseph","A. Carbajal","Sr",4,10,.167,14,12,1,2,4,0,0,0,2,1,0,0,.286,.166,.453),
  hb("St. Joseph","M. Hageman","Jr",5,12,.143,7,7,1,1,1,0,0,0,0,5,0,0,.143,.142,.286),
  hb("St. Joseph","R. Servin","Fr",6,8,.250,5,4,0,1,0,0,0,0,1,3,0,0,.400,.250,.650),
  hb("St. Joseph","J. Stollberg","Sr",7,19,.219,42,32,9,7,4,0,0,0,1,3,6,0,.359,.218,.578),
  hb("St. Joseph","C. Chanley","So",8,24,.322,73,59,7,19,5,2,0,0,6,9,6,0,.437,.355,.793),
  hb("St. Joseph","T. Winn","Sr",9,1,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("St. Joseph","J. Philson","Sr",10,26,.136,28,22,7,3,2,0,0,0,1,9,3,0,.269,.136,.405),
  hb("St. Joseph","H. Hammond","Sr",11,23,.120,28,25,3,3,3,0,0,0,2,12,1,0,.214,.120,.334),
  hb("St. Joseph","T. Ontiveros","Jr",15,10,.250,14,12,3,3,1,0,0,0,1,3,1,0,.357,.250,.607),
  hb("St. Joseph","J. Ferguson","Sr",17,23,.368,87,68,15,25,15,3,0,1,10,8,3,2,.458,.455,.914),
  hb("St. Joseph","A. Bluem","Fr",18,4,.000,2,2,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("St. Joseph","M. Majewski","Fr",19,14,.000,2,1,0,0,0,0,0,0,1,0,0,0,.500,.000,.500),
  hb("St. Joseph","J. Rodriguez","Jr",20,28,.271,81,70,10,19,12,4,0,2,8,10,1,2,.346,.414,.760),
  hb("St. Joseph","A. Stollberg","Sr",21,28,.355,104,93,18,33,10,2,0,0,4,8,3,1,.396,.376,.772),
  hb("St. Joseph","N. Peinado","Jr",22,28,.381,86,63,24,24,6,3,0,0,20,10,1,0,.536,.428,.965),
  hb("St. Joseph","A. Wesner","Sr",23,11,.222,20,18,3,4,2,0,0,0,2,9,0,0,.300,.222,.522),
  hb("St. Joseph","D. Hernandez","Jr",24,27,.263,93,76,12,20,15,2,0,2,12,15,3,0,.385,.368,.753),
  hb("St. Joseph","J. Curiel","Sr",27,21,.200,53,45,12,9,4,2,0,1,4,14,3,0,.308,.311,.619),

  // LOMPOC
  hb("Lompoc","K. Kubasiewicz","So",1,26,.321,101,81,28,26,11,6,0,2,17,16,3,0,.455,.469,.924),
  hb("Lompoc","D. Villalobos","So",2,1,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Lompoc","B. Coleman","Sr",3,26,.250,82,68,10,17,5,2,1,0,13,11,1,0,.378,.308,.687),
  hb("Lompoc","O. Mendoza","Sr",5,4,.000,5,4,0,0,0,0,0,0,1,2,0,0,.200,.000,.200),
  hb("Lompoc","M. Kovach","Sr",6,26,.402,104,82,30,33,17,7,0,6,17,8,5,0,.529,.707,1.236),
  hb("Lompoc","N. Gomez","Sr",7,19,.250,40,28,7,7,2,3,0,0,9,6,2,1,.450,.357,.807),
  hb("Lompoc","M. Gomez","Sr",8,28,.189,100,74,11,14,13,3,0,2,17,13,7,2,.380,.310,.691),
  hb("Lompoc","S. Kubasiewicz","Fr",9,20,.236,66,55,7,13,8,1,2,0,10,11,1,0,.364,.327,.691),
  hb("Lompoc","C. Baker","Jr",10,14,.133,35,30,1,4,5,2,0,0,4,9,1,0,.257,.200,.457),
  hb("Lompoc","B. Blake","Jr",11,23,.227,79,66,9,15,9,2,0,0,10,21,3,0,.354,.257,.612),
  hb("Lompoc","R. Munoz","Jr",13,22,.270,69,63,10,17,14,2,0,2,4,11,2,0,.333,.396,.730),
  hb("Lompoc","S. Bravo","Jr",14,25,.224,53,49,6,11,5,2,0,1,4,0,0,0,.283,.326,.610),
  hb("Lompoc","A. Arango","Sr",15,22,.174,27,23,3,4,0,1,0,0,2,11,2,0,.296,.217,.513),
  hb("Lompoc","J. Jones","Jr",18,27,.407,65,59,8,24,10,3,2,1,5,9,0,1,.446,.576,1.022),
  hb("Lompoc","A. Vallarta","Fr",21,16,.214,32,28,3,6,0,0,0,0,4,0,0,0,.312,.214,.526),
  hb("Lompoc","R. Hendrickson","So",22,3,null,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Lompoc","I. Lara","Jr",23,21,.175,44,40,5,7,0,3,1,0,3,0,0,0,.233,.300,.533),

  // RIGHETTI
  hb("Righetti","T. DeVan","Jr",1,21,.328,72,58,10,19,11,2,0,0,5,13,8,0,.451,.362,.813),
  hb("Righetti","J. Perez","Sr",2,26,.321,90,84,16,27,19,5,0,4,2,19,2,0,.352,.523,.876),
  hb("Righetti","J. McMillan","Jr",3,26,.329,99,82,22,27,24,11,0,3,14,3,0,2,.418,.573,.991),
  hb("Righetti","C. Cummins","Sr",7,18,.045,26,22,3,1,0,0,0,0,3,10,0,0,.160,.045,.205),
  hb("Righetti","C. Cuccia","Sr",8,25,.392,100,74,20,29,5,6,1,0,18,13,5,1,.531,.500,1.031),
  hb("Righetti","C. Carter","Sr",10,25,.303,88,76,15,23,16,3,0,2,6,14,3,1,.372,.421,.793),
  hb("Righetti","R. Pantoja","Sr",12,6,.000,3,1,2,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Righetti","M. Anderson","So",17,4,.250,5,4,2,1,0,0,0,0,1,3,0,0,.400,.250,.650),
  hb("Righetti","N. Farris","Jr",21,20,.192,39,26,3,5,4,1,0,0,10,11,0,2,.395,.230,.626),
  hb("Righetti","A. Randolph","Jr",22,4,.000,4,4,1,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Righetti","M. Munar","Jr",23,6,.333,9,9,1,3,1,0,0,0,0,3,0,0,.333,.333,.666),
  hb("Righetti","H. Roman","Jr",24,16,.167,7,6,3,1,0,0,0,0,0,2,1,0,.286,.166,.453),
  hb("Righetti","B. Thayer","Jr",25,25,.200,68,55,9,11,2,0,0,0,8,16,1,1,.308,.200,.508),
  hb("Righetti","T. Kramer","So",26,5,.357,14,14,0,5,2,0,0,0,0,4,0,0,.357,.357,.714),
  hb("Righetti","R. Bassett","Jr",27,24,.276,66,58,7,16,12,3,1,3,8,24,0,0,.364,.517,.881),
  hb("Righetti","K. Walker","Fr",28,18,.220,67,59,8,13,9,3,1,0,4,8,0,2,.262,.305,.567),
  hb("Righetti","V. Abercrombie","Jr",42,24,.275,66,51,8,14,5,1,0,1,13,15,1,0,.431,.352,.784),

  // ARROYO GRANDE
  hb("Arroyo Grande","J. Kreowski","So",0,10,.200,9,5,2,1,0,0,0,0,4,3,0,0,.556,.200,.756),
  hb("Arroyo Grande","J. Bishop","Sr",1,30,.275,120,102,27,28,16,1,1,0,13,8,3,1,.370,.304,.674),
  hb("Arroyo Grande","A. Cohn","Jr",2,2,.000,2,2,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Arroyo Grande","E. Weller","Jr",3,19,.111,12,9,4,1,0,0,0,0,0,6,3,0,.333,.111,.444),
  hb("Arroyo Grande","L. Whitney","Jr",4,27,.250,88,72,12,18,14,3,0,1,12,18,2,1,.368,.333,.701),
  hb("Arroyo Grande","G. Pope","So",5,4,1.000,2,1,1,1,0,1,0,0,1,0,0,0,1.000,2.000,3.000),
  hb("Arroyo Grande","N. Wright","Sr",8,10,1.000,1,1,1,1,1,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("Arroyo Grande","R. Payne","Jr",9,5,.167,6,6,0,1,1,0,0,0,0,3,0,0,.167,.167,.334),
  hb("Arroyo Grande","L. Plaza","Jr",10,30,.318,101,85,8,27,21,9,0,0,8,7,5,3,.396,.424,.820),
  hb("Arroyo Grande","C. Prazanowski","Jr",11,10,.000,2,1,1,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  hb("Arroyo Grande","T. Quaresma","Sr",12,25,.171,37,35,2,6,2,0,0,0,1,15,0,0,.194,.171,.365),
  hb("Arroyo Grande","Z. Jones","Sr",13,10,.294,20,17,6,5,3,0,0,0,1,2,1,0,.368,.294,.662),
  hb("Arroyo Grande","M. Clark","Sr",15,30,.315,98,89,14,28,8,2,0,0,7,16,0,0,.365,.337,.702),
  hb("Arroyo Grande","L. Durham","Jr",18,19,null,0,0,1,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Arroyo Grande","M. Corner","Jr",19,21,.160,28,25,0,4,3,1,0,0,3,8,0,0,.250,.200,.450),
  hb("Arroyo Grande","I. Childress","Jr",20,4,.500,4,2,0,1,0,0,0,0,2,1,0,0,.750,.500,1.250),
  hb("Arroyo Grande","J. Hill","Jr",22,28,.267,100,86,16,23,14,10,0,3,7,17,6,1,.360,.488,.848),
  hb("Arroyo Grande","A. Janowicz","Sr",24,28,.319,83,72,14,23,8,3,0,0,7,9,0,0,.380,.361,.741),
  hb("Arroyo Grande","D. Pimentel","Sr",25,22,.182,42,33,6,6,3,2,0,1,6,13,2,0,.341,.333,.674),
  hb("Arroyo Grande","T. Kurth","So",28,28,.309,79,68,10,21,9,3,1,0,6,17,5,0,.405,.382,.787),
  hb("Arroyo Grande","C. Coleman","Jr",32,9,.000,2,2,0,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Arroyo Grande","T. Bournonville","So",33,29,.211,82,71,10,15,3,4,0,0,8,19,2,1,.305,.268,.573),
  hb("Arroyo Grande","Z. Tayman","So",34,4,.000,6,5,0,0,0,0,0,0,1,1,0,0,.167,.000,.167),
  hb("Arroyo Grande","R. bronson","So",35,4,.000,6,5,0,0,0,0,0,0,1,1,0,0,.167,.000,.167),

  // SANTA YNEZ
  hb("Santa Ynez","D. Deforest","Sr",2,24,.383,86,60,19,23,22,8,0,0,14,17,9,2,.541,.516,1.058),
  hb("Santa Ynez","B. Flores","Jr",3,23,.292,67,48,12,14,7,2,0,2,13,14,6,0,.493,.458,.951),
  hb("Santa Ynez","B. Lood","Sr",4,24,.375,87,72,26,27,8,4,1,0,12,13,3,0,.483,.458,.941),
  hb("Santa Ynez","R. Roberts","Sr",5,11,1.000,3,1,1,1,2,1,0,0,2,0,0,0,1.000,2.000,3.000),
  hb("Santa Ynez","R. Cassidy","Jr",6,6,.167,6,6,1,1,1,0,0,0,0,3,0,0,.167,.166,.334),
  hb("Santa Ynez","E. Palmer","Sr",7,23,.224,54,49,6,11,3,0,0,0,5,14,0,0,.296,.224,.520),
  hb("Santa Ynez","J. Silva","Sr",8,15,.219,33,32,6,7,1,1,0,0,0,6,1,0,.242,.250,.492),
  hb("Santa Ynez","A. STEPHENS","Sr",10,23,.388,74,67,8,26,16,2,0,0,7,9,0,0,.446,.417,.864),
  hb("Santa Ynez","T. Minus","Jr",11,23,.281,76,64,13,18,9,3,0,1,8,21,4,0,.395,.375,.770),
  hb("Santa Ynez","K. Kays","Jr",12,13,.308,15,13,4,4,2,1,0,0,2,3,0,0,.400,.384,.785),
  hb("Santa Ynez","T. Stevens","Jr",14,12,.143,10,7,2,1,2,0,0,0,1,5,1,1,.300,.142,.443),
  hb("Santa Ynez","T. Rodrigues","Sr",15,7,.200,7,5,3,1,0,0,0,0,1,4,1,0,.429,.200,.629),
  hb("Santa Ynez","P. Forsyth","Jr",16,13,.250,7,4,2,1,1,0,0,0,3,2,0,0,.571,.250,.821),
  hb("Santa Ynez","R. Henrey","Jr",19,22,.172,63,58,7,10,5,1,0,0,4,20,0,0,.226,.189,.416),
  hb("Santa Ynez","D. Pulido","So",21,24,.276,78,58,13,16,15,4,0,0,14,10,4,1,.442,.344,.787),
  hb("Santa Ynez","N. PALACIOS","Jr",23,11,.133,17,15,2,2,3,0,0,0,0,5,0,2,.118,.133,.251),
  hb("Santa Ynez","M. Cabrera","Sr",25,22,.229,53,48,6,11,10,5,0,0,4,10,1,0,.302,.333,.635),

  // NIPOMO
  hb("Nipomo","G. Rodriguez","So",1,19,.000,4,4,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Nipomo","T. Oxley","So",2,13,.000,14,11,1,0,0,0,0,0,2,6,0,0,.154,.000,.154),
  hb("Nipomo","E. Silveira-3","So",3,25,.235,24,17,2,4,0,0,0,0,5,7,1,0,.435,.235,.670),
  hb("Nipomo","R. Horton","Sr",4,25,.284,85,67,19,19,13,6,1,0,12,26,5,0,.429,.403,.832),
  hb("Nipomo","A. Willis","Jr",5,22,.317,80,63,20,20,18,3,1,0,8,16,8,0,.456,.397,.853),
  hb("Nipomo","T. Bernal","Fr",6,25,.297,75,64,16,19,9,3,0,0,9,7,1,1,.387,.344,.731),
  hb("Nipomo","A. Jones","Sr",7,24,.362,92,80,20,29,11,5,2,0,9,10,2,1,.435,.475,.910),
  hb("Nipomo","G. Groshart","So",8,26,.350,95,80,15,28,26,9,0,0,13,12,1,1,.442,.463,.904),
  hb("Nipomo","O. Ortega","Jr",9,24,.154,34,26,1,4,1,0,0,0,3,7,3,0,.312,.154,.466),
  hb("Nipomo","B. Lowry","Fr",10,27,.344,108,90,23,31,13,8,2,1,16,16,0,2,.435,.511,.946),
  hb("Nipomo","L. Hobbs","So",11,18,.257,47,35,16,9,6,2,1,0,9,8,1,1,.413,.371,.784),
  hb("Nipomo","E. Hillier","Jr",12,7,.167,9,6,0,1,0,0,0,0,3,1,0,0,.444,.167,.611),
  hb("Nipomo","B. Kent","Jr",13,5,.333,3,3,0,1,1,0,0,0,0,1,0,0,.333,.333,.666),
  hb("Nipomo","J. Lanier","So",14,4,.000,4,2,2,0,1,0,0,0,1,2,1,0,.500,.000,.500),
  hb("Nipomo","A. Cardenas","So",15,2,null,1,0,0,0,0,0,0,0,1,0,0,0,1.000,null,null),
  hb("Nipomo","R. Barr","Jr",17,26,.214,66,56,7,12,4,1,0,0,5,23,0,1,.274,.232,.506),
  hb("Nipomo","T. Barr","So",18,26,.349,74,63,10,22,18,7,1,0,8,17,2,1,.432,.492,.924),
  hb("Nipomo","E. Silveira-19","So",19,26,.255,59,51,8,13,13,4,0,0,5,7,1,2,.322,.333,.655),

  // SAN LUIS OBISPO
  hb("San Luis Obispo","A. Morris","Sr",2,13,.000,2,2,4,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("San Luis Obispo","G. Bramble","So",3,13,.125,16,16,0,2,3,1,1,0,0,8,0,0,.125,.313,.438),
  hb("San Luis Obispo","A. Eagon","Sr",4,26,.233,80,60,9,14,6,2,0,0,11,31,8,1,.412,.267,.679),
  hb("San Luis Obispo","G. Vigil","Jr",5,26,.289,91,76,11,22,8,3,0,0,5,14,7,1,.382,.329,.711),
  hb("San Luis Obispo","R. Klisch","Sr",6,28,.176,80,68,5,12,12,3,0,0,4,15,4,2,.256,.221,.477),
  hb("San Luis Obispo","L. Drenckpohl","So",7,29,.241,103,87,17,21,8,2,0,0,11,25,1,0,.333,.264,.597),
  hb("San Luis Obispo","J. Taylor","So",8,22,.176,40,34,3,6,1,0,0,0,6,14,0,0,.300,.176,.476),
  hb("San Luis Obispo","H. Hall","Jr",9,28,.247,88,73,7,18,5,1,0,0,12,19,0,0,.353,.260,.613),
  hb("San Luis Obispo","T. Jepsen","Jr",10,8,.000,2,1,0,0,0,0,0,0,1,0,0,0,.500,.000,.500),
  hb("San Luis Obispo","T. Stephens","Sr",11,28,.309,101,81,18,25,18,13,0,1,17,15,2,1,.436,.506,.942),
  hb("San Luis Obispo","K. Toole","Jr",12,13,.143,16,14,1,2,0,1,0,0,1,5,1,0,.250,.214,.464),
  hb("San Luis Obispo","E. Lazanoff","Jr",13,5,.250,5,4,3,1,0,0,0,0,1,1,0,0,.400,.250,.650),
  hb("San Luis Obispo","A. Black","Jr",21,2,.000,2,1,0,0,0,0,0,0,1,0,0,0,.500,.000,.500),
  hb("San Luis Obispo","F. Stork","Jr",22,24,.417,52,48,10,20,10,5,1,0,4,6,0,0,.462,.563,1.024),
  hb("San Luis Obispo","F. Avrett","Fr",23,2,.000,2,1,0,0,0,0,0,0,1,1,0,0,.500,.000,.500),
  hb("San Luis Obispo","J. Meyer","Sr",null,1,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("San Luis Obispo","M. Milner","Jr",24,6,.000,8,5,2,0,0,0,0,0,3,2,0,0,.375,.000,.375),
  hb("San Luis Obispo","E. Baird","Jr",27,9,.000,8,5,0,0,0,0,0,0,3,3,0,0,.375,.000,.375),
  hb("San Luis Obispo","J. Isaman","So",28,22,.200,47,40,5,8,7,0,0,0,3,16,3,1,.298,.200,.498),
  hb("San Luis Obispo","C. Evans","Sr",33,25,.257,83,74,15,19,5,3,1,0,7,30,1,1,.325,.324,.649),
  hb("San Luis Obispo","C. Johnson","Sr",34,19,.426,67,61,8,26,11,5,0,0,3,6,2,1,.463,.508,.971),

  // MORRO BAY
  hb("Morro Bay","F. Ainley","",null,11,.348,24,23,2,8,4,1,0,0,1,8,0,0,.375,.391,.766),
  hb("Morro Bay","C. Calhoun","",1,14,.250,51,44,8,11,7,4,0,1,3,8,4,0,.353,.409,.762),
  hb("Morro Bay","H. Pilnick","",5,14,.167,31,24,6,4,3,0,0,0,5,7,2,0,.355,.166,.522),
  hb("Morro Bay","B. Bond","",6,7,.400,5,5,1,2,0,0,0,0,0,1,0,0,.400,.400,.800),
  hb("Morro Bay","C. Wilkenson","",9,9,.176,19,17,4,3,3,1,0,0,2,6,0,0,.263,.235,.498),
  hb("Morro Bay","A. Hunt","",10,13,.211,45,38,8,8,1,0,0,0,6,13,1,0,.333,.210,.544),
  hb("Morro Bay","T. Taylor","",11,14,.065,38,31,4,2,2,0,0,0,6,11,0,0,.216,.064,.281),
  hb("Morro Bay","E. Wilson","",17,14,.263,47,38,4,10,6,3,0,0,6,5,3,0,.404,.342,.746),
  hb("Morro Bay","C. Waldon","",22,13,.220,44,41,4,9,5,1,0,1,1,3,1,1,.250,.317,.567),
  hb("Morro Bay","T. Gray","",25,11,.150,28,20,1,3,2,0,0,0,5,5,2,0,.370,.150,.520),
  hb("Morro Bay","C. White","",26,10,.000,21,19,1,0,2,0,0,0,1,1,0,1,.048,.000,.048),
  hb("Morro Bay","Q. Crotts","",27,14,.349,54,43,6,15,3,3,0,0,10,8,1,0,.481,.418,.900),
  hb("Morro Bay","R. Zust","",28,10,.250,15,12,0,3,1,2,0,0,3,5,0,0,.400,.416,.817),
  hb("Morro Bay","E. Davis","",33,6,.500,2,2,0,1,0,0,0,0,0,1,0,0,.500,.500,1.000),
  hb("Morro Bay","E. Brown","",35,8,.000,4,4,0,0,1,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Morro Bay","A. Sibley","",40,4,.000,9,8,0,0,0,0,0,0,0,1,1,0,.111,.000,.111)
  ],

  pitchers: [
  // CABRILLO
  hp("Cabrillo","B. Gregory","Jr",2,0.00,1,0,"5",1,0,0,2,12,2),
  hp("Cabrillo","G. Barraza","So",4,3.50,0,0,"2",3,1,1,1,3,2),
  hp("Cabrillo","S. Gallimore","Sr",7,0.71,9,0,"78.2",44,15,8,10,99,13),
  hp("Cabrillo","T. Kiesling","Jr",10,2.66,2,3,"23.2",16,11,9,9,27,10),
  hp("Cabrillo","J. Low","So",13,0.00,0,0,"1",0,0,0,0,1,1),
  hp("Cabrillo","G. Mattis","Sr",15,0.63,12,0,"88.2",59,15,8,18,104,14),

  // PIONEER VALLEY
  hp("Pioneer Valley","A. Angulo","Jr",1,1.22,5,0,"40",31,13,7,18,37,9),
  hp("Pioneer Valley","C. Ceja","Sr",2,12.60,0,1,"1.2",2,3,3,2,1,1),
  hp("Pioneer Valley","A. Garcia","Sr",3,2.75,2,1,"20.1",23,16,8,6,10,7),
  hp("Pioneer Valley","Z. Saucedo","Sr",4,0.00,0,0,"1",0,1,0,2,0,1),
  hp("Pioneer Valley","J. Diaz-Resendez","Sr",5,0.42,8,2,"66",45,10,4,18,54,11),
  hp("Pioneer Valley","R. Ramirez","Jr",7,5.78,1,0,"13.1",18,16,11,15,10,6),
  hp("Pioneer Valley","J. Garcia","Sr",12,0.43,2,0,"16.1",8,1,1,4,19,12),
  hp("Pioneer Valley","A. Sandoval","Sr",13,3.50,1,0,"6",4,3,3,3,6,3),
  hp("Pioneer Valley","J. Castillo","Jr",17,5.53,1,1,"6.1",7,6,5,2,3,4),
  hp("Pioneer Valley","M. Ramirez","Jr",18,1.67,1,1,"21",19,8,5,12,18,7),

  // TEMPLETON
  hp("Templeton","A. Abatti","Fr",null,0.00,0,0,"4.1",1,0,0,3,7,2),
  hp("Templeton","L. Olsen","So",1,6.54,2,0,"20.1",18,25,19,22,17,7),
  hp("Templeton","A. Wall","Sr",2,null,0,0,"0",0,0,0,0,0,1),
  hp("Templeton","C. Sims","Fr",4,2.97,6,1,"37.2",39,22,16,21,30,10),
  hp("Templeton","C. Dahlen","Jr",6,3.71,1,0,"5.2",8,4,3,1,6,3),
  hp("Templeton","I. Regalado","Jr",7,6.79,0,1,"11.1",13,13,11,14,8,4),
  hp("Templeton","C. Kline","Jr",9,2.44,1,1,"14.1",12,12,5,8,13,8),
  hp("Templeton","Q. Winkler","Sr",11,0.00,1,0,"5",1,0,0,4,9,3),
  hp("Templeton","N. Argain","So",17,3.31,6,4,"48.2",52,37,23,24,42,12),
  hp("Templeton","K. Sobyra","Sr",21,0.00,0,0,"1",0,0,0,2,1,1),
  hp("Templeton","I. Kirschenstein","Sr",24,1.81,2,0,"19.1",14,11,5,13,20,8),

  // ATASCADERO
  hp("Atascadero","J. Damery","Sr",2,8.65,0,0,"5.2",10,10,7,2,4,4),
  hp("Atascadero","T. Debrum","Jr",3,null,0,0,"0",0,0,0,0,0,1),
  hp("Atascadero","C. Viale","Sr",7,5.42,5,5,"62",55,52,48,60,48,14),
  hp("Atascadero","J. Thompson","Sr",8,3.31,4,4,"42.1",42,29,20,14,33,15),
  hp("Atascadero","D. Cappel","Sr",18,1.83,7,1,"57.1",56,29,15,29,67,19),
  hp("Atascadero","C. Jeckell","Jr",19,8.69,1,1,"9.2",13,12,12,11,8,5),
  hp("Atascadero","R. Gearhart","Jr",21,13.65,0,1,"6.2",10,13,13,12,6,3),
  hp("Atascadero","W. Witt","Jr",27,3.50,2,0,"18",17,11,9,18,7,8),
  hp("Atascadero","D. Mitchell","So",44,13.12,0,0,"2.2",4,5,5,1,0,4),

  // SANTA MARIA
  hp("Santa Maria","E. Urias","Sr",7,0.00,0,0,"1",0,0,0,0,2,1),
  hp("Santa Maria","J. Andree","Sr",11,null,0,0,"0",0,0,0,0,0,1),
  hp("Santa Maria","R. Escobedo","Sr",13,null,0,0,"0",0,0,0,3,0,1),
  hp("Santa Maria","J. Medina-14","So",14,3.07,4,1,"43.1",40,25,19,31,47,12),
  hp("Santa Maria","A. Lugo","Sr",17,10.50,0,0,"1.1",0,4,2,7,1,2),
  hp("Santa Maria","D. Martin","So",22,3.11,5,2,"36",30,20,16,18,52,8),
  hp("Santa Maria","M. Peinado","Jr",26,5.88,0,0,"8.1",10,9,7,12,4,4),
  hp("Santa Maria","D. Velasquez","Sr",27,null,0,0,"0",0,0,0,0,0,1),
  hp("Santa Maria","J. Medina-30","So",30,2.59,5,0,"46",36,25,17,39,54,12),
  hp("Santa Maria","R. Guzman","Sr",50,3.20,0,0,"15.1",19,9,7,2,14,9),

  // MISSION COLLEGE PREP
  hp("Mission College Prep","B. Orfila","Fr",null,5.81,0,0,"15.2",28,17,13,8,15,13),
  hp("Mission College Prep","B. Warwick","",null,3.57,6,1,"47",56,31,24,24,32,12),
  hp("Mission College Prep","T. Glenn","",2,0.29,2,1,"24",16,6,1,10,24,9),
  hp("Mission College Prep","H. Irwin","Sr",5,2.95,1,4,"42.2",35,27,18,22,31,10),
  hp("Mission College Prep","H. Drake","",9,4.20,0,2,"6.2",10,5,4,4,3,6),
  hp("Mission College Prep","I. Townsend","",11,0.00,0,0,"1",1,0,0,0,3,1),
  hp("Mission College Prep","B. Sweeney","",12,21.00,0,0,".1",2,1,1,0,0,2),
  hp("Mission College Prep","S. Broyles","",16,3.43,3,0,"16.1",22,12,8,5,11,6),
  hp("Mission College Prep","A. Clayton","",28,6.67,2,0,"21",33,25,20,10,21,8),

  // PASO ROBLES
  hp("Paso Robles","J. Kozar","Jr",null,42.00,0,0,".1",3,2,2,0,0,1),
  hp("Paso Robles","D. Messina","So",null,1.05,0,0,"6.2",5,4,1,6,8,4),
  hp("Paso Robles","M. Garcia","So",2,2.16,1,0,"32.1",24,10,10,15,32,11),
  hp("Paso Robles","T. Freitas","So",3,2.60,2,0,"35",28,18,13,22,30,10),
  hp("Paso Robles","A. Perry","So",7,7.00,0,0,"4",7,6,4,4,5,3),
  hp("Paso Robles","B. Hoier","Jr",14,2.64,0,0,"45",41,24,17,32,45,11),
  hp("Paso Robles","X. Hermanson","Fr",19,0.00,0,0,"2",1,0,0,0,0,1),
  hp("Paso Robles","C. Prieto","Fr",22,4.67,0,0,"12",11,11,8,11,12,8),
  hp("Paso Robles","C. Mercado","Jr",24,3.23,2,0,"30.1",32,26,14,16,21,8),
  hp("Paso Robles","J. Soboleski","Fr",27,2.57,0,0,"16.1",11,13,6,10,17,10),

  // ST. JOSEPH
  hp("St. Joseph","J. Cervantes","Sr",2,2.21,0,0,"6.1",10,3,2,4,4,5),
  hp("St. Joseph","E. Furness","Jr",3,7.00,0,0,"1",2,1,1,1,0,1),
  hp("St. Joseph","M. Hageman","Jr",5,null,0,0,"0",0,0,0,0,0,1),
  hp("St. Joseph","R. Servin","Fr",6,null,0,0,"0",0,0,0,0,0,1),
  hp("St. Joseph","H. Hammond","Sr",11,2.45,6,5,"83",73,39,29,42,89,16),
  hp("St. Joseph","M. Majewski","Fr",19,2.25,3,4,"37.1",28,19,12,21,35,14),
  hp("St. Joseph","J. Rodriguez","Jr",20,3.94,2,2,"21.1",22,14,12,10,16,7),
  hp("St. Joseph","N. Peinado","Jr",22,2.42,4,2,"43.1",49,27,15,9,46,8),
  hp("St. Joseph","B. Mosley","Jr",30,10.50,0,0,"3.1",9,10,5,7,4,5),

  // LOMPOC
  hp("Lompoc","K. Kubasiewicz","So",1,0.00,0,0,"1.2",1,0,0,3,6,2),
  hp("Lompoc","O. Mendoza","Sr",5,2.33,2,0,"9",8,3,3,6,10,2),
  hp("Lompoc","M. Kovach","Sr",6,4.20,0,1,"5",5,3,3,5,9,4),
  hp("Lompoc","M. Gomez","Sr",8,4.77,0,1,"7.1",9,6,5,2,4,4),
  hp("Lompoc","B. Blake","Jr",11,63.00,0,0,".1",3,3,3,4,5,1),
  hp("Lompoc","C. Garcia","Sr",12,2.21,1,0,"12.2",7,8,4,6,16,7),
  hp("Lompoc","S. Bravo","Jr",14,null,0,0,"0",0,0,0,0,0,1),
  hp("Lompoc","A. Arango","Sr",15,2.73,3,1,"25.2",25,16,10,13,20,9),
  hp("Lompoc","J. Jones","Jr",18,1.63,8,2,"90",73,34,21,27,133,17),
  hp("Lompoc","R. Hendrickson","So",22,5.25,0,0,"2.2",1,2,2,2,0,2),
  hp("Lompoc","I. Lara","Jr",23,3.50,0,0,"18",8,11,9,18,17,9),
  hp("Lompoc","B. Barbosa","Fr",35,5.25,0,1,"4",3,3,3,3,2,2),

  // RIGHETTI
  hp("Righetti","J. McMillan","Jr",3,2.17,0,1,"9.2",6,6,3,8,8,3),
  hp("Righetti","C. Cummins","Sr",7,5.38,1,0,"13",15,16,10,3,6,8),
  hp("Righetti","C. Cuccia","Sr",8,3.00,2,3,"23.1",20,13,10,12,32,6),
  hp("Righetti","E. Yanez","Sr",11,3.82,1,0,"11",16,9,6,6,8,6),
  hp("Righetti","G. Moralez","Sr",13,4.52,2,3,"43.1",50,33,28,17,34,15),
  hp("Righetti","N. Farris","Jr",21,1.15,3,0,"18.1",11,5,3,9,17,7),
  hp("Righetti","R. Bassett","Jr",27,2.89,3,6,"53.1",44,28,22,36,45,12),
  hp("Righetti","T. Reid X","Sr",99,5.25,0,0,"4",3,4,3,6,6,5),

  // ARROYO GRANDE
  hp("Arroyo Grande","J. Kreowski","So",0,1.11,0,0,"6.1",4,3,1,5,6,6),
  hp("Arroyo Grande","J. Bishop","Sr",1,21.00,0,0,"1.2",2,6,5,7,2,2),
  hp("Arroyo Grande","L. Whitney","Jr",4,null,0,0,"0",0,0,0,0,0,1),
  hp("Arroyo Grande","G. Pope","So",5,7.87,0,0,"2.2",3,6,3,1,4,3),
  hp("Arroyo Grande","R. Koory","So",6,0.00,0,0,"1.1",2,0,0,0,1,1),
  hp("Arroyo Grande","N. Wright","Sr",8,1.50,0,0,"28",14,9,6,14,37,6),
  hp("Arroyo Grande","L. Plaza","Jr",10,4.32,0,0,"35.2",44,28,22,15,30,11),
  hp("Arroyo Grande","C. Prazanowski","Jr",11,10.11,0,0,"9",12,13,13,9,10,9),
  hp("Arroyo Grande","C. Jaynes","Fr",16,0.00,0,0,"1",0,0,0,1,0,1),
  hp("Arroyo Grande","L. Durham","Jr",18,4.17,0,0,"43.2",41,37,26,30,50,16),
  hp("Arroyo Grande","I. Childress","Jr",20,14.00,0,0,"1",1,2,2,2,1,2),
  hp("Arroyo Grande","C. Coleman","Jr",32,1.97,0,0,"10.2",14,16,3,8,7,8),
  hp("Arroyo Grande","T. Bournonville","So",33,2.84,0,0,"61.2",57,44,25,24,59,12),
  hp("Arroyo Grande","Z. Tayman","So",34,15.75,0,0,"1.1",5,3,3,2,0,1),
  hp("Arroyo Grande","R. bronson","So",35,15.75,0,0,"1.1",5,3,3,2,0,1),

  // SANTA YNEZ
  hp("Santa Ynez","D. Deforest","Sr",2,7.00,0,1,"1",1,1,1,0,0,1),
  hp("Santa Ynez","B. Lood","Sr",4,3.00,0,0,"2.1",2,3,1,2,0,2),
  hp("Santa Ynez","R. Roberts","Sr",5,4.10,1,1,"13.2",10,8,8,7,10,8),
  hp("Santa Ynez","E. Palmer","Sr",7,6.56,1,1,"5.1",4,5,5,6,4,6),
  hp("Santa Ynez","A. STEPHENS","Sr",10,0.00,0,0,"1",2,2,0,1,1,2),
  hp("Santa Ynez","T. Minus","Jr",11,2.91,5,4,"57.2",49,32,24,32,49,12),
  hp("Santa Ynez","K. Kays","Jr",12,7.50,1,1,"14",16,20,15,8,10,8),
  hp("Santa Ynez","T. Stevens","Jr",14,10.50,0,0,"6.2",9,11,10,8,7,6),
  hp("Santa Ynez","P. Forsyth","Jr",16,7.00,0,0,"11",14,13,11,11,9,5),
  hp("Santa Ynez","R. Henrey","Jr",19,3.34,1,5,"44",49,33,21,28,50,9),
  hp("Santa Ynez","D. Pulido","So",21,null,0,0,"0",2,2,2,0,0,1),
  hp("Santa Ynez","N. PALACIOS","Jr",23,null,0,0,"0",0,0,0,0,0,1),
  hp("Santa Ynez","M. Cabrera","Sr",25,null,0,0,"0",0,0,0,0,0,1),

  // NIPOMO
  hp("Nipomo","G. Rodriguez","So",1,4.65,0,0,"40.2",53,52,27,22,29,18),
  hp("Nipomo","T. Oxley","So",2,0.00,0,0,"4",2,1,0,2,0,2),
  hp("Nipomo","E. Silveira-3","So",3,4.82,0,0,"36.1",25,31,25,35,28,12),
  hp("Nipomo","T. Bernal","Fr",6,2.68,0,0,"47",34,33,18,25,42,12),
  hp("Nipomo","O. Ortega","Jr",9,1.17,1,0,"12",4,2,2,6,8,7),
  hp("Nipomo","B. Lowry","Fr",10,3.00,0,0,"16.1",7,10,7,21,26,12),
  hp("Nipomo","L. Hobbs","So",11,7.00,0,0,"1",3,1,1,0,0,1),
  hp("Nipomo","E. Hillier","Jr",12,10.04,1,0,"7.2",10,13,11,6,2,4),
  hp("Nipomo","B. Kent","Jr",13,3.50,0,0,"2",2,1,1,0,2,2),
  hp("Nipomo","A. Cardenas","So",15,0.00,0,0,"2",2,0,0,1,3,1),
  hp("Nipomo","T. Barr","So",18,null,0,0,"0",0,0,0,0,0,1),
  hp("Nipomo","E. Silveira-19","So",19,2.62,0,0,"8",6,4,3,10,10,7),

  // SAN LUIS OBISPO
  hp("San Luis Obispo","A. Morris","Sr",2,5.65,0,2,"8.2",6,8,7,10,8,7),
  hp("San Luis Obispo","G. Bramble","So",3,0.00,0,0,"2",1,0,0,0,2,2),
  hp("San Luis Obispo","R. Klisch","Sr",6,0.00,0,0,"3",3,2,0,0,1,3),
  hp("San Luis Obispo","J. Taylor","So",8,2.33,1,3,"30",24,29,10,20,19,12),
  hp("San Luis Obispo","T. Jepsen","Jr",10,6.75,0,0,"9.1",10,10,9,8,6,7),
  hp("San Luis Obispo","T. Stephens","Sr",11,3.03,3,2,"37",38,21,16,5,37,9),
  hp("San Luis Obispo","K. Toole","Jr",12,4.05,2,1,"19",18,16,11,10,18,8),
  hp("San Luis Obispo","F. Stork","Jr",22,3.70,2,5,"47.1",39,42,25,40,60,12),
  hp("San Luis Obispo","F. Avrett","Fr",23,6.00,0,1,"2.1",1,2,2,5,2,1),
  hp("San Luis Obispo","E. Baird","Jr",27,7.87,0,0,"2.2",5,4,3,4,1,3),
  hp("San Luis Obispo","J. Isaman","So",28,5.73,1,1,"18.1",24,20,15,13,11,8),
  hp("San Luis Obispo","C. Evans","Sr",33,3.82,1,2,"14.2",13,11,8,8,23,8),
  hp("San Luis Obispo","C. Johnson","Sr",34,21.00,0,0,".1",0,1,1,2,1,1),

  // MORRO BAY
  hp("Morro Bay","B. Bond","",6,1.17,0,0,"12",10,2,2,4,7,7),
  hp("Morro Bay","C. Wilkenson","",9,0.00,0,0,"1.2",1,1,0,1,2,1),
  hp("Morro Bay","A. Hunt","",10,17.50,0,1,"4",6,13,10,9,2,3),
  hp("Morro Bay","T. Taylor","",11,2.62,0,2,"8",7,10,3,5,5,6),
  hp("Morro Bay","E. Wilson","",17,1.35,1,2,"31",17,12,6,9,34,8),
  hp("Morro Bay","C. White","",26,1.71,1,1,"16.1",10,4,4,2,11,4),
  hp("Morro Bay","Q. Crotts","",27,0.00,0,0,"1",0,0,0,0,2,1),
  hp("Morro Bay","R. Zust","",28,null,0,0,"0",0,0,0,0,0,1),
  hp("Morro Bay","E. Davis","",33,4.90,0,2,"10",17,10,7,4,3,3),
  hp("Morro Bay","E. Brown","",35,5.25,2,0,"10.2",12,13,8,13,13,6)
  ],

  /* Printed pitching season totals. [IP,H,R,ER,BB,K] */
  printedPitchTotals: {
    "Arroyo Grande":["197",192,162,105,117,203],
    "Atascadero":["68",83,71,55,47,60],
    "Cabrillo":["199",123,42,26,40,246],
    "Lompoc":["176.1",142,90,64,89,214],
    "Mission College Prep":["174.2",203,124,88,83,140],
    "Morro Bay":["94.2",80,65,40,47,79],
    "Nipomo":["168",131,135,84,126,143],
    "Paso Robles":["184",163,114,73,116,170],
    "Pioneer Valley":["192",157,77,47,82,158],
    "Righetti":["176",165,105,85,98,156],
    "San Luis Obispo":["187.2",172,155,100,120,184],
    "Santa Maria":["151.1",135,92,67,112,174],
    "Santa Ynez":["156.2",156,130,103,105,140],
    "St. Joseph":["195.2",193,113,76,94,194],
    "Templeton":["171",161,132,87,119,154]
  }
},

"2022-23": {
  season: "2022-23",
  label: "Spring 2023",

  /* League alignment AS IT WAS THAT YEAR. Two leagues, not three: no page in
     this batch lists a Sunset league, and the 2023-24 Sunset members were all
     Mountain or Ocean here. Eight of the eleven teams sit in a different league
     than they do in 2023-24 (Cabrillo Ocean->Mountain, Mission College Prep
     Ocean->Sunset, Morro Bay Ocean->Sunset, Pioneer Valley Ocean->Sunset,
     Santa Ynez Mountain->Sunset, Templeton Mountain->Ocean, San Luis Obispo and
     Atascadero stay Mountain). Do not carry alignment forward or backward.
     Five teams are missing entirely; see quality._missingTeams. */
  leagues: {
    "Arroyo Grande":"mountain", "Righetti":"mountain", "San Luis Obispo":"mountain",
    "Santa Ynez":"mountain", "St. Joseph":"mountain", "Templeton":"mountain",
    "Cabrillo":"ocean", "Mission College Prep":"ocean", "Morro Bay":"ocean",
    "Nipomo":"ocean", "Pioneer Valley":"ocean"
  },

  teams: [
    { name:"Cabrillo",              overall:"24-7",    leagueRecord:"11-3", w:24, l:7,  t:0, caRank:194, coach:"Cole Osborne" },
    { name:"Righetti",              overall:"22-8",    leagueRecord:"13-1", w:22, l:8,  t:0, caRank:129, coach:"Kyle Tognazzini" },
    { name:"St. Joseph",            overall:"19-11",   leagueRecord:"12-2", w:19, l:11, t:0, caRank:236, coach:"Bryan Madsen" },
    { name:"Pioneer Valley",        overall:"18-7-1",  leagueRecord:"11-3", w:18, l:7,  t:1, caRank:254, coach:"Cody Smith" },
    { name:"Arroyo Grande",         overall:"16-12",   leagueRecord:"8-6",  w:16, l:12, t:0, caRank:307, coach:"Steve Tolley" },
    { name:"Mission College Prep",  overall:"16-13",   leagueRecord:"9-5",  w:16, l:13, t:0, caRank:458, coach:"Elliot Stewart" },
    { name:"San Luis Obispo",       overall:"14-11",   leagueRecord:"9-5",  w:14, l:11, t:0, caRank:348, coach:"Josh Miller" },
    { name:"Morro Bay",             overall:"11-12",   leagueRecord:"8-6",  w:11, l:12, t:0, caRank:567, coach:"N/A" },
    { name:"Templeton",             overall:"8-18",    leagueRecord:"3-11", w:8,  l:18, t:0, caRank:743, coach:"N/A" },
    { name:"Nipomo",                overall:"7-20",    leagueRecord:"2-12", w:7,  l:20, t:0, caRank:773, coach:"Samm Spears" },
    { name:"Santa Ynez",            overall:"6-18-1",  leagueRecord:"1-13", w:6,  l:18, t:1, caRank:754, coach:"warren dickey" }
  ],

  /* Printed team season totals. Format: [PA,AB,R,H,BB,K] */
  printedTotals: {
    "Arroyo Grande":[829, 695, 122, 190, 89, 142],
    "Cabrillo":[1055, 846, 214, 269, 130, 174],
    "Mission College Prep":[922, 737, 189, 222, 134, 170],
    "Morro Bay":[667, 551, 145, 156, 82, 120],
    "Nipomo":[786, 656, 93, 150, 90, 187],
    "Pioneer Valley":[923, 738, 209, 228, 129, 117],
    "Righetti":[999, 828, 193, 277, 121, 156],
    "San Luis Obispo":[749, 645, 92, 151, 77, 158],
    "Santa Ynez":[756, 606, 114, 164, 106, 193],
    "St. Joseph":[930, 796, 133, 223, 87, 176],
    "Templeton":[829, 700, 123, 193, 92, 156]
  },

  quality: {
    /* Reconciled row-by-row against the printed Season Totals on each page.
       This is the cleanest batch in the archive on the row level: every single
       AVG, OBP, SLG and ERA in all 206 batting and 121 pitching rows recomputes
       from its own components, with one exception noted below. The problem with
       2022-23 is not the rows that are here, it is the teams that are not. */

    _missingTeams:
      "ONLY 11 TEAMS. This is the headline caveat and it is not a small one. "+
      "Every listed team played exactly 14 league games (W+L=14 for all eleven), "+
      "which points to two eight-team leagues in a double round robin, i.e. 16 "+
      "CCAA members. Checking the balance: a closed league must have equal total "+
      "wins and losses. Mountain's six known teams are 46-38, so the missing "+
      "Mountain teams are 10-18 combined; Ocean's five are 41-29, so the missing "+
      "Ocean teams are 15-27. Those deficits are consistent with two teams "+
      "missing from Mountain and three from Ocean. Only four teams in the rest of "+
      "this archive have no 2022-23 page here (Atascadero, Lompoc, Paso Robles, "+
      "Santa Maria), so at least one 2022-23 CCAA member does not appear in any "+
      "later season either. Treat every 2022-23 league constant as a sample of "+
      "roughly 11/16 of the conference, weighted toward whoever happened to be "+
      "pulled, and do not present a 2022-23 leaderboard as conference-wide.",

    "Cabrillo": { completeness:0.975, pitchCompleteness:1.000, severity:"moderate",
      note:"26 PA short of the printed total, so one or two bench bats are absent "+
           "from the player listing. Pitching itemises exactly. Also carries the "+
           "one impossible row in the season: P. Kingsley is printed with 0 H and "+
           "1 2B on 1 AB. The row is self-consistent in the sense that the printed "+
           "SLG of 1.000 is what that combination produces, but a double is a hit, "+
           "so one of the two cells is wrong at the source. Kept as printed; it is "+
           "1 PA and changes nothing in aggregate." },

    "Mission College Prep": { completeness:0.995, pitchCompleteness:1.000, severity:"minor",
      note:"5 PA short. Pitching IP itemises exactly, though itemised ER runs 1 "+
           "above and R 3 below the printed totals." },

    "Nipomo": { completeness:0.997, pitchCompleteness:0.994, severity:"moderate",
      note:"Counts are near-exact, but this page carries the season's worst name "+
           "problem: TWO players printed as 'E. Silveira (Fr)', with no jersey "+
           "number on either, appearing twice in the pitching and fielding lists "+
           "and once in the batting list. In 2023-24 they separate cleanly as "+
           "E. Silveira-3 and E. Silveira-19, but nothing on this page says which "+
           "2022-23 line is which, so both are stored as plain 'E. Silveira' with "+
           "num:null. matchedPairs will see two candidates, fail the jersey test "+
           "and push them to `ambiguous` rather than guess, which is the intended "+
           "behaviour. Note also that only one of the two has a batting line, so "+
           "the other's plate appearances are missing outright. J. Rocha pitched "+
           "twice with a blank IP cell, which is the 1.0 IP the pitching total is "+
           "short." },

    "Arroyo Grande": { completeness:1.000, pitchCompleteness:1.000, severity:"minor" },
    "Morro Bay":     { completeness:1.000, pitchCompleteness:1.000, severity:"minor",
      note:"Reconciles exactly on both sides. Unlike Morro Bay 2023-24, the "+
           "per-game rates are sane here (667 PA and 136 IP over 23 games), so "+
           "this one is clean, not clean-looking." },
    "Pioneer Valley": { completeness:1.000, pitchCompleteness:1.000, severity:"minor",
      note:"Same pervasive blank-cell printing as the 2023-24 page: zeros render "+
           "as empty cells across AVG, RBI, 2B, 3B, HR, SF, SH, HBP, ROE and FC. "+
           "Every blank was resolved by solving the row against its own printed "+
           "AVG, OBP and SLG, and unlike 2023-24 the reconstruction closes "+
           "EXACTLY on all seven team totals (PA, AB, R, H, BB, K, HBP, SF, SH, "+
           "2B, 3B, HR). No row is left unexplained. Still derived rather than "+
           "read, so label it as such if it matters." },
    "Righetti":        { completeness:1.000, pitchCompleteness:1.000, severity:"minor",
      note:"R. Pantoja is printed with 6 R on 4 PA, 0 H and 0 BB, which cannot "+
           "happen. Kept as printed; it is the only line on the page that does "+
           "not close and the team totals reconcile with it included." },
    "San Luis Obispo": { completeness:1.000, pitchCompleteness:1.000, severity:"minor",
      note:"Itemised ER runs 2 above the printed pitching total." },
    "Santa Ynez":      { completeness:1.000, pitchCompleteness:1.000, severity:"moderate",
      note:"Counts are exact. The issue is casing, and it is the reason this team "+
           "is flagged higher than its numbers deserve. MaxPreps printed most of "+
           "this roster in ALL CAPS (D. PETERS, A. STEPHENS, T. MINUS, C. CASSIDY) "+
           "and a handful in title case (T. Koopmans, R. Henrey, D. Pulido). The "+
           "2023-24 page prints nearly the same players in title case. Since names "+
           "are stored exactly as printed and baseName() only strips a jersey "+
           "suffix, matchedPairs compares 'D. PETERS' against 'D. Peters', finds "+
           "no candidate, and silently drops the player into `droppedOut` as "+
           "though he stopped playing. Measured: matchedPairs('2022-23','2023-24') "+
           "drops nine Santa Ynez regulars that way, every one of whom does in "+
           "fact appear on the 2023-24 page. See _nameHazards." },
    "St. Joseph":      { completeness:1.000, pitchCompleteness:1.000, severity:"minor",
      note:"Two players wear 19 (D. Freitas and J. Rodriguez); the names differ so "+
           "no disambiguation is needed." },
    "Templeton":       { completeness:1.000, pitchCompleteness:1.000, severity:"minor",
      note:"L. Olsen and I. Regalado pitch with no jersey number and no batting "+
           "line. Their OBA cells print as 4.000, which is impossible; OBA is not "+
           "stored, and their IP/H/ER cells are internally consistent, so the rows "+
           "are kept." },

    _classYearMissing: ["Mission College Prep","Morro Bay"],
    _nameHazards:
      "1. CASING. Santa Ynez 2022-23 is mostly ALL CAPS while Santa Ynez 2023-24 "+
      "is mostly title case, and the 2023-24 page itself mixes the two (it carries "+
      "'A. STEPHENS' alongside 'B. Flores'). Cross-season matching for this team is "+
      "effectively broken until either the stored names are normalised or the "+
      "comparison in matchedPairs is made case-insensitive. Nothing here has been "+
      "changed, because normalising silently would contradict the 'exactly as "+
      "printed' rule that the rest of the archive depends on. Decide once and apply "+
      "it to every season at the same time.\n"+
      "2. Nipomo's two numberless E. Silveira rows, described under Nipomo above.\n"+
      "3. Atascadero has no 2022-23 page in this batch. The Atascadero PDF supplied "+
      "with it is the 2023-24 page, already present in this file, and was not "+
      "loaded again.",
    _source: "MaxPreps printable team_stats pages, pulled 2026-09-02"
  },

  batters: [
  // ARROYO GRANDE
  hb("Arroyo Grande","J. Bishop","Jr",1,28,.257,90,74,20,19,9,4,0,0,13,15,2,1,.378,.310,.689),
  hb("Arroyo Grande","L. Whitney","So",4,21,.190,48,42,8,8,8,2,0,0,4,11,1,0,.277,.238,.515),
  hb("Arroyo Grande","B. Kaplan","Sr",5,25,.238,55,42,5,10,4,3,0,0,8,14,3,1,.389,.309,.699),
  hb("Arroyo Grande","A. Lerma","Sr",7,19,.278,21,18,2,5,4,0,0,0,2,0,1,0,.381,.277,.659),
  hb("Arroyo Grande","N. Wright","Jr",8,16,.500,4,4,3,2,1,0,0,0,0,2,0,0,.500,.500,1.000),
  hb("Arroyo Grande","B. Pinkerton","Sr",9,27,.163,53,43,7,7,8,3,1,0,7,12,3,0,.321,.279,.600),
  hb("Arroyo Grande","L. Plaza","So",10,28,.284,95,81,12,23,20,3,0,1,7,14,4,3,.358,.358,.716),
  hb("Arroyo Grande","D. Roppolo","Sr",11,11,.000,3,3,1,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Arroyo Grande","T. Quaresma","Jr",12,15,.250,23,20,5,5,4,0,0,0,0,8,3,0,.348,.250,.598),
  hb("Arroyo Grande","M. Clark","Jr",15,24,.270,45,37,4,10,0,1,0,0,4,5,0,0,.341,.297,.638),
  hb("Arroyo Grande","R. Tayman","Sr",16,28,.453,100,75,20,34,20,8,0,6,19,9,4,2,.570,.800,1.370),
  hb("Arroyo Grande","L. Durham","Jr",18,12,.333,10,9,2,3,0,0,0,0,1,2,0,0,.400,.333,.733),
  hb("Arroyo Grande","I. Childress","So",20,6,.333,3,3,1,1,0,0,0,0,0,1,0,0,.333,.333,.666),
  hb("Arroyo Grande","J. Hill","So",22,26,.282,97,85,16,24,12,4,0,0,9,8,3,0,.371,.329,.700),
  hb("Arroyo Grande","A. Janowicz","Jr",24,24,.083,54,48,5,4,2,1,0,0,4,10,0,0,.154,.104,.258),
  hb("Arroyo Grande","D. Pimental","Jr",25,5,.667,5,3,1,2,1,2,0,0,2,1,0,0,.800,1.333,2.133),
  hb("Arroyo Grande","A. Granados","Jr",27,12,.375,8,8,0,3,0,0,0,0,0,3,0,0,.375,.375,.750),
  hb("Arroyo Grande","T. Bournonville","Fr",33,22,.244,49,45,4,11,5,3,0,0,2,13,2,0,.306,.311,.617),
  hb("Arroyo Grande","T. Scrudato","Sr",68,24,.345,66,55,6,19,9,8,0,0,7,14,1,0,.429,.490,.920),

  // CABRILLO
  hb("Cabrillo","B. Gregory","So",2,29,.372,115,94,30,35,24,8,2,2,18,9,3,0,.487,.563,1.051),
  hb("Cabrillo","R. Hernandez","Jr",3,25,.262,95,80,16,21,14,4,0,1,4,11,7,0,.352,.350,.702),
  hb("Cabrillo","G. Barraza","Fr",4,31,.353,117,102,23,36,32,7,0,0,8,14,4,2,.414,.421,.836),
  hb("Cabrillo","B. Brockett","Jr",5,31,.293,101,75,17,22,13,0,0,0,17,22,3,0,.442,.293,.735),
  hb("Cabrillo","G. Rodriguez","So",6,16,.226,39,31,6,7,9,1,0,0,5,13,2,0,.368,.258,.626),
  hb("Cabrillo","S. Gallimore","Jr",7,31,.355,121,93,23,33,18,9,0,0,18,6,2,4,.453,.451,.905),
  hb("Cabrillo","P. Kingsley","So",8,2,.000,2,1,0,0,0,1,0,0,1,0,0,0,.500,1.000,1.500),
  hb("Cabrillo","C. Forest","Fr",9,3,1.000,1,1,0,1,0,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("Cabrillo","T. Kiesling","So",10,30,.306,117,85,25,26,17,5,0,0,25,16,6,0,.491,.364,.856),
  hb("Cabrillo","D. Dixon","Fr",12,8,.000,3,3,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Cabrillo","S. Downey","Jr",14,27,.175,57,40,13,7,12,0,0,0,9,12,4,2,.364,.175,.539),
  hb("Cabrillo","G. Mattis","Jr",15,21,.161,35,31,3,5,6,3,0,0,3,20,0,1,.229,.258,.487),
  hb("Cabrillo","L. Mabery","Jr",17,31,.417,124,103,33,43,20,9,4,0,12,18,9,0,.516,.582,1.099),
  hb("Cabrillo","C. Heath","Sr",20,29,.341,102,85,22,29,12,4,0,1,8,22,2,0,.411,.423,.835),

  // MISSION COLLEGE PREP
  hb("Mission College Prep","D. Luera","",null,23,.328,66,58,13,19,17,3,0,1,5,9,2,1,.394,.431,.825),
  hb("Mission College Prep","M. Luera","",null,19,.293,54,41,8,12,3,3,0,0,7,13,5,0,.453,.365,.819),
  hb("Mission College Prep","B. Warwick","",null,7,1.000,3,2,1,2,2,1,0,0,1,0,0,0,1.000,1.500,2.500),
  hb("Mission College Prep","T. Jepsen","",1,7,.000,2,1,2,0,0,0,0,0,1,0,0,0,.500,.000,.500),
  hb("Mission College Prep","T. Glenn","",2,27,.296,89,71,22,21,22,5,0,1,12,8,4,2,.416,.408,.824),
  hb("Mission College Prep","J. Villa","",4,16,.100,13,10,2,1,2,0,0,0,3,2,0,0,.308,.100,.408),
  hb("Mission College Prep","N. Bender","",5,25,.297,79,64,18,19,18,5,0,2,15,12,0,0,.430,.468,.899),
  hb("Mission College Prep","R. Kardashian","Fr",6,7,.000,1,1,1,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Mission College Prep","J. Miles","",8,18,.250,27,24,1,6,6,1,0,0,2,7,1,0,.333,.291,.625),
  hb("Mission College Prep","H. Drake","",9,7,.400,11,10,3,4,4,1,0,0,0,1,1,0,.455,.500,.955),
  hb("Mission College Prep","B. Mott","",10,27,.375,97,72,25,27,11,2,1,0,19,14,4,1,.521,.430,.952),
  hb("Mission College Prep","I. Townsend","",11,24,.338,91,74,26,25,15,8,0,1,13,14,4,0,.462,.486,.948),
  hb("Mission College Prep","B. Sweeney","",12,24,.143,31,21,3,3,3,0,0,0,9,4,1,0,.419,.142,.562),
  hb("Mission College Prep","J. Stoddard","",13,6,.000,8,6,2,0,0,0,0,0,2,2,0,0,.250,.000,.250),
  hb("Mission College Prep","J. Hanchett","",15,20,.370,32,27,3,10,5,3,0,0,3,8,1,0,.452,.481,.933),
  hb("Mission College Prep","J. Clipperton","",23,12,.500,7,6,5,3,4,1,0,0,1,1,0,0,.571,.666,1.238),
  hb("Mission College Prep","K. Hickman","",27,26,.269,65,52,7,14,13,6,0,1,8,11,5,0,.415,.442,.857),
  hb("Mission College Prep","A. Clayton","",28,25,.304,67,56,16,17,14,6,1,1,4,26,5,1,.394,.500,.894),
  hb("Mission College Prep","S. Connors","",32,27,.319,86,69,20,22,15,4,0,2,15,21,1,1,.442,.463,.906),
  hb("Mission College Prep","C. Christiansen","",34,26,.289,56,38,8,11,6,0,0,0,14,10,3,1,.500,.289,.789),
  hb("Mission College Prep","S. Rivas","",35,23,.167,32,30,3,5,4,2,0,0,0,5,2,0,.219,.233,.452),

  // MORRO BAY
  hb("Morro Bay","C. Franklin","",null,7,.222,14,9,2,2,0,0,0,0,1,4,3,0,.462,.222,.684),
  hb("Morro Bay","C. Calhoun","",1,22,.358,79,67,20,24,16,5,1,0,9,19,1,1,.436,.462,.899),
  hb("Morro Bay","J. Botello","",2,20,.392,64,51,22,20,12,7,0,0,10,3,2,0,.508,.529,1.037),
  hb("Morro Bay","G. Paul","",3,16,.182,27,22,3,4,4,0,0,0,4,4,0,0,.308,.181,.490),
  hb("Morro Bay","H. Pilnick","",4,20,.077,18,13,3,1,0,0,0,0,2,5,3,0,.333,.076,.410),
  hb("Morro Bay","C. Wilkinson","",5,3,.000,5,2,0,0,1,0,0,0,2,0,0,1,.400,.000,.400),
  hb("Morro Bay","T. White","",7,22,.214,66,56,13,12,10,2,0,0,8,11,1,0,.323,.250,.573),
  hb("Morro Bay","Q. Crotts","",8,8,.263,24,19,5,5,5,0,0,0,4,5,1,0,.417,.263,.680),
  hb("Morro Bay","C. Waldon","",9,20,.194,35,31,7,6,7,3,0,0,1,9,2,1,.257,.290,.547),
  hb("Morro Bay","A. Hunt","",10,22,.345,66,58,14,20,16,1,0,0,6,15,2,0,.424,.362,.786),
  hb("Morro Bay","T. Taylor","",11,14,.062,18,16,0,1,2,0,0,0,2,5,0,0,.167,.062,.230),
  hb("Morro Bay","B. Kelting","",12,3,.000,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Morro Bay","M. Wilson","",13,22,.354,77,65,24,23,11,5,1,0,8,6,3,1,.442,.461,.904),
  hb("Morro Bay","E. Wilson","",17,22,.296,69,54,15,16,20,3,2,0,11,11,0,3,.397,.425,.823),
  hb("Morro Bay","B. Bond","",18,10,.125,8,8,0,1,0,0,0,0,0,4,0,0,.125,.125,.250),
  hb("Morro Bay","A. Sibley","",19,1,.500,2,2,0,1,1,0,0,0,0,0,0,0,.500,.500,1.000),
  hb("Morro Bay","R. Zust","",21,17,.222,22,18,5,4,3,1,0,0,4,7,0,0,.364,.277,.642),
  hb("Morro Bay","J. Skaggs","",22,22,.271,72,59,12,16,16,1,3,0,10,11,1,2,.375,.389,.765),

  // NIPOMO
  hb("Nipomo","R. Barr","So",null,15,.100,31,20,2,2,2,0,0,0,8,14,0,1,.345,.100,.445),
  hb("Nipomo","J. Beach","So",null,3,.333,6,6,0,2,1,1,0,0,0,2,0,0,.333,.500,.833),
  hb("Nipomo","G. Groshart","Fr",null,15,.333,43,39,5,13,8,3,0,0,3,4,0,1,.372,.410,.782),
  hb("Nipomo","C. Millhollon","Fr",null,5,.000,2,2,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Nipomo","T. Oxley","Fr",null,14,.162,43,37,2,6,5,0,0,0,5,16,1,0,.279,.162,.441),
  hb("Nipomo","G. Rodriguez","Fr",null,7,null,0,0,0,0,0,0,0,0,0,0,0,0,null,null,null),
  hb("Nipomo","E. Silveira","Fr",null,9,.125,8,8,0,1,0,0,0,0,0,1,0,0,.125,.125,.250),
  hb("Nipomo","D. Hill","So",1,17,.133,15,15,2,2,0,0,0,0,0,4,0,0,.133,.133,.266),
  hb("Nipomo","L. Alley","Sr",2,24,.267,71,60,10,16,11,2,1,0,10,4,0,0,.371,.333,.704),
  hb("Nipomo","T. Puckett","Jr",3,13,.000,17,16,2,0,0,0,0,0,1,8,0,0,.059,.000,.059),
  hb("Nipomo","R. Horton","Jr",4,25,.138,86,65,13,9,2,2,0,0,10,27,8,0,.325,.169,.494),
  hb("Nipomo","A. Willis","So",5,25,.309,86,68,12,21,11,6,2,0,13,15,2,0,.434,.456,.890),
  hb("Nipomo","A. Jones","Jr",7,25,.355,88,76,18,27,7,7,0,0,10,11,0,0,.430,.447,.877),
  hb("Nipomo","H. Wooldridge","Sr",8,12,.000,5,5,0,0,0,0,0,0,0,3,0,0,.000,.000,.000),
  hb("Nipomo","O. Ortega","So",9,25,.211,51,38,4,8,5,1,0,0,8,10,2,1,.367,.237,.604),
  hb("Nipomo","E. Hillier","So",11,24,.280,59,50,10,14,6,3,0,0,6,17,2,1,.373,.340,.713),
  hb("Nipomo","A. Juarez","Sr",12,19,.211,42,38,0,8,3,0,0,0,2,11,1,1,.262,.211,.473),
  hb("Nipomo","J. Rocha","Jr",13,11,.000,6,4,0,0,1,0,0,0,1,2,0,1,.167,.000,.167),
  hb("Nipomo","I. Ackerman","Jr",14,26,.219,78,64,8,14,8,5,0,0,10,18,3,0,.351,.297,.648),
  hb("Nipomo","M. Knight","Jr",15,9,.286,14,14,2,4,1,0,0,0,0,7,0,0,.286,.286,.572),
  hb("Nipomo","J. Shultz","Jr",17,7,.167,13,12,1,2,0,0,0,0,1,2,0,0,.231,.167,.398),
  hb("Nipomo","J. Blevins","Jr",18,10,.000,13,12,1,0,0,0,0,0,1,8,0,0,.077,.000,.077),
  hb("Nipomo","M. Starr","Jr",20,7,.000,7,6,0,0,0,0,0,0,1,4,0,0,.143,.000,.143),

  // PIONEER VALLEY
  hb("Pioneer Valley","A. Angulo","So",1,17,null,7,6,1,0,1,0,0,0,1,3,0,0,.143,.000,.143),
  hb("Pioneer Valley","C. Ceja","Jr",2,8,.300,14,10,5,3,4,0,0,0,4,3,0,0,.500,.300,.800),
  hb("Pioneer Valley","A. Morales","Sr",3,21,.246,70,57,6,14,11,3,1,0,11,12,0,0,.368,.333,.701),
  hb("Pioneer Valley","Z. Saucedo","Jr",4,25,.224,86,58,15,13,10,2,0,0,16,9,4,1,.418,.258,.677),
  hb("Pioneer Valley","J. Diaz-Resendez","Jr",5,20,.315,60,54,10,17,12,2,0,0,2,6,1,2,.339,.351,.691),
  hb("Pioneer Valley","J. Barajas","Jr",6,13,.250,23,16,6,4,6,0,0,0,5,5,2,0,.478,.250,.728),
  hb("Pioneer Valley","A. Garcia","Jr",7,15,.286,8,7,5,2,0,0,0,0,1,2,0,0,.375,.285,.661),
  hb("Pioneer Valley","C. Saucedo","Jr",8,12,.200,30,20,9,4,4,0,0,0,7,6,2,0,.448,.200,.648),
  hb("Pioneer Valley","E. Giddings","Jr",9,25,.321,100,81,29,26,14,3,0,1,15,13,2,0,.439,.395,.834),
  hb("Pioneer Valley","C. Garcia","Jr",10,26,.338,99,77,19,26,14,7,0,1,15,13,5,2,.465,.467,.933),
  hb("Pioneer Valley","N. Resendez","Sr",11,7,.143,11,7,4,1,2,0,0,0,3,2,0,0,.400,.142,.543),
  hb("Pioneer Valley","J. Garcia","Jr",12,26,.519,101,81,25,42,33,15,2,1,15,4,2,2,.590,.790,1.380),
  hb("Pioneer Valley","A. Sandoval","Jr",13,26,.374,106,91,31,34,17,8,1,0,13,4,2,0,.462,.483,.946),
  hb("Pioneer Valley","M. Dedios","Jr",14,14,.256,45,43,9,11,11,2,0,0,2,9,0,0,.289,.302,.591),
  hb("Pioneer Valley","T. Zepeda","So",16,19,.178,57,45,14,8,11,3,0,0,6,10,3,1,.309,.244,.553),
  hb("Pioneer Valley","E. Estrada","Sr",17,7,.167,18,12,3,2,4,1,0,0,4,7,1,0,.412,.250,.662),
  hb("Pioneer Valley","E. Fonseca","Sr",19,24,.288,88,73,18,21,20,4,0,0,9,9,4,2,.386,.342,.728),

  // RIGHETTI
  hb("Righetti","T. Thomas","Sr",1,29,.406,88,69,27,28,12,7,1,0,13,12,3,1,.512,.536,1.048),
  hb("Righetti","B. Miller","Sr",2,30,.447,110,94,14,42,20,9,0,0,16,15,0,0,.527,.542,1.070),
  hb("Righetti","J. McMillan","So",3,30,.333,99,87,7,29,17,3,0,1,5,3,4,1,.392,.402,.794),
  hb("Righetti","A. Moore","Sr",5,23,.237,51,38,9,9,5,0,1,0,10,7,2,0,.420,.289,.709),
  hb("Righetti","C. Cummins","Jr",7,6,.250,5,4,2,1,0,0,0,0,1,3,0,0,.400,.250,.650),
  hb("Righetti","C. Cuccia","Jr",8,26,.367,99,79,25,29,13,4,0,1,14,19,1,1,.463,.455,.919),
  hb("Righetti","C. Carter","Jr",10,14,.474,20,19,6,9,2,3,1,0,1,5,0,0,.500,.736,1.237),
  hb("Righetti","J. Perez","Jr",11,21,.289,50,38,7,11,6,1,0,0,10,9,2,0,.460,.315,.776),
  hb("Righetti","R. Pantoja","Jr",12,14,.000,4,4,6,0,0,0,0,0,0,2,0,0,.000,.000,.000),
  hb("Righetti","J. Ughoc","Sr",21,30,.259,100,81,14,21,16,4,1,3,14,24,3,1,.384,.444,.828),
  hb("Righetti","G. Moralez","Jr",22,14,null,1,0,1,0,0,0,0,0,1,0,0,0,1.000,null,1.000),
  hb("Righetti","A. Robles","Sr",23,22,.235,21,17,5,4,2,1,0,0,3,4,0,0,.350,.294,.644),
  hb("Righetti","R. Smith","Sr",24,29,.364,109,99,24,36,25,3,3,2,7,5,2,1,.413,.515,.928),
  hb("Righetti","B. Thayer","So",25,22,.278,18,18,4,5,1,0,0,0,0,6,0,0,.278,.277,.556),
  hb("Righetti","B. Munoz","Sr",26,30,.300,112,90,17,27,25,12,0,3,15,18,5,0,.427,.533,.960),
  hb("Righetti","R. Bassett","So",27,10,.000,4,3,0,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  hb("Righetti","T. Reid","Jr",42,4,.000,2,1,0,0,0,0,0,0,0,1,1,0,.500,.000,.500),
  hb("Righetti","A. Santini","Sr",99,30,.299,106,87,25,26,19,9,0,1,10,21,2,3,.373,.436,.810),

  // SAN LUIS OBISPO
  hb("San Luis Obispo","O. Wells","Sr",3,25,.250,81,76,16,19,7,4,0,1,2,16,1,0,.278,.342,.620),
  hb("San Luis Obispo","A. Eagon","Jr",5,14,.071,16,14,3,1,0,0,0,0,1,7,0,0,.133,.071,.204),
  hb("San Luis Obispo","D. Bush","Sr",6,23,.233,71,60,9,14,10,0,0,0,8,19,3,0,.352,.233,.585),
  hb("San Luis Obispo","A. Castrejon","Sr",7,16,.154,34,26,5,4,3,0,0,0,7,7,0,0,.333,.153,.487),
  hb("San Luis Obispo","B. Birdsong","Sr",8,23,.183,68,60,7,11,3,1,0,1,8,19,0,0,.279,.250,.529),
  hb("San Luis Obispo","C. Evans","Jr",9,18,.212,41,33,7,7,8,2,0,1,7,11,1,0,.366,.363,.730),
  hb("San Luis Obispo","T. Stephens","Jr",11,25,.316,92,79,13,25,4,6,0,1,13,11,0,0,.413,.430,.843),
  hb("San Luis Obispo","A. Naran","Sr",12,25,.260,89,77,12,20,11,3,0,2,8,7,3,1,.348,.376,.725),
  hb("San Luis Obispo","W. Isaman","Sr",13,9,.050,21,20,0,1,2,0,0,0,0,7,0,1,.048,.050,.098),
  hb("San Luis Obispo","H. Irwin","Jr",14,11,.182,12,11,0,2,4,0,0,0,0,5,0,1,.167,.181,.349),
  hb("San Luis Obispo","C. Isaacs","Jr",15,21,.206,46,34,7,7,6,1,0,0,8,12,4,0,.413,.235,.648),
  hb("San Luis Obispo","R. Klisch","Jr",16,20,.255,53,47,4,12,4,0,0,0,4,11,0,1,.308,.255,.563),
  hb("San Luis Obispo","F. Stork","So",17,9,.500,5,4,0,2,1,1,0,0,0,2,1,0,.600,.750,1.350),
  hb("San Luis Obispo","L. Drenckpohl","Fr",18,17,.148,28,27,0,4,1,0,0,0,0,4,0,0,.148,.148,.296),
  hb("San Luis Obispo","C. Johnson","Jr",19,24,.322,70,59,4,19,10,1,0,0,8,8,3,0,.429,.338,.768),
  hb("San Luis Obispo","J. Machado","Sr",20,8,.231,17,13,5,3,2,0,0,0,3,8,0,0,.375,.230,.606),
  hb("San Luis Obispo","F. Hickey","So",23,1,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("San Luis Obispo","J. Isaman","Fr",37,2,.000,4,4,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),

  // SANTA YNEZ
  hb("Santa Ynez","T. RODRIGUES","Jr",null,5,null,4,4,0,0,0,0,0,0,0,4,0,0,.000,.000,.000),
  hb("Santa Ynez","D. JOHNSON","Fr",null,1,1.000,1,1,0,1,2,0,0,0,0,0,0,0,1.000,1.000,2.000),
  hb("Santa Ynez","A. RADELFINGER","So",null,1,null,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Santa Ynez","T. STEVENS","So",null,1,null,1,1,0,0,0,0,0,0,0,1,0,0,.000,.000,.000),
  hb("Santa Ynez","D. PETERS","Sr",1,25,.237,86,76,11,18,6,5,0,0,5,24,2,1,.298,.302,.601),
  hb("Santa Ynez","D. DEFOREST","Jr",2,24,.397,81,58,12,23,11,6,0,2,14,15,7,0,.557,.603,1.160),
  hb("Santa Ynez","B. FLORES","So",3,15,.250,43,32,5,8,9,2,0,0,5,7,3,0,.400,.312,.712),
  hb("Santa Ynez","B. LOOD","Jr",4,23,.087,30,23,3,2,6,0,0,0,5,8,0,1,.241,.086,.328),
  hb("Santa Ynez","T. Koopmans","Sr",5,13,.250,5,4,0,1,0,0,0,0,1,2,0,0,.400,.250,.650),
  hb("Santa Ynez","N. OSLIN","Sr",7,19,.237,46,38,5,9,6,0,0,0,6,14,1,0,.356,.236,.593),
  hb("Santa Ynez","J. SILVA","Jr",8,13,.400,11,10,3,4,2,1,0,0,1,3,0,0,.455,.500,.955),
  hb("Santa Ynez","A. STEPHENS","Jr",10,24,.303,82,66,21,20,6,4,0,0,13,11,1,0,.425,.363,.789),
  hb("Santa Ynez","T. MINUS","So",11,20,.100,50,40,7,4,4,0,0,0,7,18,3,0,.280,.100,.380),
  hb("Santa Ynez","D. Pulido","Fr",12,2,null,2,2,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Santa Ynez","B. LOOD","Sr",15,9,null,14,11,1,0,1,0,0,0,3,7,0,0,.214,.000,.214),
  hb("Santa Ynez","N. CRANDALL","Sr",16,20,.400,66,55,4,22,12,6,0,0,9,18,2,0,.500,.509,1.009),
  hb("Santa Ynez","R. Henrey","So",19,19,.377,61,53,7,20,12,4,1,2,5,19,0,1,.424,.603,1.028),
  hb("Santa Ynez","C. CASSIDY","Sr",22,21,.434,71,53,19,23,15,4,2,0,17,16,1,0,.577,.584,1.162),
  hb("Santa Ynez","B. ALEXANDER","Sr",23,13,.111,22,18,3,2,0,1,0,0,2,7,2,0,.273,.166,.440),
  hb("Santa Ynez","S. RUIZ","Sr",24,20,.102,64,49,8,5,3,0,0,0,9,15,1,1,.250,.102,.352),
  hb("Santa Ynez","M. CABRERA","Jr",25,7,.182,15,11,5,2,1,0,0,0,4,3,0,0,.400,.181,.582),

  // ST. JOSEPH
  hb("St. Joseph","C. Ward","Sr",1,24,.229,60,48,9,11,6,6,0,0,6,16,5,1,.367,.354,.721),
  hb("St. Joseph","J. Cervantez","Jr",2,27,.309,99,81,19,25,8,1,0,0,14,14,2,0,.423,.320,.744),
  hb("St. Joseph","E. Furness","So",3,24,.321,82,78,12,25,11,6,0,2,3,16,0,1,.341,.474,.815),
  hb("St. Joseph","A. Carbajal","Jr",4,9,.333,16,15,3,5,5,2,0,0,0,4,0,1,.312,.466,.779),
  hb("St. Joseph","A. Mata","Jr",6,8,.143,17,14,1,2,2,1,0,0,2,3,0,0,.250,.214,.464),
  hb("St. Joseph","J. Stollberg","Jr",7,14,.267,34,30,6,8,1,0,0,0,1,5,2,0,.333,.266,.600),
  hb("St. Joseph","I. Ramirez","Sr",8,7,.000,4,3,1,0,0,0,0,0,1,2,0,0,.250,.000,.250),
  hb("St. Joseph","T. Winn","Jr",9,15,.167,25,24,1,4,1,1,0,0,0,4,0,0,.167,.208,.375),
  hb("St. Joseph","J. Philson","Jr",10,24,.345,67,58,9,20,6,3,2,0,3,19,2,0,.397,.465,.863),
  hb("St. Joseph","H. Hammond","Jr",11,17,.300,67,60,6,18,11,2,0,1,5,8,0,2,.343,.383,.726),
  hb("St. Joseph","O. Reynoso","Sr",12,13,.154,15,13,0,2,1,0,0,0,2,4,0,0,.267,.153,.421),
  hb("St. Joseph","D. Gomez","Sr",13,8,.167,6,6,1,1,0,0,0,0,0,2,0,0,.167,.166,.334),
  hb("St. Joseph","B. Almaguer","Sr",15,9,.500,7,6,3,3,1,0,0,0,1,0,0,0,.571,.500,1.071),
  hb("St. Joseph","J. Ferguson","Jr",17,26,.262,80,61,12,16,10,2,0,0,12,17,4,1,.410,.295,.705),
  hb("St. Joseph","J. Simkins","Sr",18,15,.375,8,8,2,3,0,0,0,0,0,3,0,0,.375,.375,.750),
  hb("St. Joseph","J. Rodriguez","So",19,29,.235,79,68,14,16,12,2,0,0,9,10,0,1,.321,.264,.586),
  hb("St. Joseph","A. Stollberg","Jr",21,24,.391,80,69,7,27,9,2,0,1,8,11,1,1,.456,.463,.920),
  hb("St. Joseph","N. Peinado","So",22,29,.329,102,85,15,28,13,3,0,0,12,12,0,1,.408,.364,.773),
  hb("St. Joseph","A. Wesner","Jr",23,9,.000,13,11,1,0,1,0,0,0,1,8,0,0,.083,.000,.083),
  hb("St. Joseph","D. Hernandez","So",24,26,.140,53,43,9,6,2,3,0,0,7,14,3,0,.302,.209,.511),
  hb("St. Joseph","J. Curiel","Jr",27,10,.200,16,15,2,3,1,0,0,0,0,4,0,0,.200,.200,.400),

  // TEMPLETON
  hb("Templeton","C. Guffey","Sr",1,16,.095,21,21,2,2,2,1,0,0,0,11,0,0,.095,.143,.238),
  hb("Templeton","M. Hamers","Jr",3,25,.341,90,82,16,28,11,1,0,0,5,14,1,0,.386,.354,.740),
  hb("Templeton","B. Mott","So",4,16,.391,32,23,3,9,2,1,0,0,8,6,1,0,.562,.435,.997),
  hb("Templeton","T. Brown","Sr",5,22,.312,63,48,11,15,10,1,0,0,11,7,3,1,.460,.333,.793),
  hb("Templeton","C. Kline","So",7,25,.297,76,64,16,19,6,2,0,0,10,16,1,0,.400,.328,.728),
  hb("Templeton","C. Dahlen","So",8,24,.220,79,59,11,13,8,2,0,0,13,8,5,1,.397,.254,.651),
  hb("Templeton","I. Thayer","Sr",10,7,.444,12,9,3,4,0,2,0,0,2,1,1,0,.583,.667,1.250),
  hb("Templeton","Q. Winkler","Jr",11,23,.214,46,42,4,9,9,1,0,0,3,12,1,0,.283,.238,.521),
  hb("Templeton","A. Raab","So",14,26,.270,96,74,14,20,10,5,0,0,14,18,6,2,.417,.338,.755),
  hb("Templeton","N. Argain","Fr",15,14,.000,1,1,0,0,0,0,0,0,0,0,0,0,.000,.000,.000),
  hb("Templeton","K. Sobyra","Jr",21,25,.264,84,72,12,19,15,1,0,0,7,13,2,3,.333,.278,.611),
  hb("Templeton","L. Stetz","Fr",24,22,.175,68,57,3,10,8,2,0,0,10,11,0,0,.299,.211,.510),
  hb("Templeton","B. Swan","So",27,22,.237,65,59,10,14,7,3,0,0,6,18,0,0,.308,.288,.596),
  hb("Templeton","I. Kirschenstein","Jr",28,14,.000,10,9,0,0,0,0,0,0,1,4,0,0,.100,.000,.100),
  hb("Templeton","E. Meyers","Jr",42,23,.408,81,76,18,31,12,1,0,0,1,14,3,0,.438,.421,.859),
  hb("Templeton","J. Riley","Sr",44,6,.000,5,4,0,0,0,0,0,0,1,3,0,0,.200,.000,.200)
  ],

  pitchers: [
  // ARROYO GRANDE
  hp("Arroyo Grande","B. Kaplan","Sr",5,5.00,1,0,"7",5,5,5,7,7,2),
  hp("Arroyo Grande","A. Lerma","Sr",7,5.48,0,0,"7.2",10,12,6,8,3,5),
  hp("Arroyo Grande","N. Wright","Jr",8,1.31,2,0,"10.2",10,3,2,5,13,3),
  hp("Arroyo Grande","B. Pinkerton","Sr",9,4.26,3,3,"49.1",52,36,30,25,54,13),
  hp("Arroyo Grande","L. Plaza","So",10,2.71,2,0,"41.1",38,27,16,22,29,10),
  hp("Arroyo Grande","D. Roppolo","Sr",11,3.82,1,0,"22",32,17,12,6,14,10),
  hp("Arroyo Grande","L. Durham","Jr",18,9.00,0,0,"2.1",1,4,3,5,3,3),
  hp("Arroyo Grande","I. Childress","So",20,null,0,0,"1.1",2,0,0,1,0,2),
  hp("Arroyo Grande","A. Granados","Jr",27,1.91,0,1,"3.2",2,1,1,3,4,4),
  hp("Arroyo Grande","T. Scrudato","Sr",68,4.63,3,2,"39.1",42,29,26,17,28,9),

  // CABRILLO
  hp("Cabrillo","B. Gregory","So",2,2.80,0,0,"5",2,2,2,0,4,1),
  hp("Cabrillo","G. Barraza","Fr",4,5.25,1,2,"12",10,10,9,12,19,7),
  hp("Cabrillo","S. Gallimore","Jr",7,2.08,11,2,"84.1",74,42,25,17,80,15),
  hp("Cabrillo","T. Kiesling","So",10,3.00,0,0,"11.2",10,8,5,9,15,8),
  hp("Cabrillo","D. Dixon","Fr",12,0.00,0,0,"1",0,0,0,0,0,2),
  hp("Cabrillo","J. Low","Fr",13,0.00,0,0,"0.1",0,0,0,1,1,2),
  hp("Cabrillo","G. Mattis","Jr",15,1.13,11,2,"93",63,25,15,25,106,15),
  hp("Cabrillo","L. Mabery","Jr",17,5.83,1,0,"6",6,5,5,4,7,4),

  // MISSION COLLEGE PREP
  hp("Mission College Prep","D. Luera","",null,3.62,0,2,"19.1",22,10,10,10,25,9),
  hp("Mission College Prep","M. Luera","",null,0.00,0,0,"1",1,0,0,0,3,1),
  hp("Mission College Prep","B. Warwick","",null,2.62,0,0,"8",7,4,3,3,6,5),
  hp("Mission College Prep","T. Jepsen","",1,0.00,0,0,"1",0,0,0,0,0,1),
  hp("Mission College Prep","T. Glenn","",2,14.00,0,0,"2",3,4,4,2,3,2),
  hp("Mission College Prep","N. Bender","",5,4.15,1,1,"30.1",33,26,18,21,28,12),
  hp("Mission College Prep","J. Miles","",8,3.94,1,1,"10.2",11,9,6,4,12,6),
  hp("Mission College Prep","I. Townsend","",11,21.00,0,0,"0.1",3,5,1,1,0,1),
  hp("Mission College Prep","B. Sweeney","",12,2.55,3,0,"35.2",34,18,13,11,21,12),
  hp("Mission College Prep","S. Broyles","",16,0.68,1,0,"10.1",6,1,1,5,7,5),
  hp("Mission College Prep","J. Clipperton","",23,null,0,0,"0",0,0,0,0,0,1),
  hp("Mission College Prep","K. Hickman","",27,null,0,0,"0",0,0,0,0,0,1),
  hp("Mission College Prep","A. Clayton","",28,0.50,1,0,"14",8,6,1,3,13,8),
  hp("Mission College Prep","C. Christiansen","",34,4.85,2,0,"47.2",63,53,33,25,39,14),
  hp("Mission College Prep","S. Rivas","",35,null,0,0,"0",0,0,0,0,0,1),

  // MORRO BAY
  hp("Morro Bay","C. Franklin","",null,0.00,0,0,"0.2",0,0,0,0,0,1),
  hp("Morro Bay","J. Botello","",2,0.00,0,0,"1",1,1,0,0,0,2),
  hp("Morro Bay","G. Paul","",3,3.16,2,4,"44.1",40,36,20,24,49,11),
  hp("Morro Bay","C. Wilkinson","",5,null,0,0,"0",0,0,0,0,0,1),
  hp("Morro Bay","T. White","",7,4.44,3,2,"34.2",46,43,22,19,19,13),
  hp("Morro Bay","C. Waldon","",9,21.00,0,0,"0.2",2,2,2,1,0,1),
  hp("Morro Bay","A. Hunt","",10,15.17,1,1,"6",9,13,13,8,5,4),
  hp("Morro Bay","T. Taylor","",11,null,0,0,"0",0,0,0,0,0,1),
  hp("Morro Bay","E. Wilson","",17,5.25,0,2,"17.1",24,25,13,8,19,7),
  hp("Morro Bay","B. Bond","",18,2.10,0,0,"3.1",2,3,1,3,2,3),
  hp("Morro Bay","A. Sibley","",19,1.75,1,0,"4",5,1,1,1,2,1),
  hp("Morro Bay","R. Zust","",21,0.00,0,0,"0.1",0,0,0,1,0,1),
  hp("Morro Bay","J. Skaggs","",22,4.73,4,0,"23.2",20,20,16,19,28,10),

  // NIPOMO
  hp("Nipomo","R. Barr","So",null,28.00,0,0,"1",2,4,4,3,1,1),
  hp("Nipomo","C. Millhollon","Fr",null,0.00,1,0,"5",5,1,0,5,6,4),
  hp("Nipomo","G. Rodriguez","Fr",null,3.79,0,0,"20.1",23,19,11,12,25,7),
  hp("Nipomo","E. Silveira","Fr",null,13.59,0,0,"5.2",10,17,11,10,7,5),
  hp("Nipomo","E. Silveira","Fr",null,11.20,0,0,"10",10,22,16,13,9,8),
  hp("Nipomo","D. Hill","So",1,7.00,0,0,"29",49,34,29,8,21,10),
  hp("Nipomo","L. Alley","Sr",2,42.00,0,0,"1",4,6,6,2,0,1),
  hp("Nipomo","T. Puckett","Jr",3,0.00,0,0,"1",0,0,0,0,2,1),
  hp("Nipomo","A. Willis","So",5,3.87,0,0,"25.1",29,25,14,16,22,7),
  hp("Nipomo","A. Jones","Jr",7,14.00,0,0,"3",6,6,6,4,4,4),
  hp("Nipomo","H. Wooldridge","Sr",8,3.03,1,0,"30",29,20,13,5,30,6),
  hp("Nipomo","O. Ortega","So",9,42.00,0,0,"1",5,6,6,3,0,1),
  hp("Nipomo","E. Hillier","So",11,4.75,0,0,"17.2",17,15,12,11,12,12),
  hp("Nipomo","A. Juarez","Sr",12,3.13,1,0,"15.2",14,10,7,5,16,4),
  hp("Nipomo","J. Rocha","Jr",13,null,0,0,"0",0,0,0,0,0,2),

  // PIONEER VALLEY
  hp("Pioneer Valley","A. Angulo","So",1,1.81,9,1,"62",52,24,16,21,49,13),
  hp("Pioneer Valley","A. Morales","Sr",3,8.40,0,0,"5",15,10,6,1,1,4),
  hp("Pioneer Valley","Z. Saucedo","Jr",4,1.45,0,0,"9.2",11,7,2,7,6,4),
  hp("Pioneer Valley","J. Diaz-Resendez","Jr",5,0.00,0,0,"4.1",1,2,0,3,3,3),
  hp("Pioneer Valley","A. Garcia","Jr",7,2.58,3,1,"19",12,10,7,17,21,8),
  hp("Pioneer Valley","J. Garcia","Jr",12,0.00,2,0,"9",4,1,0,1,15,8),
  hp("Pioneer Valley","A. Sandoval","Jr",13,7.00,0,0,"4",5,6,4,6,5,1),
  hp("Pioneer Valley","E. Estrada","Sr",17,8.40,0,0,"3.1",2,4,4,2,2,2),
  hp("Pioneer Valley","E. Fonseca","Sr",19,4.28,4,5,"55.2",80,51,34,13,53,11),

  // RIGHETTI
  hp("Righetti","J. McMillan","So",3,0.00,1,0,"3",1,0,0,2,4,1),
  hp("Righetti","C. Cummins","Jr",7,5.25,0,1,"2.2",1,4,2,1,2,2),
  hp("Righetti","C. Cuccia","Jr",8,3.20,4,0,"30.2",14,15,14,27,32,8),
  hp("Righetti","G. Moralez","Jr",22,1.58,3,2,"35.1",32,11,8,13,38,14),
  hp("Righetti","A. Robles","Sr",23,1.00,11,0,"84",48,13,12,21,88,14),
  hp("Righetti","R. Smith","Sr",24,2.96,1,4,"26",21,22,11,25,18,10),
  hp("Righetti","R. Bassett","So",27,4.12,2,1,"18.2",18,13,11,8,28,8),
  hp("Righetti","N. Farris","So",28,0.00,0,0,"1",0,0,0,2,0,1),
  hp("Righetti","T. Reid","Jr",42,33.60,0,0,"1.2",3,9,8,6,2,2),

  // SAN LUIS OBISPO
  hp("San Luis Obispo","O. Wells","Sr",3,0.00,0,0,"1.2",0,0,0,1,1,1),
  hp("San Luis Obispo","B. Birdsong","Sr",8,4.20,2,3,"20",25,17,12,15,14,8),
  hp("San Luis Obispo","C. Evans","Jr",9,3.75,0,2,"18.2",19,12,10,16,17,10),
  hp("San Luis Obispo","T. Stephens","Jr",11,2.71,3,0,"41.1",51,25,16,10,32,10),
  hp("San Luis Obispo","A. Naran","Sr",12,2.44,7,3,"57.1",52,29,20,16,52,11),
  hp("San Luis Obispo","W. Isaman","Sr",13,63.00,0,0,"0.1",2,3,3,2,0,1),
  hp("San Luis Obispo","H. Irwin","Jr",14,5.25,0,1,"9.1",17,14,7,7,4,7),
  hp("San Luis Obispo","F. Stork","So",17,1.94,0,1,"18",13,10,5,11,18,9),
  hp("San Luis Obispo","C. Johnson","Jr",19,null,0,0,"0",0,0,0,0,0,1),
  hp("San Luis Obispo","J. Isaman","Fr",37,0.00,0,0,"1",1,0,0,0,0,1),
  hp("San Luis Obispo","K. Toole","So",47,0.00,0,0,"2.1",2,0,0,1,1,2),

  // SANTA YNEZ
  hp("Santa Ynez","D. PETERS","Sr",1,null,0,0,"3",3,1,0,2,0,1),
  hp("Santa Ynez","T. Koopmans","Sr",5,5.95,0,0,"20",21,21,17,17,12,12),
  hp("Santa Ynez","N. OSLIN","Sr",7,21.00,0,1,"3.1",7,12,10,7,4,3),
  hp("Santa Ynez","A. STEPHENS","Jr",10,11.74,0,2,"11.1",17,24,19,11,9,6),
  hp("Santa Ynez","T. MINUS","So",11,4.57,3,6,"46",62,46,30,31,34,14),
  hp("Santa Ynez","R. Henrey","So",19,2.82,0,2,"22.1",24,16,9,12,20,7),
  hp("Santa Ynez","C. CASSIDY","Sr",22,5.16,2,6,"38",36,40,28,32,35,9),
  hp("Santa Ynez","B. ALEXANDER","Sr",23,4.20,1,0,"13.1",11,11,8,4,13,6),

  // ST. JOSEPH
  hp("St. Joseph","J. Cervantez","Jr",2,2.86,3,2,"22",19,14,9,13,11,8),
  hp("St. Joseph","E. Furness","So",3,null,0,0,"0",2,2,2,2,0,1),
  hp("St. Joseph","H. Hammond","Jr",11,2.42,4,2,"34.2",36,15,12,11,29,10),
  hp("St. Joseph","O. Reynoso","Sr",12,0.55,5,0,"63.1",37,12,5,21,81,10),
  hp("St. Joseph","D. Gomez","Sr",13,8.84,0,2,"6.1",8,10,8,8,4,5),
  hp("St. Joseph","B. Almaguer","Sr",15,21.00,0,0,"1",0,3,3,4,0,1),
  hp("St. Joseph","J. Simkins","Sr",18,null,0,0,"0",0,0,0,0,0,1),
  hp("St. Joseph","D. Freitas","Sr",19,7.00,0,0,"3",5,3,3,4,1,4),
  hp("St. Joseph","J. Rodriguez","So",19,16.50,0,1,"4.2",12,14,11,6,1,3),
  hp("St. Joseph","N. Peinado","So",22,2.71,3,3,"54.1",47,22,21,28,64,11),
  hp("St. Joseph","D. Hernandez","So",24,21.00,0,0,"1",3,3,3,0,0,1),
  hp("St. Joseph","A. Eaker","Sr",25,5.02,1,0,"15.1",14,12,11,12,9,6),

  // TEMPLETON
  hp("Templeton","L. Olsen","Fr",null,0.00,1,0,"4",3,0,0,1,1,1),
  hp("Templeton","I. Regalado","So",null,7.00,0,0,"2",3,0,2,1,0,1),
  hp("Templeton","C. Guffey","Sr",1,null,0,0,"0",0,0,0,0,0,1),
  hp("Templeton","T. Brown","Sr",5,4.15,2,6,"52.1",62,64,31,20,38,14),
  hp("Templeton","C. Kline","So",7,9.69,0,0,"4.1",7,7,6,3,4,4),
  hp("Templeton","C. Dahlen","So",8,null,0,0,"0",0,0,0,0,0,1),
  hp("Templeton","Q. Winkler","Jr",11,4.50,2,6,"51.1",33,47,33,64,86,12),
  hp("Templeton","N. Argain","Fr",15,3.68,2,2,"40",47,41,21,18,35,12),
  hp("Templeton","K. Sobyra","Jr",21,2.62,1,0,"2.2",1,2,1,6,0,1),
  hp("Templeton","B. Swan","So",27,15.27,0,1,"7.1",13,16,16,11,4,5),
  hp("Templeton","I. Kirschenstein","Jr",28,12.60,0,0,"5",7,11,9,12,3,5)
  ],

  /* Printed pitching season totals. [IP,H,R,ER,BB,K] */
  printedPitchTotals: {
    "Arroyo Grande":["184.2", 194, 134, 101, 99, 155],
    "Cabrillo":["213.1", 165, 91, 61, 68, 232],
    "Mission College Prep":["180.1", 191, 139, 89, 86, 157],
    "Morro Bay":["136", 149, 145, 87, 84, 124],
    "Nipomo":["166.2", 206, 186, 136, 98, 155],
    "Pioneer Valley":["172", 182, 115, 73, 71, 155],
    "Righetti":["203", 138, 87, 66, 105, 212],
    "San Luis Obispo":["170", 182, 111, 71, 79, 139],
    "Santa Ynez":["157.1", 181, 171, 121, 116, 127],
    "St. Joseph":["205.2", 183, 110, 88, 109, 200],
    "Templeton":["169", 176, 188, 119, 136, 171]
  }
}

}; // end HISTORY

/* ============================================================================
   API
   ============================================================================ */
const HIST = (function () {

  function ipToF(ip) {
    if (ip === null || ip === undefined) return 0;
    const s = ip.toString();
    if (!s.includes('.')) return parseFloat(s) || 0;
    const [w, f] = s.split('.');
    const wh = parseFloat(w) || 0;
    if (f === '1') return wh + 1 / 3;
    if (f === '2') return wh + 2 / 3;
    return parseFloat(s) || 0;
  }

  // "C. White-3" -> "C. White". Duplicate-name rows carry a jersey suffix.
  const baseName = n => (n || '').replace(/-\d+$/, '');

  /* Advance a class year by n seasons. Returns null past Sr or for a blank
     year, which is the signal that the class-year resolver cannot be used. */
  const CLASS_ORDER = ['Fr', 'So', 'Jr', 'Sr'];
  function stepYear(y, n) {
    const i = CLASS_ORDER.indexOf(y);
    if (i < 0) return null;
    const j = i + (n || 1);
    return j < CLASS_ORDER.length ? CLASS_ORDER[j] : null;
  }

  let _applied = false;
  function applyBackfill() {
    if (_applied) return;
    _applied = true;
    Object.entries(HISTORY).forEach(([key, S]) => {
      const map = (YEAR_BACKFILL[key]) || {};
      [...S.batters, ...S.pitchers].forEach(p => {
        if (p.year) { p.yearSource = 'listed'; return; }
        const inferred = (map[p.team] || {})[p.name];
        if (inferred) { p.year = inferred; p.yearSource = 'inferred'; }
        else { p.yearSource = 'unknown'; }
      });
    });
  }

  const seasons = () => { applyBackfill(); return Object.keys(HISTORY).sort(); };
  const season = k => { applyBackfill(); return HISTORY[k]; };

  /* League baselines for one season, computed from that season's own rows.
     Deliberately NOT cached across seasons: the constants drift. */
  function constants(key) {
    const S = season(key); if (!S) return null;
    const sum = (a, f) => a.reduce((t, x) => t + (x[f] || 0), 0);
    const B = S.batters, P = S.pitchers;
    const pa = sum(B, 'pa'), ab = sum(B, 'ab'), h = sum(B, 'h'), bb = sum(B, 'bb');
    const hbp = sum(B, 'hbp'), sf = sum(B, 'sf'), r = sum(B, 'r'), k = sum(B, 'k');
    const d = sum(B, 'doubles'), t = sum(B, 'triples'), hr = sum(B, 'hr');
    const singles = h - d - t - hr;
    const wobaDen = ab + bb + sf + hbp;
    const ip = P.reduce((a, x) => a + ipToF(x.ip), 0);
    const er = sum(P, 'er'), pk = sum(P, 'k'), pbb = sum(P, 'bb'), ph = sum(P, 'h');
    return {
      season: key, PA: pa, AB: ab, IP: Math.round(ip * 10) / 10,
      AVG: ab ? h / ab : 0,
      OBP: pa ? (h + bb + hbp) / pa : 0,
      /* Weights are deliberately IDENTICAL to the ones in data.js
         (wBB .69, wHBP .72, w1B .88, w2B 1.24, w3B 1.56, wHR 2.00). They were
         previously .89/1.27/1.62/2.10 here, which put 2026 wOBA at .360 under
         this file and .355 under data.js for the same rows. If data.js ever
         changes its weights, change them here in the same commit. */
      wOBA: wobaDen ? (0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * d +
                       1.56 * t + 2.00 * hr) / wobaDen : 0,
      R_PA: pa ? r / pa : 0,
      BB_pct: pa ? bb / pa : 0,
      K_pct: pa ? k / pa : 0,
      ERA: ip ? (er * 7) / ip : 0,   // 7-inning high school game
      K9: ip ? (pk * 9) / ip : 0,
      WHIP: ip ? (pbb + ph) / ip : 0
    };
  }

  /* Convert a rate stat from one season's run environment to another's.
     Use for cross-season leaderboards; a 2025 wRC+ and a 2026 wRC+ are not
     directly comparable, since league R/PA moved ~4% in a single year. */
  function eraAdjust(value, fromSeason, toSeason, metric) {
    const a = constants(fromSeason), b = constants(toSeason);
    if (!a || !b || value === null || value === undefined) return null;
    const m = metric || 'R_PA';
    if (!a[m]) return value;
    return value * (b[m] / a[m]);
  }

  /* Matched player-seasons between two datasets, for aging curves and
     year-over-year reliability. `next` may be another HISTORY key OR an
     external array of the same shape (e.g. data.js `batters`).

     NOTE ON BIAS: this only sees players who appear in BOTH seasons. Players
     who regressed and lost playing time drop out, so a naive average of the
     deltas will overstate growth. Report `droppedOut` alongside any curve.

     Returns four buckets. `pairs` are confident matches. `droppedOut` did not
     clear minB in the later season. `ambiguous` share a name with a teammate
     and could not be resolved by jersey number, so they are deliberately NOT
     paired rather than guessed at; check that list before trusting a curve.
     `matchRate` counts pairs only. Each pair carries `resolvedBy`: 'name' when
     the name was unique on the roster, 'num' when a jersey number broke a tie,
     'class' when class year did. Pass `gap` when the two datasets are more than
     one season apart, so the class-year resolver advances the right distance. */
  function matchedPairs(fromKey, next, opts) {
    const o = Object.assign({ kind: 'bat', minA: 25, minB: 25, gap: 1 }, opts || {});
    const S = season(fromKey); if (!S) return null;
    const A = o.kind === 'bat' ? S.batters : S.pitchers;
    const B = Array.isArray(next)
      ? next
      : (o.kind === 'bat' ? season(next).batters : season(next).pitchers);
    const size = p => o.kind === 'bat' ? (p.pa || 0) : ipToF(p.ip);
    const pool = A.filter(p => size(p) >= o.minA);
    const pairs = [], droppedOut = [], ambiguous = [];

    pool.forEach(p => {
      /* Candidates are same team, same base name. Matching on base name ALONE
         is wrong: Morro Bay carried two F. Ainley and two E. Davis, Santa Maria
         two J. Medina, Lompoc two B. Bailey. Array.find would return whichever
         appeared first in the array and silently pair the wrong player. That is
         what `num` is stored for. */
      const cands = B.filter(x => x.team === p.team &&
                                  baseName(x.name) === baseName(p.name));
      let hit = null, how = 'name';
      if (cands.length === 1) {
        /* Unique name on the roster. Accept regardless of jersey number, since
           numbers do change between seasons. */
        hit = cands[0];
      } else if (cands.length > 1) {
        /* Duplicate name. A jersey match is the trustworthy resolver. */
        const byNum = cands.filter(x => x.num != null && p.num != null &&
                                        x.num === p.num);
        if (byNum.length === 1) { hit = byNum[0]; how = 'num'; }
        else {
          /* Fallback: class year. Two same-named teammates are usually in
             different classes, and a player `gap` seasons later should be
             exactly `gap` classes further along. Only accepted when it picks
             out exactly one candidate, and never when the source year was
             inferred rather than listed, since an inferred year would be
             reasoning in a circle. */
          const want = stepYear(p.year, o.gap);
          const byClass = (want && p.yearSource !== 'inferred')
            ? cands.filter(x => x.year === want) : [];
          if (byClass.length === 1) { hit = byClass[0]; how = 'class'; }
          else { ambiguous.push({ player: p, candidates: cands }); return; }
        }
      }
      if (hit && size(hit) >= o.minB) pairs.push({ from: p, to: hit, resolvedBy: how });
      else droppedOut.push(p);
    });

    return { pairs, droppedOut, ambiguous, poolSize: pool.length,
             matchRate: pool.length ? pairs.length / pool.length : 0,
             ambiguousRate: pool.length ? ambiguous.length / pool.length : 0 };
  }

  /* Reconcile every itemised row against the printed team totals, which is
     how missing players get caught. MaxPreps sometimes omits rows from its
     own listing while the season total still counts them. */
  function audit(key) {
    const keys = key ? [key] : seasons();
    keys.forEach(k => {
      const S = season(k);
      console.log('\n=== ' + k + ' ===');
      const fields = ['pa', 'ab', 'r', 'h', 'bb', 'k'];
      /* Some MaxPreps pages print a Season Totals row that does not describe the
         season at all (Atascadero 2023-24 prints 310 PA against 995 itemised).
         Reconciling against those is noise, so they are skipped and named. */
      const corrupt = (S.quality && S.quality._printedTotalsCorrupt) || [];
      let worst = 1;
      S.teams.forEach(t => {
        const rows = S.batters.filter(b => b.team === t.name);
        const printed = S.printedTotals[t.name];
        if (!printed) return console.log('  ' + t.name + ': no printed totals');
        if (corrupt.indexOf(t.name) >= 0)
          return console.log('  ' + t.name.padEnd(22) +
            '   n/a  printed Season Totals row is corrupt; see quality');
        const got = fields.map(f => rows.reduce((a, b) => a + (b[f] || 0), 0));
        const pct = printed[0] ? got[0] / printed[0] : 0;
        worst = Math.min(worst, pct);
        const diffs = fields.map((f, i) => got[i] === printed[i] ? null :
          f.toUpperCase() + ' ' + (got[i] - printed[i] > 0 ? '+' : '') + (got[i] - printed[i]))
          .filter(Boolean);
        const inf = rows.filter(r => r.yearSource === 'inferred').length;
        const unk = rows.filter(r => r.yearSource === 'unknown').length;
        const yrNote = (inf || unk)
          ? (inf ? inf + ' yr inferred' : '') + (inf && unk ? ', ' : '') +
            (unk ? unk + ' yr unknown' : '') + '  '
          : '';
        console.log('  ' + t.name.padEnd(22) + (pct * 100).toFixed(1).padStart(6) + '% of PA  ' +
          yrNote.padEnd(30) + (diffs.length ? 'diff: ' + diffs.join(' ') : 'exact'));
      });
      /* Pitching side. printedPitchTotals exists for exactly this and was
         previously going unread, which hid the fact that Morro Bay is missing
         a larger share of its innings than of its plate appearances. */
      console.log('  -- pitching');
      const pf = ['h', 'r', 'er', 'bb', 'k'];
      let worstP = 1, itemIP = 0, printIP = 0;
      S.teams.forEach(t => {
        const rows = S.pitchers.filter(p => p.team === t.name);
        const printed = S.printedPitchTotals && S.printedPitchTotals[t.name];
        if (!printed) return console.log('  ' + t.name + ': no printed pitching totals');
        if (corrupt.indexOf(t.name) >= 0)
          return console.log('  ' + t.name.padEnd(22) +
            '   n/a  printed Season Totals row is corrupt; see quality');
        const ip = rows.reduce((a, p) => a + ipToF(p.ip), 0);
        const pip = ipToF(printed[0]);
        itemIP += ip; printIP += pip;
        const pct = pip ? ip / pip : 0;
        worstP = Math.min(worstP, pct);
        const got = pf.map(f => rows.reduce((a, p) => a + (p[f] || 0), 0));
        const diffs = [];
        if (Math.abs(ip - pip) > 0.05)
          diffs.push('IP ' + (ip - pip > 0 ? '+' : '') + (ip - pip).toFixed(1));
        pf.forEach((f, i) => {
          if (got[i] !== printed[i + 1])
            diffs.push(f.toUpperCase() + ' ' +
              (got[i] - printed[i + 1] > 0 ? '+' : '') + (got[i] - printed[i + 1]));
        });
        console.log('  ' + t.name.padEnd(22) + (pct * 100).toFixed(1).padStart(6) +
          '% of IP  ' + ''.padEnd(30) + (diffs.length ? 'diff: ' + diffs.join(' ') : 'exact'));
      });

      const c = constants(k);
      console.log('  --');
      console.log('  league: AVG ' + c.AVG.toFixed(3) + '  wOBA ' + c.wOBA.toFixed(3) +
        '  R/PA ' + c.R_PA.toFixed(3) + '  BB% ' + (100 * c.BB_pct).toFixed(1) +
        '  K% ' + (100 * c.K_pct).toFixed(1) + '  ERA ' + c.ERA.toFixed(2) +
        ' (ER*7/IP)');
      console.log('  worst batting completeness:  ' + (worst * 100).toFixed(1) + '%');
      console.log('  worst pitching completeness: ' + (worstP * 100).toFixed(1) + '%');
      console.log('  itemised IP ' + itemIP.toFixed(1) + ' of printed ' +
        printIP.toFixed(1) + ' (' + (100 * itemIP / printIP).toFixed(1) + '%)');
    });
  }

  return { seasons, season, constants, eraAdjust, matchedPairs, audit, ipToF, baseName };
})();

if (typeof module !== 'undefined' && module.exports)
  module.exports = { HISTORY, HIST, YEAR_BACKFILL, hb, hp };
