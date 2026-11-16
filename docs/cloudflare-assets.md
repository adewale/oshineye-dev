# Cloudflare upload artifact

`site/` remains the source of truth, including Rayner's unmodified version 2 exports, manifests, and digest-pinned sections of `_headers` and `llms.txt`. Do not rewrite those pins to accommodate the host.

## Why there is a staging directory

Cloudflare Workers Static Assets accepts at most 100 `_headers` rules. The current source has 107: three host rules plus two rules for each of 52 explainers (the clean reader URL and its `.html` spelling). Production rejected PR #34's first deployment with API error 100324.

`bun run build` now verifies both exports and copies the site to the gitignored `.cloudflare-assets/` directory. `tools/prepare-cloudflare-assets.mjs` changes **only the private `_headers` upload recipe**: it omits an exact reader `.html` rule only when its clean URL rule has identical headers. It never merges policies or broadens URL matches. All other files, including both deployment manifests, remain byte-identical to `site/`. It fails if the projected recipe still exceeds 100 rules or any line exceeds 2,000 bytes. Rebuilding clears stale staging files.

`wrangler.jsonc` deploys `.cloudflare-assets/` with `html_handling: auto-trailing-slash`. On this handler, `reader.html` and `reader/` redirect to `reader`; only the canonical URL serves the exported HTML and needs its CSP. The upload therefore has **55 rules** and preserves the exact policies on every served reader. Manifest header-section pins describe the original recipe in `site/`, not the projected private recipe; their response semantics are checked separately. This is an explicit host deployment adaptation, not a new upstream export.

## Validation and deployment

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run check:rayner-export
bun run check:cloudflare
```

`check:cloudflare` starts Wrangler's real local static-assets handler with the deployment configuration and checks:
- Every reader's exact HTML bytes, CSP and cache headers.
- Every reader's `.html` and slash redirects, including preservation of query parameters.
- Both branded project pages and their trailing-slash redirects.
- Exactly one “Poppy, explained” section and the exact `llms.txt` contents.
- Every public file pinned by both export manifests (934 files in this export).

Wrangler is pinned to 4.90.0, the version used by the deployment workflow. These checks run in the existing CI `lint` job and again before a production deployment. `bun run deploy` also runs the handler check before deploying.

To publish, run **Cloudflare deploy** on `main` with `production=true` and approve the production environment. After it succeeds, attest the actual edge responses with:

```sh
bun run check:cloudflare --origin https://oshineye.dev
```

This live check compares against the local `site/`, so first check out and build the deployed commit. Local simulation alone does not prove edge behavior.

For watch development, `bun run dev` still compiles into `site/`; rerun `bun run build` to refresh the deployment/preview staging directory. `bun run preview` builds it before starting Wrangler.
