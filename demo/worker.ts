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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function extractDocMeta(docJson: string): { title: string; version: number } {
  try {
    const parsed = JSON.parse(docJson) as {
      doc?: { meta?: { title?: string }; version?: number }
    }
    return {
      title: parsed.doc?.meta?.title ?? 'Untitled Mindmap',
      version: parsed.doc?.version ?? 0,
    }
  } catch {
    return { title: 'Untitled Mindmap', version: 0 }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Only handle /api/sessions*
    if (!path.startsWith('/api/sessions')) {
      return env.ASSETS.fetch(request)
    }

    // Parse session id from path: /api/sessions/:id
    const idMatch = path.match(/^\/api\/sessions\/(.+)$/)
    const sessionId = idMatch ? idMatch[1] : null

    // GET /api/sessions — list all
    if (request.method === 'GET' && !sessionId) {
      const stmt = env.MINDMAP_DB.prepare(
        'SELECT id, title, version, updated FROM sessions ORDER BY updated DESC LIMIT 50',
      )
      const result = await stmt.bind().all()
      return json(result.results)
    }

    // GET /api/sessions/:id — get one
    if (request.method === 'GET' && sessionId) {
      const stmt = env.MINDMAP_DB.prepare(
        'SELECT id, title, doc_json, version, created, updated FROM sessions WHERE id = ?',
      )
      const result = await stmt.bind(sessionId).all()
      if (!result.results || result.results.length === 0) {
        return json({ error: 'not found' }, 404)
      }
      const row = result.results[0] as unknown as SessionRow
      return json({ id: row.id, doc: row.doc_json })
    }

    // POST /api/sessions — create
    if (request.method === 'POST' && !sessionId) {
      const body = (await request.json()) as { doc: string }
      const { title, version } = extractDocMeta(body.doc)
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      const stmt = env.MINDMAP_DB.prepare(
        'INSERT INTO sessions (id, title, doc_json, version, created, updated) VALUES (?, ?, ?, ?, ?, ?)',
      )
      await stmt.bind(id, title, body.doc, version, now, now).run()
      return json({ id, title, version })
    }

    // PUT /api/sessions/:id — update
    if (request.method === 'PUT' && sessionId) {
      const body = (await request.json()) as {
        doc: string
        expectedVersion?: number
      }
      const { title, version } = extractDocMeta(body.doc)

      if (body.expectedVersion !== undefined) {
        const checkStmt = env.MINDMAP_DB.prepare(
          'SELECT version FROM sessions WHERE id = ?',
        )
        const checkResult = await checkStmt.bind(sessionId).all()
        if (!checkResult.results || checkResult.results.length === 0) {
          return json({ error: 'not found' }, 404)
        }
        const existing = checkResult.results[0] as { version: number }
        if (existing.version !== body.expectedVersion) {
          return json(
            { saved: false, conflict: true, currentVersion: existing.version },
            409,
          )
        }
      }

      const now = new Date().toISOString()
      const stmt = env.MINDMAP_DB.prepare(
        'UPDATE sessions SET title = ?, doc_json = ?, version = ?, updated = ? WHERE id = ?',
      )
      await stmt.bind(title, body.doc, version, now, sessionId).run()
      return json({ saved: true, conflict: false, currentVersion: version })
    }

    // DELETE /api/sessions/:id
    if (request.method === 'DELETE' && sessionId) {
      const stmt = env.MINDMAP_DB.prepare('DELETE FROM sessions WHERE id = ?')
      await stmt.bind(sessionId).run()
      return json({ deleted: true })
    }

    return json({ error: 'method not allowed' }, 405)
  },
}
