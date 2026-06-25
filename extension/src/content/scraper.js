/**
 * scraper.js — runs on waterlooworks.uwaterloo.ca (and the mock fixture).
 *
 * Responsibilities:
 *   1. Scrape the visible job table into JobPostings and persist to
 *      chrome.storage.local (the ingestion node).
 *   2. Handle CLICK_SHORTLIST messages from the background worker by clicking the
 *      shortlist button for one posting (Phase 3 throttled sync).
 *
 * It acts ONLY on the already-authenticated page the user opened. It never reads
 * password fields and never touches credentials.
 */
(function () {
  const { storage, normalizeRow, MSG } = globalThis.WatSwipe;

  // --- Phase 1: scrape -----------------------------------------------------
  async function scrapeTable() {
    const rows = document.querySelectorAll("table.job-table tbody tr");
    const postings = [];
    for (const row of rows) {
      const posting = normalizeRow(row);
      if (posting) postings.push(posting);
    }
    if (postings.length) {
      await storage.upsertJobs(postings);
      console.info(`[WatSwipe] scraped ${postings.length} postings -> storage`);
    }
    return postings.length;
  }

  // Scrape now, and re-scrape if the table re-renders (WW paginates/filters in place).
  scrapeTable();
  const table = document.querySelector("table.job-table");
  if (table) {
    const observer = new MutationObserver(() => scrapeTable());
    observer.observe(table, { childList: true, subtree: true });
  }

  // --- Phase 3: perform one shortlist click on request ---------------------
  function clickShortlist(id) {
    const row = document.querySelector(`table.job-table tbody tr[data-job-id="${id}"]`);
    if (!row) return { id, ok: false, reason: "row-not-found" };

    const button = row.querySelector("[data-action='shortlist']");
    if (!button) return { id, ok: false, reason: "button-not-found" };

    button.click();
    row.dataset.shortlisted = "true";
    return { id, ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === MSG.CLICK_SHORTLIST) {
      const result = clickShortlist(message.id);
      console.info("[WatSwipe/scraper] CLICK_SHORTLIST", message.id, "->", result);
      sendResponse(result);
    }
    return true; // keep the channel open for the async-style response
  });
})();
