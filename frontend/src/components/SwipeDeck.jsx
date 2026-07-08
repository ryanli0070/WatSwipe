/**
 * SwipeDeck — renders ONLY the (≤3) windowed cards from useSwipeQueue.
 *
 * The card at window index 0 is the top/active card. We key cards by job id so
 * Framer Motion treats each as a stable element as the window slides forward.
 */
import { AnimatePresence } from "framer-motion";
import { useSwipeQueue } from "../hooks/useSwipeQueue.js";
import JobCard from "./JobCard.jsx";
import SwipeControls from "./SwipeControls.jsx";

export default function SwipeDeck({ jobs, onShortlist }) {
  const { window: cards, swipe, remaining, total, isDone } = useSwipeQueue(jobs, {
    onShortlist,
  });

  if (!jobs.length) {
    return <div className="deck-empty">No postings yet. Scrape WaterlooWorks to begin.</div>;
  }
  if (isDone) {
    return <div className="deck-empty">🎉 You've gone through all {total} postings.</div>;
  }

  return (
    <div className="deck-wrap">
      <div className="deck-counter">
        {remaining} of {total} left
      </div>

      <div className="deck">
        <AnimatePresence>
          {/* Render back-to-front so the top card (index 0) paints last/on top. */}
          {cards
            .map((job, i) => (
              <JobCard
                key={job.id}
                job={job}
                isTop={i === 0}
                stackIndex={i}
                onSwipe={swipe}
              />
            ))
            .reverse()}
        </AnimatePresence>
      </div>

      <SwipeControls onSwipe={swipe} disabled={false} />
    </div>
  );
}
