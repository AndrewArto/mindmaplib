# Change Evidence: React demo shell with D1 persistence controls

Date: 2026-07-06
Agent: Stevens
Commit(s): pending
Request/issue: Restore the demo as a thin consumer of @mindmaplib/react and @mindmaplib/core; add D1 session save/load UI and style switching based on tripleadigital.io.

## Scope

- User-visible change: demo/ is now a React app using @mindmaplib/react's <Mindmap> component instead of the placeholder page. It includes saved-map list, New saved map, D1-backed load/delete, debounced auto-save, layout controls, outline toggle, fit/undo/redo, and TripleA / TripleA dark themes.
- Package(s) affected: demo only, plus pnpm lockfile dependency graph for demo React dependencies.
- Files intentionally changed:
  - demo/index.html
  - demo/package.json
  - demo/tsconfig.json
  - demo/src/App.tsx
  - demo/src/main.tsx
  - demo/src/sample.ts
  - demo/src/style.css
  - demo/src/main.ts (deleted placeholder entry)
  - pnpm-lock.yaml
  - docs/audit/2026-07-06-demo-react-d1-shell.md
- Files intentionally not touched:
  - packages/core source
  - packages/react source
  - demo/worker.ts
  - demo/src/d1store.ts
  - Cloudflare Pages configuration

## Impact Analysis

- Symbols checked: @mindmaplib/react Mindmap props; @mindmaplib/core MindmapEditor, createDoc, LayoutMode, MindmapDocMeta, NodeContent; D1Store load/list/save/create/delete behavior.
- Risk level: MEDIUM
- Callers found: demo consumes public @mindmaplib/core and @mindmaplib/react exports only. No library internals imported.
- Breaking change: no
- Why selected tests are sufficient: this change is demo-owned app shell and styling. Existing adapter tests cover canvas, outline, keyboard, node rendering, and integration. Demo verification covers TypeScript integration, production bundling, static preview serving, and boundary rules.

## TDD Evidence

- Red test command: pnpm --filter @mindmaplib/demo typecheck; pnpm --filter @mindmaplib/demo build
- Red failure summary: initial React demo shell failed because demo tsconfig lacked jsx support and demo package dependencies did not yet include react/react-dom/@mindmaplib/react.
- Green focused test command: pnpm --filter @mindmaplib/demo typecheck; pnpm --filter @mindmaplib/react build && pnpm --filter @mindmaplib/demo build
- Green focused result: demo typecheck passed; production build emitted dist/index.html, CSS asset, JS asset, _worker.js, and _routes.json.

## Verification

- Format: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm format:check — passed
- Lint: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm lint — passed
- Typecheck: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm typecheck — passed
- Unit tests: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm test — 13 files passed, 106 tests passed
- Build: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm --filter @mindmaplib/react build && PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm --filter @mindmaplib/demo build — passed
- Static preview: Vite preview served title "mindmaplib — TripleA Digital Demo" and JS asset with content-type text/javascript
- Boundary check: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH pnpm check-boundaries — passed, no dependency violations
- git diff check: PATH=/Users/andery-mini/.nvm/versions/node/v22.21.1/bin:$PATH git diff --check — passed
- Commands not run and why: deployed-site verification not run because this branch is not pushed/deployed yet.

## CI

- Workflow/run link: not available yet; branch not pushed in this task.
- Result: local verification passed.
- If blocked, reason and local substitute: GitHub CI pending push/PR; local full gates were run with Node 22.21.1 from nvm because Homebrew node 25 is rejected by dependency-cruiser.

## Codex Review

- Round 1: not run in this task.
- Round 1 resolution: pending PR phase.
- Round 2: not run in this task.
- Round 2 resolution: pending PR phase.

## Changeset

- Added: no
- Package(s): none
- Bump type: none
- Reason: demo-only private package change; no public core/react API change.

## Follow-Ups

- Remaining risks: production D1 binding and Cloudflare deployment still need verification after push.
- Deferred work: PR creation, GitHub CI, and two codex review rounds before merge/deploy.
