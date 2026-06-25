/**
 * Canonical JobPosting shape + DOM normalization.
 *
 * This shape is the cross-layer contract: it mirrors `backend/app/models.py`
 * (the ranking subset) and `frontend/src/lib/db.js`. Attached to
 * `globalThis.WatSwipe` for bundler-free sharing.
 *
 * JobPosting = {
 *   id, title, company, location, term, status,
 *   description, tags[], deadline, shortlisted, scrapedAt
 * }
 */
(function (root) {
  const WatSwipe = (root.WatSwipe = root.WatSwipe || {});

  const text = (el) => (el ? el.textContent.trim() : "");

  /**
   * Map one WaterlooWorks table row (<tr>) to a JobPosting.
   *
   * NOTE: these selectors target the MOCK fixture shape
   * (extension/fixtures/mock-waterlooworks.html). Real WaterlooWorks selectors
   * are a deliberate follow-up (see plan "Out of Scope") and should be swapped in
   * here without touching the rest of the pipeline.
   */
  WatSwipe.normalizeRow = function (row) {
    const id =
      row.dataset.jobId || text(row.querySelector("[data-col='id']")) || null;
    if (!id) return null;

    const tagsRaw = text(row.querySelector("[data-col='tags']"));

    return {
      id: String(id),
      title: text(row.querySelector("[data-col='title']")),
      company: text(row.querySelector("[data-col='company']")),
      location: text(row.querySelector("[data-col='location']")),
      term: text(row.querySelector("[data-col='term']")),
      status: text(row.querySelector("[data-col='status']")),
      description: text(row.querySelector("[data-col='description']")),
      tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
      deadline: text(row.querySelector("[data-col='deadline']")),
      shortlisted: row.dataset.shortlisted === "true",
      scrapedAt: new Date().toISOString(),
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
