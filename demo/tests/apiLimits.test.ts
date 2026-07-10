import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_BYTES, readDocumentRequest } from '../apiLimits'

function compactDocument(nodeCount: number): string {
  const childIds = Array.from({ length: nodeCount }, (_, index) => `n${index}`)
  const nodes: Record<string, unknown> = {
    r: { id: 'r', parentId: null, childOrder: childIds },
  }
  for (const id of childIds) {
    nodes[id] = { id, parentId: 'r' }
  }
  return JSON.stringify({
    schemaVersion: 1,
    doc: { id: 'd', rootId: 'r', nodes },
  })
}

describe('document API limits', () => {
  it('rejects a compact document that exceeds the storage limit after canonicalization', async () => {
    const doc = compactDocument(3_000)
    expect(new TextEncoder().encode(doc).byteLength).toBeLessThan(
      MAX_DOCUMENT_BYTES,
    )
    const request = new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc }),
    })

    await expect(readDocumentRequest(request)).rejects.toMatchObject({
      status: 413,
      message: 'Document is too large',
    })
  })
})
