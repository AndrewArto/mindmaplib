import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mindmap } from '@mindmaplib/react'
import type {
  LayoutMode,
  MindmapDoc,
  MindmapDocMeta,
  MindmapEditor,
} from '@mindmaplib/core'
import { createDoc, MindmapEditor as CoreMindmapEditor } from '@mindmaplib/core'
import {
  LayoutIcon,
  layoutLabel,
  IconFit,
  IconUndo,
  IconRedo,
  IconPanelToggle,
  IconKeyboard,
  IconPencil,
  IconCopy,
  IconX,
} from './icons'
import { createSampleDocuments } from './sample'
import {
  KeyboardShortcutsOverlay,
  getPlatformModifier,
  isEditableTarget,
} from './KeyboardShortcutsOverlay'
import { D1Store, exportDocumentJson } from './d1store'
import {
  addChildNodeFromToolbar,
  addSiblingNodeFromToolbar,
  deleteSelectedNodeFromToolbar,
} from './editorActions'
import { consumeGlobalShortcut, isUndoRedoShortcut } from './keyboardGuards'
import { getResponsiveOutlineWidth } from './responsive'

type ThemeName = 'triplea' | 'triplea-dark'

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const layouts: LayoutMode[] = ['tree-horizontal', 'tree-vertical', 'radial']

const FOCUS_STORAGE_PREFIX = 'mindmaplib:last-focused-node:'

function getStoredFocusNodeId(doc: MindmapDoc): string | null {
  try {
    const nodeId = window.localStorage.getItem(
      `${FOCUS_STORAGE_PREFIX}${doc.id}`,
    )
    if (!nodeId || !Object.hasOwn(doc.nodes, nodeId)) return null

    let cursor = doc.nodes[nodeId]
    let visibleNodeId = nodeId
    while (cursor.parentId !== null) {
      const parent = doc.nodes[cursor.parentId]
      if (!parent) return null
      if (parent.collapsed) visibleNodeId = parent.id
      cursor = parent
    }
    return visibleNodeId
  } catch {
    return null
  }
}

function rememberFocusedNode(docId: string, nodeId: string | null): void {
  if (!nodeId) return
  try {
    window.localStorage.setItem(`${FOCUS_STORAGE_PREFIX}${docId}`, nodeId)
  } catch {
    // Focus persistence is best-effort; storage failures must not break editing.
  }
}

function createEditor(doc: MindmapDoc, store: D1Store): MindmapEditor {
  const editor = new CoreMindmapEditor(doc, { store })
  editor.setLayout('tree-horizontal')
  editor.select(getStoredFocusNodeId(editor.getDoc()) ?? editor.getDoc().rootId)
  return editor
}

function createBlankDoc(): MindmapDoc {
  return createDoc('Untitled mindmap')
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

function getInitialViewportWidth(): number {
  return typeof window === 'undefined' ? 1024 : window.innerWidth
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, 0.1), 4)
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'mindmap'
}

function focusMindmapInteractionTarget(
  host: HTMLElement | null,
  editor: MindmapEditor,
): void {
  if (!host) return

  const { editingNodeId } = editor.getState()
  if (editingNodeId) {
    const editingNode = Array.from(
      host.querySelectorAll<HTMLElement>('[data-node-id]'),
    ).find((node) => node.dataset.nodeId === editingNodeId)
    const editable = editingNode?.querySelector<HTMLElement>(
      '.ProseMirror, [contenteditable="true"]',
    )
    if (editable) {
      editable.focus()
      return
    }
  }

  host.querySelector<HTMLElement>('.mml-canvas')?.focus()
}

function queueMindmapFocus(
  host: HTMLElement | null,
  editor: MindmapEditor,
): void {
  const run = () => focusMindmapInteractionTarget(host, editor)
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.setTimeout(run, 0))
  } else {
    window.setTimeout(run, 0)
  }
}

function getCanvasSize(
  host: HTMLElement | null,
): { width: number; height: number } | undefined {
  const canvas = host?.querySelector<HTMLElement>('.mml-canvas')
  if (!canvas) return undefined
  const rect = canvas.getBoundingClientRect()
  const width = canvas.clientWidth || rect.width
  const height = canvas.clientHeight || rect.height
  if (width <= 0 || height <= 0) return undefined
  return { width, height }
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
    createEditor(createSampleDocuments()[0]!, store),
  )
  const [sessions, setSessions] = useState<MindmapDocMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeName>('triplea')
  const [showOutline, setShowOutline] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(getInitialViewportWidth)
  const [layout, setLayout] = useState<LayoutMode>('tree-horizontal')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const saveTimer = useRef<number | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const shortcutsButtonRef = useRef<HTMLButtonElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const mapHostRef = useRef<HTMLDivElement>(null)
  const shortcutModifier = useMemo(() => getPlatformModifier(), [])
  const outlineWidth = useMemo(
    () => getResponsiveOutlineWidth(viewportWidth),
    [viewportWidth],
  )
  const editorRef = useRef(editor)
  editorRef.current = editor
  const editorState = editor.getState()
  const selectedNode = editorState.selectedNodeId
    ? editorState.doc.nodes[editorState.selectedNodeId]
    : null
  const currentDoc = editor.getDoc()

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

  const openLocalFallback = useCallback(
    (doc: MindmapDoc, message: string) => {
      setErrorMessage(message)
      setSaveState('error')
      setEditor(createEditor(doc, store))
      setActiveSessionId(null)
      setSessionUrl(null)
    },
    [store],
  )

  const persistNewDocument = useCallback(
    async (doc: MindmapDoc) => {
      setErrorMessage(null)
      try {
        const id = await store.create(doc)
        await loadSession(id)
        await refreshSessions()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        openLocalFallback(doc, message)
      }
    },
    [loadSession, openLocalFallback, refreshSessions, store],
  )

  const createSession = useCallback(async () => {
    await persistNewDocument(createBlankDoc())
  }, [persistNewDocument])

  const createSampleSession = useCallback(async () => {
    const [doc] = createSampleDocuments()
    await persistNewDocument(doc)
  }, [persistNewDocument])

  useEffect(() => {
    let cancelled = false
    const initialEditor = editorRef.current
    const initialState = initialEditor.getState()
    const initialize = async () => {
      try {
        const rows = await store.list()
        if (cancelled) return
        setSessions(rows)
        const urlSessionId = getSessionIdFromUrl()
        if (urlSessionId) {
          await loadSession(urlSessionId)
          return
        }

        const firstSessionId = rows[0]?.id
        if (!firstSessionId) return
        const currentState = editorRef.current.getState()
        const untouched =
          currentState.doc.id === initialState.doc.id &&
          currentState.doc.version === initialState.doc.version &&
          currentState.selectedNodeId === initialState.selectedNodeId &&
          currentState.editingNodeId === initialState.editingNodeId
        if (untouched) await loadSession(firstSessionId)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        setSaveState('error')
      }
    }
    void initialize()
    return () => {
      cancelled = true
    }
  }, [loadSession, store])

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    let lastDocId = editor.getDoc().id
    let lastVersion = editor.getDoc().version
    let lastSelectedNodeId = editor.getState().selectedNodeId
    let lastEditingNodeId = editor.getState().editingNodeId

    const unsubscribe = editor.subscribe((state) => {
      const selectionChanged =
        state.doc.id !== lastDocId ||
        state.selectedNodeId !== lastSelectedNodeId
      const appStateChanged =
        selectionChanged ||
        state.doc.version !== lastVersion ||
        state.editingNodeId !== lastEditingNodeId

      if (!appStateChanged) return

      if (selectionChanged) {
        rememberFocusedNode(state.doc.id, state.selectedNodeId)
      }
      lastDocId = state.doc.id
      lastVersion = state.doc.version
      lastSelectedNodeId = state.selectedNodeId
      lastEditingNodeId = state.editingNodeId
      setEditorRevision((value) => value + 1)
    })
    return unsubscribe
  }, [editor])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
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
          consumeGlobalShortcut(event)
          closeShortcuts()
          return
        }
        if (isUndoRedoShortcut(event)) {
          consumeGlobalShortcut(event)
        }
        return
      }

      if (
        event.key === '?' &&
        editor.getState().editingNodeId === null &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault()
        openShortcuts()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [closeShortcuts, editor, openShortcuts, showShortcuts])

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

  const focusMindmapAfterToolbarAction = useCallback(() => {
    queueMindmapFocus(mapHostRef.current, editor)
  }, [editor])

  const fitMapToScreen = useCallback(() => {
    const size = getCanvasSize(mapHostRef.current)
    editor.fitToScreen(size?.width, size?.height)
    focusMindmapAfterToolbarAction()
  }, [editor, focusMindmapAfterToolbarAction])

  const applyLayout = useCallback(
    (mode: LayoutMode) => {
      setLayout(mode)
      editor.setLayout(mode)
      fitMapToScreen()
    },
    [editor, fitMapToScreen],
  )

  const addChildNode = useCallback(() => {
    addChildNodeFromToolbar(editor)
    focusMindmapAfterToolbarAction()
  }, [editor, focusMindmapAfterToolbarAction])

  const addSiblingNode = useCallback(() => {
    addSiblingNodeFromToolbar(editor)
    focusMindmapAfterToolbarAction()
  }, [editor, focusMindmapAfterToolbarAction])

  const deleteSelectedNode = useCallback(() => {
    deleteSelectedNodeFromToolbar(editor)
    focusMindmapAfterToolbarAction()
  }, [editor, focusMindmapAfterToolbarAction])

  const zoomBy = useCallback(
    (factor: number) => {
      const state = editor.getState()
      editor.setViewport({
        ...state.viewport,
        zoom: clampZoom(state.viewport.zoom * factor),
      })
      focusMindmapAfterToolbarAction()
    },
    [editor, focusMindmapAfterToolbarAction],
  )

  const exportCurrentDocument = useCallback(() => {
    if (editor.getState().editingNodeId !== null) {
      setErrorMessage('Finish editing before exporting.')
      return
    }
    const doc = editor.getDoc()
    const blob = new Blob([exportDocumentJson(doc)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${slugify(doc.meta.title)}.mmp.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [editor])

  const importDocument = useCallback(
    async (file: File) => {
      try {
        if (editor.getState().editingNodeId !== null) {
          setErrorMessage('Finish editing before importing.')
          return
        }
        setErrorMessage(null)
        const text = await file.text()
        const id = await store.importJson(text)
        await loadSession(id)
        await refreshSessions()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(`Import failed: ${message}`)
        setSaveState('error')
      }
    },
    [editor, loadSession, refreshSessions, store],
  )

  const saveActiveBeforeDocumentAction =
    useCallback(async (): Promise<boolean> => {
      if (editor.getState().editingNodeId !== null) {
        setErrorMessage('Finish editing before using document actions.')
        return false
      }
      if (!activeSessionId) return true
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      try {
        await editor.save()
        setSaveState('saved')
        await refreshSessions()
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        setSaveState(
          message.toLowerCase().includes('conflict') ? 'conflict' : 'error',
        )
        return false
      }
    }, [activeSessionId, editor, refreshSessions])

  const renameSession = useCallback(
    async (session: MindmapDocMeta) => {
      const title = window.prompt('Rename map', session.title)?.trim()
      if (!title) return
      if (session.id === activeSessionId) {
        const saved = await saveActiveBeforeDocumentAction()
        if (!saved) return
      }
      await store.rename(session.id, title)
      if (session.id === activeSessionId) await loadSession(session.id)
      await refreshSessions()
    },
    [
      activeSessionId,
      loadSession,
      refreshSessions,
      saveActiveBeforeDocumentAction,
      store,
    ],
  )

  const duplicateSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) {
        const saved = await saveActiveBeforeDocumentAction()
        if (!saved) return
      }
      const copyId = await store.duplicate(id)
      await loadSession(copyId)
      await refreshSessions()
    },
    [
      activeSessionId,
      loadSession,
      refreshSessions,
      saveActiveBeforeDocumentAction,
      store,
    ],
  )

  const deleteSession = useCallback(
    async (id: string) => {
      const confirmed = window.confirm('Delete this map from D1?')
      if (!confirmed) return
      await store.delete(id)
      const rows = await store.list()
      setSessions(rows)
      if (id === activeSessionId) {
        const nextId = rows[0]?.id ?? null
        if (nextId) {
          await loadSession(nextId)
        } else {
          setActiveSessionId(null)
          setSessionUrl(null)
          setEditor(createEditor(createBlankDoc(), store))
          setSaveState('idle')
        }
      }
    },
    [activeSessionId, loadSession, store],
  )

  return (
    <div
      className={`demo-shell theme-${theme}`}
      data-editor-revision={editorRevision}
    >
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
            onClick={() => void createSession()}
          >
            New map
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void createSampleSession()}
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
                    <div className="session-actions">
                      <button
                        type="button"
                        className="session-action-button"
                        aria-label={`Rename ${session.title}`}
                        title="Rename"
                        onClick={() => void renameSession(session)}
                      >
                        <IconPencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="session-action-button"
                        aria-label={`Duplicate ${session.title}`}
                        title="Duplicate"
                        onClick={() => void duplicateSession(session.id)}
                      >
                        <IconCopy size={15} />
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        aria-label={`Delete ${session.title}`}
                        title="Delete"
                        onClick={() => void deleteSession(session.id)}
                      >
                        <IconX size={15} />
                      </button>
                    </div>
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
              <strong>{currentDoc.meta.title}</strong>
              <span className={`status-badge ${saveState}`}>
                {statusText[saveState]}
              </span>
            </div>
            <div className="toolbar-buttons">
              <div className="toolbar-group">
                <button
                  type="button"
                  className="icon-button text-icon-button"
                  title="Add child"
                  aria-label="Add child"
                  onClick={addChildNode}
                >
                  +C
                </button>
                <button
                  type="button"
                  className="icon-button text-icon-button"
                  title="Add sibling"
                  aria-label="Add sibling"
                  onClick={addSiblingNode}
                >
                  +S
                </button>
                <button
                  type="button"
                  className="icon-button text-icon-button"
                  title="Delete selected node"
                  aria-label="Delete selected node"
                  disabled={
                    editorState.editingNodeId !== null ||
                    !selectedNode ||
                    selectedNode.parentId === null
                  }
                  onClick={deleteSelectedNode}
                >
                  Del
                </button>
              </div>
              <span className="toolbar-divider" />
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
                className="icon-button text-icon-button"
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => zoomBy(1 / 1.2)}
              >
                −
              </button>
              <button
                type="button"
                className="icon-button text-icon-button"
                title="Zoom in"
                aria-label="Zoom in"
                onClick={() => zoomBy(1.2)}
              >
                +
              </button>
              <button
                type="button"
                className="icon-button"
                title="Fit to screen"
                aria-label="Fit to screen"
                onClick={fitMapToScreen}
              >
                <IconFit size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Undo"
                aria-label="Undo"
                disabled={!editor.canUndo()}
                onClick={() => {
                  editor.undo()
                  focusMindmapAfterToolbarAction()
                }}
              >
                <IconUndo size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Redo"
                aria-label="Redo"
                disabled={!editor.canRedo()}
                onClick={() => {
                  editor.redo()
                  focusMindmapAfterToolbarAction()
                }}
              >
                <IconRedo size={16} />
              </button>
              <span className="toolbar-divider" />
              <button
                type="button"
                className="icon-button text-icon-button"
                title="Import JSON"
                aria-label="Import JSON"
                onClick={() => importInputRef.current?.click()}
              >
                In
              </button>
              <button
                type="button"
                className="icon-button text-icon-button"
                title="Export JSON"
                aria-label="Export JSON"
                onClick={exportCurrentDocument}
              >
                Out
              </button>
              <input
                ref={importInputRef}
                hidden
                type="file"
                accept="application/json,.json,.mmp.json"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (file) void importDocument(file)
                  event.currentTarget.value = ''
                }}
              />
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

          <div ref={mapHostRef} className="map-host">
            <Mindmap
              key={currentDoc.id}
              editor={editor}
              showOutline={showOutline}
              layoutMode={layout}
              outlineWidth={outlineWidth}
              outlineShowToolbar
              outlineSearchable
              gridType="dots"
              className="demo-mindmap"
              onChange={scheduleSave}
              onSelectionChange={(nodeId) =>
                rememberFocusedNode(currentDoc.id, nodeId)
              }
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
