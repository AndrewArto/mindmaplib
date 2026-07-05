// mindmaplib demo — bootstrap, editor wiring, keyboard handler.
// Connects @mindmaplib/core MindmapEditor to the Canvas renderer and D1Store.

import './style.css'
import {
  MindmapEditor,
  type EditorState,
  type MindmapDoc,
  type MindmapDocMeta,
} from '@mindmaplib/core'
import { Canvas } from './canvas'
import { D1Store } from './d1store'
import { createSampleDoc } from './sample'
import { textToContent } from './content'

// --- DOM bootstrap ---

const app = document.getElementById('app')!

// Toolbar
const toolbar = document.createElement('div')
toolbar.className = 'toolbar'
app.appendChild(toolbar)

const titleInput = document.createElement('input')
titleInput.className = 'title-input'
titleInput.type = 'text'
titleInput.value = 'Untitled Mindmap'

const btnNew = mkButton('New', 'btn-primary')
const btnUndo = mkButton('↶ Undo')
const btnRedo = mkButton('↷ Redo')
const btnFit = mkButton('⊞ Fit')

const layoutGroup = document.createElement('div')
layoutGroup.className = 'toolbar-group'
const btnTreeH = mkButton('↦ Tree H')
const btnTreeV = mkButton('↧ Tree V')
const btnRadial = mkButton('⊙ Radial')
layoutGroup.append(btnTreeH, btnTreeV, btnRadial)

const saveIndicator = document.createElement('span')
saveIndicator.className = 'save-indicator dirty'
saveIndicator.textContent = '—'

const div1 = mkDivider()
const div2 = mkDivider()

toolbar.append(
  btnNew,
  div1,
  titleInput,
  div2,
  btnUndo,
  btnRedo,
  mkDivider(),
  layoutGroup,
  mkDivider(),
  btnFit,
  saveIndicator,
)

// Canvas
const canvasContainer = document.createElement('div')
canvasContainer.className = 'canvas-container'
app.appendChild(canvasContainer)

const canvas = new Canvas(canvasContainer)

// Hints
const hints = document.createElement('div')
hints.className = 'hints'
hints.innerHTML = `
  <kbd>Tab</kbd> child &nbsp;
  <kbd>Enter</kbd> sibling &nbsp;
  <kbd>Del</kbd> delete &nbsp;
  <kbd>Space</kbd> edit &nbsp;
  <kbd>⌘Z</kbd> undo &nbsp;
  <kbd>⌘⇧Z</kbd> redo &nbsp;
  <kbd>Dbl-click</kbd> edit &nbsp;
  <kbd>Scroll</kbd> zoom
`
canvasContainer.appendChild(hints)

// --- State ---

const store = new D1Store()
let editor: MindmapEditor
let currentSessionId: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let isSessionList = false

// --- Helpers ---

function mkButton(label: string, extraClass = ''): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'btn ' + extraClass
  btn.textContent = label
  return btn
}

function mkDivider(): HTMLElement {
  const d = document.createElement('div')
  d.className = 'toolbar-divider'
  return d
}

function getUrlId(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('id')
}

function setUrlId(id: string | null): void {
  const url = new URL(window.location.href)
  if (id) {
    url.searchParams.set('id', id)
  } else {
    url.searchParams.delete('id')
  }
  window.history.replaceState(null, '', url.toString())
}

// --- Editor setup ---

function initEditor(doc: MindmapDoc): void {
  if (editor) editor.destroy()
  editor = new MindmapEditor(doc, { store })

  // Default layout
  editor.setLayout('tree-horizontal')

  // Subscribe to state changes
  editor.subscribe((state) => onStateChange(state))

  // Canvas callbacks
  canvas.onSelectNode = (id) => {
    if (id === null) {
      editor.select(null)
    } else {
      editor.select(id)
    }
  }

  canvas.onEditNode = (id) => {
    if (id === '') {
      // Stop editing — save text
      if (editor.getState().editingNodeId) {
        const editingId = editor.getState().editingNodeId!
        const text = canvas.getEditingText(editingId)
        if (text !== null) {
          editor.updateContent(editingId, textToContent(text))
        }
        editor.stopEditing()
      }
    } else {
      editor.startEditing(id)
    }
  }

  canvas.onViewportChange = (vp) => {
    editor.setViewport(vp)
  }

  // Initial render
  editor.fitToScreen()
  onStateChange(editor.getState())
}

function onStateChange(state: EditorState): void {
  canvas.render(state)

  // Title
  titleInput.value = state.doc.meta.title

  // Toolbar button states
  btnUndo.disabled = !editor.canUndo()
  btnRedo.disabled = !editor.canRedo()

  // Active layout button
  btnTreeH.classList.toggle('active', state.layoutMode === 'tree-horizontal')
  btnTreeV.classList.toggle('active', state.layoutMode === 'tree-vertical')
  btnRadial.classList.toggle('active', state.layoutMode === 'radial')

  // Save indicator
  if (editor.isDirty()) {
    saveIndicator.textContent = '●'
    saveIndicator.className = 'save-indicator dirty'
    scheduleSave()
  }
}

// --- Persistence ---

function scheduleSave(): void {
  if (!currentSessionId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveIndicator.textContent = 'Saving…'
    saveIndicator.className = 'save-indicator saving'
    try {
      await editor.save()
      saveIndicator.textContent = 'Saved'
      saveIndicator.className = 'save-indicator saved'
    } catch {
      saveIndicator.textContent = 'Error'
      saveIndicator.className = 'save-indicator'
    }
  }, 2000)
}

async function newSession(): Promise<void> {
  const doc = createSampleDoc()
  const id = await store.create(doc)
  currentSessionId = id
  setUrlId(id)
  initEditor(doc)
  // Set the doc id so save() targets the right row
  // We need to set it on the doc — create a new editor with the right doc
  const docWithId = { ...doc, id }
  initEditor(docWithId)
}

async function loadSession(id: string): Promise<void> {
  const doc = await store.load(id)
  if (!doc) {
    // Session not found — show list
    showSessionList()
    return
  }
  currentSessionId = id
  initEditor(doc)
}

async function deleteSession(id: string): Promise<void> {
  await store.delete(id)
}

// --- Session list UI ---

async function showSessionList(): Promise<void> {
  isSessionList = true

  // Clear canvas
  canvasContainer.innerHTML = ''
  const overlay = document.createElement('div')
  overlay.className = 'session-list'
  overlay.innerHTML = '<h2>Mindmap Sessions</h2>'

  const list = document.createElement('ul')
  const sessions: MindmapDocMeta[] = await store.list()

  if (sessions.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'session-empty'
    empty.textContent = 'No sessions yet. Click "New" to create one.'
    overlay.appendChild(empty)
  } else {
    for (const s of sessions) {
      const li = document.createElement('li')

      const info = document.createElement('div')
      const title = document.createElement('div')
      title.className = 'session-title'
      title.textContent = s.title || 'Untitled'
      const meta = document.createElement('div')
      meta.className = 'session-meta'
      meta.textContent = `${new Date(s.updated).toLocaleString()} · v${s.version}`
      info.append(title, meta)

      const del = document.createElement('button')
      del.className = 'session-delete'
      del.textContent = '×'
      del.title = 'Delete session'
      del.addEventListener('click', async (e) => {
        e.stopPropagation()
        await deleteSession(s.id)
        li.remove()
      })

      li.append(info, del)
      li.addEventListener('click', () => {
        setUrlId(s.id)
        currentSessionId = s.id
        canvasContainer.innerHTML = ''
        const newCanvasEl = document.createElement('div')
        newCanvasEl.className = 'canvas-container'
        app.insertBefore(newCanvasEl, canvasContainer)
        canvasContainer.remove()
        // reinit — simpler: reload page
        window.location.search = `?id=${s.id}`
      })

      list.appendChild(li)
    }
  }

  overlay.appendChild(list)
  canvasContainer.appendChild(overlay)
}

// --- Keyboard handler ---

window.addEventListener('keydown', (e) => {
  if (isSessionList) return

  const state = editor.getState()
  const isEditing = state.editingNodeId !== null

  // Allow Escape/Enter to exit editing (handled by textarea keydown)
  if (isEditing) return

  // Don't interfere with title input
  if (
    e.target instanceof HTMLInputElement &&
    e.target.classList.contains('title-input')
  ) {
    if (e.key === 'Enter') {
      e.target.blur()
    }
    return
  }

  const sel = state.selectedNodeId
  const mod = e.metaKey || e.ctrlKey

  // Undo / redo
  if (mod && e.key === 'z') {
    e.preventDefault()
    if (e.shiftKey) editor.redo()
    else editor.undo()
    return
  }

  if (!sel) return
  const doc = editor.getDoc()
  const node = doc.nodes[sel]
  if (!node) return

  switch (e.key) {
    case 'Tab': {
      e.preventDefault()
      editor.addChild(sel)
      break
    }
    case 'Enter': {
      e.preventDefault()
      if (node.parentId === null) {
        editor.addChild(sel)
      } else {
        editor.addSibling(sel)
      }
      break
    }
    case 'Delete':
    case 'Backspace': {
      if (node.parentId !== null) {
        e.preventDefault()
        editor.deleteNode(sel)
      }
      break
    }
    case ' ':
    case 'F2': {
      e.preventDefault()
      editor.startEditing(sel)
      break
    }
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault()
      navigate(state, e.key)
      break
    }
  }
})

function navigate(state: EditorState, key: string): void {
  const sel = state.selectedNodeId
  if (!sel) return
  const doc = state.doc

  const node = doc.nodes[sel]
  if (!node) return

  switch (key) {
    case 'ArrowLeft': {
      // Parent
      if (node.parentId) editor.select(node.parentId)
      break
    }
    case 'ArrowRight': {
      // First child
      if (node.childOrder.length > 0) editor.select(node.childOrder[0]!)
      break
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      // Sibling navigation
      if (!node.parentId) break
      const parent = doc.nodes[node.parentId]
      if (!parent) break
      const idx = parent.childOrder.indexOf(sel)
      if (key === 'ArrowUp' && idx > 0) {
        editor.select(parent.childOrder[idx - 1]!)
      } else if (key === 'ArrowDown' && idx < parent.childOrder.length - 1) {
        editor.select(parent.childOrder[idx + 1]!)
      }
      break
    }
  }
}

// --- Toolbar button handlers ---

btnNew.addEventListener('click', () => {
  newSession()
})

btnUndo.addEventListener('click', () => editor.undo())
btnRedo.addEventListener('click', () => editor.redo())
btnFit.addEventListener('click', () => editor.fitToScreen())

btnTreeH.addEventListener('click', () => editor.setLayout('tree-horizontal'))
btnTreeV.addEventListener('click', () => editor.setLayout('tree-vertical'))
btnRadial.addEventListener('click', () => editor.setLayout('radial'))

titleInput.addEventListener('change', () => {
  // Title is cosmetic on the toolbar — meta.title is set at doc creation.
  // The save indicator reflects unsaved content changes, not title edits.
  scheduleSave()
})

// --- Bootstrap -----

async function boot(): Promise<void> {
  const id = getUrlId()
  if (id) {
    await loadSession(id)
  } else {
    // No session — create one fresh or show list if sessions exist
    const sessions = await store.list()
    if (sessions.length > 0) {
      await showSessionList()
    } else {
      await newSession()
    }
  }
}

void boot()
