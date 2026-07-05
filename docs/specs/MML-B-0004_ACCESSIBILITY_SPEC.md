# Accessibility Contract Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0004.
Spec-Version: 0.1.0+backlog.0004.
Backlog lane: backlog.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define ARIA roles, keyboard focus model, and screen-reader behavior for
canvas and outline views. Make the library usable without a mouse.

## Goals

- Outline view: ARIA tree role with proper treeitem semantics.
- Canvas view: application role with keyboard focus management.
- Screen-reader accessible node titles/excerpts.
- Keyboard focus visible at all times.
- TipTap editing mode: standard editor a11y from TipTap.

## Non-Goals

- High-contrast or colorblind themes (host responsibility).
- Screen reader testing across all browsers (test NVDA + VoiceOver).

## Implementation Outline

(to be defined after PoC)

- Outline: role="tree", role="treeitem", aria-expanded, aria-level.
- Canvas: role="application", aria-label per node.
- Focus management: roving tabindex for outline, focus trap for editing.

## Test Plan

- Axe accessibility audit on canvas and outline.
- Keyboard-only navigation test (Tab, arrows, Enter, Escape).
- Screen reader announcement of node selection and editing state.

## Changelog

- 0.1.0+backlog.0004: Initial placeholder.
