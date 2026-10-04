# Roadmap

The goal: **restore any lost website from the Internet Archive and import it into any platform.** Each phase ships as its own release.

## ✅ v0.2 — WordPress + every export (current)

- WordPress posts & pages: title, SEO meta, dates, taxonomy, featured image, cleaned HTML
- Images downloaded (archive → live), missing ones removed
- Arabic / RTL slugs, internal links rewritten, resumable cache
- Exports: JSON, Markdown, Supabase, Prisma, PostgreSQL, MySQL, SQLite, MongoDB, CSV, WordPress (WXR)
- Interactive mode with a quick 5-page test
- Generic extraction for non-WordPress sites (beta)

## v0.3 — Platform detection & blogs

- Detect the platform automatically from the archived HTML (generator meta tag, URL patterns)
- Dedicated extractors: **Blogger**, **Ghost**, **Medium custom domains**, **Wix blogs**, **Squarespace**, **Joomla**, **Drupal**
- Restore authors and categories as separate tables/collections, not just names

## v0.4 — Online stores

- **Shopify**, **WooCommerce**, **Salla**, **Zid**: products (name, price, description, images, variants where archived), collections/categories
- Product exports for Shopify CSV, WooCommerce CSV and Salla import format

## v0.5 — Whole-site recovery

- Restore every page type (landing pages, service pages, contact pages) with their layout HTML
- Redirect map: old URL → new URL file for Next.js, Netlify, Vercel, Nginx and Apache
- `sitemap.xml` of the restored site, ready for Google Search Console

## v0.6 — Direct imports & quality

- Optional direct import into Supabase / Postgres / MongoDB (credentials from environment variables only)
- Compare archived versions of a page and pick the most complete one
- Image optimization (WebP) and de-duplication

## Ideas

Have a platform or export you need? [Open an issue](https://github.com/AmrElshabrawyDev/wayback-restore/issues) with an example domain.
