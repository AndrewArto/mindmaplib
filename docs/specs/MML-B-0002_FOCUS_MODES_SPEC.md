# Focus Modes & TipTap Interaction Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0002.
Spec-Version: 0.1.0+backlog.0002.
Backlog lane: backlog.
Depends-on: MML-B-0001.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the interaction model between mindmap keyboard navigation and TipTap
rich-text editing. Prevent key conflicts (Tab, Enter, arrows) between the
two modes. Define focus state transitions.

## Goals

- Clear selection mode vs text editing mode distinction.
- Tab/Enter/arrows do not conflict with TipTap editing.
- Escape behavior: first press exits editing, second press deselects.
- Canvas keyboard shortcuts scoped only when canvas has focus.
- Outline keyboard shortcuts scoped only when outline has focus.

## Non-Goals

- Custom TipTap keymaps (use TipTap defaults).
- Mobile/touch focus management.

## Implementation Outline

(to be defined before React adapter implementation)

- Define EditorState.focusMode: 'none' | 'canvas' | 'outline' | 'editing'.
- Keyboard handler checks focusMode before dispatching.
- TipTap editor receives all keyboard input when focusMode === 'editing'.
- Transition rules: none → canvas/outline → editing → canvas/outline → none.

## Test Plan

- Tab in canvas creates child; Tab in TipTap indents text.
- Enter in canvas creates sibling; Enter in TipTap inserts paragraph.
- Escape sequence: editing → canvas → none.
- Arrow keys navigate tree in canvas mode, move cursor in editing mode.

## Changelog

- 0.1.0+backlog.0002: Initial placeholder.
