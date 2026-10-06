# Contributing to wayback-restore

First of all — **thank you!** 🙌 Whether you fix a typo, report a site that doesn't restore well, or add support for a whole new platform, you're helping people get back content they thought was lost forever.

**New to open source?** This is a friendly place to start. Look for issues labelled [`good first issue`](https://github.com/AmrElshabrawyDev/wayback-restore/labels/good%20first%20issue), or just open an issue saying what you'd like to work on — I'll help you get your first pull request merged.

## Ways to help

| You can… | How |
|---|---|
| 🐛 Report a problem | [Open an issue](https://github.com/AmrElshabrawyDev/wayback-restore/issues/new/choose) with the domain, the command you ran and `report.json` |
| 🧩 Improve extraction | Add selectors for a theme or page builder in `src/extract.js` + a test fixture |
| 🗄️ Add an export target | Add one object to `EXPORTERS` in `src/exporters.js` + a test |
| 🌍 Add a platform | Blogger, Ghost, Wix… see [ROADMAP.md](ROADMAP.md) |
| 📖 Improve docs | README, examples, translations (Arabic, French, Spanish…) |
| 💬 Help others | Answer questions in issues and discussions |

## Getting set up

You need **Node.js 20.18+** and Git.

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/wayback-restore.git
cd wayback-restore

# 2. Install and run the tests
npm install
npm test

# 3. Try the CLI
node bin/cli.js                         # interactive mode
node bin/cli.js example.com --dry-run   # one command
```

The tests run **offline** against a fake archive, so you don't need network access to the Internet Archive to contribute. To try the CLI against a local mirror, set `WAYBACK_ENDPOINT=http://localhost:8080`.

## Project structure

```
bin/cli.js          command-line entry (flags or interactive mode)
src/
├── index.js        restore() — the pipeline, cache and report
├── cdx.js          lists archived pages via the Wayback CDX API
├── urls.js         URL helpers, slug decoding, noise filter
├── extract.js      archived HTML → clean post
├── images.js       image download & rewrite
├── exporters.js    every export format (one object each)
├── output.js       Markdown & report writers
├── http.js         polite fetch with retries
└── cli/            interactive wizard & banner
test/               node:test suites + fixtures/
```

## Common contributions

### Support a new theme or page builder

1. Save an archived page that restores badly into `test/fixtures/<name>.html` (strip anything personal).
2. Add its content container to `CONTENT_SELECTORS` and its clutter to `JUNK_SELECTORS` in `src/extract.js`.
3. Add a test in `test/extract.test.js` showing the title, content and images come out clean.

### Add an export target

Each exporter is a single object in `src/exporters.js`:

```js
{
  id: "turso",                       // used in --format
  label: "Turso",                    // shown in interactive mode
  hint: "libSQL dump",               // short description
  write: async (posts, { outDir, table, domain }) => {
    // write files into outDir and return their relative paths
    return [await write(outDir, "turso/posts.sql", toSql(posts, { dialect: "sqlite", table }))];
  },
}
```

Rules for exporters:

- **Write files only** — never connect to a database or service.
- **Never ask for or embed credentials.** Generated scripts must read keys from environment variables.
- Use `toRecord(post)` so every database export shares the same columns.
- Add a test in `test/exporters.test.js` (escaping, Arabic text, running twice is safe).

## Pull request checklist

- [ ] `npm test` passes
- [ ] New behaviour has a test
- [ ] README / ROADMAP updated if users will notice the change
- [ ] One focused change per pull request (smaller PRs get merged faster)
- [ ] No real client data or credentials in fixtures

Commit messages: a short summary line in the imperative ("Add Ghost extractor", "Fix MySQL date escaping"), then a blank line and the *why* if it isn't obvious.

## Code style

- Modern JavaScript (ES modules, Node 20+), no build step.
- Small, readable functions with a short comment explaining *why* when it isn't obvious.
- Keep dependencies minimal — every dependency is something users have to download.

## Be kind

Be respectful and welcoming, especially to first-time contributors. Harassment or discrimination of any kind isn't tolerated. Disagreements about code are fine — keep them about the code.

## Questions?

Open an issue, or reach out directly on [LinkedIn](https://www.linkedin.com/in/amr-elshabrawy-dev) or [email](mailto:amrelshabrawy.dev@gmail.com). Every contributor is credited in the release notes. Thank you for helping! 💙
