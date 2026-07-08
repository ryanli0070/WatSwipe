# WatSwipe — Session Handoff

_Last updated: 2026-07-07_

## TL;DR

This session took WatSwipe from "mock fixture selectors" to a **complete real
WaterlooWorks integration** with a redesigned two-step apply flow. Everything is
built and validated offline (jsdom + Playwright), **but the live auto-apply does
not fire on WaterlooWorks yet** — that is the one open bug, and diagnostic logging
is now in place to localize it. Everything else (real scraping, shortlist UI,
apply gating) is done.

## Git state

- Branch `main`, **7 commits ahead of `origin/main`, not pushed.** Working tree
  clean.
- This session's commits (oldest → newest):
  - `ce189e4` Replace mock selectors with real WaterlooWorks selectors
  - `d029cab` Implement Phase 3 auto-Apply with posting-specific gating
  - `397dfb3` Rename shortlist → apply across the stack; rewrite README
  - `4aab322` Swipe to shortlist; add Shortlist view with multi-select auto-apply
  - `ef36dd4` README: document shortlist → select → auto-apply two-step flow
  - `5a004b2` Require a résumé in the selected package before auto-submitting
  - `b589352` Add `[WatSwipe]` pipeline logging to debug live auto-apply (TEMP —
    remove once the bug below is fixed)

## The product model (redesigned this session)

Originally "swipe right = auto-apply." The user changed it to a safer two-step
flow, which is what now ships:

1. **Swipe right = SHORTLIST** (local only, persisted in IndexedDB, submits
   nothing). Left = pass.
2. **Shortlist tab** in the app = a durable folder of shortlisted postings with
   per-item checkboxes, Select-all, remove, and an **"Auto-apply to selected (N)"**
   button. That button is the ONLY thing that submits applications.
3. Applying is gated hard (see "Apply gating" below) and throttled (1.5–3.0s).

## 🔴 OPEN BUG — live auto-apply does not fire

**Symptom (confirmed with the user this session):**
- The app shows **"live data"** (so the extension IS connected; JOBS_SYNC works,
  the deck fills from real WaterlooWorks).
- Clicking **Auto-apply to selected** produces **no status text under the
  shortlist items** and **nothing happens on the WaterlooWorks tab.**

So the app→extension→scraper round trip is failing somewhere and no `SYNC_PROGRESS`
result comes back. **We have NOT yet seen the console logs** — the user ended the
session before capturing them. Getting those logs is step 1 next session.

**Diagnostics are wired (commit `b589352`).** `[WatSwipe]`-prefixed logs at every
hop. They live in THREE different consoles:

| Log | Console |
|---|---|
| `bridge relaying APPLY_BATCH` | the **localhost:5173 tab** (page console, F12) |
| `worker received APPLY_BATCH`, `worker drainQueue start`, `worker -> scraper CLICK_APPLY`, `no WaterlooWorks tab found`, `worker sendMessage failed` | the **service worker** (`chrome://extensions` → WatSwipe → "Inspect views: service worker") |
| `scraper applyToPosting`, `clicking Apply`, `wizard did not open`, `verdict`, `clicking Submit` | the **WaterlooWorks tab** console |

**Repro procedure:** reload extension → **reload BOTH the WW tab and the
localhost:5173 tab** → open all three consoles → Shortlist tab → select a posting →
Auto-apply → read the last `[WatSwipe]` line in each console.

**Decision tree (which hop the last log identifies):**
- No `bridge relaying…` on the localhost tab → app never sent it. (But source is
  "live data", so the bridge is loaded — this would be surprising. Double-check the
  Auto-apply button was enabled and `sendApplyBatch` ran.)
- `bridge relaying…` but no `worker received…` → `chrome.runtime.sendMessage` from
  the localhost content script isn't reaching the service worker.
- `worker: no WaterlooWorks tab found` → the WW tab URL doesn't match
  `https://waterlooworks.uwaterloo.ca/*` (get the exact URL of the postings page).
- `worker sendMessage failed … receiving end does not exist` → **the scraper is
  orphaned in the WW tab** (classic MV3). Reload the WW tab. **This is the #1
  suspect** — the user confirmed "live data" but that only proves the *localhost*
  content script is alive, NOT the *WaterlooWorks* one. If they reloaded the
  extension without reloading the WW tab, the scraper there is disconnected and the
  worker's `chrome.tabs.sendMessage` throws, the id is dropped, and — because the
  bridge relays SYNC_PROGRESS but the failed result is still reported — the app
  *should* show "verify manually"… but the user saw NOTHING, which is itself a clue
  (see below).
- `scraper: row not found` → the posting id isn't in the current WW table view.
- `scraper: wizard did not open` → clicking Apply didn't open `#applyWizard` as
  modeled (a real live-DOM finding to fix).
- `scraper verdict … safe:false` → correctly skipping (expected for most postings).

**Extra hypotheses to check (the user saw NOTHING — no status at all):**
1. **SYNC_PROGRESS may not be reaching the app.** The worker sends progress via
   `chrome.runtime.sendMessage({type: SYNC_PROGRESS, …})`. bridge.js relays it to
   the app via `postToApp`. If bridge's `chrome.runtime.onMessage` listener isn't
   firing (orphaned localhost content script, despite "live data" having been set
   earlier in the session), no status shows even though the worker ran. Verify the
   worker console shows `drainQueue start` at all — if the worker logs activity but
   the app shows nothing, the bug is the SYNC_PROGRESS return path, not the apply.
2. **The Auto-apply button may not be calling `sendApplyBatch`.** Confirm
   `bridge relaying APPLY_BATCH` appears. If it doesn't, the issue is entirely
   app-side (selection/handler), not the extension.
3. **`applyResults` wiring in the app** only updates on `payload.result.id`
   (SYNC_PROGRESS "clicked" events). "waiting-for-tab"/"done" states carry no
   `result`, so if the queue is stuck at `waiting-for-tab`, items show no per-item
   status — only the footer `Sync: waiting-for-tab` would show. Check the footer.

## What was accomplished this session

1. **Real WaterlooWorks scraping** (`ce189e4`). WW renders postings through a Vue
   data-grid, NOT a semantic table. Rewrote against a captured 50-row sample
   (`extension/fixtures/real-waterlooworks-sample.html`):
   - `schema.js`: selectors centralized in `WatSwipe.SELECTORS`; `normalizeRow`
     maps columns via a `<thead>` header→index map (survives column reorder/hide);
     job id from the row checkbox `input[name="dataViewerSelection"]`.
     description/tags are detail-page-only → left empty (follow-up).
   - `scraper.js`: waits for the Vue grid (absent at document_idle), observes the
     data-viewer container, debounces re-scrapes.
   - Validated: 50/50 rows, 0 missing id/title/company/deadline, 0 dup ids.
   - Row states detected: 44 apply-candidates / 4 already-applied
     (`Cancel Application`) / 2 not-qualified (`do not qualify`).

2. **Phase 3 auto-Apply + gating** (`d029cab`, `5a004b2`). Reverse-engineered the
   Apply flow from 3 captured wizard states
   (`real-waterlooworks-apply-dialogue*.html`, `Pre-screen-questions.html`):
   - Apply opens a full-view jQuery wizard `#applyWizard` (NOT a modal), with
     `js--ui-wizard-*` buttons. The advance button `.js--ui-wizard-next-btn`
     reads "Next" on intermediate steps and **"Submit"** on the final input step.
   - `schema.js evaluateApplyDialog(root)` → `{safe, reason}`. Skips if: a
     Pre-Screening Questions step / `input[name^="question_"]` exists; the selected
     package's doc list (`ul.comma-list li`) has anything outside the safe set
     (Résumé, Grade Report, Co-op Work History); or no résumé is selected.
   - `scraper.js applyToPosting(id)`: click Apply → verify wizard is for this
     posting (`(ID: n)` in header) → Gate 1 `evaluateApplyDialog` safe → Gate 2
     next-btn text is exactly "Submit" → click Submit → wait for "Done" → click
     Done. Any deviation CANCELS instead of guessing. Reports `submit-unconfirmed`
     if confirmation never appears.
   - **It never selects a package/résumé** — it submits whatever WaterlooWorks has
     pre-selected by default. The résumé guard ensures a résumé is actually
     attached before submitting.
   - Validated (jsdom): detection correct on all 3 real fixtures (both real
     postings SKIP — 478077 needs an "Other - Per Job Posting" doc, 478075 has
     pre-screening) + synthetic safe/empty/no-résumé cases; orchestration
     control-flow across safe/cover-letter/pre-screening/unexpected-step — submit
     fires only on the fully-safe path.

3. **Shortlist view + two-step flow** (`4aab322`). See "The product model" above.
   `useSwipeQueue` right-swipe now records a "shortlist" decision (no apply-on-
   swipe). New `ShortlistView.jsx`, `db.getShortlistedJobs/removeDecision/
   countShortlist`, `useExtensionBridge` accumulates `applyResults` by id, App has
   Deck|Shortlist tab nav with a count badge. Verified in-browser via Playwright
   (mock mode): swipe→shortlist→badge, list render, multi-select, select-all
   (fixed a `<label>`-wrapping double-fire), remove, apply-button gated
   off-extension. `npm run build` passes.

4. **Rename shortlist → apply** (`397dfb3`) where the code actually applies (wire
   constants `APPLY_BATCH`/`CLICK_APPLY`, worker/scraper), and README rewritten for
   the auto-apply model; `JobPosting.shortlisted` → `applied` (now populated from
   the real already-applied state). Swipe-action UI reverted to "Shortlist" in
   `4aab322` since swiping shortlists again.

## Apply gating — the exact rule (for reference)

Auto-submit ONLY when the selected package needs nothing posting-specific:
- **Skip** if pre-screening questions (`input[name^="question_"]` or a
  "Pre-Screening Questions" step title).
- **Skip** if any package doc (`ul.comma-list li`) is outside {Résumé, Grade
  Report, Co-op Work History}. (Cover Letter, "Other - Per Job Posting", etc.)
- **Skip** if no résumé is in the selected package (`no-resume-selected`).
- **Submit** only if all above pass AND next-btn === "Submit". Never picks a
  package; uses WaterlooWorks' default.

Consequence: most postings SKIP; auto-apply fires on relatively few. This is the
intended fail-safe behavior.

## Key files

- `extension/src/lib/schema.js` — `SELECTORS`, `normalizeRow`, `readColumns`,
  `evaluateApplyDialog`, `SAFE_DOCS`.
- `extension/src/content/scraper.js` — scrape + `applyToPosting` orchestration.
- `extension/src/background/worker.js` — throttled apply queue (survives SW
  restart via chrome.storage + alarms).
- `extension/src/content/bridge.js` — app↔extension postMessage relay.
- `frontend/src/components/ShortlistView.jsx` — the new multi-select apply UI.
- `frontend/src/hooks/useSwipeQueue.js` — swipe → shortlist decision.
- `frontend/src/hooks/useExtensionBridge.js` — JOBS_SYNC in, `applyResults` accum.
- `extension/fixtures/real-waterlooworks-*.html` — captured live DOM (the ground
  truth all selectors were built + validated against). Keep these.

## Gotchas (save the next session the pain)

- **MV3 orphaned content scripts.** Reloading the extension disconnects content
  scripts in already-open tabs. After EVERY `chrome://extensions` reload, reload
  BOTH the WaterlooWorks tab AND the localhost:5173 tab. "live data" showing only
  proves the localhost content script is alive — the WaterlooWorks scraper can
  still be orphaned. **This is the leading hypothesis for the open bug.**
- **Three separate consoles** (see the bug section) — logs are split across the
  localhost tab, the service worker, and the WW tab. An empty SW console means
  nothing by itself; reopen it via "Inspect views: service worker" after reloads.
- **CAS auth is user-only** — do NOT attempt to bypass it. All live testing needs
  the user driving an authenticated session.
- **Auto-apply submits REAL, irreversible applications.** The live submit sequence
  is still inferred from static captures and has NEVER been confirmed on the live
  site. The first successful live run must be watched.
- **jsdom validation harness** lives in the session scratchpad (not committed);
  re-create from the fixtures if needed — load `schema.js` into a JSDOM window and
  call `readColumns`/`normalizeRow`/`evaluateApplyDialog`.

## Next steps (in order)

1. **Fix the open bug.** Reproduce with all three consoles open (reload both tabs
   first), read the last `[WatSwipe]` log per console, walk the decision tree
   above. Leading suspect: orphaned WW scraper → reload the WW tab. Second: the
   SYNC_PROGRESS return path (worker ran but app shows nothing) or a stuck
   `waiting-for-tab` (check the app footer, not just item status).
2. **Confirm one clean live apply end-to-end** on a posting safe to actually apply
   to (watch it — irreversible).
3. **Remove the `[WatSwipe]` diagnostic logging** (`b589352`) once fixed.
4. Retire the now-unused `extension/fixtures/mock-waterlooworks.html`.
5. Optional: `git push` (7 commits unpushed); explicit package selection if the
   user wants a specific application package instead of WW's default;
   description/tags via posting detail pages.
