import { describe, it, expect } from 'vitest'
import { InMemoryStore } from '../src/store.js'
import { createDoc, addNode } from '../src/document.js'

describe('InMemoryStore', () => {
  it('save and load round-trip', async () => {
    const store = new InMemoryStore()
    const doc = createDoc('S')
    await store.save(doc)
    const loaded = await store.load(doc.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.meta.title).toBe('S')
  })

  it('load returns null for unknown id', async () => {
    const store = new InMemoryStore()
    expect(await store.load('nope')).toBeNull()
  })

  it('list returns metadata', async () => {
    const store = new InMemoryStore()
    await store.save(createDoc('A'))
    await store.save(createDoc('B'))
    const list = await store.list()
    expect(list).toHaveLength(2)
    expect(list.map((m) => m.title).sort()).toEqual(['A', 'B'])
  })

  it('delete removes a document', async () => {
    const store = new InMemoryStore()
    const doc = createDoc('D')
    await store.save(doc)
    await store.delete(doc.id)
    expect(await store.load(doc.id)).toBeNull()
  })

  it('reports conflict on expectedVersion mismatch', async () => {
    const store = new InMemoryStore()
    const doc = createDoc('C')
    await store.save(doc)
    // advance the doc externally
    const updated = addNode(doc, doc.rootId)
    // save with stale expectedVersion
    const result = await store.save(updated, { expectedVersion: doc.version })
    // store has doc.version (0); updated.version is 1; expectedVersion 0 matches store
    expect(result.saved).toBe(true)
  })

  it('returns conflict when expectedVersion does not match stored', async () => {
    const store = new InMemoryStore()
    const doc = createDoc('C')
    await store.save(doc)
    const updated = addNode(doc, doc.rootId)
    await store.save(updated) // store now at version 1
    // try to save with expectedVersion 0 but store is at 1
    const result = await store.save(doc, { expectedVersion: 0 })
    expect(result.conflict).toBe(true)
    expect(result.saved).toBe(false)
  })
})
