/**
 * Website platforms the tool knows how to restore, and automatic detection
 * from an archived page's HTML.
 *
 * Add a platform: add an entry here, then teach extract.js where its content
 * lives (see PLATFORM_CONTENT_SELECTORS there).
 */

/** status: "ready" | "beta" | "soon" */
export const PLATFORMS = [
  { id: "wordpress", label: "WordPress", hint: "posts & pages · Yoast / Rank Math SEO", status: "ready" },
  { id: "nextjs", label: "Next.js", hint: "server-rendered & static pages", status: "ready" },
  { id: "static", label: "HTML · CSS · JavaScript", hint: "hand-coded sites & static generators", status: "ready" },
  { id: "react", label: "React (SPA)", hint: "Vite / Create React App — pre-rendered pages only", status: "beta" },
  { id: "auto", label: "Not sure", hint: "detect it automatically for each page", status: "ready" },
  { id: "blogger", label: "Blogger", hint: "coming soon", status: "soon" },
  { id: "ghost", label: "Ghost", hint: "coming soon", status: "soon" },
  { id: "wix", label: "Wix · Squarespace", hint: "coming soon", status: "soon" },
  { id: "stores", label: "Shopify · Salla · Zid · WooCommerce", hint: "products — coming soon", status: "soon" },
];

export const PLATFORM_IDS = PLATFORMS.filter((p) => p.status !== "soon").map((p) => p.id);

/** Human label for a platform id */
export const platformLabel = (id) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

/**
 * Guess which platform produced an archived page.
 * @param {string} html raw HTML
 * @returns {"wordpress"|"nextjs"|"react"|"static"}
 */
export function detectPlatform(html) {
  const head = html.slice(0, 200_000);
  if (/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i.test(head) || /\/wp-(content|includes)\//i.test(head) || /\bwp-json\b/.test(head)) {
    return "wordpress";
  }
  if (/id=["']__NEXT_DATA__["']/.test(html) || /\/_next\/static\//.test(head) || /self\.__next_f/.test(html)) {
    return "nextjs";
  }
  if (isSpaShell(html) || /\/static\/js\/main\.[\w]+\.js/.test(head) || /<script[^>]+type=["']module["'][^>]+src=["'][^"']*\/assets\/index-[\w-]+\.js/.test(head)) {
    return "react";
  }
  return "static";
}

/**
 * A client-rendered page whose content was loaded by JavaScript after the
 * archive saved it: an (almost) empty #root / #app / #__next and no real text.
 */
export function isSpaShell(html) {
  const mount = html.match(/<div[^>]+id=["'](root|app|__next)["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!mount) return false;
  const bodyText = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return mount[2].replace(/<[^>]+>/g, "").trim().length === 0 && bodyText.length < 40;
}
