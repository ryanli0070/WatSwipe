/**
 * scraper.js — runs on waterlooworks.uwaterloo.ca.
 *
 * Responsibilities:
 *   1. Scrape the visible job data-grid into JobPostings and persist to
 *      chrome.storage.local (the ingestion node).
 *   2. Handle CLICK_SHORTLIST messages from the background worker to act on one
 *      posting (Phase 3 throttled sync). Per the current design a "shortlist" =
 *      Apply, and we ONLY auto-submit when the posting needs no posting-specific
 *      input (cover letter / additional documents / extra questions); otherwise
 *      we skip it for manual application. That gating needs the Apply-dialog DOM,
 *      which is not captured yet, so the click is currently a safe no-op (below).
 *
 * WaterlooWorks is a Vue SPA: the grid renders asynchronously after the content
 * script is injected (run_at: document_idle), so we wait for the table before the
 * first scrape and observe for re-renders (pagination / filtering happen in place).
 *
 * It acts ONLY on the already-authenticated page the user opened. It never reads
 * password fields and never touches credentials.
 */
(function () {
  const { storage, normalizeRow, readColumns, SELECTORS, MSG } = globalThis.WatSwipe;

  // --- Phase 1: scrape -----------------------------------------------------
  async function scrapeTable() {
    const table = document.querySelector(SELECTORS.table);
    if (!table) return 0;

    const columns = readColumns(table);
    const rows = table.querySelectorAll(SELECTORS.bodyRows);
    const postings = [];
    for (const row of rows) {
      const posting = normalizeRow(row, columns);
      if (posting) postings.push(posting);
    }
    if (postings.length) {
      await storage.upsertJobs(postings);
    }
    return postings.length;
  }

  // Debounce: Vue mutates the grid heavily during a re-render; coalesce those
  // into a single scrape instead of one per micro-mutation.
  let scrapeTimer = null;
  function scheduleScrape() {
    clearTimeout(scrapeTimer);
    scrapeTimer = setTimeout(scrapeTable, 300);
  }

  // Attach the re-render observer once the grid exists, then do the first scrape.
  function startScraping(table) {
    scrapeTable();
    const container = table.closest("#dataViewerPlaceholder") || table.parentNode;
    const observer = new MutationObserver(scheduleScrape);
    observer.observe(container, { childList: true, subtree: true });
  }

  // Bootstrap: the grid may not exist yet at injection time. Wait for it.
  function waitForTable() {
    const existing = document.querySelector(SELECTORS.table);
    if (existing) {
      startScraping(existing);
      return;
    }
    const bootObserver = new MutationObserver(() => {
      const table = document.querySelector(SELECTORS.table);
      if (table) {
        bootObserver.disconnect();
        startScraping(table);
      }
    });
    bootObserver.observe(document.body, { childList: true, subtree: true });
  }

  waitForTable();

  // --- Phase 3: act on one posting on request ------------------------------
  function findRow(id) {
    const input = document.querySelector(
      `${SELECTORS.rowIdInput}[value="${id}"]`
    );
    return input ? input.closest("tr.table__row--body") : null;
  }

  function clickShortlist(id) {
    const row = findRow(id);
    if (!row) return { id, ok: false, reason: "row-not-found" };

    // States where Apply is unavailable — skip cleanly, never treat as an error
    // that would wedge the queue.
    if (row.querySelector(SELECTORS.appliedButton)) {
      return { id, ok: false, reason: "already-applied" };
    }
    if (row.querySelector(SELECTORS.ineligibleButton)) {
      return { id, ok: false, reason: "not-qualified" };
    }

    const button = row.querySelector(SELECTORS.applyButton);
    if (!button) return { id, ok: false, reason: "apply-button-not-found" };

    // The Apply flow opens a multi-step dialog (package selection, and sometimes
    // posting-specific cover letter / documents). We must NOT blind-click Apply
    // and abandon the dialog. Until the dialog DOM is captured and the
    // "safe to auto-submit?" gating is implemented, report pending without
    // touching the page.
    return { id, ok: false, reason: "apply-dialog-not-implemented" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === MSG.CLICK_SHORTLIST) {
      sendResponse(clickShortlist(message.id));
    }
    return true; // keep the channel open for the async-style response
  });
})();
