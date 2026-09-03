import asyncio, sys, os
from playwright.async_api import async_playwright

FAIL = []
def check(label, cond, detail=''):
    if cond: print('  ok    ' + label)
    else:
        FAIL.append(label); print('  FAIL  %s  %s' % (label, detail))

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 1000})
        errs, cons = [], []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        def _con(m):
            t = m.text
            # offline sandbox has no webfonts and no images/logos/*.png; those
            # 404s are environment, not page defects
            if m.type == 'error' and 'ERR_CERT' not in t and 'ERR_FILE_NOT_FOUND' not in t:
                cons.append(t)
        pg.on('console', _con)
        await pg.goto('file://' + os.path.abspath('projections.html'))
        await pg.wait_for_timeout(900)

        check('no uncaught JS errors', not errs, '; '.join(errs[:3]))
        check('no console errors', not cons, '; '.join(cons[:3]))

        # --- teams tab is the default ---
        check('teams tab visible on load', await pg.is_visible('#tab-teams'))
        check('players tab hidden on load', not await pg.is_visible('#tab-players'))
        rows = await pg.eval_on_selector_all('#proj-table .prow:not(.head)', 'e=>e.length')
        check('team projection rows rendered', rows == 15, 'got %d, want 15' % rows)
        rh = await pg.eval_on_selector_all('#ret-hitters .rcard', 'e=>e.length')
        check('returning hitters rendered', rh > 0, 'got %d' % rh)
        scale = await pg.inner_text('#scale-val')
        check('WAR scale filled', scale.strip() != '—', repr(scale))

        # --- switch to players ---
        await pg.click('.tabbtn:nth-child(2)')
        await pg.wait_for_timeout(500)
        check('players tab visible after click', await pg.is_visible('#tab-players'))
        check('teams tab hidden after click', not await pg.is_visible('#tab-teams'))

        hrows = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        check('hitter rows rendered', hrows > 50, 'got %d' % hrows)
        cnt = await pg.inner_text('#tab-pcount')
        check('tab count filled', cnt.strip().isdigit(), repr(cnt))

        # every methodology placeholder must be filled
        for pid in ['pp-sub', 'pp-warn', 'k-k', 'k-babip', 'wts', 'agescale',
                    'retline', 'pt-formula', 'pt-r', 'score-note', 'pl-sub']:
            t = (await pg.inner_text('#' + pid)).strip()
            check('#%s filled' % pid, t and t != '—', repr(t[:40]))

        sc = await pg.eval_on_selector_all('#score-grid .scard', 'e=>e.length')
        check('scorecard cards rendered', sc == 8, 'got %d' % sc)
        ar = await pg.eval_on_selector_all('#age-table tbody tr', 'e=>e.length')
        check('aging table rows', ar == 3, 'got %d' % ar)
        bands = await pg.eval_on_selector_all('#pl-body .bandfill', 'e=>e.length')
        check('bands drawn for every row', bands == hrows, 'got %d of %d' % (bands, hrows))

        # bands must actually straddle the projection tick
        bad = await pg.evaluate("""() => {
          let bad = 0;
          document.querySelectorAll('#pl-body .hrow').forEach(r => {
            const f = r.querySelector('.bandfill'), t = r.querySelector('.bandtick');
            if (!f || !t) { bad++; return; }
            const fl = parseFloat(f.style.left), fw = parseFloat(f.style.width);
            const tl = parseFloat(t.style.left.replace('calc(','').replace('% - 1px)',''));
            if (!(tl >= fl - 0.5 && tl <= fl + fw + 0.5)) bad++;
          });
          return bad;
        }""")
        check('projection tick inside its band', bad == 0, '%d rows off' % bad)

        # --- comps drawer ---
        row0 = pg.locator('#pl-body .hrow').nth(0)
        await row0.click()
        await pg.wait_for_timeout(200)
        check('comps drawer opens', await row0.locator('.hcomp').is_visible())
        chips = await row0.locator('.compchip').count()
        check('comparables listed', chips == 3, 'got %d' % chips)

        # --- sorting ---
        names = lambda: pg.eval_on_selector_all(
            '#pl-body .hrow .hpname', 'e=>e.map(x=>x.textContent).join("|")')
        before = await names()
        await pg.locator('.hhead .s').nth(2).click()          # AVG column
        await pg.wait_for_timeout(250)
        after = await names()
        check('sorting reorders the list', before != after)
        # ...and the new order is actually sorted descending on that column
        desc = await pg.evaluate('''() => {
          const v = [...document.querySelectorAll('#pl-body .hrow')]
            .map(r => parseFloat(r.querySelectorAll('.hnum')[1].textContent));
          return v.every((x, i) => i === 0 || v[i-1] >= x);
        }''')
        check('sorted column is monotonic', desc)
        await pg.locator('.hhead .s').nth(6).click()          # back to oWAR
        await pg.wait_for_timeout(200)

        # ---------------- class + team filters ----------------
        allN = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        note = (await pg.inner_text('#cls-note')).strip()
        check('class note filled', note and note != '—', repr(note[:45]))
        check('no Fr pill offered',
              await pg.eval_on_selector_all('.subtab.cls', 'e=>e.every(x=>x.textContent!=="Fr")'))

        # class filter: each pill must narrow, and every row must match it
        tot = 0
        for cls in ['So', 'Jr', 'Sr']:
            await pg.click('.subtab.cls:text-is("%s")' % cls)
            await pg.wait_for_timeout(220)
            n = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
            tot += n
            pure = await pg.eval_on_selector_all(
                '#pl-body .hcl', 'e=>e.every(x=>x.textContent.trim()==="%s")' % cls)
            check('class %s filter is pure (%d rows)' % (cls, n), pure and n > 0)
        check('class filters partition the set', tot == allN, '%d vs %d' % (tot, allN))

        await pg.click('.subtab.cls:text-is("All")')
        await pg.wait_for_timeout(220)
        check('clearing class restores all rows',
              await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length') == allN)

        # team filter
        opts = await pg.eval_on_selector_all('#team-sel option', 'e=>e.map(o=>o.value)')
        check('team select populated', len(opts) > 10, '%d options' % len(opts))
        check('team counts in labels',
              await pg.eval_on_selector('#team-sel option:nth-child(2)',
                                        'e=>/\(\d+\)$/.test(e.textContent.trim())'))
        team = opts[1]
        await pg.select_option('#team-sel', team)
        await pg.wait_for_timeout(250)
        tn = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        pure = await pg.eval_on_selector_all(
            '#pl-body .hpteam', 'e=>e.every(x=>x.textContent.split(" · ")[0]==="%s")' % team)
        check('team filter is pure (%s, %d rows)' % (team, tn), pure and 0 < tn < allN)

        # team + class stack
        await pg.click('.subtab.cls:text-is("Sr")')
        await pg.wait_for_timeout(250)
        both = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        check('filters stack', both <= tn)
        stacked_ok = await pg.evaluate('''(t) => [...document.querySelectorAll('#pl-body .hrow')]
            .every(r => r.querySelector('.hpteam').textContent.split(" · ")[0] === t
                     && r.querySelector('.hcl').textContent.trim() === "Sr")''', team)
        check('stacked filters both applied', stacked_ok)

        # a league that excludes the chosen team must reset it, not blank the table
        await pg.click('.subtab.cls:text-is("All")')
        await pg.wait_for_timeout(200)
        lg_for = await pg.evaluate('(t)=>TL[t]', team)
        other = [l for l in ['mountain', 'sunset', 'ocean'] if l != lg_for][0]
        idx = {'mountain': 2, 'sunset': 3, 'ocean': 4}[other]
        await pg.click('.fbtn:nth-child(%d)' % idx)
        await pg.wait_for_timeout(300)
        sel_now = await pg.eval_on_selector('#team-sel', 'e=>e.value')
        rows_now = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        check('out-of-league team resets to all', sel_now == 'all', repr(sel_now))
        check('table not left empty after reset', rows_now > 0, '%d rows' % rows_now)
        await pg.click('.fbtn:nth-child(1)')
        await pg.wait_for_timeout(250)

        # filters carry across the hitter/pitcher toggle
        await pg.select_option('#team-sel', team)
        await pg.wait_for_timeout(200)
        await pg.click('.subtab.kind:text-is("Pitchers")')
        await pg.wait_for_timeout(300)
        kept = await pg.eval_on_selector('#team-sel', 'e=>e.value')
        check('team filter survives kind switch', kept == team, repr(kept))
        qpure = await pg.eval_on_selector_all(
            '#pl-body .qrow .hpteam',
            'e=>e.every(x=>x.textContent.split(" · ")[0]==="%s")' % team)
        check('pitcher rows respect team filter', qpure)
        await pg.click('.subtab.kind:text-is("Hitters")')
        await pg.wait_for_timeout(200)
        await pg.select_option('#team-sel', 'all')
        await pg.wait_for_timeout(200)

        # --- pitchers sub-tab ---
        await pg.click('.subtab.kind:text-is("Pitchers")')
        await pg.wait_for_timeout(300)
        qrows = await pg.eval_on_selector_all('#pl-body .qrow', 'e=>e.length')
        check('pitcher rows rendered', qrows > 20, 'got %d' % qrows)

        # --- league filter drives the players tab ---
        await pg.click('.subtab.kind:text-is("Hitters")')
        await pg.wait_for_timeout(200)
        allh = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        await pg.click('.fbtn:nth-child(2)')   # Mountain
        await pg.wait_for_timeout(300)
        mtn = await pg.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        check('league filter narrows players', 0 < mtn < allh, '%d of %d' % (mtn, allh))
        teams_ok = await pg.evaluate("""() => {
          const TLm = {"St. Joseph":1,"Arroyo Grande":1,"Righetti":1,"Morro Bay":1,
                       "Mission College Prep":1,"Lompoc":1};
          return [...document.querySelectorAll('#pl-body .hrow .hpteam')]
            .every(e => TLm[e.textContent.split(' · ')[0]]);
        }""")
        check('filtered rows are all Mountain', teams_ok)

        await pg.click('.fbtn:nth-child(1)')
        await pg.wait_for_timeout(250)

        # --- back to teams, team tab still works ---
        await pg.click('.tabbtn:nth-child(1)')
        await pg.wait_for_timeout(300)
        rows2 = await pg.eval_on_selector_all('#proj-table .prow:not(.head)', 'e=>e.length')
        check('team tab intact after round trip', rows2 == 15, 'got %d' % rows2)

        await pg.screenshot(path='shot_teams.png', full_page=False)
        await pg.click('.tabbtn:nth-child(2)')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path='shot_players.png', full_page=False)

        # --- deep link ---
        pg2 = await b.new_page(viewport={'width': 1400, 'height': 1000})
        e2 = []
        pg2.on('pageerror', lambda e: e2.append(str(e)))
        await pg2.goto('file://' + os.path.abspath('projections.html') + '#players')
        await pg2.wait_for_timeout(800)
        check('deep link opens players tab', await pg2.is_visible('#tab-players'))
        check('deep link raises no errors', not e2, '; '.join(e2[:2]))

        # --- mobile ---
        pg3 = await b.new_page(viewport={'width': 390, 'height': 844})
        e3 = []
        pg3.on('pageerror', lambda e: e3.append(str(e)))
        await pg3.goto('file://' + os.path.abspath('projections.html') + '#players')
        await pg3.wait_for_timeout(800)
        check('mobile: no JS errors', not e3, '; '.join(e3[:2]))
        check('mobile: headers hidden', not await pg3.is_visible('#pl-body .hhead'))
        # Scoped to <main>. The desktop header <nav> overflows at 390px in the
        # ORIGINAL file too (530px either way), so it is a pre-existing site-wide
        # issue in shared markup, not something this page introduced.
        ov = await pg3.evaluate('''() => {
          const w = document.documentElement.clientWidth;
          return [...document.querySelectorAll('main *')]
            .every(e => { const r = e.getBoundingClientRect();
                          return r.right <= w + 1 && r.left >= -1; });
        }''')
        check('mobile: no overflow inside <main>', ov)
        rowsm = await pg3.eval_on_selector_all('#pl-body .hrow', 'e=>e.length')
        check('mobile: player rows render', rowsm > 50, 'got %d' % rowsm)
        bandm = await pg3.eval_on_selector_all('#pl-body .bandfill', 'e=>e.length')
        check('mobile: bands still render', bandm == rowsm, '%d of %d' % (bandm, rowsm))
        await pg3.screenshot(path='shot_mobile.png', full_page=False)

        await b.close()

    print('\n  %s' % ('ALL RENDER CHECKS PASSED' if not FAIL
                      else '%d FAILED: %s' % (len(FAIL), ', '.join(FAIL))))
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
