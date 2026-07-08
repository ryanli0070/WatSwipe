/**
 * useSwipeQueue — the virtualization core.
 *
 * Holds the full ordered list of jobs and derives the deck as the postings the
 * user hasn't decided on yet. It exposes a window of up to 3
 * (`[current, next, preload]`), so the DOM never holds more than 3 cards
 * regardless of how many hundreds of postings exist.
 *
 * Decided cards are filtered out (not skipped via a moving cursor) so a live
 * re-scrape — e.g. the JOBS_SYNC that fires after an apply click mutates the
 * source table — can re-push the whole job list WITHOUT resurfacing a card the
 * user already swiped or resetting their position.
 *
 * Right swipes are buffered and flushed to the extension's throttled sync queue
 * (debounced), so the user can queue many applies without spamming clicks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordDecision } from "../lib/db.js";
import { sendApplyBatch } from "./useExtensionBridge.js";

const WINDOW_SIZE = 3;
const FLUSH_DEBOUNCE_MS = 1200;

export function useSwipeQueue(jobs) {
  // Ids swiped this session. Kept in state (not seeded from the persisted
  // decisions table) so a refresh still yields a fresh deck, but a re-scrape
  // mid-session can't bring a decided card back.
  const [decidedIds, setDecidedIds] = useState(() => new Set());

  // Buffer of ids to apply to waiting to be flushed to the extension.
  const applyBuffer = useRef([]);
  const flushTimer = useRef(null);

  const flushApplies = useCallback(() => {
    if (applyBuffer.current.length) {
      sendApplyBatch(applyBuffer.current);
      applyBuffer.current = [];
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushApplies, FLUSH_DEBOUNCE_MS);
  }, [flushApplies]);

  // Flush any pending applies on unmount so nothing is lost.
  useEffect(() => () => flushApplies(), [flushApplies]);

  // The deck: every undecided posting, in the current (possibly re-ranked) order.
  const deck = useMemo(
    () => jobs.filter((job) => !decidedIds.has(job.id)),
    [jobs, decidedIds]
  );

  /** Decide on the top card. direction: "right" (apply) | "left" (pass). */
  const swipe = useCallback(
    (direction) => {
      const job = deck[0];
      if (!job) return;

      recordDecision(job.id, direction === "right" ? "apply" : "pass");
      if (direction === "right") {
        applyBuffer.current.push(job.id);
        scheduleFlush();
      }
      setDecidedIds((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
    },
    [deck, scheduleFlush]
  );

  // The <=3 cards currently mounted. Index 0 is the top/active card.
  const window = deck.slice(0, WINDOW_SIZE);
  const remaining = deck.length;
  const isDone = deck.length === 0 && jobs.length > 0;

  return { window, swipe, remaining, total: jobs.length, isDone };
}
