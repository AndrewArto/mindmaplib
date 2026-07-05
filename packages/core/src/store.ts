// Storage: MindmapStore interface lives in types.ts. This module provides the
// InMemoryStore default implementation for dev/testing (MML-B-0001 § Store).

import type {
  MindmapDoc,
  MindmapDocMeta,
  MindmapStore,
  SaveResult,
} from './types.js'

/**
 * In-memory MindmapStore for dev and testing. Not persistent.
 */
export class InMemoryStore implements MindmapStore {
  private readonly docs = new Map<string, MindmapDoc>()

  async load(docId: string): Promise<MindmapDoc | null> {
    return this.docs.get(docId) ?? null
  }

  async save(
    doc: MindmapDoc,
    options?: { expectedVersion?: number },
  ): Promise<SaveResult> {
    const existing = this.docs.get(doc.id)
    if (
      existing !== undefined &&
      options?.expectedVersion !== undefined &&
      existing.version !== options.expectedVersion
    ) {
      return { saved: false, conflict: true, currentVersion: existing.version }
    }
    // store a snapshot (doc is immutable, so the reference is safe to keep)
    this.docs.set(doc.id, doc)
    return { saved: true, conflict: false, currentVersion: doc.version }
  }

  async list(): Promise<MindmapDocMeta[]> {
    return [...this.docs.values()].map((d) => ({
      id: d.id,
      title: d.meta.title,
      updated: d.meta.updated,
      version: d.version,
    }))
  }

  async delete(docId: string): Promise<void> {
    this.docs.delete(docId)
  }
}
