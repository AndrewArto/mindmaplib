# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others)
when working with code in this repository.

> Sync rule: AGENTS.md and CLAUDE.md must stay in sync — apart from the header
> they are identical. When editing one, mirror the change to the other. Agents
> rely on this file and on the specs under `docs/specs/`.

## What This Is

mindmaplib is an embeddable mindmap engine for web applications. Not a
standalone app — a drop-in library that lets developers add interactive mind
maps inside their portals, dashboards, and products.

- MIT license.
- Framework-agnostic TypeScript core, thin adapters per framework.
- React adapter is the first (and currently only) adapter.
- First integration target: TripleA Digital portal (tripleadigital.io/portal).

## Repository Layout — pnpm Monorepo

- **`packages/core/`** — `@mindmaplib/core`. Framework-agnostic engine: document
  model, tree operations, layout math, store interface, serialization,
  undo/redo. Zero React/DOM dependencies. Publishes to npm.
- **`packages/react/`** — `@mindmaplib/react`. React adapter: canvas view,
  outline view, keyboard navigation, node rendering. Depends on `core`.
  Publishes to npm.
- **`demo/`** — Vite playground. Imports both packages exactly as an external
  consumer would. NOT published to npm. Serves as a live test of embeddability.
- **`docs/`** — specifications (`specs/`), runbooks (`runbooks/`), planning
  (`planning/`), audit evidence (`audit/`).

### Boundary Rules (CI-enforced)

- `packages/core/` MUST NOT import from `packages/react/` or `demo/`.
  Violation fails CI (`pnpm check-boundaries` via dependency-cruiser).
- `packages/react/` MAY import from `packages/core/`.
- `demo/` MAY import from both packages.
- If `demo/` needs something from `core` that is not in the public exports,
  the public API has a gap — fix the API, do not reach into internals.

## Commands

All run from repository root:

```bash
pnpm install              # install all workspace deps
pnpm format --check       # prettier check (all packages)
pnpm format               # prettier write (all packages)
pnpm lint                 # eslint (all packages)
pnpm typecheck            # tsc --noEmit (all packages)
pnpm test                 # vitest run (all packages)
pnpm check-boundaries     # dependency-cruiser: core has no react/demo imports
pnpm ci                   # full local gate: format + lint + typecheck + test + boundaries
```

Per-package:

```bash
pnpm --filter @mindmaplib/core test
pnpm --filter @mindmaplib/react test
pnpm --filter @mindmaplib/core test -- --reporter=verbose
```

Demo dev server:

```bash
pnpm --filter demo dev    # Vite dev server at localhost:5173
pnpm --filter demo build  # production build
```

## Architecture (summary)

- **Document model**: immutable `MindmapDoc` — flat node map, tree emerges from
  `parentId` links. One root, no orphans.
- **Mutations**: transactional. Every change flows through `Transaction.apply`,
  producing a new `MindmapDoc`. Undo/redo is an in-memory ring buffer (100
  entries). This is the collaboration-readiness foundation.
- **Layout**: `d3-hierarchy` computes positions for auto-layout modes
  (tree-horizontal, tree-vertical, radial). Free-float mode keeps explicit
  coordinates.
- **Rendering**: two-layer viewport — SVG for edges/shapes/grid, absolutely
  positioned HTML divs for node content. One transform to rule them all.
- **Rich text**: TipTap v2 core (MIT). At most ONE active editor instance at a
  time (the node being edited). All other nodes render static HTML from
  `generateHTML()`.
- **Storage**: library exports `MindmapStore` interface. Host implements it
  against any backend. In-memory default ships with core.

Detailed architecture, data model, and API surface:
`docs/specs/MML-B-0001_CORE_ENGINE_SPEC.md` (when written).

## Hard CI Policies

- No `any` in production TypeScript sources (tests exempt).
- `tsconfig` strict mode, always.
- ESLint with `@typescript-eslint/recommended` + React rules. Warnings are
  errors.
- Prettier formatting must pass.
- No trailing whitespace in any `*.md` (CI fails).
- Boundary check (`check-boundaries`) must pass — core is isolated.
- Coverage threshold: 80% lines minimum (enforced in PR workflow).

## Process

Start from `docs/specs/` for the feature you are working on. Full development
process, TDD-evidence requirements, CI expectations, and codex review:
`docs/runbooks/DEVELOPMENT_PROCESS.md`.

Spec backlog identity and versioning convention:
`docs/runbooks/DEVELOPMENT_PROCESS.md` § Spec Backlog Versioning.

## Publishing

This is a public npm package (MIT). Publishing is governed by changesets:

1. Every PR that changes public API adds a changeset
   (`pnpm changeset`).
2. On merge to `main`, changesets bot opens a "Version Packages" PR.
3. Merging that PR bumps versions, generates changelogs, and triggers
   npm publish via GitHub Actions.

Never publish manually from a workstation. Never publish from a branch that is
not `main`. Never publish without a changeset.
