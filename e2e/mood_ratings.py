"""
Browser check for mood-wise percentage ratings (migration 0004), against the running app.
Two listeners rate song 1; the average, count, ranking and validation are checked in the UI.
  python3 e2e/mood_ratings.py      (app on BASE_URL, default http://localhost:4000)
The ratings it creates are removed again at the end through the API.
"""
import os
import sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE_URL', 'http://localhost:4000')
S = os.environ.get('SHOTS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'))
os.makedirs(S, exist_ok=True)
errors, checks = [], []


def ok(label):
    checks.append(label)
    print('  ✓', label)


def session(b, user, pw, viewport=(1440, 900)):
    ctx = b.new_context(viewport={'width': viewport[0], 'height': viewport[1]})
    ctx.add_init_script("try { localStorage.setItem('muse.introSeen', '1') } catch (e) {}")
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    pg.goto(BASE + '/login')
    pg.fill('input[autocomplete=username]', user)
    pg.fill('input[type=password]', pw)
    pg.click('button:has-text("Sign in")')
    pg.wait_for_url(lambda u: '/login' not in u, timeout=15000)
    return ctx, pg


def rate(pg, mood, value):
    box = pg.get_by_label(f'Your {mood} match, number from 0 to 100')
    box.fill(str(value))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx1, a = session(b, 'aarav', 'Listener@123')
    a.goto(BASE + '/song/1')
    panel = a.locator('section.mood-ratings')
    expect(panel.get_by_text('How well does it fit each mood?')).to_be_visible(timeout=15000)
    panel.scroll_into_view_if_needed()
    a.screenshot(path=f'{S}/20-mood-ratings-empty.png', full_page=False)
    ok('rating panel loads on the song page')

    panel.get_by_role('button', name='Show all 17 moods').click()
    rate(a, 'Romantic', '101')
    expect(panel.get_by_role('alert')).to_contain_text('between 0 and 100')
    expect(panel.get_by_role('button', name='Save 1 rating')).to_have_count(0)
    ok('101 is rejected in the form and Save stays disabled')
    rate(a, 'Romantic', '92.5')
    rate(a, 'Calm', '65')
    panel.get_by_role('button', name='Save 2 ratings').click()
    expect(a.get_by_text('Saved 2 mood ratings')).to_be_visible(timeout=10000)
    row = panel.locator('.mr-row', has_text='Romantic')
    expect(row).to_contain_text('92.50%')
    expect(row).to_contain_text('1 rating')
    ok('saving stores both ratings and the listeners column shows 92.50% · 1 rating')

    ctx2, n = session(b, 'arjun', 'Listener@123')
    n.goto(BASE + '/song/1')
    p2 = n.locator('section.mood-ratings')
    expect(p2.locator('.mr-row', has_text='Romantic')).to_contain_text('92.50%', timeout=15000)
    rate(n, 'Romantic', '84')
    p2.get_by_role('button', name='Save 1 rating').click()
    expect(p2.locator('.mr-row', has_text='Romantic')).to_contain_text('88.25%', timeout=10000)
    expect(p2.locator('.mr-row', has_text='Romantic')).to_contain_text('2 ratings')
    p2.scroll_into_view_if_needed()
    n.screenshot(path=f'{S}/21-mood-ratings-second-user.png')
    ok("a second listener's rating updates the average to 88.25% over 2 ratings")

    # the first user still sees their own value, not the average
    a.reload()
    expect(a.get_by_label('Your Romantic match, number from 0 to 100')).to_have_value('92.5', timeout=15000)
    ok("each user sees their own saved value")

    a.goto(BASE + '/mood')
    trm = a.locator('section', has=a.get_by_role('heading', name='Rated by listeners'))
    trm.scroll_into_view_if_needed()
    sel = trm.get_by_label('Mood')
    sel.select_option(next(o.get_attribute('value') for o in sel.locator('option').all() if 'Romantic' in o.inner_text()))
    first = trm.locator('.trm-item').first
    expect(first).to_contain_text('88.25%', timeout=10000)
    expect(first).to_contain_text('2 ratings')
    ok('the Mood page ranks the song for Romantic with its real average and count')
    trm.get_by_role('button', name='Adjusted for few ratings').click()
    expect(trm.get_by_text('Adjusted score =')).to_be_visible()
    expect(trm.locator('.score-pill').first).to_be_visible()
    a.screenshot(path=f'{S}/22-top-rated-adjusted.png', full_page=False)
    trm.get_by_label('At least').select_option('3')
    expect(trm.get_by_text('No romantic ratings yet')).to_be_visible(timeout=10000)
    ok('a minimum of 3 ratings leaves the 2-rating song out, with an explanation')

    # phone layout
    ctx3, m = session(b, 'aarav', 'Listener@123', viewport=(390, 844))
    m.goto(BASE + '/song/1')
    mp = m.locator('section.mood-ratings')
    expect(mp.get_by_text('How well does it fit each mood?')).to_be_visible(timeout=15000)
    mp.scroll_into_view_if_needed()
    m.screenshot(path=f'{S}/23-mood-ratings-mobile.png')
    width = m.evaluate('document.documentElement.scrollWidth')
    if width > 392:
        errors.append(f'horizontal scroll on phone: {width}px')
    else:
        ok('no horizontal scroll at 390 px')

    # clean up through the API (as each user)
    for pg in (a, n):
        for mood_id in pg.evaluate("""async () => {
            const r = await fetch('/api/songs/1/mood-ratings', { credentials: 'same-origin' }).then((x) => x.json());
            return r.moods.filter((m) => m.mine).map((m) => m.id); }"""):
            pg.evaluate("""async (id) => {
                const csrf = document.cookie.split('; ').find((c) => c.startsWith('muse_csrf=')).split('=')[1];
                await fetch('/api/songs/1/mood-ratings/' + id, { method: 'DELETE', credentials: 'same-origin',
                  headers: { 'X-CSRF-Token': decodeURIComponent(csrf) } }); }""", mood_id)
    b.close()

print(f'{len(checks)} checks passed')
real = [e for e in errors if 'status of 4' not in e]
if real:
    print('PROBLEMS:', *real, sep='\n  ')
    sys.exit(1)
