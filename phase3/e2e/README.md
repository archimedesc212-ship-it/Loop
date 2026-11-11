# Browser walk-throughs

Playwright (Python) scripts that drive the built app in Chromium and fail loudly on
console errors, page errors and 5xx API responses. Run them against a running server
with demo data (`npm run db:setup && npm run build && npm start`):

```bash
pip install playwright && python -m playwright install chromium
python e2e/listener_tour.py          # aarav: every listener page
python e2e/new_listener.py           # register → onboard → mood → play → rate → playlist → profile
python e2e/admin_private_devices.py  # admin pages, a private session, phone and tablet layouts
python e2e/finalisation.py           # intro, cookie sessions, playback states, queue, feedback, film/language pages,
                                     # account security, providers page, offline banner, keyboard, axe-core scan
```

`finalisation.py` needs `npm install` (it injects `node_modules/axe-core/axe.min.js`; its
browser contexts bypass the CSP only so the scanner script can be injected). The
walk-throughs mark the introduction as seen; `finalisation.py` tests it. Each script
signs in several times: if you run them repeatedly, failed sign-ins count towards
`RATE_LIMIT_AUTH_FAILURES`.

`BASE_URL` (default `http://localhost:4000`) and `SHOTS` (default `e2e/screenshots`) can be set in the environment.
