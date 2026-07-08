import { describe, expect, it } from 'vitest'
import { createDoc, deserialize, serialize } from '@mindmaplib/core'
import worker from '../worker'

describe('Cloudflare worker sessions API', () => {
  it('creates D1 sessions using the serialized document id', async () => {
    const doc = createDoc('Worker map')
    const runCalls: Array<{ sql: string; params: unknown[] }> = []
    const env = {
      ASSETS: {
        fetch: async () => new Response('asset'),
      },
      MINDMAP_DB: {
        prepare(sql: string) {
          return {
            bind(...params: unknown[]) {
              runCalls.push({ sql, params })
              return {
                all: async () => ({ results: [] }),
                run: async () => ({ meta: { changes: 1 } }),
              }
            },
          }
        },
      },
    }

    const response = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ doc: serialize(doc) }),
      }),
      env,
    )
    const body = (await response.json()) as { id: string; title: string }

    expect(body).toMatchObject({ id: doc.id, title: 'Worker map' })
    expect(runCalls).toHaveLength(1)
    expect(runCalls[0]?.sql).toContain('INSERT INTO sessions')
    expect(runCalls[0]?.params[0]).toBe(doc.id)
    expect(deserialize(String(runCalls[0]?.params[2])).id).toBe(doc.id)
  })
})
