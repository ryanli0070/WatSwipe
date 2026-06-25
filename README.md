# WatSwipe

A gesture-driven, **Tinder-style card UI for browsing and curating WaterlooWorks
co-op postings**. Swipe right to shortlist, left to pass.

WaterlooWorks has no public API and sits behind closed CAS authentication, so
WatSwipe is deliberately a **decentralized presentation + curation layer**: your
own browser is the only thing that ever touches WaterlooWorks, and no posting or
personal data ever leaves your device.

```
 waterlooworks.uwaterloo.ca            localhost:5173 (React app)
 ┌──────────────────────────┐         ┌──────────────────────────┐
 │ scraper.js               │         │ bridge.js                │
 │  • scrape job table      │         │  • read chrome.storage   │
 │  • -> chrome.storage     │         │  • window.postMessage →  │
 │  • click shortlist (P3)  │         │    React app (origin-chk)│
 └────────────┬─────────────┘         └────────────┬─────────────┘
              │ chrome.runtime                      │ postMessage
              ▼                                     ▼
   background/worker.js  ───────────────►  React SwipeDeck + IndexedDB
   (throttled shortlist queue,                       │
    random 1.5–3.0s between clicks)                  ▼ stateless
                                          FastAPI :8000  POST /rank
                                          (TF-IDF; no DB, no storage)
```

## Privacy & policy model

These are enforced by the **structure** of the system, not just by policy text:

- **Zero server retention.** The FastAPI backend has no database, no auth, and no
  job storage. `POST /rank` takes postings in the request body, computes scores
  in memory, and returns scores only — request bodies are never persisted or logged.
- **Client-side sovereignty.** All postings live only in the browser:
  `chrome.storage.local` (extension) and `IndexedDB` (app, via Dexie).
- **Authentication boundary.** The extension never reads password fields and never
  handles Quest/WatIAM credentials. It acts only on a tab **you** have already
  authenticated, and `host_permissions` is limited to the WaterlooWorks origin
  plus the local app.

### A note on the auto-shortlist sync (Phase 3)

The throttled sync clicks shortlist buttons **in your own authenticated session,
on postings you can already see**. The 1.5–3.0s random delay exists to be a polite
client of a shared university system — not to evade detection. Treat this feature
as opt-in and use it responsibly within WaterlooWorks' terms of use.

## Repository layout

```
backend/    FastAPI — stateless POST /rank (TF-IDF cosine ranking)
extension/  Chrome MV3 — scraper.js, bridge.js, background worker.js
frontend/   React + Vite + Framer Motion — virtualized 3-card swipe deck
```

## Running it

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload        # http://localhost:8000
pytest                               # run the ranking tests
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

With no extension installed, the app loads **mock data** so you can try the deck
immediately. The relevance search box calls the backend if it's running.

### 3. Extension

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked** →
   select the `extension/` folder.
2. Open `extension/fixtures/mock-waterlooworks.html` to develop against a mock
   job table (for the live site, the scraper auto-runs on
   `waterlooworks.uwaterloo.ca`). To scrape the local fixture during dev, add its
   `file://` (or a served) URL to the scraper's `matches` in `manifest.json`.
3. With the app open at `localhost:5173`, scraped postings flow to the deck via
   the `window.postMessage` bridge.

## How the 3-card virtualization works

`useSwipeQueue` keeps the full ordered list plus a moving `cursor`, but only ever
exposes `jobs.slice(cursor, cursor + 3)` → `[current, next, preload]`. `SwipeDeck`
renders just those, so the DOM holds **at most 3 cards** no matter how many hundreds
of postings exist. You can confirm this in DevTools: only ≤3 `.job-card` nodes are
mounted while swiping through the whole deck.

## Verification checklist

- **Backend:** `pytest` (5 tests) green; `curl localhost:8000/health` → `{"status":"ok"}`.
- **Frontend standalone:** `npm run dev`, swipe with mouse-drag and ←/→ keys; only
  ≤3 `.job-card` nodes in the DOM at any time.
- **Extension bridge:** load unpacked, open the mock fixture → `chrome.storage.local`
  populates; open the app → `JOBS_SYNC` arrives (origin-checked) and the deck fills.
- **Throttled sync:** right-swipe several cards → `worker.js` drains the queue with
  logged 1.5–3.0s gaps; the queue survives terminating the service worker from
  `chrome://extensions`.

## Out of scope (this iteration)

- Real WaterlooWorks DOM selectors (built against the mock fixture; swap them into
  `extension/src/lib/schema.js`).
- Chrome Web Store packaging and production app hosting.
- Embedding-based semantic ranking (TF-IDF for now, behind the same `/rank` shape).
