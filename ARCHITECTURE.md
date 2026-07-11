# Architecture boundaries

mindmaplib has three deliberately separate layers:

```text
demo (private showcase and integration test host)
  ├──> @mindmaplib/react (published React adapter)
  └──> @mindmaplib/core  (published framework-agnostic engine)

@mindmaplib/react ───> @mindmaplib/core
```

Dependencies may point only downward. Library packages must never import demo code.

## Core

`packages/core` is the reusable engine. It owns the document model, transactions, layout, serialization, validation, and stores.

Core requirements:

- no DOM or browser APIs;
- no React, TipTap, or demo dependencies;
- no imports from `packages/react` or `demo`;
- only package exports form its public API.

## React adapter

`packages/react` integrates Core with React, DOM rendering, keyboard interaction, and rich-text editing.

React requirements:

- consume Core only through `@mindmaplib/core`;
- never import Core source files directly;
- never depend on demo code.

## Demo

`demo` is a private showcase, deployment target, and integration/E2E test host. It is not library implementation.

Demo requirements:

- remain a private workspace package;
- consume Core and React through declared package exports only;
- never be imported by either library package;
- keep application concerns such as Cloudflare/D1 persistence, sample content, toolbar composition, and deployment code outside Core.

## Enforcement

`pnpm check-boundaries` runs two independent guards:

1. `scripts/check-package-boundaries.mjs` validates package manifests, exports, privacy, and Core's DOM-free TypeScript contract.
2. dependency-cruiser checks imports across Core, React, and all production demo directories.

ESLint also rejects deep package imports and reverse dependencies at the import declaration itself. All three guards run in `pnpm ci` and GitHub Actions.
