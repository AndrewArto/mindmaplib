import { expect, test } from '@playwright/test'
import { mockD1, NAVIGATION_DOC_ID } from './browser-fixtures'

test.beforeEach(async ({ page }) => {
  await mockD1(page)
  await page.goto(`/?id=${NAVIGATION_DOC_ID}`)
  await expect(page.getByText('Saved to D1')).toBeVisible()
})

test('browser API fixture rejects unknown sessions and methods', async ({
  page,
}) => {
  const statuses = await page.evaluate(async () => {
    const unknown = await fetch('/api/sessions/missing-session')
    const unsupported = await fetch('/api/sessions', { method: 'PATCH' })
    return { unknown: unknown.status, unsupported: unsupported.status }
  })

  expect(statuses).toEqual({ unknown: 404, unsupported: 405 })
})

test('browser API fixture persists versioned document saves', async ({
  page,
}) => {
  const result = await page.evaluate(async (docId) => {
    const initialResponse = await fetch(`/api/sessions/${docId}`)
    const initial = (await initialResponse.json()) as {
      id: string
      doc: string
    }
    const serialized = JSON.parse(initial.doc) as {
      schemaVersion: number
      doc: {
        version: number
        meta: { title: string; updated: string }
      }
    }
    const expectedVersion = serialized.doc.version
    serialized.doc.version += 1
    serialized.doc.meta.title = 'Persisted by browser fixture'

    const saveResponse = await fetch(`/api/sessions/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: JSON.stringify(serialized),
        expectedVersion,
      }),
    })
    const reloadedResponse = await fetch(`/api/sessions/${docId}`)
    const reloaded = (await reloadedResponse.json()) as { doc: string }
    const persisted = JSON.parse(reloaded.doc) as {
      doc: { version: number; meta: { title: string } }
    }
    return {
      saveStatus: saveResponse.status,
      title: persisted.doc.meta.title,
      version: persisted.doc.version,
    }
  }, NAVIGATION_DOC_ID)

  expect(result).toEqual({
    saveStatus: 200,
    title: 'Persisted by browser fixture',
    version: 101,
  })
})
