import type { Page } from '@playwright/test'

type NodeContent = {
  type: 'doc'
  content: Array<{
    type: 'paragraph'
    content: Array<{ type: 'text'; text: string }>
  }>
}

export type BrowserDemoDoc = {
  id: string
  rootId: string
  nodes: Record<
    string,
    {
      id: string
      parentId: string | null
      position: { x: number; y: number } | null
      manualPosition: boolean
      content: NodeContent
      collapsed: boolean
      childOrder: string[]
    }
  >
  version: number
  meta: { title: string; created: string; updated: string }
}

const updated = '2026-07-09T08:26:00.000Z'

function paragraph(text: string): NodeContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

function node(
  id: string,
  parentId: string | null,
  text: string,
  childOrder: string[] = [],
): BrowserDemoDoc['nodes'][string] {
  return {
    id,
    parentId,
    position: null,
    manualPosition: false,
    content: paragraph(text),
    collapsed: false,
    childOrder,
  }
}

function makeDoc(id: string, title: string, version: number): BrowserDemoDoc {
  return {
    id,
    rootId: 'root',
    nodes: {
      root: node('root', null, 'TripleA AI enablement', [
        'strategy',
        'workflow',
        'custom',
        'risk',
      ]),
      strategy: node('strategy', 'root', 'Strategy & operating model'),
      workflow: node('workflow', 'root', 'Workflow automation'),
      custom: node('custom', 'root', 'Custom software systems'),
      risk: node('risk', 'root', 'Risk & governance'),
    },
    version,
    meta: { title, created: updated, updated },
  }
}

function makeNavigationDoc(
  id: string,
  title: string,
  version: number,
): BrowserDemoDoc {
  const doc = makeDoc(id, title, version)
  const branchIds = ['strategy', 'workflow', 'custom', 'risk']
  for (const [branchIndex, branchId] of branchIds.entries()) {
    const childIds = Array.from(
      { length: 3 },
      (_, childIndex) => `${branchId}-${childIndex + 1}`,
    )
    doc.nodes[branchId]!.childOrder = childIds
    for (const [childIndex, childId] of childIds.entries()) {
      doc.nodes[childId] = node(
        childId,
        branchId,
        branchIndex === branchIds.length - 1 &&
          childIndex === childIds.length - 1
          ? 'Focused third-party governance responsibility'
          : `${branchId} capability ${childIndex + 1}`,
      )
    }
  }
  return doc
}

export const NAVIGATION_DOC_ID = 'doc-main'
export const NAVIGATION_FOCUSED_NODE_ID = 'risk-3'
export const NAVIGATION_FOCUSED_NODE_TEXT =
  'Focused third-party governance responsibility'

export const navigationDoc = makeNavigationDoc(
  NAVIGATION_DOC_ID,
  'TripleA Digital enablement map',
  100,
)

export const browserDocs = [
  makeDoc('doc-copy', 'TripleA Digital enablement map copy', 15),
  navigationDoc,
]

const DEMO_ORIGIN = 'http://127.0.0.1:4173'

function cloneDoc(doc: BrowserDemoDoc): BrowserDemoDoc {
  return JSON.parse(JSON.stringify(doc)) as BrowserDemoDoc
}

function parseSerializedDoc(value: unknown): BrowserDemoDoc | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as {
      schemaVersion?: number
      doc?: BrowserDemoDoc
    }
    if (parsed.schemaVersion !== 1 || !parsed.doc?.id) return null
    return parsed.doc
  } catch {
    return null
  }
}

export async function mockD1(
  page: Page,
  documents: BrowserDemoDoc[] = browserDocs,
): Promise<void> {
  const store = new Map(
    documents.map((doc) => [doc.id, cloneDoc(doc)] as const),
  )
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })

  await page.route(`${DEMO_ORIGIN}/api/sessions`, async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill(
        json(
          [...store.values()].map((doc) => ({
            id: doc.id,
            title: doc.meta.title,
            updated: doc.meta.updated,
            version: doc.version,
          })),
        ),
      )
      return
    }
    if (request.method() !== 'POST') {
      await route.fulfill(json({ error: 'method not allowed' }, 405))
      return
    }

    let body: { doc?: unknown; bootstrapKind?: unknown }
    try {
      body = request.postDataJSON() as typeof body
    } catch {
      await route.fulfill(json({ error: 'invalid JSON body' }, 400))
      return
    }
    const doc = parseSerializedDoc(body.doc)
    if (!doc) {
      await route.fulfill(json({ error: 'invalid serialized document' }, 400))
      return
    }
    if (store.has(doc.id)) {
      await route.fulfill(json({ error: 'session already exists' }, 409))
      return
    }
    store.set(doc.id, cloneDoc(doc))
    if (body.bootstrapKind === 'first-visit-sample') {
      await route.fulfill(
        json(
          {
            id: doc.id,
            title: doc.meta.title,
            version: doc.version,
            updated: doc.meta.updated,
            created: true,
          },
          201,
        ),
      )
      return
    }
    await route.fulfill(json({ id: doc.id }, 201))
  })

  await page.route(`${DEMO_ORIGIN}/api/sessions/*`, async (route) => {
    const request = route.request()
    const id = decodeURIComponent(
      new URL(request.url()).pathname.split('/').pop()!,
    )
    const existing = store.get(id)

    if (request.method() === 'GET') {
      if (!existing) {
        await route.fulfill(json({ error: 'session not found' }, 404))
        return
      }
      await route.fulfill(
        json({
          id: existing.id,
          doc: JSON.stringify({ schemaVersion: 1, doc: existing }),
        }),
      )
      return
    }

    if (request.method() === 'PUT') {
      if (!existing) {
        await route.fulfill(json({ error: 'session not found' }, 404))
        return
      }
      let body: { doc?: unknown; expectedVersion?: unknown }
      try {
        body = request.postDataJSON() as typeof body
      } catch {
        await route.fulfill(json({ error: 'invalid JSON body' }, 400))
        return
      }
      const doc = parseSerializedDoc(body.doc)
      if (!doc || doc.id !== id) {
        await route.fulfill(json({ error: 'invalid serialized document' }, 400))
        return
      }
      if (
        typeof body.expectedVersion !== 'number' ||
        body.expectedVersion !== existing.version
      ) {
        await route.fulfill(
          json({ currentVersion: existing.version, conflict: true }, 409),
        )
        return
      }
      store.set(id, cloneDoc(doc))
      await route.fulfill(
        json({
          saved: true,
          conflict: false,
          currentVersion: doc.version,
        }),
      )
      return
    }

    if (request.method() === 'DELETE') {
      if (!existing) {
        await route.fulfill(json({ error: 'session not found' }, 404))
        return
      }
      store.delete(id)
      await route.fulfill({ status: 204 })
      return
    }

    await route.fulfill(json({ error: 'method not allowed' }, 405))
  })
}
