/* ============================================================
   CCAA BASEBALL — WRITE-UPS
   ------------------------------------------------------------
   THIS IS THE ONLY FILE YOU EDIT TO PUBLISH A POST.

   Add a new object to the top of the WRITEUPS array below and
   push. writeups.html (the index) and writeup.html (the reader)
   both build themselves from this file. Newest first.

   FIELDS
     slug      URL-safe id. Becomes writeup.html?p=your-slug
               Lowercase, hyphens only, never change it once
               a post is public or you break existing links.
     title     Headline.
     subtitle  One-line deck under the headline. Optional.
     date      "YYYY-MM-DD". Parsed as local time, not UTC.
     author    Byline.
     category  Groups the post and drives the filter bar.
               Reuse an existing one where it fits.
     excerpt   2-3 sentences for the index card. Plain text.
     body      The post. Markdown subset, see below.

   SUPPORTED MARKDOWN
     ## Heading            h2
     ### Subheading        h3
     Blank line            new paragraph
     **bold**  *italic*  `code`
     [link text](https://example.com)
     - bullet              unordered list
     1. item               ordered list
     > quote               pull quote
     ---                   horizontal rule
     | a | b |             table (second row must be |---|---|)

   Anything not listed above is rendered as plain text, and all
   HTML in the body is escaped. That is deliberate: it means a
   stray angle bracket in a stat line can never break the page.
   ============================================================ */

const WRITEUPS = [

{
  slug: "reading-the-2027-projections",
  title: "Reading the 2027 Projections",
  subtitle: "What a returning-production model can and cannot tell you about next spring",
  date: "2026-09-02",
  author: "Kyle Hiltbrand",
  category: "Projections",
  excerpt: "The first CCAA projections are live. Here is what the model actually does, why Arroyo Grande sits on top, and the three assumptions most likely to be wrong.",
  body: `
The projections page is live, and before anyone reads too much into the numbers it is worth being clear about what kind of model this is.

It is not a forecasting system in the sense that PECOTA or ZiPS are forecasting systems. Those lean on many seasons of prior data for every player. The CCAA has exactly one season on file. So this does what one season allows: it estimates how good each program was in 2026, works out how much of that production graduates, grows the players who come back, and assumes departing production gets partially replaced.

## What the model actually does

Every team gets two independent reads on 2026. The first is simply its record, with ties counted as half a win. The second starts from a replacement-level team and adds up the oWAR and pWAR its players produced.

Those two reads disagree more often than you would expect, and the disagreement is informative. A team that won more games than its player production suggests either got lucky in close games or is getting value the metrics do not capture. The model blends both, then regresses the result toward .500, because a 28-game high school season is a small sample and pretending otherwise is how you end up with silly numbers.

One detail worth surfacing: WAR on this site is not denominated in team wins. Summing every player's WAR and treating the total as wins above replacement would badly distort things. So the conversion is solved on every page load, scaling league-wide WAR so it reproduces league-wide wins above replacement. For 2026 that came out to roughly half a win per WAR.

## Why Arroyo Grande is on top

Arroyo Grande produced more total WAR than any program in the conference and returns a majority of it, including the best returning bat in the CCAA.

R. Servin put up a 241 wRC+ across 136 plate appearances as a junior. That is the single most productive returning season in the league by a wide margin. The arm side returns T. Winterberg, who threw to a 1.39 ERA and profiles as a two-way piece.

Santa Ynez follows closely and arguably has the better pitching case. T. Jeckell and E. Roberts are the top two returning arms in the conference, and both also hit.

## Three assumptions that could be wrong

**The growth factors.** Returning production gets multiplied by a class-based factor: freshmen by 1.35, sophomores by 1.25, juniors by 1.10. These are reasoned starting values, not measured ones. High school players do improve year over year and younger ones improve faster, but whether those specific multipliers are right for this conference is an open question. Once a second season exists, this becomes a thing to measure rather than assume.

**The reload rate.** The model assumes programs replace 45 percent of departed WAR, scaled by program strength. In reality reload rates vary enormously between programs depending on feeder systems and roster size, and nothing here accounts for incoming freshmen or transfers.

**Everything about Lompoc.** There is no player-level data on file for Lompoc, so its projection comes from the record alone and is regressed much harder toward league average. It is flagged as low confidence on the page for exactly this reason. Treat it as the widest error bar in the conference.

## What is missing

No park factors, which matters more than it sounds like it should on a coast where the marine layer at Morro Bay and inland heat in Paso Robles produce genuinely different run environments. No strength-of-schedule adjustment, which is a real problem when three leagues barely cross over. No defensive component in WAR at all.

Those are the honest limitations, and most of them get better with a second season of data rather than a cleverer model.

## Scoring this later

The whole point of publishing a projection before the season is that you can check it afterward. In June I will put these side by side with what actually happened and write up where the model did well and where it did not.

A forecast you never score is just an opinion with decimal places.
`
},

{
  slug: "why-ccaa-calibrated-stats",
  title: "Why These Stats Are Calibrated to the CCAA",
  subtitle: "A 130 wRC+ should mean the same thing here as it does anywhere else",
  date: "2026-08-24",
  author: "Kyle Hiltbrand",
  category: "Methodology",
  excerpt: "Advanced metrics are usually scaled to major league baselines, which makes them close to meaningless at the high school level. Here is how this site recalibrates them and why it matters.",
  body: `
Most advanced baseball statistics carry a hidden assumption: that the run environment they were built for is the run environment you are measuring.

wOBA weights, the wOBA scale, league ERA, replacement level. Every one of those constants comes from somewhere. When a high school stats site borrows them from Major League Baseball, the resulting numbers look authoritative and mean very little.

## The problem with borrowed constants

The average CCAA hitter batted well above the average major league hitter in 2026. Strikeout rates are lower. Defense is less reliable, so balls in play turn into hits more often. League ERA sits in a different place entirely.

Run a CCAA hitter's line through MLB-calibrated wOBA weights and you get a number that says he was extraordinary. He might have been perfectly average for this conference. The metric is not lying, exactly. It is answering a question nobody asked.

## What this site does instead

Every constant is derived from actual CCAA data, and rederived every time the page loads.

A function called \`recalcLeagueAvgs()\` runs on every load. It sums every batter's plate appearances, walks, hit by pitches, hits, extra-base hits and sacrifice flies to compute the true league wOBA, on-base percentage, batting average on balls in play, and runs per plate appearance. It does the same on the pitching side for league ERA, strikeouts per nine, walks per nine, and WHIP. Then it reassigns the constants and re-runs every derived statistic on every player.

The practical effect is that league constants never go stale. Push a stat update and the calibration retunes itself.

> A wRC+ of 130 on this site means 30 percent better than the average CCAA hitter. Not 30 percent better than the average major leaguer. That distinction is the entire point.

## Small samples and honest regression

A 28-game season produces plate appearance totals that would be a bad week in professional baseball. A hitter with 20 plate appearances and four hits is not a .200 hitter, and treating him like one produces garbage.

So advanced stats regress toward league average when the sample is thin. wRC+ regresses below 80 plate appearances, ERA+ below 40 innings, and WAR regresses proportionally below its own credibility thresholds.

The regression amounts are currently reasoned rather than measured. The right way to set them is to find the sample size at which each statistic becomes reliably self-correlated and shrink by exactly that much. That requires more than one season of data, and it is near the top of the list once a backfill exists.

## Why this matters beyond the numbers

Being able to say "this is a 130 wRC+ hitter in this conference" is more useful to a coach than any raw slash line, because it collapses everything into one comparable number with a meaning that does not shift between programs.

That is the whole argument for advanced statistics, and it only holds if the baselines are honest.
`
}

];

/* ============================================================
   MARKDOWN RENDERER
   Small, deliberate, and shared by both pages. Escapes all HTML
   first so nothing in a post body can inject markup.
   ============================================================ */
const MD = (function () {

  function esc(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Inline formatting. Code spans are extracted first so their
  // contents are never treated as bold, italic or a link.
  function inline(t) {
    const code = [];
    t = t.replace(/`([^`]+)`/g, (m, c) => {
      code.push(c); return '\u0000' + (code.length - 1) + '\u0000';
    });
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + code[+i] + '</code>');
    return t;
  }

  function isTableSep(l) { return /^\|(\s*:?-+:?\s*\|)+$/.test(l.trim()); }
  function cells(l) {
    return l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  }

  function render(src) {
    if (!src) return '';
    const lines = esc(src).replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const raw = lines[i];
      const line = raw.trim();

      if (!line) { i++; continue; }

      // horizontal rule
      if (/^---+$/.test(line)) { out.push('<hr class="wu-hr">'); i++; continue; }

      // headings
      let h = line.match(/^(#{2,4})\s+(.*)$/);
      if (h) {
        const n = h[1].length;
        out.push(`<h${n} class="wu-h${n}">${inline(h[2])}</h${n}>`);
        i++; continue;
      }

      // table
      if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(cells(lines[i])); i++;
        }
        out.push('<div class="wu-tablewrap"><table class="wu-table"><thead><tr>' +
          head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>');
        continue;
      }

      // blockquote (consecutive > lines merge into one)
      if (line.startsWith('&gt;')) {
        const buf = [];
        while (i < lines.length && lines[i].trim().startsWith('&gt;')) {
          buf.push(lines[i].trim().replace(/^&gt;\s?/, '')); i++;
        }
        out.push(`<blockquote class="wu-quote">${inline(buf.join(' '))}</blockquote>`);
        continue;
      }

      // lists
      const ul = /^[-*]\s+(.*)$/, ol = /^\d+\.\s+(.*)$/;
      if (ul.test(line) || ol.test(line)) {
        const ordered = ol.test(line);
        const re = ordered ? ol : ul;
        const items = [];
        while (i < lines.length && re.test(lines[i].trim())) {
          items.push(lines[i].trim().match(re)[1]); i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag} class="wu-list">` +
          items.map(x => `<li>${inline(x)}</li>`).join('') + `</${tag}>`);
        continue;
      }

      // paragraph: consume until a blank line or a block-level marker
      const para = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l || /^(#{2,4}\s|---+$|&gt;|[-*]\s|\d+\.\s|\|)/.test(l)) break;
        para.push(l); i++;
      }
      if (para.length) out.push(`<p class="wu-p">${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  // Strips markup so word counts and previews stay accurate.
  function plain(src) {
    return (src || '').replace(/`[^`]*`/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#*>|_-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function readTime(src) {
    const w = plain(src).split(' ').filter(Boolean).length;
    return Math.max(1, Math.round(w / 200));
  }

  // "YYYY-MM-DD" split manually: new Date("2026-09-02") parses as
  // midnight UTC and displays as Sep 1 in Pacific time.
  function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US',
      { month: 'long', day: 'numeric', year: 'numeric' });
  }
  function fmtDateShort(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function sortKey(s) {
    const [y, m, d] = (s || '1970-01-01').split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  return { render, plain, readTime, fmtDate, fmtDateShort, sortKey, esc };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { WRITEUPS, MD };
