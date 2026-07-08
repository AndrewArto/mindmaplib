import { describe, expect, it } from 'vitest'
import { createDoc, MindmapEditor } from '@mindmaplib/core'
import { deleteSelectedNodeFromToolbar } from '../src/editorActions'

describe('toolbar editor actions', () => {
  it('deletes selected nodes in auto-layout as a single undo step', () => {
    const editor = new MindmapEditor(createDoc('Undo map'))
    editor.setLayout('tree-horizontal')
    const rootId = editor.getDoc().rootId
    const childId = editor.addChild(rootId)
    const grandchildId = editor.addChild(childId)
    editor.setLayout('tree-horizontal')
    editor.select(childId)

    const beforeDeleteVersion = editor.getDoc().version
    expect(deleteSelectedNodeFromToolbar(editor)).toBe(true)
    expect(editor.getDoc().nodes[childId]).toBeUndefined()
    expect(editor.getDoc().nodes[grandchildId]).toBeUndefined()

    editor.undo()

    expect(editor.getDoc().version).toBeGreaterThan(beforeDeleteVersion)
    expect(editor.getDoc().nodes[childId]).toBeDefined()
    expect(editor.getDoc().nodes[grandchildId]).toBeDefined()
  })

  it('refuses toolbar delete while a node is being edited', () => {
    const editor = new MindmapEditor(createDoc('Editing map'))
    const rootId = editor.getDoc().rootId
    const childId = editor.addChild(rootId)
    editor.select(childId)
    editor.startEditing(childId)

    expect(deleteSelectedNodeFromToolbar(editor)).toBe(false)
    expect(editor.getDoc().nodes[childId]).toBeDefined()
    expect(editor.getState().editingNodeId).toBe(childId)
  })
})
