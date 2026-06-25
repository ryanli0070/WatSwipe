/**
 * Optional client for the stateless backend (/rank). Used to reorder the deck by
 * relevance to a free-text query before the user starts swiping.
 *
 * Failures are non-fatal: if the backend is down, the app keeps working with the
 * postings in their original order.
 */
const BASE_URL = "http://localhost:8000";

/**
 * Rank postings by relevance to `query`. Returns an array of ids in
 * best-first order, or null if the backend is unavailable.
 */
export async function rankJobs(query, postings) {
  try {
    const res = await fetch(`${BASE_URL}/rank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        postings: postings.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          tags: p.tags || [],
        })),
      }),
    });
    if (!res.ok) return null;
    const { scores } = await res.json();
    return scores.map((s) => s.id);
  } catch {
    return null; // backend offline — caller keeps original order
  }
}
