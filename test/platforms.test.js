import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectPlatform, isSpaShell, PLATFORMS, PLATFORM_IDS } from "../src/platforms.js";
import { extractPost, unwrapNextImage } from "../src/extract.js";
import { isContentUrl } from "../src/urls.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("detectPlatform recognises WordPress, Next.js, React and plain HTML", () => {
  assert.equal(detectPlatform(fixture("post.html")), "wordpress");
  assert.equal(detectPlatform(fixture("nextjs.html")), "nextjs");
  assert.equal(detectPlatform(fixture("react-shell.html")), "react");
  assert.equal(detectPlatform(fixture("static.html")), "static");
  assert.equal(detectPlatform('<meta name="generator" content="WordPress 6.5">'), "wordpress");
});

test("isSpaShell spots client-rendered pages with no archived content", () => {
  assert.ok(isSpaShell(fixture("react-shell.html")));
  assert.ok(!isSpaShell(fixture("nextjs.html")), "server-rendered #__next has content");
  assert.ok(!isSpaShell(fixture("static.html")));
});

test("PLATFORMS lists ready platforms and coming-soon ones", () => {
  for (const id of ["wordpress", "nextjs", "static", "react", "auto"]) assert.ok(PLATFORM_IDS.includes(id), id);
  assert.ok(PLATFORMS.some((p) => p.status === "soon"));
  assert.ok(!PLATFORM_IDS.includes("ghost"));
});

test("Next.js page: content without header/nav/footer, original image URLs", () => {
  const post = extractPost(fixture("nextjs.html"), { original: "https://acme.example/services", timestamp: "20240101000000", domain: "acme.example" });
  assert.equal(post.platform, "nextjs");
  assert.equal(post.type, "page");
  assert.equal(post.title, "Our Services | Acme Studio");
  assert.equal(post.description, "Web design, development and SEO services by Acme Studio.");
  assert.match(post.html, /<h2>Web development<\/h2>/);
  assert.doesNotMatch(post.html, /Contact<\/a>|All rights reserved|__NEXT_DATA__|<script/);
  assert.ok(post.images.includes("https://acme.example/images/team.jpg"), "unwrapped from /_next/image");
  assert.match(post.html, /href="\/about"/);
  assert.ok(!post.spaShell);
});

test("hand-coded HTML page: relative images and Arabic text, no menu or footer", () => {
  const post = extractPost(fixture("static.html"), { original: "https://east.example/about.html", timestamp: "20240101000000", domain: "east.example", platform: "static" });
  assert.equal(post.platform, "static");
  assert.equal(post.slug, "about.html");
  assert.equal(post.title, "من نحن - مطعم الشرق");
  assert.match(post.html, /بدأ مطعم الشرق/);
  assert.doesNotMatch(post.html, /جميع الحقوق محفوظة/);
  assert.deepEqual(post.images, ["https://east.example/images/chef.jpg"]);
  // the visible heading "من نحن" is part of the title, so it isn't repeated in the body
  assert.doesNotMatch(post.html, /<h1>/);
});

test("homepages of non-WordPress sites are kept as real pages", () => {
  const post = extractPost(fixture("static.html"), { original: "https://east.example/index.html", timestamp: "1", domain: "east.example" });
  assert.equal(post.type, "home");
  assert.equal(post.slug, "");
});

test("React shell is flagged so it can be skipped with a clear reason", () => {
  const post = extractPost(fixture("react-shell.html"), { original: "https://app.example/dashboard", timestamp: "1", domain: "app.example" });
  assert.equal(post.platform, "react");
  assert.ok(post.spaShell);
});

test("framework build files aren't treated as pages", () => {
  for (const url of [
    "https://acme.example/_next/static/chunks/main.js",
    "https://acme.example/_next/data/abc/services.json",
    "https://app.example/static/js/main.123.js",
    "https://app.example/assets/index-B4x9.js",
    "https://acme.example/api/contact",
    "https://old.example/cgi-sys/defaultwebpage.cgi",
  ]) {
    assert.ok(!isContentUrl(url), url);
  }
  assert.ok(isContentUrl("https://east.example/about.html"));
});

test("unwrapNextImage", () => {
  assert.equal(unwrapNextImage("https://a.example/_next/image?url=%2Fimg%2Fx.png&w=640&q=75"), "https://a.example/img/x.png");
  assert.equal(unwrapNextImage("https://a.example/_next/image?url=https%3A%2F%2Fcdn.example%2Fy.jpg&w=64"), "https://cdn.example/y.jpg");
  assert.equal(unwrapNextImage("https://a.example/img/x.png"), "https://a.example/img/x.png");
});
