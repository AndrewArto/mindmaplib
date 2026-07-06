import '@testing-library/jest-dom/vitest'

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
