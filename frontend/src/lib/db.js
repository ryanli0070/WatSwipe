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

/** Record a swipe; "right" = shortlist intent, "left" = pass. */
export async function recordDecision(id, decision) {
  await db.decisions.put({ id, decision, decidedAt: new Date().toISOString() });
}

export async function getDecisions() {
  return db.decisions.toArray();
}
