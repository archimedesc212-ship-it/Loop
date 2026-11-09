import json, time, urllib.request
from playwright.sync_api import sync_playwright
import os
S = os.environ.get('SHOTS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'))
os.makedirs(S, exist_ok=True)
BASE = os.environ.get('BASE_URL', 'http://localhost:4000')
errors = []; log = []
user = f'demo{int(time.time())%100000}'
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}")
    pg = ctx.new_page()
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    pg.on('response', lambda r: errors.append(f'[http {r.status}] {r.url}') if r.status >= 500 and '/api/' in r.url else None)
    # 1-2 register
    pg.goto(BASE + '/register'); pg.wait_for_timeout(600)
    pg.fill('input[autocomplete=name]', 'Demo Student'); pg.fill('input[autocomplete=username]', user)
    pg.fill('input[type=email]', f'{user}@example.com'); pg.fill('input[type=password]', 'Demo1234')
    pg.click('button:has-text("Create account")'); pg.wait_for_timeout(1500)
    log.append('after register: ' + pg.url)
    # onboarding
    pg.click('button.pick:has-text("Telugu")'); pg.click('button.pick:has-text("Hindi")'); pg.screenshot(path=f'{S}/20-onboarding.png')
    pg.click('button:has-text("Continue")'); pg.wait_for_timeout(300)
    pg.click('button.pick:has-text("EDM")'); pg.click('button.pick:has-text("Film Dance")'); pg.click('button:has-text("Continue")'); pg.wait_for_timeout(300)
    pg.click('button:has-text("Continue")'); pg.wait_for_timeout(300)
    pg.locator('button.pick').first.click(); pg.screenshot(path=f'{S}/20b-onboarding-composers.png')   # composers / film music step
    pg.click('button:has-text("Continue")'); pg.wait_for_timeout(300)
    pg.click('button.pick:has-text("Energetic")'); pg.click('button:has-text("Continue")'); pg.wait_for_timeout(300)
    pg.click('button:has-text("Build my first mix")'); pg.wait_for_timeout(2500)
    log.append('after onboarding: ' + pg.url)
    pg.screenshot(path=f'{S}/21-newuser-home.png')
    # 4-7 mood
    pg.fill('.feel-input input', 'I want something energetic'); pg.click('.feel-input button'); pg.wait_for_timeout(3000)
    first = pg.locator('.track .t-title').first.inner_text(); log.append('first rec: ' + first)
    before = [t for t in pg.locator('.track .t-title').all_inner_texts()[:10]]
    pg.screenshot(path=f'{S}/22-energetic.png', full_page=False)
    pg.click('button[aria-label="Why this song?"] >> nth=0'); pg.wait_for_timeout(300)
    pg.locator('.why').first.screenshot(path=f'{S}/23-why.png')
    # 8-9 play at demo speed until finished
    pg.click('.track button >> nth=0'); pg.wait_for_timeout(800)
    pg.click('.player button:has-text("Demo ×10")')
    pg.wait_for_timeout(27000)
    pg.screenshot(path=f'{S}/24-after-play.png')
    # 10 rate 5 stars on song page
    pg.locator('.track a.t-title').first.click(); pg.wait_for_timeout(1200)
    pg.click('button[aria-label="5 stars"]'); pg.wait_for_timeout(1000)
    # 11 add to playlist via new playlist
    pg.on('dialog', lambda d: d.accept('Demo energy'))
    pg.click('button[aria-label^="Add "]'); pg.wait_for_timeout(500); pg.click('.menu button:has-text("New playlist")'); pg.wait_for_timeout(1200)
    # 12 analytics
    pg.goto(BASE + '/profile'); pg.wait_for_timeout(2500); pg.screenshot(path=f'{S}/25-newuser-profile.png', full_page=True)
    # 13-14 recommendations again
    pg.goto(BASE + '/mood'); pg.wait_for_timeout(800)
    pg.fill('.feel-input input', 'I want something energetic'); pg.click('.feel-input button'); pg.wait_for_timeout(3000)
    after = [t for t in pg.locator('.track .t-title').all_inner_texts()[:10]]
    log.append('before: ' + ', '.join(before)); log.append('after:  ' + ', '.join(after))
    # library
    pg.goto(BASE + '/library'); pg.wait_for_timeout(1200); pg.screenshot(path=f'{S}/26-library.png')
    print('\n'.join(log)); print('ERRORS:', '\n'.join(errors) or 'none'); print('USER', user)
    b.close()
