/**
 * wayback-restore — recover a website's posts from the Wayback Machine.
 *
 *   import { restore } from "@amrelshabrawydev/wayback-restore";
 *   const { posts, report } = await restore({ domain: "example.com", formats: ["json", "supabase"] });
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listSnapshots } from "./cdx.js";
import { exportPosts } from "./exporters.js";
import { extractPost } from "./extract.js";
import { fetchWithRetry, sleep } from "./http.js";
import { restoreImages } from "./images.js";
import { writeReport } from "./output.js";
import { isContentUrl, normalizeDomain, snapshotUrl } from "./urls.js";

export { listSnapshots } from "./cdx.js";
export { EXPORTERS, EXPORTER_IDS, exportPosts, toCsv, toMongoNdjson, toRecord, toSql, toWxr } from "./exporters.js";
export { extractPost, originalImageUrl } from "./extract.js";
export { PLATFORMS, PLATFORM_IDS, detectPlatform, isSpaShell } from "./platforms.js";
export { restoreImages, downloadImage } from "./images.js";
export { toMarkdown } from "./output.js";
export { isContentUrl, normalizeDomain, slugFromUrl, unwrapWaybackUrl, urlPath } from "./urls.js";

const DEFAULTS = {
  outDir: "restored",
  types: ["post", "page", "unknown"],
  formats: ["json"],
  platform: "auto",
  table: "posts",
  images: true,
  imageBase: "",
  imageSources: ["archive", "live"],
  keepMissingImages: false,
  minWords: 50,
  delay: 1500,
  limit: Infinity,
};

const wordCount = (html) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

/** Fetch an archived page, caching the raw HTML so re-runs don't hit the archive again */
async function fetchSnapshot(snapshot, { cacheDir, fetchImpl, log, delay }) {
  const hash = crypto.createHash("sha1").update(`${snapshot.timestamp}/${snapshot.original}`).digest("hex");
  const cacheFile = path.join(cacheDir, `${hash}.html`);
  try {
    return { html: await fs.readFile(cacheFile, "utf8"), cached: true };
  } catch {
    /* not cached yet */
  }
  const response = await fetchWithRetry(snapshotUrl(snapshot.timestamp, snapshot.original), { fetchImpl, log });
  if (!response.ok) {
    await response.body?.cancel?.();
    throw new Error(`HTTP ${response.status}`);
  }
  const html = await response.text();
  await fs.writeFile(cacheFile, html);
  await sleep(delay);
  return { html, cached: false };
}

/**
 * Restore every archived post/page of a domain.
 * @param {object} options see README → "Options"
 * @returns {Promise<{ posts: object[], report: object }>}
 */
export async function restore(options) {
  const opts = { ...DEFAULTS, ...options };
  const domain = normalizeDomain(opts.domain);
  if (!domain || !domain.includes(".")) throw new Error(`Invalid domain: "${opts.domain}"`);
  const { fetchImpl } = opts;
  const log = opts.log ?? (() => {});
  const onProgress = opts.onProgress ?? (() => {});
  // the Prisma import script reads posts.json
  const formats = opts.formats.includes("prisma") && !opts.formats.includes("json") ? ["json", ...opts.formats] : opts.formats;

  const outDir = path.resolve(opts.outDir);
  const cacheDir = path.join(outDir, ".cache");
  const imagesDir = path.join(outDir, "public");
  await fs.mkdir(cacheDir, { recursive: true });

  log(`Listing archived pages of ${domain}…`);
  const snapshots = await listSnapshots(domain, { from: opts.from, to: opts.to, fetchImpl, log });
  const candidates = snapshots.filter((s) => isContentUrl(s.original, opts));
  log(`Found ${snapshots.length} archived pages, ${candidates.length} look like posts/pages.`);
  // --limit counts restored pages, so skipped ones (homepage, too short…) don't use up a quick test
  const limited = Number.isFinite(opts.limit);
  if (limited && !opts.dryRun) log(`Stopping after ${opts.limit} restored pages.`);

  const report = {
    domain,
    startedAt: new Date().toISOString(),
    archivedPages: snapshots.length,
    candidates: candidates.length,
    restored: 0,
    skipped: [],
    failed: [],
    images: { downloaded: 0, missing: [] },
    // how many pages looked like each platform (useful with platform "auto")
    platforms: {},
  };
  const posts = [];

  if (opts.dryRun) {
    if (limited) candidates.splice(opts.limit);
    for (const s of candidates) log(`  ${s.timestamp}  ${s.original}`);
    report.finishedAt = new Date().toISOString();
    return { posts, report, candidates };
  }

  for (const [index, snapshot] of candidates.entries()) {
    if (report.restored >= opts.limit) break;
    const progress = `[${index + 1}/${candidates.length}]`;
    try {
      const { html, cached } = await fetchSnapshot(snapshot, { cacheDir, fetchImpl, log, delay: opts.delay });
      let post = extractPost(html, { ...snapshot, domain, platform: opts.platform });
      report.platforms[post.platform] = (report.platforms[post.platform] ?? 0) + 1;

      // a WordPress homepage is just a list of posts; on other sites it's a real page
      const isHome = post.type === "home";
      const skip =
        isHome && post.platform === "wordpress" ? "homepage"
        : post.spaShell ? "spa-shell"
        : !isHome && !opts.types.includes(post.type) ? `type:${post.type}`
        : !post.html ? "no-content"
        : wordCount(post.html) < opts.minWords ? "too-short"
        : null;
      if (skip) {
        report.skipped.push({ url: snapshot.original, reason: skip });
        log(`${progress} skip (${skip}) ${post.path}`);
        onProgress({ index, total: candidates.length, status: "skipped", path: post.path });
        continue;
      }

      if (opts.images) {
        const result = await restoreImages(post, {
          imagesDir,
          domain,
          imageBase: opts.imageBase,
          keepMissing: opts.keepMissingImages,
          sources: opts.imageSources,
          delay: Math.min(opts.delay, 800),
          fetchImpl,
          log,
        });
        post = result.post;
        report.images.downloaded += result.downloaded;
        report.images.missing.push(...result.missing);
      }

      posts.push(post);
      report.restored++;
      log(`${progress} ${cached ? "cached " : ""}✓ ${post.title || post.path}`);
      onProgress({ index, total: candidates.length, status: "restored", path: post.path, title: post.title });
    } catch (error) {
      report.failed.push({ url: snapshot.original, error: error.message });
      log(`${progress} ✗ ${snapshot.original} (${error.message})`);
      onProgress({ index, total: candidates.length, status: "failed", path: snapshot.original });
    }
  }

  // newest first, like a blog
  posts.sort((a, b) => (b.publishedAt || b.archivedAt).localeCompare(a.publishedAt || a.archivedAt));
  report.files = await exportPosts(posts, { formats, outDir, table: opts.table, domain });
  report.images.missing = [...new Set(report.images.missing)];
  report.finishedAt = new Date().toISOString();
  await writeReport(report, outDir);
  return { posts, report };
}
