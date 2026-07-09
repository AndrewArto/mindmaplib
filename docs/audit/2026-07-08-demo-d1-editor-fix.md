# Change Evidence: demo D1 editor fix

Date: 2026-07-08
Agent: Stevens
Commit(s): 442e4cc plus prior branch commits through d5ff939; production deployment requested explicitly on 2026-07-09.
Request/issue: finish the mindmaplib demo fix with D1-backed persistence, keep document storage out of localStorage, then deliver the navigation/editor fixes to production after local verification.

## Scope

- User-visible change: demo app remains an interactive editor backed by Cloudflare D1 through `/api/sessions`; the toolbar supports add child, add sibling, delete, layout, zoom, fit, undo, redo, import, export, outline, theme, session list, rename, duplicate, and delete.
- Package(s) affected: demo only.
- Files intentionally changed:
  - `demo/src/App.tsx`
  - `demo/src/d1store.ts`
  - `demo/src/editorActions.ts`
  - `demo/src/keyboardGuards.ts`
  - `demo/src/sample.ts`
  - `demo/src/style.css`
  - `demo/functions/api/sessions.ts`
  - `demo/worker.ts`
  - `demo/tests/App.test.tsx`
  - `demo/tests/d1store.test.ts`
  - `demo/tests/editorActions.test.ts`
  - `demo/tests/keyboardGuards.test.ts`
  - `demo/tests/worker.test.ts`
- Files intentionally not touched:
  - `packages/core` production source
  - `packages/react` production source
  - Cloudflare project settings
  - GitHub workflow configuration

## Source of Truth

- Spec used: `docs/specs/MML-B-0006_DEMO_SPEC.md`.
- Runbook used: `docs/runbooks/DEVELOPMENT_PROCESS.md` and `docs/runbooks/DEMO_DEPLOYMENT.md`.
- Relevant spec requirements:
  - Demo owns D1 session persistence, app shell, session list, design tokens, worker build path, and auto-save orchestration.
  - Browser-side `D1Store` calls `/api/sessions`.
  - Production build uses `demo/worker.ts` compiled by `demo/build-worker.mjs` into `demo/dist/_worker.js`.
  - Auto-save debounce window is 2s.
  - No `wrangler.toml`; D1 binding is configured in Cloudflare.

## Impact Analysis

- Symbols checked: `D1Store`, demo `App`, demo editor action helpers, keyboard guard helper, Pages Function session handlers, advanced-mode worker session handlers.
- Risk level: MEDIUM.
- Callers found: demo app uses the store and helpers; production deployment uses `demo/worker.ts`; `demo/functions/api/sessions.ts` is retained for Pages Function parity but is not the advanced-mode production handler.
- Breaking change: no public package API change.
- Why selected tests are sufficient: new tests cover demo-owned store behavior, dev-server fallback behavior, editor mutations, keyboard guard behavior, App fallback rendering, and the production worker create-session path that previously diverged from the Pages Function.

## TDD Evidence

### Worker session id regression

Red test command:

```bash
pnpm exec vitest run --project demo demo/tests/worker.test.ts
```

Red failure summary, with the worker temporarily restored to the old `crypto.randomUUID()` session-id behavior:

```text
Test Files 1 failed (1)
Tests 1 failed (1)
FAIL demo/tests/worker.test.ts > Cloudflare worker sessions API > creates D1 sessions using the serialized document id
AssertionError: expected response id to match doc.id; received a random UUID instead.
```

Green test command:

```bash
pnpm exec vitest run --project demo demo/tests/worker.test.ts
```

Green result after restoring the fix:

```text
Test Files 1 passed (1)
Tests 1 passed (1)
```

### Store and app regression coverage

Focused verification command:

```bash
pnpm exec vitest run --project demo demo/tests/App.test.tsx demo/tests/d1store.test.ts demo/tests/editorActions.test.ts demo/tests/keyboardGuards.test.ts demo/tests/worker.test.ts
```

Focused result from the final local cycle:

```text
App, D1Store, editorActions, keyboardGuards, and worker tests passed.
```

Runbook deviation: the final evidence packet was not written before the first status report. This file corrects the audit trail. Some early red outputs from the prior context were not preserved in the compacted session, so this packet records the red/green evidence that is reproducible from the current diff rather than inventing missing output.

## Verification

Final local commands run with Node 22 via nvm:

```bash
pnpm run ci
pnpm --filter @mindmaplib/demo build
git diff --check
```

Final local result before this audit packet:

```text
pnpm run ci: passed
Test Files 28 passed (28)
Tests 290 passed (290)
pnpm --filter @mindmaplib/demo build: passed
Vite build emitted demo/dist/index.html, JS/CSS assets, _worker.js, and _routes.json.
git diff --check: passed
```

Browser smoke test:

```text
http://100.110.226.2:5174 loaded the demo.
Add child created a selected empty node.
Browser console contained no JavaScript errors.
The dev server was stopped after verification.
```

Production check before deployment:

```text
https://mapdemo.tripleadigital.io responded with the previous deployed version before the 2026-07-09 production push. The production update is tracked in the deployment update section below.
```

## Codex Review

- Round 1: `codex review --base origin/main` found a real blocker: session-id behavior was changed in `demo/functions/api/sessions.ts`, but production build uses `demo/worker.ts`. This would have made local tests and production diverge.
- Resolution: mirrored the same document-id-as-session-id behavior into `demo/worker.ts` and added `demo/tests/worker.test.ts`.
- Round 2: blocked by local Codex authentication failure on the Mac mini.
- Exact failure class:

```text
Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
HTTP error: 401 Unauthorized, wss://chatgpt.com/backend-api/codex/responses
```

Substitute review because Codex auth was unavailable:

```text
An independent reviewer agent inspected the current uncommitted diff and returned passed: true, with no blocking security or logic issues.
```

This is not a replacement for the project requirement of two Codex rounds before merge. It is only the best available local substitute until Codex auth is repaired.

## Security Notes

- Static scan of added lines found no hardcoded secrets, shell injection, eval/exec, pickle, or SQL formatting issues.
- SQL statements use bound parameters.
- `localStorage` is used only for the last focused node id, not for document storage.
- `check_cf.py` is untracked and intentionally not part of the commit scope.

## Production Deployment Update — 2026-07-09

Explicit instruction from Andrey: deliver the navigation fixes to production.

Pre-deploy local verification run on the Mac mini with Node 22:

```bash
pnpm run ci
pnpm --filter @mindmaplib/demo build
git diff --check
```

Result:

```text
pnpm run ci: passed
Test Files 28 passed (28)
Tests 292 passed (292)
pnpm --filter @mindmaplib/demo build: passed
git diff --check: passed
```

Codex review exception:

```text
codex review --base origin/main was attempted as user andery-mini with HOME=/Users/andery-mini.
It failed before review because Codex CLI auth is expired/invalid:
401 Unauthorized, invalid_refresh_token / token_expired.
Codex must be re-logged-in before the normal two-round review gate can be restored.
```

Deployment path:

```text
The production site is Cloudflare Pages at https://mapdemo.tripleadigital.io.
The Pages project is configured to deploy from GitHub main, so production is updated by pushing this verified branch head to origin/main and waiting for the Cloudflare deployment to finish.
```

## Follow-Ups

- Repair Codex CLI auth on the Mac mini and restore the normal two-round `codex review --base origin/main` gate.
- Remove/rotate the embedded GitHub token currently present in the local git remote URL.
- Remove or explicitly keep the untracked local helper `check_cf.py`; it was not included in the production deploy.
