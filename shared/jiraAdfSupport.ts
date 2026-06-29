import type { JiraAdfDocument, JiraAdfMark, JiraAdfNode } from './jiraAdfTypes'
import { plainTextToAdf } from './jiraAdfBuild'
import { normalizeAdf } from './jiraAdfNormalize'
import {
  isJiraAdfDocument,

} from './jiraAdfTypes'

const SUPPORTED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'media',
  'mediaSingle',
  'mediaGroup',
  'mention',
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

export function parseStringifiedAdf(value: string): JiraAdfDocument | null {
  const trimmedValue = value.trim()
  if (!trimmedValue.startsWith('{') || !trimmedValue.endsWith('}')) {
    return null
  }

  try {
    const parsedValue: unknown = JSON.parse(trimmedValue)
    return isJiraAdfDocument(parsedValue) ? parsedValue : null
  }
  catch {
    return null
  }
}

function isSupportedMark(mark: JiraAdfMark): boolean {
  if (typeof mark.type !== 'string' || !SUPPORTED_MARK_TYPES.has(mark.type))
    return false
  if (mark.type !== 'link')
    return true
  return typeof mark.attrs?.href === 'string' && mark.attrs.href.length > 0
}

export function isSupportedEditorAdfNodeShallow(node: JiraAdfNode): boolean {
  if (typeof node.type !== 'string' || !SUPPORTED_NODE_TYPES.has(node.type))
    return false
  if (node.marks && !node.marks.every(isSupportedMark))
    return false

  if (node.type === 'mention') {
    return typeof node.attrs?.id === 'string' && node.attrs.id.length > 0
  }

  if (node.type === 'media') {
    if (node.attrs?.type === 'external') {
      return typeof node.attrs.url === 'string' && node.attrs.url.length > 0
    }

    return typeof node.attrs?.id === 'string'
      && node.attrs.id.length > 0
      && typeof node.attrs.type === 'string'
      && node.attrs.type.length > 0
  }

  if (node.type === 'mediaSingle' || node.type === 'mediaGroup') {
    return !!node.content?.length
  }

  return true
}

function isSupportedNode(node: JiraAdfNode): boolean {
  if (!isSupportedEditorAdfNodeShallow(node))
    return false

  if (!node.content?.length)
    return true
  return node.content.every(isSupportedNode)
}

export function isSupportedEditorAdf(doc: JiraAdfDocument | null | undefined): boolean {
  if (!doc)
    return true
  if (!isJiraAdfDocument(doc))
    return false
  return doc.content.every(isSupportedNode)
}

function supportedMarks(marks: JiraAdfMark[] | undefined): JiraAdfMark[] | undefined {
  const filteredMarks = marks?.filter(isSupportedMark) ?? []
  return filteredMarks.length ? filteredMarks : undefined
}

function isSupportedMediaNode(node: JiraAdfNode): boolean {
  if (node.attrs?.type === 'external') {
    return typeof node.attrs.url === 'string' && node.attrs.url.length > 0
  }

  return typeof node.attrs?.id === 'string'
    && node.attrs.id.length > 0
    && typeof node.attrs.type === 'string'
    && node.attrs.type.length > 0
}

function simplifyNodeForEditor(node: JiraAdfNode): JiraAdfNode[] {
  if (typeof node.type !== 'string' || !SUPPORTED_NODE_TYPES.has(node.type)) {
    return node.content?.flatMap(simplifyNodeForEditor) ?? []
  }

  if (node.type === 'media' && !isSupportedMediaNode(node)) {
    return []
  }

  if (node.type === 'mention' && (typeof node.attrs?.id !== 'string' || !node.attrs.id)) {
    return []
  }

  const simplifiedNode: JiraAdfNode = { type: node.type }

  if (typeof node.text === 'string')
    simplifiedNode.text = node.text
  if (node.attrs)
    simplifiedNode.attrs = { ...node.attrs }

  const marks = supportedMarks(node.marks)
  if (marks)
    simplifiedNode.marks = marks

  const content = node.content?.flatMap(simplifyNodeForEditor) ?? []
  if (content.length)
    simplifiedNode.content = content

  return [simplifiedNode]
}

export function simplifyUnsupportedAdfForEditor(doc: JiraAdfDocument): JiraAdfDocument {
  return normalizeAdf({
    type: 'doc',
    version: 1,
    content: doc.content.flatMap(simplifyNodeForEditor),
  }) ?? { type: 'doc', version: 1, content: [] }
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
