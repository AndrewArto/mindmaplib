import {
  MindmapEditor,
  createDoc,
  type MindmapDoc,
  type NodeContent,
  type NodeContentInline,
} from '@mindmaplib/core'

function rich(...inlines: NodeContentInline[]): NodeContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: inlines }] }
}

function txt(text: string): NodeContentInline {
  return { type: 'text', text }
}

function bold(text: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'bold' }] }
}

function italic(text: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'italic' }] }
}

function code(text: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'code' }] }
}

function link(text: string, href: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }
}

function listDoc(items: string[]): NodeContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [txt(item)] }],
        })),
      },
    ],
  }
}

function finish(editor: MindmapEditor): MindmapDoc {
  editor.setLayout('tree-horizontal')
  return editor.getDoc()
}

export function createSampleDoc(): MindmapDoc {
  const doc = createDoc('mindmaplib architecture')
  const editor = new MindmapEditor(doc)
  const rootId = doc.rootId

  editor.updateContent(
    rootId,
    rich(bold('mindmaplib'), txt(' '), italic('embeddable editor')),
  )

  const core = editor.addChild(rootId, {
    content: rich(bold('Core engine')),
  })
  editor.addChild(core, {
    content: rich(bold('Immutable'), txt(' document')),
  })
  editor.addChild(core, {
    content: rich(txt('Transactions and '), bold('undo/redo')),
  })
  editor.addChild(core, { content: rich(txt('Serialization')) })
  editor.addChild(core, {
    content: rich(txt('Storage interface: '), code('MindmapStore')),
  })

  const react = editor.addChild(rootId, {
    content: rich(
      bold('React adapter'),
      txt(' '),
      link(
        '@mindmaplib/react',
        'https://www.npmjs.com/package/@mindmaplib/react',
      ),
    ),
  })
  editor.addChild(react, { content: rich(txt('Canvas')) })
  editor.addChild(react, { content: rich(txt('Synchronized outline')) })
  editor.addChild(react, {
    content: rich(bold('Rich-text'), txt(' nodes')),
  })
  editor.addChild(react, { content: rich(txt('Keyboard navigation')) })

  const layouts = editor.addChild(rootId, {
    content: rich(bold('Layouts')),
  })
  editor.addChild(layouts, { content: rich(txt('Horizontal tree')) })
  editor.addChild(layouts, { content: rich(txt('Vertical tree')) })
  editor.addChild(layouts, { content: rich(txt('Radial')) })

  const integration = editor.addChild(rootId, {
    content: rich(bold('Integration')),
  })
  editor.addChild(integration, {
    content: rich(txt('Host-owned persistence')),
  })
  editor.addChild(integration, { content: rich(txt('Custom controls')) })
  editor.addChild(integration, { content: rich(txt('Import and export')) })

  return finish(editor)
}

export function createTripleADigitalSampleDoc(): MindmapDoc {
  const doc = createDoc('TripleA Digital enablement map')
  const editor = new MindmapEditor(doc)
  const rootId = doc.rootId

  editor.updateContent(
    rootId,
    rich(bold('TripleA'), txt(' '), italic('AI enablement')),
  )

  const strategy = editor.addChild(rootId, {
    content: rich(bold('Strategy'), txt(' & '), italic('operating model')),
  })
  editor.addChild(strategy, {
    content: rich(txt('90-day '), bold('delivery roadmap')),
  })
  editor.addChild(strategy, {
    content: rich(
      txt('Executive decision '),
      link('cadence', 'https://tripleadigital.io'),
    ),
  })
  editor.addChild(strategy, {
    content: rich(txt('Adoption targets: '), code('NPS > 50')),
  })

  const automation = editor.addChild(rootId, {
    content: rich(bold('Workflow'), txt(' '), italic('automation')),
  })
  editor.addChild(automation, {
    content: listDoc(['Intake triage', 'CRM flows', 'Approval checkpoints']),
  })
  editor.addChild(automation, {
    content: rich(txt('Trigger: '), code('webhook → D1 write')),
  })

  const systems = editor.addChild(rootId, {
    content: rich(bold('Custom software'), txt(' systems')),
  })
  editor.addChild(systems, {
    content: rich(txt('Portal integration')),
  })
  editor.addChild(systems, {
    content: rich(txt('D1 persistence ('), italic('edge SQL'), txt(')')),
  })

  const risk = editor.addChild(rootId, {
    content: rich(bold('Risk'), txt(' & '), italic('governance')),
  })
  editor.addChild(risk, {
    content: rich(link('Data boundaries', 'https://tripleadigital.io')),
  })
  editor.addChild(risk, {
    content: rich(txt('Rollback: '), code('git revert + CF rollback')),
  })

  return finish(editor)
}

export function createProductLaunchSampleDoc(): MindmapDoc {
  const doc = createDoc('Product launch plan')
  const editor = new MindmapEditor(doc)
  const rootId = doc.rootId

  editor.updateContent(rootId, rich(bold('Product launch'), txt(' workspace')))

  const positioning = editor.addChild(rootId, {
    content: rich(bold('Positioning')),
  })
  editor.addChild(positioning, {
    content: rich(txt('ICP and buying committee')),
  })
  editor.addChild(positioning, { content: rich(txt('Competitive wedge')) })
  editor.addChild(positioning, {
    content: rich(txt('Narrative and proof points')),
  })

  const release = editor.addChild(rootId, {
    content: rich(bold('Release checklist')),
  })
  editor.addChild(release, {
    content: listDoc(['Landing page', 'Demo script', 'FAQ']),
  })
  editor.addChild(release, {
    content: rich(txt('Launch date: '), code('T+21')),
  })

  const feedback = editor.addChild(rootId, {
    content: rich(bold('Feedback loops')),
  })
  editor.addChild(feedback, { content: rich(txt('Sales calls')) })
  editor.addChild(feedback, { content: rich(txt('Support tickets')) })
  editor.addChild(feedback, { content: rich(txt('Activation metrics')) })

  return finish(editor)
}

export function createResearchSampleDoc(): MindmapDoc {
  const doc = createDoc('Research synthesis map')
  const editor = new MindmapEditor(doc)
  const rootId = doc.rootId

  editor.updateContent(rootId, rich(bold('Research'), txt(' synthesis')))

  const sources = editor.addChild(rootId, { content: rich(bold('Sources')) })
  editor.addChild(sources, { content: rich(txt('Customer interviews')) })
  editor.addChild(sources, { content: rich(txt('Usage analytics')) })
  editor.addChild(sources, {
    content: rich(link('Market notes', 'https://tripleadigital.io')),
  })

  const insights = editor.addChild(rootId, { content: rich(bold('Insights')) })
  editor.addChild(insights, { content: rich(txt('Repeated pain points')) })
  editor.addChild(insights, { content: rich(txt('Unexpected adoption paths')) })
  editor.addChild(insights, { content: rich(txt('Pricing sensitivity')) })

  const actions = editor.addChild(rootId, { content: rich(bold('Actions')) })
  editor.addChild(actions, {
    content: listDoc(['Prioritize', 'Prototype', 'Validate']),
  })
  editor.addChild(actions, {
    content: rich(txt('Decision log: '), code('ADR-004')),
  })

  return finish(editor)
}

export function createSampleDocuments(): MindmapDoc[] {
  return [
    createSampleDoc(),
    createTripleADigitalSampleDoc(),
    createProductLaunchSampleDoc(),
    createResearchSampleDoc(),
  ]
}
