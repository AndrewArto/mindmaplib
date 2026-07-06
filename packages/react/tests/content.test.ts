import { describe, it, expect } from 'vitest'
import { textExcerpt, fullPlainText } from '../src/content.js'
import type { NodeContent } from '@mindmaplib/core'

function makeContent(text: string): NodeContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

describe('textExcerpt', () => {
  it('extracts plain text from simple paragraph', () => {
    expect(textExcerpt(makeContent('Hello world'))).toBe('Hello world')
  })

  it('strips marks', () => {
    const content: NodeContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }],
        },
      ],
    }
    expect(textExcerpt(content)).toBe('Bold')
  })

  it('returns (empty) for empty content', () => {
    const content: NodeContent = { type: 'doc', content: [] }
    expect(textExcerpt(content)).toBe('(empty)')
  })

  it('truncates long text with ellipsis', () => {
    const long = 'A'.repeat(100)
    const result = textExcerpt(makeContent(long))
    expect(result.length).toBeLessThanOrEqual(81)
    expect(result.endsWith('\u2026')).toBe(true)
  })

  it('extracts text from headings', () => {
    const content: NodeContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    }
    expect(textExcerpt(content)).toBe('Title')
  })

  it('extracts text from list items', () => {
    const content: NodeContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'First item' }],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(textExcerpt(content)).toBe('First item')
  })

  it('extracts text from code blocks', () => {
    const content: NodeContent = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const x = 42' }],
        },
      ],
    }
    expect(textExcerpt(content)).toBe('const x = 42')
  })
})

describe('fullPlainText', () => {
  it('extracts all text from multiple blocks', () => {
    const content: NodeContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    }
    const result = fullPlainText(content)
    expect(result).toContain('First')
    expect(result).toContain('Second')
  })

  it('does not truncate long text', () => {
    const long = 'A'.repeat(200)
    const result = fullPlainText(makeContent(long))
    expect(result.length).toBe(200)
  })
})
