import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// Polyfill ResizeObserver for jsdom
class ResizeObserverMock {
  private callback: ResizeObserverCallback
  private elements: Set<Element> = new Set()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    this.elements.add(target)
  }

  unobserve(target: Element): void {
    this.elements.delete(target)
  }

  disconnect(): void {
    this.elements.clear()
  }
}

globalThis.ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver
