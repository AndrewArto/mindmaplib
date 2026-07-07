# MML-D-0002 — Keyboard Shortcuts Panel (Demo)

Status: draft
Created: 2026-07-07
Owner: Andrey
Spec-ID: MML-D-0002

## Problem

The demo has ~12 keyboard shortcuts (node CRUD, navigation, undo/redo, zoom,
rich text formatting). None are discoverable. The only hint is a single line
at the bottom of the sidebar: "Double-click a node to edit. Rich text: bold,
italic, code, links, lists" — which doesn't mention Tab, Enter, arrows,
Cmd+Z, or any of the actual shortcuts.

New visitors have no way to learn the keymap without reading the source code.

## Goal

A collapsible shortcuts panel at the bottom of the sidebar, replacing the
current one-line hint. **Visible by default**, collapsible by the user,
state persisted to localStorage.

This is a **demo-owned** component. The library (@mindmaplib/react) does not
ship a shortcuts UI — consumers build their own. The panel lives entirely in
`demo/src/`.

## Non-Goals

- Library-level shortcuts component (not part of @mindmaplib/react or core).
- Dynamic shortcut detection (the list is hardcoded — it matches the keymap
  in useKeyboard.ts at time of writing).
- Customizable key bindings.
- Context-sensitive hints (showing different shortcuts based on canvas vs
  outline focus). Nice future enhancement, not now.

## Placement

```
┌─────────────────────────────────────────────────┐
│ topbar                                           │
├──────────┬──────────────────────────┬───────────┤
│ sidebar  │ canvas                    │ outline   │
│          │                           │           │
│ sessions │                           │           │
│          │                           │           │
│ ┌──────┐ │                           │           │
│ │ short│ │                           │           │
│ │ cuts │ │                           │           │
│ │ panel│ │                           │           │
│ └──────┘ │                           │           │
└──────────┴──────────────────────────┴───────────┘
```

The panel replaces the current `.sidebar-footer > .rich-hint` element at the
bottom of the sidebar. It sits below the session list.

## Component

New file: `demo/src/ShortcutsPanel.tsx`

```tsx
interface ShortcutsPanelProps {
  // none — self-contained, reads/writes localStorage internally
}
```

### Behavior

1. **Default state: expanded.** First-time visitors see the full shortcut list.
2. **Collapse toggle:** header row with title "Shortcuts" and a chevron button
   (chevron-down expanded / chevron-right collapsed).
3. **Persistence:** expand/collapse state saved to `localStorage` key
   `mml-demo-shortcuts-expanded`. On load, read the saved state; if no saved
   state, default to expanded.
4. **When collapsed:** show only the header row (title + chevron). The body
   is unmounted (not just hidden) to keep DOM clean.

### Shortcut List

Grouped into 3 sections, each with a small heading:

#### Navigation
| Key | Action |
|---|---|
| Up / Down arrows | Previous / next sibling |
| Left / Right arrows | Parent / first child |
| Esc | Deselect / exit edit mode |

#### Node editing
| Key | Action |
|---|---|
| Tab | Add child |
| Shift+Tab | Promote node |
| Enter | Add sibling |
| Space / F2 | Edit node text |
| Double-click | Edit node text |
| Delete / Backspace | Delete node |

#### View & history
| Key | Action |
|---|---|
| Cmd+Z | Undo |
| Cmd+Shift+Z | Redo |
| Scroll | Zoom |
| Cmd+0 | Fit to screen |

### Key notation

- Mac: Cmd symbol, Shift symbol, Backspace symbol
- Windows/Linux: Ctrl, Shift, Backspace
- Detect platform via `navigator.platform` (contains "Mac" -> Mac notation)
- Render Cmd symbol on Mac, Ctrl text on others

### Styling

- Uses existing demo CSS custom properties (--text, --muted, --accent, --line)
- Section headings: font-size 0.7rem, text-transform uppercase,
  letter-spacing 0.04em, color var(--muted)
- Shortcut keys: kbd elements with light background, monospace font,
  border, subtle shadow — matching the design system
- Row layout: key (right-aligned, fixed width) then action description (left)
- Compact spacing, no wasted vertical space

CSS classes to add:
```
.shortcuts-panel        /* container */
.shortcuts-header       /* clickable header row */
.shortcuts-title        /* "Shortcuts" text */
.shortcuts-chevron      /* chevron icon */
.shortcuts-body         /* collapsible content */
.shortcuts-section      /* group of shortcuts */
.shortcuts-section-title /* "Navigation", "Node editing", etc */
.shortcuts-row          /* key + description */
.shortcuts-key          /* kbd styling */
```

## Interaction Details

- Clicking the header row (not just the chevron) toggles expand/collapse.
- Hover state on header: subtle background change (var(--line) at 50%
  opacity).
- No animation on collapse (keep it simple, instant DOM swap). If we want
  smoothness later, CSS max-height transition can be added.
- The panel does NOT steal focus from the canvas. It's display-only — no
  inputs, no buttons (except the toggle).

## Accessibility

- Header row: role="button", aria-expanded, tabIndex=0,
  keyboard support (Enter/Space to toggle).
- Panel: role="region", aria-label="Keyboard shortcuts".
- kbd elements: aria-hidden="true" (the action text conveys meaning).

## Implementation Plan

1. Create `demo/src/ShortcutsPanel.tsx` — component with expand/collapse
   logic, localStorage persistence, platform detection, key notation.
2. Replace `.sidebar-footer` content in `App.tsx` — swap the `.rich-hint`
   div for `<ShortcutsPanel />`.
3. Add CSS to `demo/src/style.css` — panel, kbd, section styling.
4. Manual test: default expanded, collapse persists across reload, platform
   detection shows Cmd symbol vs Ctrl.
5. Deploy to mapdemo.tripleadigital.io via existing CF Pages pipeline.

## Acceptance Criteria

- [ ] Shortcuts panel visible at bottom of sidebar on first visit (expanded)
- [ ] Clicking header collapses the panel (only header row visible)
- [ ] Collapsed state persists across page reload (localStorage)
- [ ] Shortcut list shows all 13 shortcuts from the keymap
- [ ] Keys render as kbd elements with proper styling
- [ ] Platform detection: Cmd symbol on Mac, Ctrl on Windows/Linux
- [ ] Panel is display-only, does not steal canvas focus
- [ ] Accessibility: header has role/aria attributes, keyboard toggle works
- [ ] No layout shift or overflow at common viewport widths
- [ ] Existing sidebar content (sessions) not broken

## Test Plan

Manual verification (no unit tests — demo component, visual behavior):

1. Load demo fresh (clear localStorage) -> panel expanded, all shortcuts visible
2. Click header -> collapses, only header visible
3. Reload page -> still collapsed (state persisted)
4. Click header -> expands again
5. Verify Cmd symbols on Mac / Ctrl on other platforms
6. Verify panel doesn't interfere with canvas keyboard shortcuts (click header,
   then press Tab -> canvas still receives Tab if focused)
7. Verify in dark theme (panel styling adapts)
