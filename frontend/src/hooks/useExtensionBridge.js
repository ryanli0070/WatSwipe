/**
 * useExtensionBridge — receives postings from the extension over window.postMessage
 * and persists them to IndexedDB. Falls back to mock data when no extension is
 * present, so the app is fully usable standalone in dev.
 *
 * Returns: { jobs, source, syncProgress }
 *   source: "extension" once any JOBS_SYNC arrives, else "mock".
 */
import { useEffect, useState } from "react";
import { MSG, SOURCE, isFromExtension, postToExtension } from "../lib/messages.js";
import { upsertJobs, getAllJobs } from "../lib/db.js";
import { mockJobs } from "../lib/mockJobs.js";

// If no JOBS_SYNC arrives within this window, assume no extension and use mocks.
const EXTENSION_WAIT_MS = 600;

export function useExtensionBridge() {
  const [jobs, setJobs] = useState([]);
  const [source, setSource] = useState("loading");
  const [syncProgress, setSyncProgress] = useState(null);

  useEffect(() => {
    let gotExtensionData = false;

    async function handleMessage(event) {
      if (!isFromExtension(event)) return; // origin + source checked
      const { type, payload } = event.data;

      if (type === MSG.JOBS_SYNC && Array.isArray(payload)) {
        gotExtensionData = true;
        setSource("extension");
        await upsertJobs(payload);
        setJobs(await getAllJobs());
      } else if (type === MSG.SYNC_PROGRESS) {
        setSyncProgress(payload);
      }
    }

    window.addEventListener("message", handleMessage);

    // Ask the extension (if any) to push its current jobs.
    postToExtension(MSG.JOBS_SYNC, null);

    // Fallback to mock data if the extension never responds.
    const timer = setTimeout(async () => {
      if (!gotExtensionData) {
        setSource("mock");
        await upsertJobs(mockJobs);
        setJobs(await getAllJobs());
      }
    }, EXTENSION_WAIT_MS);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timer);
    };
  }, []);

  return { jobs, source, syncProgress };
}

/** Send a batch of shortlist ids to the extension's throttled sync queue. */
export function sendShortlistBatch(ids) {
  if (ids.length) postToExtension(MSG.SHORTLIST_BATCH, ids);
}

export { SOURCE };
