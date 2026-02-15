# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- **Build**: `bun run build` — compiles `src/oshineye-config.ts` to IIFE in `site/` and copies `garten.js` from npm
- **Dev (watch)**: `bun run dev` — watch mode for the TypeScript source (does not copy garten.js)
- **Type check**: `bun run typecheck` (runs `bunx tsc --noEmit`)
- **Deploy**: `bun run deploy` — builds then deploys via `wrangler deploy` (Workers Static Assets)

## Architecture

This is a static portfolio site deployed via Cloudflare Workers Static Assets (configured in `wrangler.jsonc`). There is no server-side code or framework.

**`src/oshineye-config.ts`** — The only TypeScript source file. It provides a `getGartenConfig()` function exposed on `window.OshineyeConfig` that configures the Garten animated canvas garden. The accent color is determined by a priority chain: calendar events (UK/Swiss cultural dates) > time of day > season fallback.

**`site/`** — Static assets served directly. `index.html` and `styles.css` are hand-authored (not generated). The compiled `oshineye-config.js` and `garten.js` are build artifacts (gitignored).

**Garten dependency** — The `garten` npm package provides the animated garden. The build step copies its IIFE bundle (`dist/index.global.js`) into `site/garten.js`. It renders in a `#garden` div fixed to the bottom of the viewport.

## Design Conventions

- Typography: Adobe Typekit fonts — Cronos Pro (headings), Chaparral Pro (body)
- Brand color: `#7f0000` (dark red) used for headings, borders, accents
- CSS uses a golden-ratio modular type scale via custom properties (`--step-0` through `--step-6`)
- Widget content (repos, presentations) is statically authored in HTML, not fetched from APIs
