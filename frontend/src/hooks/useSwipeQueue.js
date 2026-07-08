/**
 * useSwipeQueue — the virtualization core.
 *
 * Holds the full ordered list of jobs and derives the deck as the postings the
 * user hasn't decided on yet. It exposes a window of up to 3
 * (`[current, next, preload]`), so the DOM never holds more than 3 cards
 * regardless of how many hundreds of postings exist.
 *
 * Decided cards are filtered out (not skipped via a moving cursor) so a live
 * re-scrape — e.g. the JOBS_SYNC that fires after an apply mutates the source
 * table — can re-push the whole job list WITHOUT resurfacing a card the user
 * already swiped or resetting their position.
 *
 * A right swipe SHORTLISTS the posting (persisted locally via recordDecision).
 * It does NOT apply — applying is an explicit, multi-select action in the
 * Shortlist view. Nothing is sent to the extension here.
 */
import { useCallback, useMemo, useState } from "react";
import { recordDecision } from "../lib/db.js";

const WINDOW_SIZE = 3;

export function useSwipeQueue(jobs, { onShortlist } = {}) {
  // Ids swiped this session. Kept in state (not seeded from the persisted
  // decisions table) so a refresh still yields a fresh deck, but a re-scrape
  // mid-session can't bring a decided card back.
  const [decidedIds, setDecidedIds] = useState(() => new Set());

  // The deck: every undecided posting, in the current (possibly re-ranked) order.
  const deck = useMemo(
    () => jobs.filter((job) => !decidedIds.has(job.id)),
    [jobs, decidedIds]
  );

  /** Decide on the top card. direction: "right" (shortlist) | "left" (pass). */
  const swipe = useCallback(
    (direction) => {
      const job = deck[0];
      if (!job) return;

      recordDecision(job.id, direction === "right" ? "shortlist" : "pass");
      if (direction === "right") onShortlist?.(job);

      setDecidedIds((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
    },
    [deck, onShortlist]
  );

  // The <=3 cards currently mounted. Index 0 is the top/active card.
  const window = deck.slice(0, WINDOW_SIZE);
  const remaining = deck.length;
  const isDone = deck.length === 0 && jobs.length > 0;

  return { window, swipe, remaining, total: jobs.length, isDone };
}
