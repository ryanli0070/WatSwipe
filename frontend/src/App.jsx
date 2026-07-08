/**
 * App — two views over the same postings:
 *   • Deck: swipe right to SHORTLIST (local curation), left to pass.
 *   • Shortlist: multi-select curated postings and auto-apply to the chosen ones.
 * Plus an optional relevance search powered by the stateless backend.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionBridge } from "./hooks/useExtensionBridge.js";
import { rankJobs } from "./lib/api.js";
import { countShortlist } from "./lib/db.js";
import SwipeDeck from "./components/SwipeDeck.jsx";
import ShortlistView from "./components/ShortlistView.jsx";
import "./styles/app.css";

export default function App() {
  const { jobs, source, syncProgress, applyResults } = useExtensionBridge();
  const [query, setQuery] = useState("");
  const [rankedOrder, setRankedOrder] = useState(null);
  const [view, setView] = useState("deck"); // "deck" | "shortlist"
  const [shortlistCount, setShortlistCount] = useState(0);

  // Keep the tab badge in sync with the shortlist. `refreshCount` is called after
  // a right-swipe (from the deck) and after a remove (from the shortlist view).
  const refreshCount = useCallback(() => {
    countShortlist().then(setShortlistCount);
  }, []);
  useEffect(() => {
    refreshCount();
  }, [refreshCount, jobs]);

  // Apply relevance ordering when a ranking is available; otherwise original order.
  const orderedJobs = useMemo(() => {
    if (!rankedOrder) return jobs;
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return rankedOrder.map((id) => byId.get(id)).filter(Boolean);
  }, [jobs, rankedOrder]);

  // Clear any stale ranking if the deck contents change.
  useEffect(() => setRankedOrder(null), [jobs]);

  async function handleRank(e) {
    e.preventDefault();
    if (!query.trim()) return setRankedOrder(null);
    const order = await rankJobs(query, jobs);
    setRankedOrder(order); // null on backend failure -> falls back to original order
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>WatSwipe</h1>
        <span className={`source-pill source-${source}`}>
          {source === "extension" ? "live data" : source === "mock" ? "mock data" : "…"}
        </span>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${view === "deck" ? "tab-active" : ""}`}
          onClick={() => setView("deck")}
        >
          Deck
        </button>
        <button
          className={`tab ${view === "shortlist" ? "tab-active" : ""}`}
          onClick={() => setView("shortlist")}
        >
          Shortlist{shortlistCount ? ` (${shortlistCount})` : ""}
        </button>
      </nav>

      {view === "deck" ? (
        <>
          <form className="rank-bar" onSubmit={handleRank}>
            <input
              type="text"
              placeholder="Rank by relevance (e.g. python machine learning)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit">Rank</button>
          </form>

          <SwipeDeck jobs={orderedJobs} onShortlist={refreshCount} />
        </>
      ) : (
        <ShortlistView
          applyResults={applyResults}
          source={source}
          onChange={refreshCount}
        />
      )}

      {syncProgress && (
        <footer className="sync-status">
          Sync: {syncProgress.state}
          {typeof syncProgress.remaining === "number"
            ? ` · ${syncProgress.remaining} queued`
            : ""}
        </footer>
      )}
    </div>
  );
}
