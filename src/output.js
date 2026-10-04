/** Writes restored posts as JSON (one file) and/or Markdown (one file per post with frontmatter) */
import fs from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
// keep embeds (YouTube, maps) as raw HTML — Markdown has no equivalent
turndown.keep(["iframe"]);

export const toMarkdown = (html) => turndown.turndown(html || "");

/** Minimal YAML for frontmatter: strings are always double-quoted (safe for Arabic, colons, quotes) */
function yaml(data) {
  const value = (v) =>
    Array.isArray(v) ? `[${v.map(value).join(", ")}]` : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(String(v));
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${value(v)}`)
    .join("\n");
}

/** File name for a slug: "blog/مقال-جديد" → "blog__مقال-جديد.md" (no nested folders, no unsafe characters) */
export const markdownFileName = (slug) =>
  `${slug.replace(/[\\:*?"<>|]/g, "-").replace(/\//g, "__").slice(0, 180) || "index"}.md`;

export async function writePostsJson(posts, outDir) {
  const file = path.join(outDir, "posts.json");
  await fs.writeFile(file, JSON.stringify(posts, null, 2));
  return file;
}

export async function writeMarkdown(post, outDir) {
  const dir = path.join(outDir, "posts");
  await fs.mkdir(dir, { recursive: true });
  const frontmatter = yaml({
    title: post.title,
    slug: post.slug,
    description: post.description,
    date: post.publishedAt,
    updated: post.modifiedAt,
    author: post.author,
    categories: post.categories,
    tags: post.tags,
    image: post.featuredImage,
    lang: post.lang,
    originalUrl: post.url,
    archiveUrl: post.archiveUrl,
  });
  const file = path.join(dir, markdownFileName(post.slug));
  await fs.writeFile(file, `---\n${frontmatter}\n---\n\n${toMarkdown(post.html).trim()}\n`);
  return file;
}

export async function writeReport(report, outDir) {
  const file = path.join(outDir, "report.json");
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  return file;
}
