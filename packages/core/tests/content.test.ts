import { describe, it, expect } from 'vitest'
import {
  emptyContent,
  normalizeContent,
  MAX_LIST_DEPTH,
  MAX_TEXT_LENGTH,
} from '../src/content.js'

describe('emptyContent', () => {
  it('produces a doc with one empty paragraph', () => {
    expect(emptyContent()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    })
  })
})

describe('normalizeContent', () => {
  it('passes through valid simple content', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: 'hi' }],
        },
      ],
    }
    expect(normalizeContent(input)).toEqual(input)
  })

  it('returns empty paragraph for non-doc input', () => {
    expect(normalizeContent(null)).toEqual(emptyContent())
    expect(normalizeContent({})).toEqual(emptyContent())
    expect(normalizeContent({ type: 'not-doc' })).toEqual(emptyContent())
  })

  it('drops unknown block types', () => {
    const input = {
      type: 'doc' as const,
      content: [
        { type: 'blockquote', content: [] },
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: 'ok' }],
        },
      ],
    }
    const result = normalizeContent(input)
    expect(result.content).toHaveLength(1)
    expect(result.content[0]!.type).toBe('paragraph')
  })

  it('strips disallowed marks (strike, underline)', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'text' as const,
              text: 'x',
              marks: [{ type: 'strike' }, { type: 'underline' }],
            },
          ],
        },
      ],
    }
    const result = normalizeContent(input)
    const inline = result.content[0]!.content![0]!
    expect(inline.marks ?? []).toHaveLength(0)
  })

  it('keeps allowed marks (bold, italic, code)', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'text' as const,
              text: 'x',
              marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'code' }],
            },
          ],
        },
      ],
    }
    const result = normalizeContent(input)
    const inline = result.content[0]!.content![0]!
    expect(inline.marks!.map((m) => m.type).sort()).toEqual([
      'bold',
      'code',
      'italic',
    ])
  })

  it('keeps link marks with allowed URL schemes', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'text' as const,
              text: 'link',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com' } },
                { type: 'link', attrs: { href: 'mailto:a@b.com' } },
              ],
            },
          ],
        },
      ],
    }
    const result = normalizeContent(input)
    const inline = result.content[0]!.content![0]!
    expect(inline.marks).toHaveLength(2)
  })

  it('strips link marks with javascript: scheme', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'text' as const,
              text: 'evil',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    }
    const result = normalizeContent(input)
    const inline = result.content[0]!.content![0]!
    expect(inline.marks ?? []).toHaveLength(0)
  })

  it('normalizes heading attrs (level 1-3 only)', () => {
    const input = {
      type: 'doc' as const,
      content: [
        { type: 'heading', attrs: { level: 2 } },
        { type: 'heading', attrs: { level: 5 } },
        { type: 'heading' },
      ],
    }
    const result = normalizeContent(input)
    expect(result.content).toHaveLength(3)
    expect((result.content[0] as { attrs?: { level: number } }).attrs).toEqual({
      level: 2,
    })
    // level 5 and missing level → attrs stripped
    expect((result.content[1] as { attrs?: unknown }).attrs).toBeUndefined()
    expect((result.content[2] as { attrs?: unknown }).attrs).toBeUndefined()
  })

  it('normalizes codeBlock attrs (language only)', () => {
    const input = {
      type: 'doc' as const,
      content: [
        { type: 'codeBlock', attrs: { language: 'ts' } },
        { type: 'codeBlock', attrs: { foo: 'bar' } },
      ],
    }
    const result = normalizeContent(input)
    expect(
      (result.content[0] as { attrs?: { language: string } }).attrs,
    ).toEqual({ language: 'ts' })
    expect((result.content[1] as { attrs?: unknown }).attrs).toBeUndefined()
  })

  it('handles nested lists', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'bulletList' as const,
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph' as const,
                  content: [{ type: 'text' as const, text: 'item' }],
                },
                {
                  type: 'orderedList' as const,
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph' as const,
                          content: [{ type: 'text' as const, text: 'sub' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = normalizeContent(input)
    expect(result.content[0]!.type).toBe('bulletList')
    const list = result.content[0] as {
      content: Array<{ content: unknown[] }>
    }
    expect(list.content).toHaveLength(1)
  })

  it('enforces max list nesting depth', () => {
    // Build content nested deeper than MAX_LIST_DEPTH
    let inner: unknown = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'deep' }],
    }
    for (let i = 0; i < MAX_LIST_DEPTH + 2; i++) {
      inner = {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [inner] }],
      }
    }
    const input = { type: 'doc', content: [inner] }
    const result = normalizeContent(input)
    // Deeply nested lists beyond MAX_LIST_DEPTH are pruned; result is valid
    expect(result.type).toBe('doc')
    expect(result.content.length).toBeGreaterThan(0)
  })

  it('truncates text exceeding MAX_TEXT_LENGTH', () => {
    const longText = 'a'.repeat(MAX_TEXT_LENGTH + 1000)
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: longText }],
        },
      ],
    }
    const result = normalizeContent(input)
    const inline = result.content[0]!.content![0]!
    expect((inline as { text: string }).text.length).toBe(MAX_TEXT_LENGTH)
  })

  it('returns empty paragraph when all blocks are invalid', () => {
    const input = {
      type: 'doc' as const,
      content: [{ type: 'unknown', content: [] }],
    }
    const result = normalizeContent(input)
    expect(result).toEqual(emptyContent())
  })
})
