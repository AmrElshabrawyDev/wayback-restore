import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPost, originalImageUrl } from "../src/extract.js";

const html = readFileSync(new URL("./fixtures/post.html", import.meta.url), "utf8");
const snapshot = {
  original: "https://example.com/%D9%86%D9%82%D9%84-%D8%B9%D9%81%D8%B4-%D8%A7%D9%84%D9%83%D9%88%D9%8A%D8%AA/",
  timestamp: "20230510120000",
  domain: "example.com",
};
const post = extractPost(html, snapshot);

test("reads the SEO data WordPress/Yoast left in the page", () => {
  assert.equal(post.title, "نقل عفش الكويت بأفضل الأسعار");
  assert.equal(post.description, "أفضل شركة نقل عفش في الكويت مع فك وتركيب وتغليف الأثاث بأمان.");
  assert.equal(post.slug, "نقل-عفش-الكويت");
  assert.equal(post.path, "/نقل-عفش-الكويت/");
  assert.equal(post.type, "post");
  assert.equal(post.publishedAt, "2023-05-01T10:00:00+03:00");
  assert.equal(post.modifiedAt, "2023-05-08T09:30:00+03:00");
  assert.equal(post.lang, "ar");
  assert.equal(post.dir, "rtl");
  assert.deepEqual(post.categories, ["نقل عفش"]);
  assert.deepEqual(post.tags, ["الكويت"]);
  assert.match(post.canonical, /^https:\/\/example\.com\//);
  assert.equal(post.archiveUrl, `https://web.archive.org/web/20230510120000/${snapshot.original}`);
});

test("unwraps Wayback URLs for the featured image and lazy-loaded images", () => {
  assert.equal(post.featuredImage, "https://example.com/wp-content/uploads/2023/05/moving-truck.jpg");
  assert.ok(post.images.includes("https://example.com/wp-content/uploads/2023/05/team-1024x683.jpg"));
  assert.doesNotMatch(post.html, /web\.archive\.org/);
  assert.doesNotMatch(post.html, /data:image/);
});

test("keeps the article and drops theme/plugin clutter", () => {
  assert.match(post.html, /<h2>لماذا تختارنا؟<\/h2>/);
  assert.match(post.html, /<strong>نقل عفش<\/strong>/);
  assert.match(post.html, /<figcaption>/);
  for (const junk of [/<script/, /<style/, /sharedaddy|addtoany|Share</, /adsbygoogle|<ins/, /ez-toc|محتويات المقال/, /تعليق قديم/, /entry-title/, /class=|style=|data-/]) {
    assert.doesNotMatch(post.html, junk);
  }
  // the title lives in post.title, not duplicated in the body
  assert.doesNotMatch(post.html, /<h1/);
  // empty list items and &nbsp; paragraphs are removed
  assert.doesNotMatch(post.html, /<li>\s*<\/li>|<p>(&nbsp;| |\s)*<\/p>/);
});

test("internal links become root-relative, external links stay absolute", () => {
  assert.match(post.html, /href="\/فك-وتركيب\/"/);
  assert.match(post.html, /href="https:\/\/en\.wikipedia\.org\/wiki\/Kuwait"/);
});

test("keeps video embeds, drops other iframes", () => {
  assert.match(post.html, /<iframe src="https:\/\/www\.youtube\.com\/embed\/abc123"/);
  assert.doesNotMatch(post.html, /ads\.example\.net/);
});

test("pages without a WordPress article fall back gracefully", () => {
  const page = extractPost(
    `<html><head><title>About us</title></head><body class="page"><main><p>${"word ".repeat(40)}</p></main></body></html>`,
    { original: "https://example.com/about/", timestamp: "20230101000000", domain: "example.com" },
  );
  assert.equal(page.title, "About us");
  assert.equal(page.type, "page");
  assert.match(page.html, /<p>word/);
});

test("detects the homepage", () => {
  const home = extractPost(`<html><body class="home blog"><main>${"x ".repeat(100)}</main></body></html>`, {
    original: "https://example.com/",
    timestamp: "20230101000000",
    domain: "example.com",
  });
  assert.equal(home.type, "home");
  assert.equal(home.slug, "");
});

test("originalImageUrl removes WordPress size suffixes", () => {
  assert.equal(originalImageUrl("https://e.com/a/photo-1024x683.jpg"), "https://e.com/a/photo.jpg");
  assert.equal(originalImageUrl("https://e.com/a/photo.jpg"), "https://e.com/a/photo.jpg");
});
