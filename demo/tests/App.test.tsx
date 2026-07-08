import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../src/App'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

beforeEach(() => {
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
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

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

async function renderApp(): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<App />)
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

describe('App D1 fallback behavior', () => {
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

  it('opens text editing and focuses the new node after Add child', async () => {
    const host = await renderApp()
    const addChild = getButton(host, 'Add child')

    await act(async () => {
      addChild.click()
    })

    let editor: HTMLElement | null = null
    await waitForExpectation(() => {
      const proseMirror = host.querySelector(
        '.mml-node--editing .ProseMirror',
      ) as HTMLElement | null
      expect(proseMirror).toBeTruthy()
      editor = proseMirror!
    })

    await waitForExpectation(() => expect(document.activeElement).toBe(editor))
  })
})
