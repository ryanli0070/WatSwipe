/**
 * bridge.js — runs on the React app origin (http://localhost:5173).
 *
 * The secure window.postMessage channel between the extension and the local app:
 *   - EXT -> APP : pushes scraped postings (JOBS_SYNC), initial + on change.
 *   - APP -> EXT : relays SHORTLIST_BATCH requests to the background worker.
 *
 * Every inbound message is origin-checked (event.origin === location.origin) and
 * source-stamped, so a malicious script on the page can't impersonate the app.
 */
(function () {
  const { storage, SOURCE, MSG, isTrustedMessage } = globalThis.WatSwipe;

  function postToApp(type, payload) {
    window.postMessage({ source: SOURCE.EXT, type, payload }, location.origin);
  }

  // --- EXT -> APP: send postings ------------------------------------------
  async function pushJobs() {
    const jobs = await storage.getJobs();
    postToApp(MSG.JOBS_SYNC, Object.values(jobs));
  }

  // Initial sync once the app is listening.
  pushJobs();

  // Incremental sync whenever the scraper updates storage.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[storage.JOBS_KEY]) pushJobs();
  });

  // Re-push on demand (the app asks after it mounts its listener).
  // --- APP -> EXT: relay shortlist batches & resync requests ---------------
  window.addEventListener("message", (event) => {
    if (!isTrustedMessage(event, SOURCE.APP)) return;

    const { type, payload } = event.data;
    if (type === MSG.SHORTLIST_BATCH && Array.isArray(payload)) {
      console.info("[WatSwipe/bridge] relaying SHORTLIST_BATCH to worker:", payload);
      chrome.runtime.sendMessage({ type: MSG.SHORTLIST_BATCH, ids: payload });
    } else if (type === MSG.JOBS_SYNC) {
      pushJobs(); // app requested a fresh push
    }
  });

  // --- EXT -> APP: relay sync progress from the worker --------------------
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MSG.SYNC_PROGRESS) {
      postToApp(MSG.SYNC_PROGRESS, message.payload);
    }
  });
})();
