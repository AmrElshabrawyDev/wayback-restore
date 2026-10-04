# wp-wayback-restore

**Recover a lost WordPress site's posts and images from the Internet Archive** — with the original URLs, titles, meta descriptions and Arabic/RTL slugs intact, ready to import into Next.js, Astro or any CMS.

[![npm](https://img.shields.io/npm/v/wp-wayback-restore)](https://www.npmjs.com/package/wp-wayback-restore)
[![CI](https://github.com/AmrElshabrawyDev/wp-wayback-restore/actions/workflows/ci.yml/badge.svg)](https://github.com/AmrElshabrawyDev/wp-wayback-restore/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/wp-wayback-restore)](LICENSE)

```bash
npx wp-wayback-restore example.com
```

## Why

A client's WordPress database was destroyed — no backup — while Google was still showing **182 of its articles** in search results. Those articles were the company's main source of customer calls. Rebuilding them by hand from the Wayback Machine would have taken weeks, and every day offline meant visitors landing on error pages.

This tool is the cleaned-up, reusable version of the scripts I wrote to bring that content back. It:

- **finds every archived page** of the domain through the Wayback CDX API and keeps the newest copy of each,
- **skips WordPress noise** — tag/category archives, feeds, `wp-admin`, attachments, `?p=` links, files,
- **extracts what matters for SEO**: title, meta description (Yoast / Rank Math), canonical, dates, author, categories, tags, featured image,
- **cleans the article HTML**: removes share buttons, ads, table-of-contents widgets, comments, inline styles and page-builder wrappers; unwraps lazy-loaded images; keeps YouTube/Vimeo/Maps embeds,
- **keeps your URLs**: slugs are decoded (`/نقل-عفش-الكويت/`, not `/%D9%86…/`) and internal links become root-relative,
- **downloads the images** (archive first, then the live site), rewrites them to local paths, and **removes images that can't be found** instead of leaving broken `<img>` tags,
- **caches every page**, so an interrupted run resumes without hitting the archive again,
- writes **JSON and/or Markdown with frontmatter**, plus a `report.json` of what was skipped or missing.

Read the full story: [How I recovered 182 articles from the Internet Archive](https://amrelshabrawydev.github.io/blog/wordpress-to-nextjs-arabic-migration) (Arabic) · [WordPress to Next.js migration without losing SEO](https://amrelshabrawydev.github.io/blog/wordpress-to-nextjs-migration-seo).

## Quick start

Requires Node.js 20.18 or newer.

```bash
# 1. See what would be restored (only queries the archive index)
npx wp-wayback-restore example.com --dry-run

# 2. Try a few pages first
npx wp-wayback-restore example.com --limit 5

# 3. Restore everything, as JSON and Markdown
npx wp-wayback-restore example.com --format json,md
```

Output:

```
restored/
├── posts.json          # every post, newest first
├── posts/              # one Markdown file per post (with --format md)
│   └── نقل-عفش-الكويت.md
├── public/             # downloaded images, mirroring their original paths
│   └── wp-content/uploads/2023/05/team.jpg
├── report.json         # restored / skipped / failed pages, missing images
└── .cache/             # raw archived HTML (delete to re-download)
```

The `public/` folder is laid out so you can copy it straight into a Next.js (or Astro, Vite…) `public/` folder — image URLs in the posts (`/wp-content/uploads/…`) keep working unchanged.

## Options

| Option | Default | Description |
|---|---|---|
| `-o, --out <dir>` | `restored` | Output folder |
| `-f, --format <list>` | `json` | `json`, `md` or `json,md` |
| `--from <date>` / `--to <date>` | — | Only use snapshots in this range (`2023`, `2023-05`, `20230501`). Useful when the site was hacked or replaced at some point |
| `--include <regex>` | — | Only restore paths matching this pattern, e.g. `"^/blog/"` |
| `--exclude <regex>` | — | Skip paths matching this pattern |
| `--types <list>` | `post,page,unknown` | Page types to keep (detected from WordPress body classes / `og:type`) |
| `--min-words <n>` | `50` | Skip near-empty pages |
| `--limit <n>` | — | Restore at most *n* pages |
| `--no-images` | — | Don't download images |
| `--image-base <url>` | `""` | Prefix for rewritten image URLs, e.g. `https://cdn.example.com` |
| `--image-source <list>` | `archive,live` | Where to look for images, in order |
| `--keep-missing-images` | — | Keep `<img>` tags whose image couldn't be downloaded |
| `--delay <ms>` | `1500` | Pause between archive requests — please be gentle with the Internet Archive |
| `--dry-run` | — | Only list the pages that would be restored |
| `-q, --quiet` | — | Less output |

## Output format

Each post in `posts.json`:

```jsonc
{
  "url": "https://example.com/نقل-عفش-الكويت/",
  "path": "/نقل-عفش-الكويت/",
  "slug": "نقل-عفش-الكويت",
  "type": "post",                      // post | page | unknown
  "title": "نقل عفش الكويت بأفضل الأسعار",
  "description": "أفضل شركة نقل عفش في الكويت…",
  "canonical": "https://example.com/نقل-عفش-الكويت/",
  "publishedAt": "2023-05-01T10:00:00+03:00",
  "modifiedAt": "2023-05-08T09:30:00+03:00",
  "author": "…",
  "categories": ["نقل عفش"],
  "tags": ["الكويت"],
  "lang": "ar",
  "dir": "rtl",
  "featuredImage": "/wp-content/uploads/2023/05/moving-truck.jpg",
  "images": ["/wp-content/uploads/2023/05/team-1024x683.jpg"],
  "html": "<p>نقدم خدمة <strong>نقل عفش</strong>…</p>",
  "archivedAt": "20230510120000",
  "archiveUrl": "https://web.archive.org/web/20230510120000/https://example.com/…"
}
```

## Use it from code

```js
import { restore } from "wp-wayback-restore";

const { posts, report } = await restore({
  domain: "example.com",
  outDir: "restored",
  formats: ["json"],
  include: /^\/blog\//,
  log: console.log,
});
```

Lower-level helpers are exported too: `listSnapshots`, `extractPost`, `restoreImages`, `toMarkdown`, `isContentUrl`, `unwrapWaybackUrl`, `slugFromUrl`.

### Example: import into Supabase

```js
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Use a service-role key from the environment — never hard-code credentials in scripts
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const posts = JSON.parse(await readFile("restored/posts.json", "utf8"));

const { error } = await supabase.from("posts").upsert(
  posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.description,
    content: p.html,
    image_url: p.featuredImage,
    published_at: p.publishedAt,
  })),
  { onConflict: "slug" },
);
if (error) throw error;
```

### Example: serve the old URLs in Next.js

Keep WordPress's trailing slashes so every URL Google knows stays identical:

```js
// next.config.js
export default { trailingSlash: true };
```

```tsx
// app/[slug]/page.tsx — Arabic slugs arrive encoded, so decode before looking them up
export default async function Post({ params }) {
  const slug = decodeURIComponent((await params).slug);
  const post = posts.find((p) => p.slug === slug);
  // …
}
```

## Good to know

- **The archive doesn't have everything.** Some pages or images were never captured, or only an older version was. Check `report.json` and review your most important pages by hand.
- **Only restore content you own** (or have permission to restore).
- **Be gentle with the Internet Archive** — it's a free, non-profit service. Keep the default delay, and use `--limit` / `--dry-run` while testing. If you rely on it, [consider donating](https://archive.org/donate).
- The tool reads public snapshots only; it never logs in anywhere and needs no API keys.

## Development

```bash
git clone https://github.com/AmrElshabrawyDev/wp-wayback-restore.git
cd wp-wayback-restore
npm install
npm test
```

Tests run offline against a fake archive (`test/restore.test.js`) and a sample WordPress page (`test/fixtures/post.html`). Issues and pull requests are welcome — especially HTML from themes or page builders the extractor doesn't handle well yet.

## License

[MIT](LICENSE) © [Amr Elshabrawy](https://amrelshabrawydev.github.io)
