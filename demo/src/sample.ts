// Initial sample document factory — a welcoming mindmap so the canvas isn't empty.

import { createDoc, addNode, updateNodeContent } from '@mindmaplib/core'
import type { MindmapDoc } from '@mindmaplib/core'
import { textToContent } from './content'

/** Get the id of the most recently added child of parentId. */
function lastChildId(doc: MindmapDoc, parentId: string): string {
  const parent = doc.nodes[parentId]
  if (!parent || parent.childOrder.length === 0) {
    throw new Error(`lastChildId: no children for ${parentId}`)
  }
  return parent.childOrder[parent.childOrder.length - 1]
}

export function createSampleDoc(): MindmapDoc {
  let doc = createDoc('mindmaplib Demo')
  const root = doc.rootId

  // Strategy branch
  doc = addNode(doc, root, { content: textToContent('Strategy') })
  const strategy = lastChildId(doc, root)
  doc = addNode(doc, strategy, { content: textToContent('Market analysis') })
  doc = addNode(doc, strategy, { content: textToContent('Competitive edge') })

  // Product branch
  doc = addNode(doc, root, { content: textToContent('Product') })
  const product = lastChildId(doc, root)
  doc = addNode(doc, product, { content: textToContent('Core engine') })
  doc = addNode(doc, product, { content: textToContent('React adapter') })
  doc = addNode(doc, product, { content: textToContent('Demo app') })

  // Operations branch
  doc = addNode(doc, root, { content: textToContent('Operations') })
  const ops = lastChildId(doc, root)
  doc = addNode(doc, ops, { content: textToContent('CI / CD') })
  doc = addNode(doc, ops, { content: textToContent('Deploy to CF Pages') })

  // Update root content
  doc = updateNodeContent(doc, root, textToContent('mindmaplib'))

  return doc
}
