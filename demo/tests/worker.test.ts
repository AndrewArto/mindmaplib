import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDoc, deserialize, serialize } from '@mindmaplib/core'
import worker from '../worker'

type StoredSession = {
  id: string
  title: string
  doc_json: string
  version: number
  created: string
  updated: string
  owner_hash?: string
}

type RunCall = { sql: string; params: unknown[] }

function createMockEnv(initialSessions: StoredSession[] = []) {
  const sessions = [...initialSessions]
  const bootstraps = new Map<string, { sessionId: string; claimId: string }>()
  const migrations = new Map<string, { nextHash: string; expires: string }>()
  const runCalls: RunCall[] = []
  const allCalls: RunCall[] = []
  const batchCalls: string[][] = []
  let batchQueue: Promise<void> = Promise.resolve()

  const env = {
    ANON_ID_SECRET: 'test-only-secret',
    ASSETS: {
      fetch: async () => new Response('asset'),
    },
    MINDMAP_DB: {
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            return {
              sql,
              params,
              all: async () => {
                allCalls.push({ sql, params })

                if (
                  sql.includes('SELECT 1 AS migrated FROM owner_migrations')
                ) {
                  const [legacyHash, nextHash, now] = params.map(String)
                  const migration = migrations.get(legacyHash)
                  return {
                    results:
                      migration?.nextHash === nextHash &&
                      migration.expires > now
                        ? [{ migrated: 1 }]
                        : [],
                  }
                }

                if (sql.includes('SELECT 1 AS found FROM sessions')) {
                  const ownerHash = String(params[0])
                  const found =
                    sessions.some(
                      (session) => session.owner_hash === ownerHash,
                    ) || bootstraps.has(ownerHash)
                  return { results: found ? [{ found: 1 }] : [] }
                }

                if (sql.includes('FROM owner_bootstraps b')) {
                  const ownerHash = String(params[0])
                  const sessionId = bootstraps.get(ownerHash)?.sessionId
                  const session = sessions.find(
                    (candidate) =>
                      candidate.id === sessionId &&
                      candidate.owner_hash === ownerHash,
                  )
                  return {
                    results: [
                      session
                        ? {
                            id: session.id,
                            title: session.title,
                            version: session.version,
                            updated: session.updated,
                          }
                        : {
                            id: null,
                            title: null,
                            version: null,
                            updated: null,
                          },
                    ],
                  }
                }

                if (sql.includes("THEN 'same' ELSE 'conflict'")) {
                  const [ownerHash, docJson, id] = params.map(String)
                  const session = sessions.find(
                    (candidate) => candidate.id === id,
                  )
                  return {
                    results: session
                      ? [
                          {
                            status:
                              session.owner_hash === ownerHash &&
                              session.doc_json === docJson
                                ? 'same'
                                : 'conflict',
                          },
                        ]
                      : [],
                  }
                }

                if (
                  sql.includes('SELECT id, title, version, updated') &&
                  sql.includes('owner_hash')
                ) {
                  const ownerHash = String(params[0])
                  return {
                    results: sessions
                      .filter((session) => session.owner_hash === ownerHash)
                      .sort((a, b) => b.updated.localeCompare(a.updated))
                      .slice(0, 50)
                      .map(({ id, title, version, updated }) => ({
                        id,
                        title,
                        version,
                        updated,
                      })),
                  }
                }

                if (
                  sql.includes('SELECT id, title, doc_json') &&
                  sql.includes('owner_hash')
                ) {
                  const [id, ownerHash] = params.map(String)
                  return {
                    results: sessions.filter(
                      (session) =>
                        session.id === id && session.owner_hash === ownerHash,
                    ),
                  }
                }

                if (
                  sql.includes('SELECT version FROM sessions') &&
                  sql.includes('owner_hash')
                ) {
                  const [id, ownerHash] = params.map(String)
                  return {
                    results: sessions
                      .filter(
                        (session) =>
                          session.id === id && session.owner_hash === ownerHash,
                      )
                      .map(({ version }) => ({ version })),
                  }
                }

                if (sql.includes('SELECT id, title, version, updated')) {
                  return {
                    results: sessions
                      .sort((a, b) => b.updated.localeCompare(a.updated))
                      .slice(0, 50)
                      .map(({ id, title, version, updated }) => ({
                        id,
                        title,
                        version,
                        updated,
                      })),
                  }
                }

                if (sql.includes('SELECT id, title, doc_json')) {
                  const id = String(params[0])
                  return {
                    results: sessions.filter((session) => session.id === id),
                  }
                }

                if (sql.includes('SELECT version FROM sessions')) {
                  const id = String(params[0])
                  return {
                    results: sessions
                      .filter((session) => session.id === id)
                      .map(({ version }) => ({ version })),
                  }
                }

                return { results: [] }
              },
              run: async () => {
                runCalls.push({ sql, params })

                if (sql.includes('DELETE FROM owner_migrations')) {
                  const [legacyHash, now] = params.map(String)
                  const migration = migrations.get(legacyHash)
                  if (migration && migration.expires <= now) {
                    migrations.delete(legacyHash)
                    return { meta: { changes: 1 } }
                  }
                  return { meta: { changes: 0 } }
                }

                if (sql.includes('INSERT OR IGNORE INTO owner_migrations')) {
                  const [legacyHash, nextHash, expires] = params.map(String)
                  if (migrations.has(legacyHash)) {
                    return { meta: { changes: 0 } }
                  }
                  const hasLegacyData =
                    sessions.some(
                      (session) => session.owner_hash === legacyHash,
                    ) || bootstraps.has(legacyHash)
                  if (!hasLegacyData) return { meta: { changes: 0 } }
                  migrations.set(legacyHash, { nextHash, expires })
                  return { meta: { changes: 1 } }
                }

                if (sql.includes('INSERT OR IGNORE INTO owner_bootstraps')) {
                  const [ownerHash, sessionId, claimId] = params.map(String)
                  if (bootstraps.has(ownerHash)) {
                    return { meta: { changes: 0 } }
                  }
                  bootstraps.set(ownerHash, { sessionId, claimId })
                  return { meta: { changes: 1 } }
                }

                if (
                  sql.includes('INSERT OR IGNORE INTO sessions') &&
                  sql.includes('owner_bootstraps')
                ) {
                  const [
                    id,
                    title,
                    doc_json,
                    version,
                    created,
                    updated,
                    owner_hash,
                    bootstrapOwnerHash,
                    bootstrapClaimId,
                  ] = params
                  const ownsBootstrap =
                    bootstraps.get(String(bootstrapOwnerHash))?.claimId ===
                    String(bootstrapClaimId)
                  const exists = sessions.some(
                    (session) => session.id === String(id),
                  )
                  if (!ownsBootstrap || exists) {
                    return { meta: { changes: 0 } }
                  }
                  sessions.push({
                    id: String(id),
                    title: String(title),
                    doc_json: String(doc_json),
                    version: Number(version),
                    created: String(created),
                    updated: String(updated),
                    owner_hash: String(owner_hash),
                  })
                  return { meta: { changes: 1 } }
                }

                if (
                  sql.includes('INSERT INTO sessions') ||
                  sql.includes('INSERT OR IGNORE INTO sessions')
                ) {
                  const [
                    id,
                    title,
                    doc_json,
                    version,
                    created,
                    updated,
                    owner_hash,
                  ] = params
                  if (sessions.some((session) => session.id === String(id))) {
                    return { meta: { changes: 0 } }
                  }
                  sessions.push({
                    id: String(id),
                    title: String(title),
                    doc_json: String(doc_json),
                    version: Number(version),
                    created: String(created),
                    updated: String(updated),
                    owner_hash:
                      owner_hash === undefined ? undefined : String(owner_hash),
                  })
                  return { meta: { changes: 1 } }
                }

                if (
                  sql.includes(
                    'UPDATE sessions SET owner_hash = ? WHERE owner_hash = ?',
                  )
                ) {
                  const [nextHash, legacyHash] = params.map(String)
                  let changes = 0
                  for (const session of sessions) {
                    if (session.owner_hash === legacyHash) {
                      session.owner_hash = nextHash
                      changes += 1
                    }
                  }
                  return { meta: { changes } }
                }

                if (
                  sql.includes(
                    'UPDATE owner_bootstraps SET owner_hash = ? WHERE owner_hash = ?',
                  )
                ) {
                  const [nextHash, legacyHash] = params.map(String)
                  const bootstrap = bootstraps.get(legacyHash)
                  if (!bootstrap) return { meta: { changes: 0 } }
                  bootstraps.delete(legacyHash)
                  bootstraps.set(nextHash, bootstrap)
                  return { meta: { changes: 1 } }
                }

                if (sql.includes('UPDATE sessions SET')) {
                  const [title, doc_json, version, updated, id] = params
                  const ownerHash = sql.includes('owner_hash')
                    ? String(params[5])
                    : undefined
                  const expectedVersion = sql.includes('version = ?')
                    ? Number(params[6])
                    : undefined
                  let changes = 0

                  for (const session of sessions) {
                    const ownerMatches =
                      ownerHash === undefined ||
                      session.owner_hash === ownerHash
                    const versionMatches =
                      expectedVersion === undefined ||
                      session.version === expectedVersion
                    if (
                      session.id === String(id) &&
                      ownerMatches &&
                      versionMatches
                    ) {
                      session.title = String(title)
                      session.doc_json = String(doc_json)
                      session.version = Number(version)
                      session.updated = String(updated)
                      changes += 1
                    }
                  }

                  return { meta: { changes } }
                }

                if (sql.includes('DELETE FROM owner_bootstraps')) {
                  const [ownerHash, claimId] = params.map(String)
                  const bootstrap = bootstraps.get(ownerHash)
                  const hasSession = sessions.some(
                    (session) =>
                      session.id === bootstrap?.sessionId &&
                      session.owner_hash === ownerHash,
                  )
                  if (bootstrap?.claimId === claimId && !hasSession) {
                    bootstraps.delete(ownerHash)
                    return { meta: { changes: 1 } }
                  }
                  return { meta: { changes: 0 } }
                }

                if (sql.includes('DELETE FROM sessions')) {
                  const id = String(params[0])
                  const ownerHash = sql.includes('owner_hash')
                    ? String(params[1])
                    : undefined
                  const before = sessions.length
                  for (
                    let index = sessions.length - 1;
                    index >= 0;
                    index -= 1
                  ) {
                    const session = sessions[index]
                    if (
                      session.id === id &&
                      (ownerHash === undefined ||
                        session.owner_hash === ownerHash)
                    ) {
                      sessions.splice(index, 1)
                    }
                  }
                  return { meta: { changes: before - sessions.length } }
                }

                return { meta: { changes: 0 } }
              },
            }
          },
        }
      },
      batch(
        statements: Array<{
          sql: string
          all: () => Promise<{ results?: Array<Record<string, unknown>> }>
          run: () => Promise<{
            results?: Array<Record<string, unknown>>
            meta?: Record<string, unknown>
          }>
        }>,
      ) {
        batchCalls.push(statements.map((statement) => statement.sql))
        const execute = async () => {
          const results = []
          for (const statement of statements) {
            results.push(
              statement.sql.trimStart().startsWith('SELECT')
                ? await statement.all()
                : await statement.run(),
            )
          }
          return results
        }
        const result = batchQueue.then(execute)
        batchQueue = result.then(
          () => undefined,
          () => undefined,
        )
        return result
      },
    },
  }

  return { env, sessions, bootstraps, runCalls, allCalls, batchCalls }
}

function getSetCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('set-cookie missing')
  return cookie
}

function asCookieHeader(setCookie: string): string {
  return setCookie.split(';')[0] ?? setCookie
}

async function ownerHash(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('test-only-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token))
  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

async function createSession(
  env: ReturnType<typeof createMockEnv>['env'],
  title: string,
  cookie?: string,
): Promise<Response> {
  const doc = createDoc(title)
  return worker.fetch(
    new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ doc: serialize(doc) }),
    }),
    env,
  )
}

async function bootstrapSample(
  env: ReturnType<typeof createMockEnv>['env'],
  docOrTitle: ReturnType<typeof createDoc> | string,
  cookie: string,
): Promise<Response> {
  const doc =
    typeof docOrTitle === 'string' ? createDoc(docOrTitle) : docOrTitle
  return worker.fetch(
    new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: serialize(doc),
        bootstrapKind: 'first-visit-sample',
      }),
    }),
    env,
  )
}

describe('Cloudflare worker sessions API', () => {
  it('routes the HTML document through the advanced-mode worker for cookie bootstrap', () => {
    const routes = JSON.parse(
      readFileSync(resolve(process.cwd(), 'demo/_routes.json'), 'utf8'),
    ) as { include?: string[]; exclude?: string[] }

    expect(routes.include).toContain('/*')
    expect(routes.exclude).toContain('/assets/*')
  })

  it('does not route collection prefixes or nested item paths into the API', async () => {
    const { env, sessions } = createMockEnv()

    const prefix = await worker.fetch(
      new Request('https://example.com/api/sessionsfoo'),
      env,
    )
    const nested = await worker.fetch(
      new Request('https://example.com/api/sessions/a/b'),
      env,
    )
    const trailing = await worker.fetch(
      new Request('https://example.com/api/sessions/'),
      env,
    )

    expect(await prefix.text()).toBe('asset')
    expect(await nested.text()).toBe('asset')
    expect(await trailing.text()).toBe('asset')
    expect(sessions).toHaveLength(0)
  })

  it('rejects unsupported API methods before resolving or migrating an owner', async () => {
    const legacyToken = Array.from({ length: 43 }, () => 'M').join('')
    const legacyHash = await ownerHash(legacyToken)
    const legacyDoc = createDoc('Unsupported method owner')
    const { env, sessions, allCalls, runCalls } = createMockEnv([
      {
        id: legacyDoc.id,
        title: legacyDoc.meta.title,
        doc_json: serialize(legacyDoc),
        version: legacyDoc.version,
        created: legacyDoc.meta.created,
        updated: legacyDoc.meta.updated,
        owner_hash: legacyHash,
      },
    ])

    const response = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'PATCH',
        headers: { Cookie: `mml_anon_id=${legacyToken}` },
      }),
      env,
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(allCalls).toHaveLength(0)
    expect(runCalls).toHaveLength(0)
    expect(sessions[0]?.owner_hash).toBe(legacyHash)
  })

  it('rejects simple and same-site cross-origin writes before D1', async () => {
    const { env, sessions } = createMockEnv()
    const doc = serialize(createDoc('CSRF attempt'))

    const simple = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ doc }),
      }),
      env,
    )
    const sameSite = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://sibling.example.com',
          'Sec-Fetch-Site': 'same-site',
        },
        body: JSON.stringify({ doc }),
      }),
      env,
    )

    expect(simple.status).toBe(415)
    expect(simple.headers.get('Set-Cookie')).toBeNull()
    expect(sameSite.status).toBe(403)
    expect(sameSite.headers.get('Set-Cookie')).toBeNull()
    expect(sessions).toHaveLength(0)
  })

  it('bootstraps the anonymous owner cookie on the first HTML document response', async () => {
    const { env } = createMockEnv()

    const response = await worker.fetch(
      new Request('https://example.com/', {
        headers: { Accept: 'text/html' },
      }),
      env,
    )

    expect(await response.text()).toBe('asset')
    const setCookie = getSetCookie(response)
    expect(setCookie).toContain('__Host-mml_anon_id=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
  })

  it('migrates a legacy cookie only when its owner already has data', async () => {
    const token = Array.from({ length: 43 }, () => 'L').join('')
    const hash = await ownerHash(token)
    const doc = createDoc('Legacy owner map')
    const { env, sessions } = createMockEnv([
      {
        id: doc.id,
        title: doc.meta.title,
        doc_json: serialize(doc),
        version: doc.version,
        created: doc.meta.created,
        updated: doc.meta.updated,
        owner_hash: hash,
      },
    ])

    const response = await worker.fetch(
      new Request('https://example.com/', {
        headers: {
          Accept: 'text/html',
          Cookie: `mml_anon_id=${token}`,
        },
      }),
      env,
    )

    const migratedCookie = asCookieHeader(getSetCookie(response))
    const migratedToken = migratedCookie.split('=')[1] ?? ''
    expect(migratedCookie).toMatch(/^__Host-mml_anon_id=[A-Za-z0-9_-]{43}$/)
    expect(migratedToken).not.toBe(token)
    const migratedHash = await ownerHash(migratedToken)
    expect(sessions[0]?.owner_hash).toBe(migratedHash)

    const list = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        headers: { Cookie: migratedCookie },
      }),
      env,
    )
    await expect(list.json()).resolves.toEqual([
      expect.objectContaining({ id: doc.id, title: doc.meta.title }),
    ])

    const replay = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        headers: { Cookie: `mml_anon_id=${token}` },
      }),
      env,
    )
    await expect(replay.json()).resolves.toEqual([
      expect.objectContaining({ id: doc.id, title: doc.meta.title }),
    ])
    expect(asCookieHeader(getSetCookie(replay))).toBe(migratedCookie)

    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000)
      const expiredReplay = await worker.fetch(
        new Request('https://example.com/api/sessions', {
          headers: { Cookie: `mml_anon_id=${token}` },
        }),
        env,
      )
      await expect(expiredReplay.json()).resolves.toEqual([])
      expect(asCookieHeader(getSetCookie(expiredReplay))).not.toBe(
        migratedCookie,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns the same migrated owner cookie to concurrent legacy requests', async () => {
    const token = Array.from({ length: 43 }, () => 'C').join('')
    const hash = await ownerHash(token)
    const doc = createDoc('Concurrent legacy owner')
    const { env, sessions } = createMockEnv([
      {
        id: doc.id,
        title: doc.meta.title,
        doc_json: serialize(doc),
        version: doc.version,
        created: doc.meta.created,
        updated: doc.meta.updated,
        owner_hash: hash,
      },
    ])
    const request = () =>
      worker.fetch(
        new Request('https://example.com/', {
          headers: {
            Accept: 'text/html',
            Cookie: `mml_anon_id=${token}`,
          },
        }),
        env,
      )

    const [first, second] = await Promise.all([request(), request()])
    const firstCookie = asCookieHeader(getSetCookie(first))
    const secondCookie = asCookieHeader(getSetCookie(second))

    expect(secondCookie).toBe(firstCookie)
    const replacementToken = firstCookie.split('=')[1] ?? ''
    expect(sessions[0]?.owner_hash).toBe(await ownerHash(replacementToken))
  })

  it('rotates a legacy cookie that has no existing owner data', async () => {
    const token = Array.from({ length: 43 }, () => 'F').join('')
    const { env } = createMockEnv()
    const response = await worker.fetch(
      new Request('https://example.com/', {
        headers: {
          Accept: 'text/html',
          Cookie: `mml_anon_id=${token}`,
        },
      }),
      env,
    )

    expect(getSetCookie(response)).toContain('__Host-mml_anon_id=')
    expect(getSetCookie(response)).not.toContain(`__Host-mml_anon_id=${token}`)
  })

  it('rejects an oversized document before writing to D1', async () => {
    const { env, sessions } = createMockEnv()
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))
    const response = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: 'x'.repeat(300_000) }),
      }),
      env,
    )

    expect(response.status).toBe(413)
    expect(sessions).toHaveLength(0)
  })

  it('stops reading a streamed request once the body limit is exceeded', async () => {
    const { env } = createMockEnv()
    let pulls = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls > 20) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(300_000).fill(120))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new Request('https://example.com/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    expect(request.headers.has('Content-Length')).toBe(false)

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThan(20)
  })

  it('rejects malformed documents, unsafe IDs, and invalid expected versions', async () => {
    const { env, sessions } = createMockEnv()
    const malformed = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: '{}' }),
      }),
      env,
    )
    const unsafe = createDoc('Unsafe route id')
    unsafe.id = 'unsafe/id'
    const unsafeResponse = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: serialize(unsafe) }),
      }),
      env,
    )
    const valid = createDoc('Invalid expected version')
    const invalidVersion = await worker.fetch(
      new Request(`https://example.com/api/sessions/${valid.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: serialize(valid), expectedVersion: -1 }),
      }),
      env,
    )

    expect(malformed.status).toBe(400)
    expect(malformed.headers.get('Set-Cookie')).toBeNull()
    expect(unsafeResponse.status).toBe(400)
    expect(unsafeResponse.headers.get('Set-Cookie')).toBeNull()
    expect(invalidVersion.status).toBe(400)
    expect(invalidVersion.headers.get('Set-Cookie')).toBeNull()
    expect(sessions).toHaveLength(0)

    const legacyToken = Array.from({ length: 43 }, () => 'V').join('')
    const legacyHash = await ownerHash(legacyToken)
    const legacyDoc = createDoc('Legacy validation owner')
    const legacy = createMockEnv([
      {
        id: legacyDoc.id,
        title: legacyDoc.meta.title,
        doc_json: serialize(legacyDoc),
        version: legacyDoc.version,
        created: legacyDoc.meta.created,
        updated: legacyDoc.meta.updated,
        owner_hash: legacyHash,
      },
    ])
    const malformedLegacy = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: {
          Cookie: `mml_anon_id=${legacyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ doc: '{}' }),
      }),
      legacy.env,
    )
    expect(malformedLegacy.status).toBe(400)
    expect(malformedLegacy.headers.get('Set-Cookie')).toBeNull()
    expect(legacy.sessions[0]?.owner_hash).toBe(legacyHash)
  })

  it('rejects unsafe item ids and route/body document-id mismatches before owner lookup', async () => {
    const routeDoc = createDoc('Route document')
    const routeHash = 'existing-owner-hash'
    const { env, sessions, allCalls, runCalls } = createMockEnv([
      {
        id: routeDoc.id,
        title: routeDoc.meta.title,
        doc_json: serialize(routeDoc),
        version: routeDoc.version,
        created: routeDoc.meta.created,
        updated: routeDoc.meta.updated,
        owner_hash: routeHash,
      },
    ])
    const unsafe = await worker.fetch(
      new Request(`https://example.com/api/sessions/${'x'.repeat(129)}`),
      env,
    )

    expect(unsafe.status).toBe(400)
    expect(unsafe.headers.get('Set-Cookie')).toBeNull()
    expect(allCalls).toHaveLength(0)
    expect(runCalls).toHaveLength(0)

    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))
    sessions[0]!.owner_hash = await ownerHash(cookie.split('=')[1] ?? '')
    const wrongDoc = createDoc('Wrong body id')
    const mismatch = await worker.fetch(
      new Request(`https://example.com/api/sessions/${routeDoc.id}`, {
        method: 'PUT',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: serialize(wrongDoc) }),
      }),
      env,
    )

    expect(mismatch.status).toBe(400)
    expect(mismatch.headers.get('Set-Cookie')).toBeNull()
    expect(deserialize(sessions[0]!.doc_json).id).toBe(routeDoc.id)
  })

  it('makes exact create retries idempotent and rejects conflicting document IDs', async () => {
    const { env, sessions, batchCalls } = createMockEnv()
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))
    const original = createDoc('Original create')
    const requestCreate = (doc: typeof original) =>
      worker.fetch(
        new Request('https://example.com/api/sessions', {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ doc: serialize(doc) }),
        }),
        env,
      )

    const first = await requestCreate(original)
    const retry = await requestCreate(original)
    const conflicting = createDoc('Conflicting create')
    conflicting.id = original.id
    const conflict = await requestCreate(conflicting)

    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({ id: original.id })
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toEqual({
      error: 'Session id conflict',
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.title).toBe('Original create')
    expect(batchCalls).toHaveLength(3)
    expect(
      batchCalls.every((statements) =>
        statements.some((sql) => sql.includes("THEN 'same' ELSE 'conflict'")),
      ),
    ).toBe(true)
  })

  it('rejects cross-origin DELETE before resolving or mutating the owner', async () => {
    const { env, sessions } = createMockEnv()
    const created = await createSession(env, 'Protected delete')
    const cookie = asCookieHeader(getSetCookie(created))
    const body = (await created.json()) as { id: string }

    const response = await worker.fetch(
      new Request(`https://example.com/api/sessions/${body.id}`, {
        method: 'DELETE',
        headers: {
          Cookie: cookie,
          Origin: 'https://sibling.example.com',
          'Sec-Fetch-Site': 'same-site',
        },
      }),
      env,
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(sessions).toHaveLength(1)
  })

  it('backfills one bootstrap marker for every existing anonymous owner', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'demo/migrations/003_owner_bootstrap.sql'),
      'utf8',
    )

    expect(migration).toContain('INSERT OR IGNORE INTO owner_bootstraps')
    expect(migration).toContain('FROM sessions')
    expect(migration).toContain('WHERE owner_hash IS NOT NULL')
    expect(migration).toContain('GROUP BY owner_hash')
  })

  it('marks an owner after a normal create so deleting it does not restore first-visit eligibility', async () => {
    const { env, sessions, bootstraps } = createMockEnv()
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))

    const created = await createSession(env, 'Normal create', cookie)
    const createdBody = (await created.json()) as { id: string }
    expect(bootstraps.size).toBe(1)

    await worker.fetch(
      new Request(`https://example.com/api/sessions/${createdBody.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      }),
      env,
    )
    const bootstrap = await bootstrapSample(env, 'Must not appear', cookie)

    await expect(bootstrap.json()).resolves.toMatchObject({
      id: null,
      created: false,
    })
    expect(sessions).toHaveLength(0)
  })

  it('creates the first-visit sample at most once for an anonymous owner', async () => {
    const { env, sessions } = createMockEnv()
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))

    const [first, second] = await Promise.all([
      bootstrapSample(env, 'First sample', cookie),
      bootstrapSample(env, 'Second sample', cookie),
    ])
    const firstBody = (await first.json()) as {
      id: string | null
      created: boolean
    }
    const secondBody = (await second.json()) as {
      id: string | null
      created: boolean
    }

    expect(firstBody.id).toBeTruthy()
    expect(secondBody.id).toBe(firstBody.id)
    expect([firstBody.created, secondBody.created].sort()).toEqual([
      false,
      true,
    ])
    expect(sessions).toHaveLength(1)
  })

  it('does not recreate a first-visit sample after that owner deletes it', async () => {
    const { env, sessions } = createMockEnv()
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))

    const first = await bootstrapSample(env, 'First sample', cookie)
    const firstBody = (await first.json()) as { id: string; created: boolean }
    expect(firstBody.created).toBe(true)

    await worker.fetch(
      new Request(`https://example.com/api/sessions/${firstBody.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      }),
      env,
    )
    expect(sessions).toHaveLength(0)

    const second = await bootstrapSample(env, 'Replacement sample', cookie)
    await expect(second.json()).resolves.toMatchObject({
      id: null,
      created: false,
    })
    expect(sessions).toHaveLength(0)
  })

  it('does not recreate a deleted sample when the identical bootstrap request is retried', async () => {
    const { env, sessions } = createMockEnv()
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))
    const doc = createDoc('Same sample request')

    const first = await bootstrapSample(env, doc, cookie)
    const firstBody = (await first.json()) as { id: string; created: boolean }
    await worker.fetch(
      new Request(`https://example.com/api/sessions/${firstBody.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      }),
      env,
    )

    const retry = await bootstrapSample(env, doc, cookie)
    await expect(retry.json()).resolves.toMatchObject({
      id: null,
      created: false,
    })
    expect(sessions).toHaveLength(0)
  })

  it('removes a bootstrap marker when the session id collides', async () => {
    const doc = createDoc('Colliding sample')
    const collision: StoredSession = {
      id: doc.id,
      title: 'Other owner session',
      doc_json: serialize(createDoc('Other owner session')),
      version: 0,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      owner_hash: 'another-owner',
    }
    const { env, sessions, bootstraps } = createMockEnv([collision])
    const html = await worker.fetch(
      new Request('https://example.com/', { headers: { Accept: 'text/html' } }),
      env,
    )
    const cookie = asCookieHeader(getSetCookie(html))

    const first = await bootstrapSample(env, doc, cookie)
    await expect(first.json()).resolves.toMatchObject({
      id: null,
      created: false,
    })
    expect(bootstraps.size).toBe(0)

    const retry = await bootstrapSample(env, 'Retry with a new id', cookie)
    await expect(retry.json()).resolves.toMatchObject({ created: true })
    expect(sessions).toHaveLength(2)
  })

  it('creates D1 sessions using the serialized document id', async () => {
    const doc = createDoc('Worker map')
    const { env, runCalls } = createMockEnv()

    const response = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: serialize(doc) }),
      }),
      env,
    )
    const body = (await response.json()) as { id: string; title: string }

    expect(body).toMatchObject({ id: doc.id, title: 'Worker map' })
    expect(runCalls).toHaveLength(3)
    const sessionInsert = runCalls.find((call) =>
      call.sql.includes('INTO sessions'),
    )
    expect(sessionInsert?.params[0]).toBe(doc.id)
    expect(deserialize(String(sessionInsert?.params[2])).id).toBe(doc.id)
  })

  it('creates an HttpOnly anonymous owner cookie and stores only the owner hash', async () => {
    const { env, sessions } = createMockEnv()

    const response = await createSession(env, 'Private map')
    const setCookie = getSetCookie(response)
    const cookieValue = asCookieHeader(setCookie).split('=')[1]

    expect(setCookie).toContain('__Host-mml_anon_id=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=31536000')
    expect(cookieValue?.length).toBeGreaterThanOrEqual(43)
    expect(sessions[0]?.owner_hash).toBeTruthy()
    expect(sessions[0]?.owner_hash).not.toBe(cookieValue)
  })

  it('lists only sessions belonging to the current anonymous owner', async () => {
    const { env } = createMockEnv()

    const firstCreate = await createSession(env, 'First owner map')
    const firstCookie = asCookieHeader(getSetCookie(firstCreate))
    const secondCreate = await createSession(env, 'Second owner map')
    const secondCookie = asCookieHeader(getSetCookie(secondCreate))

    const firstList = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        headers: { Cookie: firstCookie },
      }),
      env,
    )
    const secondList = await worker.fetch(
      new Request('https://example.com/api/sessions', {
        headers: { Cookie: secondCookie },
      }),
      env,
    )

    await expect(firstList.json()).resolves.toMatchObject([
      { title: 'First owner map' },
    ])
    await expect(secondList.json()).resolves.toMatchObject([
      { title: 'Second owner map' },
    ])
  })

  it('does not load, update, or delete another anonymous owner session', async () => {
    const { env, sessions } = createMockEnv()

    const firstCreate = await createSession(env, 'Owner A map')
    const firstCookie = asCookieHeader(getSetCookie(firstCreate))
    const firstBody = (await firstCreate.json()) as { id: string }
    const secondCreate = await createSession(env, 'Owner B map')
    const secondCookie = asCookieHeader(getSetCookie(secondCreate))

    const crossLoad = await worker.fetch(
      new Request(`https://example.com/api/sessions/${firstBody.id}`, {
        headers: { Cookie: secondCookie },
      }),
      env,
    )
    expect(crossLoad.status).toBe(404)

    const updateDoc = createDoc('Hijack')
    updateDoc.id = firstBody.id
    const crossUpdate = await worker.fetch(
      new Request(`https://example.com/api/sessions/${firstBody.id}`, {
        method: 'PUT',
        headers: { Cookie: secondCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: serialize(updateDoc), expectedVersion: 0 }),
      }),
      env,
    )
    expect(crossUpdate.status).toBe(404)

    const crossDelete = await worker.fetch(
      new Request(`https://example.com/api/sessions/${firstBody.id}`, {
        method: 'DELETE',
        headers: { Cookie: secondCookie },
      }),
      env,
    )
    expect(crossDelete.status).toBe(200)

    const ownerLoad = await worker.fetch(
      new Request(`https://example.com/api/sessions/${firstBody.id}`, {
        headers: { Cookie: firstCookie },
      }),
      env,
    )
    expect(ownerLoad.status).toBe(200)
    expect(sessions.some((session) => session.id === firstBody.id)).toBe(true)
  })
})
