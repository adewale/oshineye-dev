# Rayner: publish only the top-ranked explainers

Rayner's [30 October 2026 editorial assessment](https://github.com/adewale/rayner/blob/main/docs/evidence/explainer-stack-rank-2026-10-30.md) has six explainers tied for first at 23/24: `ext4-space`, `isdigit`, `mr-cache`, `oauth-pkce`, `pg-page`, `trust-proxy`. This website exports **only those six**. Rayner still builds and checks all 29 source scenes; a lower-ranked lesson is not deleted upstream. The source export came from merged Rayner commit [`59899dc`](https://github.com/adewale/rayner/commit/59899dc256306ff6630786da739f16ac6027e27c) and the checked Linux catalog artifact in [CI run `40992875416`](https://github.com/adewale/rayner/actions/runs/40992875416). The story receipt covers 144 cases and 2,084 step-width visits without errors. The site no longer publishes the other 23 pages, step shares, JSON descriptions, poster images, CSP rules, gallery entries or `/llms.txt` entries. Older links to excluded lessons will stop working.

The exported catalog and evidence report **six explainers, 46 cases, 31 diagrams**. Its introductory cache request and the embedded lesson are both in the published set. There is no empty toolchain gallery. The browser test `test/rayner-curation.test.js` pins the six IDs and rejects extra exported files and links; the deployment manifest hashes every exported Rayner file and `_headers`. The root `/llms.txt` is checked for the six links but is not yet pinned in `deployment.json` (see the separate manifest follow-up). Its reviewed SHA-256 is `588363810d5fb9babf773103c22bd32cbc2e79dcfa793902559f366295ed10d0`.

To regenerate from a **reviewed Rayner `main`** with a successful `npm run demos:check`:

```sh
npm run site:export -- /path/to/oshineye-dev/site --origin https://oshineye.dev --only ext4-space,isdigit,mr-cache,oauth-pkce,pg-page,trust-proxy
cd /path/to/oshineye-dev
bun run build
bun run typecheck && bun run test && bun run check:rayner-export
```

`site:export` stages a new subtree, checks all 29 built inputs/outputs for freshness and integrity, and removes old generated header rules. `bun run build` regenerates the branded landing page, its clean-URL index and their manifest hashes. Deploy only after reviewing the website PR and only from its merged `main`. The score is an editorial ordering, not a proof of every technical claim.
