import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { restore } from "../src/index.js";

const POST = readFileSync(new URL("./fixtures/post.html", import.meta.url), "utf8");
const ARABIC = "%D9%86%D9%82%D9%84-%D8%B9%D9%81%D8%B4-%D8%A7%D9%84%D9%83%D9%88%D9%8A%D8%AA";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001", "hex");

/** A fake Internet Archive: CDX listing, page snapshots and images */
function fakeArchive() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const respond = (body, { status = 200, type = "text/html" } = {}) =>
      new Response(body, { status, headers: { "content-type": type } });

    if (url.startsWith("https://web.archive.org/cdx/")) {
      return respond(
        JSON.stringify([
          ["original", "timestamp", "statuscode", "mimetype"],
          [`https://example.com/${ARABIC}/`, "20220101000000", "200", "text/html"],
          [`https://www.example.com/${ARABIC}/`, "20230510120000", "200", "text/html"], // newer copy of the same page
          ["https://example.com/", "20230510120000", "200", "text/html"],
          ["https://example.com/tag/kuwait/", "20230510120000", "200", "text/html"],
          ["https://example.com/thin-page/", "20230510120000", "200", "text/html"],
          ["https://example.com/broken/", "20230510120000", "200", "text/html"],
        ]),
        { type: "application/json" },
      );
    }
    if (url.includes(`id_/https://www.example.com/${ARABIC}/`)) return respond(POST);
    if (url.includes("id_/https://example.com/thin-page/")) return respond("<html><body class='page'><main><p>Too short to keep.</p></main></body></html>");
    if (url.includes("id_/https://example.com/broken/")) return respond("Not found", { status: 404 });
    if (url.includes("id_/https://example.com/")) return respond(`<html><head><meta name="generator" content="WordPress 6.5"></head><body class="home"><main>${"x ".repeat(100)}</main></body></html>`);
    // images: the team photo exists in the archive, the truck only on the live site, "missing" nowhere
    if (url.includes("im_/https://example.com/wp-content/uploads/2023/05/team-1024x683.jpg")) return respond(PNG, { type: "image/jpeg" });
    if (url === "https://example.com/wp-content/uploads/2023/05/moving-truck.jpg") return respond(PNG, { type: "image/jpeg" });
    if (url.includes("missing.jpg") || url.includes("moving-truck.jpg")) return respond("<html>404</html>", { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  };
  return { fetchImpl, calls };
}

const exists = (file) => access(file).then(() => true, () => false);

test("restores posts, images, markdown and a report end to end", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "wwr-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const { fetchImpl, calls } = fakeArchive();

  const { posts, report } = await restore({ domain: "https://www.example.com/", outDir, formats: ["json", "md"], delay: 0, fetchImpl });

  // one post: duplicates merged (newest snapshot used), tag archive filtered, homepage/thin/broken skipped
  assert.equal(posts.length, 1);
  const [post] = posts;
  assert.equal(post.slug, "نقل-عفش-الكويت");
  assert.equal(post.archivedAt, "20230510120000");
  assert.ok(!calls.some((url) => url.includes("20220101000000")), "older snapshot not downloaded");
  assert.ok(!calls.some((url) => url.includes("/tag/")), "tag archive not downloaded");

  // images: rewritten to local paths, missing one removed with its <figure>
  assert.equal(post.featuredImage, "/wp-content/uploads/2023/05/moving-truck.jpg");
  assert.match(post.html, /src="\/wp-content\/uploads\/2023\/05\/team-1024x683\.jpg"/);
  assert.doesNotMatch(post.html, /missing\.jpg|صورة مفقودة/);
  assert.ok(await exists(path.join(outDir, "public/wp-content/uploads/2023/05/team-1024x683.jpg")));
  assert.ok(await exists(path.join(outDir, "public/wp-content/uploads/2023/05/moving-truck.jpg")));

  // report
  assert.equal(report.restored, 1);
  assert.equal(report.images.downloaded, 2);
  assert.deepEqual(report.images.missing, ["https://example.com/wp-content/uploads/2023/05/missing.jpg"]);
  assert.deepEqual(report.skipped.map((s) => s.reason).sort(), ["homepage", "too-short"]);
  assert.equal(report.failed.length, 1);
  assert.match(report.failed[0].error, /404/);

  // files on disk
  const json = JSON.parse(await readFile(path.join(outDir, "posts.json"), "utf8"));
  assert.equal(json[0].title, "نقل عفش الكويت بأفضل الأسعار");
  const [mdFile] = await readdir(path.join(outDir, "posts"));
  assert.equal(mdFile, "نقل-عفش-الكويت.md");
  const md = await readFile(path.join(outDir, "posts", mdFile), "utf8");
  assert.match(md, /^---\ntitle: "نقل عفش الكويت بأفضل الأسعار"\nslug: "نقل-عفش-الكويت"/);
  assert.match(md, /## لماذا تختارنا؟/);
  assert.match(md, /<iframe/);
  assert.ok(await exists(path.join(outDir, "report.json")));
});

test("re-runs use the cache instead of hitting the archive again", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "wwr-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  await restore({ domain: "example.com", outDir, delay: 0, fetchImpl: fakeArchive().fetchImpl });
  const second = fakeArchive();
  const { posts } = await restore({ domain: "example.com", outDir, delay: 0, fetchImpl: second.fetchImpl });

  assert.equal(posts.length, 1);
  const pageFetches = second.calls.filter((url) => url.includes("id_/"));
  // only the 404 page (never cached) is requested again; images already exist on disk
  assert.deepEqual(pageFetches.map((u) => u.split("id_/")[1]), ["https://example.com/broken/"]);
  assert.ok(!second.calls.some((url) => url.includes("team-1024x683")));
});

test("--limit counts restored pages and stops once it's reached", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "wwr-limit-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const { fetchImpl, calls } = fakeArchive();

  // the homepage comes first and is skipped, so a limit of 1 must keep going to the real post
  const { report } = await restore({ domain: "example.com", outDir, delay: 0, images: false, limit: 1, include: /^\/($|%|[^a-z])/i, fetchImpl });
  assert.equal(report.restored, 1);
  assert.equal(report.candidates, 2);
  assert.deepEqual(report.skipped.map((s) => s.reason), ["homepage"]);
  assert.ok(!calls.some((url) => url.includes("thin-page") || url.includes("broken")), "stopped after the limit");
});

test("dry run lists candidates without downloading pages", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "wwr-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const { fetchImpl, calls } = fakeArchive();
  const lines = [];

  const { report } = await restore({ domain: "example.com", outDir, dryRun: true, fetchImpl, log: (l) => lines.push(l) });

  assert.equal(report.candidates, 4);
  assert.equal(calls.length, 1, "only the CDX listing");
  assert.ok(lines.some((l) => l.includes(ARABIC)));
});

test("rejects an invalid domain", async () => {
  await assert.rejects(restore({ domain: "not a domain" }), /Invalid domain/);
});
