import type {
  LayoutMode,
  MindmapEditor,
  NodeContent,
  TransactionOp,
} from '@mindmaplib/core'
import {
  applyOp,
  buildTransaction,
  computeLayoutOps,
  createAddNodeOp,
  createDeleteNodeOp,
} from '@mindmaplib/core'

function createNodeId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `node_${random}`
}

function appendLayoutOps(
  editor: MindmapEditor,
  ops: TransactionOp[],
): TransactionOp[] {
  const state = editor.getState()
  if (state.layoutMode === 'free-float') return ops

  let nextDoc = state.doc
  for (const op of ops) {
    nextDoc = applyOp(nextDoc, op)
  }

  return [
    ...ops,
    ...computeLayoutOps(nextDoc, state.layoutMode as LayoutMode, {
      nodeMeasures: editor.getNodeMeasures(),
    }),
  ]
}

function applyToolbarTransaction(
  editor: MindmapEditor,
  ops: TransactionOp[],
): void {
  const state = editor.getState()
  editor.apply(buildTransaction(state.doc, appendLayoutOps(editor, ops)))
}

export function addChildNodeFromToolbar(
  editor: MindmapEditor,
  content?: NodeContent,
): string | null {
  const state = editor.getState()
  const parentId = state.selectedNodeId ?? state.doc.rootId
  if (!state.doc.nodes[parentId]) return null

  const nodeId = createNodeId()
  applyToolbarTransaction(editor, [
    createAddNodeOp(parentId, nodeId, { content }),
  ])
  editor.select(nodeId)
  editor.startEditing(nodeId)
  return nodeId
}

export function addSiblingNodeFromToolbar(
  editor: MindmapEditor,
  content?: NodeContent,
): string | null {
  const state = editor.getState()
  const selectedId = state.selectedNodeId ?? state.doc.rootId
  const selected = state.doc.nodes[selectedId]
  if (!selected) return null
  if (selected.parentId === null)
    return addChildNodeFromToolbar(editor, content)

  const nodeId = createNodeId()
  applyToolbarTransaction(editor, [
    createAddNodeOp(selected.parentId, nodeId, {
      insertAfter: selectedId,
      content,
    }),
  ])
  editor.select(nodeId)
  editor.startEditing(nodeId)
  return nodeId
}

export function deleteSelectedNodeFromToolbar(editor: MindmapEditor): boolean {
  const state = editor.getState()
  if (state.editingNodeId !== null) return false

  const selectedId = state.selectedNodeId
  if (!selectedId) return false
  const selected = state.doc.nodes[selectedId]
  if (!selected || selected.parentId === null) return false

  const parentId = selected.parentId
  applyToolbarTransaction(editor, [createDeleteNodeOp(selectedId)])
  editor.select(parentId)
  return true
}
