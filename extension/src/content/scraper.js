/**
 * scraper.js — runs on waterlooworks.uwaterloo.ca.
 *
 * Responsibilities:
 *   1. Scrape the visible job data-grid into JobPostings and persist to
 *      chrome.storage.local (the ingestion node).
 *   2. Handle CLICK_APPLY messages from the background worker to apply to one
 *      posting (Phase 3 throttled sync). A right-swipe = Apply, and we ONLY
 *      auto-submit when the posting needs no posting-specific input (cover
 *      letter / additional documents / pre-screening questions); otherwise we
 *      cancel the wizard and skip it for manual application (see applyToPosting).
 *
 * WaterlooWorks is a Vue SPA: the grid renders asynchronously after the content
 * script is injected (run_at: document_idle), so we wait for the table before the
 * first scrape and observe for re-renders (pagination / filtering happen in place).
 *
 * It acts ONLY on the already-authenticated page the user opened. It never reads
 * password fields and never touches credentials.
 */
(function () {
  const { storage, normalizeRow, readColumns, evaluateApplyDialog, SELECTORS, MSG } =
    globalThis.WatSwipe;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isShown = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const c = typeof p.className === "string" ? p.className : "";
      if (/\bhide\b/.test(c) || /display--none/.test(c)) return false;
    }
    return !!el;
  };
  // Poll `fn` until it returns truthy or `timeout` elapses; returns the value or null.
  async function waitFor(fn, timeout, poll = 150) {
    const start = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - start > timeout) return null;
      await sleep(poll);
    }
  }

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

  const WIZARD_OPEN_MS = 8000;
  const STEP_WAIT_MS = 10000;

  function findWizard(id) {
    const wiz = document.querySelector(SELECTORS.applyWizard);
    if (wiz && isShown(wiz) && wiz.textContent.includes(`(ID: ${id})`)) return wiz;
    return null;
  }

  function cancelWizard(wiz) {
    const cancel = wiz.querySelector(SELECTORS.wizardCancelBtn);
    if (cancel && isShown(cancel)) cancel.click();
  }

  /**
   * Apply to one posting. Auto-submits ONLY when the posting needs nothing
   * beyond the standard package (no pre-screening questions, no posting-specific
   * documents); otherwise it cancels the wizard and reports a skip reason so the
   * user can apply manually. Returns { id, ok, reason }.
   *
   * NOTE: clicking the "Submit" button submits a REAL application (irreversible).
   * The guard is layered: (1) evaluateApplyDialog must return safe, AND (2) the
   * advance button must read exactly "Submit" (only present on a single-input
   * step with no further pages). Any deviation cancels instead of guessing.
   */
  async function applyToPosting(id) {
    console.info("[WatSwipe] scraper applyToPosting", id);
    const row = findRow(id);
    if (!row) {
      console.warn("[WatSwipe] scraper: row not found for", id);
      return { id, ok: false, reason: "row-not-found" };
    }

    // States where Apply is unavailable — skip cleanly, never wedge the queue.
    if (row.querySelector(SELECTORS.appliedButton)) {
      return { id, ok: false, reason: "already-applied" };
    }
    if (row.querySelector(SELECTORS.ineligibleButton)) {
      return { id, ok: false, reason: "not-qualified" };
    }
    const applyBtn = row.querySelector(SELECTORS.applyButton);
    if (!applyBtn) return { id, ok: false, reason: "apply-button-not-found" };

    // Open the wizard.
    console.info("[WatSwipe] scraper: clicking Apply for", id);
    applyBtn.click();
    const wiz = await waitFor(() => findWizard(id), WIZARD_OPEN_MS);
    if (!wiz) {
      console.warn("[WatSwipe] scraper: wizard did not open for", id);
      return { id, ok: false, reason: "wizard-did-not-open" };
    }

    // Gate 1: is this posting safe to auto-submit with the standard package?
    const verdict = evaluateApplyDialog(wiz);
    console.info("[WatSwipe] scraper verdict for", id, verdict);
    if (!verdict.safe) {
      cancelWizard(wiz);
      return { id, ok: false, reason: verdict.reason };
    }

    // Gate 2: the advance button must read exactly "Submit" (a single-input step
    // with no further pages). If it says "Next" or anything else, bail.
    const nextBtn = wiz.querySelector(SELECTORS.wizardNextBtn);
    const label = nextBtn ? nextBtn.textContent.trim() : "";
    console.info("[WatSwipe] scraper next-btn label:", JSON.stringify(label));
    if (label !== "Submit" || !isShown(nextBtn)) {
      cancelWizard(wiz);
      return { id, ok: false, reason: `unexpected-step:${label || "no-button"}` };
    }

    // Submit the real application.
    console.info("[WatSwipe] scraper: clicking Submit for", id);
    nextBtn.click();

    // Wait for the confirmation step (the "Done" finish button becomes available).
    const done = await waitFor(() => {
      const b = wiz.querySelector(SELECTORS.wizardFinishBtn);
      return b && isShown(b) && b.textContent.trim() === "Done" ? b : null;
    }, STEP_WAIT_MS);
    if (!done) {
      // Submit was clicked but confirmation never appeared — report uncertain so
      // the user can verify rather than assuming success.
      return { id, ok: false, reason: "submit-unconfirmed" };
    }
    done.click(); // close the wizard, back to the table

    return { id, ok: true, reason: "submitted" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === MSG.CLICK_APPLY) {
      applyToPosting(message.id).then(sendResponse);
      return true; // keep the channel open for the async response
    }
    return false;
  });
})();
