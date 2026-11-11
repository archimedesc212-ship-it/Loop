from playwright.sync_api import sync_playwright
import os
S = os.environ.get('SHOTS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'))
os.makedirs(S, exist_ok=True)
BASE = os.environ.get('BASE_URL', 'http://localhost:4000')
errors = []
def login(pg, u, pw):
    pg.goto(BASE + '/login'); pg.wait_for_timeout(500)
    pg.fill('input[autocomplete=username]', u); pg.fill('input[type=password]', pw)
    pg.click('button:has-text("Sign in")'); pg.wait_for_timeout(1800)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}")
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(f'[{m.type}] {pg.url} {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {pg.url} {e}'))
    pg.on('response', lambda r: errors.append(f'[http {r.status}] {r.url}') if r.status >= 500 else None)
    login(pg, 'admin', 'Admin@123')
    for name, url, w in [('30-admin', '/admin', 2500), ('31-catalog', '/admin/catalog', 1500), ('33-pipeline', '/admin/pipeline', 1500), ('35-models', '/admin/models', 1200),
                         ('36-users', '/admin/users', 1200), ('37-health', '/admin/health', 2500), ('38-perf', '/admin/performance', 2500), ('39-audit', '/admin/audit', 1200), ('34b-content', '/admin/content', 1200)]:
        pg.goto(BASE + url); pg.wait_for_timeout(w); pg.screenshot(path=f'{S}/{name}.png', full_page=True)
    # pipeline ingest then review queue
    pg.goto(BASE + '/admin/pipeline'); pg.wait_for_timeout(1200)
    pg.click('button:has-text("Ingest catalog-feed")'); pg.wait_for_timeout(5000)
    pg.screenshot(path=f'{S}/33b-pipeline-after.png')
    pg.goto(BASE + '/admin/review'); pg.wait_for_timeout(1500); pg.screenshot(path=f'{S}/32-review.png', full_page=True)
    # private session as listener
    ctx2 = b.new_context(viewport={'width': 1440, 'height': 900}); ctx2.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}"); pg2 = ctx2.new_page()
    pg2.on('pageerror', lambda e: errors.append(f'[pageerror] {pg2.url} {e}'))
    login(pg2, 'meera', 'Listener@123')
    pg2.click('button:has-text("Private")'); pg2.wait_for_timeout(1500)
    pg2.goto(BASE + '/mix/context/NIGHT'); pg2.wait_for_timeout(2000)
    pg2.click('.track button >> nth=0'); pg2.wait_for_timeout(1500)
    pg2.click('.player button:has-text("Demo ×10")'); pg2.wait_for_timeout(9000)
    pg2.click('button[aria-label^="Next"]'); pg2.wait_for_timeout(1500)
    pg2.goto(BASE + '/private'); pg2.wait_for_timeout(1500); pg2.screenshot(path=f'{S}/40-private.png', full_page=True)
    pg2.click('button:has-text("End private session")'); pg2.wait_for_timeout(1500)
    # mobile
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); m.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}"); mp = m.new_page()
    mp.on('pageerror', lambda e: errors.append(f'[pageerror mobile] {mp.url} {e}'))
    login(mp, 'aarav', 'Listener@123')
    mp.screenshot(path=f'{S}/50-m-home.png')
    for name, url in [('51-m-mood', '/mood'), ('52-m-world', '/world'), ('53-m-profile', '/profile'), ('54-m-song', '/song/12')]:
        mp.goto(BASE + url); mp.wait_for_timeout(2200); mp.screenshot(path=f'{S}/{name}.png')
    mp.goto(BASE + '/mix/daily'); mp.wait_for_timeout(2200); mp.click('.track button >> nth=0'); mp.wait_for_timeout(800); mp.screenshot(path=f'{S}/55-m-player.png')
    over = mp.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    t = b.new_context(viewport={'width': 820, 'height': 1180}); t.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}"); tp = t.new_page(); login(tp, 'aarav', 'Listener@123'); tp.screenshot(path=f'{S}/56-tablet.png')
    print('mobile horizontal overflow:', over)
    print('ERRORS:', '\n'.join(errors) or 'none')
    b.close()
