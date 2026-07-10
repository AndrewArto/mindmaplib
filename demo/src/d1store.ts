// D1Store: MindmapStore implementation backed by /api/sessions Pages Function.
// The browser talks to the CF Pages Function which has a D1 binding.

import type {
  MindmapDoc,
  MindmapDocMeta,
  MindmapStore,
  SaveResult,
} from '@mindmaplib/core'
import { createDoc, deserialize, serialize } from '@mindmaplib/core'

interface SessionRow {
  id: string
  title: string
  doc_json: string
  version: number
  updated: string
}

export interface FirstVisitBootstrapResult {
  id: string | null
  title: string | null
  version: number | null
  updated: string | null
  created: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

function isJsonResponse(resp: Response): boolean {
  return resp.headers.get('content-type')?.includes('application/json') ?? false
}

function makeNewDocumentId(): string {
  return createDoc('New mindmap').id
}

function cloneDocument(doc: MindmapDoc, title: string): MindmapDoc {
  const timestamp = nowIso()
  return {
    ...doc,
    id: makeNewDocumentId(),
    version: 0,
    meta: {
      title,
      created: timestamp,
      updated: timestamp,
    },
  }
}

export function exportDocumentJson(doc: MindmapDoc): string {
  return serialize(doc)
}

export class D1Store implements MindmapStore {
  private readonly baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  async list(): Promise<MindmapDocMeta[]> {
    const resp = await fetch(`${this.baseUrl}/api/sessions`)
    if (!resp.ok || !isJsonResponse(resp)) {
      const contentType = resp.headers.get('content-type') ?? 'unknown'
      throw new Error(
        `Failed to list sessions: unexpected response ${resp.status} ${contentType}`,
      )
    }
    const rows = (await resp.json()) as SessionRow[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      updated: r.updated,
      version: r.version,
    }))
  }

  async load(docId: string): Promise<MindmapDoc | null> {
    const resp = await fetch(`${this.baseUrl}/api/sessions/${docId}`)
    if (resp.status === 404) return null
    if (!resp.ok || !isJsonResponse(resp)) {
      const contentType = resp.headers.get('content-type') ?? 'unknown'
      throw new Error(
        `Failed to load session: unexpected response ${resp.status} ${contentType}`,
      )
    }
    const data = (await resp.json()) as { id?: string; doc: string }
    const doc = deserialize(data.doc)
    if (data.id && data.id !== doc.id) {
      return { ...doc, id: data.id }
    }
    return doc
  }

  async save(
    doc: MindmapDoc,
    options?: { expectedVersion?: number },
  ): Promise<SaveResult> {
    const docJson = serialize(doc)
    const body = JSON.stringify({
      doc: docJson,
      expectedVersion: options?.expectedVersion,
    })
    const resp = await fetch(`${this.baseUrl}/api/sessions/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (resp.status === 409 && isJsonResponse(resp)) {
      const server = (await resp.json()) as {
        currentVersion?: number
      }
      return {
        saved: false,
        conflict: true,
        currentVersion: server.currentVersion,
      }
    }

    if (!resp.ok || !isJsonResponse(resp)) {
      return { saved: false, conflict: false }
    }

    const result = (await resp.json()) as {
      saved: boolean
      conflict: boolean
      currentVersion?: number
    }
    return result
  }

  async bootstrapFirstVisitSample(
    doc: MindmapDoc,
  ): Promise<FirstVisitBootstrapResult> {
    const resp = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: serialize(doc),
        bootstrapKind: 'first-visit-sample',
      }),
    })
    if (!resp.ok || !isJsonResponse(resp)) {
      throw new Error(`Failed to bootstrap first-visit sample: ${resp.status}`)
    }
    return (await resp.json()) as FirstVisitBootstrapResult
  }

  async create(doc: MindmapDoc): Promise<string> {
    const docJson = serialize(doc)
    const resp = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: docJson }),
    })
    if (!resp.ok || !isJsonResponse(resp)) {
      throw new Error(`Failed to create session: ${resp.status}`)
    }
    const result = (await resp.json()) as { id: string }
    return result.id
  }

  async rename(
    docId: string,
    title: string,
    canContinue: () => boolean = () => true,
  ): Promise<boolean> {
    const doc = await this.load(docId)
    if (!canContinue()) return false
    if (!doc) throw new Error('Session not found')
    const renamed: MindmapDoc = {
      ...doc,
      version: doc.version + 1,
      meta: { ...doc.meta, title, updated: nowIso() },
    }
    const result = await this.save(renamed, { expectedVersion: doc.version })
    if (!result.saved) {
      throw new Error(
        result.conflict
          ? `Rename conflict: server is at version ${result.currentVersion ?? 'unknown'}`
          : 'Rename failed',
      )
    }
    return true
  }

  async duplicate(
    docId: string,
    canContinue: () => boolean = () => true,
  ): Promise<string | null> {
    const doc = await this.load(docId)
    if (!canContinue()) return null
    if (!doc) throw new Error('Session not found')
    return this.create(cloneDocument(doc, `${doc.meta.title} copy`))
  }

  async importJson(json: string): Promise<string> {
    const doc = deserialize(json)
    return this.create(cloneDocument(doc, `${doc.meta.title} import`))
  }

  async delete(docId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/api/sessions/${docId}`, {
      method: 'DELETE',
    })
    if (!resp.ok) throw new Error(`Failed to delete session: ${resp.status}`)
  }
}
