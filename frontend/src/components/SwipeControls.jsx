/**
 * SwipeControls — button + keyboard parity for the gesture.
 * Calls the same onSwipe used by drag, so ←/→ keys and the buttons behave
 * identically to a drag-throw.
 */
import { useEffect } from "react";

export default function SwipeControls({ onSwipe, disabled }) {
  useEffect(() => {
    function onKey(e) {
      if (disabled) return;
      if (e.key === "ArrowLeft") onSwipe("left");
      else if (e.key === "ArrowRight") onSwipe("right");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSwipe, disabled]);

  return (
    <div className="swipe-controls">
      <button
        className="control control-nope"
        onClick={() => onSwipe("left")}
        disabled={disabled}
        aria-label="Pass (left arrow)"
      >
        ✕
      </button>
      <button
        className="control control-like"
        onClick={() => onSwipe("right")}
        disabled={disabled}
        aria-label="Shortlist (right arrow)"
      >
        ★
      </button>
    </div>
  );
}
