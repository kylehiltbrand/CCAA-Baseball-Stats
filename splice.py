import io, sys, re

SRC = 'projections.html'
s = io.open(SRC, encoding='utf-8').read()
orig_len = len(s)
css   = io.open('parts/css.txt', encoding='utf-8').read()
phtml = io.open('parts/players_html.txt', encoding='utf-8').read()
pjs   = io.open('parts/players_js.txt', encoding='utf-8').read()

def sub(old, new, label):
    global s
    n = s.count(old)
    assert n == 1, 'anchor %r matched %d times (need 1)' % (label, n)
    s = s.replace(old, new)
    print('  spliced: ' + label)

# 1. CSS ---------------------------------------------------------------
sub("\n/* ── MOBILE ───────────────────────────────────────────────── */",
    css + "\n/* ── MOBILE ───────────────────────────────────────────────── */",
    'css block')

# 2. Tab bar + open tab-teams wrapper ---------------------------------
sub("""  <!-- INTRO -->
  <div class="card">
    <div class="card-hdr">
      <div>
        <div class="card-title">2027 Projections <span class="advb">ADV</span></div>""",
    """  <div class="tabbar">
    <button class="tabbtn on" onclick="setTab('teams',this)">Teams</button>
    <button class="tabbtn" onclick="setTab('players',this)">Players<span class="tcount" id="tab-pcount"></span></button>
  </div>

  <div id="tab-teams">

  <!-- INTRO -->
  <div class="card">
    <div class="card-hdr">
      <div>
        <div class="card-title">2027 Team Projections <span class="advb">ADV</span></div>""",
    'tab bar + open tab-teams')

# 3. Retitle team intro sub + fix the now-false "single season" claim --
sub('<div class="card-sub">Returning production model · CCAA-calibrated</div>',
    '<div class="card-sub">Returning production model · CCAA-calibrated</div>',
    'team card-sub (unchanged, anchor check)')

sub("""      <p>These are <strong>returning-production projections</strong>, not a full forecasting system. With a single season of CCAA data there is no prior year to weight against, so the model does what one season allows: it estimates each program's 2026 talent level, works out how much of that production graduates, applies a growth curve to the players who come back, and assumes departing production is partially replaced.</p>""",
    """      <p>These are <strong>returning-production projections</strong> at the team level: the model estimates each program's 2026 talent, works out how much of that production graduates, applies a growth curve to the players who come back, and assumes departing production is partially replaced. It reads one season of aggregate output, which is a different and coarser thing from the player model in the Players tab.</p>
      <p style="color:var(--sub)">The growth factors in step 3 below are still the reasoned values this page launched with. The four-season archive can now measure them directly, and the Players tab does. Reconciling the two is the next job on this page.</p>""",
    'team intro copy')

# 4. Close tab-teams, insert players tab ------------------------------
sub("""    </div></div>
  </div>

</main>""",
    """    </div></div>
  </div>

  </div><!-- /tab-teams -->
""" + phtml + """
</main>""",
    'close tab-teams + players markup')

# 5. Load the frozen projection file -----------------------------------
sub('<script src="data.js"></script>',
    '<script src="data.js"></script>\n<script src="proj2027.js"></script>',
    'proj2027.js script tag')

# 6. Player JS + boot ---------------------------------------------------
sub("""/* ---------- boot ---------- */
PROJ=project();""",
    pjs + """
/* ---------- boot ---------- */
PROJ=project();""",
    'player js block')

sub("""renderTable();
renderReturners();
renderTeamReturners();
renderGap();""",
    """renderTable();
renderReturners();
renderTeamReturners();
renderGap();
renderCard();
if(HAS_PROJ){
  const c=document.getElementById('tab-pcount');
  if(c) c.textContent=PB.length+PP.length;
}
/* Deep link: projections.html#players opens straight to the player tab. */
if(location.hash==='#players'){
  const btn=document.querySelectorAll('.tabbtn')[1];
  if(btn) setTab('players',btn);
}""",
    'boot calls')

# 7. League filter must drive both tabs --------------------------------
sub("""  renderTable();
  renderTeamReturners();
}""",
    """  renderTable();
  renderTeamReturners();
  if(curTab==='players') renderPlayers();
}""",
    'setLeague')

io.open(SRC, 'w', encoding='utf-8').write(s)
print('\n  %d -> %d chars (+%d)' % (orig_len, len(s), len(s) - orig_len))
