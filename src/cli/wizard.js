/**
 * Interactive mode: `npx @amrelshabrawydev/wayback-restore` with no arguments
 * asks a few questions (like create-next-app) instead of needing long commands.
 */
import * as p from "@clack/prompts";
import pc from "picocolors";
import { EXPORTERS } from "../exporters.js";
import { PLATFORMS } from "../platforms.js";
import { restore } from "../index.js";
import { normalizeDomain } from "../urls.js";

/** "2024-05-23" → "23 May 2024" */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const humanDate = (date) => {
  const [, y, m, d] = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})/) || [];
  return y ? `${Number(d)} ${MONTHS[m - 1]} ${y}` : "";
};
import { banner } from "./banner.js";

/** Stop cleanly when the user presses Ctrl+C / Esc */
const answer = (value) => {
  if (p.isCancel(value)) {
    p.cancel("Cancelled — nothing was downloaded.");
    process.exit(0);
  }
  return value;
};

export const validateDomain = (value) => {
  const domain = normalizeDomain(value || "");
  if (!domain) return "Enter the website's domain, e.g. example.com";
  // letters in any script (Arabic domains too), digits, dots and hyphens, with a TLD
  if (!/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u.test(domain)) return `"${value}" doesn't look like a domain`;
  return undefined;
};

export const validateDate = (value) =>
  /^\d{4}(-?\d{2}(-?\d{2})?)?$/.test((value || "").trim()) ? undefined : "Use YYYY, YYYY-MM or YYYY-MM-DD";

export const validateTable = (value) =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test((value || "").trim()) ? undefined : "Letters, numbers and _ only (e.g. posts)";

/** Equivalent one-line command, so the same restore can be repeated without questions */
export function toCommand(o) {
  const args = [o.domain];
  if (o.platform && o.platform !== "auto") args.push("--platform", o.platform);
  if (o.outDir !== "restored") args.push("--out", o.outDir);
  if (o.formats.join(",") !== "json") args.push("--format", o.formats.join(","));
  if (o.table && o.table !== "posts") args.push("--table", o.table);
  if (o.to) args.push("--to", o.to);
  if (o.include) args.push("--include", `"${o.include.source}"`);
  if (!o.images) args.push("--no-images");
  if (o.limit && Number.isFinite(o.limit)) args.push("--limit", String(o.limit));
  return `npx @amrelshabrawydev/wayback-restore ${args.join(" ")}`;
}

/** Platform list for the "built with" question: ready ones first, then a dimmed "coming soon" group */
export function platformOptions() {
  const tag = (status) => (status === "beta" ? ` ${pc.yellow("beta")}` : "");
  const ready = PLATFORMS.filter((x) => x.status !== "soon").map((x) => ({
    value: x.id,
    label: `${x.label}${tag(x.status)}`,
    hint: x.hint,
  }));
  const soon = PLATFORMS.filter((x) => x.status === "soon").map((x) => ({
    value: x.id,
    label: pc.dim(x.label),
    disabled: true,
  }));
  return [...ready, { value: "__soon", label: pc.dim("── coming soon ──"), disabled: true }, ...soon];
}

/**
 * Shorten text to fit one terminal line. A progress line that wraps can't be
 * redrawn in place, so every spinner frame would print a new line.
 */
export const fitLine = (text, width) => {
  const chars = [...String(text)];
  return chars.length <= width ? chars.join("") : `${chars.slice(0, Math.max(width - 1, 1)).join("")}…`;
};

const BAR_SIZE = 24;

const NEXT_STEPS = {
  json: (dir) => `${pc.bold("JSON")}: ${dir}/posts.json`,
  md: (dir) => `${pc.bold("Markdown")}: copy ${dir}/posts/ into your content folder (Next.js, Astro, Hugo…)`,
  supabase: (dir, table) =>
    `${pc.bold("Supabase")}: run ${dir}/supabase/migration.sql in the SQL editor, then\n  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ${dir}/supabase/import-${table}.mjs`,
  prisma: (dir, table) => `${pc.bold("Prisma")}: add ${dir}/prisma/model.prisma to your schema, migrate, then node ${dir}/prisma/import-${table}.mjs`,
  postgres: (dir) => `${pc.bold("PostgreSQL")}: psql "$DATABASE_URL" -f ${dir}/sql/posts.postgres.sql`,
  mysql: (dir) => `${pc.bold("MySQL")}: mysql -u user -p dbname < ${dir}/sql/posts.mysql.sql`,
  sqlite: (dir) => `${pc.bold("SQLite")}: sqlite3 site.db < ${dir}/sql/posts.sqlite.sql`,
  mongodb: (dir) => `${pc.bold("MongoDB")}: mongoimport --uri "$MONGODB_URI" --collection posts --file ${dir}/mongodb/posts.ndjson`,
  csv: (dir) => `${pc.bold("CSV")}: open ${dir}/posts.csv in Excel or Google Sheets`,
  wordpress: (dir) => `${pc.bold("WordPress")}: Tools → Import → WordPress → ${dir}/wordpress/wordpress-export.xml`,
};

export async function runWizard({ version }) {
  console.log(banner({ version }));
  p.intro(pc.inverse(" Let's bring your site back "));

  const domain = normalizeDomain(
    answer(
      await p.text({
        message: "Which website do you want to restore?",
        placeholder: "example.com",
        validate: validateDomain,
      }),
    ),
  );

  const platform = answer(
    await p.select({
      message: "What was the site built with?",
      options: platformOptions(),
      maxItems: 12,
    }),
  );
  if (platform === "react") {
    p.note(
      "Single-page React apps load their content with JavaScript after the page opens,\n" +
        "so the archive often saved only an empty shell. Pages that were pre-rendered\n" +
        "(or React sites built with Next.js / Gatsby) restore fine — empty shells are\n" +
        `skipped and listed in ${pc.bold("report.json")}.`,
      "Heads-up about React apps",
    );
  }

  const formats = answer(
    await p.multiselect({
      message: `Where will you import the content? ${pc.dim("(space to select, enter to confirm)")}`,
      options: EXPORTERS.map((e) => ({ value: e.id, label: e.label, hint: e.hint })),
      initialValues: ["json"],
      required: true,
    }),
  );

  let table = "posts";
  if (formats.some((f) => ["supabase", "prisma", "postgres", "mysql", "sqlite"].includes(f))) {
    table = answer(
      await p.text({ message: "Database table name?", placeholder: "posts", defaultValue: "posts", validate: (v) => (v ? validateTable(v) : undefined) }),
    ).trim() || "posts";
  }

  const when = answer(
    await p.select({
      message: "Which version of the site?",
      options: [
        { value: "latest", label: "The latest archived copy", hint: "recommended" },
        { value: "before", label: "A copy from before a certain date", hint: "e.g. before the site was hacked or redesigned" },
      ],
    }),
  );
  const to =
    when === "before"
      ? answer(await p.text({ message: "Use copies from before which date?", placeholder: "2024-06-01", validate: validateDate })).trim()
      : undefined;

  const scope = answer(
    await p.select({
      message: "Which pages?",
      options: [
        { value: "all", label: "All posts and pages" },
        { value: "prefix", label: "Only a section of the site", hint: "e.g. /blog/" },
      ],
    }),
  );
  let include;
  if (scope === "prefix") {
    const prefix = answer(await p.text({ message: "Path that the pages start with", placeholder: "/blog/", validate: (v) => (v?.startsWith("/") ? undefined : "Start with /") }));
    include = new RegExp(`^${prefix.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  }

  const images = answer(await p.confirm({ message: "Download the images too?", initialValue: true }));

  const outDir = answer(
    await p.text({ message: "Save everything in which folder?", placeholder: "restored", defaultValue: "restored" }),
  ).trim() || "restored";

  const mode = answer(
    await p.select({
      message: "Ready?",
      options: [
        { value: "test", label: "Quick test — restore the first 5 pages", hint: "recommended first run" },
        { value: "full", label: "Restore everything" },
        { value: "preview", label: "Only list what would be restored", hint: "no downloads" },
      ],
    }),
  );

  const options = {
    domain,
    platform,
    formats,
    table,
    to,
    include,
    images,
    outDir,
    limit: mode === "test" ? 5 : Infinity,
    dryRun: mode === "preview",
  };

  // --- run ---
  const spin = p.spinner();
  let spinning = true;
  spin.start(`Asking the Internet Archive about ${domain}…`);
  let bar;
  let restored = 0;
  try {
    const result = await restore({
      ...options,
      onStart: ({ archivedPages, candidates, version }) => {
        spinning = false;
        spin.stop(`Found ${archivedPages} archived pages, ${pc.bold(candidates)} look like posts/pages`);
        if (version.from) {
          p.log.info(
            `${pc.bold("Version:")} the ${version.mode}\n` +
              `${pc.dim("Archived copies from")} ${pc.cyan(humanDate(version.from))} ${pc.dim("to")} ${pc.cyan(humanDate(version.to))}`,
          );
        }
        if (!options.dryRun && candidates > 0) {
          bar = p.progress({ max: Math.min(candidates, options.limit), size: BAR_SIZE });
          bar.start("Restoring pages");
        }
      },
      onProgress: ({ status, title, path, archivedAt }) => {
        if (status === "restored") restored++;
        const step = status === "restored" || !Number.isFinite(options.limit) ? 1 : 0;
        const icon = status === "restored" ? pc.green("✓") : status === "skipped" ? pc.dim("–") : pc.red("✗");
        const copy = `${humanDate(archivedAt)} copy`;
        // room left after "◒  " + bar + " " + icon + date, and the "..." clack adds at the end
        const room = (process.stdout.columns || 80) - (3 + BAR_SIZE + 1) - (2 + copy.length + 2) - 4;
        const name = room >= 6 ? `  ${fitLine(title || decodeURI(path), room)}` : "";
        bar?.advance(step, `${icon} ${pc.dim(copy)}${name}`);
      },
    });
    bar?.stop(`Restored ${restored} pages`);

    const { report } = result;
    if (options.dryRun) {
      const list = (result.candidates || []).slice(0, 15).map((s) => `  ${decodeURI(new URL(s.original).pathname)}`);
      p.note(`${list.join("\n")}${report.candidates > 15 ? `\n  …and ${report.candidates - 15} more` : ""}`, `${report.candidates} pages would be restored`);
    } else {
      if (report.pages.length) {
        const shown = report.pages.slice(0, 10).map((pg) => `${pc.cyan(humanDate(pg.archivedAt).padEnd(11))}  ${pg.title || decodeURI(new URL(pg.url).pathname)}`);
        const more = report.pages.length > 10 ? `\n${pc.dim(`…and ${report.pages.length - 10} more — every page's date and archive link are in report.json`)}` : "";
        p.note(`${shown.join("\n")}${more}`, "Restored pages · archived copy used");
      }
      if (report.siteNames?.length > 1) {
        p.log.warn(
          [
            `${pc.bold("These pages come from different versions of the site:")}`,
            ...report.siteNames.map((s) => `  “${s.name}” — ${s.pages} page${s.pages === 1 ? "" : "s"}, ${humanDate(s.from)} → ${humanDate(s.to)}`),
            pc.dim("If the site was hacked, wiped or replaced, run again and choose"),
            pc.dim("“A copy from before a certain date” with a date before it happened."),
          ].join("\n"),
        );
      }
      p.note(
        [
          `${pc.green("✓")} ${report.restored} restored   ${pc.dim(`${report.skipped.length} skipped`)}   ${report.failed.length ? pc.red(`${report.failed.length} failed`) : "0 failed"}`,
          options.images ? `${pc.green("✓")} ${report.images.downloaded} images downloaded   ${pc.dim(`${report.images.missing.length} missing`)}` : null,
          report.version.used ? `${pc.cyan("◷")} archived copies from ${humanDate(report.version.used.from)} to ${humanDate(report.version.used.to)}` : null,
          "",
          ...formats.map((f) => NEXT_STEPS[f]?.(outDir, table)).filter(Boolean),
          "",
          pc.dim(`Details: ${outDir}/report.json`),
        ]
          .filter((line) => line !== null)
          .join("\n"),
        "Done",
      );
    }
    p.log.message(`${pc.dim("Run the same restore again without questions:")}\n${pc.cyan(toCommand({ ...options, limit: mode === "test" ? Infinity : options.limit }))}`);
    p.outro(mode === "test" ? "Looks good? Run it again and choose “Restore everything”." : "Happy restoring! ⭐ Star the repo if it helped: github.com/AmrElshabrawyDev/wayback-restore");
  } catch (error) {
    if (spinning) spin.error("Something went wrong");
    else bar?.error("Something went wrong");
    p.log.error(error.message);
    p.outro(pc.red("Restore failed"));
    process.exitCode = 1;
  }
}
