/**
 * Mirror of the extension's message protocol (extension/src/lib/messages.js),
 * in ES-module form for the React app. Keep these constants in sync — they are
 * the postMessage contract between bridge.js and the app.
 */
export const SOURCE = {
  EXT: "WATSWIPE_EXT",
  APP: "WATSWIPE_APP",
};

export const MSG = {
  JOBS_SYNC: "JOBS_SYNC",
  APPLY_BATCH: "APPLY_BATCH",
  SYNC_PROGRESS: "SYNC_PROGRESS",
  CLICK_APPLY: "CLICK_APPLY",
};

/** Send a message to the extension bridge content script. */
export function postToExtension(type, payload) {
  window.postMessage({ source: SOURCE.APP, type, payload }, window.location.origin);
}

/** True only for same-origin messages stamped by the extension. */
export function isFromExtension(event) {
  return (
    event.origin === window.location.origin &&
    event.data &&
    typeof event.data === "object" &&
    event.data.source === SOURCE.EXT
  );
}
