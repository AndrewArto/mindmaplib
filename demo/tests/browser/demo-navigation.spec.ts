import { expect, test, type Page } from '@playwright/test'
import {
  mockD1,
  NAVIGATION_DOC_ID,
  NAVIGATION_FOCUSED_NODE_ID,
  NAVIGATION_FOCUSED_NODE_TEXT,
} from './browser-fixtures'

const visibleTreeOrder = [
  'TripleA AI enablement',
  'Strategy & operating model',
  'strategy capability 1',
  'strategy capability 2',
  'strategy capability 3',
  'Workflow automation',
  'workflow capability 1',
  'workflow capability 2',
  'workflow capability 3',
  'Custom software systems',
  'custom capability 1',
  'custom capability 2',
  'custom capability 3',
  'Risk & governance',
  'risk capability 1',
  'risk capability 2',
  NAVIGATION_FOCUSED_NODE_TEXT,
]

function canvas(page: Page) {
  return page.getByRole('application', { name: 'Mindmap canvas' })
}

function selectedNode(page: Page) {
  return page.locator('.mml-node--selected')
}

async function openNavigationDoc(
  page: Page,
  focusedNodeId?: string,
): Promise<void> {
  if (focusedNodeId) {
    await page.addInitScript(
      ({ docId, nodeId }) => {
        window.localStorage.setItem(
          `mindmaplib:last-focused-node:${docId}`,
          nodeId,
        )
      },
      { docId: NAVIGATION_DOC_ID, nodeId: focusedNodeId },
    )
  }
  await page.goto(`/?id=${NAVIGATION_DOC_ID}`)
  await expect(page.getByText('Saved to D1')).toBeVisible()
  await expect(canvas(page)).toBeFocused()
}

async function expectSelected(page: Page, text: string): Promise<void> {
  await expect(selectedNode(page)).toContainText(text)
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toContainText(text)
}

async function expectSelectedInsideCanvas(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const host = document.querySelector<HTMLElement>('.mml-canvas')
        const selected = document.querySelector<HTMLElement>(
          '.mml-node--selected',
        )
        if (!host || !selected) return false
        const canvasRect = host.getBoundingClientRect()
        const selectedRect = selected.getBoundingClientRect()
        return (
          selectedRect.left >= canvasRect.left &&
          selectedRect.top >= canvasRect.top &&
          selectedRect.right <= canvasRect.right &&
          selectedRect.bottom <= canvasRect.bottom
        )
      })
    })
    .toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await mockD1(page)
})

test('canvas arrows traverse the visible tree and keep selection on screen', async ({
  page,
}) => {
  await openNavigationDoc(page)
  await expectSelected(page, visibleTreeOrder[0]!)
  const distantNode = canvas(page).locator(
    `[data-node-id="${NAVIGATION_FOCUSED_NODE_ID}"]`,
  )
  await expect(distantNode).toHaveCount(0)

  for (const expected of visibleTreeOrder.slice(1)) {
    await page.keyboard.press('ArrowDown')
    await expectSelected(page, expected)
    await expect(canvas(page)).toBeFocused()
    await expectSelectedInsideCanvas(page)
  }

  await expect(distantNode).toHaveCount(1)
  await expect(distantNode).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expectSelected(page, visibleTreeOrder.at(-1)!)

  await page.keyboard.press('ArrowUp')
  await expectSelected(page, visibleTreeOrder.at(-2)!)
})

test('canvas directional navigation expands a collapsed branch', async ({
  page,
}) => {
  await openNavigationDoc(page)

  await page.keyboard.press('ArrowRight')
  await expectSelected(page, 'Strategy & operating model')

  const strategyItem = page.getByRole('treeitem', {
    name: /Strategy & operating model/,
  })
  await strategyItem.getByRole('button', { name: 'Collapse' }).click()
  await expect(strategyItem).toHaveAttribute('aria-expanded', 'false')

  await canvas(page).focus()
  await page.keyboard.press('ArrowRight')
  await expect(strategyItem).toHaveAttribute('aria-expanded', 'true')
  await expectSelected(page, 'strategy capability 1')

  await page.keyboard.press('ArrowLeft')
  await expectSelected(page, 'Strategy & operating model')
  await page.keyboard.press('ArrowLeft')
  await expectSelected(page, 'TripleA AI enablement')
})

test('editing captures arrows and Escape exits before deselecting', async ({
  page,
}) => {
  await openNavigationDoc(page)
  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'Strategy & operating model')

  await page.keyboard.press('F2')
  await expect(page.locator('.mml-node-content--editing')).toBeVisible()
  await expect(page.locator('.ProseMirror')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'Strategy & operating model')

  await page.keyboard.press('Escape')
  await expect(page.locator('.mml-node-content--editing')).toHaveCount(0)
  await expectSelected(page, 'Strategy & operating model')
  await expect(canvas(page)).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(selectedNode(page)).toHaveCount(0)
  await expect(
    page.locator('[role="treeitem"][aria-selected="true"]'),
  ).toHaveCount(0)
})

test('Enter commits editing and restores canvas keyboard navigation', async ({
  page,
}) => {
  await openNavigationDoc(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('F2')
  await expect(page.locator('.ProseMirror')).toBeFocused()

  await page.keyboard.type(' reviewed')
  await page.keyboard.press('Enter')

  await expect(page.locator('.mml-node-content--editing')).toHaveCount(0)
  await expectSelected(page, 'Strategy & operating model reviewed')
  await expect(canvas(page)).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'strategy capability 1')
})

test('Tab creates a child and Enter creates its adjacent sibling', async ({
  page,
}) => {
  await openNavigationDoc(page)
  const treeItems = page.locator('[role="treeitem"]')
  await expect(treeItems).toHaveCount(visibleTreeOrder.length)
  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'Strategy & operating model')

  await page.keyboard.press('Tab')
  await expect(treeItems).toHaveCount(visibleTreeOrder.length + 1)
  await expect(page.locator('.ProseMirror')).toBeFocused()
  await page.keyboard.type('Created child')
  await page.keyboard.press('Enter')
  const createdChild = page.getByRole('treeitem', { name: 'Created child' })
  await expect(createdChild).toHaveAttribute('aria-level', '3')
  await expectSelected(page, 'Created child')
  await expect(canvas(page)).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(treeItems).toHaveCount(visibleTreeOrder.length + 2)
  await expect(page.locator('.ProseMirror')).toBeFocused()
  await page.keyboard.type('Created sibling')
  await page.keyboard.press('Enter')
  const createdSibling = page.getByRole('treeitem', { name: 'Created sibling' })
  await expect(createdSibling).toHaveAttribute('aria-level', '3')
  await expectSelected(page, 'Created sibling')
  await expect(canvas(page)).toBeFocused()

  const createdOrder = await treeItems.evaluateAll((items) =>
    items.map(
      (item) =>
        item.querySelector('.mml-outline-excerpt')?.textContent?.trim() ?? '',
    ),
  )
  const createdChildIndex = createdOrder.indexOf('Created child')
  expect(createdChildIndex).toBeGreaterThan(
    createdOrder.indexOf('strategy capability 3'),
  )
  expect(createdChildIndex).toBeLessThan(
    createdOrder.indexOf('Workflow automation'),
  )
  expect(createdOrder.indexOf('Created sibling')).toBe(createdChildIndex + 1)
})

test('outline uses roving DOM focus and Enter returns focus to canvas', async ({
  page,
}) => {
  await openNavigationDoc(page)
  const tree = page.getByRole('tree', { name: 'Mindmap outline' })
  await tree.focus()

  await page.keyboard.press('End')
  await expect(page.locator('[role="treeitem"]:focus')).toContainText(
    NAVIGATION_FOCUSED_NODE_TEXT,
  )

  await page.keyboard.press('Home')
  await expect(page.locator('[role="treeitem"]:focus')).toContainText(
    'TripleA AI enablement',
  )

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[role="treeitem"]:focus')).toContainText(
    'Strategy & operating model',
  )

  await page.keyboard.press('Enter')
  await expectSelected(page, 'Strategy & operating model')
  await expect(canvas(page)).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'strategy capability 1')
})

test('outline toggle keeps native keyboard activation', async ({ page }) => {
  await openNavigationDoc(page)
  const strategyItem = page.getByRole('treeitem', {
    name: /Strategy & operating model/,
  })
  const collapse = strategyItem.getByRole('button', { name: 'Collapse' })
  await collapse.focus()

  await page.keyboard.press('Enter')

  await expect(strategyItem).toHaveAttribute('aria-expanded', 'false')
  await expect(
    strategyItem.getByRole('button', { name: 'Expand' }),
  ).toBeFocused()
})

test('outline Delete removes a focused leaf once and recovers focus', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openNavigationDoc(page)
  const tree = page.getByRole('tree', { name: 'Mindmap outline' })
  await tree.focus()
  await page.keyboard.press('End')
  await expect(page.locator('[role="treeitem"]:focus')).toContainText(
    NAVIGATION_FOCUSED_NODE_TEXT,
  )

  await page.keyboard.press('Delete')

  await expect(page.locator('[role="treeitem"]')).toHaveCount(
    visibleTreeOrder.length - 1,
  )
  await expect(
    page.getByRole('treeitem', { name: NAVIGATION_FOCUSED_NODE_TEXT }),
  ).toHaveCount(0)
  await expect(page.locator('[role="treeitem"]:focus')).toContainText(
    'Risk & governance',
  )
  expect(pageErrors).toEqual([])
})

test('outline Escape deselects without losing the roving tab stop', async ({
  page,
}) => {
  await openNavigationDoc(page)
  const tree = page.getByRole('tree', { name: 'Mindmap outline' })
  await tree.focus()
  await page.keyboard.press('End')
  const focusedItem = page.locator('[role="treeitem"]:focus')
  await expect(focusedItem).toContainText(NAVIGATION_FOCUSED_NODE_TEXT)

  await page.keyboard.press('Escape')

  await expect(selectedNode(page)).toHaveCount(0)
  await expect(focusedItem).toContainText(NAVIGATION_FOCUSED_NODE_TEXT)
  await expect(focusedItem).toHaveAttribute('tabindex', '0')
})

test('layout controls preserve distant selection and keyboard continuity', async ({
  page,
}) => {
  await openNavigationDoc(page, NAVIGATION_FOCUSED_NODE_ID)
  await expectSelected(page, NAVIGATION_FOCUSED_NODE_TEXT)

  for (const layoutName of ['Vertical tree', 'Radial', 'Horizontal tree']) {
    await page.getByRole('button', { name: layoutName }).click()
    await expectSelected(page, NAVIGATION_FOCUSED_NODE_TEXT)
    await expect(canvas(page)).toBeFocused()
    await expectSelectedInsideCanvas(page)

    await page.keyboard.press('ArrowUp')
    await expectSelected(page, 'risk capability 2')
    await page.keyboard.press('ArrowDown')
    await expectSelected(page, NAVIGATION_FOCUSED_NODE_TEXT)
  }
})

test('persisted selection is restored after reload with canvas focus', async ({
  page,
}) => {
  await openNavigationDoc(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'strategy capability 1')

  await page.reload()
  await expect(page.getByText('Saved to D1')).toBeVisible()
  await expectSelected(page, 'strategy capability 1')
  await expect(canvas(page)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expectSelected(page, 'strategy capability 2')
})

test('invalid persisted selection falls back to the root', async ({ page }) => {
  await openNavigationDoc(page, 'missing-node-id')
  await expectSelected(page, 'TripleA AI enablement')
  await expect(canvas(page)).toBeFocused()
})
