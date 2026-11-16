# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- **Build**: `bun run build` — syncs both project pages, compiles `src/oshineye-config.ts` to IIFE in `site/`, copies `garten.js` from npm, then verifies the exports and stages `.cloudflare-assets/`
- **Dev (watch)**: `bun run dev` — watch mode for the TypeScript source (does not copy garten.js)
- **Preview**: `bun run preview` — builds then serves locally via `wrangler dev`
- **Type check**: `bun run typecheck` (runs `bunx tsc --noEmit`)
- **Test**: `bun run test` (runs `bun test` with `TZ=Pacific/Auckland`, so local-vs-UTC date bugs fail; tests in `test/` fake the clock with `setSystemTime`)
- **CI**: one job, `lint` in `.github/workflows/ruff.yml`, runs `uvx ruff@0.16.0 check tools`, `bun run typecheck` and `bun run test` on every push and pull request. Add new cheap checks to that job rather than adding workflows.
- **Static-assets check**: `bun run check:cloudflare` — checks the staged upload through Wrangler's real handler; add `--origin https://oshineye.dev` to verify deployed bytes, headers and redirects
- **Deploy**: `bun run deploy` — builds, checks the staged handler, then deploys via `wrangler deploy` (Workers Static Assets)

## Architecture

This is a static portfolio site deployed via Cloudflare Workers Static Assets (configured in `wrangler.jsonc`). There is no server-side code or framework.

**`src/oshineye-config.ts`** — The only TypeScript source file. It provides a `getGartenConfig()` function exposed on `window.OshineyeConfig` that configures the Garten animated canvas garden. The accent color is determined by a priority chain: calendar events (UK/Swiss cultural dates, with a one-day event beating a longer range it falls inside) > time of day. `getSeasonAccent()` exists but is not called, so the season palette is never used.

**`site/`** — Source static assets. `index.html` and `styles.css` are hand-authored (not generated). The compiled `oshineye-config.js` and `garten.js` are build artifacts (gitignored). The build stages a byte-identical copy in `.cloudflare-assets/`, except for the private `_headers` recipe: duplicate `.html` reader rules are omitted because Cloudflare redirects them to clean URLs. This keeps the upload under Cloudflare's 100-rule limit without rewriting source export pins or changing served CSPs. See `docs/cloudflare-assets.md`.

**Garten dependency** — The `garten` npm package provides the animated garden. The build step copies its IIFE bundle (`dist/index.global.js`) into `site/garten.js`. It renders in a `#garden` div fixed to the bottom of the viewport.

## Design Conventions

- Typography: Adobe Typekit fonts — Cronos Pro (headings), Chaparral Pro (body)
- Brand color: `#7f0000` (dark red) used for headings, borders, accents
- CSS uses a golden-ratio modular type scale via custom properties (`--step-0` through `--step-6`)
- Widget content (repos, presentations) is statically authored in HTML, not fetched from APIs

## Project Copy Must Be Grounded

Project descriptions on the site (`.repo-desc` in `site/index.html`, `subtitle` in `site/img/repo/generated/*/manifest.json`, and `site/projects/*.html`) must be quoted from, or directly derived from, each repository's GitHub description or README. Do not add features, counts or claims the source does not state, and never ship generator placeholder text. Invented descriptions have shipped twice (fixed by hand in 89b7306 and 828099c). The PR template asks for the source of every changed description.
