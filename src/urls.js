/**
 * URL helpers: normalizing site URLs, building Wayback URLs and deciding
 * which archived URLs are real content (posts/pages) worth restoring.
 */

/** Override for tests or a self-hosted mirror: WAYBACK_ENDPOINT=http://localhost:8080 */
export const WAYBACK = (process.env.WAYBACK_ENDPOINT || "https://web.archive.org").replace(/\/$/, "");

/** Strip protocol, "www." and trailing slashes: "https://www.Example.com/" → "example.com" */
export function normalizeDomain(input) {
  return String(input)
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

/** Decode a URL path safely (Arabic and other non-Latin slugs are archived percent-encoded) */
export function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Raw archived page, without the Wayback toolbar or rewritten links */
export const snapshotUrl = (timestamp, original) => `${WAYBACK}/web/${timestamp}id_/${original}`;

/** Raw archived image/file */
export const fileSnapshotUrl = (timestamp, original) => `${WAYBACK}/web/${timestamp}im_/${original}`;

/** Matches Wayback-rewritten links: https://web.archive.org/web/20230101000000im_/https://site.com/x */
const WAYBACK_PREFIX = /^(?:https?:)?\/\/web\.archive\.org\/web\/\d{1,14}(?:[a-z]{2}_)?\//i;

/** Turn a Wayback-rewritten URL back into the original one */
export function unwrapWaybackUrl(url) {
  if (!url) return url;
  let out = url.trim();
  if (out.startsWith("/web/")) out = `https://web.archive.org${out}`;
  out = out.replace(WAYBACK_PREFIX, "");
  // "https:/site.com" can appear after unwrapping
  return out.replace(/^(https?):\/(?!\/)/i, "$1://");
}

/** Decoded path of a URL, always starting and ending with "/" ("/" for the homepage) */
export function urlPath(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = String(url).replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0];
  }
  pathname = safeDecode(pathname).replace(/\/{2,}/g, "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (!pathname.endsWith("/")) pathname += "/";
  return pathname;
}

/** Slug used to store a page: the decoded path without the outer slashes ("" for the homepage) */
export const slugFromUrl = (url) => urlPath(url).replace(/^\/|\/$/g, "");

/** Same page regardless of protocol, "www.", query string, trailing slash or encoding */
export const pageKey = (url) => urlPath(url).toLowerCase();

const NON_CONTENT_PATH = [
  /^\/wp-(admin|content|includes|json|login|cron)/i,
  // framework build output and endpoints (Next.js, React, Vite, Cloudflare)
  /^\/(_next|static\/(js|css|media)|assets|api|cdn-cgi|__nextjs)\//i,
  /\/(feed|rss2?|atom|amp|embed|trackback|comments?|xmlrpc\.php)\/?$/i,
  /\/(tag|category|author|search|page|attachment)\//i,
  /\/(cart|checkout|my-account|basket)\//i,
  /\/(wp-sitemap|sitemap[^/]*)\b/i,
  /\.(xml|txt|json|css|js|mjs|map|jpe?g|png|gif|webp|svg|ico|bmp|tiff?|avif|pdf|zip|rar|mp[34]|mov|webm|woff2?|ttf|eot|otf|docx?|xlsx?|pptx?)\/?$/i,
];

const NON_CONTENT_QUERY = /[?&](p|page_id|attachment_id|replytocom|s|amp|share|preview|feed)=/i;

/**
 * Is this archived URL likely a real post or page?
 * Filters out WordPress system URLs, archives, feeds, files and query-string variants.
 */
export function isContentUrl(original, { include, exclude } = {}) {
  const path = urlPath(original);
  const query = original.includes("?") ? original.slice(original.indexOf("?")) : "";
  if (include && !include.test(path)) return false;
  if (exclude && exclude.test(path)) return false;
  if (NON_CONTENT_PATH.some((re) => re.test(path))) return false;
  if (NON_CONTENT_QUERY.test(query)) return false;
  return true;
}

/** Is this URL on the restored site (with or without "www.")? */
export function isSameSite(url, domain) {
  try {
    return normalizeDomain(new URL(url).hostname) === domain;
  } catch {
    return false;
  }
}
