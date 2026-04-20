export interface JiraAdfMark {
  type?: string
  attrs?: Record<string, unknown>
}

export interface JiraAdfNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: JiraAdfMark[]
  content?: JiraAdfNode[]
}

export interface JiraAdfDocument extends JiraAdfNode {
  type: 'doc'
  version: number
  content: JiraAdfNode[]
}

const SUPPORTED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'text',
])

const SUPPORTED_MARK_TYPES = new Set([
  'strong',
  'em',
  'underline',
  'strike',
  'code',
  'link',
])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isJiraAdfMark(value: unknown): value is JiraAdfMark {
  if (!isRecord(value)) return false
  if (value.type !== undefined && typeof value.type !== 'string') return false
  if (value.attrs !== undefined && !isRecord(value.attrs)) return false
  return true
}

function isJiraAdfNode(value: unknown): value is JiraAdfNode {
  if (!isRecord(value)) return false
  if (value.type !== undefined && typeof value.type !== 'string') return false
  if (value.text !== undefined && typeof value.text !== 'string') return false
  if (value.attrs !== undefined && !isRecord(value.attrs)) return false
  if (value.marks !== undefined && (!Array.isArray(value.marks) || !value.marks.every(isJiraAdfMark))) return false
  if (value.content !== undefined && (!Array.isArray(value.content) || !value.content.every(isJiraAdfNode))) return false
  return true
}

export function isJiraAdfDocument(value: unknown): value is JiraAdfDocument {
  return isJiraAdfNode(value) && value.type === 'doc' && typeof value.version === 'number' && Array.isArray(value.content)
}

function normalizeMark(mark: JiraAdfMark): JiraAdfMark | null {
  if (typeof mark.type !== 'string' || !mark.type) return null

  if (mark.type === 'link') {
    const href = mark.attrs?.href
    if (typeof href !== 'string' || !href) return null

    return {
      type: 'link',
      attrs: {
        href,
      },
    }
  }

  return { type: mark.type }
}

function normalizeMarks(marks: JiraAdfMark[] | undefined): JiraAdfMark[] | undefined {
  if (!marks?.length) return undefined

  const normalizedMarks = marks
    .map(normalizeMark)
    .filter((mark): mark is JiraAdfMark => mark !== null)

  return normalizedMarks.length ? normalizedMarks : undefined
}

function normalizeNodeAttrs(node: JiraAdfNode): Record<string, unknown> | undefined {
  if (node.type === 'heading') {
    const level = node.attrs?.level
    if (typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6) {
      return { level }
    }
    return { level: 1 }
  }

  if (node.type === 'orderedList') {
    const order = node.attrs?.order
    if (typeof order === 'number' && Number.isFinite(order) && order > 0) {
      return { order }
    }
    return undefined
  }

  return undefined
}

function normalizeNode(node: JiraAdfNode): JiraAdfNode | null {
  const type = typeof node.type === 'string' ? node.type : ''
  if (!type) return null

  if (type === 'hardBreak') {
    return { type: 'hardBreak' }
  }

  if (type === 'text') {
    const text = typeof node.text === 'string' ? node.text : ''
    if (!text.length) return null

    const normalizedTextNode: JiraAdfNode = {
      type: 'text',
      text,
    }

    const normalizedMarks = normalizeMarks(node.marks)
    if (normalizedMarks) {
      normalizedTextNode.marks = normalizedMarks
    }

    return normalizedTextNode
  }

  const normalizedContent = normalizeNodes(node.content ?? [])
  const normalizedNode: JiraAdfNode = { type }

  const normalizedAttrs = normalizeNodeAttrs(node)
  if (normalizedAttrs) {
    normalizedNode.attrs = normalizedAttrs
  }

  if (normalizedContent.length) {
    normalizedNode.content = normalizedContent
  }

  if (
    type === 'paragraph'
    || type === 'heading'
    || type === 'listItem'
    || type === 'blockquote'
    || type === 'codeBlock'
  ) {
    if (!normalizedNode.content?.length) {
      if (type === 'paragraph') {
        normalizedNode.content = []
        return normalizedNode
      }

      return null
    }
  }

  if ((type === 'bulletList' || type === 'orderedList') && !normalizedNode.content?.length) {
    return null
  }

  return normalizedNode
}

function normalizeNodes(nodes: JiraAdfNode[]): JiraAdfNode[] {
  return nodes
    .map(normalizeNode)
    .filter((node): node is JiraAdfNode => node !== null)
}

function extractSingleParagraphTextBlob(doc: JiraAdfDocument): string | null {
  if (doc.content.length !== 1) return null

  const [firstNode] = doc.content
  if (firstNode?.type !== 'paragraph') return null

  const paragraphContent = firstNode.content ?? []
  if (!paragraphContent.every((node) => node.type === 'text' && !node.marks?.length && typeof node.text === 'string')) {
    return null
  }

  return paragraphContent.map((node) => node.text ?? '').join('')
}

export function normalizeAdf(doc: JiraAdfDocument | null): JiraAdfDocument | null {
  if (!doc || !isJiraAdfDocument(doc)) return null

  const normalizedDoc: JiraAdfDocument = {
    type: 'doc',
    version: 1,
    content: normalizeNodes(doc.content),
  }

  if (!normalizedDoc.content.length) {
    return null
  }

  const textBlob = extractSingleParagraphTextBlob(normalizedDoc)
  if (textBlob && textBlob.includes('\n')) {
    return plainTextToAdf(textBlob.trimEnd())
  }

  return normalizedDoc
}

function listItemToPlainText(node: JiraAdfNode, depth: number): string {
  return nodesToPlainText(node.content ?? [], depth).trim()
}

function nodesToPlainText(nodes: JiraAdfNode[], depth: number): string {
  return nodes.map((node) => nodeToPlainText(node, depth)).join('')
}

function nodeToPlainText(node: JiraAdfNode, depth: number): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'

  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote') {
    return nodesToPlainText(node.content ?? [], depth) + '\n'
  }

  if (node.type === 'bulletList') {
    return (node.content ?? [])
      .map((listItem) => `${'  '.repeat(depth)}• ${listItemToPlainText(listItem, depth + 1)}\n`)
      .join('')
  }

  if (node.type === 'orderedList') {
    const order = node.attrs?.order
    const start = typeof order === 'number' && Number.isFinite(order) ? order : 1
    return (node.content ?? [])
      .map((listItem, index) => `${'  '.repeat(depth)}${start + index}. ${listItemToPlainText(listItem, depth + 1)}\n`)
      .join('')
  }

  if (node.type === 'codeBlock') {
    return `\`\`\`\n${nodesToPlainText(node.content ?? [], depth)}\`\`\`\n`
  }

  if (node.content?.length) {
    return nodesToPlainText(node.content, depth)
  }

  return ''
}

export function adfToPlainText(doc: JiraAdfDocument | null | undefined): string {
  if (!doc) return ''
  const normalizedDoc = normalizeAdf(doc)
  if (!normalizedDoc) return ''
  return nodesToPlainText(normalizedDoc.content, 0).trimEnd()
}

function buildTextNode(text: string): JiraAdfNode {
  return {
    type: 'text',
    text,
  }
}

function buildMarkedTextNode(text: string, marks: JiraAdfMark[]): JiraAdfNode {
  if (!marks.length) {
    return buildTextNode(text)
  }

  return {
    type: 'text',
    text,
    marks,
  }
}

function buildInlineContent(text: string): JiraAdfNode[] {
  const content: JiraAdfNode[] = []
  const inlinePattern = /https?:\/\/\S+|\*\*([^*\n]+)\*\*/g
  let lastIndex = 0

  for (const match of text.matchAll(inlinePattern)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      content.push(buildTextNode(text.slice(lastIndex, matchIndex)))
    }

    if (matchedText.startsWith('http://') || matchedText.startsWith('https://')) {
      content.push(buildMarkedTextNode(matchedText, [
        {
          type: 'link',
          attrs: {
            href: matchedText,
          },
        },
      ]))
    } else {
      const boldText = match[1]
      if (typeof boldText === 'string' && boldText.length > 0) {
        content.push(buildMarkedTextNode(boldText, [{ type: 'strong' }]))
      }
    }

    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    content.push(buildTextNode(text.slice(lastIndex)))
  }

  return content
}

function buildParagraph(text: string): JiraAdfNode {
  if (!text) {
    return {
      type: 'paragraph',
      content: [],
    }
  }

  return {
    type: 'paragraph',
    content: buildInlineContent(text),
  }
}

function buildListItem(text: string): JiraAdfNode {
  return {
    type: 'listItem',
    content: [buildParagraph(text)],
  }
}

function buildHeading(text: string, level: number): JiraAdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: buildInlineContent(text),
  }
}

export function plainTextToAdf(text: string): JiraAdfDocument | null {
  const normalizedText = text.replace(/\r\n/g, '\n')
  if (!normalizedText.trim()) return null

  const lines = normalizedText.split('\n')
  const content: JiraAdfNode[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    const markdownHeadingMatch = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/)

    if (markdownHeadingMatch) {
      content.push(buildHeading(markdownHeadingMatch[2], markdownHeadingMatch[1].length))
      index += 1
      continue
    }

    const underlineLine = lines[index + 1]
    const setextHeadingMatch = underlineLine?.match(/^\s*([=-])\1{2,}\s*$/)
    if (setextHeadingMatch && line.trim()) {
      const level = setextHeadingMatch[1] === '=' ? 1 : 2
      content.push(buildHeading(line.trim(), level))
      index += 2
      continue
    }

    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)$/)

    if (bulletMatch) {
      const items: JiraAdfNode[] = []
      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*[-*•]\s+(.*)$/)
        if (!currentMatch) break
        items.push(buildListItem(currentMatch[1]))
        index += 1
      }

      content.push({
        type: 'bulletList',
        content: items,
      })
      continue
    }

    const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (orderedMatch) {
      const start = Number.parseInt(orderedMatch[1], 10)
      const items: JiraAdfNode[] = []

      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*(\d+)[.)]\s+(.*)$/)
        if (!currentMatch) break
        items.push(buildListItem(currentMatch[2]))
        index += 1
      }

      const orderedList: JiraAdfNode = {
        type: 'orderedList',
        content: items,
      }

      if (Number.isFinite(start) && start > 1) {
        orderedList.attrs = { order: start }
      }

      content.push(orderedList)
      continue
    }

    content.push(buildParagraph(line))
    index += 1
  }

  return {
    type: 'doc',
    version: 1,
    content,
  }
}

export function parseStringifiedAdf(value: string): JiraAdfDocument | null {
  const trimmedValue = value.trim()
  if (!trimmedValue.startsWith('{') || !trimmedValue.endsWith('}')) {
    return null
  }

  try {
    const parsedValue: unknown = JSON.parse(trimmedValue)
    return isJiraAdfDocument(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

function isSupportedMark(mark: JiraAdfMark): boolean {
  if (typeof mark.type !== 'string' || !SUPPORTED_MARK_TYPES.has(mark.type)) return false
  if (mark.type !== 'link') return true
  return typeof mark.attrs?.href === 'string' && mark.attrs.href.length > 0
}

function isSupportedNode(node: JiraAdfNode): boolean {
  if (typeof node.type !== 'string' || !SUPPORTED_NODE_TYPES.has(node.type)) return false
  if (node.marks && !node.marks.every(isSupportedMark)) return false
  if (!node.content?.length) return true
  return node.content.every(isSupportedNode)
}

export function isSupportedEditorAdf(doc: JiraAdfDocument | null | undefined): boolean {
  if (!doc) return true
  if (!isJiraAdfDocument(doc)) return false
  return doc.content.every(isSupportedNode)
}

export function coerceDescriptionToAdf(
  description: string | undefined,
  descriptionAdf: JiraAdfDocument | undefined,
): JiraAdfDocument | null {
  if (descriptionAdf && isJiraAdfDocument(descriptionAdf)) {
    return normalizeAdf(descriptionAdf)
  }

  if (typeof description === 'string' && description.length > 0) {
    const parsedAdf = parseStringifiedAdf(description)
    if (parsedAdf) {
      return normalizeAdf(parsedAdf)
    }

    return plainTextToAdf(description)
  }

  return null
}
