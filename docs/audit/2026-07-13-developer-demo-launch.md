# Change Evidence: developer demo launch preparation

Date: 2026-07-13
Agent: Stevens
Commit(s): `55c9841` (implementation); this packet is finalized in a follow-up documentation commit on PR #25.
Request/issue: prepare the mindmaplib demo for developer-community review without publishing or deploying it.
Governing spec: MML-U-0001.

## Scope

- User-visible change:
  - A compact developer introduction identifies mindmaplib as an embeddable React library while keeping the editor primary.
  - GitHub and npm links, the exact install command, accessible Clipboard feedback, and a minimal React example are available above the editor.
  - The default sample explains the mindmaplib architecture and host-owned persistence.
  - Anonymous Cloudflare D1 storage is disclosed without implying an account or local-only persistence.
  - Light, dark, desktop, and mobile layouts retain accessible controls and a usable editor.
  - Default TipTap startup no longer emits duplicate Link extension warnings.
- Package(s) affected:
  - `@mindmaplib/react`: internal default TipTap extension configuration; no public TypeScript API change.
  - `@mindmaplib/demo`: app shell, styles, sample content, and tests.
- Files intentionally changed:
  - `.changeset/config.json`
  - `.changeset/quiet-links.md`
  - `demo/src/App.tsx`
  - `demo/src/sample.ts`
  - `demo/src/style.css`
  - `demo/tests/App.test.tsx`
  - `demo/tests/browser/demo-developer.spec.ts`
  - `demo/tests/sample.test.ts`
  - `docs/audit/2026-07-13-developer-demo-launch.md`
  - `docs/runbooks/NPM_RELEASE.md`
  - `docs/specs/MML-B-0007_REACT_ADAPTER_SPEC.md`
  - `docs/specs/MML-U-0001_DEVELOPER_DEMO_LAUNCH_SPEC.md`
  - `packages/react/src/Mindmap.tsx`
  - `packages/react/src/NodeView.tsx`
  - `packages/react/src/tiptapExtensions.ts`
  - `packages/react/tests/Mindmap.test.tsx`
  - `packages/react/tests/NodeView.test.tsx`
  - `tests/release/package-publication.test.ts`
- Files intentionally not touched:
  - `packages/core/**`.
  - Public export files and public TypeScript signatures.
  - D1 schema, Worker, Pages Functions, authentication, analytics, and backend APIs.
  - `package.json` and `pnpm-lock.yaml`; no dependency was added or changed.
  - Deployment and publication configuration.

## Impact Analysis

- Symbols checked:
  - Public `Mindmap` component exported from `packages/react/src/index.ts`.
  - Public `NodeView` component exported from `packages/react/src/index.ts`.
  - Internal `DEFAULT_TIPTAP_EXTENSIONS` and retained deep-module alias `DEFAULT_EXTENSIONS`.
  - Demo `App`, `createSampleDoc`, and `createSampleDocuments`.
  - Changesets `fixed` group and the React-to-core peer range.
- Callers found:
  - `Mindmap` is consumed by `demo/src/App.tsx`, package README examples, root README, and the React canvas/integration/unit suites.
  - `NodeView` is consumed by `CanvasView` and its direct unit suite.
  - `createSampleDocuments` is consumed by App initialization, the Sample action, and the App/sample regression suites.
  - `DEFAULT_TIPTAP_EXTENSIONS` is used only by Mindmap, NodeView, and direct tests. It is not exported from the package index.
- Risk level: HIGH.
- Risk reason:
  - The changed behavior sits behind public `Mindmap` and `NodeView` exports used by external consumers, even though their API signatures do not change.
  - Static rendering and active editing must use an identical TipTap schema or link content can fail at runtime.
  - The demo first-load sample and compact layout affect every first-time visitor.
  - The one-time fixed version group would have silently bumped unchanged core despite the explicit React-only release requirement.
- Breaking change: no.
- Public API change: no.
- Release classification: patch bug fix for the published React adapter.
- Why selected tests are sufficient:
  - React unit tests exercise default extension construction through the public Mindmap path and the direct NodeView static/edit lifecycle.
  - Demo unit tests cover exact copy, links, Clipboard states, sample content, D1 disclosure, and disclosure semantics.
  - Existing full React and demo suites cover all known Mindmap consumers.
  - Playwright covers the external-consumer boundary: built packages, demo integration, editing, outline, layouts, themes, mobile geometry, and browser console output.

## TDD Evidence

### Developer block, sample, and TipTap regression

- Red test command:
  - `pnpm vitest run demo/tests/App.test.tsx demo/tests/sample.test.ts packages/react/tests/Mindmap.test.tsx packages/react/tests/NodeView.test.tsx --reporter=verbose`
- Red failure summary:
  - 4 test files failed; 8 tests failed and 79 passed.
  - Expected failures included the absent `h1`, absent copy/example controls, old TripleA default sample, and duplicate TipTap extension warning.
- Green focused test command:
  - `pnpm vitest run demo/tests/App.test.tsx demo/tests/sample.test.ts packages/react/tests/Mindmap.test.tsx packages/react/tests/NodeView.test.tsx --reporter=dot`
- Green focused result:
  - 4 test files passed; 87 tests passed.

### Browser behavior and console guard

- Red test command:
  - `pnpm exec playwright test demo/tests/browser/demo-developer.spec.ts --reporter=list`
- Red failure summary:
  - 2 tests failed because the developer heading and controls did not exist.
- Green focused result:
  - 2 Playwright tests passed after implementation.

### Review remediation cycles

1. Example-toggle accessible name:
   - Review finding: the visible action changed to Hide while the accessible name remained View.
   - Mutation replay red: the focused App test failed with `expected 'View React example' to be 'Hide React example'`.
   - Green: the same focused test passed with a state-dependent accessible name.
2. D1 disclosure contrast and live-region availability:
   - Red: the browser test received `rgb(155, 157, 164)` instead of the required high-contrast theme text, and the empty status region used `display: none`.
   - Green: desktop/mobile browser tests passed with `var(--text)` in both themes and a continuously rendered live region.
3. Repeated Clipboard announcement:
   - Red: the focused unit test received the previous `Install command copied.` text instead of an empty transition before the second copy completed.
   - Green: the focused test passed after resetting the live region in a separate task before each Clipboard attempt.
4. TipTap build compatibility:
   - Red: the React declaration build caught the removed internal `DEFAULT_EXTENSIONS` name.
   - Green: the existing alias is retained while both consumers share the corrected extension array.
5. React-only release versioning:
   - Red: the focused release-policy test found the existing Changesets fixed group and failed because it would bump both `@mindmaplib/core` and `@mindmaplib/react`.
   - Green: the one-time fixed group was removed after the completed `0.1.0` release; the release-policy test passed and `pnpm changeset status` listed only `@mindmaplib/react` at patch.
6. Clipboard user activation:
   - Red: the focused App test observed zero synchronous `writeText` calls because a `setTimeout(0)` ran before the Clipboard API invocation.
   - Green: the live region resets synchronously and `writeText` starts in the original click call stack; all six developer-introduction tests passed, including repeated announcement behavior.

## Verification

- Runtime:
  - Node 22.21.1 from `.nvmrc`; pnpm 10.30.0.
- Format:
  - `pnpm format:check`: passed.
- Lint:
  - `pnpm lint`: passed with zero lint warnings.
- Typecheck:
  - `pnpm typecheck`: passed for core, react, and demo including demo tests/Functions configuration.
- Unit tests:
  - `pnpm test`: 35 files, 446 tests passed.
- Coverage:
  - `pnpm test:coverage`: 35 files, 446 tests passed; 90.3% line coverage overall; `tiptapExtensions.ts` 100%.
- Boundary check:
  - `pnpm check-boundaries`: passed; 114 modules and 252 dependencies; zero violations.
- Full local gate:
  - `pnpm run ci`: passed.
- Build:
  - `pnpm build`: passed for core, react declarations, demo, and Cloudflare worker; 130 Vite modules transformed.
- Changeset prediction:
  - `pnpm changeset status`: only `@mindmaplib/react` is predicted at patch; `@mindmaplib/core` is unchanged.
- Browser:
  - `pnpm test:browser`: 24 Playwright tests passed.
  - Dedicated desktop and mobile tests observed zero unexpected console warnings, console errors, or page errors.
- Whitespace:
  - `git diff --check`: passed.
- Static security scan:
  - Added tracked and untracked lines contained no hardcoded secret, shell injection, eval/exec, unsafe deserialization, or SQL string-format finding.
- Commands not run and why:
  - `pnpm ci` is not a package-script invocation in pnpm 10.30.0 and returned `ERR_PNPM_CI_NOT_IMPLEMENTED`; the repository-defined gate is `pnpm run ci`.
  - No npm publication, merge, or production deployment was run. The later-authorized branch push produced only a Cloudflare Pages preview.

## CI

- Baseline main workflow:
  - https://github.com/AndrewArto/mindmaplib/actions/runs/29202697526
  - Result: success before the feature branch was created.
- Pull request:
  - https://github.com/AndrewArto/mindmaplib/pull/25
- Feature workflow:
  - https://github.com/AndrewArto/mindmaplib/actions/runs/29235700379
  - Head reviewed: `55c9841c10c661810613a53091b0d5f4e008e9d7`.
  - `format / lint / typecheck / test / boundaries`: passed in 1m24s.
  - `Playwright navigation E2E`: passed in 57s.
  - Coverage threshold and production build ran inside the successful CI job.
- Cloudflare Pages preview:
  - Check passed for preview deployment `d42cd270-1628-47c5-be0b-650719663fe2`.
  - Preview was authorized after the original no-push constraint was clarified.
- Result:
  - All required PR checks passed before the mandatory post-CI reviews.

## Codex Review

### Pre-PR remediation

- An uncommitted review found one accessibility issue: the example disclosure's visible action and accessible name diverged.
- Independent review found low D1-disclosure contrast and a hidden empty live region.
- A later review found that a pre-write macrotask could consume Clipboard user activation.
- Every finding was fixed with executable red/green regression evidence before commit.
- Final local review after remediation reported zero actionable findings.

### Mandatory post-CI rounds

- Command for both rounds:
  - `codex review --base origin/main`
- Round 1:
  - 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT.
  - Result: no introduced correctness or release-blocking issues.
- Round 2:
  - 0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT.
  - Result: no discrete correctness, security, or maintainability issues; TipTap defaults, demo additions, sample changes, and release metadata were consistent.
- Resolution:
  - No post-CI code change was required.

## Changeset

- Added: yes.
- File: `.changeset/quiet-links.md`.
- Package predicted by Changesets: `@mindmaplib/react` only.
- `@mindmaplib/core`: no bump.
- Bump type: patch.
- Reason: fix duplicate default Link registration in the published adapter without changing public API.

## Process Correction

The first completion report was premature under Section 9 of the runbook.

- Missing feature spec: corrected by adding MML-U-0001 and updating the false TipTap Link statement in MML-B-0007.
- React-only release prediction was not checked: `pnpm changeset status` exposed the one-time fixed group; the post-initial-release policy, config, and regression test now ensure core is not bumped.
- Impact analysis not recorded before implementation: the complete public/exported-symbol and caller analysis is now recorded above. This is a retrospective correction and cannot rewrite the original sequence.
- TDD evidence not persisted: red/green commands and real failure/pass summaries are now recorded above; the accessible-name regression received an explicit mutation replay proving its test fails on the defect.
- Evidence packet absent: corrected by this document.
- Review timing was wrong: the initial reviews happened before feature PR CI. Authorization was obtained, PR #25 was opened, all checks passed, and two clean `--base origin/main` rounds were then completed.
- Staged-file and commit discipline were not completed before the initial report. The exact 18-file scope was subsequently staged, checked, security-scanned, and committed without unrelated files.
- The corrected final response may call the reviewed PR ready, but must state that merge, publication, and production deployment remain intentionally unperformed.

## Follow-Ups

- Remaining risks:
  - Vite still emits the existing chunk-size warning for the 734.66 kB minified demo bundle.
  - The existing EdgeView JSDOM test emits a React warning for rendering an isolated SVG path; browser runtime remains clean.
- Deferred work:
  - Merge PR #25 only after explicit instruction.
  - Do not publish or perform a production deployment without separate instruction.
