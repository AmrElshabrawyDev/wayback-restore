/**
 * Lists every archived HTML page of a domain through the Wayback CDX API and
 * keeps the newest successful snapshot of each page.
 * Docs: https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server
 */
import { fetchWithRetry, sleep } from "./http.js";
import { pageKey } from "./urls.js";

const CDX = "https://web.archive.org/cdx/search/cdx";
const PAGE_SIZE = 5000;

/** Wayback timestamps are YYYYMMDDhhmmss; accept "2023", "2023-05" or "20230501" */
export const toTimestamp = (value) => (value ? String(value).replace(/\D/g, "").slice(0, 14) : undefined);

/**
 * @returns {Promise<Array<{ original: string, timestamp: string, key: string }>>}
 *   newest snapshot per page, sorted by path
 */
export async function listSnapshots(domain, { from, to, fetchImpl, log } = {}) {
  const newest = new Map();
  let resumeKey;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      url: `${domain}/*`,
      output: "json",
      fl: "original,timestamp,statuscode,mimetype",
      limit: String(PAGE_SIZE),
      showResumeKey: "true",
    });
    params.append("filter", "statuscode:200");
    params.append("filter", "mimetype:text/html");
    // one row per page *version* — fewer rows than every capture
    params.set("collapse", "digest");
    if (from) params.set("from", toTimestamp(from));
    if (to) params.set("to", toTimestamp(to));
    if (resumeKey) params.set("resumeKey", resumeKey);

    const response = await fetchWithRetry(`${CDX}?${params}`, { fetchImpl, log, timeout: 120_000 });
    if (!response.ok) throw new Error(`CDX API returned HTTP ${response.status}`);
    const text = await response.text();
    const rows = text.trim() ? JSON.parse(text) : [];

    resumeKey = undefined;
    // the resume key arrives as [] followed by [key] at the end of the list
    if (rows.length >= 2 && rows.at(-2)?.length === 0 && rows.at(-1)?.length === 1) {
      resumeKey = rows.pop()[0];
      rows.pop();
    }
    for (const [original, timestamp] of rows.slice(1)) {
      const key = pageKey(original);
      const current = newest.get(key);
      if (!current || timestamp > current.timestamp) newest.set(key, { original, timestamp, key });
    }

    pages++;
    log?.(`  CDX page ${pages}: ${newest.size} unique pages so far`);
    if (resumeKey) await sleep(1000);
  } while (resumeKey);

  return [...newest.values()].sort((a, b) => a.key.localeCompare(b.key));
}
