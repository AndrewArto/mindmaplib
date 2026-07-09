# Change Evidence: demo anonymous session isolation

Date: 2026-07-09
Agent: Stevens
Commit(s): 15c09dc before final audit update
Request/issue: public demo users who are not authenticated should only see their own saved maps in the left sidebar.

## Scope

- User-visible change:
  - The demo API assigns each browser an anonymous first-party owner cookie.
  - Saved maps are listed, loaded, updated, and deleted only within that anonymous owner scope.
  - A new browser or incognito context starts with an empty saved-map list.
- Package(s) affected:
  - demo only.
- Files intentionally changed:
  - `demo/_routes.json`
  - `demo/worker.ts`
  - `demo/functions/api/sessions.ts`
  - `demo/tests/worker.test.ts`
  - `demo/migrations/002_anonymous_owner.sql`
  - `docs/audit/2026-07-09-demo-anonymous-session-isolation.md`
- Files intentionally not touched:
  - `packages/core/**`
  - `packages/react/**`
  - public package exports
- Operational change:
  - Production D1 needs `owner_hash` column and `idx_sessions_owner_updated` index before the new worker reaches production.
  - Cloudflare Pages production config needs `ANON_ID_SECRET`.

## Impact Analysis

- Symbols checked:
  - `D1Store.list/load/save/create/rename/duplicate/importJson/delete`
  - `demo/worker.ts` `/api/sessions*` routes
  - `demo/functions/api/sessions.ts` Pages Functions equivalent routes
  - D1 `sessions` schema
- Risk level: MEDIUM
- Callers found:
  - Browser demo shell calls `D1Store` only.
  - `D1Store` API contract remains unchanged and keeps using same-origin fetch, so HttpOnly cookies are sent automatically by the browser.
  - Production build uses `demo/worker.ts` through `demo/build-worker.mjs`; `demo/functions/api/sessions.ts` was updated to avoid stale insecure source.
- Breaking change: no public package API change. Existing shared saved rows with `owner_hash IS NULL` become hidden from anonymous owners.
- Why selected tests are sufficient:
  - Worker tests exercise the actual production advanced-mode worker API used by Cloudflare Pages.
  - Tests prove advanced-mode worker routing for HTML bootstrap, HTML cookie bootstrap, API cookie creation, owner hash storage, per-owner list isolation, and cross-owner load/update/delete blocking.
  - Existing D1Store and browser tests cover the unchanged frontend/store contract.

## TDD Evidence

- Red test command:
  - `pnpm exec vitest run --project demo demo/tests/worker.test.ts`
- Red failure summary:
  - 1 existing test passed.
  - 3 new tests failed as expected because the old worker did not set `Set-Cookie`, did not store `owner_hash`, and listed all sessions globally.
  - Failure excerpt: `Error: set-cookie missing` for anonymous cookie and owner-isolation tests.
  - Codex P2 follow-up red: `bootstraps the anonymous owner cookie on the first HTML document response` failed with `Error: set-cookie missing`, proving the first HTML response did not pre-bootstrap the owner cookie.
  - Codex route-config follow-up red: `routes the HTML document through the advanced-mode worker for cookie bootstrap` failed with `expected ['/api/*'] to include '/*'`, proving `_routes.json` did not route HTML through the worker.
- Green focused test command:
  - `pnpm exec vitest run --project demo demo/tests/worker.test.ts`
- Green focused result:
  - 1 file passed, 6 tests passed.

## Verification

- Format:
  - `pnpm format:check`: passed.
- Lint:
  - `pnpm lint`: passed.
- Typecheck:
  - `pnpm typecheck`: passed.
- Unit tests:
  - `pnpm test`: passed.
  - Test Files 28 passed.
  - Tests 303 passed.
- Browser tests:
  - `pnpm test:browser`: passed.
  - 4 Playwright tests passed.
- Demo build:
  - `pnpm --filter @mindmaplib/demo build`: passed.
- Boundary check:
  - `pnpm check-boundaries`: passed.
- Whitespace:
  - `git diff --check`: passed.
- Known existing warnings:
  - TipTap duplicate link extension warnings in tests.
  - React test SVG path warning.
  - Vite chunk-size warning for demo bundle.

## CI

- Workflow/run link: pending after push.
- Result: local verification passed before commit.
- If blocked, reason and local substitute: not blocked at this stage.

## Codex Review

- Pre-final review finding 1: 0 BLOCKER, 1 MAJOR/P2, 0 MINOR, 0 NIT. First-cookie bootstrap could race between initial list and quick create, minting multiple anonymous owners before the browser stores a cookie.
- Pre-final review resolution 1: added HTML document response cookie bootstrap in `demo/worker.ts` and a focused worker regression test.
- Pre-final review finding 2: 0 BLOCKER, 1 MAJOR/P2, 0 MINOR, 0 NIT. HTML bootstrap branch was unreachable because `_routes.json` only included `/api/*`.
- Pre-final review resolution 2: routed the Pages advanced-mode worker for `/*`, excluded static `/assets/*`, and added a focused route-config regression test.
- Round 1: 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT. Codex result: no discrete correctness issue introduced by the patch.
- Round 1 resolution: no action required.
- Round 2: 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT. Codex result: no actionable correctness issues found in worker, route config, migration, or tests.
- Round 2 resolution: no action required.

## Changeset

- Added: no.
- Package(s): none.
- Bump type: none.
- Reason: demo-only implementation, no public `@mindmaplib/core` or `@mindmaplib/react` API change.

## Deployment Notes

- Apply D1 migration before deploying the worker code:
  - add nullable `owner_hash` column.
  - add `idx_sessions_owner_updated` index.
- Set Cloudflare Pages production env var:
  - `ANON_ID_SECRET`, generated random value, never committed.
- Existing rows with `owner_hash IS NULL` are deliberately hidden from anonymous owners.

## Follow-Ups

- Remaining risks:
  - Anonymous ownership is browser-cookie based. Clearing cookies or using a new browser loses access to that anonymous workspace.
  - Cross-device persistence still requires real auth or a recovery/share flow.
- Deferred work:
  - Magic link / passkey / account auth if the demo needs cross-device identity.
