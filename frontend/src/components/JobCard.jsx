/**
 * JobCard — a single draggable card (Framer Motion).
 *
 * Only the top card is interactive; lower cards render as a static stack behind
 * it (scaled + offset) for depth. Drag past a distance/velocity threshold throws
 * the card off-screen and reports the swipe direction.
 */
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useCallback } from "react";

const SWIPE_DISTANCE = 120; // px past which a release counts as a swipe
const SWIPE_VELOCITY = 600; // px/s flick threshold
const THROW_X = 1000; // px to fling the card off-screen

export default function JobCard({ job, isTop, stackIndex, onSwipe }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);

  const throwCard = useCallback(
    (direction) => {
      const target = direction === "right" ? THROW_X : -THROW_X;
      animate(x, target, { duration: 0.3, ease: "easeOut" });
      // Let the fling animate briefly before advancing the deck.
      setTimeout(() => onSwipe(direction), 180);
    },
    [x, onSwipe]
  );

  const handleDragEnd = useCallback(
    (_event, info) => {
      const past = Math.abs(info.offset.x) > SWIPE_DISTANCE;
      const flicked = Math.abs(info.velocity.x) > SWIPE_VELOCITY;
      if (past || flicked) {
        throwCard(info.offset.x > 0 ? "right" : "left");
      } else {
        animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    },
    [x, throwCard]
  );

  // Static styling for cards behind the top one.
  const depth = isTop ? {} : { scale: 1 - stackIndex * 0.04, y: stackIndex * 12 };

  return (
    <motion.div
      className="job-card"
      style={isTop ? { x, rotate, zIndex: 10 } : { ...depth, zIndex: 10 - stackIndex }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={isTop ? false : depth}
      animate={isTop ? { scale: 1, y: 0 } : depth}
    >
      {isTop && (
        <>
          <motion.div className="badge badge-like" style={{ opacity: likeOpacity }}>
            APPLY
          </motion.div>
          <motion.div className="badge badge-nope" style={{ opacity: nopeOpacity }}>
            PASS
          </motion.div>
        </>
      )}

      <div className="job-card-body">
        <h2 className="job-title">{job.title}</h2>
        <p className="job-company">
          {job.company} · {job.location}
        </p>
        <p className="job-term">
          {job.term} · {job.status}
        </p>
        <p className="job-description">{job.description}</p>
        <div className="job-tags">
          {(job.tags || []).map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        {job.deadline && <p className="job-deadline">Apply by {job.deadline}</p>}
      </div>
    </motion.div>
  );
}
