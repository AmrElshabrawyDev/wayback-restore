import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isContentUrl,
  normalizeDomain,
  pageKey,
  slugFromUrl,
  unwrapWaybackUrl,
  urlPath,
} from "../src/urls.js";

test("normalizeDomain strips protocol, www, path and case", () => {
  assert.equal(normalizeDomain("https://www.Example.com/blog/"), "example.com");
  assert.equal(normalizeDomain("example.com"), "example.com");
});

test("unwrapWaybackUrl restores original URLs", () => {
  assert.equal(
    unwrapWaybackUrl("https://web.archive.org/web/20230510120000im_/https://example.com/a.jpg"),
    "https://example.com/a.jpg",
  );
  assert.equal(unwrapWaybackUrl("/web/2023/https://example.com/x/"), "https://example.com/x/");
  assert.equal(unwrapWaybackUrl("https://web.archive.org/web/20230510120000/http:/example.com/"), "http://example.com/");
  assert.equal(unwrapWaybackUrl("https://other.com/x"), "https://other.com/x");
});

test("Arabic slugs are decoded and keep their trailing slash", () => {
  const url = "https://example.com/%D9%86%D9%82%D9%84-%D8%B9%D9%81%D8%B4/";
  assert.equal(urlPath(url), "/نقل-عفش/");
  assert.equal(slugFromUrl(url), "نقل-عفش");
  assert.equal(slugFromUrl("https://example.com/"), "");
  assert.equal(slugFromUrl("https://example.com/blog/post"), "blog/post");
});

test("pageKey treats protocol, www, query and trailing-slash variants as one page", () => {
  const key = pageKey("https://example.com/post/");
  assert.equal(pageKey("http://www.example.com/post"), key);
  assert.equal(pageKey("https://example.com/post/?utm_source=x"), key);
  assert.equal(pageKey("https://example.com/%70ost/"), key);
});

test("isContentUrl keeps posts and drops WordPress system URLs", () => {
  const ok = ["https://example.com/my-post/", "https://example.com/نقل-عفش/", "https://example.com/2023/05/post/"];
  const no = [
    "https://example.com/wp-content/uploads/a.jpg",
    "https://example.com/wp-admin/",
    "https://example.com/wp-json/wp/v2/posts",
    "https://example.com/feed/",
    "https://example.com/my-post/feed/",
    "https://example.com/tag/kuwait/",
    "https://example.com/category/news/",
    "https://example.com/page/2/",
    "https://example.com/sitemap.xml",
    "https://example.com/?p=123",
    "https://example.com/my-post/?replytocom=5",
    "https://example.com/style.css",
  ];
  for (const url of ok) assert.ok(isContentUrl(url), url);
  for (const url of no) assert.ok(!isContentUrl(url), url);
});

test("isContentUrl honours include/exclude patterns", () => {
  assert.ok(isContentUrl("https://example.com/blog/a/", { include: /^\/blog\// }));
  assert.ok(!isContentUrl("https://example.com/about/", { include: /^\/blog\// }));
  assert.ok(!isContentUrl("https://example.com/blog/a/", { exclude: /^\/blog\// }));
});
