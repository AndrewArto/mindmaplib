import { describe, expect, it, vi } from 'vitest'
import { createDoc, serialize } from '@mindmaplib/core'
import { onRequestGet, onRequestPost } from '../functions/api/sessions'
import { onRequestDelete, onRequestPut } from '../functions/api/sessions/[id]'
import { onRequest as onOwnerRequest } from '../functions/_middleware'

interface BoundStatement {
  sql: string
  params: unknown[]
  all(): Promise<{ results: unknown[] }>
  run(): Promise<{ meta: { changes: number } }>
}

function createBootstrapEnv() {
  const batch = vi.fn(async (statements: BoundStatement[]) => {
    const marker = statements[0]!
    expect(marker.sql).toContain(
      'owner_bootstraps (owner_hash, session_id, claim_id, created)',
    )
    expect(marker.params).toHaveLength(4)
    const [ownerHash, sessionId, claimId] = marker.params.map(String)
    expect(claimId).not.toBe(sessionId)

    const sessionInsert = statements[1]!
    expect(sessionInsert.sql).toContain('claim_id = ?')
    expect(sessionInsert.sql).toContain('SELECT COUNT(*) FROM sessions')
    expect(sessionInsert.sql).toContain('WHERE owner_hash = ?')
    expect(sessionInsert.params).toContain(ownerHash)
    expect(sessionInsert.params).toContain(claimId)

    const orphanCleanup = statements[2]!
    expect(orphanCleanup.sql).toContain('DELETE FROM owner_bootstraps')
    expect(orphanCleanup.sql).toContain('NOT EXISTS')

    return [
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
      { meta: { changes: 0 } },
      {
        results: [
          {
            id: sessionId,
            title: 'Pages sample',
            version: 0,
            updated: new Date().toISOString(),
          },
        ],
      },
    ]
  })

  const database = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]): BoundStatement {
          return {
            sql,
            params,
            async all() {
              return { results: [] }
            },
            async run() {
              return { meta: { changes: 1 } }
            },
          }
        },
      }
    },
    batch,
  }

  return {
    env: {
      MINDMAP_DB: database,
      ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
    },
    batch,
  }
}

function createNormalCreateEnv() {
  const batch = vi.fn(async (statements: BoundStatement[]) => {
    expect(statements).toHaveLength(4)
    expect(statements[0]!.sql).toContain(
      'INSERT OR IGNORE INTO owner_bootstraps',
    )
    expect(statements[1]!.sql).toContain('INSERT OR IGNORE INTO sessions')
    expect(statements[1]!.sql).toContain('SELECT COUNT(*) FROM sessions')
    expect(statements[1]!.sql).toContain('WHERE owner_hash = ?')
    expect(statements[2]!.sql).toContain('DELETE FROM owner_bootstraps')
    expect(statements[3]!.sql).toContain("THEN 'same' ELSE 'conflict'")
    return [
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
      { meta: { changes: 0 } },
      { results: [{ status: 'same' }] },
    ]
  })
  const database = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]): BoundStatement {
          return {
            sql,
            params,
            async all() {
              return { results: [] }
            },
            async run() {
              return { meta: { changes: 1 } }
            },
          }
        },
      }
    },
    batch,
  }
  return {
    env: {
      MINDMAP_DB: database,
      ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
    },
    batch,
  }
}

describe('Pages Functions anonymous owner bootstrap', () => {
  it('establishes one owner cookie before concurrent list and create requests', async () => {
    const htmlRequest = new Request('https://example.com/', {
      headers: { Accept: 'text/html' },
    })
    const middlewareContext = {
      request: htmlRequest,
      env: { ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy' },
      params: {},
      data: {},
      functionPath: '/_middleware',
      waitUntil: vi.fn(),
      next: vi.fn(
        async () =>
          new Response('<!doctype html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    } as unknown as Parameters<typeof onOwnerRequest>[0]

    const htmlResponse = (await onOwnerRequest(middlewareContext)) as Response
    const cookie = htmlResponse.headers.get('Set-Cookie')?.split(';')[0]
    expect(cookie).toMatch(/^__Host-mml_anon_id=[A-Za-z0-9_-]{43}$/)

    const ownerHashes: string[] = []
    const database = {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]): BoundStatement {
            if (sql.includes('owner_hash')) {
              const owner = params.find(
                (param) =>
                  typeof param === 'string' &&
                  /^[A-Za-z0-9_-]{43}$/.test(param),
              )
              if (typeof owner === 'string') ownerHashes.push(owner)
            }
            return {
              sql,
              params,
              async all() {
                return { results: [] }
              },
              async run() {
                return { meta: { changes: 1 } }
              },
            }
          },
        }
      },
      async batch(statements: BoundStatement[]) {
        const owner = statements[0]?.params[0]
        if (typeof owner === 'string') ownerHashes.push(owner)
        return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]
      },
    }
    const env = {
      MINDMAP_DB: database,
      ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
    }
    const doc = createDoc('Concurrent Pages create')
    const listContext = {
      request: new Request('https://example.com/api/sessions', {
        headers: { Cookie: cookie! },
      }),
      env,
      params: {},
      data: {},
      functionPath: '/api/sessions',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestGet>[0]
    const createContext = {
      request: new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: {
          Cookie: cookie!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ doc: serialize(doc) }),
      }),
      env,
      params: {},
      data: {},
      functionPath: '/api/sessions',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestPost>[0]

    await Promise.all([onRequestGet(listContext), onRequestPost(createContext)])

    expect(new Set(ownerHashes)).toHaveLength(1)
  })
  it('rotates and rekeys a legacy owner instead of copying its bearer token', async () => {
    const token = Array.from({ length: 43 }, () => 'P').join('')
    const batch = vi.fn(async (statements: BoundStatement[]) => {
      expect(statements).toHaveLength(5)
      expect(statements[0]!.sql).toContain('DELETE FROM owner_migrations')
      expect(statements[1]!.sql).toContain(
        'INSERT OR IGNORE INTO owner_migrations',
      )
      expect(statements[2]!.sql).toContain(
        'UPDATE sessions SET owner_hash = ? WHERE owner_hash = ?',
      )
      expect(statements[3]!.sql).toContain(
        'UPDATE owner_bootstraps SET owner_hash = ? WHERE owner_hash = ?',
      )
      expect(statements[4]!.sql).toContain(
        'SELECT 1 AS migrated FROM owner_migrations',
      )
      expect(statements[2]!.params[0]).toBe(statements[3]!.params[0])
      expect(statements[2]!.params[1]).toBe(statements[3]!.params[1])
      return [
        { meta: { changes: 0 } },
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
        { results: [{ migrated: 1 }] },
      ]
    })
    const database = {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]): BoundStatement {
            return {
              sql,
              params,
              async all() {
                return { results: [{ found: 1 }] }
              },
              async run() {
                return { meta: { changes: 0 } }
              },
            }
          },
        }
      },
      batch,
    }
    const context = {
      request: new Request('https://example.com/', {
        headers: {
          Accept: 'text/html',
          Cookie: `mml_anon_id=${token}`,
        },
      }),
      env: {
        MINDMAP_DB: database,
        ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
      },
      params: {},
      data: {},
      functionPath: '/_middleware',
      waitUntil: vi.fn(),
      next: vi.fn(
        async () =>
          new Response('<!doctype html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    } as unknown as Parameters<typeof onOwnerRequest>[0]

    const response = (await onOwnerRequest(context)) as Response
    const cookie = response.headers.get('Set-Cookie')

    expect(cookie).toMatch(/^__Host-mml_anon_id=[A-Za-z0-9_-]{43};/)
    expect(cookie).not.toContain(`__Host-mml_anon_id=${token}`)
    expect(batch).toHaveBeenCalledOnce()
  })
  it('returns one replacement cookie to concurrent legacy migrations', async () => {
    const token = Array.from({ length: 43 }, () => 'Q').join('')
    const database = {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]): BoundStatement {
            return {
              sql,
              params,
              async all() {
                return { results: [{ found: 1 }] }
              },
              async run() {
                return { meta: { changes: 1 } }
              },
            }
          },
        }
      },
      async batch() {
        return [
          { meta: { changes: 0 } },
          { meta: { changes: 1 } },
          { meta: { changes: 1 } },
          { meta: { changes: 1 } },
          { results: [{ migrated: 1 }] },
        ]
      },
    }
    const makeContext = () =>
      ({
        request: new Request('https://example.com/', {
          headers: {
            Accept: 'text/html',
            Cookie: `mml_anon_id=${token}`,
          },
        }),
        env: {
          MINDMAP_DB: database,
          ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
        },
        params: {},
        data: {},
        functionPath: '/_middleware',
        waitUntil: vi.fn(),
        next: vi.fn(
          async () =>
            new Response('<!doctype html>', {
              headers: { 'Content-Type': 'text/html' },
            }),
        ),
      }) as unknown as Parameters<typeof onOwnerRequest>[0]

    const [first, second] = (await Promise.all([
      onOwnerRequest(makeContext()),
      onOwnerRequest(makeContext()),
    ])) as Response[]

    expect(second.headers.get('Set-Cookie')).toBe(
      first.headers.get('Set-Cookie'),
    )
  })
})

describe('Pages Functions route and request limits', () => {
  it('wires the nested session-id route to every CRUD handler', async () => {
    const route = await import('../functions/api/sessions/[id]')
    expect(route.onRequestGet).toBe(onRequestGet)
    expect(route.onRequestPut).toBeDefined()
    expect(route.onRequestDelete).toBeDefined()
  })

  it('rejects cross-origin DELETE before owner lookup or D1 mutation', async () => {
    const prepare = vi.fn()
    const request = new Request('https://example.com/api/sessions/doc_safe', {
      method: 'DELETE',
      headers: {
        Origin: 'https://sibling.example.com',
        'Sec-Fetch-Site': 'same-site',
      },
    })
    const context = {
      request,
      env: {
        MINDMAP_DB: { prepare },
        ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
      },
      params: { id: 'doc_safe' },
      data: {},
      functionPath: '/api/sessions/[id]',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestDelete>[0]

    const response = (await onRequestDelete(context)) as Response

    expect(response.status).toBe(403)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects unsafe item ids and route/body document-id mismatches before owner lookup', async () => {
    const prepare = vi.fn()
    const unsafeContext = {
      request: new Request(
        `https://example.com/api/sessions/${'x'.repeat(129)}`,
      ),
      env: {
        MINDMAP_DB: { prepare },
        ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
      },
      params: { id: 'x'.repeat(129) },
      data: {},
      functionPath: '/api/sessions/[id]',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestGet>[0]

    const unsafe = (await onRequestGet(unsafeContext)) as Response
    expect(unsafe.status).toBe(400)
    expect(unsafe.headers.get('Set-Cookie')).toBeNull()
    expect(prepare).not.toHaveBeenCalled()

    const routeDoc = createDoc('Route id')
    const bodyDoc = createDoc('Body id')
    const mismatchContext = {
      request: new Request(`https://example.com/api/sessions/${routeDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: serialize(bodyDoc) }),
      }),
      env: {
        MINDMAP_DB: { prepare },
        ANON_ID_SECRET: 'test-owner-secret-with-sufficient-entropy',
      },
      params: { id: routeDoc.id },
      data: {},
      functionPath: '/api/sessions/[id]',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestPut>[0]

    const mismatch = (await onRequestPut(mismatchContext)) as Response
    expect(mismatch.status).toBe(400)
    expect(mismatch.headers.get('Set-Cookie')).toBeNull()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rejects an oversized document before writing to D1', async () => {
    const { env, batch } = createNormalCreateEnv()
    const request = new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: 'x'.repeat(300_000) }),
    })
    const context = {
      request,
      env,
      params: {},
      data: {},
      functionPath: '/api/sessions',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestPost>[0]

    const response = (await onRequestPost(context)) as Response

    expect(response.status).toBe(413)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(batch).not.toHaveBeenCalled()
  })
})

describe('Pages Functions sessions bootstrap', () => {
  it('atomically marks the owner on a normal create', async () => {
    const { env, batch } = createNormalCreateEnv()
    const doc = createDoc('Normal Pages create')
    const request = new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: serialize(doc) }),
    })
    const context = {
      request,
      env,
      params: {},
      data: {},
      functionPath: '/api/sessions',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestPost>[0]

    const response = (await onRequestPost(context)) as Response

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: doc.id })
    expect(batch).toHaveBeenCalledOnce()
  })

  it('uses the same per-request owner bootstrap claim protocol as the advanced worker', async () => {
    const { env, batch } = createBootstrapEnv()
    const doc = createDoc('Pages sample')
    const request = new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: serialize(doc),
        bootstrapKind: 'first-visit-sample',
      }),
    })
    const context = {
      request,
      env,
      params: {},
      data: {},
      functionPath: '/api/sessions',
      waitUntil: vi.fn(),
      next: vi.fn(),
    } as unknown as Parameters<typeof onRequestPost>[0]

    const response = (await onRequestPost(context)) as Response

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: doc.id,
      created: true,
    })
    expect(batch).toHaveBeenCalledOnce()
  })
})
