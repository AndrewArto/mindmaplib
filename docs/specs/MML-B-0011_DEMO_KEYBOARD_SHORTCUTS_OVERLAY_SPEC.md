# Demo Keyboard Shortcuts Overlay Specification

Status: accepted.
Date: 2026-07-07.
Owner: Andrey.
Spec-ID: MML-B-0011.
Spec-Version: 0.1.0+backlog.0011.
Backlog lane: backlog.
Depends-on: MML-B-0006, MML-B-0007.
Supersedes: none.
Split-into: none.
Process: none.

## Purpose

Define the demo-owned keyboard shortcuts cheatsheet / overlay for the
`demo/` application.

The overlay is not library functionality. `@mindmaplib/react` owns keyboard
handling and exposes the interactive mindmap surface. The demo owns a small UI
layer that helps visitors discover the supported shortcuts while evaluating the
library at `mapdemo.tripleadigital.io`.

## Goals

- Provide an always-discoverable way to view keyboard shortcuts from the demo
  toolbar.
- Show the shortcuts supported by the current demo integration without changing
  adapter behavior.
- Keep the UI demo-specific: implemented in `demo/src/App.tsx` and styled in
  `demo/src/style.css`; no changes to `@mindmaplib/core` or
  `@mindmaplib/react` are required unless an existing shortcut is broken.
- Present Mac and Windows/Linux modifier labels correctly: `Cmd` on macOS,
  `Ctrl` elsewhere.
- Group shortcuts by task so first-time visitors can learn the interaction
  model quickly.
- Be accessible: modal dialog semantics, focus management, keyboard dismissal,
  and readable labels.

## Non-Goals

- Defining or changing the library keymap. The canonical keyboard behavior
  remains in `@mindmaplib/react` and the related library specs.
- Exporting a reusable shortcuts component from `@mindmaplib/react`.
- Making the shortcut list configurable by library consumers.
- Adding new keyboard behavior merely because it appears in the overlay. The
  overlay must document existing behavior; if a new shortcut is desired, amend
  the adapter/core spec first.
- Mobile/touch gesture help.

## Ownership Boundary

| Concern                         | Owner                                  | Notes                                                  |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Actual keyboard handling        | `@mindmaplib/react`                    | `useKeyboard` and TipTap editing mode decide behavior. |
| Keymap source of truth          | Library specs / adapter implementation | Demo must not invent behavior.                         |
| Cheatsheet trigger button       | `demo/`                                | App toolbar UI.                                        |
| Cheatsheet modal content        | `demo/`                                | Static list reflecting supported shortcuts.            |
| Styling and responsive behavior | `demo/`                                | Uses existing demo theme tokens.                       |
| Accessibility of overlay        | `demo/`                                | Dialog role, focus trap, Escape close.                 |

## User Experience

### Toolbar trigger

Add a help / keyboard button to the existing map toolbar, after the outline
visibility toggle.

- Icon: keyboard glyph or `?` help glyph.
- Accessible label: `Keyboard shortcuts`.
- Tooltip/title: `Keyboard shortcuts`.
- Opens the overlay on click.
- The trigger remains visible in both light and dark demo themes.

### Keyboard trigger

Pressing `?` opens the overlay when the mindmap is not in text-editing mode.

Rules:

- Do not intercept `?` while a node is being edited in TipTap.
- Do not intercept `?` inside text inputs, textareas, contenteditable regions,
  or elements with `role="textbox"`.
- `Shift+/` and `?` are equivalent on US keyboard layouts; implementation may
  check `event.key === '?'`.
- `?` opens only the help overlay. It must not be documented as a library
  shortcut or added to `@mindmaplib/react`.

### Overlay layout

The overlay is a centered modal panel over a dimmed backdrop.

Content:

1. Header: `Keyboard shortcuts`.
2. Short explanatory sentence: `These shortcuts apply when the mindmap canvas is focused. Rich text shortcuts apply while editing a node.`
3. Grouped shortcut list.
4. Footer hint: `Press Esc to close`.
5. Close button in the top-right corner.

The modal should fit in a laptop viewport without requiring horizontal scroll.
If vertical space is limited, the shortcut list scrolls inside the panel.

### Dismissal

The overlay closes when the user:

- clicks the close button;
- presses `Escape`;
- clicks the backdrop outside the panel.

When closed, focus returns to the toolbar trigger if the overlay was opened via
button. If opened via `?`, focus returns to the previously focused element when
possible.

## Shortcut Groups

The overlay documents the shortcuts available in the demo through the adapter.
The labels below are user-facing labels; implementation can store them as data
objects and render them.

### Create and edit

| Shortcut               | Action                            |
| ---------------------- | --------------------------------- |
| `Tab`                  | Add child to selected node        |
| `Enter`                | Add sibling after selected node   |
| `Space` / `F2`         | Edit selected node                |
| `Shift+Tab`            | Promote selected node             |
| `Escape`               | Stop editing / close current mode |
| `Delete` / `Backspace` | Delete selected node, except root |
| Double-click node      | Edit node                         |

### Navigate

| Shortcut           | Action                          |
| ------------------ | ------------------------------- |
| Arrow keys         | Move selection through the tree |
| Click node         | Select node                     |
| Click outline item | Select node from outline        |

### Rich text while editing

Use platform-aware modifier labels.

| Shortcut     | Action                      |
| ------------ | --------------------------- |
| `Cmd/Ctrl+B` | Bold                        |
| `Cmd/Ctrl+I` | Italic                      |
| `Escape`     | Save edits and exit editing |

Do not show speculative rich-text shortcuts. Only list shortcuts that the
current TipTap configuration is known to support.

### View and layout

| Shortcut                      | Action                                          |
| ----------------------------- | ----------------------------------------------- |
| Mouse drag on canvas          | Pan canvas                                      |
| Mouse wheel / trackpad scroll | Zoom canvas                                     |
| Toolbar layout buttons        | Switch Tree Horizontal / Tree Vertical / Radial |
| `Cmd/Ctrl++` / `Cmd/Ctrl+-`   | Zoom in / zoom out                              |
| `Cmd/Ctrl+0`                  | Fit map to screen                               |
| Fit button                    | Fit map to screen                               |
| Outline button                | Show or hide outline                            |

### History

| Shortcut           | Action |
| ------------------ | ------ |
| `Cmd/Ctrl+Z`       | Undo   |
| `Cmd/Ctrl+Shift+Z` | Redo   |

## Implementation Notes

### Files

- Create `demo/src/KeyboardShortcutsOverlay.tsx`:
  - shortcut data;
  - platform modifier detection;
  - editable-target guard;
  - overlay component;
  - small hook/helper used by `App.tsx` for global `?` / `Escape` handling.
- Modify `demo/src/App.tsx`:
  - add `showShortcuts` state;
  - remember the previously focused element;
  - add toolbar trigger button;
  - render `KeyboardShortcutsOverlay`;
  - wire the document-level `keydown` handler.
- Modify `demo/src/icons.tsx` if a reusable keyboard/help icon is needed.
- Modify `demo/src/style.css` for modal, backdrop, shortcut grid, and theme
  variants.
- Add demo component tests under `demo/tests/` and include them in Vitest.
  They cover the overlay and helper behavior without depending on D1 or the
  full `<Mindmap>` canvas.

### State shape

The demo may keep the shortcut data in `App.tsx` as plain objects:

```ts
type ShortcutItem = {
  keys: string[]
  label: string
}

type ShortcutGroup = {
  title: string
  items: ShortcutItem[]
}
```

Use a small formatter for modifier keys:

```ts
const mod = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'
```

For server/test safety, guard access to `navigator` behind `typeof navigator !== 'undefined'`.

### Focus and accessibility

The overlay root must use:

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="keyboard-shortcuts-title">
```

Requirements:

- Close button has visible label or `aria-label="Close keyboard shortcuts"`.
- Initial focus moves to the close button or dialog panel when opened.
- `Escape` closes the dialog.
- Background content is not reachable by Tab while the modal is open. A minimal
  focus trap is acceptable because this modal has few focusable elements.
- The shortcut keys should be rendered with `<kbd>` elements.
- The shortcut list remains readable under both `theme-triplea` and
  `theme-triplea-dark`.

### Interaction with map keyboard handling

The overlay is app shell UI. It must not attach handlers to the `<Mindmap>`
component internals.

Recommended approach:

1. Add a document-level listener in `App.tsx`.
2. Ignore events from editable targets.
3. If overlay is open and key is `Escape`, close it and stop propagation.
4. If overlay is closed and key is `?`, open it only when the target is not
   editable.

Editable target check:

```ts
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ),
  )
}
```

## Acceptance Criteria

1. A keyboard/help button appears in the demo map toolbar.
2. Clicking the button opens a keyboard shortcuts overlay.
3. Pressing `?` opens the overlay when focus is not inside an editable field or
   TipTap editor.
4. The overlay lists create/edit, navigation, rich-text, view/layout, and
   history shortcuts.
5. The overlay uses platform-aware modifier labels (`Cmd` on macOS, `Ctrl` on
   Windows/Linux).
6. `Escape`, backdrop click, and close button close the overlay.
7. Focus returns to the previous element after closing.
8. The overlay has `role="dialog"`, `aria-modal="true"`, a labelled title, and
   keyboard-accessible controls.
9. Opening the overlay does not change the mindmap document, selected node,
   layout mode, session id, or save state.
10. The overlay is styled consistently in both existing demo themes.
11. The implementation does not add dependencies.
12. The implementation does not modify `packages/core` or `packages/react`
    unless fixing a verified mismatch between documented and actual shortcuts.

## Test Plan

- Unit/component tests where available:
  - clicking the toolbar trigger renders the dialog;
  - clicking close removes the dialog;
  - pressing `Escape` closes the dialog;
  - pressing `?` opens the dialog from a non-editable target;
  - pressing `?` inside an editable target does not open the dialog;
  - modifier label renders as `Cmd` when platform detection says macOS and
    `Ctrl` otherwise.
- Manual browser verification:
  - open the demo, click the toolbar button, verify overlay content;
  - close via Escape, backdrop, and close button;
  - double-click a node to edit, type `?`, verify it inserts text / is handled
    by editor and does not open the overlay;
  - verify Tab, Enter, Delete, undo/redo, pan/zoom still behave as before;
  - verify light and dark themes.
- CI gate:
  - `pnpm format --check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm --filter demo build`

## Changelog

- 0.1.0+backlog.0011: Initial accepted spec. Defines demo-owned keyboard
  shortcuts overlay / cheatsheet and explicitly keeps actual key handling in
  the library.
