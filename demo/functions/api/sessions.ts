// Pages Function: /api/sessions — CRUD for mindmap sessions in D1.
// Binding: env.MINDMAP_DB (D1 database)
//
// Routes:
//   GET    /api/sessions           → list all sessions
//   POST   /api/sessions           → create new session
//   GET    /api/sessions/:id       → get session doc
//   PUT    /api/sessions/:id       → update session (with optimistic concurrency)
//   DELETE /api/sessions/:id       → delete session

interface D1Result {
  results?: Array<Record<string, unknown>>
  meta?: Record<string, unknown>
}

interface Env {
  MINDMAP_DB: D1Database
}

interface SessionRow {
  id: string
  title: string
  doc_json: string
  version: number
  created: string
  updated: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  const { env, params } = context
  const id = params.id as string | undefined

  if (id) {
    const { results } = await queryDB(
      env,
      'SELECT id, title, doc_json, version, created, updated FROM sessions WHERE id = ?',
      [id],
    )
    if (!results || results.length === 0) {
      return json({ error: 'not found' }, 404)
    }
    const row = results[0] as SessionRow
    return json({ id: row.id, doc: row.doc_json })
  }

  const { results } = await queryDB(
    env,
    'SELECT id, title, version, updated FROM sessions ORDER BY updated DESC LIMIT 50',
  )
  return json(results || [])
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const body = (await request.json()) as { doc: string }
  const { id: docId, title, version } = extractDocMeta(body.doc)
  const id = docId ?? crypto.randomUUID()
  const now = new Date().toISOString()

  await runDB(
    env,
    'INSERT INTO sessions (id, title, doc_json, version, created, updated) VALUES (?, ?, ?, ?, ?, ?)',
    [id, title, body.doc, version, now, now],
  )

  return json({ id, title, version })
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const id = params.id as string
  const body = (await request.json()) as {
    doc: string
    expectedVersion?: number
  }
  const { title, version } = extractDocMeta(body.doc)

  if (body.expectedVersion !== undefined) {
    const { results } = await queryDB(
      env,
      'SELECT version FROM sessions WHERE id = ?',
      [id],
    )
    if (!results || results.length === 0) {
      return json({ error: 'not found' }, 404)
    }
    const existing = results[0] as { version: number }
    if (existing.version !== body.expectedVersion) {
      return json(
        { saved: false, conflict: true, currentVersion: existing.version },
        409,
      )
    }
  }

  const now = new Date().toISOString()
  const result = await runDB(
    env,
    'UPDATE sessions SET title = ?, doc_json = ?, version = ?, updated = ? WHERE id = ?',
    [title, body.doc, version, now, id],
  )

  const changes = result.meta?.changes
  if (changes === 0) {
    return json({ error: 'not found' }, 404)
  }

  return json({ saved: true, conflict: false, currentVersion: version })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, params } = context
  const id = params.id as string
  await runDB(env, 'DELETE FROM sessions WHERE id = ?', [id])
  return json({ deleted: true })
}
