import { expect, test, type Page } from '@playwright/test'
import {
  navigationDoc,
  mockD1,
  NAVIGATION_DOC_ID,
  NAVIGATION_FOCUSED_NODE_ID,
  NAVIGATION_FOCUSED_NODE_TEXT,
} from './browser-fixtures'

async function expectRenderedNodesInsideCanvas(
  page: Page,
  expectedCount?: number,
): Promise<void> {
  await expect(async () => {
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>('.mml-canvas')
      if (!canvas) throw new Error('canvas missing')
      const canvasRect = canvas.getBoundingClientRect()
      const nodes = [...canvas.querySelectorAll<HTMLElement>('.mml-node')]
      if (nodes.length === 0) throw new Error('nodes missing')
      return {
        canvas: { width: canvasRect.width, height: canvasRect.height },
        rects: nodes.map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            text: node.textContent?.trim() ?? '',
            left: rect.left - canvasRect.left,
            top: rect.top - canvasRect.top,
            right: rect.right - canvasRect.left,
            bottom: rect.bottom - canvasRect.top,
          }
        }),
      }
    })

    if (expectedCount !== undefined) {
      expect(metrics.rects).toHaveLength(expectedCount)
    }
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
  }).toPass({ timeout: 5_000 })
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
  await expectRenderedNodesInsideCanvas(page)
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

test('layout switching keeps the whole map fitted when a distant node is focused', async ({
  page,
}) => {
  await page.addInitScript(
    ({ docId, nodeId }) => {
      window.localStorage.setItem(
        `mindmaplib:last-focused-node:${docId}`,
        nodeId,
      )
    },
    { docId: NAVIGATION_DOC_ID, nodeId: NAVIGATION_FOCUSED_NODE_ID },
  )
  await page.goto(`/?id=${NAVIGATION_DOC_ID}`)
  await expect(page.getByText('Saved to D1')).toBeVisible()
  await expect(page.locator('.mml-node--selected')).toContainText(
    NAVIGATION_FOCUSED_NODE_TEXT,
  )

  await page.getByRole('button', { name: 'Vertical tree' }).click()

  await expectRenderedNodesInsideCanvas(
    page,
    Object.keys(navigationDoc.nodes).length,
  )

  await expect(page.locator('.mml-node--selected')).toContainText(
    NAVIGATION_FOCUSED_NODE_TEXT,
  )
})
