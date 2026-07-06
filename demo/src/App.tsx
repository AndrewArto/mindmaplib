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
} from './icons'
import { createSampleDoc } from './sample'

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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" fill="#21426f" />
      <circle cx="18" cy="6" r="2.5" fill="#355585" />
      <circle cx="12" cy="18" r="2.5" fill="#21426f" />
      <line x1="6" y1="6" x2="18" y2="6" stroke="#21426f" strokeWidth="1.2" opacity="0.4" />
      <line x1="6" y1="6" x2="12" y2="18" stroke="#21426f" strokeWidth="1.2" opacity="0.4" />
      <line x1="18" y1="6" x2="12" y2="18" stroke="#21426f" strokeWidth="1.2" opacity="0.4" />
    </svg>
  )
}

/**
 * Graphical theme swatch — shows a mini preview of what the theme looks like.
 * Users see the color palette without needing to click a dropdown.
 */
function ThemeSwatch({
  theme,
  active,
  onClick,
  title,
}: {
  theme: ThemeName
  active: boolean
  onClick: () => void
  title: string
}): React.ReactElement {
  const bg = theme === 'triplea' ? '#f6f4ef' : '#080e27'
  const card = theme === 'triplea' ? '#ffffff' : 'rgba(15,23,60,0.82)'
  const accent = theme === 'triplea' ? '#21426f' : '#7fa6d9'
  const ink = theme === 'triplea' ? '#16181d' : '#f1f5f9'
  const line = theme === 'triplea' ? '#e6e2d9' : 'rgba(255,255,255,0.08)'

  return (
    <button
      type="button"
      className={`theme-swatch ${active ? 'active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      <svg width="40" height="28" viewBox="0 0 40 28" fill="none" aria-hidden="true">
        <rect width="40" height="28" rx="6" fill={bg} />
        <line x1="8" y1="6" x2="16" y2="14" stroke={accent} strokeWidth="1" opacity="0.4" />
        <line x1="8" y1="6" x2="16" y2="22" stroke={accent} strokeWidth="1" opacity="0.4" />
        <line x1="16" y1="14" x2="32" y2="10" stroke={accent} strokeWidth="1" opacity="0.3" />
        <line x1="16" y1="22" x2="32" y2="20" stroke={accent} strokeWidth="1" opacity="0.3" />
        <circle cx="8" cy="6" r="3" fill={card} stroke={accent} strokeWidth="0.8" />
        <rect x="14" y="11" width="6" height="6" rx="2" fill={card} stroke={line} strokeWidth="0.5" />
        <rect x="28" y="7" width="8" height="6" rx="2" fill={card} stroke={line} strokeWidth="0.5" />
        <rect x="28" y="17" width="8" height="6" rx="2" fill={card} stroke={line} strokeWidth="0.5" />
        <circle cx="17" cy="14" r="1.5" fill={ink} opacity="0.6" />
      </svg>
    </button>
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
  const [layout, setLayout] = useState<LayoutMode>('tree-horizontal')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)

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
          <button type="button" className="btn btn-primary" onClick={createSession}>
            New map
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetLocalDemo}>
            Sample
          </button>
          <span className="topbar-divider" />
          <div className="theme-switcher" role="group" aria-label="Theme">
            <ThemeSwatch
              theme="triplea"
              active={theme === 'triplea'}
              onClick={() => setTheme('triplea')}
              title="Light theme"
            />
            <ThemeSwatch
              theme="triplea-dark"
              active={theme === 'triplea-dark'}
              onClick={() => setTheme('triplea-dark')}
              title="Dark theme"
            />
          </div>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7V5h16v2M9 5v14M7 19h4" />
                <path d="M14 12h6M14 16h6M14 8h6" opacity="0.5" />
              </svg>
              <span>Rich text: **bold**, *italic*, `code`, [links](url), lists</span>
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
            </div>
          </div>

          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <div className="map-host">
            <Mindmap
              key={editor.getDoc().id}
              editor={editor}
              showOutline={showOutline}
              layoutMode={layout}
              outlineShowToolbar
              outlineSearchable
              selectToCenter
              gridType="dots"
              className="demo-mindmap"
              onChange={scheduleSave}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
