// Initial sample document factory — a welcoming mindmap so the canvas isn't empty.

import { createDoc, addNode, updateNodeContent } from '@mindmaplib/core'
import type { MindmapDoc } from '@mindmaplib/core'
import { textToContent } from './content'

export function createSampleDoc(): MindmapDoc {
  let doc = createDoc('mindmaplib Demo')
  const root = doc.rootId

  const strategy = addNode(doc, root, { content: textToContent('Strategy') })
  doc = addNode(strategy, strategy.rootId, {
    content: textToContent('Market analysis'),
  })
  doc = addNode(strategy, doc.rootId, {
    content: textToContent('Competitive edge'),
  })

  const product = addNode(doc, root, { content: textToContent('Product') })
  doc = addNode(product, product.rootId, {
    content: textToContent('Core engine'),
  })
  doc = addNode(product, doc.rootId, {
    content: textToContent('React adapter'),
  })
  doc = addNode(product, doc.rootId, {
    content: textToContent('Demo app'),
  })

  const ops = addNode(doc, root, { content: textToContent('Operations') })
  doc = addNode(ops, ops.rootId, { content: textToContent('CI / CD') })
  doc = addNode(ops, doc.rootId, {
    content: textToContent('Deploy to CF Pages'),
  })

  // Update root content
  doc = updateNodeContent(doc, root, textToContent('mindmaplib'))

  return doc
}
