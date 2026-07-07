import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mindmap } from '@mindmaplib/react'
import type {
  LayoutMode,
  MindmapDocMeta,
  MindmapEditor,
} from '@mindmaplib/core'
import { MindmapEditor as CoreMindmapEditor } from '@mindmaplib/core'
import { D1Store } from './d1store'
import {
  LayoutIcon,
  layoutLabel,
  IconFit,
  IconUndo,
  IconRedo,
  IconPanelToggle,
  IconKeyboard,
} from './icons'
import { createSampleDoc } from './sample'
import {
  KeyboardShortcutsOverlay,
  getPlatformModifier,
  isEditableTarget,
} from './KeyboardShortcutsOverlay'

type ThemeName = 'triplea' | 'triplea-dark'

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const layouts: LayoutMode[] = ['tree-horizontal', 'tree-vertical', 'radial']

function createEditor(doc = createSampleDoc(), store: D1Store): MindmapEditor {
  const editor = new CoreMindmapEditor(doc, { store })
  editor.setLayout('tree-horizontal')
  editor.select(editor.getDoc().rootId)
  return editor
}

function formatUpdated(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getSessionIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('id')
}

function setSessionUrl(id: string | null): void {
  const url = new URL(window.location.href)
  if (id) {
    url.searchParams.set('id', id)
  } else {
    url.searchParams.delete('id')
  }
  window.history.replaceState({}, '', url)
}

function BrandMark(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.5" fill="#21426f" />
      <circle cx="18" cy="6" r="2.5" fill="#355585" />
      <circle cx="12" cy="18" r="2.5" fill="#21426f" />
      <line
        x1="6"
        y1="6"
        x2="18"
        y2="6"
        stroke="#21426f"
        strokeWidth="1.2"
        opacity="0.4"
      />
      <line
        x1="6"
        y1="6"
        x2="12"
        y2="18"
        stroke="#21426f"
        strokeWidth="1.2"
        opacity="0.4"
      />
      <line
        x1="18"
        y1="6"
        x2="12"
        y2="18"
        stroke="#21426f"
        strokeWidth="1.2"
        opacity="0.4"
      />
    </svg>
  )
}

/**
 * Theme toggle — sun/moon icons, clean and universally understood.
 */
function ThemeToggle({
  theme,
  onChange,
}: {
  theme: ThemeName
  onChange: (t: ThemeName) => void
}): React.ReactElement {
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className={`theme-btn ${theme === 'triplea' ? 'active' : ''}`}
        onClick={() => onChange('triplea')}
        title="Light"
        aria-pressed={theme === 'triplea'}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8l1.8-1.8M18 6l1.8-1.8" />
        </svg>
      </button>
      <button
        type="button"
        className={`theme-btn ${theme === 'triplea-dark' ? 'active' : ''}`}
        onClick={() => onChange('triplea-dark')}
        title="Dark"
        aria-pressed={theme === 'triplea-dark'}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      </button>
    </div>
  )
}

const statusText: Record<SaveState, string> = {
  idle: 'Local sample',
  saving: 'Saving…',
  saved: 'Saved to D1',
  error: 'Save failed',
  conflict: 'Conflict',
}

export function App(): React.ReactElement {
  const store = useMemo(() => new D1Store(), [])
  const [editor, setEditor] = useState<MindmapEditor>(() =>
    createEditor(createSampleDoc(), store),
  )
  const [sessions, setSessions] = useState<MindmapDocMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeName>('triplea')
  const [showOutline, setShowOutline] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [layout, setLayout] = useState<LayoutMode>('tree-horizontal')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null)
  const shortcutModifier = useMemo(() => getPlatformModifier(), [])

  const refreshSessions = useCallback(async () => {
    const rows = await store.list()
    setSessions(rows)
  }, [store])

  const loadSession = useCallback(
    async (id: string) => {
      setErrorMessage(null)
      const doc = await store.load(id)
      if (!doc) {
        setErrorMessage('Session not found or D1 is not available.')
        setSessionUrl(null)
        setActiveSessionId(null)
        return
      }
      const next = createEditor(doc, store)
      setEditor(next)
      setActiveSessionId(id)
      setSessionUrl(id)
      setSaveState('saved')
    },
    [store],
  )

  const createSession = useCallback(async () => {
    setErrorMessage(null)
    const doc = createSampleDoc()
    try {
      const id = await store.create(doc)
      await loadSession(id)
      await refreshSessions()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorMessage(message)
      setSaveState('error')
      const fallback = createEditor(doc, store)
      setEditor(fallback)
      setActiveSessionId(null)
      setSessionUrl(null)
    }
  }, [loadSession, refreshSessions, store])

  useEffect(() => {
    void refreshSessions()
    const id = getSessionIdFromUrl()
    if (id) void loadSession(id)
  }, [loadSession, refreshSessions])

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const openShortcuts = useCallback(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setShowShortcuts(true)
  }, [])

  const closeShortcuts = useCallback(() => {
    setShowShortcuts(false)
    window.setTimeout(() => {
      const target = previousFocus.current ?? shortcutsButtonRef.current
      target?.focus()
    }, 0)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showShortcuts) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeShortcuts()
        }
        return
      }

      if (event.key === '?' && !isEditableTarget(event.target)) {
        event.preventDefault()
        openShortcuts()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeShortcuts, openShortcuts, showShortcuts])

  const scheduleSave = useCallback(() => {
    if (!activeSessionId) return
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => {
      void editor
        .save()
        .then(async () => {
          setSaveState('saved')
          await refreshSessions()
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          setErrorMessage(message)
          setSaveState(
            message.toLowerCase().includes('conflict') ? 'conflict' : 'error',
          )
        })
    }, 2000)
  }, [activeSessionId, editor, refreshSessions])

  const applyLayout = useCallback(
    (mode: LayoutMode) => {
      setLayout(mode)
      editor.setLayout(mode)
      editor.fitToScreen()
    },
    [editor],
  )

  const deleteSession = useCallback(
    async (id: string) => {
      await store.delete(id)
      await refreshSessions()
      if (id === activeSessionId) {
        setActiveSessionId(null)
        setSessionUrl(null)
        setEditor(createEditor(createSampleDoc(), store))
        setSaveState('idle')
      }
    },
    [activeSessionId, refreshSessions, store],
  )

  const resetLocalDemo = useCallback(() => {
    setActiveSessionId(null)
    setSessionUrl(null)
    setEditor(createEditor(createSampleDoc(), store))
    setSaveState('idle')
  }, [store])

  return (
    <div className={`demo-shell theme-${theme}`}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <BrandMark />
            <span>mindmaplib</span>
          </div>
          <span className="demo-badge">demo</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={createSession}
          >
            New map
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetLocalDemo}
          >
            Sample
          </button>
          <span className="topbar-divider" />
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar" aria-label="Saved maps">
          <div className="sidebar-header">
            <h2>Saved maps</h2>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void refreshSessions()}
            >
              Refresh
            </button>
          </div>
          <div className="sidebar-body">
            {sessions.length === 0 ? (
              <p className="empty-state">
                No saved maps yet. Click "New map" to persist changes in D1.
              </p>
            ) : (
              <ul className="session-list">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={
                        session.id === activeSessionId
                          ? 'session-button active'
                          : 'session-button'
                      }
                      onClick={() => void loadSession(session.id)}
                    >
                      <span>{session.title}</span>
                      <small>
                        v{session.version} · {formatUpdated(session.updated)}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      aria-label={`Delete ${session.title}`}
                      onClick={() => void deleteSession(session.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sidebar-footer">
            <div className="rich-hint">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7V5h16v2M9 5v14M7 19h4" />
                <path d="M14 12h6M14 16h6M14 8h6" opacity="0.5" />
              </svg>
              <span>
                Double-click a node to edit. Rich text: **bold**, *italic*,
                `code`, [links](url), lists
              </span>
            </div>
          </div>
        </aside>

        <section className="map-card" aria-label="Mindmap editor">
          <div className="map-toolbar">
            <div className="map-title-block">
              <strong>{editor.getDoc().meta.title}</strong>
              <span className={`status-badge ${saveState}`}>
                {statusText[saveState]}
              </span>
            </div>
            <div className="toolbar-buttons">
              <div className="toolbar-group">
                {layouts.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`icon-button ${layout === mode ? 'active' : ''}`}
                    title={layoutLabel(mode)}
                    aria-label={layoutLabel(mode)}
                    onClick={() => applyLayout(mode)}
                  >
                    <LayoutIcon mode={mode} size={16} />
                  </button>
                ))}
              </div>
              <span className="toolbar-divider" />
              <button
                type="button"
                className="icon-button"
                title="Fit to screen"
                aria-label="Fit to screen"
                onClick={() => editor.fitToScreen()}
              >
                <IconFit size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Undo"
                aria-label="Undo"
                onClick={() => editor.undo()}
              >
                <IconUndo size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Redo"
                aria-label="Redo"
                onClick={() => editor.redo()}
              >
                <IconRedo size={16} />
              </button>
              <span className="toolbar-divider" />
              <button
                type="button"
                className={`icon-button ${showOutline ? 'active' : ''}`}
                title={showOutline ? 'Hide outline' : 'Show outline'}
                aria-label={showOutline ? 'Hide outline' : 'Show outline'}
                onClick={() => setShowOutline((value) => !value)}
              >
                <IconPanelToggle size={16} />
              </button>
              <button
                ref={shortcutsButtonRef}
                type="button"
                className={`icon-button ${showShortcuts ? 'active' : ''}`}
                title="Keyboard shortcuts"
                aria-label="Keyboard shortcuts"
                aria-haspopup="dialog"
                aria-expanded={showShortcuts}
                onClick={openShortcuts}
              >
                <IconKeyboard size={16} />
              </button>
            </div>
          </div>

          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <div className="map-host">
            <Mindmap
              key={editor.getDoc().id}
              editor={editor}
              showOutline={showOutline}
              layoutMode={layout}
              outlineWidth={320}
              outlineShowToolbar
              outlineSearchable
              gridType="dots"
              className="demo-mindmap"
              onChange={scheduleSave}
            />
          </div>
        </section>
      </main>

      {showShortcuts && (
        <KeyboardShortcutsOverlay
          modifier={shortcutModifier}
          onClose={closeShortcuts}
        />
      )}
    </div>
  )
}
