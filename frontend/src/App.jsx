/**
 * App — wires the extension bridge to the swipe deck, with an optional relevance
 * search powered by the stateless backend.
 */
import { useEffect, useMemo, useState } from "react";
import { useExtensionBridge } from "./hooks/useExtensionBridge.js";
import { rankJobs } from "./lib/api.js";
import SwipeDeck from "./components/SwipeDeck.jsx";
import "./styles/app.css";

export default function App() {
  const { jobs, source, syncProgress } = useExtensionBridge();
  const [query, setQuery] = useState("");
  const [rankedOrder, setRankedOrder] = useState(null);

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

      <form className="rank-bar" onSubmit={handleRank}>
        <input
          type="text"
          placeholder="Rank by relevance (e.g. python machine learning)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Rank</button>
      </form>

      <SwipeDeck jobs={orderedJobs} />

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
