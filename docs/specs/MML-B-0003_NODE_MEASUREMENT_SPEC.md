# Node Measurement & Layout Pipeline Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0003.
Spec-Version: 0.1.0+backlog.0003.
Backlog lane: backlog.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the flow by which the React adapter measures real DOM node sizes and
passes them to the core layout engine. Core must never touch the DOM.

## Goals

- React adapter measures rendered node widths/heights via ResizeObserver.
- Core computeLayout receives NodeMeasures and produces correct spacing.
- Layout recomputes when node content changes (text edited, list added).
- Debounced measurement to avoid layout thrash on rapid edits.

## Non-Goals

- Core measuring DOM directly (forbidden by boundary rules).
- Synchronous layout (layout is always async after measurement).

## Implementation Outline

(to be defined before React adapter implementation)

- useNodeMeasures hook: observes node DOM, reports to editor.
- Editor batches measures, triggers computeLayout on debounce.
- Default node size used before first measurement (120x40).

## Test Plan

- Node with long text gets wider after measurement.
- Node with nested list gets taller after measurement.
- Layout recomputes within debounce window after content change.
- Core receives measures as plain data, no DOM access.

## Changelog

- 0.1.0+backlog.0003: Initial placeholder.
