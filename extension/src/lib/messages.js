/**
 * Shared message protocol for WatSwipe.
 *
 * Loaded as a classic script in every context (content scripts via the manifest
 * `js` array, the service worker via `importScripts`). Everything is attached to
 * `globalThis.WatSwipe` so the three contexts share one source of truth without a
 * bundler. There are NO ES module exports here on purpose — content scripts can't
 * use them.
 */
(function (root) {
  const WatSwipe = (root.WatSwipe = root.WatSwipe || {});

  // Identifies who sent a window.postMessage, so each side ignores its own echoes
  // and anything from an untrusted script on the page.
  WatSwipe.SOURCE = {
    EXT: "WATSWIPE_EXT", // extension (bridge.js) -> app
    APP: "WATSWIPE_APP", // app -> extension (bridge.js)
  };

  // Message types carried in postMessage / chrome.runtime payloads.
  WatSwipe.MSG = {
    JOBS_SYNC: "JOBS_SYNC", // EXT -> APP: here are the scraped postings
    APPLY_BATCH: "APPLY_BATCH", // APP -> EXT: queue these ids for auto-apply
    SYNC_PROGRESS: "SYNC_PROGRESS", // EXT -> APP: apply progress/result
    CLICK_APPLY: "CLICK_APPLY", // worker -> scraper: click one row's button
  };

  /**
   * Validate an inbound window `message` event against an expected source.
   * Rejects cross-origin messages and anything not stamped by the expected peer.
   */
  WatSwipe.isTrustedMessage = function (event, expectedSource) {
    return (
      event.origin === location.origin &&
      event.data &&
      typeof event.data === "object" &&
      event.data.source === expectedSource
    );
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
