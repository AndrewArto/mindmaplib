# Performance Budgets Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-L-0002.
Spec-Version: 0.1.0+low.0002.
Backlog lane: low.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define baseline performance targets for the library. Make "production-grade"
measurable, not aspirational.

## Goals

- 500 nodes: smooth pan/zoom (60fps target).
- 1000 nodes: outline remains responsive (50ms render target).
- Only one TipTap instance active at any time (enforced by design).
- Bundle size budget for @mindmaplib/core and @mindmaplib/react.
- Layout latency target: <50ms for 500 nodes, <200ms for 1000 nodes.

## Non-Goals

- Virtualization in PoC (mark as planned, implement when needed).
- WebGL rendering (not in scope).

## Reason for Low Priority

Targets need empirical validation. Will be formalized after PoC is
functional and we can benchmark real behavior.

## Implementation Outline

(to be defined after PoC benchmarks)

- Benchmark suite: vitest with timing assertions.
- Bundle size tracking: size-limit on published packages.
- Offscreen culling: skip render of nodes outside viewport (Phase 2+).

## Test Plan

- Benchmark: 500-node doc, measure pan/zoom/render latency.
- Benchmark: 1000-node doc, measure outline render time.
- Bundle: assert core <30KB, react adapter <50KB (gzipped, targets TBD).

## Changelog

- 0.1.0+low.0002: Initial placeholder.
