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
          <div className="eyebrow">mindmaplib demo</div>
          <h1>Embeddable mind maps for product teams</h1>
        </div>
        <div className="topbar-actions" aria-label="Demo controls">
          <button type="button" onClick={createSession}>
            New saved map
          </button>
          <button type="button" onClick={resetLocalDemo}>
            Local sample
          </button>
          <select
            aria-label="Theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeName)}
          >
            <option value="triplea">TripleA</option>
            <option value="triplea-dark">TripleA dark</option>
          </select>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar" aria-label="Saved maps">
          <div className="sidebar-header">
            <h2>Saved maps</h2>
            <button type="button" onClick={() => void refreshSessions()}>
              Refresh
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="empty-state">
              No D1 sessions yet. Create a saved map to persist changes.
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
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="map-card" aria-label="Mindmap editor">
          <div className="map-toolbar">
            <div>
              <strong>{editor.getDoc().meta.title}</strong>
              <span>
                {activeSessionId
                  ? `Saved in D1 · ${saveState}`
                  : 'Local sample'}
              </span>
            </div>
            <div className="toolbar-buttons">
              {layouts.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`icon-button ${layout === mode ? 'active' : ''}`}
                  title={layoutLabel(mode)}
                  aria-label={layoutLabel(mode)}
                  onClick={() => applyLayout(mode)}
                >
                  <LayoutIcon mode={mode} />
                </button>
              ))}
              <span className="toolbar-divider" />
              <button
                type="button"
                className="icon-button"
                title="Fit to screen"
                aria-label="Fit to screen"
                onClick={() => editor.fitToScreen()}
              >
                <IconFit />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Undo"
                aria-label="Undo"
                onClick={() => editor.undo()}
              >
                <IconUndo />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Redo"
                aria-label="Redo"
                onClick={() => editor.redo()}
              >
                <IconRedo />
              </button>
              <span className="toolbar-divider" />
              <button
                type="button"
                className="icon-button"
                title={showOutline ? 'Hide outline' : 'Show outline'}
                aria-label={showOutline ? 'Hide outline' : 'Show outline'}
                onClick={() => setShowOutline((value) => !value)}
              >
                <IconPanelToggle />
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
