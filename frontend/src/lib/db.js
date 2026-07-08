/**
 * IndexedDB (via Dexie) — the app's local store of postings and swipe decisions.
 * This is the client-side sovereignty boundary: postings live here, never on a
 * server. Mirrors the JobPosting shape from extension/src/lib/schema.js.
 */
import Dexie from "dexie";

export const db = new Dexie("watswipe");

db.version(1).stores({
  // Primary key `id`; index a couple of fields for future filtering.
  jobs: "id, company, term, status",
  // Local record of swipe decisions: id -> { id, decision, decidedAt }.
  decisions: "id, decision",
});

/** Upsert scraped postings, preserving any local `decision` already made. */
export async function upsertJobs(postings) {
  if (!postings?.length) return;
  await db.jobs.bulkPut(postings);
}

export async function getAllJobs() {
  return db.jobs.toArray();
}

/** Record a swipe; "right" = shortlist, "left" = pass. */
export async function recordDecision(id, decision) {
  await db.decisions.put({ id, decision, decidedAt: new Date().toISOString() });
}

export async function getDecisions() {
  return db.decisions.toArray();
}

/** Remove a decision entirely (e.g. un-shortlist a posting). */
export async function removeDecision(id) {
  await db.decisions.delete(id);
}

/** Count of shortlisted postings (for the tab badge). */
export async function countShortlist() {
  return db.decisions.where("decision").equals("shortlist").count();
}

/**
 * The shortlist: postings the user swiped right on, joined with their job data,
 * most-recently-shortlisted first. Persists across refresh (unlike the session
 * deck), so the shortlist is a durable folder the user curates over time.
 */
export async function getShortlistedJobs() {
  const decisions = await db.decisions.where("decision").equals("shortlist").toArray();
  if (!decisions.length) return [];
  decisions.sort((a, b) => (b.decidedAt || "").localeCompare(a.decidedAt || ""));
  const rows = await db.jobs.bulkGet(decisions.map((d) => d.id));
  const byId = new Map();
  rows.forEach((j) => j && byId.set(j.id, j));
  return decisions.map((d) => byId.get(d.id)).filter(Boolean);
}
