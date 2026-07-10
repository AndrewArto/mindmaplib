// Shared Pages Functions CRUD implementation for mindmap sessions in D1.
// Binding: env.MINDMAP_DB (D1 database)
//
// Routes:
//   GET    /api/sessions           → list this anonymous owner's sessions
//   POST   /api/sessions           → create new session for this anonymous owner
//   GET    /api/sessions/:id       → get session doc for this anonymous owner
//   PUT    /api/sessions/:id       → update session (with optimistic concurrency)
//   DELETE /api/sessions/:id       → delete session for this anonymous owner

import {
  getAnonymousOwner,
  runLegacyOwnerMigration,
  type AnonymousOwner,
} from '../functions/anonymousOwner'
import {
  ApiRequestError,
  assertDocumentWriteRequestAllowed,
  assertValidSessionId,
  assertWriteProvenance,
  MAX_SESSIONS_GLOBAL,
  MAX_SESSIONS_PER_OWNER,
  readDocumentRequest,
} from '../apiLimits'

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

function json(body: unknown, status = 200, owner?: AnonymousOwner): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (owner?.setCookie) headers.append('Set-Cookie', owner.setCookie)
  return new Response(JSON.stringify(body), { status, headers })
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

async function getRequestOwner(
  request: Request,
  env: Env,
): Promise<AnonymousOwner> {
  return getAnonymousOwner(
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

// Handle /api/sessions and /api/sessions/:id
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  let id: string | undefined
  try {
    if (params.id !== undefined) {
      assertValidSessionId(params.id)
      id = params.id
    }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
  const owner = await getRequestOwner(request, env)

  if (id) {
    const { results } = await queryDB(
      env,
      'SELECT id, title, doc_json, version, created, updated FROM sessions WHERE id = ? AND owner_hash = ?',
      [id, owner.hash],
    )
    if (!results || results.length === 0) {
      return json({ error: 'not found' }, 404, owner)
    }
    const row = results[0] as unknown as SessionRow
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
  try {
    assertDocumentWriteRequestAllowed(request)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
  let body: { doc: string; bootstrapKind?: 'first-visit-sample' }
  try {
    body = await readDocumentRequest(request)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
  const owner = await getRequestOwner(request, env)
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
      bootstrapInsert?.meta?.changes === 1 &&
      sessionInsert?.meta?.changes === 1 &&
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
  if (results[1]?.meta?.changes !== 1) {
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

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  let id: string
  try {
    assertValidSessionId(params.id)
    id = params.id
    assertDocumentWriteRequestAllowed(request)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
  let body: { doc: string; expectedVersion?: number }
  try {
    body = await readDocumentRequest(request)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
  const documentMeta = extractDocMeta(body.doc)
  if (documentMeta.id !== id) {
    return json({ error: 'Document id must match the session id' }, 400)
  }
  const owner = await getRequestOwner(request, env)
  const { title, version } = documentMeta
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
  let id: string
  try {
    assertValidSessionId(params.id)
    id = params.id
    assertWriteProvenance(request)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return json({ error: error.message }, error.status)
    }
    throw error
  }
  const owner = await getRequestOwner(request, env)
  await runDB(env, 'DELETE FROM sessions WHERE id = ? AND owner_hash = ?', [
    id,
    owner.hash,
  ])
  return json({ deleted: true }, 200, owner)
}
