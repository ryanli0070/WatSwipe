/**
 * Thin wrapper over chrome.storage.local — the ONLY place postings and the sync
 * queue are persisted. Nothing here ever reaches a remote server.
 *
 * Keys:
 *   watswipe:jobs       -> { [id]: JobPosting }
 *   watswipe:syncQueue  -> string[] of posting ids awaiting shortlist clicks
 */
(function (root) {
  const WatSwipe = (root.WatSwipe = root.WatSwipe || {});

  const JOBS_KEY = "watswipe:jobs";
  const QUEUE_KEY = "watswipe:syncQueue";

  WatSwipe.storage = {
    JOBS_KEY,
    QUEUE_KEY,

    async getJobs() {
      const { [JOBS_KEY]: jobs } = await chrome.storage.local.get(JOBS_KEY);
      return jobs || {};
    },

    /** Merge freshly-scraped postings into storage, keyed/deduped by id. */
    async upsertJobs(postings) {
      const existing = await this.getJobs();
      for (const p of postings) {
        if (p && p.id) existing[p.id] = { ...existing[p.id], ...p };
      }
      await chrome.storage.local.set({ [JOBS_KEY]: existing });
      return existing;
    },

    async getQueue() {
      const { [QUEUE_KEY]: queue } = await chrome.storage.local.get(QUEUE_KEY);
      return queue || [];
    },

    /** Append ids to the persistent shortlist queue, ignoring duplicates. */
    async enqueue(ids) {
      const queue = await this.getQueue();
      const seen = new Set(queue);
      for (const id of ids) {
        if (!seen.has(id)) {
          queue.push(id);
          seen.add(id);
        }
      }
      await chrome.storage.local.set({ [QUEUE_KEY]: queue });
      return queue;
    },

    async setQueue(queue) {
      await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
