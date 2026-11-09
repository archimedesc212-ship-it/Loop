# Browser checks for the finalisation pass: introduction, cookie sessions, honest
# playback states, "Not for me", world feedback, film and language pages, queue
# and volume, account security, admin providers, offline banner, keyboard access
# and an automated accessibility scan (axe-core) of the main pages.
# Fails on console errors, page errors, 5xx API responses and serious/critical
# axe violations. Run against a server with demo data (see e2e/README.md).
import os, re, sys, time, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE_URL', 'http://localhost:4000')
S = os.environ.get('SHOTS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'))
AXE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'node_modules', 'axe-core', 'axe.min.js')
os.makedirs(S, exist_ok=True)
errors, results, axe_report = [], [], {}
SEEN = "try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}"

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('  ok   ' if cond else '  FAIL ') + name + (f' — {detail}' if detail and not cond else ''))

def watch(pg, allow=()):
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' and not any(a in m.text for a in allow) else None)
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    pg.on('response', lambda r: errors.append(f'[http {r.status}] {r.url}') if r.status >= 500 and '/api/' in r.url else None)

def axe(pg, label):
    # contexts use bypass_csp=True only so this scanner script can be injected; the CSP itself is tested in the API suite
    pg.add_script_tag(path=AXE)
    r = pg.evaluate("""async () => {
      // scan the page as a person sees it: wait for finite entrance animations (fade-ins) to finish,
      // otherwise colour contrast is measured on half-transparent text and background
      await Promise.all(document.getAnimations()
        .filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)));
      const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, target: v.nodes[0] && v.nodes[0].target.join(' ') }));
    }""")
    axe_report[label] = r
    bad = [v for v in r if v['impact'] in ('serious', 'critical')]
    check(f'axe: no serious/critical WCAG A/AA violations on {label}', not bad, json.dumps(bad)[:600])

def login(pg, user, pw):
    pg.goto(BASE + '/login'); pg.wait_for_selector('input[autocomplete=username]')
    pg.fill('input[autocomplete=username]', user); pg.fill('input[autocomplete=current-password]', pw)
    pg.click('button:has-text("Sign in")'); pg.wait_for_url(lambda u: '/login' not in u, timeout=8000); pg.wait_for_timeout(800)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------------------------------------------------------------- introduction
    print('Introduction')
    ctx = b.new_context(bypass_csp=True, viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); watch(pg)
    pg.goto(BASE + '/login'); pg.wait_for_selector('.intro')
    pg.wait_for_timeout(900); pg.screenshot(path=f'{S}/60-intro-line.png')
    focused = pg.evaluate("document.activeElement && document.activeElement.textContent")
    check('intro plays on the first visit and focuses "Skip intro"', focused == 'Skip intro', focused)
    axe(pg, 'intro')
    pg.wait_for_timeout(4600); pg.screenshot(path=f'{S}/61-intro-brand.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(700)
    check('Escape skips the intro to the sign-in form', pg.locator('input[autocomplete=username]').count() == 1)
    pg.reload(); pg.wait_for_timeout(600)
    check('the intro is not repeated on the next visit', pg.locator('.intro').count() == 0)
    ctx.close()
    rm = b.new_context(bypass_csp=True, viewport={'width': 1280, 'height': 800}, reduced_motion='reduce'); rp = rm.new_page(); watch(rp)
    rp.goto(BASE + '/login'); rp.wait_for_selector('.intro')
    check('reduced motion: a still frame with "Continue", no animation', rp.locator('.intro.still button:has-text("Continue")').count() == 1)
    rp.screenshot(path=f'{S}/62-intro-reduced-motion.png'); rp.click('button:has-text("Continue")'); rm.close()

    # ---------------------------------------------------------------- listener journeys
    print('Listener')
    ctx = b.new_context(bypass_csp=True, viewport={'width': 1440, 'height': 900}); ctx.add_init_script(SEEN); pg = ctx.new_page(); watch(pg)
    login(pg, 'aarav', 'Listener@123')
    cookies = {c['name']: c for c in ctx.cookies()}
    check('session cookie is httpOnly + SameSite=Strict', cookies.get('muse_session', {}).get('httpOnly') and cookies['muse_session'].get('sameSite') == 'Strict')
    js_cookies = pg.evaluate('document.cookie')
    check('page scripts cannot read the session token', 'muse_session' not in js_cookies and 'muse_csrf' in js_cookies)
    check('no token in localStorage', pg.evaluate("Object.keys(localStorage).every(k => !/token/i.test(k))"))
    axe(pg, 'home')

    # keyboard: first Tab reaches the skip link
    pg.keyboard.press('Tab')
    check('first Tab focuses "Skip to content"', pg.evaluate("document.activeElement.textContent") == 'Skip to content')

    # metadata-only song
    pg.goto(BASE + '/song/17'); pg.wait_for_selector('h1')
    check('metadata-only song: play disabled and labelled', pg.locator('button:has-text("Not playable")').is_disabled() and pg.locator('.badge-meta').count() >= 1)
    pg.screenshot(path=f'{S}/63-metadata-only-song.png')
    pg.goto(BASE + '/song/1'); pg.wait_for_selector('h1')
    check('playable song shows the demo-sketch label', pg.locator('.badge-demo').count() == 1)
    axe(pg, 'song page')

    # mood → Not for me
    pg.goto(BASE + '/mood'); pg.wait_for_selector('.feel-input input')
    pg.fill('.feel-input input', 'something calm for studying'); pg.click('.feel-input button'); pg.wait_for_selector('.track .t-title', timeout=10000)
    first = pg.locator('.track .t-title').first.inner_text()
    pg.click('.track button[aria-label^="Not for me"] >> nth=0'); pg.wait_for_timeout(800)
    check('"Not for me" removes the song from the list', first not in pg.locator('.track .t-title').all_inner_texts(), first)
    axe(pg, 'mood results')

    # play → player label, queue, volume
    pg.click('.track button[aria-label^="Play "] >> nth=0'); pg.wait_for_timeout(1200)
    check('player says the demo sketch is not the recording', 'Demo sketch (not the recording)' in pg.locator('.player').inner_text())
    pg.click('button[aria-label="Show play queue"]'); pg.wait_for_selector('.queue-panel')
    n_queue = pg.locator('.queue-list li').count()
    check('queue panel lists the queue', n_queue > 1, str(n_queue))
    pg.screenshot(path=f'{S}/64-queue.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    check('Escape closes the queue', pg.locator('.queue-panel').count() == 0)
    pg.locator('input[aria-label="Volume"]').fill('30'); pg.wait_for_timeout(200)
    check('volume persists per browser', pg.evaluate("localStorage.getItem('muse.volume')") == '0.3')
    pg.click('.player button[aria-label="Pause"]'); pg.wait_for_timeout(300)

    # world feedback
    pg.goto(BASE + '/world'); pg.wait_for_selector('h1.display', timeout=10000)
    btn = pg.locator('button:has-text("Love this world")')
    was = btn.get_attribute('aria-pressed')
    btn.click(); pg.wait_for_timeout(800)
    now = pg.locator('button:has-text("Love this world")').get_attribute('aria-pressed')
    check('world feedback toggles', was != now, f'{was} -> {now}')
    if now == 'true':
        pg.locator('button:has-text("Love this world")').click(); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{S}/65-world-feedback.png')
    axe(pg, 'world')

    # film + language pages
    pg.goto(BASE + '/film/1'); pg.wait_for_selector('h1')
    check('film page lists its soundtrack', pg.locator('.track').count() > 0 and 'Soundtrack albums' in pg.content())
    pg.screenshot(path=f'{S}/66-film.png'); axe(pg, 'film page')
    pg.goto(BASE + '/language/1'); pg.wait_for_selector('h1')
    check('language page shows Telugu songs', 'Telugu' in pg.locator('h1').inner_text() and pg.locator('.track').count() > 0)
    pg.screenshot(path=f'{S}/67-language.png'); axe(pg, 'language page')

    # search edge: nothing found
    pg.goto(BASE + '/search?q=qqzzxxkk'); pg.wait_for_timeout(1200)
    check('empty search result is explained', pg.locator('text=Nothing matched').count() == 1)

    # offline banner
    ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))"); pg.wait_for_timeout(300)
    check('offline banner appears', pg.locator('.offline-banner').count() == 1)
    pg.screenshot(path=f'{S}/68-offline.png')
    ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(300)
    check('offline banner clears when back online', pg.locator('.offline-banner').count() == 0)

    # settings: sessions, hidden songs
    pg.goto(BASE + '/settings'); pg.wait_for_selector('text=This device'); pg.wait_for_selector('.card:has-text("Hidden songs") li', timeout=5000)
    check('settings lists sign-in sessions with "This device"', pg.locator('text=This device').count() >= 1)
    check('hidden songs list shows the dismissed song', first in pg.locator('.card:has-text("Hidden songs")').inner_text())
    pg.locator('.card:has-text("Hidden songs") button:has-text("Show again")').first.click(); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{S}/69-settings-security.png', full_page=True)
    axe(pg, 'settings')
    ctx.close()

    # ---------------------------------------------------------------- new account: password change, sign out everywhere, delete
    print('Account lifecycle')
    user = f'fin{int(time.time()) % 100000}'
    c1 = b.new_context(bypass_csp=True, viewport={'width': 1280, 'height': 860}); c1.add_init_script(SEEN); p1 = c1.new_page(); watch(p1, allow=('401',))
    p1.goto(BASE + '/register'); p1.wait_for_selector('input[autocomplete=name]')
    p1.fill('input[autocomplete=name]', 'Final Check'); p1.fill('input[autocomplete=username]', user)
    p1.fill('input[type=email]', f'{user}@example.com'); p1.fill('input[type=password]', 'Final1234')
    p1.click('button:has-text("Create account")'); p1.wait_for_url('**/welcome')
    p1.wait_for_selector('button.pick'); p1.wait_for_timeout(300)
    check('registration goes to onboarding', '/welcome' in p1.url, p1.url)
    axe(p1, 'onboarding')
    p1.click('button.pick:has-text("Telugu")')
    for _ in range(5):
        p1.click('button:has-text("Continue")'); p1.wait_for_timeout(250)
    p1.click('button:has-text("Build my first mix")'); p1.wait_for_url(lambda u: '/welcome' not in u, timeout=10000); p1.wait_for_timeout(800)
    c2 = b.new_context(bypass_csp=True); c2.add_init_script(SEEN); p2 = c2.new_page(); watch(p2, allow=('401',))
    login(p2, user, 'Final1234')
    p1.goto(BASE + '/settings'); p1.wait_for_selector('text=This device'); p1.wait_for_timeout(600)
    devices = p1.locator('.card', has_text='Where you’re signed in').get_by_role('button', name=re.compile(r'^Sign out( device)?$')).count()
    check('two devices are listed', devices == 2, str(devices))
    p1.fill('input[autocomplete=current-password]', 'Final1234')
    p1.locator('input[autocomplete=new-password]').nth(0).fill('Final5678')
    p1.locator('input[autocomplete=new-password]').nth(1).fill('Final5678')
    p1.click('button:has-text("Change password")'); p1.wait_for_timeout(1200)
    p2.goto(BASE + '/library'); p2.wait_for_timeout(1500)
    check('password change signed the other device out', '/login' in p2.url, p2.url)
    p1.click('button:has-text("Delete my account")'); p1.wait_for_selector('[role=dialog]')
    p1.locator('[role=dialog] input[type=password]').fill('Final5678'); p1.locator('[role=dialog] input').nth(1).fill('DELETE')
    p1.click('button:has-text("Delete permanently")'); p1.wait_for_url('**/login', timeout=8000)
    check('account deletion signs out and returns to sign-in', '/login' in p1.url)
    p1.fill('input[autocomplete=username]', user); p1.fill('input[autocomplete=current-password]', 'Final5678'); p1.click('button:has-text("Sign in")'); p1.wait_for_timeout(1000)
    check('a deleted account cannot sign in', '/login' in p1.url)
    c1.close(); c2.close()

    # ---------------------------------------------------------------- admin
    print('Admin')
    ctx = b.new_context(bypass_csp=True, viewport={'width': 1440, 'height': 900}); ctx.add_init_script(SEEN); pg = ctx.new_page(); watch(pg)
    login(pg, 'admin', 'Admin@123')
    pg.goto(BASE + '/admin/providers'); pg.wait_for_selector('text=External providers')
    pg.wait_for_timeout(800)
    rows = pg.locator('table.data').first.locator('tbody tr').count()
    check('providers page lists all six providers', rows == 6, str(rows))
    check('unconfigured providers cannot be tested', pg.locator('tr:has-text("TMDB") button:has-text("Test")').is_disabled())
    check('no secret values are shown', 'apiKey' not in pg.content() and 'READ_ACCESS_TOKEN=' not in pg.content())
    pg.screenshot(path=f'{S}/70-admin-providers.png', full_page=True)
    axe(pg, 'admin providers')
    ctx.close()

    # ---------------------------------------------------------------- phone
    print('Phone')
    m = b.new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); m.add_init_script(SEEN); mp = m.new_page(); watch(mp)
    login(mp, 'aarav', 'Listener@123')
    mp.goto(BASE + '/song/1'); mp.wait_for_selector('h1'); mp.click('button:has-text("Play")'); mp.wait_for_timeout(1000)
    check('phone: queue button reachable in the player', mp.locator('button[aria-label="Show play queue"]').is_visible())
    mp.screenshot(path=f'{S}/71-phone-player.png')
    overflow = mp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('phone: no horizontal scrolling', overflow <= 1, str(overflow))
    b.close()

failed = [r for r in results if not r[1]]
with open(os.path.join(S, 'axe-report.json'), 'w') as f:
    json.dump(axe_report, f, indent=2)
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
minor = sum(len([v for v in r if v['impact'] in ('minor', 'moderate')]) for r in axe_report.values())
print(f'axe: {minor} minor/moderate rule violation(s) across {len(axe_report)} pages (details in screenshots/axe-report.json)')
if errors:
    print('Browser errors:'); [print('  ' + e) for e in errors[:30]]
sys.exit(1 if failed or errors else 0)
