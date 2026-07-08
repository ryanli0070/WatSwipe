/**
 * ShortlistView — the durable "folder" of postings the user swiped right on.
 *
 * Postings are curated locally (IndexedDB); NOTHING is submitted by swiping. Here
 * the user multi-selects specific postings (like selecting files) and clicks
 * "Auto-apply to selected" — the ONLY action that sends an apply batch to the
 * extension's throttled queue. Per-posting outcomes stream back via applyResults.
 */
import { useCallback, useEffect, useState } from "react";
import { getShortlistedJobs, removeDecision } from "../lib/db.js";
import { sendApplyBatch } from "../hooks/useExtensionBridge.js";

/** Map an apply result to a short human label. */
function statusLabel(result) {
  if (!result) return null;
  const { ok, reason } = result;
  if (ok) return { text: "✓ Submitted", kind: "ok" };
  if (reason === "already-applied") return { text: "Already applied", kind: "muted" };
  if (reason === "not-qualified") return { text: "Not qualified", kind: "muted" };
  if (reason === "pre-screening-questions")
    return { text: "Skipped — pre-screening questions", kind: "skip" };
  if (reason?.startsWith("requires-document:"))
    return { text: `Skipped — needs ${reason.split(":")[1]}`, kind: "skip" };
  if (reason === "apply-button-not-found")
    return { text: "No Apply button", kind: "muted" };
  return { text: "Couldn't complete — verify manually", kind: "warn" };
}

export default function ShortlistView({ applyResults, source, onChange }) {
  const [jobs, setJobs] = useState(null); // null = loading
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(async () => {
    setJobs(await getShortlistedJobs());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = jobs?.length > 0 && selected.size === jobs.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(jobs.map((j) => j.id)));

  async function remove(id) {
    await removeDecision(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    load();
    onChange?.();
  }

  function applySelected() {
    const ids = jobs.filter((j) => selected.has(j.id)).map((j) => j.id);
    if (!ids.length) return;
    sendApplyBatch(ids);
    setSelected(new Set()); // clear; outcomes stream in via applyResults
  }

  if (jobs === null) return <div className="deck-empty">Loading shortlist…</div>;
  if (!jobs.length)
    return (
      <div className="deck-empty">
        Your shortlist is empty. Swipe right on postings to add them here.
      </div>
    );

  const canApply = source === "extension";

  return (
    <div className="shortlist">
      <div className="shortlist-bar">
        <div className="shortlist-selectall">
          <input
            id="shortlist-selectall"
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
          />
          <label htmlFor="shortlist-selectall">
            {selected.size ? `${selected.size} selected` : "Select all"}
          </label>
        </div>
        <button
          className="apply-btn"
          disabled={!selected.size || !canApply}
          onClick={applySelected}
          title={canApply ? "" : "Connect the extension on WaterlooWorks to auto-apply"}
        >
          Auto-apply to selected{selected.size ? ` (${selected.size})` : ""}
        </button>
      </div>
      {!canApply && (
        <p className="shortlist-hint">
          Auto-apply needs the extension active on a WaterlooWorks tab.
        </p>
      )}

      <ul className="shortlist-list">
        {jobs.map((job) => {
          const status = statusLabel(applyResults?.[job.id]);
          return (
            <li key={job.id} className="shortlist-item">
              <input
                type="checkbox"
                checked={selected.has(job.id)}
                onChange={() => toggle(job.id)}
                aria-label={`Select ${job.title}`}
              />
              <div className="shortlist-item-body">
                <div className="shortlist-item-title">{job.title}</div>
                <div className="shortlist-item-meta">
                  {[job.company, job.location].filter(Boolean).join(" · ")}
                  {job.deadline ? ` · due ${job.deadline}` : ""}
                </div>
                {status && (
                  <div className={`shortlist-status status-${status.kind}`}>
                    {status.text}
                  </div>
                )}
              </div>
              <button
                className="shortlist-remove"
                onClick={() => remove(job.id)}
                aria-label={`Remove ${job.title} from shortlist`}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
