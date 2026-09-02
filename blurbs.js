/* ============================================================
   CCAA BASEBALL STATS — PLAYER BLURBS
   ------------------------------------------------------------
   Deterministic, rule-based 3-4 sentence summaries generated
   from each player's stat line. No API, no network, no build
   step. Runs client-side off the same `batters` / `pitchers`
   arrays that data.js already exposes.

   DESIGN RULES (these players are minors on a public site):
   ---------------------------------------------------------
   1. Never use an evaluative adjective about the PERSON.
      Describe the number, not the kid.
   2. Every blurb must contain at least one genuine positive.
      The skill picker always finds the player's relatively
      strongest attribute; if nothing clears the 55th
      percentile it falls back to neutral, factual framing
      (role, reps, counting stats, class year).
   3. Below-average lines are described in neutral quantitative
      language and closed with a forward-looking sentence.
   4. Small samples get sample-size framing, never judgment.
   5. No leaderboard shaming. A player is never described by
      where he finished from the bottom.
   6. BANNED VOCABULARY (enforced by test harness):
      struggled, poor, bad, weak, liability, worst, failed,
      disappointing, dreadful, awful, hurt the team, punchless,
      overmatched, exposed, hopeless, brutal, ugly, woeful,
      inept, useless, bottom of the league.

   USAGE
   -----
   <script src="data.js"></script>
   <script src="blurbs.js"></script>
   ...
   BLURB.init(batters, pitchers);            // once, after data.js
   BLURB.forPlayer(batterObjOrNull, pitcherObjOrNull);  // -> string
   ============================================================ */

const BLURB = (function () {

  let _ctx = null;

  /* ---------- helpers ---------------------------------------- */

  // '38.1' = 38 1/3 IP, '38.2' = 38 2/3 IP (baseball notation)
  function ipF(ip) {
    if (ip === null || ip === undefined) return 0;
    const s = ip.toString();
    if (!s.includes('.')) return parseFloat(s) || 0;
    const [w, f] = s.split('.');
    const whole = parseFloat(w) || 0;
    if (f === '1') return whole + 1 / 3;
    if (f === '2') return whole + 2 / 3;
    return parseFloat(s) || 0;
  }

  const f3 = v => (v === null || v === undefined || isNaN(v))
    ? '—' : v.toFixed(3).replace(/^0\./, '.');
  const f2 = v => (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(2);
  const f1 = v => (v === null || v === undefined || isNaN(v)) ? '—' : v.toFixed(1);
  const pl = (n, s, p) => n === 1 ? s : (p || s + 's');

  // 'a 4.2 BB/9' vs 'an 8.3 BB/9' / 'an 18.6% walk rate'
  function aan(numStr) {
    const d = numStr.toString().replace(/[^0-9.]/g, '');
    if (d.startsWith('8')) return 'an';
    if (d.startsWith('11') || d.startsWith('18')) return 'an';
    return 'a';
  }
  // +0 / -0 WAR reads badly; say what it means instead.
  function warPhrase(v, tm, kind) {
    if (v === null || v === undefined) return null;
    if (Math.abs(v) < 0.05)
      return `On the whole that landed right around replacement level for ${tm}.`;
    const sign = v > 0 ? '+' : '';
    return v >= 0.5
      ? `That was worth roughly ${sign}${v} ${kind} WAR to ${tm}.`
      : `All told it came out to about ${sign}${v} ${kind} WAR on the season.`;
  }

  // Percentile of v within a pre-sorted ascending numeric array (0..1)
  function pctile(sorted, v) {
    if (!sorted.length || v === null || v === undefined || isNaN(v)) return null;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return lo / sorted.length;
  }

  // Stable hash so a given player always gets the same phrasing variant,
  // but a roster page doesn't read like the same sentence 14 times.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  }
  function pick(arr, seed) { return arr[hash(seed) % arr.length]; }

  function yearInfo(year) {
    const y = (year || '').trim();
    if (y === 'Fr') return { word: 'freshman', left: 3, under: true };
    if (y === 'So') return { word: 'sophomore', left: 2, under: true };
    if (y === 'Jr') return { word: 'junior', left: 1, under: false };
    if (y === 'Sr') return { word: 'senior', left: 0, under: false };
    return { word: null, left: null, under: false };
  }

  /* ---------- league context --------------------------------- */

  function init(batters, pitchers) {
    const QB = 30;   // PA to enter the hitting reference pool
    const QP = 18;   // IP to enter the pitching reference pool

    const bq = batters.filter(b => (b.pa || 0) >= QB);
    const pq = pitchers.filter(p => ipF(p.ip) >= QP);

    const sortNum = a => a.filter(v => v !== null && v !== undefined && !isNaN(v))
      .sort((x, y) => x - y);

    const iso = b => (b.slg != null && b.avg != null) ? b.slg - b.avg : null;
    const kRate = b => (b.pa > 0) ? b.k / b.pa : null;
    const bbRate = b => (b.pa > 0) ? b.bb / b.pa : null;
    const bb9 = p => { const i = ipF(p.ip); return i > 0 ? (p.bb * 9) / i : null; };

    const babips = sortNum(bq.map(b => b.babip));

    _ctx = {
      QB, QP,
      b: {
        iso: sortNum(bq.map(iso)),
        contact: sortNum(bq.map(b => { const k = kRate(b); return k === null ? null : 1 - k; })),
        bbRate: sortNum(bq.map(bbRate)),
        obp: sortNum(bq.map(b => b.obp)),
        babip: babips,
        babipMed: babips.length ? babips[Math.floor(babips.length / 2)] : 0.330,
        get: { iso, kRate, bbRate }
      },
      p: {
        k9: sortNum(pq.map(x => x.k9)),
        kbb: sortNum(pq.map(x => x.kbb)),
        ctrl: sortNum(pq.map(x => { const v = bb9(x); return v === null ? null : -v; })), // higher = better
        whip: sortNum(pq.map(x => (x.whip === null ? null : -x.whip))),                    // higher = better
        get: { bb9 }
      }
    };
    return _ctx;
  }

  /* ---------- batters ---------------------------------------- */

  function forBatter(b, alsoPitches) {
    if (!_ctx) return '';
    const nm = b.name, tm = b.team, pa = b.pa || 0, gp = b.gp || 0;
    const yi = yearInfo(b.year);
    const w = b.wrc_plus;
    const S = [];
    const seed = nm + tm + pa;

    /* --- TIER 3: too few PA to evaluate --------------------- */
    if (pa < 12) {
      S.push(`${nm} saw limited time in the ${tm} lineup this spring, appearing in ${gp} ${pl(gp, 'game')} and taking ${pa} ${pl(pa, 'plate appearance')}.`);
      if (b.h > 0 && b.bb > 0)
        S.push(`He picked up ${b.h} ${pl(b.h, 'hit')} and drew ${b.bb} ${pl(b.bb, 'walk')} in that window.`);
      else if (b.h > 0)
        S.push(`He picked up ${b.h} ${pl(b.h, 'hit')} in that window.`);
      else if (b.bb > 0)
        S.push(`He reached base on ${b.bb} ${pl(b.bb, 'walk')} in that window.`);
      else
        S.push(`The sample is far too small for any of his rate stats to carry meaning.`);
      S.push(`At this workload the numbers describe opportunity rather than ability.`);
      S.push(yi.under
        ? `As a ${yi.word} he has time to turn those reps into a larger role.`
        : `A bigger sample would give a much clearer read on what he can do.`);
      return S.join(' ');
    }

    const partial = pa < _ctx.QB;
    let usedGames = false;

    /* --- S1: headline -------------------------------------- */
    if (w === null || w === undefined) {
      S.push(`${nm} logged ${pa} ${pl(pa, 'plate appearance')} over ${gp} ${pl(gp, 'game')} for ${tm}.`);
    } else if (w >= 160) {
      S.push(pick([
        `${nm} was one of the most productive hitters in the CCAA this spring, posting a ${w} wRC+ with a ${f3(b.woba)} wOBA over ${pa} ${pl(pa, 'plate appearance')}.`,
        `${nm} put together one of the conference's best offensive seasons, running a ${w} wRC+ and a ${f3(b.woba)} wOBA across ${pa} ${pl(pa, 'plate appearance')}.`
      ], seed));
    } else if (w >= 135) {
      S.push(pick([
        `${nm} was a high-end offensive contributor for ${tm}, finishing at a ${w} wRC+ over ${pa} ${pl(pa, 'plate appearance')}.`,
        `${nm} hit at a well above-average clip for ${tm}, posting a ${w} wRC+ in ${pa} ${pl(pa, 'plate appearance')}.`
      ], seed));
    } else if (w >= 115) {
      S.push(pick([
        `${nm} was a clearly above-average bat in the ${tm} lineup, finishing with a ${w} wRC+ across ${pa} ${pl(pa, 'plate appearance')}.`,
        `${nm} produced above the CCAA baseline this spring, running a ${w} wRC+ over ${pa} ${pl(pa, 'plate appearance')}.`
      ], seed));
    } else if (w >= 100) {
      S.push(`${nm} was a steady, slightly above-average contributor for ${tm}, posting a ${w} wRC+ in ${pa} ${pl(pa, 'plate appearance')}.`);
    } else if (w >= 88) {
      S.push(`${nm} produced right around the CCAA average this spring, finishing with a ${w} wRC+ over ${pa} ${pl(pa, 'plate appearance')}.`);
    } else if (w >= 72) {
      usedGames = true;
      S.push(`${nm} held a regular spot in the ${tm} lineup, taking ${pa} ${pl(pa, 'plate appearance')} across ${gp} ${pl(gp, 'game')} and finishing at a ${w} wRC+.`);
    } else {
      usedGames = true;
      S.push(`${nm} took ${pa} ${pl(pa, 'plate appearance')} over ${gp} ${pl(gp, 'game')} for ${tm} this spring.`);
    }

    /* --- S2: strongest attribute ---------------------------- */
    const iso = _ctx.b.get.iso(b);
    const kR = _ctx.b.get.kRate(b);
    const bbR = _ctx.b.get.bbRate(b);

    const skills = [
      { k: 'power', p: pctile(_ctx.b.iso, iso), v: iso },
      { k: 'contact', p: kR === null ? null : pctile(_ctx.b.contact, 1 - kR), v: kR },
      { k: 'eye', p: pctile(_ctx.b.bbRate, bbR), v: bbR },
      { k: 'onbase', p: pctile(_ctx.b.obp, b.obp), v: b.obp }
    ].filter(s => s.p !== null).sort((a, b2) => b2.p - a.p);

    const top = skills[0];
    if (top && top.p >= 0.55) {
      if (top.k === 'power') {
        const xb = (b.doubles || 0) + (b.triples || 0) + (b.hr || 0);
        S.push(`His best trait was the extra-base pop, with ${xb} extra-base ${pl(xb, 'hit')} and a ${f3(iso)} isolated power mark that ranked among the better figures in the qualified pool.`);
      } else if (top.k === 'contact') {
        S.push(`He was one of the tougher hitters in the conference to strike out, going down on strikes in just ${(kR * 100).toFixed(1)}% of his trips to the plate.`);
      } else if (top.k === 'eye') {
        const bbPct = (bbR * 100).toFixed(1);
        S.push(`The strongest part of his profile was the plate discipline, drawing ${b.bb} ${pl(b.bb, 'walk')} for ${aan(bbPct)} ${bbPct}% walk rate and a ${f2(b.bbk)} BB/K.`);
      } else {
        S.push(`His calling card was getting on base, reaching at a ${f3(b.obp)} clip against a ${f3(b.avg)} average.`);
      }
    } else {
      // Nothing clears the bar — stay factual and neutral, and don't repeat
      // the games/PA framing if sentence one already used it.
      const opts = [];
      if (b.r > 0 && b.rbi > 0)
        opts.push(`He came around to score ${b.r} ${pl(b.r, 'run')} and drove in ${b.rbi} across the season.`);
      if (b.r > 0)
        opts.push(`He crossed the plate ${b.r} ${pl(b.r, 'time')} out of the ${tm} lineup.`);
      if (b.rbi > 0)
        opts.push(`He knocked in ${b.rbi} ${pl(b.rbi, 'run')} over the course of the year.`);
      if (b.bb > 0)
        opts.push(`He worked ${b.bb} ${pl(b.bb, 'walk')} to go with ${b.h} ${pl(b.h, 'hit')} on the season.`);
      if (b.h > 0)
        opts.push(`He finished with ${b.h} ${pl(b.h, 'hit')} on the year.`);
      if (!usedGames)
        opts.push(`He was in the lineup for ${gp} ${pl(gp, 'game')} of ${tm}'s season.`);
      if (!opts.length)
        opts.push(`He was part of the ${tm} position-player group all spring.`);
      S.push(pick(opts, seed));
    }

    /* --- S3: context / batted-ball ------------------------- */
    const bab = b.babip, med = _ctx.b.babipMed;
    let s3 = null;
    if (bab !== null && bab !== undefined && !isNaN(bab)) {
      if (bab <= med - 0.070 && (w === null || w < 105)) {
        s3 = pick([
          `His ${f3(bab)} BABIP sat well under the league mark of roughly ${f3(med)}, which suggests the batted balls found gloves more often than the quality of contact would predict.`,
          `Worth noting that his ${f3(bab)} BABIP came in well below the league figure of about ${f3(med)}, so the results likely undersell how he was actually hitting the ball.`,
          `He ran a ${f3(bab)} BABIP against a league mark near ${f3(med)}, a gap that usually points to batted-ball luck rather than contact quality.`
        ], seed);
      } else if (bab >= med + 0.080 && w !== null && w >= 115) {
        s3 = pick([
          `One thing to watch is the ${f3(bab)} BABIP, comfortably above the league mark of about ${f3(med)}, so some of the batting average line may be tough to repeat.`,
          `His ${f3(bab)} BABIP sat well over the league figure near ${f3(med)}, which is the piece of the line most likely to move next season.`
        ], seed);
      }
    }
    if (!s3) s3 = warPhrase(b.owar, tm, 'offensive');
    if (!s3) s3 = `He finished with a ${f3(b.avg)}/${f3(b.obp)}/${f3(b.slg)} line on the year.`;
    S.push(s3);

    /* --- S4: forward-looking / close ------------------------ */
    if (partial) {
      S.push(`That came in under the ${_ctx.QB} plate appearances used as the qualifying line here, so the rate stats are still settling.`);
    } else if (alsoPitches) {
      S.push(`He also took the ball on the mound, which makes his two-way total the fuller picture of what he gave ${tm}.`);
    } else if (yi.under && (w === null || w < 100)) {
      S.push(`With ${yi.left} more ${pl(yi.left, 'season')} of CCAA baseball ahead of him, there is plenty of runway to build on these reps.`);
    } else if (yi.under) {
      S.push(`Doing that as a ${yi.word} is a good sign, and he has ${yi.left} more ${pl(yi.left, 'season')} in the conference.`);
    } else if (yi.word === 'junior' && (w === null || w < 100)) {
      S.push(`A senior season gives him a full year to build on it.`);
    } else if (yi.word === 'junior') {
      S.push(`He returns for a senior season with a track record already in place.`);
    } else if (yi.word === 'senior') {
      S.push(`He closes out his CCAA career with that line on the books.`);
    } else {
      S.push(`That is the full body of work for the season.`);
    }

    return S.join(' ');
  }

  /* ---------- pitchers --------------------------------------- */

  function forPitcher(p, alsoHits) {
    if (!_ctx) return '';
    const nm = p.name, tm = p.team;
    const ip = ipF(p.ip), app = p.app || 0;
    const yi = yearInfo(p.year);
    const ep = p.era_plus;
    const S = [];
    const seed = nm + tm + p.ip;

    /* --- TIER 3: negligible workload ------------------------ */
    if (ip < 6) {
      S.push(`${nm} made ${app} ${pl(app, 'appearance')} on the mound for ${tm}, covering ${p.ip} ${pl(ip, 'inning')}.`);
      if (p.k > 0) S.push(`He recorded ${p.k} ${pl(p.k, 'strikeout')} in that limited work.`);
      else S.push(`The workload was light enough that his rate stats swing on a handful of batters.`);
      S.push(`At this few innings ERA and WHIP move dramatically on one or two outcomes, so there is not much signal to read.`);
      S.push(yi.under
        ? `As a ${yi.word} he has time to grow into a larger role on the staff.`
        : `A longer look would be needed to say much about his true level.`);
      return S.join(' ');
    }

    const partial = ip < _ctx.QP;
    const bb9 = _ctx.p.get.bb9(p);
    const k9 = p.k9;

    /* --- S1: headline -------------------------------------- */
    if (ep === null || ep === undefined) {
      S.push(`${nm} threw ${p.ip} ${pl(ip, 'inning')} across ${app} ${pl(app, 'appearance')} for ${tm}.`);
    } else if (ep >= 160) {
      S.push(pick([
        `${nm} was one of the CCAA's most effective arms this spring, posting a ${f2(p.era)} ERA and a ${ep} ERA+ over ${p.ip} ${pl(ip, 'inning')}.`,
        `${nm} anchored the ${tm} staff with a ${f2(p.era)} ERA and a ${ep} ERA+ across ${p.ip} ${pl(ip, 'inning')}.`
      ], seed));
    } else if (ep >= 125) {
      S.push(pick([
        `${nm} pitched well above the league baseline for ${tm}, finishing with a ${f2(p.era)} ERA and a ${ep} ERA+ over ${p.ip} ${pl(ip, 'inning')}.`,
        `${nm} was a clear net positive on the ${tm} staff, running a ${f2(p.era)} ERA and a ${ep} ERA+ in ${p.ip} ${pl(ip, 'inning')}.`
      ], seed));
    } else if (ep >= 105) {
      S.push(`${nm} gave ${tm} steady innings, turning in a ${f2(p.era)} ERA and a ${ep} ERA+ over ${p.ip} ${pl(ip, 'inning')}.`);
    } else if (ep >= 90) {
      S.push(`${nm} pitched close to the CCAA baseline this spring, finishing at a ${f2(p.era)} ERA and a ${ep} ERA+ across ${p.ip} ${pl(ip, 'inning')}.`);
    } else if (ep >= 72) {
      S.push(`${nm} took on a real workload for ${tm}, covering ${p.ip} ${pl(ip, 'inning')} over ${app} ${pl(app, 'appearance')} with a ${f2(p.era)} ERA.`);
    } else {
      S.push(`${nm} logged ${p.ip} ${pl(ip, 'inning')} across ${app} ${pl(app, 'appearance')} for ${tm} this spring.`);
    }

    /* --- S2: strongest attribute ---------------------------- */
    const skills = [
      { k: 'k9', p: pctile(_ctx.p.k9, k9), v: k9 },
      { k: 'kbb', p: pctile(_ctx.p.kbb, p.kbb), v: p.kbb },
      { k: 'ctrl', p: bb9 === null ? null : pctile(_ctx.p.ctrl, -bb9), v: bb9 },
      { k: 'whip', p: p.whip === null ? null : pctile(_ctx.p.whip, -p.whip), v: p.whip }
    ].filter(s => s.p !== null).sort((a, b2) => b2.p - a.p);

    const top = skills[0];
    if (top && top.p >= 0.55) {
      if (top.k === 'k9') {
        const kp = (p.kpct !== null && p.kpct !== undefined) ? p.kpct.toFixed(1) : null;
        S.push(`The bat-missing was the standout piece, with ${p.k} ${pl(p.k, 'strikeout')} for ${aan(f1(k9))} ${f1(k9)} K/9${kp ? ` and roughly ${aan(kp)} ${kp}% strikeout rate` : ''}.`);
      } else if (top.k === 'kbb') {
        S.push(`His command profile was the strength, pairing ${p.k} ${pl(p.k, 'strikeout')} against ${p.bb} ${pl(p.bb, 'walk')} for a ${f2(p.kbb)} K/BB.`);
      } else if (top.k === 'ctrl') {
        S.push(`He threw plenty of strikes, issuing just ${p.bb} ${pl(p.bb, 'walk')} for ${aan(f1(bb9))} ${f1(bb9)} BB/9 that ranked among the better control marks in the qualified pool.`);
      } else {
        S.push(`He kept the bases relatively clear, allowing ${p.h} ${pl(p.h, 'hit')} and ${p.bb} ${pl(p.bb, 'walk')} for a ${f2(p.whip)} WHIP.`);
      }
    } else {
      const opts = [];
      if (p.k > 0) {
        opts.push(`He recorded ${p.k} ${pl(p.k, 'strikeout')} across that workload.`);
        opts.push(`He punched out ${p.k} ${pl(p.k, 'batter')} over those innings.`);
      }
      if (p.w > 0) opts.push(`He picked up ${p.w} ${pl(p.w, 'win')} in that role for ${tm}.`);
      opts.push(`He was a regular part of the ${tm} pitching staff this spring.`);
      S.push(pick(opts, seed));
    }

    /* --- S3: context, incl. the generous-but-true ERA note --- */
    let s3 = null;
    const k9pct = pctile(_ctx.p.k9, k9);
    if (k9pct !== null && k9pct >= 0.60 && ep !== null && ep < 95) {
      s3 = `The strikeout rate is the encouraging part here: he missed bats at a rate better than most of the qualified pool, and that skill usually shows up in run prevention before the ERA catches up to it.`;
    } else if (bb9 !== null && bb9 >= 5.5 && k9 !== null && k9 >= 7) {
      s3 = pick([
        `The stuff clearly plays, and tightening up the ${f1(bb9)} BB/9 is the single lever most likely to move the run prevention.`,
        `He misses enough bats for the profile to work, with the ${f1(bb9)} BB/9 the most obvious place to find improvement.`
      ], seed);
    } else {
      s3 = warPhrase(p.pwar, tm, 'pitching')
        || `He finished with a ${f2(p.whip)} WHIP over that workload.`;
    }
    S.push(s3);

    /* --- S4: forward-looking / close ------------------------ */
    if (partial) {
      S.push(`That sits under the ${_ctx.QP} innings used as the qualifying line here, so the rate stats are still firming up.`);
    } else if (alsoHits) {
      S.push(`He also carried a spot in the lineup, so his two-way total is the better measure of his overall value.`);
    } else if (yi.under && (ep === null || ep < 100)) {
      S.push(`Getting varsity innings as a ${yi.word} matters, and he has ${yi.left} more ${pl(yi.left, 'season')} to build on them.`);
    } else if (yi.under) {
      S.push(`Doing that as a ${yi.word} stands out, with ${yi.left} more ${pl(yi.left, 'season')} still ahead.`);
    } else if (yi.word === 'junior') {
      S.push(`He returns for a senior season as part of the staff.`);
    } else if (yi.word === 'senior') {
      S.push(`That is how his CCAA career finishes on the mound.`);
    } else {
      S.push(`That is the full workload for the season.`);
    }

    return S.join(' ');
  }

  /* ---------- dispatcher ------------------------------------- */

  function forPlayer(b, p) {
    if (b && p) {
      // Two-way: lead with whichever side carried the larger workload.
      const bWeight = (b.pa || 0) / 30;
      const pWeight = ipF(p.ip) / 18;
      return bWeight >= pWeight ? forBatter(b, true) : forPitcher(p, true);
    }
    if (b) return forBatter(b, false);
    if (p) return forPitcher(p, false);
    return '';
  }

  return { init, forBatter, forPitcher, forPlayer, _ipF: ipF };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BLURB;
