#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { restore } from "../src/index.js";

const HELP = `
wp-wayback-restore — recover a lost WordPress site's posts from the Wayback Machine

Usage
  npx wp-wayback-restore <domain> [options]

Examples
  npx wp-wayback-restore example.com
  npx wp-wayback-restore example.com --format json,md --from 2022 --to 2024
  npx wp-wayback-restore example.com --include "^/blog/" --dry-run

Options
  -o, --out <dir>          Output folder (default: restored)
  -f, --format <list>      json, md or json,md (default: json)
      --from <date>        Only snapshots from this date (2023, 2023-05, 20230501)
      --to <date>          Only snapshots up to this date
      --include <regex>    Only restore paths matching this pattern
      --exclude <regex>    Skip paths matching this pattern
      --types <list>       Page types to keep: post,page,unknown (default: all three)
      --min-words <n>      Skip pages with fewer words (default: 50)
      --limit <n>          Restore at most n pages (handy for a first test)
      --no-images          Don't download images
      --image-base <url>   Prefix for rewritten image URLs, e.g. https://cdn.example.com
      --image-source <s>   archive, live or archive,live (default: archive,live)
      --keep-missing-images  Keep <img> tags whose image couldn't be downloaded
      --delay <ms>         Pause between archive requests (default: 1500)
      --dry-run            Only list the pages that would be restored
  -q, --quiet              Less output
  -v, --version            Show version
  -h, --help               Show this help
`;

const list = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);

function regex(value, name) {
  try {
    return new RegExp(value, "i");
  } catch {
    fail(`--${name} is not a valid regular expression: ${value}`);
  }
}

function fail(message) {
  console.error(`Error: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", short: "o" },
    format: { type: "string", short: "f" },
    from: { type: "string" },
    to: { type: "string" },
    include: { type: "string" },
    exclude: { type: "string" },
    types: { type: "string" },
    "min-words": { type: "string" },
    limit: { type: "string" },
    "no-images": { type: "boolean" },
    "image-base": { type: "string" },
    "image-source": { type: "string" },
    "keep-missing-images": { type: "boolean" },
    delay: { type: "string" },
    "dry-run": { type: "boolean" },
    quiet: { type: "boolean", short: "q" },
    version: { type: "boolean", short: "v" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}
if (values.version) {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
  process.exit(0);
}
if (positionals.length !== 1) fail("pass exactly one domain, e.g. example.com");

const number = (value, name) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a positive number`);
  return n;
};

const formats = values.format ? list(values.format) : undefined;
if (formats?.some((f) => !["json", "md"].includes(f))) fail("--format accepts json, md or json,md");

const options = {
  domain: positionals[0],
  outDir: values.out,
  formats,
  from: values.from,
  to: values.to,
  include: values.include && regex(values.include, "include"),
  exclude: values.exclude && regex(values.exclude, "exclude"),
  types: values.types && list(values.types),
  minWords: number(values["min-words"], "min-words"),
  limit: number(values.limit, "limit"),
  images: values["no-images"] ? false : undefined,
  imageBase: values["image-base"],
  imageSources: values["image-source"] && list(values["image-source"]),
  keepMissingImages: values["keep-missing-images"],
  delay: number(values.delay, "delay"),
  dryRun: values["dry-run"],
  log: values.quiet ? undefined : (line) => console.log(line),
};
// let restore() apply its defaults for anything not passed
for (const key of Object.keys(options)) if (options[key] === undefined) delete options[key];

try {
  const { report } = await restore(options);
  if (options.dryRun) {
    console.log(`\n${report.candidates} pages would be restored (dry run, nothing written).`);
  } else {
    console.log(
      `\nDone: ${report.restored} restored, ${report.skipped.length} skipped, ${report.failed.length} failed, ` +
        `${report.images.downloaded} images downloaded, ${report.images.missing.length} missing.` +
        `\nSee ${options.outDir ?? "restored"}/report.json for details.`,
    );
  }
} catch (error) {
  fail(error.message);
}
