"""Takes real screenshots of the running MUSE Query Studio (streamlit run app/streamlit_app.py) with Playwright:
one per query (query + output) and one per other tab. Output: docs/phase3/screenshots/*.png
  python3 phase3/capture_screenshots.py [http://localhost:8501]
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent / 'app'))
import muse_queries as M  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8501'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'phase3' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)


def settle(page):
    page.wait_for_timeout(600)
    page.wait_for_function("() => !document.querySelector('[data-testid=\"stStatusWidget\"]')?.innerText?.includes('Running')", timeout=30000)
    page.wait_for_timeout(1200)


def shot(page, name):
    """Grow the window to the full height of the content so nothing is cut off, then capture the whole app."""
    h = page.evaluate("""() => {
        const m = document.querySelector('[data-testid="stMainBlockContainer"]');
        return Math.ceil(m.getBoundingClientRect().height) + 140;
    }""")
    page.set_viewport_size({'width': 1500, 'height': max(900, h)})
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / name))
    page.set_viewport_size({'width': 1500, 'height': 1000})
    print(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1500, 'height': 1000}, device_scale_factor=1.5)
    page.goto(URL)
    page.wait_for_selector('text=MUSE Query Studio', timeout=60000)
    settle(page)
    shot(page, '00_dashboard.png')
    page.get_by_role('tab', name='📚 Query library').click()
    settle(page)
    for q in M.parse_queries():
        box = page.locator('[data-testid="stSelectbox"]').first
        box.click()
        page.keyboard.type(f'{q.id} ·')
        page.keyboard.press('Enter')
        settle(page)
        page.wait_for_selector(f'text={q.question[:40]}')
        shot(page, f'{q.id}_{q.title.lower().replace(" ", "_").replace(chr(39), "").replace(",", "").replace("-", "_")}.png')
    page.get_by_role('tab', name='🌈 Mood explorer').click()
    settle(page)
    shot(page, '18_mood_explorer.png')
    page.get_by_role('tab', name='⌨️ SQL playground').click()
    settle(page)
    page.get_by_role('button', name='Run query').click()
    settle(page)
    shot(page, '19_sql_playground.png')
    ta = page.locator('textarea').first
    ta.fill('DELETE FROM songs WHERE song_id = 1;')
    page.get_by_role('button', name='Run query').click()
    settle(page)
    shot(page, '20_sql_playground_blocked.png')
    b.close()
