/**
 * useSwipeQueue — the virtualization core.
 *
 * Holds the full ordered list of jobs plus a moving `cursor`, but only ever
 * exposes a window of up to 3 (`[current, next, preload]`). The deck renders only
 * those, so the DOM never holds more than 3 cards regardless of how many hundreds
 * of postings exist.
 *
 * Right swipes are buffered and flushed to the extension's throttled sync queue
 * (debounced), so the user can fire off many shortlists without spamming clicks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { recordDecision } from "../lib/db.js";
import { sendShortlistBatch } from "./useExtensionBridge.js";

const WINDOW_SIZE = 3;
const FLUSH_DEBOUNCE_MS = 1200;

export function useSwipeQueue(jobs) {
  const [cursor, setCursor] = useState(0);

  // Buffer of shortlisted ids waiting to be flushed to the extension.
  const shortlistBuffer = useRef([]);
  const flushTimer = useRef(null);

  // Reset to the top whenever a new deck is loaded.
  useEffect(() => {
    setCursor(0);
  }, [jobs]);

  const flushShortlists = useCallback(() => {
    if (shortlistBuffer.current.length) {
      sendShortlistBatch(shortlistBuffer.current);
      shortlistBuffer.current = [];
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushShortlists, FLUSH_DEBOUNCE_MS);
  }, [flushShortlists]);

  // Flush any pending shortlists on unmount so nothing is lost.
  useEffect(() => () => flushShortlists(), [flushShortlists]);

  /** Advance past the top card. direction: "right" (shortlist) | "left" (pass). */
  const swipe = useCallback(
    (direction) => {
      const job = jobs[cursor];
      if (!job) return;

      recordDecision(job.id, direction === "right" ? "shortlist" : "pass");
      if (direction === "right") {
        shortlistBuffer.current.push(job.id);
        scheduleFlush();
      }
      setCursor((c) => c + 1);
    },
    [jobs, cursor, scheduleFlush]
  );

  // The <=3 cards currently mounted. Index 0 is the top/active card.
  const window = jobs.slice(cursor, cursor + WINDOW_SIZE);
  const remaining = Math.max(jobs.length - cursor, 0);
  const isDone = cursor >= jobs.length && jobs.length > 0;

  return { window, swipe, remaining, total: jobs.length, isDone };
}
