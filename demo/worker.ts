// Cloudflare Pages Function: D1 session CRUD for mindmaplib demo.
// This file is compiled to demo/dist/_worker.js by the build script.
// It handles /api/sessions* routes with a D1 binding (env.MINDMAP_DB).

import {
  ApiRequestError,
  assertDocumentWriteRequestAllowed,
  assertValidSessionId,
  assertWriteProvenance,
  MAX_SESSIONS_GLOBAL,
  MAX_SESSIONS_PER_OWNER,
  readDocumentRequest,
} from './apiLimits'
import {
  getAnonymousOwner as resolveAnonymousOwner,
  runLegacyOwnerMigration,
  type AnonymousOwner,
} from './functions/anonymousOwner'

interface D1Result {
  results?: Record<string, unknown>[]
  meta?: Record<string, unknown>
}

interface D1PreparedStatement {
  all(): Promise<D1Result>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(sql: string): {
    bind(...params: unknown[]): D1PreparedStatement
  }
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
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

function json(body: unknown, status = 200, owner?: AnonymousOwner): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (owner?.setCookie) headers.append('Set-Cookie', owner.setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

async function getAnonymousOwner(
  request: Request,
  env: Env,
): Promise<AnonymousOwner> {
  return resolveAnonymousOwner(
    request,
    env,
    async (legacyHash, nextHash, now, expires) =>
      runLegacyOwnerMigration(
        (statements) =>
          env.MINDMAP_DB.batch(
            statements.map(({ sql, params }) =>
              env.MINDMAP_DB.prepare(sql).bind(...params),
            ),
          ),
        legacyHash,
        nextHash,
        now,
        expires,
      ),
  )
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

    const isSessionsCollection = path === '/api/sessions'
    const sessionItemMatch = path.match(/^\/api\/sessions\/([^/]+)$/)

    // Bootstrap the anonymous owner on the HTML document response before
    // the browser starts concurrent API calls from the demo shell.
    if (!isSessionsCollection && !sessionItemMatch) {
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

    const sessionId = sessionItemMatch?.[1] ?? null
    const methodIsAllowed = sessionId
      ? request.method === 'GET' ||
        request.method === 'PUT' ||
        request.method === 'DELETE'
      : request.method === 'GET' || request.method === 'POST'
    if (!methodIsAllowed) {
      return json({ error: 'method not allowed' }, 405)
    }

    let documentWriteBody: {
      doc: string
      bootstrapKind?: 'first-visit-sample'
      expectedVersion?: number
    } | null = null
    try {
      if (sessionId) assertValidSessionId(sessionId)
      if (request.method === 'POST' || request.method === 'PUT') {
        assertDocumentWriteRequestAllowed(request)
        documentWriteBody = await readDocumentRequest(request)
        if (
          request.method === 'PUT' &&
          extractDocMeta(documentWriteBody.doc).id !== sessionId
        ) {
          throw new ApiRequestError(
            'Document id must match the session id',
            400,
          )
        }
      } else if (request.method === 'DELETE') {
        assertWriteProvenance(request)
      }
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return json({ error: error.message }, error.status)
      }
      throw error
    }

    const owner = await getAnonymousOwner(request, env)

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
      const body = documentWriteBody!
      const { id: docId, title, version } = extractDocMeta(body.doc)
      const id = docId ?? crypto.randomUUID()
      const now = new Date().toISOString()

      if (body.bootstrapKind === 'first-visit-sample') {
        const claimId = crypto.randomUUID()
        const results = await env.MINDMAP_DB.batch([
          env.MINDMAP_DB.prepare(
            'INSERT OR IGNORE INTO owner_bootstraps (owner_hash, session_id, claim_id, created) VALUES (?, ?, ?, ?)',
          ).bind(owner.hash, id, claimId, now),
          env.MINDMAP_DB.prepare(
            'INSERT OR IGNORE INTO sessions (id, title, doc_json, version, created, updated, owner_hash) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM owner_bootstraps WHERE owner_hash = ? AND claim_id = ?) AND (SELECT COUNT(*) FROM sessions WHERE owner_hash = ?) < ? AND (SELECT COUNT(*) FROM sessions) < ?',
          ).bind(
            id,
            title,
            body.doc,
            version,
            now,
            now,
            owner.hash,
            owner.hash,
            claimId,
            owner.hash,
            MAX_SESSIONS_PER_OWNER,
            MAX_SESSIONS_GLOBAL,
          ),
          env.MINDMAP_DB.prepare(
            'DELETE FROM owner_bootstraps WHERE owner_hash = ? AND claim_id = ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE id = owner_bootstraps.session_id AND owner_hash = owner_bootstraps.owner_hash)',
          ).bind(owner.hash, claimId),
          env.MINDMAP_DB.prepare(
            'SELECT s.id, s.title, s.version, s.updated FROM owner_bootstraps b LEFT JOIN sessions s ON s.id = b.session_id AND s.owner_hash = b.owner_hash WHERE b.owner_hash = ?',
          ).bind(owner.hash),
        ])
        const bootstrapInsert = results[0]
        const sessionInsert = results[1]
        const bootstrapRows = results[3]?.results ?? []
        const bootstrap = bootstrapRows[0] as
          | {
              id: string | null
              title: string | null
              version: number | null
              updated: string | null
            }
          | undefined
        const created =
          (bootstrapInsert?.meta as { changes?: number } | undefined)
            ?.changes === 1 &&
          (sessionInsert?.meta as { changes?: number } | undefined)?.changes ===
            1 &&
          !!bootstrap?.id

        return json(
          {
            id: bootstrap?.id ?? null,
            title: bootstrap?.title ?? null,
            version: bootstrap?.version ?? null,
            updated: bootstrap?.updated ?? null,
            created,
          },
          200,
          owner,
        )
      }

      const claimId = crypto.randomUUID()
      const results = await env.MINDMAP_DB.batch([
        env.MINDMAP_DB.prepare(
          'INSERT OR IGNORE INTO owner_bootstraps (owner_hash, session_id, claim_id, created) VALUES (?, ?, ?, ?)',
        ).bind(owner.hash, id, claimId, now),
        env.MINDMAP_DB.prepare(
          'INSERT OR IGNORE INTO sessions (id, title, doc_json, version, created, updated, owner_hash) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM sessions WHERE owner_hash = ?) < ? AND (SELECT COUNT(*) FROM sessions) < ?',
        ).bind(
          id,
          title,
          body.doc,
          version,
          now,
          now,
          owner.hash,
          owner.hash,
          MAX_SESSIONS_PER_OWNER,
          MAX_SESSIONS_GLOBAL,
        ),
        env.MINDMAP_DB.prepare(
          'DELETE FROM owner_bootstraps WHERE owner_hash = ? AND claim_id = ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE id = ? AND owner_hash = ?)',
        ).bind(owner.hash, claimId, id, owner.hash),
        env.MINDMAP_DB.prepare(
          "SELECT CASE WHEN owner_hash = ? AND doc_json = ? THEN 'same' ELSE 'conflict' END AS status FROM sessions WHERE id = ? LIMIT 1",
        ).bind(owner.hash, body.doc, id),
      ])
      const inserted = (results[1]?.meta as { changes?: number } | undefined)
        ?.changes
      if (inserted !== 1) {
        const createStatus = (
          results[3]?.results?.[0] as { status?: unknown } | undefined
        )?.status
        if (createStatus === 'same') {
          return json({ id, title, version }, 200, owner)
        }
        if (createStatus === 'conflict') {
          return json({ error: 'Session id conflict' }, 409, owner)
        }
        return json({ error: 'Session limit reached' }, 429, owner)
      }
      return json({ id, title, version }, 200, owner)
    }

    // PUT /api/sessions/:id — update this anonymous owner's session
    if (request.method === 'PUT' && sessionId) {
      const body = documentWriteBody!
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

    return json({ error: 'method not allowed' }, 405)
  },
}
