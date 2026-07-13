import { describe, expect, it } from 'vitest'
import { createSampleDocuments } from '../src/sample'

function textContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(textContent).join('')
  if (!value || typeof value !== 'object') return ''
  const record = value as { text?: unknown; content?: unknown }
  if (typeof record.text === 'string') return record.text
  return textContent(record.content)
}

describe('developer-facing sample documents', () => {
  it('uses a mindmaplib architecture map as the default sample', () => {
    const [sample] = createSampleDocuments()
    expect(sample).toBeTruthy()
    expect(sample!.meta.title).toBe('mindmaplib architecture')

    const serialized = JSON.stringify(sample)
    const sampleText = Object.values(sample!.nodes)
      .map((node) => textContent(node.content))
      .join('\n')
    for (const expected of [
      'mindmaplib',
      'Core engine',
      'Immutable document',
      'Transactions and undo/redo',
      'Serialization',
      'Storage interface',
      'React adapter',
      'Canvas',
      'Synchronized outline',
      'Rich-text nodes',
      'Keyboard navigation',
      'Layouts',
      'Host-owned persistence',
    ]) {
      expect(sampleText).toContain(expected)
    }
    expect(serialized).toContain('"type":"bold"')
    expect(serialized).toContain('"type":"code"')
    expect(serialized).toContain('"type":"link"')
  })

  it('keeps the existing business samples available after the developer sample', () => {
    const titles = createSampleDocuments().map((doc) => doc.meta.title)
    expect(titles.slice(1)).toEqual([
      'TripleA Digital enablement map',
      'Product launch plan',
      'Research synthesis map',
    ])
  })
})
