import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportPosts, sqlIdentifier, toCsv, toMongoNdjson, toRecord, toSql, toWxr, EXPORTER_IDS } from "../src/exporters.js";

const post = {
  url: "https://example.com/نقل-عفش/",
  path: "/نقل-عفش/",
  slug: "نقل-عفش",
  type: "post",
  title: "نقل عفش — \"أفضل\" سعر, it's here",
  description: "وصف المقال",
  html: "<p>O'Reilly \\ backslash ]]> cdata</p>",
  featuredImage: "/wp-content/uploads/a.jpg",
  publishedAt: "2023-05-01T10:00:00+03:00",
  modifiedAt: null,
  author: "Amr",
  categories: ["نقل"],
  tags: ["الكويت", "أثاث"],
  lang: "ar",
  archivedAt: "20230510120000",
};

test("toRecord flattens a post into database columns", () => {
  const r = toRecord(post);
  assert.equal(r.slug, "نقل-عفش");
  assert.equal(r.content, post.html);
  assert.equal(r.excerpt, "وصف المقال");
  assert.equal(r.updated_at, null);
  assert.deepEqual(r.tags, ["الكويت", "أثاث"]);
});

test("sqlIdentifier never lets SQL through", () => {
  assert.equal(sqlIdentifier("blog_posts"), "blog_posts");
  assert.equal(sqlIdentifier('posts"; DROP TABLE x; --'), "posts___DROP_TABLE_x____");
  assert.equal(sqlIdentifier("1posts"), "_1posts");
});

test("SQL escapes quotes per dialect and upserts on slug", () => {
  const pg = toSql([post], { dialect: "postgres" });
  assert.match(pg, /CREATE TABLE IF NOT EXISTS "posts"/);
  assert.match(pg, /'<p>O''Reilly \\ backslash/);
  assert.match(pg, /ON CONFLICT \("slug"\) DO UPDATE/);
  assert.match(pg, /'\["الكويت","أثاث"\]'/);

  const my = toSql([post], { dialect: "mysql", table: "articles" });
  assert.match(my, /`articles`/);
  assert.match(my, /O''Reilly \\\\ backslash/);
  assert.match(my, /ON DUPLICATE KEY UPDATE/);
  assert.match(my, /'2023-05-01 07:00:00'/, "dates converted to UTC DATETIME");
  assert.match(my, /utf8mb4/);

  assert.throws(() => toSql([post], { dialect: "oracle" }), /Unknown SQL dialect/);
});

test("SQLite SQL actually runs and round-trips Arabic text", async (t) => {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return t.skip("node:sqlite not available in this Node version");
  }
  const db = new DatabaseSync(":memory:");
  const sql = toSql([post], { dialect: "sqlite" });
  db.exec(sql);
  db.exec(sql); // upsert: running twice must not fail or duplicate
  const rows = db.prepare('SELECT slug, title, content, tags FROM "posts"').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "نقل-عفش");
  assert.equal(rows[0].title, post.title);
  assert.equal(rows[0].content, post.html);
  assert.deepEqual(JSON.parse(rows[0].tags), post.tags);
});

test("CSV quotes cells and starts with a BOM for Excel", () => {
  const csv = toCsv([post]);
  assert.ok(csv.startsWith("﻿slug,path,title"));
  assert.match(csv, /"نقل عفش — ""أفضل"" سعر, it's here"/);
  assert.match(csv, /الكويت\|أثاث/);
});

test("MongoDB NDJSON uses slug as _id and $date for dates", () => {
  const [line] = toMongoNdjson([post]).trim().split("\n");
  const doc = JSON.parse(line);
  assert.equal(doc._id, "نقل-عفش");
  assert.deepEqual(doc.published_at, { $date: "2023-05-01T07:00:00.000Z" });
  assert.equal(doc.updated_at, null);
});

test("WXR is valid-looking WordPress XML with escaped CDATA", () => {
  const xml = toWxr([post], { siteUrl: "https://example.com", siteName: "Example & Co" });
  assert.match(xml, /<wp:wxr_version>1.2<\/wp:wxr_version>/);
  assert.match(xml, /<title>Example &amp; Co<\/title>/);
  assert.match(xml, /]]]]><!\[CDATA\[> cdata/, "]]> inside content is split safely");
  assert.match(xml, /<category domain="post_tag" nicename="[^"]+"><!\[CDATA\[الكويت]]><\/category>/);
  assert.match(xml, /<wp:post_date><!\[CDATA\[2023-05-01 07:00:00]]>/);
});

test("exportPosts writes every format's files", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "wwr-exp-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const files = await exportPosts([post], { formats: EXPORTER_IDS, outDir, table: "posts", domain: "example.com" });
  const expected = [
    "posts.json",
    "posts/نقل-عفش.md",
    "supabase/migration.sql",
    "supabase/posts.json",
    "supabase/import-posts.mjs",
    "prisma/model.prisma",
    "prisma/import-posts.mjs",
    "sql/posts.postgres.sql",
    "sql/posts.mysql.sql",
    "sql/posts.sqlite.sql",
    "mongodb/posts.ndjson",
    "posts.csv",
    "wordpress/wordpress-export.xml",
  ];
  for (const file of expected) {
    assert.ok(files.includes(file), `reported ${file}`);
    await access(path.join(outDir, file));
  }

  // generated scripts never contain credentials — only env lookups
  const supabase = await readFile(path.join(outDir, "supabase/import-posts.mjs"), "utf8");
  assert.match(supabase, /process\.env/);
  assert.match(await readFile(path.join(outDir, "supabase/migration.sql"), "utf8"), /enable row level security/);
  assert.match(await readFile(path.join(outDir, "prisma/model.prisma"), "utf8"), /model Post \{/);
  assert.match(await readFile(path.join(outDir, "prisma/import-posts.mjs"), "utf8"), /prisma\.post\.upsert/);
});

test("exportPosts rejects unknown formats", async () => {
  await assert.rejects(exportPosts([], { formats: ["oracle"], outDir: tmpdir() }), /Unknown format/);
});
