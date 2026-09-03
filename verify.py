import io, re, sys, json

s = io.open('projections.html', encoding='utf-8').read()
p = io.open('proj2027.js', encoding='utf-8').read()

checks = [
    # --- structure ---
    ('tab bar present',                    '<div class="tabbar">', s, 1),
    ('teams tab button',                   ">Teams</button>", s, 1),
    ('players tab button',                 'id="tab-pcount"', s, 1),
    ('tab-teams opens',                    '<div id="tab-teams">', s, 1),
    ('tab-teams closes',                   '</div><!-- /tab-teams -->', s, 1),
    ('tab-players opens',                  '<div id="tab-players" hidden>', s, 1),
    ('tab-players closes',                 '</div><!-- /tab-players -->', s, 1),
    ('single main close',                  '</main>', s, 1),
    # --- wiring ---
    ('proj2027 loaded',                    '<script src="proj2027.js"></script>', s, 1),
    ('data.js still loaded first',         '<script src="data.js"></script>\n<script src="proj2027.js">', s, 1),
    ('setTab defined',                     'function setTab(', s, 1),
    ('setPKind defined',                   'function setPKind(', s, 1),
    ('pSortBy defined',                    'function pSortBy(', s, 1),
    ('renderPlayers defined',              'function renderPlayers(', s, 1),
    ('renderCard defined',                 'function renderCard(', s, 1),
    ('toggleComp defined',                 'function toggleComp(', s, 1),
    ('bandBar defined',                    'function bandBar(', s, 1),
    ('renderCard called at boot',          '\nrenderCard();', s, 1),
    ('league filter drives players',       "if(curTab==='players') renderPlayers();", s, 1),
    ('deep link handler',                  "location.hash==='#players'", s, 1),
    # --- team tab untouched where it matters ---
    ('team proj-table intact',             'id="proj-table"', s, 1),
    ('team returners intact',              'id="ret-hitters"', s, 1),
    ('team pitchers intact',               'id="ret-pitchers"', s, 1),
    ('team-returners intact',              'id="team-returners"', s, 1),
    ('team project() intact',              'PROJ=project();', s, 1),
    ('team renderTable intact',            'function renderTable(', s, 1),
    ('warScale intact',                    'function warScale(', s, 1),
    ('stale one-season claim removed',     'With a single season of CCAA data', s, 0),
    # --- ids the JS writes into exist exactly once ---
    ('id pl-body',                         'id="pl-body"', s, 1),
    ('id pl-title',                        'id="pl-title"', s, 1),
    ('id pl-sub',                          'id="pl-sub"', s, 1),
    ('id pl-hint',                         'id="pl-hint"', s, 1),
    ('id pp-sub',                          'id="pp-sub"', s, 1),
    ('id pp-warn',                         'id="pp-warn"', s, 1),
    ('id score-grid',                      'id="score-grid"', s, 1),
    ('id score-note',                      'id="score-note"', s, 1),
    ('id age-table',                       'id="age-table"', s, 1),
    ('id k-k',                             'id="k-k"', s, 1),
    ('id k-babip',                         'id="k-babip"', s, 1),
    ('id wts',                             'id="wts"', s, 1),
    ('id agescale',                        'id="agescale"', s, 1),
    ('id retline',                         'id="retline"', s, 1),
    ('id pt-formula',                      'id="pt-formula"', s, 1),
    ('id pt-r',                            'id="pt-r"', s, 1),
    # --- css ---
    ('tabbtn css',                         '.tabbtn{', s, 2),
    ('hrow css',                           '.hrow{', s, 2),
    ('mobile row grid',                    '.hrow,.qrow{grid-template-columns:22px', s, 1),
    ('mobile war placement',               '.hrow .hwar,.qrow .hwar{grid-column:4;grid-row:1}', s, 1),
    ('mobile stat line class',             '.mshow{display:none}', s, 1),
    ('qrow css',                           '.qrow{', s, 3),
    ('band css',                           '.bandfill{', s, 1),
    ('scorecard css',                      '.scard{', s, 1),
    ('aging table css',                    '.agetbl{', s, 1),
    ('mobile hides headers',               '.hhead,.phead{display:none}', s, 1),
    # --- frozen data file ---
    ('PROJ_CARD present',                  'const PROJ_CARD = ', p, 1),
    ('PROJ_BAT present',                   'const PROJ_BAT = ', p, 1),
    ('PROJ_PIT present',                   'const PROJ_PIT = ', p, 1),
    ('proj file exports',                  'module.exports = { PROJ_CARD, PROJ_BAT, PROJ_PIT }', p, 1),
    ('frozen warning in header',           'DO NOT EDIT BY HAND', p, 1),
]

fail = 0
for label, needle, hay, want in checks:
    got = hay.count(needle)
    ok = (got == want)
    if not ok:
        fail += 1
        print('  FAIL  %-34s expected %d, found %d' % (label, want, got))
print('  %d/%d structural assertions passed' % (len(checks) - fail, len(checks)))

# --- balanced tags inside main ---
main = s[s.index('<main>'):s.index('</main>')]
opens = len(re.findall(r'<div\b', main))
closes = len(re.findall(r'</div>', main))
if opens != closes:
    fail += 1
    print('  FAIL  unbalanced divs in <main>: %d open, %d close' % (opens, closes))
else:
    print('  divs balanced in <main>: %d / %d' % (opens, closes))

# --- no duplicate function or const declarations across the page ---
names = re.findall(r'\nfunction ([A-Za-z_$][\w$]*)\(', s)
dupes = sorted({n for n in names if names.count(n) > 1})
if dupes:
    fail += 1
    print('  FAIL  duplicate function declarations: %s' % ', '.join(dupes))
else:
    print('  no duplicate function names (%d functions)' % len(names))

decls = re.findall(r'\n(?:const|let) ([A-Za-z_$][\w$]*)\s*=', s)
d2 = sorted({n for n in decls if decls.count(n) > 1})
if d2:
    fail += 1
    print('  FAIL  duplicate const/let declarations: %s' % ', '.join(d2))
else:
    print('  no duplicate top-level const/let (%d declarations)' % len(decls))

sys.exit(1 if fail else 0)
