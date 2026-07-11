import { expect, test, type Page } from '@playwright/test'
import {
  marqueeDoc,
  MARQUEE_CONTROL_ID,
  MARQUEE_DOC_ID,
  MARQUEE_FIRST_ID,
  MARQUEE_SECOND_ID,
  mockD1,
} from './browser-fixtures'

const node = (page: Page, id: string) =>
  page.locator(`.mml-node[data-node-id="${id}"]`)

async function box(page: Page, id: string) {
  const value = await node(page, id).boundingBox()
  if (!value) throw new Error(`node ${id} is not rendered`)
  return value
}

async function selectedIds(page: Page): Promise<string[]> {
  return page.locator('.mml-node--selected').evaluateAll((nodes) =>
    nodes
      .map((item) => item.getAttribute('data-node-id') ?? '')
      .filter(Boolean)
      .sort(),
  )
}

async function openMarqueeDoc(page: Page): Promise<void> {
  await mockD1(page, [marqueeDoc])
  await page.goto(`/?id=${MARQUEE_DOC_ID}`)
  await expect(page.getByText('Saved to D1')).toBeVisible()
  await expect(
    page.getByRole('application', { name: 'Mindmap canvas' }),
  ).toBeFocused()
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
})

test('Shift plus left drag selects nodes and group drag moves them as one undoable transaction', async ({
  page,
}) => {
  await openMarqueeDoc(page)
  const canvas = page.getByRole('application', { name: 'Mindmap canvas' })
  const firstBeforeSelection = await box(page, MARQUEE_FIRST_ID)
  const secondBeforeSelection = await box(page, MARQUEE_SECOND_ID)
  const viewport = page.locator('.mml-canvas-viewport')
  const transformBefore = await viewport.evaluate(
    (element) => (element as HTMLElement).style.transform,
  )

  const start = {
    x: Math.min(firstBeforeSelection.x, secondBeforeSelection.x) - 8,
    y: Math.min(firstBeforeSelection.y, secondBeforeSelection.y) - 8,
  }
  const end = {
    x:
      Math.max(
        firstBeforeSelection.x + firstBeforeSelection.width,
        secondBeforeSelection.x + secondBeforeSelection.width,
      ) + 8,
    y:
      Math.max(
        firstBeforeSelection.y + firstBeforeSelection.height,
        secondBeforeSelection.y + secondBeforeSelection.height,
      ) + 8,
  }

  await page.keyboard.down('Shift')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(end.x, end.y, { steps: 6 })

  await expect(page.locator('.mml-selection-marquee')).toBeVisible()
  await expect
    .poll(() => selectedIds(page))
    .toEqual([MARQUEE_FIRST_ID, MARQUEE_SECOND_ID].sort())
  await expect(canvas).toBeFocused()
  expect(
    await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    ),
  ).toBe(transformBefore)

  await page.mouse.up({ button: 'left' })
  await page.keyboard.up('Shift')

  await expect(page.locator('.mml-selection-marquee')).toHaveCount(0)
  expect(await selectedIds(page)).toEqual(
    [MARQUEE_FIRST_ID, MARQUEE_SECOND_ID].sort(),
  )
  await expect(node(page, MARQUEE_CONTROL_ID)).not.toHaveClass(
    /mml-node--selected/,
  )

  const firstBeforeDrag = await box(page, MARQUEE_FIRST_ID)
  const secondBeforeDrag = await box(page, MARQUEE_SECOND_ID)
  const controlBeforeDrag = await box(page, MARQUEE_CONTROL_ID)
  const delta = { x: 72, y: 44 }

  await page.mouse.move(
    firstBeforeDrag.x + firstBeforeDrag.width / 2,
    firstBeforeDrag.y + firstBeforeDrag.height / 2,
  )
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(
    firstBeforeDrag.x + firstBeforeDrag.width / 2 + delta.x,
    firstBeforeDrag.y + firstBeforeDrag.height / 2 + delta.y,
    { steps: 6 },
  )
  await page.mouse.up({ button: 'left' })

  const firstAfterDrag = await box(page, MARQUEE_FIRST_ID)
  const secondAfterDrag = await box(page, MARQUEE_SECOND_ID)
  const controlAfterDrag = await box(page, MARQUEE_CONTROL_ID)
  expect(firstAfterDrag.x - firstBeforeDrag.x).toBeCloseTo(delta.x, 0)
  expect(firstAfterDrag.y - firstBeforeDrag.y).toBeCloseTo(delta.y, 0)
  expect(secondAfterDrag.x - secondBeforeDrag.x).toBeCloseTo(delta.x, 0)
  expect(secondAfterDrag.y - secondBeforeDrag.y).toBeCloseTo(delta.y, 0)
  expect(secondAfterDrag.x - firstAfterDrag.x).toBeCloseTo(
    secondBeforeDrag.x - firstBeforeDrag.x,
    0,
  )
  expect(controlAfterDrag.x).toBeCloseTo(controlBeforeDrag.x, 0)
  expect(controlAfterDrag.y).toBeCloseTo(controlBeforeDrag.y, 0)

  await page.keyboard.press('Control+z')
  const firstAfterUndo = await box(page, MARQUEE_FIRST_ID)
  const secondAfterUndo = await box(page, MARQUEE_SECOND_ID)
  expect(firstAfterUndo.x).toBeCloseTo(firstBeforeDrag.x, 0)
  expect(firstAfterUndo.y).toBeCloseTo(firstBeforeDrag.y, 0)
  expect(secondAfterUndo.x).toBeCloseTo(secondBeforeDrag.x, 0)
  expect(secondAfterUndo.y).toBeCloseTo(secondBeforeDrag.y, 0)

  await page.keyboard.press('Control+Shift+z')
  const firstAfterRedo = await box(page, MARQUEE_FIRST_ID)
  const secondAfterRedo = await box(page, MARQUEE_SECOND_ID)
  expect(firstAfterRedo.x).toBeCloseTo(firstAfterDrag.x, 0)
  expect(firstAfterRedo.y).toBeCloseTo(firstAfterDrag.y, 0)
  expect(secondAfterRedo.x).toBeCloseTo(secondAfterDrag.x, 0)
  expect(secondAfterRedo.y).toBeCloseTo(secondAfterDrag.y, 0)

  await page.getByRole('button', { name: 'Vertical tree' }).click()
  await expect
    .poll(() => selectedIds(page))
    .toEqual([MARQUEE_FIRST_ID, MARQUEE_SECOND_ID].sort())
  const firstAfterLayout = await box(page, MARQUEE_FIRST_ID)
  expect(
    Math.hypot(
      firstAfterLayout.x - firstAfterRedo.x,
      firstAfterLayout.y - firstAfterRedo.y,
    ),
  ).toBeGreaterThan(20)
  await expect(canvas).toBeFocused()
})

test('ordinary left drag pans while right drag and a tiny Shift drag do nothing', async ({
  page,
}) => {
  await openMarqueeDoc(page)
  const canvas = page.getByRole('application', { name: 'Mindmap canvas' })
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('canvas geometry missing')
  const point = {
    x: canvasBox.x + canvasBox.width - 16,
    y: canvasBox.y + canvasBox.height - 16,
  }
  const viewport = page.locator('.mml-canvas-viewport')
  const transformBefore = await viewport.evaluate(
    (element) => (element as HTMLElement).style.transform,
  )
  const selectionBefore = await selectedIds(page)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(point.x - 80, point.y - 50, { steps: 3 })
  await page.mouse.up({ button: 'right' })

  expect(
    await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    ),
  ).toBe(transformBefore)
  expect(await selectedIds(page)).toEqual(selectionBefore)

  await page.keyboard.down('Shift')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(point.x + 3, point.y + 2)
  await page.mouse.up({ button: 'left' })
  await page.keyboard.up('Shift')

  await expect(page.locator('.mml-selection-marquee')).toHaveCount(0)
  expect(await selectedIds(page)).toEqual(selectionBefore)
  expect(
    await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    ),
  ).toBe(transformBefore)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(point.x - 80, point.y - 50, { steps: 3 })
  await page.mouse.up({ button: 'left' })

  expect(
    await viewport.evaluate(
      (element) => (element as HTMLElement).style.transform,
    ),
  ).not.toBe(transformBefore)
})
