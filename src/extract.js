/**
 * Extracts a clean post from an archived WordPress page: title, SEO meta,
 * dates, featured image and the article HTML without theme/plugin clutter.
 */
import * as cheerio from "cheerio";
import { isSameSite, slugFromUrl, unwrapWaybackUrl, urlPath } from "./urls.js";

/** Where WordPress themes and page builders put the article body, most specific first */
const CONTENT_SELECTORS = [
  ".entry-content",
  ".post-content",
  ".single-post-content",
  ".article-content",
  ".td-post-content",
  ".elementor-widget-theme-post-content .elementor-widget-container",
  ".elementor-location-single",
  "article .content",
  "[itemprop='articleBody']",
  "article",
  "main",
  "#content",
];

/** Theme and plugin clutter inside the article body */
const JUNK_SELECTORS = [
  "script",
  "style",
  "noscript",
  "link",
  "meta",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "svg",
  "canvas",
  "#wm-ipp-base",
  "#wm-ipp",
  "#donato",
  ".sharedaddy",
  ".jp-relatedposts",
  ".addtoany_share_save_container",
  ".a2a_kit",
  ".heateor_sss_sharing_container",
  ".social-share",
  ".share-buttons",
  ".post-share",
  ".related-posts",
  ".yarpp-related",
  ".crp_related",
  ".ez-toc-container",
  "#ez-toc-container",
  ".lwptoc",
  ".rank-math-breadcrumb",
  ".yoast-breadcrumbs",
  ".breadcrumb",
  ".breadcrumbs",
  ".comments-area",
  "#comments",
  ".comment-respond",
  ".post-navigation",
  ".navigation",
  ".nav-links",
  ".author-box",
  ".post-tags",
  ".tags-links",
  ".cat-links",
  ".entry-meta",
  ".entry-footer",
  ".wp-block-buttons",
  ".adsbygoogle",
  "ins",
  "[class*='advert']",
  "[id*='advert']",
];

/** Attributes kept after cleaning (everything else is theme noise) */
const KEEP_ATTRIBUTES = {
  a: ["href", "title", "rel", "target"],
  img: ["src", "alt", "title", "width", "height"],
  iframe: ["src", "width", "height", "title", "allowfullscreen"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  ol: ["start", "type", "reversed"],
  "*": ["dir", "lang"],
};

const EMBED_HOSTS = /^(?:https?:)?\/\/(?:www\.)?(youtube(?:-nocookie)?\.com|player\.vimeo\.com|maps\.google\.|www\.google\.com\/maps)/i;

const meta = ($, ...names) => {
  for (const name of names) {
    const value = $(`meta[property="${name}"], meta[name="${name}"]`).attr("content");
    if (value?.trim()) return value.trim();
  }
  return undefined;
};

/** "Post title | Site name" → "Post title" (only when the site name is known) */
function cleanTitle(title, siteName) {
  if (!title) return title;
  let out = title.replace(/\s+/g, " ").trim();
  if (siteName) {
    for (const separator of [" | ", " - ", " – ", " — ", " « ", " » ", " :: "]) {
      if (out.endsWith(`${separator}${siteName}`)) out = out.slice(0, -(separator.length + siteName.length));
    }
  }
  return out.trim();
}

/** Lazy-loaded images keep the real URL in data-* attributes or srcset */
function realImageSource($img) {
  const candidates = [
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("data-original"),
    $img.attr("data-orig-file"),
    $img.attr("data-large-file"),
    largestFromSrcset($img.attr("data-srcset") || $img.attr("data-lazy-srcset")),
    $img.attr("src"),
    largestFromSrcset($img.attr("srcset")),
  ];
  return candidates.find((src) => src && !src.startsWith("data:") && !/\/(lazy|placeholder|blank)[^/]*\.(gif|png|svg)$/i.test(src));
}

function largestFromSrcset(srcset) {
  if (!srcset) return undefined;
  const items = srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/))
    .filter(([url]) => url)
    .map(([url, size = "0w"]) => ({ url, size: parseFloat(size) || 0 }));
  return items.sort((a, b) => b.size - a.size)[0]?.url;
}

/** Remove the "-300x200" size suffix WordPress adds to resized images */
export const originalImageUrl = (url) => url.replace(/-\d{2,5}x\d{2,5}(\.[a-z0-9]{3,4})(?=$|[?#])/i, "$1");

/**
 * Turn an archived page into a post.
 * @param {string} html raw HTML of the archived page
 * @param {{ original: string, timestamp: string, domain: string }} snapshot
 */
export function extractPost(html, { original, timestamp, domain }) {
  const $ = cheerio.load(html);

  const siteName = meta($, "og:site_name");
  const rawTitle =
    meta($, "og:title", "twitter:title") ||
    $("h1.entry-title, h1.post-title, .entry-header h1, article h1").first().text() ||
    $("title").first().text();
  const title = cleanTitle(rawTitle, siteName) || cleanTitle($("title").first().text(), siteName);

  const bodyClass = $("body").attr("class") || "";
  const ogType = meta($, "og:type");
  const type = /\bhome\b/.test(bodyClass) || urlPath(original) === "/"
    ? "home"
    : /\bsingle-post\b|\bsingle\b/.test(bodyClass) || ogType === "article"
      ? "post"
      : /\bpage\b/.test(bodyClass)
        ? "page"
        : "unknown";

  const resolve = (url) => resolveUrl(unwrapWaybackUrl(url), original);

  const canonical = $('link[rel="canonical"]').attr("href");
  const featuredRaw = meta($, "og:image", "twitter:image");

  // --- article body ---
  // prefer a container with real text (themes often leave empty ".entry-content" wrappers),
  // otherwise the first one that has any text at all
  const containers = CONTENT_SELECTORS.map((selector) => $(selector).first()).filter(($el) => $el.length);
  const $content =
    containers.find(($el) => $el.text().trim().length > 80) ??
    containers.find(($el) => $el.text().trim()) ??
    $();

  let contentHtml = "";
  const images = [];
  if ($content.length) {
    $content.find(JUNK_SELECTORS.join(",")).remove();
    // the title is stored separately
    $content.find("h1").first().remove();

    $content.find("img").each((_, el) => {
      const $img = $(el);
      const src = realImageSource($img);
      if (!src) return void $img.remove();
      const absolute = resolve(src);
      $img.attr("src", absolute);
      images.push(absolute);
    });

    $content.find("iframe").each((_, el) => {
      const $frame = $(el);
      const src = $frame.attr("data-src") || $frame.attr("src");
      if (!src || !EMBED_HOSTS.test(unwrapWaybackUrl(src))) return void $frame.remove();
      $frame.attr("src", resolve(src));
    });

    $content.find("a[href]").each((_, el) => {
      const $a = $(el);
      const href = resolve($a.attr("href"));
      // internal links become root-relative so they keep working on the new site
      $a.attr("href", isSameSite(href, domain) ? relativeUrl(href) : href);
    });

    stripAttributes($, $content);
    unwrapLayoutWrappers($, $content);
    removeEmptyElements($, $content);
    contentHtml = $content.html();
    // tidy the theme's indentation (but never touch whitespace inside <pre> code blocks)
    if (!/<pre[\s>]/i.test(contentHtml)) contentHtml = contentHtml.replace(/^[ \t]+|[ \t]+$/gm, "").replace(/\n{2,}/g, "\n");
    contentHtml = contentHtml.trim();
  }

  const featuredImage = featuredRaw ? resolve(featuredRaw) : images[0];

  return {
    url: unwrapWaybackUrl(original),
    path: urlPath(original),
    slug: slugFromUrl(original),
    type,
    title,
    description: meta($, "description", "og:description", "twitter:description"),
    canonical: canonical ? resolve(canonical) : undefined,
    publishedAt: meta($, "article:published_time") || $("time.entry-date.published, time[datetime]").first().attr("datetime"),
    modifiedAt: meta($, "article:modified_time", "og:updated_time") || $("time.updated").first().attr("datetime"),
    author: meta($, "author", "article:author") || $(".author .fn, .author-name, [rel='author']").first().text().trim() || undefined,
    categories: unique($("a[rel~='category']").map((_, el) => $(el).text().trim()).get()),
    tags: unique($("a[rel='tag']").map((_, el) => $(el).text().trim()).get()),
    lang: $("html").attr("lang"),
    dir: $("html").attr("dir"),
    featuredImage,
    images: unique(images),
    html: contentHtml,
    archivedAt: timestamp,
    archiveUrl: `https://web.archive.org/web/${timestamp}/${original}`,
  };
}

function resolveUrl(url, base) {
  if (!url) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** https://site.com/%D8%A7/?x=1#y → /ا/?x=1#y (decoded path keeps Arabic slugs readable) */
function relativeUrl(href) {
  const url = new URL(href);
  let path = url.pathname;
  try {
    path = decodeURI(path);
  } catch {
    /* keep encoded */
  }
  return `${path}${url.search}${url.hash}`;
}

function stripAttributes($, $root) {
  $root.find("*").each((_, el) => {
    const keep = new Set([...(KEEP_ATTRIBUTES[el.tagName] || []), ...KEEP_ATTRIBUTES["*"]]);
    for (const name of Object.keys(el.attribs || {})) {
      if (!keep.has(name)) $(el).removeAttr(name);
    }
  });
}

/** Page builders nest content in many empty <div>/<span> wrappers — unwrap them */
function unwrapLayoutWrappers($, $root) {
  for (let pass = 0; pass < 6; pass++) {
    const wrappers = $root.find("div, span, section").filter((_, el) => !el.attribs || Object.keys(el.attribs).length === 0);
    if (!wrappers.length) break;
    wrappers.each((_, el) => {
      const $el = $(el);
      // keep block structure: a div with only text becomes a paragraph
      if (el.tagName !== "span" && $el.children().length === 0 && $el.text().trim()) {
        el.tagName = "p";
        return;
      }
      $el.replaceWith($el.contents());
    });
  }
}

function removeEmptyElements($, $root) {
  $root.find("p, li, h2, h3, h4, h5, h6, strong, em, b, i, a, figure, blockquote").each((_, el) => {
    const $el = $(el);
    if (!$el.text().replace(/ /g, " ").trim() && !$el.find("img, iframe, video").length) $el.remove();
  });
}

const unique = (list) => [...new Set(list.filter(Boolean))];
