import { expect, test, type Page } from '@playwright/test'

type NodeContent = {
  type: 'doc'
  content: Array<{
    type: 'paragraph'
    content: Array<{ type: 'text'; text: string }>
  }>
}

type DemoDoc = {
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
): DemoDoc['nodes'][string] {
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

function makeDoc(id: string, title: string, version: number): DemoDoc {
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
      risk: node('risk', 'root', 'Risk & adfa'),
    },
    version,
    meta: { title, created: updated, updated },
  }
}

const docs = [
  makeDoc('doc-copy', 'TripleA Digital enablement map copy', 15),
  makeDoc('doc-main', 'TripleA Digital enablement map', 100),
]

async function mockD1(page: Page): Promise<void> {
  await page.route('**/api/sessions', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          docs.map((doc) => ({
            id: doc.id,
            title: doc.meta.title,
            updated: doc.meta.updated,
            version: doc.version,
          })),
        ),
      })
      return
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: docs[0].id }),
    })
  })

  await page.route('**/api/sessions/*', async (route) => {
    const request = route.request()
    const id = new URL(request.url()).pathname.split('/').pop()
    const doc = docs.find((item) => item.id === id) ?? docs[0]
    if (request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: doc.id,
          doc: JSON.stringify({ schemaVersion: 1, doc }),
        }),
      })
      return
    }
    if (request.method() === 'PUT') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          saved: true,
          conflict: false,
          currentVersion: doc.version,
        }),
      })
      return
    }
    await route.fulfill({ status: 204 })
  })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await mockD1(page)
})

test('fit to screen keeps every rendered node inside the browser canvas with breathing room', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Saved to D1')).toBeVisible()

  await page.getByRole('button', { name: 'Fit to screen' }).click()
  await page.waitForTimeout(150)

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('.mml-canvas')
    if (!canvas) throw new Error('canvas missing')
    const canvasRect = canvas.getBoundingClientRect()
    const nodes = [...document.querySelectorAll<HTMLElement>('.mml-node')]
    if (nodes.length === 0) throw new Error('nodes missing')
    const rects = nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        text: node.textContent?.trim() ?? '',
        left: rect.left - canvasRect.left,
        top: rect.top - canvasRect.top,
        right: rect.right - canvasRect.left,
        bottom: rect.bottom - canvasRect.top,
      }
    })
    return {
      canvas: { width: canvasRect.width, height: canvasRect.height },
      rects,
    }
  })

  for (const rect of metrics.rects) {
    expect(rect.left, `${rect.text} left`).toBeGreaterThanOrEqual(8)
    expect(rect.top, `${rect.text} top`).toBeGreaterThanOrEqual(8)
    expect(rect.right, `${rect.text} right`).toBeLessThanOrEqual(
      metrics.canvas.width - 8,
    )
    expect(rect.bottom, `${rect.text} bottom`).toBeLessThanOrEqual(
      metrics.canvas.height - 8,
    )
  }
})

test('saved map rows keep current titles and actions inside the left panel', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page
      .locator('.session-button')
      .filter({ hasText: 'TripleA Digital enablement map copy' }),
  ).toBeVisible()

  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>('.session-list li')].map(
      (row) => {
        const rowRect = row.getBoundingClientRect()
        const titleButton = row.querySelector<HTMLElement>('.session-button')
        const title = row.querySelector<HTMLElement>('.session-button span')
        const actions = row.querySelector<HTMLElement>('.session-actions')
        if (!titleButton || !title || !actions) {
          throw new Error('session row missing expected elements')
        }
        const titleButtonRect = titleButton.getBoundingClientRect()
        const actionsRect = actions.getBoundingClientRect()
        return {
          rowRight: rowRect.right,
          titleRight: titleButtonRect.right,
          actionsRight: actionsRect.right,
          gap: actionsRect.left - titleButtonRect.right,
          titleClientWidth: title.clientWidth,
          titleScrollWidth: title.scrollWidth,
        }
      },
    )
  })

  expect(rows.length).toBeGreaterThanOrEqual(2)
  for (const row of rows) {
    expect(row.actionsRight).toBeLessThanOrEqual(row.rowRight)
    expect(row.gap).toBeGreaterThanOrEqual(0)
    expect(row.titleClientWidth + 1).toBeGreaterThanOrEqual(
      row.titleScrollWidth,
    )
  }
})

test('demo does not expose node-editing or outline-toolbar controls prematurely', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Saved to D1')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Add child' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add sibling' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Delete selected node' }),
  ).toHaveCount(0)
  await expect(page.getByPlaceholder('Search...')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Collapse all' })).toHaveCount(
    0,
  )
  await expect(page.getByRole('button', { name: 'Expand all' })).toHaveCount(0)
})

test('stacks workspace before the wider saved-map sidebar can clip toolbar controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 })
  await page.goto('/')
  await expect(page.locator('.status-badge')).toHaveText('Saved to D1')

  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    const mapCard = document.querySelector<HTMLElement>('.map-card')
    if (!sidebar || !mapCard) throw new Error('layout missing')
    const sidebarRect = sidebar.getBoundingClientRect()
    const mapRect = mapCard.getBoundingClientRect()
    return {
      sidebarBottom: sidebarRect.bottom,
      mapTop: mapRect.top,
      mapLeft: mapRect.left,
      sidebarLeft: sidebarRect.left,
    }
  })

  expect(layout.mapTop).toBeGreaterThanOrEqual(layout.sidebarBottom)
  expect(layout.mapLeft).toBe(layout.sidebarLeft)
})
