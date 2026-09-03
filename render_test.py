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

        # --- pitchers sub-tab ---
        await pg.click('.subtab:nth-child(2)')
        await pg.wait_for_timeout(300)
        qrows = await pg.eval_on_selector_all('#pl-body .qrow', 'e=>e.length')
        check('pitcher rows rendered', qrows > 20, 'got %d' % qrows)

        # --- league filter drives the players tab ---
        await pg.click('.subtab:nth-child(1)')
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
