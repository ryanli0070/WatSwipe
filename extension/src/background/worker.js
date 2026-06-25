/**
 * worker.js — background service worker (Phase 3: throttled shortlist sync).
 *
 * Receives SHORTLIST_BATCH from bridge.js, persists ids to a queue that survives
 * worker termination, and drains them ONE AT A TIME against the WaterlooWorks tab
 * with a random 1.5–3.0s gap between clicks.
 *
 * Why throttle: to be a polite client of the user's own authenticated session —
 * not to evade detection. The whole feature is opt-in (see frontend SyncControls).
 *
 * MV3 service workers can be killed at any time, so:
 *   - the queue lives in chrome.storage.local (persistent), and
 *   - chrome.alarms re-wakes the worker to keep draining if it was torn down,
 *   - while a setTimeout fast-path keeps things moving when the worker is alive.
 */
importScripts("../lib/messages.js", "../lib/storage.js");

const { storage, MSG } = globalThis.WatSwipe;

const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 3000;
const ALARM_NAME = "watswipe-drain";

const randomDelay = () =>
  MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

let draining = false;

// The live WaterlooWorks origin, plus the local fixture during development so the
// Phase 3 shortlist drain can be exercised end-to-end without an authenticated
// session. Mirrors the scraper's content_script `matches` in manifest.json.
const SHORTLIST_TAB_URLS = [
  "https://waterlooworks.uwaterloo.ca/*",
  "file:///Users/ryanli/Code/WatSwipe/extension/fixtures/*",
];

async function findWaterlooWorksTab() {
  const tabs = await chrome.tabs.query({ url: SHORTLIST_TAB_URLS });
  return tabs[0] || null;
}

function reportProgress(payload) {
  // Best-effort: tell any listening app tab. Errors (no listener) are ignored.
  chrome.runtime.sendMessage({ type: MSG.SYNC_PROGRESS, payload }).catch(() => {});
}

/** Drain the queue, clicking one shortlist per random interval. */
async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    let queue = await storage.getQueue();
    while (queue.length) {
      const tab = await findWaterlooWorksTab();
      if (!tab) {
        // No authenticated WW tab open — back off and retry via alarm later.
        reportProgress({ state: "waiting-for-tab", remaining: queue.length });
        scheduleWake();
        return;
      }

      const id = queue[0];
      let result = { id, ok: false, reason: "no-response" };
      try {
        result = await chrome.tabs.sendMessage(tab.id, {
          type: MSG.CLICK_SHORTLIST,
          id,
        });
      } catch (err) {
        result = { id, ok: false, reason: String(err) };
      }

      // Remove from the head whether it succeeded or hard-failed (avoid wedging);
      // failures are surfaced to the app for optional manual retry.
      queue = queue.slice(1);
      await storage.setQueue(queue);
      reportProgress({ state: "clicked", result, remaining: queue.length });

      if (queue.length) await sleep(randomDelay());
    }
    reportProgress({ state: "done", remaining: 0 });
  } finally {
    draining = false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function scheduleWake() {
  // chrome.alarms minimum granularity is ~30s; this is the resilience fallback,
  // not the primary cadence (which is the in-worker setTimeout above).
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.5 });
}

// --- wiring --------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === MSG.SHORTLIST_BATCH && Array.isArray(message.ids)) {
    storage.enqueue(message.ids).then(() => drainQueue());
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) drainQueue();
});

// If the worker is (re)started with a non-empty queue, resume draining.
drainQueue();
