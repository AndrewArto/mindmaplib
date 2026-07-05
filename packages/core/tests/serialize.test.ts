import { describe, it, expect } from 'vitest'
import { serialize, deserialize, SCHEMA_VERSION } from '../src/serialize.js'
import { createDoc, addNode } from '../src/document.js'
import { MindmapError } from '../src/errors.js'
import type { MindmapDoc, MindmapNode } from '../src/types.js'

describe('serialize / deserialize', () => {
  it('round-trips a document', () => {
    const simple = createDoc('RoundTrip')
    const json = serialize(simple)
    const back = deserialize(json)
    expect(back.rootId).toBe(simple.rootId)
    expect(back.version).toBe(simple.version)
    expect(back.meta.title).toBe('RoundTrip')
  })

  it('round-trips a doc with children', () => {
    const base = createDoc('Kids')
    const withChild = addNode(base, base.rootId)
    const json = serialize(withChild)
    const back = deserialize(json)
    expect(Object.keys(back.nodes)).toHaveLength(2)
    expect(back.nodes[back.rootId]!.childOrder).toEqual(
      withChild.nodes[withChild.rootId]!.childOrder,
    )
  })

  it('includes schemaVersion in the wrapper', () => {
    const json = serialize(createDoc('S'))
    const wrapper = JSON.parse(json) as { schemaVersion: number }
    expect(wrapper.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('throws MALFORMED_JSON on invalid JSON', () => {
    expect(() => deserialize('{not json')).toThrow(MindmapError)
    try {
      deserialize('{not json')
    } catch (e) {
      expect((e as MindmapError).code).toBe('MALFORMED_JSON')
    }
  })

  it('throws SCHEMA_MISMATCH on unknown schemaVersion', () => {
    const future = JSON.stringify({ schemaVersion: 999, doc: createDoc('F') })
    expect(() => deserialize(future)).toThrow(MindmapError)
    try {
      deserialize(future)
    } catch (e) {
      expect((e as MindmapError).code).toBe('SCHEMA_MISMATCH')
    }
  })

  it('throws SCHEMA_MISMATCH on missing schemaVersion', () => {
    const noVer = JSON.stringify({ doc: createDoc('NV') })
    expect(() => deserialize(noVer)).toThrow(MindmapError)
  })

  it('throws SCHEMA_MISMATCH on schemaVersion 0 (P2 r3)', () => {
    const v0 = JSON.stringify({ schemaVersion: 0, doc: createDoc('Z') })
    expect(() => deserialize(v0)).toThrow(MindmapError)
    try {
      deserialize(v0)
    } catch (e) {
      expect((e as MindmapError).code).toBe('SCHEMA_MISMATCH')
    }
  })

  it('throws MALFORMED_JSON on non-integer version (P2 r3)', () => {
    const doc = createDoc('V')
    const json = serialize(doc)
    const wrapper = JSON.parse(json)
    wrapper.doc.version = 'not-a-number'
    expect(() => deserialize(JSON.stringify(wrapper))).toThrow(MindmapError)
    try {
      deserialize(JSON.stringify(wrapper))
    } catch (e) {
      expect((e as MindmapError).code).toBe('MALFORMED_JSON')
    }
  })

  it('throws on null node entries (P2 r4)', () => {
    const doc = createDoc('N')
    const json = serialize(doc)
    const wrapper = JSON.parse(json)
    wrapper.doc.nodes[doc.rootId] = null
    expect(() => deserialize(JSON.stringify(wrapper))).toThrow(MindmapError)
    try {
      deserialize(JSON.stringify(wrapper))
    } catch (e) {
      expect((e as MindmapError).code).toBe('MALFORMED_JSON')
    }
  })

  it('strips unknown fields (forward-compatible)', () => {
    const doc = createDoc('Strip')
    const json = serialize(doc)
    const wrapper = JSON.parse(json) as {
      doc: MindmapDoc & { bogus?: unknown }
    }
    wrapper.doc.bogus = 'extra'
    wrapper.doc.nodes[doc.rootId] = {
      ...(wrapper.doc.nodes[doc.rootId] as MindmapNode),
      // @ts-expect-error adding an unknown field on purpose
      unknownField: 42,
    }
    const back = deserialize(JSON.stringify(wrapper))
    expect(
      (back.nodes[doc.rootId] as unknown as Record<string, unknown>)
        .unknownField,
    ).toBeUndefined()
    expect((back as unknown as Record<string, unknown>).bogus).toBeUndefined()
  })
})
