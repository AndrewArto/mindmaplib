# Developer Demo Launch Specification

Status: accepted.
Date: 2026-07-13.
Owner: Andrey.
Spec-ID: MML-U-0001.
Spec-Version: 1.0.0+urgent.0001.
Backlog lane: urgent.
Depends-on: MML-B-0006, MML-B-0007.
Supersedes: none.
Split-into: none.
Process: none.

## Trigger

The public demo is about to be shown in developer communities, but its current
first screen looks like a standalone mind-map application rather than a demo of
an embeddable React library. The deployed build also emits repeated TipTap
warnings because the default extension list registers Link twice.

This is launch-blocking because visitors cannot quickly identify the library,
find its packages, copy a working installation command, or inspect a minimal
integration example, and the browser console is not clean.

## Goals

- Identify mindmaplib as an embeddable React library within five seconds.
- Keep the interactive editor as the primary visual and functional element.
- Expose GitHub, npm packages, the exact install command, and a working React
  example without turning the demo into a landing page.
- Make the default map explain the library architecture and integration model.
- State the anonymous Cloudflare D1 persistence behavior accurately.
- Remove the duplicate TipTap Link registration at its source while preserving
  link rendering and editing.
- Preserve existing editor behavior, accessibility semantics, themes, and
  responsive operation.

## Non-Goals

- Redesigning the editor or toolbar.
- Adding analytics, authentication, a new backend, a UI framework, or another
  external service.
- Changing the public TypeScript API of `@mindmaplib/core` or
  `@mindmaplib/react`.
- Publishing packages or deploying the demo as part of implementation.

## Requirements

### Developer introduction

The demo renders one compact section above the workspace with:

- One visible `h1`: `Embeddable rich-text mind maps for React`.
- Supporting copy: `Canvas and keyboard-first outline edit the same structured
document. You own persistence. MIT licensed.`
- Positioning: `One tree. Two editing surfaces.`
- Safe external links to the GitHub repository and both npm packages.
- The exact visible command:
  `npm install @mindmaplib/core @mindmaplib/react`.
- A Clipboard API action with persistent, accessible success and recoverable
  error announcements. Repeated copies must trigger a fresh announcement.
- An accessible disclosure containing a minimal Vite-compatible React example.
  The example imports `createDoc`, `MindmapEditor`, `Mindmap`, and
  `@mindmaplib/react/styles.css`, creates a stable editor with `useState` or
  `useMemo`, and gives the host container an explicit height.
- A visible disclosure that demo maps are stored anonymously in Cloudflare D1
  and require no account.

The section must use the existing design tokens, retain adequate text contrast
in light and dark themes, avoid document-level horizontal overflow, and leave a
usable part of the editor visible at supported mobile widths.

### Default sample

The first sample is a rich-text map titled `mindmaplib architecture`. It covers:

- Core engine.
- Immutable document.
- Transactions and undo/redo.
- Serialization.
- Storage interface.
- React adapter.
- Canvas.
- Synchronized outline.
- Rich-text nodes.
- Keyboard navigation.
- Layout modes.
- Host-owned persistence.

Existing business samples remain in the sample collection after the developer
sample.

### TipTap defaults

The current TipTap v3 StarterKit includes Link. The default adapter configuration
must therefore disable StarterKit's bundled Link and register exactly one
explicit Link extension configured with `openOnClick: false`.

The same default extension array is used for static `generateHTML()` rendering
and active TipTap editing. Custom host-provided extension arrays remain
unchanged.

## Acceptance Criteria

1. The required developer copy, links, install command, D1 disclosure, and React
   example are keyboard accessible and covered by observable-behavior tests.
2. Clipboard success, failure, and repeated-success announcements are covered.
3. The developer section works in light and dark themes and at desktop and
   mobile widths without horizontal page overflow.
4. The editor remains visible and interactive; edit, outline, layout, theme,
   pan, selection, undo, and redo regressions remain green.
5. The default sample contains every required architecture concept and retains
   rich-text marks.
6. Default adapter startup produces no duplicate-extension warning.
7. Link content renders safely, survives the editing lifecycle, and uses one
   Link extension with `openOnClick: false`.
8. Playwright fails on unexpected browser warnings, console errors, or page
   errors during initial load and representative interaction.
9. `pnpm run ci`, `pnpm build`, `pnpm test:coverage`, and
   `pnpm test:browser` pass.
10. A patch changeset is present for the published React adapter fix, and
    `pnpm changeset status` predicts no `@mindmaplib/core` bump.

## Fail-Safe and Rollback

- Clipboard failure leaves the install command visible for manual selection and
  reports a non-blocking accessible error.
- D1 failure keeps the local sample editable under the existing fallback path.
- If the developer section causes layout regression, it can be removed without
  changing editor, persistence, or package APIs.
- If the TipTap configuration regresses, revert the shared default extension
  module and its two consumers together; do not suppress `console.warn`.
- Deployment rollback uses the previous Cloudflare Pages build. No schema or
  backend migration is involved.

## Test Plan

- Unit tests for exact copy, links, Clipboard success/failure/repetition,
  disclosure state, React example imports and height, D1 disclosure, and sample
  content.
- React adapter tests for one default Link extension, `openOnClick: false`, no
  duplicate warning, safe link rendering, and link preservation after editing.
- Playwright coverage for desktop/mobile layout, light/dark themes, copy,
  example disclosure, edit, outline, layout switching, viewport geometry, and
  warning/error capture.
- Full format, lint, typecheck, unit, coverage, boundary, build, and browser
  gates before delivery.

## Operational Constraints

- No dependency, package-lock, API, D1 schema, analytics, authentication, or
  service-provider change.
- No push, publication, or deployment unless separately authorized.
- The public demo remains unchanged until the reviewed branch is deliberately
  delivered.

## Changelog

- 1.0.0+urgent.0001: Initial accepted launch-blocking specification.
