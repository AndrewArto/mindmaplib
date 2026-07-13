import { expect, test, type Page } from '@playwright/test'
import { mockD1 } from './browser-fixtures'

const INSTALL_COMMAND = 'npm install @mindmaplib/core @mindmaplib/react'

function captureUnexpectedConsole(page: Page): string[] {
  const messages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      messages.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`))
  return messages
}

test('developer introduction, copy, example, themes, and editor interactions stay warning-free', async ({
  page,
  context,
}) => {
  const unexpectedConsole = captureUnexpectedConsole(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  })
  await mockD1(page, [])
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Embeddable rich-text mind maps for React',
    }),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Canvas and keyboard-first outline edit the same structured document. You own persistence. MIT licensed.',
    ),
  ).toBeVisible()
  await expect(page.getByText('One tree. Two editing surfaces.')).toBeVisible()
  await expect(page.getByText(INSTALL_COMMAND)).toBeVisible()
  const storageDisclosure = page.getByText(
    'Demo maps are stored anonymously in Cloudflare D1. No account is required.',
  )
  await expect(storageDisclosure).toBeVisible()
  await expect(storageDisclosure).toHaveCSS('color', 'rgb(76, 79, 87)')

  const copyStatus = page.locator('[role="status"]')
  expect(
    await copyStatus.evaluate((element) => getComputedStyle(element).display),
  ).not.toBe('none')

  await expect(
    page.getByRole('link', { name: 'View on GitHub' }),
  ).toHaveAttribute('href', 'https://github.com/AndrewArto/mindmaplib')
  await expect(
    page.getByRole('link', { name: 'View React package' }),
  ).toHaveAttribute('href', 'https://www.npmjs.com/package/@mindmaplib/react')
  await expect(
    page.getByRole('link', { name: 'View core package' }),
  ).toHaveAttribute('href', 'https://www.npmjs.com/package/@mindmaplib/core')

  await page.getByRole('button', { name: 'Copy npm install command' }).click()
  await expect(page.getByRole('status')).toHaveText('Install command copied.')
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(INSTALL_COMMAND)

  const exampleToggle = page.getByRole('button', {
    name: 'View React example',
  })
  await expect(exampleToggle).toHaveAttribute('aria-expanded', 'false')
  await exampleToggle.click()
  const hideExampleToggle = page.getByRole('button', {
    name: 'Hide React example',
  })
  await expect(hideExampleToggle).toHaveAttribute('aria-expanded', 'true')
  const example = page.locator('#react-example-panel')
  await expect(example).toContainText(
    "import { createDoc, MindmapEditor } from '@mindmaplib/core'",
  )
  await expect(example).toContainText("style={{ height: '600px' }}")

  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('.demo-shell')).toHaveClass(/theme-triplea-dark/)
  await expect(storageDisclosure).toHaveCSS('color', 'rgb(195, 206, 222)')
  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('.demo-shell')).toHaveClass(/theme-triplea/)

  await page.getByRole('button', { name: 'Vertical tree' }).click()
  await page.getByRole('tree', { name: 'Mindmap outline' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('application', { name: 'Mindmap canvas' }),
  ).toBeFocused()
  await page.keyboard.press('F2')
  await expect(page.locator('.ProseMirror')).toBeFocused()
  await page.keyboard.type(' reviewed')
  await page.keyboard.press('Enter')
  await expect(page.locator('.mml-node-content--editing')).toHaveCount(0)

  expect(unexpectedConsole).toEqual([])
})

test('developer introduction remains compact and discoverable on mobile', async ({
  page,
}) => {
  const unexpectedConsole = captureUnexpectedConsole(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await mockD1(page)
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Embeddable rich-text mind maps for React',
    }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'View on GitHub' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Copy npm install command' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'View React example' }),
  ).toBeVisible()
  const mobileCanvas = page.getByRole('application', { name: 'Mindmap canvas' })
  await expect(mobileCanvas).toBeVisible()
  const closedGeometry = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.developer-panel')
    const canvas = document.querySelector<HTMLElement>('.mml-canvas')
    if (!panel || !canvas) throw new Error('responsive layout missing')
    const canvasRect = canvas.getBoundingClientRect()
    return {
      panelHeight: panel.getBoundingClientRect().height,
      canvasTop: canvasRect.top,
      canvasBottom: canvasRect.bottom,
      viewportHeight: window.innerHeight,
    }
  })
  expect(closedGeometry.panelHeight).toBeLessThan(320)
  expect(closedGeometry.canvasTop).toBeLessThan(closedGeometry.viewportHeight)
  expect(closedGeometry.canvasBottom).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'View React example' }).click()
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.developer-panel')
    const example = document.querySelector<HTMLElement>('#react-example-panel')
    if (!panel || !example) throw new Error('developer panel missing')
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      panelRight: panel.getBoundingClientRect().right,
      exampleScrollable: example.scrollWidth > example.clientWidth,
    }
  })
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.panelRight).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.exampleScrollable).toBe(true)
  expect(unexpectedConsole).toEqual([])
})
