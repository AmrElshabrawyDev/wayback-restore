/**
 * Downloads a post's images (Wayback first, then the live site) into
 * <imagesDir>/<path> — e.g. out/public/wp-content/uploads/2023/05/photo.jpg — and
 * rewrites the post HTML to the local paths. Images that can't be found
 * anywhere are removed instead of leaving broken <img> tags.
 */
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "./http.js";
import { archiveDate, fileSnapshotUrl, isSameSite, timestampFromWaybackUrl, urlPath } from "./urls.js";

const IMAGE_TYPE = /^image\//i;

/** Local file for an image, mirroring its URL path; null for unsafe paths */
export function localImagePath(imageUrl, imagesDir) {
  const parts = urlPath(imageUrl).split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "..")) return null;
  const root = path.resolve(imagesDir);
  const file = path.resolve(root, ...parts);
  // never write outside the images folder
  return file.startsWith(root + path.sep) ? file : null;
}

const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

/**
 * Download one image. Tries the archived copy (closest to the page's
 * snapshot — the archive redirects to the nearest copy from any year), then the
 * live URL. Skips files that already exist.
 * @returns {Promise<{ source: "exists"|"archive"|"live", archivedAt?: string }|null>}
 *   where it came from (and which archived copy), or null if not found
 */
export async function downloadImage(imageUrl, file, { timestamp, sources = ["archive", "live"], delay = 500, fetchImpl, log }) {
  if (await exists(file)) return { source: "exists" };
  for (const source of sources) {
    const url = source === "archive" ? fileSnapshotUrl(timestamp, imageUrl) : imageUrl;
    try {
      const response = await fetchWithRetry(url, { fetchImpl, retries: 2, timeout: 60_000 });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !IMAGE_TYPE.test(type)) {
        await response.body?.cancel?.();
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) continue;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, buffer);
      await sleep(delay);
      if (source !== "archive") return { source };
      // after the redirect, the URL names the copy that was actually served
      return { source, archivedAt: archiveDate(timestampFromWaybackUrl(response.url) || timestamp) };
    } catch (error) {
      log?.(`  image ${source} failed: ${imageUrl} (${error.message})`);
    } finally {
      if (source === "archive") await sleep(delay);
    }
  }
  return null;
}

/**
 * Download all of a post's same-site images and point the HTML at them.
 * @param {object} post from extractPost()
 * @param {object} options { imagesDir, domain, imageBase, keepMissing, sources, delay, fetchImpl, log }
 * @returns {Promise<{ post: object, downloaded: number, missing: string[], found: object[] }>}
 */
export async function restoreImages(post, { imagesDir, domain, imageBase = "", keepMissing = false, ...download }) {
  const $ = cheerio.load(post.html, null, false);
  const urls = new Set([...post.images, post.featuredImage].filter((url) => url && isSameSite(url, domain)));
  const localUrl = new Map();
  const missing = [];
  const found = [];
  let downloaded = 0;

  for (const imageUrl of urls) {
    const file = localImagePath(imageUrl, imagesDir);
    if (!file) continue;
    const result = await downloadImage(imageUrl, file, { timestamp: post.archivedAt, ...download });
    if (result) {
      if (result.source !== "exists") {
        downloaded++;
        found.push({ url: imageUrl, from: result.source, ...(result.archivedAt && { archivedAt: result.archivedAt }) });
      }
      localUrl.set(imageUrl, imageBase.replace(/\/$/, "") + urlPath(imageUrl).replace(/\/$/, ""));
    } else {
      missing.push(imageUrl);
    }
  }

  $("img").each((_, el) => {
    const $img = $(el);
    const src = $img.attr("src");
    if (localUrl.has(src)) return void $img.attr("src", localUrl.get(src));
    if (!keepMissing && missing.includes(src)) {
      const $figure = $img.closest("figure");
      // a figure that only held this image goes too (caption included)
      if ($figure.length && $figure.find("img").length === 1) $figure.remove();
      else $img.remove();
    }
  });

  const featured = post.featuredImage;
  return {
    post: {
      ...post,
      html: $.html(),
      featuredImage: localUrl.get(featured) ?? (missing.includes(featured) && !keepMissing ? null : featured),
      images: post.images.map((url) => localUrl.get(url) ?? url).filter((url) => keepMissing || !missing.includes(url)),
    },
    downloaded,
    missing,
    found,
  };
}
