import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  createDoc,
  deserialize,
  serialize,
  type MindmapDoc,
} from '@mindmaplib/core'
import { App } from '../src/App'
import { createSampleDocuments } from '../src/sample'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'localStorage',
)

function createStorageMock(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(String(key)) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(String(key))
    },
    setItem: (key: string, value: string) => {
      values.set(String(key), String(value))
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorageMock(),
  })

  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    ),
  )
  window.history.replaceState({}, '', '/')
  window.localStorage.clear()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.replaceChildren()
  window.localStorage.clear()
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      'localStorage',
      originalLocalStorageDescriptor,
    )
  } else {
    Reflect.deleteProperty(window, 'localStorage')
  }
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.unstubAllGlobals()
})

function requireDocument(value: MindmapDoc | null, label: string): MindmapDoc {
  if (value === null) throw new Error(`${label} was not assigned`)
  return value
}

async function waitForExpectation(assertion: () => void): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < 40; i += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 25))
      })
    }
  }
  throw lastError
}

async function renderApp({ strict = false } = {}): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      strict ? (
        <StrictMode>
          <App />
        </StrictMode>
      ) : (
        <App />
      ),
    )
  })
  return host
}

function getButton(host: HTMLElement, label: string): HTMLButtonElement {
  const button = host.querySelector(
    `button[aria-label="${label}"]`,
  ) as HTMLButtonElement | null
  if (!button) throw new Error(`Button not found: ${label}`)
  return button
}

describe('App developer introduction', () => {
  it('identifies the demo as an embeddable React library with real package links', async () => {
    const host = await renderApp()

    expect(host.querySelector('h1')?.textContent).toBe(
      'Embeddable rich-text mind maps for React',
    )
    expect(host.textContent).toContain(
      'Canvas and keyboard-first outline edit the same structured document. You own persistence. MIT licensed.',
    )
    expect(host.textContent).toContain('One tree. Two editing surfaces.')
    expect(host.textContent).toContain(
      'npm install @mindmaplib/core @mindmaplib/react',
    )
    expect(host.textContent).toContain(
      'Demo maps are stored anonymously in Cloudflare D1. No account is required.',
    )

    const expectedLinks = new Map([
      ['View on GitHub', 'https://github.com/AndrewArto/mindmaplib'],
      ['View React package', 'https://www.npmjs.com/package/@mindmaplib/react'],
      ['View core package', 'https://www.npmjs.com/package/@mindmaplib/core'],
    ])
    for (const [label, href] of expectedLinks) {
      const link = Array.from(host.querySelectorAll('a')).find(
        (candidate) => candidate.textContent?.trim() === label,
      )
      expect(link?.href).toBe(href)
      expect(link?.target).toBe('_blank')
      expect(link?.rel).toContain('noreferrer')
    }
  })

  it('copies the exact install command and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const host = await renderApp()

    await act(async () => {
      getButton(host, 'Copy npm install command').click()
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith(
      'npm install @mindmaplib/core @mindmaplib/react',
    )
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Install command copied.',
    )
  })

  it('starts the clipboard write inside the click activation without yielding', async () => {
    let resolveCopy: (() => void) | null = null
    const writeText = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve
        }),
    )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const host = await renderApp()

    act(() => {
      getButton(host, 'Copy npm install command').click()
      expect(writeText).toHaveBeenCalledWith(
        'npm install @mindmaplib/core @mindmaplib/react',
      )
    })
    await act(async () => {
      resolveCopy?.()
      await Promise.resolve()
    })
  })

  it('clears the previous copy announcement before announcing a repeated copy', async () => {
    let resolveSecondCopy: (() => void) | null = null
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecondCopy = resolve
          }),
      )
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const host = await renderApp()
    const copyButton = getButton(host, 'Copy npm install command')
    const status = host.querySelector('[role="status"]')

    await act(async () => {
      copyButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(status?.textContent).toBe('Install command copied.')

    await act(async () => {
      copyButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(status?.textContent).toBe('')

    await act(async () => {
      resolveSecondCopy?.()
      await Promise.resolve()
    })
    expect(status?.textContent).toBe('Install command copied.')
  })

  it('announces a recoverable copy error when the Clipboard API fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('permission denied')),
      },
    })
    const host = await renderApp()

    await act(async () => {
      getButton(host, 'Copy npm install command').click()
      await Promise.resolve()
    })

    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Copy failed. Select the command manually.',
    )
  })

  it('opens an accessible minimal React example with a stable editor and explicit height', async () => {
    const host = await renderApp()
    const toggle = getButton(host, 'View React example')

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('#react-example-panel')).toBeNull()

    await act(async () => toggle.click())

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Hide React example')
    const example = host.querySelector('#react-example-panel')
    expect(example).toBeTruthy()
    expect(example?.textContent).toContain("import { useState } from 'react'")
    expect(example?.textContent).toContain(
      "import { createDoc, MindmapEditor } from '@mindmaplib/core'",
    )
    expect(example?.textContent).toContain(
      "import { Mindmap } from '@mindmaplib/react'",
    )
    expect(example?.textContent).toContain(
      "import '@mindmaplib/react/styles.css'",
    )
    expect(example?.textContent).toContain('useState(() => new MindmapEditor(')
    expect(example?.textContent).toContain("style={{ height: '600px' }}")
  })
})

describe('App D1 fallback behavior', () => {
  it('persists and opens the sample map automatically for a first-time D1 owner', async () => {
    const fetchMock = vi.mocked(fetch)
    let createdDocId: string | null = null
    let createdDocJson: string | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.endsWith('/api/sessions') && !init) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            doc: string
            bootstrapKind?: string
          }
          expect(body.bootstrapKind).toBe('first-visit-sample')
          const created = deserialize(body.doc)
          expect(created.meta.title).toBe('mindmaplib architecture')
          createdDocId = created.id
          createdDocJson = body.doc
          return new Response(JSON.stringify({ id: created.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (
          createdDocId &&
          url.endsWith(`/api/sessions/${createdDocId}`) &&
          !init
        ) {
          return new Response(
            JSON.stringify({ id: createdDocId, doc: createdDocJson }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()

    await waitForExpectation(() => {
      expect(createdDocId).toBeTruthy()
      expect(host.textContent).toContain('mindmaplib architecture')
      expect(host.textContent).not.toContain('No saved maps yet')
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('mindmaplib architecture')
    })
  })

  it('persists the first-visit sample after selection-only interaction during bootstrap', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveInitialList: (() => void) | null = null
    let createdDocId: string | null = null
    let createdDocJson: string | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Promise<Response>((resolve) => {
            resolveInitialList = () => {
              resolve(
                new Response(JSON.stringify([]), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
            }
          })
        }

        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          expect(created.meta.title).toBe('mindmaplib architecture')
          createdDocId = created.id
          createdDocJson = body.doc
          return new Response(JSON.stringify({ id: created.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (createdDocId && url.endsWith(`/api/sessions/${createdDocId}`)) {
          return new Response(
            JSON.stringify({ id: createdDocId, doc: createdDocJson }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(resolveInitialList).toBeTruthy()
      expect(host.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(
        1,
      )
    })

    const [, childItem] = Array.from(
      host.querySelectorAll<HTMLElement>('[role="treeitem"]'),
    )
    await act(async () => {
      childItem!.click()
    })

    await act(async () => {
      resolveInitialList?.()
    })

    await waitForExpectation(() => {
      expect(createdDocId).toBeTruthy()
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('mindmaplib architecture')
      expect(host.textContent).toContain('Saved to D1')
    })
  })

  it('does not overwrite user changes when first-visit sample creation resolves late', async () => {
    const fetchMock = vi.mocked(fetch)
    let sampleDocId: string | null = null
    let sampleDocJson: string | null = null
    let resolveSampleCreate: (() => void) | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          if (created.meta.title === 'mindmaplib architecture') {
            sampleDocId = created.id
            sampleDocJson = body.doc
            return new Promise<Response>((resolve) => {
              resolveSampleCreate = () => {
                resolve(
                  new Response(JSON.stringify({ id: created.id }), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
              }
            })
          }
          return new Response(
            JSON.stringify({ error: 'manual create failed' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (sampleDocId && url.endsWith(`/api/sessions/${sampleDocId}`)) {
          return new Response(
            JSON.stringify({ id: sampleDocId, doc: sampleDocJson }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveSampleCreate).toBeTruthy())

    const newButton = host.querySelector(
      'button.btn-primary',
    ) as HTMLButtonElement
    await act(async () => {
      newButton.click()
    })
    await waitForExpectation(() => {
      expect(host.textContent).toContain('Untitled mindmap')
      expect(host.textContent).toContain('Save failed')
    })

    await act(async () => {
      resolveSampleCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    const sampleLoadCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        sampleDocId !== null &&
        String(input).endsWith(`/api/sessions/${sampleDocId}`) &&
        !init,
    )
    expect(sampleLoadCalls).toHaveLength(0)
    expect(host.textContent).toContain('Untitled mindmap')
    expect(host.textContent).toContain('Save failed')
  })

  it('keeps the current saved-map row when a stale bootstrap create finishes late', async () => {
    const fetchMock = vi.mocked(fetch)
    let sampleDocId: string | null = null
    let manualDocId: string | null = null
    let manualDocJson: string | null = null
    let resolveSampleCreate: (() => void) | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          const rows = manualDocId
            ? [
                {
                  id: manualDocId,
                  title: 'Untitled mindmap',
                  updated: new Date().toISOString(),
                  version: 0,
                },
              ]
            : []
          return new Response(JSON.stringify(rows), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          if (created.meta.title === 'mindmaplib architecture') {
            sampleDocId = created.id
            return new Promise<Response>((resolve) => {
              resolveSampleCreate = () => {
                resolve(
                  new Response(JSON.stringify({ id: created.id }), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
              }
            })
          }
          manualDocId = created.id
          manualDocJson = body.doc
          return new Response(JSON.stringify({ id: created.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (manualDocId && url.endsWith(`/api/sessions/${manualDocId}`)) {
          return new Response(
            JSON.stringify({ id: manualDocId, doc: manualDocJson }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (sampleDocId && url.endsWith(`/api/sessions/${sampleDocId}`)) {
          return new Response(JSON.stringify({ error: 'stale sample load' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveSampleCreate).toBeTruthy())

    const newButton = host.querySelector(
      'button.btn-primary',
    ) as HTMLButtonElement
    await act(async () => {
      newButton.click()
    })
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('Untitled mindmap')
    })

    await act(async () => {
      resolveSampleCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      'Untitled mindmap',
    )
  })

  it('persists same-document changes made before first-visit bootstrap finishes', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveInitialList: (() => void) | null = null
    let createdDocId: string | null = null
    let createdDocJson: string | null = null
    let createdDocHadCollapsedNode = false

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Promise<Response>((resolve) => {
            resolveInitialList = () => {
              resolve(
                new Response(JSON.stringify([]), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
            }
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          createdDocId = created.id
          createdDocJson = body.doc
          createdDocHadCollapsedNode = Object.values(created.nodes).some(
            (node) => node.collapsed,
          )
          return new Response(JSON.stringify({ id: created.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (
          createdDocId &&
          url.endsWith(`/api/sessions/${createdDocId}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDocJson = body.doc
          const saved = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: saved.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (createdDocId && url.endsWith(`/api/sessions/${createdDocId}`)) {
          return new Response(
            JSON.stringify({ id: createdDocId, doc: createdDocJson }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(resolveInitialList).toBeTruthy()
      expect(host.querySelector('button[aria-label="Collapse"]')).toBeTruthy()
    })

    const collapseButton = host.querySelector(
      'button[aria-label="Collapse"]',
    ) as HTMLButtonElement
    await act(async () => {
      collapseButton.click()
    })

    await act(async () => {
      resolveInitialList?.()
    })

    await waitForExpectation(() => {
      expect(createdDocId).toBeTruthy()
      expect(createdDocHadCollapsedNode).toBe(true)
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('mindmaplib architecture')
    })
  })

  it('persists committed changes while first-visit bootstrap save is in flight', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveSampleCreate: (() => void) | null = null
    let resolveFirstSave: (() => void) | null = null
    let createdDocId: string | null = null
    const savedDocs: MindmapDoc[] = []

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          createdDocId = created.id
          return new Promise<Response>((resolve) => {
            resolveSampleCreate = () => {
              resolve(
                new Response(JSON.stringify({ id: created.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
            }
          })
        }
        if (
          createdDocId &&
          url.endsWith(`/api/sessions/${createdDocId}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const saved = deserialize(body.doc)
          savedDocs.push(saved)
          const response = new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: saved.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
          if (savedDocs.length === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstSave = () => resolve(response)
            })
          }
          return response
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveSampleCreate).toBeTruthy())

    const collapseButton = () =>
      host.querySelector('button[aria-label="Collapse"]') as HTMLButtonElement
    const expandButton = () =>
      host.querySelector('button[aria-label="Expand"]') as HTMLButtonElement

    await act(async () => {
      collapseButton().click()
    })
    await act(async () => {
      resolveSampleCreate?.()
    })
    await waitForExpectation(() => expect(resolveFirstSave).toBeTruthy())

    await act(async () => {
      expandButton().click()
    })
    await act(async () => {
      resolveFirstSave?.()
    })

    await waitForExpectation(() => {
      expect(savedDocs).toHaveLength(2)
      const lastSaved = savedDocs.at(-1)!
      expect(lastSaved.nodes[lastSaved.rootId]?.collapsed).toBe(false)
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('mindmaplib architecture')
    })
  })

  it('persists dirty active-edit bootstrap state before marking it saved', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveSampleCreate: (() => void) | null = null
    let createdDocId: string | null = null
    let savedDoc: MindmapDoc | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          createdDocId = created.id
          return new Promise<Response>((resolve) => {
            resolveSampleCreate = () => {
              resolve(
                new Response(JSON.stringify({ id: created.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
            }
          })
        }
        if (
          createdDocId &&
          url.endsWith(`/api/sessions/${createdDocId}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          savedDoc = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: savedDoc.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveSampleCreate).toBeTruthy())

    const collapseButton = host.querySelector(
      'button[aria-label="Collapse"]',
    ) as HTMLButtonElement
    const rootNode = host.querySelector('[data-node-id]') as HTMLElement
    await act(async () => {
      collapseButton.click()
      rootNode.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
    })

    await act(async () => {
      resolveSampleCreate?.()
    })

    await waitForExpectation(() => {
      expect(savedDoc?.nodes[savedDoc.rootId]?.collapsed).toBe(true)
      expect(host.textContent).toContain('Saved to D1')
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('mindmaplib architecture')
    })
  })
  it('does not autoload an existing session over active local editing during startup', async () => {
    const existingDoc = createDoc('Existing saved map')
    const fetchMock = vi.mocked(fetch)
    let resolveInitialList: (() => void) | null = null

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/sessions')) {
        return new Promise<Response>((resolve) => {
          resolveInitialList = () => {
            resolve(
              new Response(
                JSON.stringify([
                  {
                    id: existingDoc.id,
                    title: existingDoc.meta.title,
                    updated: existingDoc.meta.updated,
                    version: existingDoc.version,
                  },
                ]),
                { headers: { 'Content-Type': 'application/json' } },
              ),
            )
          }
        })
      }
      if (url.endsWith(`/api/sessions/${existingDoc.id}`)) {
        return new Response(
          JSON.stringify({ id: existingDoc.id, doc: serialize(existingDoc) }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(resolveInitialList).toBeTruthy()
      expect(host.querySelector('[data-node-id]')).toBeTruthy()
    })

    const rootNode = host.querySelector('[data-node-id]') as HTMLElement
    await act(async () => {
      rootNode.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
    })

    await act(async () => {
      resolveInitialList?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    const existingLoads = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith(`/api/sessions/${existingDoc.id}`) && !init,
    )
    expect(existingLoads).toHaveLength(0)
    expect(host.querySelector('.map-title-block strong')?.textContent).toBe(
      'mindmaplib architecture',
    )
  })

  it('does not let a stale initial list replace a newer manual-create refresh', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveInitialList: (() => void) | null = null
    let listCalls = 0
    let manualDoc: MindmapDoc | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          listCalls += 1
          if (listCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveInitialList = () =>
                resolve(
                  new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
            })
          }
          const doc = manualDoc
          return new Response(
            JSON.stringify(
              doc
                ? [
                    {
                      id: doc.id,
                      title: doc.meta.title,
                      updated: doc.meta.updated,
                      version: doc.version,
                    },
                  ]
                : [],
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          manualDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: manualDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (manualDoc && url.endsWith(`/api/sessions/${manualDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: manualDoc.id, doc: serialize(manualDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveInitialList).toBeTruthy())

    const newButton = host.querySelector(
      'button.btn-primary',
    ) as HTMLButtonElement
    await act(async () => {
      newButton.click()
    })
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain('Untitled mindmap')
    })

    await act(async () => {
      resolveInitialList?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(host.querySelectorAll('.session-button')).toHaveLength(1)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      'Untitled mindmap',
    )
  })

  it('does not apply an existing-session load that becomes stale while the user edits', async () => {
    const existingDoc = createDoc('Existing saved map')
    const fetchMock = vi.mocked(fetch)
    let resolveExistingLoad: (() => void) | null = null

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/sessions')) {
        return new Response(
          JSON.stringify([
            {
              id: existingDoc.id,
              title: existingDoc.meta.title,
              updated: existingDoc.meta.updated,
              version: existingDoc.version,
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith(`/api/sessions/${existingDoc.id}`)) {
        return new Promise<Response>((resolve) => {
          resolveExistingLoad = () =>
            resolve(
              new Response(
                JSON.stringify({
                  id: existingDoc.id,
                  doc: serialize(existingDoc),
                }),
                { headers: { 'Content-Type': 'application/json' } },
              ),
            )
        })
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveExistingLoad).toBeTruthy())

    const collapseButton = host.querySelector(
      'button[aria-label="Collapse"]',
    ) as HTMLButtonElement
    await act(async () => {
      collapseButton.click()
    })

    await act(async () => {
      resolveExistingLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(host.querySelector('.map-title-block strong')?.textContent).toBe(
      'mindmaplib architecture',
    )
    expect(host.querySelector('.session-button.active')).toBeNull()
  })

  it('does not autoload over an in-progress drag that has not bumped the document version', async () => {
    const existingDoc = createDoc('Existing saved map')
    const fetchMock = vi.mocked(fetch)
    let resolveExistingLoad: (() => void) | null = null

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/sessions')) {
        return new Response(
          JSON.stringify([
            {
              id: existingDoc.id,
              title: existingDoc.meta.title,
              updated: existingDoc.meta.updated,
              version: existingDoc.version,
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith(`/api/sessions/${existingDoc.id}`)) {
        return new Promise<Response>((resolve) => {
          resolveExistingLoad = () =>
            resolve(
              new Response(
                JSON.stringify({
                  id: existingDoc.id,
                  doc: serialize(existingDoc),
                }),
                { headers: { 'Content-Type': 'application/json' } },
              ),
            )
        })
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveExistingLoad).toBeTruthy())

    const selectedNode = host.querySelector(
      '.mml-node--selected',
    ) as HTMLElement
    await act(async () => {
      selectedNode.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      )
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: 70,
          clientY: 70,
        }),
      )
    })

    await act(async () => {
      resolveExistingLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(host.querySelector('.map-title-block strong')?.textContent).toBe(
      'mindmaplib architecture',
    )
    expect(host.querySelector('.session-button.active')).toBeNull()

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
  })

  it('allows measurement-only relayout while a startup session load is pending', async () => {
    const existingDoc = createDoc('Measured existing session')
    const fetchMock = vi.mocked(fetch)
    let resolveExistingLoad: (() => void) | null = null
    let resizeCallback: ResizeObserverCallback | null = null

    class ControlledResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ControlledResizeObserver)

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/sessions')) {
        return new Response(
          JSON.stringify([
            {
              id: existingDoc.id,
              title: existingDoc.meta.title,
              updated: existingDoc.meta.updated,
              version: existingDoc.version,
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith(`/api/sessions/${existingDoc.id}`)) {
        return new Promise<Response>((resolve) => {
          resolveExistingLoad = () =>
            resolve(
              new Response(
                JSON.stringify({
                  id: existingDoc.id,
                  doc: serialize(existingDoc),
                }),
                { headers: { 'Content-Type': 'application/json' } },
              ),
            )
        })
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(resolveExistingLoad).toBeTruthy()
      expect(resizeCallback).toBeTruthy()
    })
    const selectedNode = host.querySelector(
      '.mml-node--selected',
    ) as HTMLElement

    await act(async () => {
      resizeCallback?.(
        [
          {
            target: selectedNode,
            borderBoxSize: [{ inlineSize: 320, blockSize: 96 }],
            contentRect: { width: 320, height: 96 },
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      )
      await new Promise((resolve) => window.setTimeout(resolve, 75))
      resolveExistingLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    const active = host.querySelector('.session-button.active')
    expect(active?.textContent).toContain('Measured existing session')
  })

  it('keeps a successfully created map active when the follow-up list refresh fails', async () => {
    const createdDoc = createDoc('Untitled mindmap')
    const fetchMock = vi.mocked(fetch)
    let resolveInitialList: (() => void) | null = null
    let listCalls = 0

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (listCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveInitialList = () =>
                resolve(
                  new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
            })
          }
          return new Response('<!doctype html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          createdDoc.id = submitted.id
          createdDoc.meta = submitted.meta
          createdDoc.nodes = submitted.nodes
          createdDoc.rootId = submitted.rootId
          createdDoc.version = submitted.version
          return new Response(JSON.stringify({ id: submitted.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveInitialList).toBeTruthy())
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      createdDoc.id,
    )
    expect(host.textContent).toContain('Saved to D1')
    expect(host.textContent).not.toContain('Save failed')
  })

  it('keeps an explicit manual create ahead of a delayed startup autoload', async () => {
    const existingDoc = createDoc('Existing startup row')
    let createdDoc: MindmapDoc | null = null
    let resolveInitialList: (() => void) | null = null
    let resolveCreatedLoad: (() => void) | null = null
    let existingLoadCalls = 0
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (listCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveInitialList = () =>
                resolve(
                  new Response(
                    JSON.stringify([
                      {
                        id: existingDoc.id,
                        title: existingDoc.meta.title,
                        updated: existingDoc.meta.updated,
                        version: existingDoc.version,
                      },
                    ]),
                    { headers: { 'Content-Type': 'application/json' } },
                  ),
                )
            })
          }
          const rows = [createdDoc, existingDoc]
            .filter((doc): doc is MindmapDoc => doc !== null)
            .map((doc) => ({
              id: doc.id,
              title: doc.meta.title,
              updated: doc.meta.updated,
              version: doc.version,
            }))
          return new Response(JSON.stringify(rows), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Promise<Response>((resolve) => {
            resolveCreatedLoad = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    id: createdDoc!.id,
                    doc: serialize(createdDoc!),
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (url.endsWith(`/api/sessions/${existingDoc.id}`)) {
          existingLoadCalls += 1
          return new Response(
            JSON.stringify({ id: existingDoc.id, doc: serialize(existingDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveInitialList).toBeTruthy())
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 25))
    })
    await waitForExpectation(() => expect(resolveCreatedLoad).toBeTruthy())

    await act(async () => {
      resolveInitialList?.()
      await new Promise((resolve) => window.setTimeout(resolve, 25))
      resolveCreatedLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(existingLoadCalls).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      'Untitled mindmap',
    )
  })

  it('refreshes the sidebar after loading another tab first-visit sample', async () => {
    const otherSample = createDoc('Other tab authoritative sample')
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          const rows =
            listCalls === 1
              ? []
              : [
                  {
                    id: otherSample.id,
                    title: otherSample.meta.title,
                    updated: otherSample.meta.updated,
                    version: otherSample.version,
                  },
                ]
          return new Response(JSON.stringify(rows), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({ id: otherSample.id, created: false }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${otherSample.id}`)) {
          return new Response(
            JSON.stringify({ id: otherSample.id, doc: serialize(otherSample) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(new URL(window.location.href).searchParams.get('id')).toBe(
        otherSample.id,
      )
    })

    expect(listCalls).toBe(2)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      otherSample.meta.title,
    )
  })

  it('keeps a bootstrap-created session attached when saving bootstrap edits conflicts', async () => {
    let bootstrapDoc: MindmapDoc | null = null
    let resolveBootstrap: (() => void) | null = null
    let bootstrapSaveCalls = 0
    let bootstrapLoadCalls = 0
    const expectedVersions: Array<number | undefined> = []
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          bootstrapDoc = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveBootstrap = () =>
              resolve(
                new Response(
                  JSON.stringify({ id: bootstrapDoc!.id, created: true }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (
          bootstrapDoc &&
          url.endsWith(`/api/sessions/${bootstrapDoc.id}`) &&
          init?.method === 'PUT'
        ) {
          bootstrapSaveCalls += 1
          const body = JSON.parse(String(init.body)) as {
            expectedVersion?: number
          }
          expectedVersions.push(body.expectedVersion)
          return new Response(
            JSON.stringify({ currentVersion: bootstrapDoc.version }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        if (
          bootstrapDoc &&
          url.endsWith(`/api/sessions/${bootstrapDoc.id}`) &&
          !init?.method
        ) {
          bootstrapLoadCalls += 1
          return new Response(
            JSON.stringify({
              id: bootstrapDoc.id,
              doc: serialize(bootstrapDoc),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveBootstrap).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveBootstrap?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(bootstrapDoc, 'bootstrapDoc').id,
    )
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      'mindmaplib architecture',
    )
    expect(host.textContent).toContain('Conflict')
    expect(bootstrapSaveCalls).toBe(1)

    await act(async () => {
      ;(
        host.querySelector('.session-button.active') as HTMLButtonElement
      ).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(bootstrapSaveCalls).toBe(2)
    expect(bootstrapLoadCalls).toBe(0)
    expect(expectedVersions).toEqual([
      requireDocument(bootstrapDoc, 'bootstrapDoc').version,
      requireDocument(bootstrapDoc, 'bootstrapDoc').version,
    ])
    expect(host.querySelector('button[aria-label="Expand"]')).toBeTruthy()
  })

  it('does not reload after an edit arrives while the pre-load save is pending', async () => {
    const source = createSampleDocuments()[0]!
    let serverSource = source
    let loadCalls = 0
    let resolveSave: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: serverSource.id,
                title: serverSource.meta.title,
                updated: serverSource.meta.updated,
                version: serverSource.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          loadCalls += 1
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(serverSource) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveSave = () => {
              serverSource = submitted
              resolve(
                new Response(
                  JSON.stringify({
                    saved: true,
                    conflict: false,
                    currentVersion: submitted.version,
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
            }
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      ;(
        host.querySelector('.session-button.active') as HTMLButtonElement
      ).click()
    })
    await waitForExpectation(() => expect(resolveSave).toBeTruthy())

    await act(async () => {
      getButton(host, 'Expand').click()
      resolveSave?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(loadCalls).toBe(1)
    expect(host.querySelector('button[aria-label="Collapse"]')).toBeTruthy()
  })

  it('does not apply another tab bootstrap load after a newer manual create intent', async () => {
    const otherSample = createDoc('Other tab sample')
    let manualDoc: MindmapDoc | null = null
    let resolveOtherLoad: (() => void) | null = null
    let resolveManualCreate: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const rows = manualDoc
            ? [
                {
                  id: manualDoc.id,
                  title: manualDoc.meta.title,
                  updated: manualDoc.meta.updated,
                  version: manualDoc.version,
                },
              ]
            : []
          return new Response(JSON.stringify(rows), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            doc: string
            bootstrapKind?: string
          }
          if (body.bootstrapKind === 'first-visit-sample') {
            return new Response(
              JSON.stringify({ id: otherSample.id, created: false }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          manualDoc = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveManualCreate = () =>
              resolve(
                new Response(JSON.stringify({ id: manualDoc!.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (url.endsWith(`/api/sessions/${otherSample.id}`)) {
          return new Promise<Response>((resolve) => {
            resolveOtherLoad = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    id: otherSample.id,
                    doc: serialize(otherSample),
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (manualDoc && url.endsWith(`/api/sessions/${manualDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: manualDoc.id, doc: serialize(manualDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveOtherLoad).toBeTruthy())
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 20))
      resolveOtherLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 40))
    })

    expect(new URL(window.location.href).searchParams.get('id')).not.toBe(
      otherSample.id,
    )

    await act(async () => {
      resolveManualCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 60))
    })
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(manualDoc, 'manualDoc').id,
    )
  })

  it('removes a deleted active row even when the follow-up list refresh fails', async () => {
    const doc = createDoc('Delete despite refresh failure')
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (listCalls === 1) {
            return new Response(
              JSON.stringify([
                {
                  id: doc.id,
                  title: doc.meta.title,
                  updated: doc.meta.updated,
                  version: doc.version,
                },
              ]),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Response('<!doctype html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          })
        }
        if (
          url.endsWith(`/api/sessions/${doc.id}`) &&
          init?.method === 'DELETE'
        ) {
          return new Response(null, { status: 204 })
        }
        if (url.endsWith(`/api/sessions/${doc.id}`)) {
          return new Response(
            JSON.stringify({ id: doc.id, doc: serialize(doc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain(doc.meta.title)
    })
    const remove = host.querySelector(
      `button[aria-label="Delete ${doc.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(host.textContent).not.toContain(doc.meta.title)
    expect(host.querySelector('.session-button.active')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('id')).toBeNull()
    expect(host.textContent).toContain('Failed to list sessions')
  })

  it('ignores a stale startup list rejection after a manual create succeeds', async () => {
    let createdDoc: MindmapDoc | null = null
    let rejectInitialList: ((error: Error) => void) | null = null
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (listCalls === 1) {
            return new Promise<Response>((_resolve, reject) => {
              rejectInitialList = reject
            })
          }
          return new Response(
            JSON.stringify(
              createdDoc
                ? [
                    {
                      id: createdDoc.id,
                      title: createdDoc.meta.title,
                      updated: createdDoc.meta.updated,
                      version: createdDoc.version,
                    },
                  ]
                : [],
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(rejectInitialList).toBeTruthy())
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })
    expect(host.textContent).toContain('Saved to D1')

    await act(async () => {
      rejectInitialList?.(new Error('stale startup list failed'))
      await new Promise((resolve) => window.setTimeout(resolve, 40))
    })

    expect(host.textContent).toContain('Saved to D1')
    expect(host.textContent).not.toContain('stale startup list failed')
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )
  })

  it('does not let an older delayed create supersede a newer create', async () => {
    const createdDocs: MindmapDoc[] = []
    let resolveFirstCreate: (() => void) | null = null
    let resolveInitialList: (() => void) | null = null
    let listCalls = 0
    let postCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (listCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveInitialList = () =>
                resolve(
                  new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
            })
          }
          return new Response(
            JSON.stringify(
              createdDocs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          postCalls += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const doc = deserialize(body.doc)
          createdDocs.push(doc)
          if (postCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstCreate = () =>
                resolve(
                  new Response(JSON.stringify({ id: doc.id }), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
            })
          }
          return new Response(JSON.stringify({ id: doc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const loaded = createdDocs.find((doc) =>
          url.endsWith(`/api/sessions/${doc.id}`),
        )
        if (loaded) {
          return new Response(
            JSON.stringify({ id: loaded.id, doc: serialize(loaded) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveInitialList).toBeTruthy())
    const newButton = host.querySelector(
      'button.btn-primary',
    ) as HTMLButtonElement
    await act(async () => {
      newButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 20))
      newButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })
    expect(createdDocs).toHaveLength(2)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      createdDocs[1]!.id,
    )

    await act(async () => {
      resolveFirstCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      createdDocs[1]!.id,
    )
  })

  it('does not let an older duplicate completion supersede a newer create', async () => {
    const source = createDoc('Duplicate source')
    let createdDoc: MindmapDoc | null = null
    let duplicateDoc: MindmapDoc | null = null
    let resolveDuplicateCreate: (() => void) | null = null
    let resolveNewCreate: (() => void) | null = null
    let resolveRenamePut: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [source, createdDoc, duplicateDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (submitted.meta.title.endsWith(' copy')) {
            duplicateDoc = submitted
            return new Promise<Response>((resolve) => {
              resolveDuplicateCreate = () =>
                resolve(
                  new Response(JSON.stringify({ id: submitted.id }), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
            })
          }
          createdDoc = submitted
          return new Promise<Response>((resolve) => {
            resolveNewCreate = () =>
              resolve(
                new Response(JSON.stringify({ id: submitted.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (
          createdDoc &&
          url.endsWith(`/api/sessions/${createdDoc.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (submitted.meta.title !== 'Newer rename') {
            return new Response(
              JSON.stringify({
                saved: true,
                conflict: false,
                currentVersion: submitted.version,
              }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            resolveRenamePut = () => {
              createdDoc = submitted
              resolve(
                new Response(
                  JSON.stringify({
                    saved: true,
                    conflict: false,
                    currentVersion: submitted.version,
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
            }
          })
        }
        if (
          createdDoc &&
          url.endsWith(`/api/sessions/${createdDoc.id}`) &&
          !init?.method
        ) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (duplicateDoc && url.endsWith(`/api/sessions/${duplicateDoc.id}`)) {
          return new Response(
            JSON.stringify({
              id: duplicateDoc.id,
              doc: serialize(duplicateDoc),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain(source.meta.title)
    })
    const duplicate = host.querySelector(
      `button[aria-label="Duplicate ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      duplicate.click()
    })
    await waitForExpectation(() => expect(resolveDuplicateCreate).toBeTruthy())
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => expect(resolveNewCreate).toBeTruthy())
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(true)
    await act(async () => {
      resolveNewCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(false)

    vi.spyOn(window, 'prompt').mockReturnValue('Newer rename')
    const currentTitle = requireDocument(createdDoc, 'createdDoc').meta.title
    const rename = host.querySelector(
      `button[aria-label="Rename ${currentTitle}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      rename.click()
    })
    await waitForExpectation(() => expect(resolveRenamePut).toBeTruthy())
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(true)

    await act(async () => {
      resolveDuplicateCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(true)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )

    await act(async () => {
      resolveRenamePut?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(false)
  })

  it('flushes a queued save before reloading the same document', async () => {
    const source = createSampleDocuments()[0]!
    const requestOrder: string[] = []
    let loadCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          loadCalls += 1
          requestOrder.push(`load-${loadCalls}`)
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          requestOrder.push('save')
          const body = JSON.parse(String(init.body)) as { doc: string }
          const saved = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: saved.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(host.querySelector('.session-button.active')).toBeTruthy()
    })
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      ;(
        host.querySelector('.session-button.active') as HTMLButtonElement
      ).click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(requestOrder).toEqual(['load-1', 'save', 'load-2'])
    expect(host.querySelector('.session-button.active')).toBeTruthy()
  })

  it('flushes a queued autosave after switching documents before the debounce fires', async () => {
    const source = createSampleDocuments()[0]!
    let createdDoc: MindmapDoc | null = null
    let sourceSaveCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [source, createdDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          sourceSaveCalls += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const saved = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: saved.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(host.querySelector('.session-button.active')).toBeTruthy()
    })
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    expect(sourceSaveCalls).toBe(1)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )
  })

  it('does not publish a stale autosave failure after switching documents', async () => {
    const source = createSampleDocuments()[0]!
    let createdDoc: MindmapDoc | null = null
    let rejectAutosave: ((error: Error) => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [source, createdDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          return new Promise<Response>((_resolve, reject) => {
            rejectAutosave = reject
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain(source.meta.title)
    })
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 2100))
    })
    expect(rejectAutosave).toBeTruthy()

    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
      rejectAutosave?.(new Error('stale autosave failed'))
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )
    expect(host.textContent).toContain('Saved to D1')
    expect(host.textContent).not.toContain('stale autosave failed')
  })

  it('blocks document replacement while rich-text editing is active', async () => {
    const source = createDoc('Editing source')
    let postCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          postCalls += 1
          return new Response(JSON.stringify({ error: 'must not create' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const rootNode = host.querySelector('[data-node-id]') as HTMLElement
    await act(async () => {
      rootNode.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
    })
    await waitForExpectation(() =>
      expect(host.querySelector('[contenteditable="true"]')).toBeTruthy(),
    )
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(postCalls).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
    expect(host.textContent).toContain(
      'Finish editing before using document actions.',
    )
  })

  it('invalidates a deferred create when App unmounts', async () => {
    const source = createDoc('Unmount source')
    let createdDoc: MindmapDoc | null = null
    let resolveCreate: (() => void) | null = null
    let createdLoadCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveCreate = () =>
              resolve(
                new Response(JSON.stringify({ id: createdDoc!.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          createdLoadCalls += 1
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => expect(resolveCreate).toBeTruthy())
    const urlBeforeUnmount = window.location.href

    await act(async () => {
      root?.unmount()
      root = null
      resolveCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(createdLoadCalls).toBe(0)
    expect(window.location.href).toBe(urlBeforeUnmount)
  })

  it('runs a retained bootstrap retry before a later normal autosave', async () => {
    let bootstrapDoc: MindmapDoc | null = null
    let resolveBootstrap: (() => void) | null = null
    const expectedVersions: Array<number | undefined> = []
    let saveCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          bootstrapDoc = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveBootstrap = () =>
              resolve(
                new Response(JSON.stringify({ id: bootstrapDoc!.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (
          bootstrapDoc &&
          url.endsWith(`/api/sessions/${bootstrapDoc.id}`) &&
          init?.method === 'PUT'
        ) {
          saveCalls += 1
          const body = JSON.parse(String(init.body)) as {
            doc: string
            expectedVersion?: number
          }
          expectedVersions.push(body.expectedVersion)
          if (saveCalls === 1) {
            return new Response(JSON.stringify({ saved: false }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const submitted = deserialize(body.doc)
          if (body.expectedVersion !== bootstrapDoc.version) {
            return new Response(
              JSON.stringify({ currentVersion: bootstrapDoc.version }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveBootstrap).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveBootstrap?.()
    })
    await waitForExpectation(() =>
      expect(host.textContent).toContain('Save failed'),
    )

    await act(async () => {
      getButton(host, 'Expand').click()
      await new Promise((resolve) => window.setTimeout(resolve, 2100))
    })

    expect(saveCalls).toBe(2)
    expect(expectedVersions).toEqual([
      requireDocument(bootstrapDoc, 'bootstrapDoc').version,
      requireDocument(bootstrapDoc, 'bootstrapDoc').version,
    ])
    expect(host.textContent).toContain('Saved to D1')
  })

  it('refreshes a successful create when its follow-up load is canceled', async () => {
    const source = createSampleDocuments()[0]!
    let createdDoc: MindmapDoc | null = null
    let resolveCreatedLoad: (() => void) | null = null
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          const docs = [source, createdDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Promise<Response>((resolve) => {
            resolveCreatedLoad = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    id: createdDoc!.id,
                    doc: serialize(createdDoc!),
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => expect(resolveCreatedLoad).toBeTruthy())

    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveCreatedLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(listCalls).toBe(2)
    expect(host.textContent).toContain('Untitled mindmap')
    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
  })

  it('preserves the current editor when create fails after editing begins', async () => {
    const source = createSampleDocuments()[0]!
    let resolveCreateFailure: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          return new Promise<Response>((resolve) => {
            resolveCreateFailure = () =>
              resolve(
                new Response(JSON.stringify({ error: 'create failed late' }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => expect(resolveCreateFailure).toBeTruthy())
    const rootNode = host.querySelector('[data-node-id]') as HTMLElement
    await act(async () => {
      rootNode.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
      resolveCreateFailure?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(host.querySelector('[contenteditable="true"]')).toBeTruthy()
    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
    expect(host.textContent).toContain('Failed to create session: 500')
  })

  it('keeps a local recovery editor when active delete resolves after editing begins', async () => {
    const source = createSampleDocuments()[0]!
    let deleted = false
    let resolveDelete: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = deleted ? [] : [source]
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          return new Promise<Response>((resolve) => {
            resolveDelete = () => {
              deleted = true
              resolve(new Response(null, { status: 204 }))
            }
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(resolveDelete).toBeTruthy())
    const rootNode = host.querySelector('[data-node-id]') as HTMLElement
    await act(async () => {
      rootNode.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
      resolveDelete?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(host.querySelector('[contenteditable="true"]')).toBeTruthy()
    expect(host.textContent).toContain('local changes were kept')
    expect(host.querySelector('.session-button.active')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('id')).toBeNull()
  })

  it('reconciles an older create that commits after a newer refresh', async () => {
    const source = createDoc('Existing source')
    const serverDocs = [source]
    let pendingOldDoc: MindmapDoc | null = null
    let resolveOldCreate: (() => void) | null = null
    let postCalls = 0
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          return new Response(
            JSON.stringify(
              serverDocs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          postCalls += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (postCalls === 1) {
            pendingOldDoc = submitted
            return new Promise<Response>((resolve) => {
              resolveOldCreate = () => {
                serverDocs.push(submitted)
                resolve(
                  new Response(JSON.stringify({ id: submitted.id }), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
              }
            })
          }
          serverDocs.push(submitted)
          return new Response(JSON.stringify({ id: submitted.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const loaded = serverDocs.find((doc) =>
          url.endsWith(`/api/sessions/${doc.id}`),
        )
        if (loaded) {
          return new Response(
            JSON.stringify({ id: loaded.id, doc: serialize(loaded) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => expect(resolveOldCreate).toBeTruthy())
    const sampleButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Sample',
    ) as HTMLButtonElement
    await act(async () => {
      sampleButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })
    expect(listCalls).toBeGreaterThanOrEqual(2)
    expect(host.textContent).not.toContain('Untitled mindmap')

    await act(async () => {
      resolveOldCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(requireDocument(pendingOldDoc, 'pendingOldDoc').meta.title).toBe(
      'Untitled mindmap',
    )
    expect(host.textContent).toContain('Untitled mindmap')
    expect(listCalls).toBeGreaterThanOrEqual(3)
  })

  it('clears a recovered session-list error without clearing unrelated errors', async () => {
    let listCalls = 0
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/sessions')) {
        listCalls += 1
        if (listCalls === 1) {
          return new Response(JSON.stringify({ error: 'list unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.textContent).toContain('Failed to list sessions'),
    )
    const refresh = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Refresh',
    ) as HTMLButtonElement
    await waitForExpectation(() => expect(refresh.disabled).toBe(false))
    await act(async () => {
      refresh.click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(listCalls).toBe(2)
    expect(host.textContent).not.toContain('Failed to list sessions')
  })

  it('loads the first authoritative replacement after deleting the active map', async () => {
    const deleted = createDoc('Delete authoritative source')
    const staleReplacement = createDoc('Stale replacement')
    const freshReplacement = createDoc('Fresh authoritative replacement')
    let deletedOnServer = false
    let freshLoads = 0
    let staleLoads = 0
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = deletedOnServer
            ? [freshReplacement, staleReplacement]
            : [deleted, staleReplacement]
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${deleted.id}`) &&
          init?.method === 'DELETE'
        ) {
          deletedOnServer = true
          return new Response(null, { status: 204 })
        }
        if (url.endsWith(`/api/sessions/${deleted.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: deleted.id, doc: serialize(deleted) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${freshReplacement.id}`) &&
          !init?.method
        ) {
          freshLoads += 1
          return new Response(
            JSON.stringify({
              id: freshReplacement.id,
              doc: serialize(freshReplacement),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${staleReplacement.id}`) &&
          !init?.method
        ) {
          staleLoads += 1
          return new Response(
            JSON.stringify({
              id: staleReplacement.id,
              doc: serialize(staleReplacement),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${deleted.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(freshLoads).toBe(1)
    expect(staleLoads).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      freshReplacement.id,
    )
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      freshReplacement.meta.title,
    )
  })

  it('does not start a queued editor save after App unmounts', async () => {
    const source = createSampleDocuments()[0]!
    let resolveFirstSave: (() => void) | null = null
    let putCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          putCalls += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (putCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstSave = () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      saved: true,
                      conflict: false,
                      currentVersion: submitted.version,
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                  ),
                )
            })
          }
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 2100))
    })
    await waitForExpectation(() => expect(resolveFirstSave).toBeTruthy())
    await act(async () => {
      getButton(host, 'Expand').click()
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    })
    const activeRow = host.querySelector(
      '.session-button.active',
    ) as HTMLButtonElement
    await act(async () => {
      activeRow.click()
      await new Promise((resolve) => window.setTimeout(resolve, 20))
      root?.unmount()
      root = null
      resolveFirstSave?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(putCalls).toBe(1)
  })

  it('does not run another bootstrap catch-up PUT after App unmounts', async () => {
    let bootstrapDoc: MindmapDoc | null = null
    let resolveBootstrap: (() => void) | null = null
    let resolveFirstSave: (() => void) | null = null
    let putCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          bootstrapDoc = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveBootstrap = () =>
              resolve(
                new Response(JSON.stringify({ id: bootstrapDoc!.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (
          bootstrapDoc &&
          url.endsWith(`/api/sessions/${bootstrapDoc.id}`) &&
          init?.method === 'PUT'
        ) {
          putCalls += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (putCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstSave = () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      saved: true,
                      conflict: false,
                      currentVersion: submitted.version,
                    }),
                    { headers: { 'Content-Type': 'application/json' } },
                  ),
                )
            })
          }
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveBootstrap).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveBootstrap?.()
    })
    await waitForExpectation(() => expect(resolveFirstSave).toBeTruthy())
    await act(async () => {
      getButton(host, 'Expand').click()
      root?.unmount()
      root = null
      resolveFirstSave?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(putCalls).toBe(1)
  })

  it('does not create a duplicate after its source GET resolves post-unmount', async () => {
    const source = createDoc('Deferred duplicate source')
    let sourceGetCalls = 0
    let resolveDuplicateLoad: (() => void) | null = null
    let postCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          sourceGetCalls += 1
          if (sourceGetCalls === 1) {
            return new Response(
              JSON.stringify({ id: source.id, doc: serialize(source) }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            resolveDuplicateLoad = () =>
              resolve(
                new Response(
                  JSON.stringify({ id: source.id, doc: serialize(source) }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: source.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          postCalls += 1
          return new Response(JSON.stringify({ id: 'must-not-create' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const duplicate = host.querySelector(
      `button[aria-label="Duplicate ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      duplicate.click()
    })
    await waitForExpectation(() => expect(resolveDuplicateLoad).toBeTruthy())
    await act(async () => {
      root?.unmount()
      root = null
      resolveDuplicateLoad?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(postCalls).toBe(0)
  })

  it('keeps edits made while an active-delete replacement GET is pending', async () => {
    const source = createSampleDocuments()[0]!
    const replacement = createDoc('Delete replacement target')
    let deleted = false
    let resolveReplacement: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = deleted ? [replacement] : [source, replacement]
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          deleted = true
          return new Response(null, { status: 204 })
        }
        if (url.endsWith(`/api/sessions/${replacement.id}`) && !init?.method) {
          return new Promise<Response>((resolve) => {
            resolveReplacement = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    id: replacement.id,
                    doc: serialize(replacement),
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(resolveReplacement).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveReplacement?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(host.textContent).toContain(
      'Map deleted from D1; local changes were kept in the editor.',
    )
    expect(new URL(window.location.href).searchParams.get('id')).toBeNull()
  })

  it('cancels post-delete autosave when retaining the deleted map locally', async () => {
    const source = createSampleDocuments()[0]!
    let deleted = false
    let putCalls = 0
    let resolveDelete: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify(
              deleted
                ? []
                : [
                    {
                      id: source.id,
                      title: source.meta.title,
                      updated: source.meta.updated,
                      version: source.version,
                    },
                  ],
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          return new Promise<Response>((resolve) => {
            resolveDelete = () => {
              deleted = true
              resolve(new Response(null, { status: 204 }))
            }
          })
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          putCalls += 1
          return new Response(
            JSON.stringify({ saved: false, conflict: false }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(resolveDelete).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveDelete?.()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    expect(putCalls).toBe(0)
    expect(host.textContent).toContain(
      'Map deleted from D1; local changes were kept in the editor.',
    )
    expect(host.textContent).not.toContain('Save failed')
  })

  it('does not start a queued save after its session is deleted', async () => {
    const source = createSampleDocuments()[0]!
    let deleted = false
    let putCalls = 0
    let finishFirstPut: () => void = () => {
      throw new Error('first PUT was not started')
    }
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify(
              deleted
                ? []
                : [
                    {
                      id: source.id,
                      title: source.meta.title,
                      updated: source.meta.updated,
                      version: source.version,
                    },
                  ],
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          putCalls += 1
          if (putCalls > 1) {
            return new Response(
              JSON.stringify({ saved: true, conflict: false }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            finishFirstPut = () =>
              resolve(
                new Response(JSON.stringify({ error: 'save failed late' }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          deleted = true
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })
    expect(putCalls).toBe(1)
    await act(async () => {
      getButton(host, 'Expand').click()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
      finishFirstPut()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(putCalls).toBe(1)
    expect(host.textContent).not.toContain('Save failed')
  })

  it('cancels an inactive editor debounce when that row is deleted', async () => {
    const source = createSampleDocuments()[0]!
    const target = createDoc('Target map')
    let sourceDeleted = false
    let sourcePutCalls = 0
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = sourceDeleted ? [target] : [source, target]
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${target.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: target.id, doc: serialize(target) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          sourcePutCalls += 1
          return new Response(
            JSON.stringify({ saved: true, conflict: false }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          sourceDeleted = true
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
      const targetRow = Array.from(
        host.querySelectorAll<HTMLButtonElement>('.session-button'),
      ).find((button) => button.textContent?.includes(target.meta.title))!
      targetRow.click()
    })
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain(target.meta.title)
    })
    const removeSource = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      removeSource.click()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    expect(sourcePutCalls).toBe(0)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      target.meta.title,
    )
  })

  it('keeps a dirty autosave scheduled when DELETE fails', async () => {
    const source = createSampleDocuments()[0]!
    let putCalls = 0
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          return new Response(JSON.stringify({ error: 'delete failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          putCalls += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
      const remove = host.querySelector(
        `button[aria-label="Delete ${source.meta.title}"]`,
      ) as HTMLButtonElement
      remove.click()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    expect(putCalls).toBe(1)
    expect(host.querySelector('.session-button.active')).toBeTruthy()
    expect(host.querySelector('button[aria-label="Expand"]')).toBeTruthy()
    expect(host.textContent).toContain('Saved to D1')
  })

  it('does not detach a newer map when an older DELETE completes late', async () => {
    const source = createDoc('Delete source')
    let createdDoc: MindmapDoc | null = null
    let sourceDeleted = false
    let deleteStarted = false
    let finishDelete: () => void = () => {
      throw new Error('DELETE was not started')
    }
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [sourceDeleted ? null : source, createdDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (
          createdDoc &&
          url.endsWith(`/api/sessions/${createdDoc.id}`) &&
          !init?.method
        ) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          deleteStarted = true
          return new Promise<Response>((resolve) => {
            finishDelete = () => {
              sourceDeleted = true
              resolve(new Response(null, { status: 204 }))
            }
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(deleteStarted).toBe(true))
    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => {
      expect(new URL(window.location.href).searchParams.get('id')).toBe(
        requireDocument(createdDoc, 'createdDoc').id,
      )
    })

    await act(async () => {
      finishDelete()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      requireDocument(createdDoc, 'createdDoc').id,
    )
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      requireDocument(createdDoc, 'createdDoc').meta.title,
    )
  })

  it('detaches a same-ID document reopened while DELETE is pending', async () => {
    const source = createDoc('Delete and reopen')
    const reopened = { ...createDoc('Reopened locally'), id: source.id }
    let loadCalls = 0
    let deleteStarted = false
    let finishDelete: () => void = () => {
      throw new Error('DELETE was not started')
    }
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          loadCalls += 1
          const doc = loadCalls === 1 ? source : reopened
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(doc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          deleteStarted = true
          return new Promise<Response>((resolve) => {
            finishDelete = () => resolve(new Response(null, { status: 204 }))
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(loadCalls).toBe(1))
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(deleteStarted).toBe(true))
    await act(async () => {
      ;(host.querySelector('.session-button') as HTMLButtonElement).click()
    })
    await waitForExpectation(() => expect(loadCalls).toBe(2))

    await act(async () => {
      finishDelete()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBeNull()
    expect(host.querySelector('.session-button.active')).toBeNull()
    expect(host.textContent).toContain(
      'Map deleted from D1; local changes were kept in the editor.',
    )
  })

  it('does not mutate the session URL when DELETE completes after unmount', async () => {
    const source = createDoc('Unmount delete')
    let deleteStarted = false
    let finishDelete: () => void = () => {
      throw new Error('DELETE was not started')
    }
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          deleteStarted = true
          return new Promise<Response>((resolve) => {
            finishDelete = () => resolve(new Response(null, { status: 204 }))
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(deleteStarted).toBe(true))
    act(() => {
      root?.unmount()
    })
    root = null

    await act(async () => {
      finishDelete()
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
  })

  it('keeps the active map attached when opening another row gets a transient response', async () => {
    const source = createDoc('Stable active map')
    const target = createDoc('Transient target')
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify(
              [source, target].map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${target.id}`) && !init?.method) {
          return new Response('<!doctype html>', {
            status: 503,
            headers: { 'Content-Type': 'text/html' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const targetRow = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.session-button'),
    ).find((button) => button.textContent?.includes(target.meta.title))!
    await act(async () => {
      targetRow.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      source.meta.title,
    )
  })

  it('does not replace edits committed while a successful create POST is pending', async () => {
    const source = createSampleDocuments()[0]!
    let created: MindmapDoc | null = null
    let resolveCreate: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = created ? [created, source] : [source]
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          created = deserialize(body.doc)
          return new Promise<Response>((resolve) => {
            resolveCreate = () =>
              resolve(
                new Response(JSON.stringify({ id: created!.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
          })
        }
        if (created && url.endsWith(`/api/sessions/${created.id}`)) {
          return new Response(
            JSON.stringify({ id: created.id, doc: serialize(created) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const newMap = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'New map',
    ) as HTMLButtonElement
    await act(async () => {
      newMap.click()
    })
    await waitForExpectation(() => expect(resolveCreate).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveCreate?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      source.meta.title,
    )
    expect(host.textContent).toContain('Untitled mindmap')
  })

  it('does not duplicate after the active source changes during its pre-save', async () => {
    const source = createSampleDocuments()[0]!
    let resolveSave: (() => void) | null = null
    let postCalls = 0
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          return new Promise<Response>((resolve) => {
            resolveSave = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    saved: true,
                    conflict: false,
                    currentVersion: source.version,
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          postCalls += 1
          return new Response(JSON.stringify({ id: 'unexpected-copy' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const duplicate = host.querySelector(
      `button[aria-label="Duplicate ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      duplicate.click()
    })
    await waitForExpectation(() => expect(resolveSave).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveSave?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(postCalls).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
  })

  it('does not continue an active rename after the source changes during its GET', async () => {
    const source = createSampleDocuments()[0]!
    let sourceGets = 0
    let renamePuts = 0
    let resolveRenameGet: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed after GET')

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          sourceGets += 1
          if (sourceGets === 1) {
            return new Response(
              JSON.stringify({ id: source.id, doc: serialize(source) }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            resolveRenameGet = () =>
              resolve(
                new Response(
                  JSON.stringify({ id: source.id, doc: serialize(source) }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (submitted.meta.title === 'Renamed after GET') renamePuts += 1
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const rename = host.querySelector(
      `button[aria-label="Rename ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      rename.click()
    })
    await waitForExpectation(() => expect(resolveRenameGet).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveRenameGet?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(renamePuts).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
  })

  it('locks editor interaction while an active rename PUT is in flight', async () => {
    const source = createSampleDocuments()[0]!
    let serverDoc = source
    let sourceGets = 0
    let resolveRenamePut: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'prompt').mockReturnValue('Locked rename')

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: serverDoc.id,
                title: serverDoc.meta.title,
                updated: serverDoc.meta.updated,
                version: serverDoc.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          sourceGets += 1
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(serverDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (submitted.meta.title !== 'Locked rename') {
            serverDoc = submitted
            return new Response(
              JSON.stringify({
                saved: true,
                conflict: false,
                currentVersion: submitted.version,
              }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            resolveRenamePut = () => {
              serverDoc = submitted
              resolve(
                new Response(
                  JSON.stringify({
                    saved: true,
                    conflict: false,
                    currentVersion: submitted.version,
                  }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
            }
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
    })
    const rename = host.querySelector(
      `button[aria-label="Rename ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      rename.click()
    })
    await waitForExpectation(() => expect(resolveRenamePut).toBeTruthy())
    expect(sourceGets).toBeGreaterThanOrEqual(2)
    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(true)
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(host.querySelector('button[aria-label="Expand"]')).toBeTruthy()
    await act(async () => {
      resolveRenamePut?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(host.querySelector('.workspace')?.hasAttribute('inert')).toBe(false)
    expect(host.textContent).toContain('Locked rename')
  })

  it('does not create a duplicate after its source changes during GET', async () => {
    const source = createSampleDocuments()[0]!
    let sourceGets = 0
    let postCalls = 0
    let resolveDuplicateGet: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          sourceGets += 1
          if (sourceGets === 1) {
            return new Response(
              JSON.stringify({ id: source.id, doc: serialize(source) }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            resolveDuplicateGet = () =>
              resolve(
                new Response(
                  JSON.stringify({ id: source.id, doc: serialize(source) }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          postCalls += 1
          return new Response(JSON.stringify({ id: 'unexpected-copy' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const duplicate = host.querySelector(
      `button[aria-label="Duplicate ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      duplicate.click()
    })
    await waitForExpectation(() => expect(resolveDuplicateGet).toBeTruthy())
    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveDuplicateGet?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(postCalls).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(source.id)
  })

  it('awaits a superseding Refresh before choosing a delete replacement', async () => {
    const source = createDoc('Delete refresh source')
    const staleReplacement = createDoc('Stale delete fallback')
    const freshReplacement = createDoc('Fresh delete replacement')
    let deleted = false
    let listCalls = 0
    let resolveDeleteList: (() => void) | null = null
    let freshLoads = 0
    let staleLoads = 0
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (!deleted) {
            return new Response(
              JSON.stringify(
                [source, staleReplacement].map((doc) => ({
                  id: doc.id,
                  title: doc.meta.title,
                  updated: doc.meta.updated,
                  version: doc.version,
                })),
              ),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          if (listCalls === 2) {
            return new Promise<Response>((resolve) => {
              resolveDeleteList = () =>
                resolve(
                  new Response(
                    JSON.stringify([
                      {
                        id: staleReplacement.id,
                        title: staleReplacement.meta.title,
                        updated: staleReplacement.meta.updated,
                        version: staleReplacement.version,
                      },
                    ]),
                    { headers: { 'Content-Type': 'application/json' } },
                  ),
                )
            })
          }
          return new Response(
            JSON.stringify(
              [freshReplacement, staleReplacement].map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'DELETE'
        ) {
          deleted = true
          return new Response(null, { status: 204 })
        }
        if (
          url.endsWith(`/api/sessions/${freshReplacement.id}`) &&
          !init?.method
        ) {
          freshLoads += 1
          return new Response(
            JSON.stringify({
              id: freshReplacement.id,
              doc: serialize(freshReplacement),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${staleReplacement.id}`) &&
          !init?.method
        ) {
          staleLoads += 1
          return new Response(
            JSON.stringify({
              id: staleReplacement.id,
              doc: serialize(staleReplacement),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    const remove = host.querySelector(
      `button[aria-label="Delete ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
    })
    await waitForExpectation(() => expect(resolveDeleteList).toBeTruthy())
    const refresh = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Refresh',
    ) as HTMLButtonElement
    await act(async () => {
      refresh.click()
      await new Promise((resolve) => window.setTimeout(resolve, 20))
      resolveDeleteList?.()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(freshLoads).toBe(1)
    expect(staleLoads).toBe(0)
    expect(new URL(window.location.href).searchParams.get('id')).toBe(
      freshReplacement.id,
    )
  })

  it('keeps active autosave completion visible during an inactive rename', async () => {
    const source = createSampleDocuments()[0]!
    const inactive = createDoc('Inactive rename target')
    let sourcePuts = 0
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed inactive target')

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify(
              [source, inactive].map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(source) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${inactive.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: inactive.id, doc: serialize(inactive) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          sourcePuts += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${inactive.id}`) &&
          init?.method === 'PUT'
        ) {
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: inactive.version + 1,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
    })
    const rename = host.querySelector(
      `button[aria-label="Rename ${inactive.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      rename.click()
      await new Promise((resolve) => window.setTimeout(resolve, 2200))
    })

    expect(sourcePuts).toBe(1)
    expect(host.textContent).toContain('Saved to D1')
  })

  it('does not let Refresh cancel first-visit sample persistence', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveInitialList: (() => void) | null = null
    let listCalls = 0
    let bootstrapPosts = 0
    let sampleDoc: MindmapDoc | null = null

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          listCalls += 1
          if (listCalls === 1) {
            return new Promise<Response>((resolve) => {
              resolveInitialList = () =>
                resolve(
                  new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' },
                  }),
                )
            })
          }
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          bootstrapPosts += 1
          const body = JSON.parse(String(init.body)) as { doc: string }
          sampleDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: sampleDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (sampleDoc && url.endsWith(`/api/sessions/${sampleDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: sampleDoc.id, doc: serialize(sampleDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => expect(resolveInitialList).toBeTruthy())
    const refresh = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Refresh',
    ) as HTMLButtonElement

    await act(async () => {
      refresh.click()
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      resolveInitialList?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(bootstrapPosts).toBe(1)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      'mindmaplib architecture',
    )
  })

  it('retries a failed background autosave before reopening its document', async () => {
    const source = createSampleDocuments()[0]!
    let serverSource = source
    let createdDoc: MindmapDoc | null = null
    let sourceSaveCalls = 0
    let rejectFirstSave: ((error: Error) => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [serverSource, createdDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          sourceSaveCalls += 1
          if (sourceSaveCalls === 1) {
            return new Promise<Response>((_resolve, reject) => {
              rejectFirstSave = reject
            })
          }
          const body = JSON.parse(String(init.body)) as { doc: string }
          serverSource = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: serverSource.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(serverSource) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 2100))
    })
    expect(rejectFirstSave).toBeTruthy()

    await act(async () => {
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
      rejectFirstSave?.(new Error('background save failed'))
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    const sourceButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.session-button'),
    ).find((button) => button.textContent?.includes(source.meta.title))!
    await act(async () => {
      sourceButton.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(sourceSaveCalls).toBe(2)
    expect(host.querySelector('button[aria-label="Expand"]')).toBeTruthy()
  })

  it('does not apply a same-document reload after the editor changes during GET', async () => {
    const source = createSampleDocuments()[0]!
    let loadCalls = 0
    let resolveReload: (() => void) | null = null
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: source.id,
                title: source.meta.title,
                updated: source.meta.updated,
                version: source.version,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          loadCalls += 1
          if (loadCalls === 1) {
            return new Response(
              JSON.stringify({ id: source.id, doc: serialize(source) }),
              { headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Promise<Response>((resolve) => {
            resolveReload = () =>
              resolve(
                new Response(
                  JSON.stringify({ id: source.id, doc: serialize(source) }),
                  { headers: { 'Content-Type': 'application/json' } },
                ),
              )
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    await act(async () => {
      ;(
        host.querySelector('.session-button.active') as HTMLButtonElement
      ).click()
    })
    await waitForExpectation(() => expect(resolveReload).toBeTruthy())

    await act(async () => {
      getButton(host, 'Collapse').click()
      resolveReload?.()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(host.querySelector('button[aria-label="Expand"]')).toBeTruthy()
  })

  it('flushes an inactive document before renaming it', async () => {
    const source = createSampleDocuments()[0]!
    let serverSource = source
    let createdDoc: MindmapDoc | null = null
    const actionOrder: string[] = []
    const fetchMock = vi.mocked(fetch)
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed source')

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [serverSource, createdDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          actionOrder.push('rename-load')
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(serverSource) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          actionOrder.push(
            submitted.meta.title === source.meta.title
              ? 'source-save'
              : 'rename-save',
          )
          serverSource = submitted
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: submitted.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          createdDoc = deserialize(body.doc)
          return new Response(JSON.stringify({ id: createdDoc.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (createdDoc && url.endsWith(`/api/sessions/${createdDoc.id}`)) {
          return new Response(
            JSON.stringify({ id: createdDoc.id, doc: serialize(createdDoc) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    actionOrder.length = 0
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    const rename = host.querySelector(
      `button[aria-label="Rename ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      rename.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(actionOrder).toEqual(['source-save', 'rename-load', 'rename-save'])
    expect(serverSource.meta.title).toBe('Renamed source')
    expect(
      Object.values(serverSource.nodes).some((node) => node.collapsed),
    ).toBe(true)
  })

  it('flushes an inactive document before duplicating it', async () => {
    const source = createSampleDocuments()[0]!
    let serverSource = source
    let createdDoc: MindmapDoc | null = null
    let duplicateDoc: MindmapDoc | null = null
    const actionOrder: string[] = []
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const docs = [serverSource, createdDoc, duplicateDoc].filter(
            (doc): doc is MindmapDoc => doc !== null,
          )
          return new Response(
            JSON.stringify(
              docs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${source.id}`) && !init?.method) {
          actionOrder.push('duplicate-load')
          return new Response(
            JSON.stringify({ id: source.id, doc: serialize(serverSource) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${source.id}`) &&
          init?.method === 'PUT'
        ) {
          actionOrder.push('source-save')
          const body = JSON.parse(String(init.body)) as { doc: string }
          serverSource = deserialize(body.doc)
          return new Response(
            JSON.stringify({
              saved: true,
              conflict: false,
              currentVersion: serverSource.version,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const submitted = deserialize(body.doc)
          if (submitted.meta.title.endsWith(' copy')) {
            actionOrder.push('duplicate-create')
            duplicateDoc = submitted
          } else {
            createdDoc = submitted
          }
          return new Response(JSON.stringify({ id: submitted.id }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const loaded = [createdDoc, duplicateDoc].find(
          (doc) => doc && url.endsWith(`/api/sessions/${doc.id}`),
        )
        if (loaded) {
          return new Response(
            JSON.stringify({ id: loaded.id, doc: serialize(loaded) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() =>
      expect(host.querySelector('.session-button.active')).toBeTruthy(),
    )
    actionOrder.length = 0
    await act(async () => {
      getButton(host, 'Collapse').click()
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      ;(host.querySelector('button.btn-primary') as HTMLButtonElement).click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    const duplicate = host.querySelector(
      `button[aria-label="Duplicate ${source.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      duplicate.click()
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    expect(actionOrder).toEqual([
      'source-save',
      'duplicate-load',
      'duplicate-create',
    ])
    expect(
      Object.values(duplicateDoc!.nodes).some((node) => node.collapsed),
    ).toBe(true)
  })

  it('clears a deleted editor before a replacement session load fails', async () => {
    const deleted = createDoc('Deleted editor must disappear')
    const replacement = createDoc('Replacement that fails to load')
    const fetchMock = vi.mocked(fetch)
    let deletedOnServer = false
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init?.method) {
          const listedDocs = deletedOnServer
            ? [replacement]
            : [deleted, replacement]
          return new Response(
            JSON.stringify(
              listedDocs.map((doc) => ({
                id: doc.id,
                title: doc.meta.title,
                updated: doc.meta.updated,
                version: doc.version,
              })),
            ),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (
          url.endsWith(`/api/sessions/${deleted.id}`) &&
          init?.method === 'DELETE'
        ) {
          deletedOnServer = true
          return new Response(null, { status: 204 })
        }
        if (url.endsWith(`/api/sessions/${deleted.id}`)) {
          return new Response(
            JSON.stringify({ id: deleted.id, doc: serialize(deleted) }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.endsWith(`/api/sessions/${replacement.id}`)) {
          return new Response(JSON.stringify({ error: 'load failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(
        host.querySelector('.session-button.active')?.textContent,
      ).toContain(deleted.meta.title)
    })
    const remove = host.querySelector(
      `button[aria-label="Delete ${deleted.meta.title}"]`,
    ) as HTMLButtonElement
    await act(async () => {
      remove.click()
      await new Promise((resolve) => window.setTimeout(resolve, 75))
    })

    expect(host.textContent).not.toContain(deleted.meta.title)
    expect(host.textContent).toContain('Untitled mindmap')
    expect(new URL(window.location.href).searchParams.get('id')).toBeNull()
  })

  it('creates the first-visit sample only once under React StrictMode replay', async () => {
    const fetchMock = vi.mocked(fetch)
    const resolveSampleCreates: Array<() => void> = []
    let createdDocId: string | null = null
    let createdDocJson: string | null = null
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { doc: string }
          const created = deserialize(body.doc)
          createdDocId = created.id
          createdDocJson = body.doc
          return new Promise<Response>((resolve) => {
            resolveSampleCreates.push(() => {
              resolve(
                new Response(JSON.stringify({ id: created.id }), {
                  headers: { 'Content-Type': 'application/json' },
                }),
              )
            })
          })
        }
        if (createdDocId && url.endsWith(`/api/sessions/${createdDocId}`)) {
          return new Response(
            JSON.stringify({ id: createdDocId, doc: createdDocJson }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp({ strict: true })
    await waitForExpectation(() => {
      expect(resolveSampleCreates.length).toBeGreaterThan(0)
    })

    await act(async () => {
      for (const resolveSampleCreate of resolveSampleCreates) {
        resolveSampleCreate()
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    })

    const sampleCreates = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith('/api/sessions') && init?.method === 'POST',
    )
    expect(sampleCreates).toHaveLength(1)
    expect(host.querySelector('.session-button.active')?.textContent).toContain(
      'mindmaplib architecture',
    )
  })

  it('does not recreate the sample when the owner bootstrap marker has no session', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/api/sessions') && !init) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            bootstrapKind?: string
          }
          expect(body.bootstrapKind).toBe('first-visit-sample')
          return new Response(JSON.stringify({ id: null, created: false }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unexpected request' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    )

    const host = await renderApp()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 100))
    })

    const postCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith('/api/sessions') && init?.method === 'POST',
    )
    expect(postCalls).toHaveLength(1)
    expect(host.textContent).toContain('No saved maps yet')
    expect(host.querySelector('.map-title-block strong')?.textContent).toBe(
      'mindmaplib architecture',
    )
    expect(host.querySelector('.session-button.active')).toBeNull()
  })

  it('does not bootstrap from a failed initial list response', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response('<!doctype html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const host = await renderApp()
    await waitForExpectation(() => {
      expect(host.textContent).toContain('Failed to list sessions')
    })

    const postCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith('/api/sessions') && init?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
    expect(host.querySelector('.map-title-block strong')?.textContent).toBe(
      'mindmaplib architecture',
    )
  })

  it('keeps an editable local document visible when D1 create is unavailable', async () => {
    const host = await renderApp()
    const newButton = host.querySelector(
      'button.btn-primary',
    ) as HTMLButtonElement

    await act(async () => {
      newButton.click()
    })

    expect(host.textContent).toContain('Failed to create session')
    expect(host.textContent).toContain('Untitled mindmap')
    expect(host.textContent).toContain('Save failed')
  })
})

describe('App session list actions', () => {
  it('uses icons instead of ambiguous letter labels for row actions', async () => {
    const doc = createDoc('Session action icons')
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/sessions')) {
        return new Response(
          JSON.stringify([
            {
              id: doc.id,
              title: doc.meta.title,
              updated: doc.meta.updated,
              version: doc.version,
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.endsWith(`/api/sessions/${doc.id}`)) {
        return new Response(
          JSON.stringify({ id: doc.id, doc: serialize(doc) }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      return new Response('{}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const host = await renderApp()

    await waitForExpectation(() => {
      expect(host.textContent).toContain('Session action icons')
    })

    const rename = host.querySelector(
      `button[aria-label="Rename ${doc.meta.title}"]`,
    ) as HTMLButtonElement | null
    const duplicate = host.querySelector(
      `button[aria-label="Duplicate ${doc.meta.title}"]`,
    ) as HTMLButtonElement | null
    const remove = host.querySelector(
      `button[aria-label="Delete ${doc.meta.title}"]`,
    ) as HTMLButtonElement | null

    expect(rename).toBeTruthy()
    expect(duplicate).toBeTruthy()
    expect(remove).toBeTruthy()
    expect(rename!.textContent?.trim()).not.toBe('R')
    expect(duplicate!.textContent?.trim()).not.toBe('D')
    expect(rename!.querySelector('svg')).toBeTruthy()
    expect(duplicate!.querySelector('svg')).toBeTruthy()
    expect(remove!.querySelector('svg')).toBeTruthy()
  })
})

describe('App keyboard navigation focus', () => {
  it('keeps canvas focus after non-edit toolbar actions', async () => {
    const host = await renderApp()
    const canvas = host.querySelector('.mml-canvas') as HTMLElement
    const verticalLayout = getButton(host, 'Vertical tree')

    await waitForExpectation(() => expect(document.activeElement).toBe(canvas))

    verticalLayout.focus()
    expect(document.activeElement).toBe(verticalLayout)

    await act(async () => {
      verticalLayout.click()
    })

    await waitForExpectation(() => expect(document.activeElement).toBe(canvas))
  })

  it('does not render node-editing controls in the top toolbar', async () => {
    const host = await renderApp()

    expect(host.querySelector('button[aria-label="Add child"]')).toBeNull()
    expect(host.querySelector('button[aria-label="Add sibling"]')).toBeNull()
    expect(
      host.querySelector('button[aria-label="Delete selected node"]'),
    ).toBeNull()
  })
})
