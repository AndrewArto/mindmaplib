# Focus Modes & TipTap Interaction Specification

Status: draft.
Date: 2026-07-05.
Owner: Andrew Arto.
Spec-ID: MML-B-0002.
Spec-Version: 0.2.0+backlog.0002.
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
- On map open, focus the last known selected node; if none is known, focus
  the root node and the canvas keyboard target.
- Tab/arrows do not conflict with TipTap editing; Enter is reserved as the
  explicit commit-and-exit key while editing.
- Escape behavior: first press exits editing, second press deselects.
- Canvas keyboard shortcuts scoped only when canvas has focus.
- ArrowUp/ArrowDown walk the visible tree order, so keyboard-only users can
  reach every visible node without using the mouse.
- Delete/Backspace removes the selected node with its descendants and moves
  focus to the parent.
- Outline keyboard shortcuts scoped only when outline has focus.

## Non-Goals

- Full custom TipTap keymap system beyond the commit-on-Enter behavior.
- Mobile/touch focus management.

## Implementation Outline

(to be defined before React adapter implementation)

- Define EditorState.focusMode: 'none' | 'canvas' | 'outline' | 'editing'.
- Keyboard handler checks focusMode before dispatching.
- Mindmap mount resolves initial focus: existing selected node if valid,
  otherwise root; canvas receives DOM focus for immediate keyboard use.
- TipTap editor receives text input when focusMode === 'editing'. Enter
  commits content, exits editing, selects the edited node, and returns focus
  to canvas hotkeys.
- Transition rules: none → canvas/outline → editing → canvas/outline → none.

## Test Plan

- Tab in canvas creates child; Tab in TipTap indents text.
- Enter in canvas creates sibling, selects it, and enters edit mode.
- Enter while editing commits text, clears editing mode, keeps the edited node
  selected, and returns keyboard focus to canvas hotkeys.
- Escape sequence: editing → canvas → none.
- Arrow keys navigate tree in canvas mode, move cursor in editing mode.
- Delete/Backspace deletes a child subtree and selects the parent.
- Opening with no previous selected node selects root and focuses the canvas;
  opening with an existing selected node preserves that node.

## Changelog

- 0.2.0+backlog.0002: Added initial focus, visible-tree arrow navigation,
  and parent focus after deletion.
- 0.1.1+backlog.0002: Clarified Enter as edit commit/exit and new-node
  selection behavior.
- 0.1.0+backlog.0002: Initial placeholder.
