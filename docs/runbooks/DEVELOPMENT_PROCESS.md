# mindmaplib Development Process Runbook

Status: required working process for mindmaplib agents and contributors.

This runbook turns the project rules into a repeatable path from a request to a
tested change and, when appropriate, an npm publish. It is intended for humans
and coding agents working in the same repository.

## 1. Source of Truth

Read these before changing code:

- `AGENTS.md` for agent rules and boundary requirements.
- `docs/specs/` for the feature specification you are working on.
- This runbook for TDD-evidence, CI expectations, and codex review.

If these documents conflict, use this priority order:

1. Explicit user instruction for the current task, unless it asks for unsafe
   handling of secrets or violates the package boundary contract.
2. `AGENTS.md`.
3. This runbook.
4. CI policy (`.github/workflows/`).
5. Feature-specific specs.

## 2. Non-Negotiable Rules

- `packages/core/` must never import from `packages/react/` or `demo/`.
- `packages/core/` must never import React or any DOM-specific library.
- All production TypeScript must be strict-mode with zero `any`.
- Every public API change requires a changeset.
- Every non-trivial code change requires TDD evidence (red → green).
- Every PR requires codex review (2 rounds) before merge.
- Never publish to npm manually. Publishing is changeset-driven via CI.
- No secrets, API keys, or private tokens in commits, docs, or PR descriptions.
- Trailing whitespace in any `*.md` fails CI.

## 3. Change Workflow

### 3.1 Orient

Before editing:

1. **Check that `main` branch CI is green.** If `main` is red from a prior
   change, fixing it is part of the current task — do not start new work on a
   broken build.
2. Confirm the task scope and affected package surface (core, react, demo).
3. Check the worktree:

   ```bash
   git status --short
   ```

4. Identify unrelated local changes. Do not revert or stage changes you did
   not make.
5. Read the nearest `docs/specs/` document for the feature.
6. Understand blast radius: is this an exported symbol? A public API change?
   An internal helper?

### 3.2 Impact Check

Before changing an exported symbol (function, class, interface, type):

1. Check callers across the monorepo:

   ```bash
   pnpm check-boundaries    # structural: confirms core isolation
   ```

   ```bash
   # Find all references to a symbol
   grep -rn "symbolName" packages/ demo/
   ```

2. Determine risk level:
   - **LOW**: internal helper, not exported, used only within one module.
   - **MEDIUM**: exported API, used within the monorepo (react imports it,
     demo imports it) but not yet consumed by external users.
   - **HIGH**: public API exported from `packages/core/src/index.ts` or
     `packages/react/src/index.ts`. External consumers depend on this.

3. Record in the evidence packet: symbol checked, risk level, callers found,
   and why the selected tests are sufficient.

Risk rule:

- LOW: direct unit tests may be enough.
- MEDIUM: add or update coverage at the boundary where the symbol is consumed.
- HIGH: pause, state the risk, expand tests across all consumers. Consider
  whether this is a breaking change requiring a changeset bump (MAJOR).

### 3.3 TDD Development

Default path:

1. Write or update the smallest test that proves the requested behavior.
2. Run it and capture the failing result summary in the evidence packet. This
   is the red stage.
3. Implement the narrowest production change.
4. Re-run the focused test until it passes.
5. Add boundary/failure tests if risk level requires them.
6. Run the broader suite listed in Section 4.

Acceptable alternatives:

- For pure refactors, preserve existing tests first, then add regression tests
  if behavior was previously unprotected.
- For docs-only changes, the "test" is review plus markdown hygiene; do not
  invent code tests.

Do not call a change complete because it "looks right." It needs executable
proof.

### 3.4 Local Verification

Minimum for any code change:

```bash
pnpm format --check
pnpm lint
pnpm typecheck
pnpm test
pnpm check-boundaries
```

Or the full gate:

```bash
pnpm ci
```

Before committing, always run:

```bash
git diff --check
git status --short
```

Record exact commands and pass/fail results in the evidence packet.

### 3.5 CI PR

Push the branch, open a PR. GitHub Actions runs:

- Format check (prettier).
- Lint (eslint).
- Typecheck (tsc --noEmit, all packages).
- Unit tests (vitest, all packages).
- Coverage (80% threshold).
- Boundary check (dependency-cruiser).

CI must pass before codex review and merge. If GitHub Actions is unavailable,
document the blockage and run local verification instead — do not pretend CI
passed.

### 3.6 Codex Review (Mandatory, 2 Rounds)

After CI is green on the PR:

```
codex review --base origin/main
```

Run from the repository root, PTY mode.

**Round 1.** Codex analyzes the diff and produces findings categorized as:

- **BLOCKER**: correctness bug, security issue, public API contract violation.
  Must fix before merge.
- **MAJOR**: significant design issue, missing edge case coverage, performance
  problem. Must fix before merge.
- **MINOR**: improvement suggestion, style nit. Should fix, can defer with
  justification.
- **NIT**: cosmetic. Optional.

Address all BLOCKER and MAJOR findings. Commit fixes. Push.

**Round 2.** Re-run codex review against the updated branch. Confirm:

- All previous BLOCKER/MAJOR findings are resolved.
- No new BLOCKER/MAJOR findings introduced by the fixes.

If round 2 is clean (zero BLOCKER, zero MAJOR), proceed to merge. If new
findings appear, iterate.

Record both rounds in the evidence packet: finding counts, categories,
resolutions.

### 3.7 Changeset

If the PR changes public API (exports from `packages/core/src/index.ts` or
`packages/react/src/index.ts`), add a changeset:

```bash
pnpm changeset
```

Select the affected package(s) and bump type:

- **patch**: bug fix, no API change.
- **minor**: new feature, new export, backward-compatible.
- **major**: breaking change, removed/renamed export, incompatible API change.

Commit the changeset file alongside the code changes.

### 3.8 Merge

Before squash-merge to `main`:

1. Evidence packet is complete.
2. CI is green (or CI-blocked exception is documented).
3. Codex review round 2 is clean (zero BLOCKER, zero MAJOR).
4. Changeset added if public API changed.
5. Staged files match the task scope.
6. No unrelated changes in the diff.

### 3.9 Publish (Automated)

Publishing happens automatically via changesets:

1. On merge to `main`, changesets bot opens a "Version Packages" PR that bumps
   versions and generates changelogs.
2. Merging that PR triggers the release workflow in GitHub Actions, which
   publishes to npm and creates a GitHub release tag.

Never run `npm publish` manually. Never publish from a feature branch.

## 4. Local Verification Commands

| Gate       | Command                 | What it checks                     |
| ---------- | ----------------------- | ---------------------------------- |
| Format     | `pnpm format --check`   | Prettier formatting                |
| Lint       | `pnpm lint`             | ESLint, zero warnings              |
| Typecheck  | `pnpm typecheck`        | tsc --noEmit, strict, all packages |
| Unit tests | `pnpm test`             | Vitest, all packages               |
| Boundaries | `pnpm check-boundaries` | core has no react/demo imports     |
| Full gate  | `pnpm ci`               | All of the above in sequence       |

Per-package test:

```bash
pnpm --filter @mindmaplib/core test
pnpm --filter @mindmaplib/react test
```

## 5. CI Expectations

GitHub workflows under `.github/workflows/`:

- **PR workflow** (`ci.yml`): format, lint, typecheck, unit tests, coverage,
  boundary check. Must pass before merge.
- **Release workflow** (`release.yml`): triggered by changeset "Version
  Packages" PR merge. Builds packages, publishes to npm, creates GitHub
  release.
- Required rule: CI must pass before merge. No exceptions unless GitHub Actions
  is administratively blocked, in which case local verification evidence must
  be documented in the PR.

## 6. Commit and Merge Discipline

Before commit:

1. Stage only files that belong to the task.

   ```bash
   git add <specific-files>
   ```

2. Review the staged diff:

   ```bash
   git diff --cached --stat
   git diff --cached --name-only
   ```

3. Commit with a concise message naming the behavior changed:

   ```bash
   git commit -m "feat(core): add moveNode transaction for reparenting"
   git commit -m "fix(react): outline drag-drop not updating parentId"
   git commit -m "docs(specs): add MML-B-0002 keyboard nav spec"
   ```

Commit message prefixes:

- `feat(scope):` new feature or capability.
- `fix(scope):` bug fix.
- `refactor(scope):` code change that neither fixes a bug nor adds a feature.
- `docs(scope):` documentation only.
- `chore(scope):` tooling, config, dependencies.
- `test(scope):` test additions or fixes.

Scope is `core`, `react`, `demo`, `specs`, or `repo`.

## 7. Spec Backlog Versioning

Specs are backlog artifacts with stable identity and SemVer versioning. Every
spec document is a trackable work item.

### 7.1 Required Header

Every spec starts with these fields immediately below the title. Optional
relationship fields use `none` when empty:

```text
Status: draft | accepted | implemented | superseded.
Date: YYYY-MM-DD.
Owner: <name>.
Spec-ID: MML-<lane-code>-<4-digit-number>.
Spec-Version: MAJOR.MINOR.PATCH+<lane>.<4-digit-number>.
Backlog lane: urgent | backlog | low.
Depends-on: none | comma-separated Spec-ID values.
Supersedes: none | comma-separated Spec-ID values.
Split-into: none | comma-separated Spec-ID values.
Process: none | governing process Spec-ID.
```

### 7.2 Identity

`Spec-ID` is stable for the life of the spec. It does not change when the spec
moves between draft, accepted, and implemented.

Format:

```text
MML-<lane-code>-<4-digit-number>
```

Lane codes:

- `U`: urgent feature or blocking launch work.
- `B`: normal backlog.
- `L`: low-priority, opportunistic, or research.

Examples:

- `MML-U-0001`: first urgent spec.
- `MML-B-0014`: fourteenth normal backlog spec.
- `MML-L-0003`: third low-priority spec.

If priority changes after triage, do not rewrite old commits. Add a changelog
entry and update `Backlog lane`. The `Spec-ID` remains stable unless the spec
is split.

### 7.3 Spec Version

`Spec-Version` follows strict SemVer for the normative contract, plus build
metadata for backlog sorting:

```text
MAJOR.MINOR.PATCH+lane.number
```

Examples:

- `1.0.0+urgent.0001`
- `1.2.0+backlog.0014`
- `0.3.1+low.0003`

SemVer rules:

- `MAJOR`: incompatible contract change. Existing tests, implementation plans,
  or acceptance criteria need rework.
- `MINOR`: additive scope, new acceptance criteria, new non-breaking test
  cases, or expanded implementation slice.
- `PATCH`: clarification, typo fix, wording improvement, or non-normative
  example that does not change expected behavior.

Build metadata is not used for SemVer precedence. It exists so tooling can
group and sort specs by lane and backlog number.

### 7.4 Backlog Lanes

**urgent**: blocking launch work, critical bug in shipped code, or a feature
that must preempt the active backlog. Urgent specs must include: trigger,
acceptance criteria, rollback or fail-safe behavior.

**backlog**: planned work with normal priority. Backlog specs must include:
goals, non-goals, implementation outline, test plan.

**low**: exploratory, opportunistic, or nice-to-have. Low-priority specs must
state the explicit reason the work is not on the normal path.

### 7.5 File Naming

```text
MML-U-0001_<SHORT_TITLE>_SPEC.md
MML-B-0002_<SHORT_TITLE>_SPEC.md
MML-L-0001_<SHORT_TITLE>_SPEC.md
```

Place in `docs/specs/`. The filename is for browsing. The header is
authoritative.

### 7.6 Splitting Specs

Split a spec when one document contains independently shippable work with
different priorities or owners.

Rules:

1. The parent spec keeps its `Spec-ID` and lists children under `Split-into`.
2. Each child gets a new `Spec-ID` and its own `Spec-Version`.
3. Child specs list the parent under `Supersedes` or `Depends-on`.
4. Implementation commits cite the child spec.

### 7.7 Changelog

Each accepted or implemented spec ends with:

```text
## Changelog

- 1.0.0+backlog.0001: Initial accepted spec.
- 1.1.0+backlog.0001: Added keyboard navigation acceptance criteria.
```

## 8. Required Audit Evidence Packet

Every non-trivial code change needs an evidence packet. It can live in the PR
description or in `docs/audit/YYYY-MM-DD-<slug>.md`.

```markdown
# Change Evidence: <short title>

Date:
Agent:
Commit(s):
Request/issue:

## Scope

- User-visible change:
- Package(s) affected:
- Files intentionally changed:
- Files intentionally not touched:

## Impact Analysis

- Symbols checked:
- Risk level: LOW | MEDIUM | HIGH
- Callers found:
- Breaking change: yes/no
- Why selected tests are sufficient:

## TDD Evidence

- Red test command:
- Red failure summary:
- Green focused test command:
- Green focused result:

## Verification

- Format:
- Lint:
- Typecheck:
- Unit tests:
- Coverage:
- Boundary check:
- Commands not run and why:

## CI

- Workflow/run link:
- Result:
- If blocked, reason and local substitute:

## Codex Review

- Round 1: <N> BLOCKER, <N> MAJOR, <N> MINOR, <N> NIT
- Round 1 resolution:
- Round 2: <N> BLOCKER, <N> MAJOR, <N> MINOR, <N> NIT
- Round 2 resolution:

## Changeset

- Added: yes/no
- Package(s): core / react
- Bump type: patch / minor / major

## Follow-Ups

- Remaining risks:
- Deferred work:
```

Minimum artifacts for code changes:

- Impact analysis summary (symbol, risk, callers).
- Red/green focused test evidence.
- Final verification command list with results.
- CI result or documented CI-blocked exception.
- Codex review round 1 + round 2 summaries.
- Changeset if public API changed.

Artifacts that must not be committed or pasted:

- npm tokens, API keys, or environment dumps.
- `.env` files.
- Private portal credentials.

## 9. Definition of Done

A mindmaplib change is done when:

- The intended behavior is covered by tests or a documented docs-only
  exception.
- Impact check drove the test scope.
- Local verification passed (format, lint, typecheck, tests, boundaries).
- CI passed or the CI-blocked exception is explicit.
- Codex review passed (2 rounds, all BLOCKER and MAJOR resolved).
- Docs or specs updated if behavior or API changed.
- Changeset added if public API changed.
- Staged files match the task.
- The evidence packet is complete.

If any item is missing, the final response must say so plainly.
