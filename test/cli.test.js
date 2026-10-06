import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { banner } from "../src/cli/banner.js";
import { platformOptions, toCommand, validateDate, validateDomain, validateTable } from "../src/cli/wizard.js";

const run = promisify(execFile);
const CLI = fileURLToPath(new URL("../bin/cli.js", import.meta.url));

test("validateDomain accepts real domains, including Arabic ones", () => {
  for (const ok of ["example.com", "https://www.example.com/blog/", "sub.example.co.uk", "موقع.السعودية"]) {
    assert.equal(validateDomain(ok), undefined, ok);
  }
  for (const bad of ["", "localhost", "not a domain", "example"]) assert.ok(validateDomain(bad), bad);
});

test("validateDate and validateTable", () => {
  assert.equal(validateDate("2024"), undefined);
  assert.equal(validateDate("2024-06-01"), undefined);
  assert.ok(validateDate("June 2024"));
  assert.equal(validateTable("blog_posts"), undefined);
  assert.ok(validateTable("posts; drop"));
});

test("toCommand rebuilds the equivalent one-line command", () => {
  const cmd = toCommand({ domain: "example.com", outDir: "restored", formats: ["json", "supabase"], table: "articles", to: "2024-06", include: /^\/blog\//i, images: false, limit: Infinity });
  assert.equal(cmd, 'npx @amrelshabrawydev/wayback-restore example.com --format json,supabase --table articles --to 2024-06 --include "^\\/blog\\/" --no-images');
  assert.equal(toCommand({ domain: "a.com", outDir: "restored", formats: ["json"], images: true }), "npx @amrelshabrawydev/wayback-restore a.com");
  assert.equal(toCommand({ domain: "a.com", platform: "nextjs", outDir: "restored", formats: ["md"], images: true }), "npx @amrelshabrawydev/wayback-restore a.com --platform nextjs --format md");
  assert.equal(toCommand({ domain: "a.com", platform: "auto", outDir: "restored", formats: ["json"], images: true }), "npx @amrelshabrawydev/wayback-restore a.com");
});

test("platformOptions: ready platforms selectable, coming-soon ones shown but disabled", () => {
  const options = platformOptions();
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
  assert.deepEqual(enabled, ["wordpress", "nextjs", "static", "react", "auto"]);
  const soonIndex = options.findIndex((o) => o.value === "__soon");
  assert.ok(soonIndex > enabled.length - 1);
  assert.ok(options.slice(soonIndex).every((o) => o.disabled));
});

test("banner shows the logo and name without colour codes when NO_COLOR is set", () => {
  const text = banner({ version: "1.2.3", stream: { hasColors: () => false } });
  assert.match(text, /wayback-restore/);
  assert.match(text, /v1\.2\.3/);
  assert.match(text, /▄▀█ █▀▄▀█ █▀█/);
});

test("CLI: --version, --help and argument errors", async () => {
  const { version } = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal((await run("node", [CLI, "--version"])).stdout.trim(), version);

  const help = (await run("node", [CLI, "--help"], { env: { ...process.env, NO_COLOR: "1" } })).stdout;
  assert.match(help, /interactive mode/);
  assert.match(help, /supabase/);
  assert.match(help, /--platform/);
  assert.match(help, /nextjs\s+Next\.js/);

  // not a terminal + no domain → clear error instead of hanging on questions
  await assert.rejects(run("node", [CLI]), (e) => /pass exactly one domain/.test(e.stderr));
  await assert.rejects(run("node", [CLI, "example.com", "--format", "oracle"]), (e) => /unknown --format oracle/.test(e.stderr));
  await assert.rejects(run("node", [CLI, "example.com", "--platform", "drupal"]), (e) => /unknown --platform drupal/.test(e.stderr));
  await assert.rejects(run("node", [CLI, "example.com", "--platform", "ghost"]), (e) => /coming soon/.test(e.stderr));
  await assert.rejects(run("node", [CLI, "example.com", "--limit", "abc"]), (e) => /--limit must be a positive number/.test(e.stderr));
});
