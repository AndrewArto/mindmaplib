import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
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
  const runCalls: RunCall[] = []
  const allCalls: RunCall[] = []

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
              all: async () => {
                allCalls.push({ sql, params })

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

                if (sql.includes('INSERT INTO sessions')) {
                  const [
                    id,
                    title,
                    doc_json,
                    version,
                    created,
                    updated,
                    owner_hash,
                  ] = params
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
    },
  }

  return { env, sessions, runCalls, allCalls }
}

function getSetCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('set-cookie missing')
  return cookie
}

function asCookieHeader(setCookie: string): string {
  return setCookie.split(';')[0] ?? setCookie
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
      headers: cookie ? { Cookie: cookie } : undefined,
      body: JSON.stringify({ doc: serialize(doc) }),
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
    expect(setCookie).toContain('mml_anon_id=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
  })
  it('creates D1 sessions using the serialized document id', async () => {
    const doc = createDoc('Worker map')
    const { env, runCalls } = createMockEnv()

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

  it('creates an HttpOnly anonymous owner cookie and stores only the owner hash', async () => {
    const { env, sessions } = createMockEnv()

    const response = await createSession(env, 'Private map')
    const setCookie = getSetCookie(response)
    const cookieValue = asCookieHeader(setCookie).split('=')[1]

    expect(setCookie).toContain('mml_anon_id=')
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
