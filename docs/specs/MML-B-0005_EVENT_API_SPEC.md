# Public Event & Callback API Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0005.
Spec-Version: 0.1.0+backlog.0005.
Backlog lane: backlog.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the public event/callback API that the host application can subscribe
to for document changes, selection changes, save errors, and custom node
rendering hooks.

## Goals

- onChange(transaction, doc): fired after every transaction applied.
- onSelectionChange(nodeId | null): fired when selection changes.
- onSaveError(error): fired when store.save fails.
- onVersionConflict(): fired when expectedVersion mismatch detected.
- onNodeDoubleClick callback for custom actions.
- Custom node renderer boundaries: host can override NodeView render.

## Non-Goals

- Imperative event emitter API (use subscribe pattern from MindmapEditor).
- Event batching (host can debounce if needed).

## Implementation Outline

(to be defined after PoC, informed by real integration needs)

- Extend MindmapEditor.subscribe to accept event filters.
- Add callback options to Mindmap React component props.
- Define CustomNodeRenderer interface for node rendering override.

## Test Plan

- onChange fires with correct transaction and resulting doc.
- onSelectionChange fires on click and keyboard navigation.
- onSaveError fires on store rejection.
- Custom renderer receives correct props.

## Changelog

- 0.1.0+backlog.0005: Initial placeholder.
