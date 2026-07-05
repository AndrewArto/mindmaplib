// D1Store: MindmapStore implementation backed by /api/sessions Pages Function.
// The browser talks to the CF Pages Function which has a D1 binding.

import type {
  MindmapDoc,
  MindmapDocMeta,
  MindmapStore,
  SaveResult,
} from '@mindmaplib/core'
import { serialize, deserialize } from '@mindmaplib/core'

interface SessionRow {
  id: string
  title: string
  doc_json: string
  version: number
  updated: string
}

export class D1Store implements MindmapStore {
  private readonly baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  async list(): Promise<MindmapDocMeta[]> {
    const resp = await fetch(`${this.baseUrl}/api/sessions`)
    if (!resp.ok) return []
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
    if (!resp.ok) return null
    const data = (await resp.json()) as { doc: string }
    return deserialize(data.doc)
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

    if (resp.status === 409) {
      const server = (await resp.json()) as {
        currentVersion?: number
      }
      return {
        saved: false,
        conflict: true,
        currentVersion: server.currentVersion,
      }
    }

    if (!resp.ok) {
      return { saved: false, conflict: false }
    }

    const result = (await resp.json()) as {
      saved: boolean
      conflict: boolean
      currentVersion?: number
    }
    return result
  }

  async create(doc: MindmapDoc): Promise<string> {
    const docJson = serialize(doc)
    const resp = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: docJson }),
    })
    if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`)
    const result = (await resp.json()) as { id: string }
    return result.id
  }

  async delete(docId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/sessions/${docId}`, {
      method: 'DELETE',
    })
  }
}
