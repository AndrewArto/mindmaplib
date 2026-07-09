// Cloudflare Pages Function: D1 session CRUD for mindmaplib demo.
// This file is compiled to demo/dist/_worker.js by the build script.
// It handles /api/sessions* routes with a D1 binding (env.MINDMAP_DB).

interface D1Database {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all(): Promise<{ results: Record<string, unknown>[] }>
      run(): Promise<{ meta: Record<string, unknown> }>
    }
  }
}

interface Env {
  MINDMAP_DB: D1Database
  ANON_ID_SECRET: string
  ASSETS: { fetch: (req: Request) => Promise<Response> }
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Bootstrap the anonymous owner on the HTML document response before
    // the browser starts concurrent API calls from the demo shell.
    if (!path.startsWith('/api/sessions')) {
      const assetResponse = await env.ASSETS.fetch(request)
      const acceptsHtml = request.headers.get('Accept')?.includes('text/html')
      const isHtml = assetResponse.headers
        .get('Content-Type')
        ?.includes('text/html')

      if (!acceptsHtml && !isHtml) {
        return assetResponse
      }

      const owner = await getAnonymousOwner(request, env)
      if (!owner.setCookie) {
        return assetResponse
      }

      const headers = new Headers(assetResponse.headers)
      headers.append('Set-Cookie', owner.setCookie)
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      })
    }

    const owner = await getAnonymousOwner(request, env)

    // Parse session id from path: /api/sessions/:id
    const idMatch = path.match(/^\/api\/sessions\/(.+)$/)
    const sessionId = idMatch ? idMatch[1] : null

    // GET /api/sessions — list this anonymous owner's sessions
    if (request.method === 'GET' && !sessionId) {
      const stmt = env.MINDMAP_DB.prepare(
        'SELECT id, title, version, updated FROM sessions WHERE owner_hash = ? ORDER BY updated DESC LIMIT 50',
      )
      const result = await stmt.bind(owner.hash).all()
      return json(result.results, 200, owner)
    }

    // GET /api/sessions/:id — get one of this anonymous owner's sessions
    if (request.method === 'GET' && sessionId) {
      const stmt = env.MINDMAP_DB.prepare(
        'SELECT id, title, doc_json, version, created, updated FROM sessions WHERE id = ? AND owner_hash = ?',
      )
      const result = await stmt.bind(sessionId, owner.hash).all()
      if (!result.results || result.results.length === 0) {
        return json({ error: 'not found' }, 404, owner)
      }
      const row = result.results[0] as unknown as SessionRow
      return json({ id: row.id, doc: row.doc_json }, 200, owner)
    }

    // POST /api/sessions — create for this anonymous owner
    if (request.method === 'POST' && !sessionId) {
      const body = (await request.json()) as { doc: string }
      const { id: docId, title, version } = extractDocMeta(body.doc)
      const id = docId ?? crypto.randomUUID()
      const now = new Date().toISOString()

      const stmt = env.MINDMAP_DB.prepare(
        'INSERT INTO sessions (id, title, doc_json, version, created, updated, owner_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      await stmt.bind(id, title, body.doc, version, now, now, owner.hash).run()
      return json({ id, title, version }, 200, owner)
    }

    // PUT /api/sessions/:id — update this anonymous owner's session
    if (request.method === 'PUT' && sessionId) {
      const body = (await request.json()) as {
        doc: string
        expectedVersion?: number
      }
      const { title, version } = extractDocMeta(body.doc)
      const now = new Date().toISOString()

      if (body.expectedVersion !== undefined) {
        // Atomic: only update if the owner and version still match.
        const stmt = env.MINDMAP_DB.prepare(
          'UPDATE sessions SET title = ?, doc_json = ?, version = ?, updated = ? WHERE id = ? AND owner_hash = ? AND version = ?',
        )
        const result = await stmt
          .bind(
            title,
            body.doc,
            version,
            now,
            sessionId,
            owner.hash,
            body.expectedVersion,
          )
          .run()
        const changes = (result.meta as { changes?: number }).changes ?? 0
        if (changes === 0) {
          // Either not found for this owner, or version conflict — check which.
          const checkStmt = env.MINDMAP_DB.prepare(
            'SELECT version FROM sessions WHERE id = ? AND owner_hash = ?',
          )
          const checkResult = await checkStmt.bind(sessionId, owner.hash).all()
          if (!checkResult.results || checkResult.results.length === 0) {
            return json({ error: 'not found' }, 404, owner)
          }
          const existing = checkResult.results[0] as { version: number }
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

      // No version check — unconditional update, still scoped by owner.
      const stmt = env.MINDMAP_DB.prepare(
        'UPDATE sessions SET title = ?, doc_json = ?, version = ?, updated = ? WHERE id = ? AND owner_hash = ?',
      )
      const result = await stmt
        .bind(title, body.doc, version, now, sessionId, owner.hash)
        .run()
      const changes = (result.meta as { changes?: number }).changes ?? 0
      if (changes === 0) {
        return json({ error: 'not found' }, 404, owner)
      }
      return json(
        { saved: true, conflict: false, currentVersion: version },
        200,
        owner,
      )
    }

    // DELETE /api/sessions/:id
    if (request.method === 'DELETE' && sessionId) {
      const stmt = env.MINDMAP_DB.prepare(
        'DELETE FROM sessions WHERE id = ? AND owner_hash = ?',
      )
      await stmt.bind(sessionId, owner.hash).run()
      return json({ deleted: true }, 200, owner)
    }

    return json({ error: 'method not allowed' }, 405, owner)
  },
}
