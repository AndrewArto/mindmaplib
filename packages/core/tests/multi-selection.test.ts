import { describe, expect, it } from 'vitest'
import { MindmapEditor, createDoc } from '../src/index.js'
import { InMemoryStore } from '../src/store.js'

function editorWithTwoChildren() {
  const editor = new MindmapEditor(createDoc('Multi'))
  const root = editor.getDoc().rootId
  const first = editor.addChild(root)
  const second = editor.addChild(root)
  editor.setLayout('tree-horizontal')
  return { editor, root, first, second }
}

describe('MindmapEditor multi-selection', () => {
  it('keeps select backward compatible while exposing an ordered selection set', () => {
    const { editor, first, second } = editorWithTwoChildren()

    editor.setSelection([first, 'missing', second, first])

    expect(editor.getState().selectedNodeIds).toEqual([first, second])
    expect(editor.getState().selectedNodeId).toBe(first)

    editor.select(second)
    expect(editor.getState().selectedNodeIds).toEqual([second])
    expect(editor.getState().selectedNodeId).toBe(second)

    editor.select(null)
    expect(editor.getState().selectedNodeIds).toEqual([])
    expect(editor.getState().selectedNodeId).toBeNull()
  })

  it('prunes deleted selections and repairs the primary node', () => {
    const { editor, first, second } = editorWithTwoChildren()
    const descendant = editor.addChild(first)
    editor.setSelection([first, descendant, second])

    editor.deleteNode(first)

    expect(editor.getState().selectedNodeIds).toEqual([second])
    expect(editor.getState().selectedNodeId).toBe(second)
  })

  it('returns a defensive selection snapshot', () => {
    const { editor, first, second } = editorWithTwoChildren()
    editor.setSelection([first, second])

    const snapshot = editor.getState().selectedNodeIds as string[]
    snapshot.length = 0

    expect(editor.getState().selectedNodeIds).toEqual([first, second])
  })
})

describe('MindmapEditor multi-node positioning', () => {
  it('previews a position batch atomically with one notification and no revision', () => {
    const { editor, first, second } = editorWithTwoChildren()
    const version = editor.getDoc().version
    let notifications = 0
    editor.subscribe(() => notifications++)

    editor.setPositionsDirect([
      { nodeId: first, position: { x: 300, y: 120 } },
      { nodeId: second, position: { x: 300, y: 240 } },
    ])

    expect(editor.getDoc().version).toBe(version)
    expect(editor.getDoc().nodes[first]).toMatchObject({
      position: { x: 300, y: 120 },
      manualPosition: true,
    })
    expect(editor.getDoc().nodes[second]).toMatchObject({
      position: { x: 300, y: 240 },
      manualPosition: true,
    })
    expect(notifications).toBe(1)
  })

  it('rejects an invalid preview batch without publishing a partial move', () => {
    const { editor, first } = editorWithTwoChildren()
    const before = editor.getDoc()
    let notifications = 0
    editor.subscribe(() => notifications++)

    expect(() =>
      editor.setPositionsDirect([
        { nodeId: first, position: { x: 400, y: 200 } },
        { nodeId: 'missing', position: { x: 500, y: 200 } },
      ]),
    ).toThrow()

    expect(editor.getDoc()).toBe(before)
    expect(notifications).toBe(0)
  })

  it('commits every previewed node in one transaction with one undo and redo', () => {
    const { editor, first, second } = editorWithTwoChildren()
    const beforeFirst = { ...editor.getDoc().nodes[first]!.position! }
    const beforeSecond = { ...editor.getDoc().nodes[second]!.position! }
    const version = editor.getDoc().version
    const updates = [
      { nodeId: first, position: { x: 360, y: 160 } },
      { nodeId: second, position: { x: 360, y: 280 } },
    ]

    editor.setPositionsDirect(updates)
    editor.commitPositions(updates)

    expect(editor.getDoc().version).toBe(version + 1)
    expect(editor.getLastTransaction()?.ops).toEqual([
      { type: 'setPosition', ...updates[0] },
      { type: 'setPosition', ...updates[1] },
    ])

    editor.undo()
    expect(editor.getDoc().nodes[first]!.position).toEqual(beforeFirst)
    expect(editor.getDoc().nodes[second]!.position).toEqual(beforeSecond)

    editor.redo()
    expect(editor.getDoc().nodes[first]!.position).toEqual(updates[0]!.position)
    expect(editor.getDoc().nodes[second]!.position).toEqual(
      updates[1]!.position,
    )
  })

  it('rejects a commit that omits part of the active preview batch', () => {
    const { editor, first, second } = editorWithTwoChildren()
    const beforeFirst = { ...editor.getDoc().nodes[first]!.position! }
    const beforeSecond = { ...editor.getDoc().nodes[second]!.position! }
    const previewId = editor.setPositionsDirect([
      { nodeId: first, position: { x: 500, y: 100 } },
      { nodeId: second, position: { x: 500, y: 200 } },
    ])

    expect(() =>
      editor.commitPositions(
        [{ nodeId: first, position: { x: 500, y: 100 } }],
        previewId,
      ),
    ).toThrow()

    editor.cancelPositionPreview(previewId)
    expect(editor.getDoc().nodes[first]!.position).toEqual(beforeFirst)
    expect(editor.getDoc().nodes[second]!.position).toEqual(beforeSecond)
  })

  it('invalidates a preview before an interleaved mutation and rejects its stale token', () => {
    const { editor, root, first } = editorWithTwoChildren()
    const beforeFirst = { ...editor.getDoc().nodes[first]!.position! }
    const previewId = editor.setPositionsDirect([
      { nodeId: first, position: { x: 600, y: 300 } },
    ])

    const added = editor.addChild(root)

    expect(editor.getDoc().nodes[first]!.position).toEqual(beforeFirst)
    expect(editor.getDoc().nodes[added]).toBeDefined()
    expect(() =>
      editor.commitPositions(
        [{ nodeId: first, position: { x: 600, y: 300 } }],
        previewId,
      ),
    ).toThrow()

    editor.undo()
    expect(editor.getDoc().nodes[added]).toBeUndefined()
    expect(editor.getDoc().nodes[first]!.position).toEqual(beforeFirst)
  })

  it('keeps an active preview intact when an interleaved transaction fails', () => {
    const { editor, first } = editorWithTwoChildren()
    const before = { ...editor.getDoc().nodes[first]!.position! }
    const preview = { x: before.x + 90, y: before.y + 50 }
    const previewId = editor.setPositionsDirect([
      { nodeId: first, position: preview },
    ])

    expect(() => editor.deleteNode('missing-node')).toThrow()
    expect(editor.getDoc().nodes[first]!.position).toEqual(preview)

    editor.cancelPositionPreview(previewId)
    expect(editor.getDoc().nodes[first]!.position).toEqual(before)
  })

  it('refuses to persist a transient position preview', async () => {
    const doc = createDoc('Persisted')
    const store = new InMemoryStore()
    await store.save(doc)
    const editor = new MindmapEditor(doc, { store })
    const previewId = editor.setPositionsDirect([
      { nodeId: doc.rootId, position: { x: 120, y: 60 } },
    ])

    await expect(editor.save()).rejects.toThrow(
      'Cannot save while a position preview is active',
    )

    editor.cancelPositionPreview(previewId)
    expect((await store.load(doc.id))!.nodes[doc.rootId]!.position).toBeNull()
  })

  it('undo cancels an uncommitted preview even when history is empty', () => {
    const editor = new MindmapEditor(createDoc('No history'))
    const root = editor.getDoc().rootId
    let notifications = 0
    editor.subscribe(() => {
      notifications += 1
    })

    editor.setPositionDirect(root, { x: 90, y: 40 })
    editor.undo()

    expect(editor.getDoc().nodes[root]!.position).toBeNull()
    expect(notifications).toBe(2)
  })

  it('treats empty position batches as no-ops', () => {
    const { editor } = editorWithTwoChildren()
    const before = editor.getDoc()

    editor.setPositionsDirect([])
    editor.commitPositions([])

    expect(editor.getDoc()).toBe(before)
  })
})
