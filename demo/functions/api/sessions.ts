// Pages Function: /api/sessions — CRUD for mindmap sessions in D1.
// Binding: env.MINDMAP_DB (D1 database)
//
// Routes:
//   GET    /api/sessions           → list this anonymous owner's sessions
//   POST   /api/sessions           → create new session for this anonymous owner
//   GET    /api/sessions/:id       → get session doc for this anonymous owner
//   PUT    /api/sessions/:id       → update session (with optimistic concurrency)
//   DELETE /api/sessions/:id       → delete session for this anonymous owner

interface D1Result {
  results?: Array<Record<string, unknown>>
  meta?: Record<string, unknown>
}

interface Env {
  MINDMAP_DB: D1Database
  ANON_ID_SECRET: string
}

interface SessionRow {
  id: string
  title: string
  doc_json: string
  version: number
  created: string
  updated: string
}

type AnonymousOwner = {
  hash: string
  setCookie?: string
}

const ANON_COOKIE_NAME = 'mml_anon_id'
const ANON_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const ANON_COOKIE_VALUE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/

function json(body: unknown, status = 200, owner?: AnonymousOwner): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (owner?.setCookie) {
    headers.append('Set-Cookie', owner.setCookie)
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies

  for (const pair of header.split(';')) {
    const [rawName, ...rawValue] = pair.trim().split('=')
    if (!rawName || rawValue.length === 0) continue
    cookies[rawName] = rawValue.join('=')
  }

  return cookies
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function makeAnonymousToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

async function getAnonymousOwner(
  request: Request,
  env: Env,
): Promise<AnonymousOwner> {
  if (!env.ANON_ID_SECRET) {
    throw new Error('ANON_ID_SECRET is not configured')
  }

  const cookies = parseCookies(request.headers.get('Cookie'))
  const existingToken = cookies[ANON_COOKIE_NAME]
  const token =
    existingToken && ANON_COOKIE_VALUE_PATTERN.test(existingToken)
      ? existingToken
      : makeAnonymousToken()
  const hash = await hmacSha256(env.ANON_ID_SECRET, token)

  if (token === existingToken) {
    return { hash }
  }

  return {
    hash,
    setCookie: `${ANON_COOKIE_NAME}=${token}; Path=/; Max-Age=${ANON_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  }
}

async function queryDB(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<D1Result> {
  const stmt = env.MINDMAP_DB.prepare(sql)
  const result = await stmt.bind(...params).all()
  return { results: result.results, meta: result.meta }
}

async function runDB(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<D1Result> {
  const stmt = env.MINDMAP_DB.prepare(sql)
  const result = await stmt.bind(...params).run()
  return { results: result.results, meta: result.meta }
}

function extractDocMeta(docJson: string): {
  id: string | null
  title: string
  version: number
} {
  try {
    const parsed = JSON.parse(docJson) as {
      doc?: { id?: string; meta?: { title?: string }; version?: number }
    }
    return {
      id:
        typeof parsed.doc?.id === 'string' && parsed.doc.id.length > 0
          ? parsed.doc.id
          : null,
      title: parsed.doc?.meta?.title ?? 'Untitled Mindmap',
      version: parsed.doc?.version ?? 0,
    }
  } catch {
    return { id: null, title: 'Untitled Mindmap', version: 0 }
  }
}

// Handle /api/sessions and /api/sessions/:id
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const owner = await getAnonymousOwner(request, env)
  const id = params.id as string | undefined

  if (id) {
    const { results } = await queryDB(
      env,
      'SELECT id, title, doc_json, version, created, updated FROM sessions WHERE id = ? AND owner_hash = ?',
      [id, owner.hash],
    )
    if (!results || results.length === 0) {
      return json({ error: 'not found' }, 404, owner)
    }
    const row = results[0] as SessionRow
    return json({ id: row.id, doc: row.doc_json }, 200, owner)
  }

  const { results } = await queryDB(
    env,
    'SELECT id, title, version, updated FROM sessions WHERE owner_hash = ? ORDER BY updated DESC LIMIT 50',
    [owner.hash],
  )
  return json(results || [], 200, owner)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const owner = await getAnonymousOwner(request, env)
  const body = (await request.json()) as { doc: string }
  const { id: docId, title, version } = extractDocMeta(body.doc)
  const id = docId ?? crypto.randomUUID()
  const now = new Date().toISOString()

  await runDB(
    env,
    'INSERT INTO sessions (id, title, doc_json, version, created, updated, owner_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, title, body.doc, version, now, now, owner.hash],
  )

  return json({ id, title, version }, 200, owner)
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const owner = await getAnonymousOwner(request, env)
  const id = params.id as string
  const body = (await request.json()) as {
    doc: string
    expectedVersion?: number
  }
  const { title, version } = extractDocMeta(body.doc)
  const now = new Date().toISOString()

  if (body.expectedVersion !== undefined) {
    const result = await runDB(
      env,
      'UPDATE sessions SET title = ?, doc_json = ?, version = ?, updated = ? WHERE id = ? AND owner_hash = ? AND version = ?',
      [title, body.doc, version, now, id, owner.hash, body.expectedVersion],
    )

    const changes = result.meta?.changes
    if (changes === 0) {
      const { results } = await queryDB(
        env,
        'SELECT version FROM sessions WHERE id = ? AND owner_hash = ?',
        [id, owner.hash],
      )
      if (!results || results.length === 0) {
        return json({ error: 'not found' }, 404, owner)
      }
      const existing = results[0] as { version: number }
      return json(
        { saved: false, conflict: true, currentVersion: existing.version },
        409,
        owner,
      )
    }

    return json(
      { saved: true, conflict: false, currentVersion: version },
      200,
      owner,
    )
  }

  const result = await runDB(
    env,
    'UPDATE sessions SET title = ?, doc_json = ?, version = ?, updated = ? WHERE id = ? AND owner_hash = ?',
    [title, body.doc, version, now, id, owner.hash],
  )

  const changes = result.meta?.changes
  if (changes === 0) {
    return json({ error: 'not found' }, 404, owner)
  }

  return json(
    { saved: true, conflict: false, currentVersion: version },
    200,
    owner,
  )
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const owner = await getAnonymousOwner(request, env)
  const id = params.id as string
  await runDB(env, 'DELETE FROM sessions WHERE id = ? AND owner_hash = ?', [
    id,
    owner.hash,
  ])
  return json({ deleted: true }, 200, owner)
}
