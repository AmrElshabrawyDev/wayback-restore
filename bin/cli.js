#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { restore } from "../src/index.js";
import { EXPORTERS, EXPORTER_IDS } from "../src/exporters.js";
import { banner } from "../src/cli/banner.js";
import { PLATFORMS, PLATFORM_IDS } from "../src/platforms.js";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `
Usage
  npx @amrelshabrawy/wayback-restore              interactive mode (asks a few questions)
  npx @amrelshabrawy/wayback-restore <domain> [options]

Examples
  wayback-restore example.com --dry-run
  wayback-restore example.com --format json,md --limit 5
  wayback-restore example.com --format supabase,postgres --table articles
  wayback-restore my-next-site.com --platform nextjs --format md
  wayback-restore example.com --to 2024-06 --include "^/blog/"

Options
  -p, --platform <name>    What the site was built with (default: auto):
${PLATFORMS.filter((x) => x.status !== "soon").map((x) => `                             ${x.id.padEnd(10)} ${x.label}${x.status === "beta" ? " (beta)" : ""} · ${x.hint}`).join("\n")}
  -o, --out <dir>          Output folder (default: restored)
  -f, --format <list>      Comma-separated, default json:
${EXPORTERS.map((e) => `                             ${e.id.padEnd(10)} ${e.hint}`).join("\n")}
      --table <name>       Table/collection name for database exports (default: posts)
      --from <date>        Only snapshots from this date (2023, 2023-05, 20230501)
      --to <date>          Only snapshots up to this date
      --include <regex>    Only restore paths matching this pattern
      --exclude <regex>    Skip paths matching this pattern
      --types <list>       Page types to keep: post,page,unknown (default: all three)
      --min-words <n>      Skip pages with fewer words (default: 50)
      --limit <n>          Stop after n restored pages (skipped ones don't count)
      --no-images          Don't download images
      --image-base <url>   Prefix for rewritten image URLs, e.g. https://cdn.example.com
      --image-source <s>   archive, live or archive,live (default: archive,live)
      --keep-missing-images  Keep <img> tags whose image couldn't be downloaded
      --delay <ms>         Pause between archive requests (default: 1500)
      --dry-run            Only list the pages that would be restored
  -i, --interactive        Ask questions instead of reading options
  -q, --quiet              Less output
  -v, --version            Show version
  -h, --help               Show this help
`;

const list = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);

function fail(message) {
  console.error(`Error: ${message}\nRun with --help for usage.`);
  process.exit(1);
}

function regex(value, name) {
  try {
    return new RegExp(value, "i");
  } catch {
    fail(`--${name} is not a valid regular expression: ${value}`);
  }
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      platform: { type: "string", short: "p" },
      out: { type: "string", short: "o" },
      format: { type: "string", short: "f" },
      table: { type: "string" },
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
      interactive: { type: "boolean", short: "i" },
      quiet: { type: "boolean", short: "q" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (error) {
  fail(error.message);
}
const { values, positionals } = parsed;

if (values.help) {
  console.log(banner({ version: pkg.version }) + HELP);
  process.exit(0);
}
if (values.version) {
  console.log(pkg.version);
  process.exit(0);
}

// No domain given in a terminal → interactive mode
if (values.interactive || (positionals.length === 0 && process.stdin.isTTY && process.stdout.isTTY)) {
  const { runWizard } = await import("../src/cli/wizard.js");
  await runWizard({ version: pkg.version });
  process.exit(process.exitCode ?? 0);
}

if (positionals.length !== 1) fail("pass exactly one domain, e.g. example.com (or run without arguments for interactive mode)");

const number = (value, name) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a positive number`);
  return n;
};

const formats = values.format ? list(values.format) : undefined;
const unknown = formats?.filter((f) => !EXPORTER_IDS.includes(f));
if (unknown?.length) fail(`unknown --format ${unknown.join(", ")}. Available: ${EXPORTER_IDS.join(", ")}`);

const platform = values.platform?.trim().toLowerCase();
if (platform && !PLATFORM_IDS.includes(platform)) {
  const soon = PLATFORMS.find((x) => x.id === platform && x.status === "soon");
  fail(soon ? `${soon.label} support is coming soon — see ROADMAP.md` : `unknown --platform ${values.platform}. Available: ${PLATFORM_IDS.join(", ")}`);
}

const options = {
  domain: positionals[0],
  platform,
  outDir: values.out,
  formats,
  table: values.table,
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
        `\nFiles: ${report.files.join(", ")}` +
        `\nSee ${options.outDir ?? "restored"}/report.json for details.`,
    );
  }
} catch (error) {
  fail(error.message);
}
