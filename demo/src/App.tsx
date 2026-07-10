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
import { consumeGlobalShortcut, isUndoRedoShortcut } from './keyboardGuards'
import { getResponsiveOutlineWidth } from './responsive'

type ThemeName = 'triplea' | 'triplea-dark'

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

const layouts: LayoutMode[] = ['tree-horizontal', 'tree-vertical', 'radial']

const FOCUS_STORAGE_PREFIX = 'mindmaplib:last-focused-node:'

type EditorStartupSnapshot = {
  state: ReturnType<MindmapEditor['getState']>
  lastTransaction: ReturnType<MindmapEditor['getLastTransaction']>
}

type EditorSourceGuard = {
  editor: MindmapEditor
  snapshot: EditorStartupSnapshot
}

function captureEditorStartupSnapshot(
  editor: MindmapEditor,
): EditorStartupSnapshot {
  return {
    state: editor.getState(),
    lastTransaction: editor.getLastTransaction(),
  }
}

function editorDocumentIdMatchesStateSnapshot(
  editor: MindmapEditor,
  snapshot: EditorStartupSnapshot,
): boolean {
  return editor.getState().doc.id === snapshot.state.doc.id
}

function editorDocumentMatchesStateSnapshot(
  editor: MindmapEditor,
  snapshot: EditorStartupSnapshot,
): boolean {
  const state = editor.getState()
  return (
    state.doc.id === snapshot.state.doc.id &&
    state.doc.version === snapshot.state.doc.version &&
    editor.getLastTransaction() === snapshot.lastTransaction
  )
}

function editorCanAutoLoadStateSnapshot(
  editor: MindmapEditor,
  snapshot: EditorStartupSnapshot,
): boolean {
  const state = editor.getState()
  return (
    editorDocumentMatchesStateSnapshot(editor, snapshot) &&
    state.editingNodeId === snapshot.state.editingNodeId
  )
}

function captureEditorSourceGuard(editor: MindmapEditor): EditorSourceGuard {
  return { editor, snapshot: captureEditorStartupSnapshot(editor) }
}

function editorSourceGuardIsCurrent(
  currentEditor: MindmapEditor,
  guard: EditorSourceGuard,
): boolean {
  return (
    currentEditor === guard.editor &&
    editorCanAutoLoadStateSnapshot(guard.editor, guard.snapshot)
  )
}

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

class AppLifecycleCancelledError extends Error {
  constructor() {
    super('App lifecycle ended')
    this.name = 'AppLifecycleCancelledError'
  }
}

class EditorSaveCancelledError extends Error {
  constructor() {
    super('Editor save was cancelled')
    this.name = 'EditorSaveCancelledError'
  }
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
  const [initializationPending, setInitializationPending] = useState(true)
  const [editorInteractionLocked, setEditorInteractionLocked] = useState(false)
  const editorInteractionLockedRef = useRef(false)
  const editorInteractionLockOwnerRef = useRef<number | null>(null)
  const editorInteractionLockGenerationRef = useRef(0)
  const saveTimers = useRef(new Map<MindmapEditor, number>())
  const saveQueues = useRef(new Map<MindmapEditor, Promise<void>>())
  const failedSaveEditors = useRef(new Map<string, MindmapEditor>())
  const failedSaveTasks = useRef(
    new Map<string, { editor: MindmapEditor; retry: () => Promise<unknown> }>(),
  )
  const saveOperationGenerationsRef = useRef(new Map<MindmapEditor, number>())
  const saveCancellationGenerationsRef = useRef(
    new Map<MindmapEditor, number>(),
  )
  const loadRequestRef = useRef(0)
  const sessionListRequestRef = useRef(0)
  const latestSessionListRequestRef = useRef<Promise<
    MindmapDocMeta[] | null
  > | null>(null)
  const sessionListErrorRef = useRef<string | null>(null)
  const userIntentGenerationRef = useRef(0)
  const mountedRef = useRef(true)
  const lifecycleGenerationRef = useRef(0)
  const sampleBootstrapCreateRef = useRef<{
    promise: ReturnType<D1Store['bootstrapFirstVisitSample']>
    version: number
  } | null>(null)
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
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const currentDoc = editor.getDoc()

  const documentReplacementIsAllowed = useCallback(() => {
    if (editorRef.current.getState().editingNodeId === null) return true
    setErrorMessage('Finish editing before using document actions.')
    return false
  }, [])

  const nextSaveOperationGeneration = useCallback(
    (targetEditor: MindmapEditor): number => {
      const generation =
        (saveOperationGenerationsRef.current.get(targetEditor) ?? 0) + 1
      saveOperationGenerationsRef.current.set(targetEditor, generation)
      return generation
    },
    [],
  )

  const invalidatePendingSave = useCallback(
    (targetEditor: MindmapEditor = editorRef.current) => {
      nextSaveOperationGeneration(targetEditor)
    },
    [nextSaveOperationGeneration],
  )

  const cancelPendingEditorSave = useCallback(
    (targetEditor: MindmapEditor) => {
      const timerId = saveTimers.current.get(targetEditor)
      if (timerId !== undefined) {
        window.clearTimeout(timerId)
        saveTimers.current.delete(targetEditor)
      }
      invalidatePendingSave(targetEditor)
      const cancellationGeneration =
        (saveCancellationGenerationsRef.current.get(targetEditor) ?? 0) + 1
      saveCancellationGenerationsRef.current.set(
        targetEditor,
        cancellationGeneration,
      )
      const docId = targetEditor.getDoc().id
      if (failedSaveEditors.current.get(docId) === targetEditor) {
        failedSaveEditors.current.delete(docId)
      }
      if (failedSaveTasks.current.get(docId)?.editor === targetEditor) {
        failedSaveTasks.current.delete(docId)
      }
    },
    [invalidatePendingSave],
  )

  const cancelPendingSavesForDocument = useCallback(
    (docId: string) => {
      const editors = new Set<MindmapEditor>([
        ...saveTimers.current.keys(),
        ...saveQueues.current.keys(),
        ...failedSaveEditors.current.values(),
        ...Array.from(
          failedSaveTasks.current.values(),
          ({ editor: failedEditor }) => failedEditor,
        ),
      ])
      if (editorRef.current.getDoc().id === docId) {
        editors.add(editorRef.current)
      }
      for (const targetEditor of editors) {
        if (targetEditor.getDoc().id === docId) {
          cancelPendingEditorSave(targetEditor)
        }
      }
    },
    [cancelPendingEditorSave],
  )

  const lockEditorInteraction = useCallback((): number | null => {
    if (editorInteractionLockOwnerRef.current !== null) return null
    const owner = ++editorInteractionLockGenerationRef.current
    editorInteractionLockOwnerRef.current = owner
    editorInteractionLockedRef.current = true
    setEditorInteractionLocked(true)
    return owner
  }, [])

  const transferEditorInteractionLock = useCallback((): number => {
    const owner = ++editorInteractionLockGenerationRef.current
    editorInteractionLockOwnerRef.current = owner
    if (!editorInteractionLockedRef.current) {
      editorInteractionLockedRef.current = true
      setEditorInteractionLocked(true)
    }
    return owner
  }, [])

  const unlockEditorInteraction = useCallback((owner?: number) => {
    if (owner !== undefined && editorInteractionLockOwnerRef.current !== owner)
      return
    if (editorInteractionLockOwnerRef.current === null) return
    editorInteractionLockOwnerRef.current = null
    editorInteractionLockedRef.current = false
    if (mountedRef.current) setEditorInteractionLocked(false)
  }, [])

  const enqueueEditorTask = useCallback(
    <T,>(targetEditor: MindmapEditor, task: () => Promise<T>): Promise<T> => {
      const previous = saveQueues.current.get(targetEditor) ?? Promise.resolve()
      const lifecycleGeneration = lifecycleGenerationRef.current
      const lifecycleIsCurrent = () =>
        mountedRef.current &&
        lifecycleGenerationRef.current === lifecycleGeneration
      const runTask = async () => {
        if (!lifecycleIsCurrent()) throw new AppLifecycleCancelledError()
        try {
          const value = await task()
          if (!lifecycleIsCurrent()) throw new AppLifecycleCancelledError()
          return value
        } catch (error) {
          if (!lifecycleIsCurrent()) throw new AppLifecycleCancelledError()
          throw error
        }
      }
      const result = previous.catch(() => undefined).then(runTask)
      const tail = result.then(
        () => undefined,
        () => undefined,
      )
      saveQueues.current.set(targetEditor, tail)
      void tail.finally(() => {
        if (saveQueues.current.get(targetEditor) === tail) {
          saveQueues.current.delete(targetEditor)
        }
      })
      return result
    },
    [],
  )

  const enqueueEditorSave = useCallback(
    async (targetEditor: MindmapEditor) => {
      const docId = targetEditor.getDoc().id
      const cancellationGeneration =
        saveCancellationGenerationsRef.current.get(targetEditor) ?? 0
      const saveIsNotCancelled = () =>
        (saveCancellationGenerationsRef.current.get(targetEditor) ?? 0) ===
        cancellationGeneration
      const retainedTask = failedSaveTasks.current.get(docId)
      if (retainedTask?.editor === targetEditor) {
        if (!saveIsNotCancelled()) throw new EditorSaveCancelledError()
        const result = await retainedTask.retry()
        if (!saveIsNotCancelled()) throw new EditorSaveCancelledError()
        return result
      }
      try {
        const result = await enqueueEditorTask(targetEditor, () => {
          if (!saveIsNotCancelled()) throw new EditorSaveCancelledError()
          return targetEditor.save()
        })
        if (!saveIsNotCancelled()) throw new EditorSaveCancelledError()
        if (failedSaveEditors.current.get(docId) === targetEditor) {
          failedSaveEditors.current.delete(docId)
        }
        if (failedSaveTasks.current.get(docId)?.editor === targetEditor) {
          failedSaveTasks.current.delete(docId)
        }
        return result
      } catch (error) {
        if (
          !(error instanceof AppLifecycleCancelledError) &&
          !(error instanceof EditorSaveCancelledError) &&
          mountedRef.current &&
          saveIsNotCancelled()
        ) {
          failedSaveEditors.current.set(docId, targetEditor)
        }
        throw error
      }
    },
    [enqueueEditorTask],
  )

  const flushPendingSavesForDocument = useCallback(
    async (docId: string) => {
      const editors = new Set<MindmapEditor>([
        ...saveTimers.current.keys(),
        ...saveQueues.current.keys(),
        ...failedSaveEditors.current.values(),
        ...Array.from(
          failedSaveTasks.current.values(),
          ({ editor: failedEditor }) => failedEditor,
        ),
      ])
      const pending: Promise<unknown>[] = []
      for (const targetEditor of editors) {
        if (targetEditor.getDoc().id !== docId) continue
        const timerId = saveTimers.current.get(targetEditor)
        if (timerId !== undefined) {
          window.clearTimeout(timerId)
          saveTimers.current.delete(targetEditor)
        }
        const failedTask = failedSaveTasks.current.get(docId)
        if (failedTask?.editor === targetEditor) {
          pending.push(failedTask.retry())
        } else if (targetEditor.isDirty()) {
          pending.push(enqueueEditorSave(targetEditor))
        } else {
          const tail = saveQueues.current.get(targetEditor)
          if (tail) pending.push(tail)
        }
      }
      await Promise.all(pending)
    },
    [enqueueEditorSave],
  )

  const refreshSessions = useCallback((): Promise<MindmapDocMeta[] | null> => {
    const requestId = ++sessionListRequestRef.current
    const requestHolder: {
      current: Promise<MindmapDocMeta[] | null> | null
    } = { current: null }
    const awaitLatestRequest = async (): Promise<MindmapDocMeta[] | null> => {
      const latest = latestSessionListRequestRef.current
      if (!latest || latest === requestHolder.current) return null
      return latest
    }
    const request = (async () => {
      try {
        const rows = await store.list()
        if (requestId !== sessionListRequestRef.current) {
          return awaitLatestRequest()
        }
        setSessions(rows)
        const recoveredListError = sessionListErrorRef.current
        sessionListErrorRef.current = null
        if (recoveredListError) {
          setErrorMessage((current) =>
            current === recoveredListError ? null : current,
          )
        }
        return rows
      } catch (error) {
        if (requestId !== sessionListRequestRef.current) {
          return awaitLatestRequest()
        }
        const message = error instanceof Error ? error.message : String(error)
        sessionListErrorRef.current = message
        setErrorMessage(message)
        return null
      }
    })()
    requestHolder.current = request
    latestSessionListRequestRef.current = request
    return request
  }, [store])

  const reconcileSessionsAfterMutation = useCallback(async () => {
    if (!mountedRef.current) return null
    return refreshSessions()
  }, [refreshSessions])

  const loadSession = useCallback(
    async (
      id: string,
      canApply: () => boolean = () => true,
      operationSource?: EditorSourceGuard,
    ) => {
      if (!documentReplacementIsAllowed()) return false
      const requestId = ++loadRequestRef.current
      setErrorMessage(null)
      const sourceEditor = operationSource?.editor ?? editorRef.current
      const sourceSnapshot =
        operationSource?.snapshot ?? captureEditorStartupSnapshot(sourceEditor)
      await flushPendingSavesForDocument(id)
      if (
        requestId !== loadRequestRef.current ||
        !canApply() ||
        editorRef.current !== sourceEditor ||
        !editorCanAutoLoadStateSnapshot(sourceEditor, sourceSnapshot)
      )
        return false
      const sourceIsUnchanged = () =>
        editorRef.current === sourceEditor &&
        editorCanAutoLoadStateSnapshot(sourceEditor, sourceSnapshot)
      const doc = await store.load(id)
      if (
        requestId !== loadRequestRef.current ||
        !canApply() ||
        !sourceIsUnchanged()
      )
        return false
      if (!doc) {
        setErrorMessage('Session not found.')
        return false
      }
      const next = createEditor(doc, store)
      setEditor(next)
      setActiveSessionId(id)
      setSessionUrl(id)
      setSaveState('saved')
      return true
    },
    [documentReplacementIsAllowed, flushPendingSavesForDocument, store],
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
      if (!documentReplacementIsAllowed()) return
      const lockOwner = transferEditorInteractionLock()
      const sourceEditor = editorRef.current
      const sourceGuard = captureEditorSourceGuard(sourceEditor)
      const intentGeneration = ++userIntentGenerationRef.current
      invalidatePendingSave()
      const intentIsCurrent = () =>
        userIntentGenerationRef.current === intentGeneration
      setErrorMessage(null)
      try {
        const id = await store.create(doc)
        await reconcileSessionsAfterMutation()
        if (!intentIsCurrent()) return
        await loadSession(id, intentIsCurrent, sourceGuard)
      } catch (error) {
        if (!intentIsCurrent()) return
        const message = error instanceof Error ? error.message : String(error)
        if (!editorSourceGuardIsCurrent(editorRef.current, sourceGuard)) {
          setErrorMessage(message)
          setSaveState('error')
          return
        }
        openLocalFallback(doc, message)
      } finally {
        unlockEditorInteraction(lockOwner)
      }
    },
    [
      documentReplacementIsAllowed,
      invalidatePendingSave,
      loadSession,
      openLocalFallback,
      reconcileSessionsAfterMutation,
      store,
      transferEditorInteractionLock,
      unlockEditorInteraction,
    ],
  )

  const openSession = useCallback(
    async (id: string) => {
      if (!documentReplacementIsAllowed()) return
      const intentGeneration = ++userIntentGenerationRef.current
      invalidatePendingSave()
      const intentIsCurrent = () =>
        userIntentGenerationRef.current === intentGeneration
      try {
        await loadSession(id, intentIsCurrent)
      } catch (error) {
        if (!intentIsCurrent()) return
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        setSaveState('error')
      }
    },
    [documentReplacementIsAllowed, invalidatePendingSave, loadSession],
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
    const initializationLifecycleGeneration = lifecycleGenerationRef.current
    const lifecycleIsCurrent = () =>
      mountedRef.current &&
      lifecycleGenerationRef.current === initializationLifecycleGeneration
    const initialEditor = editorRef.current
    const initialSnapshot = captureEditorStartupSnapshot(initialEditor)
    const initialUserIntentGeneration = userIntentGenerationRef.current
    const startupIntentIsCurrent = () =>
      userIntentGenerationRef.current === initialUserIntentGeneration
    let initializationListRequestId: number | null = null
    const initialize = async () => {
      try {
        const listRequestId = ++sessionListRequestRef.current
        initializationListRequestId = listRequestId
        const rows = await store.list()
        if (
          cancelled ||
          !startupIntentIsCurrent() ||
          listRequestId !== sessionListRequestRef.current ||
          !editorDocumentIdMatchesStateSnapshot(
            editorRef.current,
            initialSnapshot,
          )
        )
          return
        setSessions(rows)
        const urlSessionId = getSessionIdFromUrl()
        if (urlSessionId) {
          await loadSession(
            urlSessionId,
            () =>
              !cancelled &&
              startupIntentIsCurrent() &&
              editorCanAutoLoadStateSnapshot(
                editorRef.current,
                initialSnapshot,
              ),
          )
          return
        }

        const firstSessionId = rows[0]?.id

        if (firstSessionId) {
          if (
            !startupIntentIsCurrent() ||
            !editorCanAutoLoadStateSnapshot(editorRef.current, initialSnapshot)
          )
            return
          await loadSession(
            firstSessionId,
            () =>
              !cancelled &&
              startupIntentIsCurrent() &&
              editorCanAutoLoadStateSnapshot(
                editorRef.current,
                initialSnapshot,
              ),
          )
          return
        }

        try {
          const createState = editorRef.current.getState()
          if (
            !startupIntentIsCurrent() ||
            createState.doc.id !== initialSnapshot.state.doc.id
          )
            return
          const docToCreate = createState.doc
          let sampleCreate = sampleBootstrapCreateRef.current
          if (!sampleCreate) {
            sampleCreate = {
              promise: store.bootstrapFirstVisitSample(docToCreate),
              version: docToCreate.version,
            }
            sampleBootstrapCreateRef.current = sampleCreate
          }
          const bootstrap = await sampleCreate.promise
          if (
            cancelled ||
            !bootstrap.id ||
            !startupIntentIsCurrent() ||
            editorRef.current.getDoc().id !== docToCreate.id
          )
            return
          const sampleId = bootstrap.id

          if (sampleId !== docToCreate.id) {
            if (
              !startupIntentIsCurrent() ||
              !editorCanAutoLoadStateSnapshot(
                editorRef.current,
                initialSnapshot,
              )
            )
              return
            const opened = await loadSession(
              sampleId,
              () =>
                !cancelled &&
                startupIntentIsCurrent() &&
                editorCanAutoLoadStateSnapshot(
                  editorRef.current,
                  initialSnapshot,
                ),
            )
            if (opened && startupIntentIsCurrent()) await refreshSessions()
            return
          }

          let persistedVersion = sampleCreate.version
          const initialAttachState = initialEditor.getState()
          if (initialAttachState.doc.id !== docToCreate.id) return

          const persistBootstrapUntilCurrent = async (
            saveIsNotCancelled: () => boolean,
          ) => {
            while (true) {
              if (!lifecycleIsCurrent()) {
                throw new AppLifecycleCancelledError()
              }
              if (!saveIsNotCancelled()) {
                throw new EditorSaveCancelledError()
              }
              const attachState = initialEditor.getState()
              if (attachState.doc.id !== docToCreate.id) {
                throw new Error(
                  'Bootstrap editor document changed unexpectedly',
                )
              }
              if (attachState.doc.version === persistedVersion) {
                initialEditor.markSaved(persistedVersion)
                return {
                  doc: attachState.doc,
                  version: persistedVersion,
                }
              }

              const docToSave = attachState.doc
              const result = await store.save(docToSave, {
                expectedVersion: persistedVersion,
              })
              if (!lifecycleIsCurrent()) {
                throw new AppLifecycleCancelledError()
              }
              if (!saveIsNotCancelled()) {
                throw new EditorSaveCancelledError()
              }
              if (!result.saved) {
                throw new Error(
                  result.conflict
                    ? `Bootstrap save conflict: server is at version ${result.currentVersion ?? 'unknown'}`
                    : 'Bootstrap save failed',
                )
              }
              persistedVersion = result.currentVersion ?? docToSave.version
            }
          }

          const enqueueBootstrapCatchUp = () => {
            const cancellationGeneration =
              saveCancellationGenerationsRef.current.get(initialEditor) ?? 0
            const saveIsNotCancelled = () =>
              (saveCancellationGenerationsRef.current.get(initialEditor) ??
                0) === cancellationGeneration
            const pending = enqueueEditorTask(initialEditor, () =>
              persistBootstrapUntilCurrent(saveIsNotCancelled),
            )
            return pending.then(
              (result) => {
                if (
                  failedSaveTasks.current.get(sampleId)?.editor ===
                  initialEditor
                ) {
                  failedSaveTasks.current.delete(sampleId)
                }
                if (failedSaveEditors.current.get(sampleId) === initialEditor) {
                  failedSaveEditors.current.delete(sampleId)
                }
                return result
              },
              (error: unknown) => {
                if (
                  !(error instanceof AppLifecycleCancelledError) &&
                  !(error instanceof EditorSaveCancelledError) &&
                  lifecycleIsCurrent() &&
                  saveIsNotCancelled()
                ) {
                  failedSaveTasks.current.set(sampleId, {
                    editor: initialEditor,
                    retry: enqueueBootstrapCatchUp,
                  })
                }
                throw error
              },
            )
          }

          const catchUpSave = enqueueBootstrapCatchUp()

          setSessions((current) => [
            {
              id: sampleId,
              title: initialAttachState.doc.meta.title,
              updated: initialAttachState.doc.meta.updated,
              version: persistedVersion,
            },
            ...current.filter((session) => session.id !== sampleId),
          ])
          setActiveSessionId(sampleId)
          setSessionUrl(sampleId)
          setSaveState(
            initialAttachState.doc.version === persistedVersion
              ? 'saved'
              : 'saving',
          )

          try {
            const caughtUp = await catchUpSave
            if (cancelled || !startupIntentIsCurrent()) return
            setSessions((current) => [
              {
                id: sampleId,
                title: caughtUp.doc.meta.title,
                updated: caughtUp.doc.meta.updated,
                version: caughtUp.version,
              },
              ...current.filter((session) => session.id !== sampleId),
            ])
            setSaveState('saved')
          } catch (error) {
            if (cancelled || !startupIntentIsCurrent()) return
            const message =
              error instanceof Error ? error.message : String(error)
            setErrorMessage(message)
            setSaveState(
              message.toLowerCase().includes('conflict') ? 'conflict' : 'error',
            )
          }
        } catch {
          // Keep the local sample visible if D1 is unavailable on first load.
        }
      } catch (error) {
        if (
          cancelled ||
          !startupIntentIsCurrent() ||
          initializationListRequestId !== sessionListRequestRef.current
        )
          return
        const message = error instanceof Error ? error.message : String(error)
        sessionListErrorRef.current = message
        setErrorMessage(message)
        setSaveState('error')
      } finally {
        if (!cancelled) setInitializationPending(false)
      }
    }
    void initialize()
    return () => {
      cancelled = true
    }
  }, [enqueueEditorTask, loadSession, refreshSessions, store])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      lifecycleGenerationRef.current += 1
      userIntentGenerationRef.current += 1
      loadRequestRef.current += 1
      sessionListRequestRef.current += 1
      saveOperationGenerationsRef.current.clear()
      saveCancellationGenerationsRef.current.clear()
      latestSessionListRequestRef.current = null
      editorInteractionLockedRef.current = false
      editorInteractionLockOwnerRef.current = null
      for (const timerId of saveTimers.current.values()) {
        window.clearTimeout(timerId)
      }
      saveTimers.current.clear()
      saveQueues.current.clear()
      failedSaveEditors.current.clear()
      failedSaveTasks.current.clear()
      sessionListErrorRef.current = null
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
      if (editorInteractionLockedRef.current && isUndoRedoShortcut(event)) {
        consumeGlobalShortcut(event)
        return
      }
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
    const existingTimer = saveTimers.current.get(editor)
    if (existingTimer !== undefined) window.clearTimeout(existingTimer)
    const saveGeneration = nextSaveOperationGeneration(editor)
    const saveIsCurrent = () =>
      saveOperationGenerationsRef.current.get(editor) === saveGeneration &&
      editorRef.current === editor
    setSaveState('saving')
    const timerId = window.setTimeout(() => {
      saveTimers.current.delete(editor)
      void enqueueEditorSave(editor)
        .then(async () => {
          if (!saveIsCurrent()) return
          setSaveState('saved')
          await refreshSessions()
        })
        .catch((error: unknown) => {
          if (!saveIsCurrent()) return
          const message = error instanceof Error ? error.message : String(error)
          setErrorMessage(message)
          setSaveState(
            message.toLowerCase().includes('conflict') ? 'conflict' : 'error',
          )
        })
    }, 2000)
    saveTimers.current.set(editor, timerId)
  }, [
    activeSessionId,
    editor,
    enqueueEditorSave,
    nextSaveOperationGeneration,
    refreshSessions,
  ])

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
      if (editor.getState().editingNodeId !== null) {
        setErrorMessage('Finish editing before importing.')
        return
      }
      const sourceGuard = captureEditorSourceGuard(editorRef.current)
      const intentGeneration = ++userIntentGenerationRef.current
      invalidatePendingSave(sourceGuard.editor)
      const intentIsCurrent = () =>
        userIntentGenerationRef.current === intentGeneration
      try {
        setErrorMessage(null)
        const text = await file.text()
        if (!intentIsCurrent()) return
        const id = await store.importJson(text)
        await reconcileSessionsAfterMutation()
        if (!intentIsCurrent()) return
        await loadSession(id, intentIsCurrent, sourceGuard)
      } catch (error) {
        if (!intentIsCurrent()) return
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(`Import failed: ${message}`)
        setSaveState('error')
      }
    },
    [
      editor,
      invalidatePendingSave,
      loadSession,
      reconcileSessionsAfterMutation,
      store,
    ],
  )

  const saveActiveBeforeDocumentAction = useCallback(
    async (canApply: () => boolean = () => true): Promise<boolean> => {
      if (editor.getState().editingNodeId !== null) {
        setErrorMessage('Finish editing before using document actions.')
        return false
      }
      if (!activeSessionId) return true
      const saveGeneration = nextSaveOperationGeneration(editor)
      const pendingTimer = saveTimers.current.get(editor)
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer)
        saveTimers.current.delete(editor)
      }
      const saveIsCurrent = () =>
        canApply() &&
        saveOperationGenerationsRef.current.get(editor) === saveGeneration &&
        editorRef.current === editor
      try {
        await enqueueEditorSave(editor)
        if (!saveIsCurrent()) return false
        setSaveState('saved')
        await refreshSessions()
        return saveIsCurrent()
      } catch (error) {
        if (!saveIsCurrent()) return false
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        setSaveState(
          message.toLowerCase().includes('conflict') ? 'conflict' : 'error',
        )
        return false
      }
    },
    [
      activeSessionId,
      editor,
      enqueueEditorSave,
      nextSaveOperationGeneration,
      refreshSessions,
    ],
  )

  const renameSession = useCallback(
    async (session: MindmapDocMeta) => {
      const title = window.prompt('Rename map', session.title)?.trim()
      if (!title) return
      const sourceGuard = captureEditorSourceGuard(editorRef.current)
      const sourceIsCurrent = () =>
        editorSourceGuardIsCurrent(editorRef.current, sourceGuard)
      const locksEditor = session.id === activeSessionId
      const lockOwner = locksEditor ? lockEditorInteraction() : null
      if (locksEditor && lockOwner === null) return
      const intentGeneration = ++userIntentGenerationRef.current
      if (locksEditor) invalidatePendingSave(sourceGuard.editor)
      const intentIsCurrent = () =>
        userIntentGenerationRef.current === intentGeneration
      const operationCanContinue = () =>
        intentIsCurrent() && (!locksEditor || sourceIsCurrent())
      try {
        if (session.id === activeSessionId) {
          const saved = await saveActiveBeforeDocumentAction(
            () => intentIsCurrent() && sourceIsCurrent(),
          )
          if (!saved || !intentIsCurrent()) return
        } else {
          await flushPendingSavesForDocument(session.id)
          if (!intentIsCurrent()) return
        }
        const renamed = await store.rename(
          session.id,
          title,
          operationCanContinue,
        )
        if (!renamed) return
        await reconcileSessionsAfterMutation()
        if (!intentIsCurrent()) return
        if (session.id === activeSessionId) {
          await loadSession(session.id, intentIsCurrent, sourceGuard)
        }
      } catch (error) {
        if (!intentIsCurrent()) return
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        setSaveState('error')
      } finally {
        if (lockOwner !== null) unlockEditorInteraction(lockOwner)
      }
    },
    [
      activeSessionId,
      flushPendingSavesForDocument,
      invalidatePendingSave,
      loadSession,
      lockEditorInteraction,
      reconcileSessionsAfterMutation,
      saveActiveBeforeDocumentAction,
      store,
      unlockEditorInteraction,
    ],
  )

  const duplicateSession = useCallback(
    async (id: string) => {
      if (!documentReplacementIsAllowed()) return
      const sourceGuard = captureEditorSourceGuard(editorRef.current)
      const sourceIsCurrent = () =>
        editorSourceGuardIsCurrent(editorRef.current, sourceGuard)
      const lockOwner = lockEditorInteraction()
      if (lockOwner === null) return
      const intentGeneration = ++userIntentGenerationRef.current
      invalidatePendingSave(sourceGuard.editor)
      const intentIsCurrent = () =>
        userIntentGenerationRef.current === intentGeneration
      const operationCanContinue = () => intentIsCurrent() && sourceIsCurrent()
      try {
        if (id === activeSessionId) {
          const saved = await saveActiveBeforeDocumentAction(
            () => intentIsCurrent() && sourceIsCurrent(),
          )
          if (!saved || !intentIsCurrent()) return
        } else {
          await flushPendingSavesForDocument(id)
          if (!intentIsCurrent()) return
        }
        const copyId = await store.duplicate(id, operationCanContinue)
        if (!copyId) return
        await reconcileSessionsAfterMutation()
        if (!intentIsCurrent()) return
        await loadSession(copyId, intentIsCurrent, sourceGuard)
      } catch (error) {
        if (!intentIsCurrent()) return
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
        setSaveState('error')
      } finally {
        unlockEditorInteraction(lockOwner)
      }
    },
    [
      activeSessionId,
      documentReplacementIsAllowed,
      flushPendingSavesForDocument,
      invalidatePendingSave,
      loadSession,
      lockEditorInteraction,
      reconcileSessionsAfterMutation,
      saveActiveBeforeDocumentAction,
      store,
      unlockEditorInteraction,
    ],
  )

  const deleteSession = useCallback(
    async (id: string) => {
      if (!documentReplacementIsAllowed()) return
      const confirmed = window.confirm('Delete this map from D1?')
      if (!confirmed) return
      const sourceEditor = editorRef.current
      const sourceGuard = captureEditorSourceGuard(sourceEditor)
      const deletingActiveSession = id === activeSessionId
      const intentGeneration = ++userIntentGenerationRef.current
      const intentIsCurrent = () =>
        userIntentGenerationRef.current === intentGeneration
      try {
        await store.delete(id)
        cancelPendingSavesForDocument(id)
        const detachedDeletedDocument =
          mountedRef.current && activeSessionIdRef.current === id
        if (detachedDeletedDocument) {
          activeSessionIdRef.current = null
          setActiveSessionId(null)
          setSessionUrl(null)
        }
        const authoritativeRows = await reconcileSessionsAfterMutation()
        cancelPendingSavesForDocument(id)
        if (!mountedRef.current) return
        if (!intentIsCurrent()) {
          if (detachedDeletedDocument) {
            setSaveState('idle')
            setErrorMessage(
              'Map deleted from D1; local changes were kept in the editor.',
            )
          }
          return
        }
        const remaining =
          authoritativeRows ?? sessions.filter((session) => session.id !== id)
        if (!authoritativeRows) setSessions(remaining)
        if (deletingActiveSession) {
          const sourceChanged = !editorSourceGuardIsCurrent(
            editorRef.current,
            sourceGuard,
          )
          if (sourceChanged) {
            setSaveState('idle')
            setErrorMessage(
              'Map deleted from D1; local changes were kept in the editor.',
            )
            return
          }
          const nextId = remaining[0]?.id ?? null
          if (nextId) {
            try {
              const opened = await loadSession(
                nextId,
                intentIsCurrent,
                sourceGuard,
              )
              if (opened || !intentIsCurrent()) return
            } catch (error) {
              if (!intentIsCurrent()) return
              const message =
                error instanceof Error ? error.message : String(error)
              setErrorMessage(message)
            }
          }
          if (!editorSourceGuardIsCurrent(editorRef.current, sourceGuard)) {
            setSaveState('idle')
            setErrorMessage(
              'Map deleted from D1; local changes were kept in the editor.',
            )
            return
          }
          setEditor(createEditor(createBlankDoc(), store))
          setSaveState('idle')
        }
      } catch (error) {
        if (!intentIsCurrent()) return
        const message = error instanceof Error ? error.message : String(error)
        setErrorMessage(message)
      }
    },
    [
      activeSessionId,
      cancelPendingSavesForDocument,
      documentReplacementIsAllowed,
      loadSession,
      reconcileSessionsAfterMutation,
      sessions,
      store,
    ],
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

      <main
        className="workspace"
        inert={editorInteractionLocked ? true : undefined}
        aria-busy={editorInteractionLocked}
      >
        <aside className="sidebar" aria-label="Saved maps">
          <div className="sidebar-header">
            <h2>Saved maps</h2>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={initializationPending}
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
                      onClick={() => void openSession(session.id)}
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
