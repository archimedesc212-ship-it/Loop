import sys, json
from playwright.sync_api import sync_playwright
import os
S = os.environ.get('SHOTS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'))
os.makedirs(S, exist_ok=True)
BASE = os.environ.get('BASE_URL', 'http://localhost:4000')
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    ctx.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}")
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(f'[{m.type}] {pg.url} {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {pg.url} {e}'))
    pg.on('response', lambda r: errors.append(f'[http {r.status}] {r.url}') if r.status >= 400 and '/api/' in r.url else None)
    pg.goto(BASE + '/login'); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{S}/01-login.png')
    pg.fill('input[autocomplete=username]', 'aarav'); pg.fill('input[type=password]', 'Listener@123')
    pg.click('button:has-text("Sign in")'); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{S}/02-home.png')
    pg.screenshot(path=f'{S}/02-home-full.png', full_page=True)
    for name, url, wait in [('03-mood', '/mood', 1200), ('05-world', '/world', 2500), ('06-daily', '/mix/daily', 2000), ('07-search', '/search?q=vennela', 1800),
                            ('08-song', '/song/1', 1500), ('09-profile', '/profile', 2500), ('10-library', '/library', 1200), ('11-recovery', '/mix/recovery', 2500),
                            ('12-artist', '/artist/3', 1200), ('13-settings', '/settings', 1200), ('14-smart', '/mix/smart/MOST_REPLAYED', 1500)]:
        pg.goto(BASE + url); pg.wait_for_timeout(wait)
        pg.screenshot(path=f'{S}/{name}.png', full_page=True)
    # mood flow via text
    pg.goto(BASE + '/mood'); pg.wait_for_timeout(1000)
    pg.fill('.feel-input input', "I've had a rough day and just want something peaceful")
    pg.click('.feel-input button'); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{S}/04-mood-result.png', full_page=True)
    # open why panel + play first
    pg.click('button[aria-label="Why this song?"] >> nth=0'); pg.wait_for_timeout(500)
    pg.click('.track button >> nth=0'); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{S}/04b-why-player.png')
    print('\n'.join(errors[:40]) or 'NO CONSOLE ERRORS')
    b.close()
