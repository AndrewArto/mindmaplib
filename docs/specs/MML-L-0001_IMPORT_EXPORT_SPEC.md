# Import/Export Roadmap Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-L-0001.
Spec-Version: 0.1.0+low.0001.
Backlog lane: low.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the import/export formats roadmap for mindmaplib. JSON is the primary
format; additional formats improve interoperability and adoption.

## Goals (Roadmap)

- JSON (stable public schema) — already in MML-B-0001.
- Markdown outline import/export — convert tree to/from markdown headings/list.
- OPML import/export — standard outline interchange format.
- SVG export — render canvas as static SVG image.
- PNG export — rasterized canvas screenshot.

## Non-Goals

- Import from proprietary formats (XMind, MindManager, FreeMind).
- Round-trip fidelity for non-JSON formats (lossy is acceptable).

## Reason for Low Priority

Import/export is not needed for PoC or first portal integration. It improves
market adoption but does not unblock the core use case. Will be prioritized
after the core library is stable and the first integration is live.

## Implementation Outline

(to be defined when prioritized)

- Markdown: tree depth → heading level or list indentation.
- OPML: standard XML format, maps to parentId/childOrder.
- SVG: serialize canvas viewport as SVG with node content as foreignObject.
- PNG: render SVG to canvas, export as PNG blob.

## Changelog

- 0.1.0+low.0001: Initial placeholder.
