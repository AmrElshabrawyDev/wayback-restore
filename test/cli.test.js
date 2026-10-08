import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { banner, canAnimate, logoLines, playBanner } from "../src/cli/banner.js";
import { comingSoon, fitLine, humanDate, platformOptions, toCommand, validateDate, validateDomain, validateTable } from "../src/cli/wizard.js";

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
  assert.equal(cmd, 'npx @amrelshabrawy/wayback-restore example.com --format json,supabase --table articles --to 2024-06 --include "^\\/blog\\/" --no-images');
  assert.equal(toCommand({ domain: "a.com", outDir: "restored", formats: ["json"], images: true }), "npx @amrelshabrawy/wayback-restore a.com");
  assert.equal(toCommand({ domain: "a.com", platform: "nextjs", outDir: "restored", formats: ["md"], images: true }), "npx @amrelshabrawy/wayback-restore a.com --platform nextjs --format md");
  assert.equal(toCommand({ domain: "a.com", platform: "auto", outDir: "restored", formats: ["json"], images: true }), "npx @amrelshabrawy/wayback-restore a.com");
});

test("platformOptions: only platforms that work today; the rest in one 'coming soon' line", () => {
  const options = platformOptions();
  assert.deepEqual(options.map((o) => o.value), ["wordpress", "nextjs", "static", "react", "auto"]);
  assert.ok(options.every((o) => !o.disabled), "no greyed-out rows that look empty");
  assert.match(comingSoon(), /^Coming soon: Blogger, Ghost/);
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

test("humanDate", () => {
  assert.equal(humanDate("2023-09-01"), "1 Sep 2023");
  assert.equal(humanDate("2024-05-23"), "23 May 2024");
  assert.equal(humanDate(undefined), "");
});

test("fitLine keeps progress messages on one line", () => {
  assert.equal(fitLine("short", 10), "short");
  assert.equal(fitLine("أفكار سحرية لحماية الزجاج", 10), "أفكار سحر…");
  assert.equal([...fitLine("x".repeat(200), 40)].length, 40);
});

test("banner draws the hexagon logo in colour terminals", () => {
  const truecolor = banner({ version: "1.0.0", stream: { hasColors: () => true, columns: 120 } });
  assert.match(truecolor, /\x1b\[38;2;\d+;\d+;\d+m\x1b\[48;2;/);
  assert.match(truecolor, /wayback-restore/);
  assert.equal(logoLines().length, 10);

  // 256-colour terminals get the same logo with the nearest palette colours
  const palette = banner({ version: "1.0.0", stream: { hasColors: (n = 16) => n <= 256, columns: 120 } });
  assert.match(palette, /\x1b\[38;5;\d+m/);
  assert.doesNotMatch(palette, /38;2;/);
});

test("logo animation: empty at the start, the full logo at the end", () => {
  const visible = (lines) => lines.join("").replace(/\x1b\[[0-9;]*m/g, "").replace(/ /g, "").length;
  assert.equal(visible(logoLines(0)), 0);
  assert.ok(visible(logoLines(0.3)) > 0 && visible(logoLines(0.3)) < visible(logoLines(1)));
  assert.deepEqual(logoLines(1), logoLines(), "the last frame is the static logo (no shimmer left over)");
});

test("playBanner prints the static banner when it can't animate", async () => {
  let out = "";
  const stream = { isTTY: false, hasColors: () => false, columns: 100, write: (s) => (out += s) };
  await playBanner({ version: "1.0.0", stream });
  assert.equal(out, banner({ version: "1.0.0", stream }));
  assert.ok(!canAnimate({ isTTY: true, hasColors: () => true }, { CI: "true" }), "never animates in CI");
});

test("playBanner never touches the keyboard (raw mode broke arrow keys on Windows)", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/cli/banner.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setRawMode\(|process\.stdin/);
});

test("playBanner animates in a terminal and ends on the full banner", async () => {
  let out = "";
  const stream = { isTTY: true, hasColors: () => true, columns: 100, write: (s) => (out += s) };
  await playBanner({ version: "1.0.0", stream, duration: 10, frames: 5 });
  assert.match(out, /^\x1b\[\?25l/, "hides the cursor");
  assert.match(out, /\x1b\[\?25h$/, "and shows it again");
  assert.equal((out.match(/\x1b\[11A/g) || []).length, 5, "redraws in place");
  assert.ok(out.includes(banner({ version: "1.0.0", stream }).split("\n")[3]));
});
