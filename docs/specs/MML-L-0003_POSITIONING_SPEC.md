# Competitive Positioning & Comparison Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-L-0003.
Spec-Version: 0.1.0+low.0003.
Backlog lane: low.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Document the competitive landscape and mindmaplib's positioning relative to
existing tools. Inform README, docs site, and marketing.

## Positioning Statement

mindmaplib is an embeddable rich-text mindmap and outline editor for SaaS
products. Not a generic graph toolkit, not a standalone app.

## Competitive Landscape

### vs React Flow / XYFlow

React Flow is a general-purpose node-based UI toolkit. It handles canvas,
pan/zoom, edges, and custom nodes. It does NOT provide: document model,
outline view, rich text editing, keyboard tree navigation, layout algorithms,
or storage interface.

mindmaplib uses similar rendering concepts (SVG + HTML layers) but ships a
complete mindmap editor, not a canvas toolkit. Less generic, faster to ship
a production mindmap experience.

### vs MindElixir

MindElixir is a feature-rich mindmap library. It provides canvas, layout,
and export. Limitations: weaker TypeScript support, no framework-agnostic
core/adapter split, no rich text in nodes, limited outline integration.

mindmaplib offers: strict TypeScript core, framework adapters, TipTap rich
text, synchronized canvas + outline, storage interface, immutable document
model.

### vs Standalone Tools (XMind, MindMeister, Miro)

These are standalone applications, not libraries. They cannot be embedded
into your product. mindmaplib is embedded: your data, your storage, your UI
context.

## Use Cases

- AI-generated mindmap editor in a SaaS portal.
- Knowledge base with tree-structured content.
- Project WBS (Work Breakdown Structure) builder.
- Decision tree editor.
- CRM account/relationship mapping.
- Learning path builder for EdTech.

## Non-Goals

- Competing with Miro/Figma as a whiteboard.
- Competing with React Flow as a graph toolkit.
- Being a standalone application.

## Implementation Outline

This spec informs README, docs site landing page, and npm package
descriptions. Not a code-bearing spec.

## Changelog

- 0.1.0+low.0003: Initial placeholder.
