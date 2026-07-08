# WatSwipe

A gesture-driven, **Tinder-style card UI for browsing and applying to WaterlooWorks
co-op postings**. Swipe right to **shortlist**, left to pass — then, from your
shortlist, select the postings you want and **auto-apply** to just those.

WaterlooWorks has no public API and sits behind closed CAS authentication, so
WatSwipe is deliberately a **decentralized presentation + curation layer**: your
own browser is the only thing that ever touches WaterlooWorks, and no posting or
personal data ever leaves your device.

```
 waterlooworks.uwaterloo.ca            localhost:5173 (React app)
 ┌──────────────────────────┐         ┌──────────────────────────┐
 │ scraper.js               │         │ bridge.js                │
 │  • scrape job data-grid  │         │  • read chrome.storage   │
 │  • -> chrome.storage     │         │  • window.postMessage →  │
 │  • auto-Apply (Phase 3)  │         │    React app (origin-chk)│
 └────────────┬─────────────┘         └────────────┬─────────────┘
              │ chrome.runtime                      │ postMessage
              ▼                                     ▼
   background/worker.js  ───────────────►  React SwipeDeck + IndexedDB
   (throttled apply queue,                           │
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

### The auto-Apply sync (Phase 3) — read this

Swiping right only **shortlists** a posting locally — it submits nothing. Applying
is a separate, deliberate step: open the **Shortlist** tab, multi-select the
postings you want (like selecting files in a folder), and click **Auto-apply to
selected**. Only then does WatSwipe act on WaterlooWorks — **submitting real co-op
applications** in your own authenticated session. Applications are hard to reverse,
so the sync is deliberately conservative and **opt-in**:

- **It only auto-submits postings that need nothing beyond your standard package**
  — Résumé, Grade Report, and University of Waterloo Co-op Work History (the
  documents that come from your default application package).
- **It skips (and leaves for you to apply manually) any posting that needs
  posting-specific input** — pre-screening questions, a required cover letter, an
  "Other - Per Job Posting" document, or any non-standard document. On these it
  opens the Apply wizard, detects the requirement, and **cancels** without
  submitting.
- **Two layered guards** protect every submit: (1) the wizard must pass the
  document/pre-screening check, **and** (2) the wizard's advance button must read
  exactly `Submit` (only present on a single-input step). Any deviation cancels
  instead of guessing.
- **Throttling.** The queue drains one posting at a time with a random 1.5–3.0s
  gap — to be a polite client of a shared university system, not to evade
  detection.

Because most postings ask for *something* posting-specific, expect auto-Apply to
fire on relatively few of them; the rest are queued for you to finish by hand.
**Use this feature responsibly within WaterlooWorks' terms of use, and watch the
first live run** — clicking `Submit` sends a real application.

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
2. Log into **WaterlooWorks** and open the co-op **Job Postings** table. The
   scraper auto-runs on `waterlooworks.uwaterloo.ca`, waits for the Vue data-grid
   to render, and scrapes it into `chrome.storage.local`.
3. With the app open at `localhost:5173`, scraped postings flow to the deck via
   the `window.postMessage` bridge. Right-swipes add postings to your **Shortlist**
   tab; from there you select some and trigger the throttled auto-Apply sync (see
   Phase 3 above).

> **MV3 reload gotcha:** reloading the extension from `chrome://extensions`
> disconnects content scripts in already-open tabs. After a reload, reload the
> WaterlooWorks tab **and** the `localhost:5173` tab, or `tabs.sendMessage` will
> report "receiving end does not exist."

## How the 3-card virtualization works

`useSwipeQueue` holds the full ordered list of postings and **derives the deck as
the ones you haven't decided on yet** (`jobs.filter(j => !decided.has(j.id))`),
then exposes a window of at most 3 → `[current, next, preload]`. `SwipeDeck`
renders just those, so the DOM holds **at most 3 `.job-card` nodes** no matter how
many hundreds of postings exist. Deriving (rather than tracking a moving cursor)
means a live re-scrape — e.g. the `JOBS_SYNC` that fires after an Apply click
mutates the source table — can re-push the whole list **without** resurfacing a
card you already swiped or resetting your position.

## Verification checklist

- **Backend:** `pytest` (5 tests) green; `curl localhost:8000/health` → `{"status":"ok"}`.
- **Frontend standalone:** `npm run dev`, swipe with mouse-drag and ←/→ keys; only
  ≤3 `.job-card` nodes in the DOM at any time; `npm run build` passes.
- **Extension bridge:** load unpacked, open the live postings table →
  `chrome.storage.local` populates; open the app → `JOBS_SYNC` arrives
  (origin-checked) and the deck fills.
- **Shortlist → auto-Apply:** right-swipe several cards → they appear in the
  **Shortlist** tab with a count badge; select some and click **Auto-apply to
  selected** → `worker.js` drains the queue with 1.5–3.0s gaps; safe postings
  submit, posting-specific ones report a skip reason; the queue survives
  terminating the service worker from `chrome://extensions`.

## Out of scope (this iteration)

- **Description & tags** are scraped as empty: WaterlooWorks shows them only on the
  posting detail page, not the list row (a detail-page-scraping follow-up).
- Chrome Web Store packaging and production app hosting.
- Embedding-based semantic ranking (TF-IDF for now, behind the same `/rank` shape).
```
