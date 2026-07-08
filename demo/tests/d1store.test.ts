import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDoc, deserialize } from '@mindmaplib/core'
import { D1Store, exportDocumentJson } from '../src/d1store'

type FetchCall = Parameters<typeof fetch>

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn(async (...args: FetchCall) => {
    const url = String(args[0])
    const init = args[1] as RequestInit | undefined
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('D1Store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates sessions through the D1 API using the document id as the session id', async () => {
    const doc = createDoc('D1 map')
    const fetchMock = mockFetch(async (url, init) => {
      expect(url).toBe('/api/sessions')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body)) as { doc: string }
      expect(deserialize(body.doc).id).toBe(doc.id)
      return jsonResponse({ id: doc.id })
    })

    await expect(new D1Store().create(doc)).resolves.toBe(doc.id)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a non-JSON dev-server fallback as unavailable D1 instead of throwing', async () => {
    mockFetch(
      () =>
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    )

    await expect(new D1Store().list()).resolves.toEqual([])
  })

  it('renames a session by loading the document and saving a bumped title/version', async () => {
    const doc = createDoc('Before')
    mockFetch(async (url, init) => {
      if (url === `/api/sessions/${doc.id}` && !init) {
        return jsonResponse({ id: doc.id, doc: exportDocumentJson(doc) })
      }
      if (url === `/api/sessions/${doc.id}` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as {
          doc: string
          expectedVersion?: number
        }
        const saved = deserialize(body.doc)
        expect(body.expectedVersion).toBe(doc.version)
        expect(saved.id).toBe(doc.id)
        expect(saved.meta.title).toBe('After')
        expect(saved.version).toBe(doc.version + 1)
        return jsonResponse({
          saved: true,
          conflict: false,
          currentVersion: saved.version,
        })
      }
      return jsonResponse({ error: 'unexpected request' }, 500)
    })

    await expect(new D1Store().rename(doc.id, 'After')).resolves.toBeUndefined()
  })

  it('returns a normal save failure when a D1 session is missing', async () => {
    const doc = createDoc('Missing')
    mockFetch(() => jsonResponse({ error: 'not found' }, 404))

    await expect(
      new D1Store().save(doc, { expectedVersion: 1 }),
    ).resolves.toEqual({
      saved: false,
      conflict: false,
    })
  })

  it('duplicates a D1 session as a new document through POST', async () => {
    const doc = createDoc('Original')
    let createdDocId: string | null = null
    mockFetch(async (url, init) => {
      if (url === `/api/sessions/${doc.id}` && !init) {
        return jsonResponse({ id: doc.id, doc: exportDocumentJson(doc) })
      }
      if (url === '/api/sessions' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { doc: string }
        const created = deserialize(body.doc)
        expect(created.id).not.toBe(doc.id)
        expect(created.meta.title).toBe('Original copy')
        expect(created.version).toBe(0)
        createdDocId = created.id
        return jsonResponse({ id: created.id })
      }
      return jsonResponse({ error: 'unexpected request' }, 500)
    })

    const duplicateId = await new D1Store().duplicate(doc.id)
    expect(duplicateId).toBe(createdDocId)
  })

  it('imports serialized JSON into D1 as a new document', async () => {
    const doc = createDoc('Imported')
    let createdDocId: string | null = null
    mockFetch(async (url, init) => {
      if (url === '/api/sessions' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { doc: string }
        const created = deserialize(body.doc)
        expect(created.id).not.toBe(doc.id)
        expect(created.meta.title).toBe('Imported import')
        createdDocId = created.id
        return jsonResponse({ id: created.id })
      }
      return jsonResponse({ error: 'unexpected request' }, 500)
    })

    await expect(
      new D1Store().importJson(exportDocumentJson(doc)),
    ).resolves.toBe(createdDocId)
  })
})
