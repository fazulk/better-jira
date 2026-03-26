import { broadcast } from './events'
import { env } from './config'

const JIRA_BASE_URL = env.JIRA_BASE_URL
const JIRA_EMAIL = env.JIRA_EMAIL
const JIRA_API_TOKEN = env.JIRA_API_TOKEN
const JIRA_PROJECT_KEY = env.JIRA_PROJECT_KEY

const AUTH_HEADER = 'Basic ' + btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`)
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

async function jiraFetch(
  path: string,
  options?: {
    method?: string
    params?: Record<string, string>
    body?: unknown
  },
): Promise<unknown> {
  const url = new URL(`${JIRA_BASE_URL}/rest/api/3${path}`)
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    method: options?.method ?? 'GET',
    headers: {
      'Authorization': AUTH_HEADER,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`JIRA API ${res.status}: ${body.slice(0, 200)}`)
  }

  if (res.status === 204) return null

  return res.json()
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const cached = cache.get(key)
  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }

  return cached.value
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, {
    expiresAt: Date.now() + THIRTY_DAYS_MS,
    value,
  })

  return value
}

export interface JiraTicket {
  key: string
  summary: string
  status: string
  statusCategory: string
  createdAt?: string
  updatedAt?: string
  dueDate?: string
  completedAt?: string
  priority: string
  issueType: string
  assignee: string
  assigneeAccountId?: string
  description?: string
  descriptionAdf?: JiraApiDocument
  self: string
  parent?: {
    key: string
    summary: string
    issueType: string
  }
}

export interface JiraAssignableUser {
  accountId: string
  displayName: string
}

export interface JiraMessage {
  id: string
  author: string
  createdAt: string
  body: string
}

export type JiraCreateIssueType = string

export interface JiraCreateIssueTypeOption {
  id: string
  name: string
  subtask: boolean
  hierarchyLevel: number
  parentRequired: boolean
  parentSupported: boolean
}

export type JiraCreateFieldValue = string | string[] | null

export interface CreateIssueInput {
  issueType: JiraCreateIssueType
  parentKey?: string | null
  fields: Record<string, JiraCreateFieldValue>
}

interface JiraApiUser {
  accountId?: string
  displayName?: string
  name?: string
  value?: string
  id?: string
}

interface JiraApiTextNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: JiraApiMark[]
  content?: JiraApiTextNode[]
}

interface JiraApiMark {
  type?: string
  attrs?: Record<string, unknown>
}

interface JiraApiDocument extends JiraApiTextNode {
  type: 'doc'
  version: number
  content: JiraApiTextNode[]
}

interface JiraApiComment {
  id?: string
  author?: JiraApiUser
  created?: string
  body?: JiraApiTextNode | string | null
}

interface JiraApiCommentsResponse {
  comments?: JiraApiComment[]
}

interface JiraApiTransition {
  id?: string
  name?: string
  to?: {
    statusCategory?: {
      key?: string
    }
  }
}

interface JiraApiTransitionsResponse {
  transitions?: JiraApiTransition[]
}

interface JiraApiPriority {
  id?: string
  name?: string
}

interface JiraEditMetaResponse {
  fields?: {
    priority?: {
      allowedValues?: JiraApiPriority[]
    }
  }
}

interface JiraApiIssueType {
  id?: string
  name?: string
  subtask?: boolean
  hierarchyLevel?: number
}

interface JiraApiProjectIssueTypesResponse {
  issueTypes?: JiraApiIssueType[]
}

interface JiraApiProject {
  id?: string
  key?: string
  name?: string
}

interface JiraApiProjectSearchResponse {
  values?: JiraApiProject[]
}

interface JiraApiIssueFields {
  summary?: string
  status?: {
    name?: string
    statusCategory?: {
      key?: string
    }
  }
  created?: string
  updated?: string
  duedate?: string
  resolutiondate?: string
  priority?: {
    name?: string
  }
  issuetype?: {
    id?: string
    name?: string
  }
  assignee?: JiraApiUser
  description?: unknown
  parent?: {
    key?: string
    fields?: {
      summary?: string
      issuetype?: {
        name?: string
      }
    }
  }
}

interface JiraApiIssue {
  key?: string
  self?: string
  fields?: JiraApiIssueFields
}

interface JiraApiCreateIssueResponse {
  key?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isJiraApiUser(value: unknown): value is Required<JiraApiUser> {
  if (!isRecord(value)) return false
  return typeof value.accountId === 'string' && typeof value.displayName === 'string'
}

function isJiraApiTextNode(value: unknown): value is JiraApiTextNode {
  return isRecord(value)
}

function isJiraApiDocument(value: unknown): value is JiraApiDocument {
  return isRecord(value) && value.type === 'doc' && typeof value.version === 'number' && Array.isArray(value.content)
}

function isJiraApiTransition(value: JiraApiTransition): value is Required<Pick<JiraApiTransition, 'id' | 'name'>> & JiraApiTransition {
  return typeof value.id === 'string' && typeof value.name === 'string'
}

function isJiraApiPriority(value: unknown): value is Required<JiraApiPriority> {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && typeof value.name === 'string'
}

function isJiraApiIssue(value: unknown): value is JiraApiIssue {
  return isRecord(value)
}

function isJiraApiProject(value: unknown): value is JiraApiProject {
  return isRecord(value)
}

function mapIssue(issue: JiraApiIssue, includeDescription = false): JiraTicket {
  const fields = issue.fields
  const ticket: JiraTicket = {
    key: issue.key ?? '',
    summary: fields?.summary ?? '',
    status: fields?.status?.name ?? '',
    statusCategory: fields?.status?.statusCategory?.key ?? '',
    createdAt: fields?.created ?? undefined,
    updatedAt: fields?.updated ?? undefined,
    dueDate: fields?.duedate ?? undefined,
    completedAt: fields?.resolutiondate ?? undefined,
    priority: fields?.priority?.name ?? '',
    issueType: fields?.issuetype?.name ?? '',
    assignee: fields?.assignee?.displayName ?? 'Unassigned',
    assigneeAccountId: fields?.assignee?.accountId ?? undefined,
    self: issue.self ?? '',
    parent: fields?.parent
      ? {
          key: fields.parent.key ?? '',
          summary: fields.parent.fields?.summary ?? '',
          issueType: fields.parent.fields?.issuetype?.name ?? '',
        }
      : undefined,
  }
  if (includeDescription) {
    ticket.description = extractDescription(fields?.description)
    ticket.descriptionAdf = extractDescriptionAdf(fields?.description)
  }
  return ticket
}

function extractDescription(desc: unknown): string {
  if (!desc) return ''
  if (typeof desc === 'string') return desc
  if (isJiraApiDocument(desc)) {
    return extractAdfText(desc.content)
  }
  return JSON.stringify(desc)
}

function extractDescriptionAdf(desc: unknown): JiraApiDocument | undefined {
  if (isJiraApiDocument(desc)) {
    return normalizeAdfDocument(desc)
  }

  return undefined
}

function normalizeAdfDocument(doc: JiraApiDocument): JiraApiDocument {
  const textBlob = extractSingleParagraphTextBlob(doc)

  if (textBlob && textBlob.includes('\n')) {
    return buildAdfDocument(textBlob.trimEnd())
  }

  return doc
}

function extractSingleParagraphTextBlob(doc: JiraApiDocument): string | null {
  if (doc.content.length !== 1) return null

  const [firstNode] = doc.content
  if (firstNode?.type !== 'paragraph') return null

  const paragraphContent = firstNode.content ?? []
  if (!paragraphContent.every((node) => node.type === 'text' && !node.marks?.length)) {
    return null
  }

  return paragraphContent.map((node) => node.text ?? '').join('')
}

function extractAdfText(nodes: JiraApiTextNode[], depth = 0): string {
  return nodes.map((node) => extractAdfNodeText(node, depth)).join('')
}

function extractAdfNodeText(node: JiraApiTextNode, depth: number): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'paragraph' || node.type === 'heading') {
    return extractAdfText(node.content ?? [], depth) + '\n'
  }
  if (node.type === 'bulletList') {
    return (node.content ?? [])
      .map((listItem) => `${'  '.repeat(depth)}• ${extractListItemText(listItem, depth + 1)}\n`)
      .join('')
  }
  if (node.type === 'orderedList') {
    const start = getNodeOrder(node)
    return (node.content ?? [])
      .map((listItem, index) => `${'  '.repeat(depth)}${start + index}. ${extractListItemText(listItem, depth + 1)}\n`)
      .join('')
  }
  if (node.type === 'codeBlock') {
    return '```\n' + extractAdfText(node.content ?? [], depth) + '```\n'
  }
  if (node.content) return extractAdfText(node.content, depth)
  return ''
}

function extractListItemText(node: JiraApiTextNode, depth: number): string {
  return extractAdfText(node.content ?? [], depth).trim()
}

function getNodeOrder(node: JiraApiTextNode): number {
  const order = node.attrs?.order
  return typeof order === 'number' && Number.isFinite(order) ? order : 1
}

const DEFAULT_QUERY = JIRA_PROJECT_KEY
  ? `project = ${JIRA_PROJECT_KEY} AND status != Done ORDER BY updated DESC`
  : 'status != Done ORDER BY updated DESC'

function buildAdfDocument(text: string) {
  const content = buildAdfContent(text)

  return {
    type: 'doc',
    version: 1,
    content,
  }
}

function buildAdfContent(text: string): JiraApiTextNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const content: JiraApiTextNode[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bulletMatch) {
      const items: JiraApiTextNode[] = []
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
      const items: JiraApiTextNode[] = []
      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*(\d+)[.)]\s+(.*)$/)
        if (!currentMatch) break
        items.push(buildListItem(currentMatch[2]))
        index += 1
      }
      content.push({
        type: 'orderedList',
        attrs: {
          order: Number.isFinite(start) ? start : 1,
        },
        content: items,
      })
      continue
    }

    content.push(buildParagraph(line))
    index += 1
  }

  return content
}

function buildListItem(text: string): JiraApiTextNode {
  return {
    type: 'listItem',
    content: [buildParagraph(text)],
  }
}

function buildParagraph(text: string): JiraApiTextNode {
  return {
    type: 'paragraph',
    content: buildInlineContent(text),
  }
}

function buildInlineContent(text: string): JiraApiTextNode[] {
  if (!text) return []

  const nodes: JiraApiTextNode[] = []
  const urlPattern = /https?:\/\/\S+/g
  let lastIndex = 0

  for (const match of text.matchAll(urlPattern)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      nodes.push({
        type: 'text',
        text: text.slice(lastIndex, matchIndex),
      })
    }

    nodes.push({
      type: 'text',
      text: matchedText,
      marks: [
        {
          type: 'link',
          attrs: {
            href: matchedText,
          },
        },
      ],
    })

    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    nodes.push({
      type: 'text',
      text: text.slice(lastIndex),
    })
  }

  return nodes
}

function isCreateIssueType(value: string): value is JiraCreateIssueType {
  return value.trim().length > 0
}

function normalizeIssueType(value: string): string {
  return value.trim().toLowerCase()
}

function matchesIssueType(value: string | undefined, expected: JiraCreateIssueType): boolean {
  return normalizeIssueType(value ?? '') === expected.toLowerCase()
}

function getAllowedChildIssueTypesForParent(parentIssueType: string): string[] {
  const normalizedParentIssueType = normalizeIssueType(parentIssueType)

  if (normalizedParentIssueType.includes('epic') || normalizedParentIssueType.includes('story')) {
    return ['Task', 'Bug', 'Story']
  }

  if (normalizedParentIssueType.includes('task') || normalizedParentIssueType.includes('bug')) {
    return ['Task']
  }

  return []
}

function isAllowedChildIssueTypeForParent(parentIssueType: string, childIssueType: string): boolean {
  const allowedChildIssueTypes = getAllowedChildIssueTypesForParent(parentIssueType)
  return allowedChildIssueTypes.some((candidate) => matchesIssueType(childIssueType, candidate))
}

type SupportedCreateFieldKey = 'summary' | 'description' | 'priority' | 'assignee' | 'duedate'

interface SupportedCreateFieldDescriptor {
  key: SupportedCreateFieldKey
  label: string
  required: boolean
}

const SUPPORTED_CREATE_FIELDS: SupportedCreateFieldDescriptor[] = [
  { key: 'summary', label: 'Title', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'priority', label: 'Priority', required: false },
  { key: 'assignee', label: 'Assignee', required: false },
  { key: 'duedate', label: 'Due Date', required: false },
]

async function getCandidateProjects(): Promise<JiraApiProject[]> {
  const data = await jiraFetch('/project/search', {
    params: {
      maxResults: '50',
    },
  })

  if (!isRecord(data) || !Array.isArray(data.values)) {
    throw new Error('Unable to resolve a Jira project for issue creation')
  }

  const projects = data.values.filter(isJiraApiProject)
  if (!projects.length) {
    throw new Error('No Jira project is available for issue creation')
  }

  return projects
}

async function getProject(projectKey: string): Promise<JiraApiProject | null> {
  const project = await jiraFetch(`/project/${encodeURIComponent(projectKey)}`)
  return isJiraApiProject(project) ? project : null
}

async function resolveProjectKey(issueType: JiraCreateIssueType, parentKey?: string | null): Promise<string> {
  if (parentKey) {
    const separatorIndex = parentKey.indexOf('-')
    if (separatorIndex > 0) {
      return parentKey.slice(0, separatorIndex)
    }
  }

  if (JIRA_PROJECT_KEY) {
    try {
      const project = await getProject(JIRA_PROJECT_KEY)
      if (project && typeof project.key === 'string' && project.key) {
        const issueTypes = await getProjectIssueTypes(project.key)
        if (issueTypes.some((candidate) => matchesIssueType(candidate.name, issueType))) {
          return project.key
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const isMissingProject = message.includes('No project could be found')
        || message.includes('404')

      if (!isMissingProject) {
        throw error
      }
    }
  }

  const projects = await getCandidateProjects()
  for (const project of projects) {
    if (typeof project.key !== 'string' || !project.key) {
      continue
    }

    const issueTypes = await getProjectIssueTypes(project.key)
    if (issueTypes.some((candidate) => matchesIssueType(candidate.name, issueType))) {
      return project.key
    }
  }

  throw new Error(`Issue type ${issueType} is not available in any accessible Jira project`)
}

async function getProjectIssueTypes(projectKey: string): Promise<JiraApiIssueType[]> {
  const data = await jiraFetch(`/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`)
  if (!isRecord(data) || !Array.isArray(data.issueTypes)) {
    return []
  }

  return data.issueTypes
    .filter(isRecord)
    .map((issueType) => ({
      id: typeof issueType.id === 'string' ? issueType.id : undefined,
      name: typeof issueType.name === 'string' ? issueType.name : undefined,
      subtask: typeof issueType.subtask === 'boolean' ? issueType.subtask : undefined,
      hierarchyLevel: typeof issueType.hierarchyLevel === 'number' ? issueType.hierarchyLevel : undefined,
    }))
}

interface JiraApiCreateField {
  key?: string
  required?: boolean
}

interface JiraApiIssueTypeFieldsResponse {
  fields?: JiraApiCreateField[]
}

async function getIssueTypeCreateFields(projectKey: string, issueTypeId: string): Promise<JiraApiCreateField[]> {
  const data = await jiraFetch(`/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`)
  if (!isRecord(data) || !Array.isArray(data.fields)) {
    return []
  }

  return data.fields.filter(isRecord).map((field) => ({
    key: typeof field.key === 'string' ? field.key : undefined,
    required: typeof field.required === 'boolean' ? field.required : undefined,
  }))
}

async function getCreateIssueTypeOptions(projectKey: string): Promise<JiraCreateIssueTypeOption[]> {
  const issueTypes = await getProjectIssueTypes(projectKey)

  const options = await Promise.all(issueTypes.map(async (issueType) => {
    if (!issueType.id || !issueType.name) {
      return null
    }

    const fields = await getIssueTypeCreateFields(projectKey, issueType.id)
    const parentField = fields.find((field) => field.key === 'parent')

    return {
      id: issueType.id,
      name: issueType.name,
      subtask: issueType.subtask ?? false,
      hierarchyLevel: issueType.hierarchyLevel ?? 0,
      parentRequired: parentField?.required ?? false,
      parentSupported: Boolean(parentField),
    } satisfies JiraCreateIssueTypeOption
  }))

  return options
    .filter((option): option is JiraCreateIssueTypeOption => option !== null)
    .sort((left, right) => (
      right.hierarchyLevel - left.hierarchyLevel
      || left.name.localeCompare(right.name)
    ))
}

function getProjectKeyFromIssueKey(issueKey: string): string | null {
  const separatorIndex = issueKey.indexOf('-')
  if (separatorIndex <= 0) {
    return null
  }

  return issueKey.slice(0, separatorIndex)
}

async function getParentValidatedCreateIssueTypeOptions(parentKey: string): Promise<JiraCreateIssueTypeOption[]> {
  const projectKey = getProjectKeyFromIssueKey(parentKey)
  if (!projectKey) {
    throw new Error(`Invalid parent key: ${parentKey}`)
  }

  const [parent, issueTypeOptions] = await Promise.all([
    getTicket(parentKey),
    getCreateIssueTypeOptions(projectKey),
  ])

  return issueTypeOptions.filter((issueType) => (
    issueType.parentSupported
    && !matchesIssueType(issueType.name, 'Epic')
    && isAllowedChildIssueTypeForParent(parent.issueType, issueType.name)
  ))
}

export async function getCreateIssueTypes(parentKey?: string | null): Promise<JiraCreateIssueTypeOption[]> {
  if (parentKey) {
    return getParentValidatedCreateIssueTypeOptions(parentKey)
  }

  if (JIRA_PROJECT_KEY) {
    try {
      const project = await getProject(JIRA_PROJECT_KEY)
      if (project?.key) {
        return (await getCreateIssueTypeOptions(project.key)).filter((issueType) => !issueType.parentRequired)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const isMissingProject = message.includes('No project could be found')
        || message.includes('404')

      if (!isMissingProject) {
        throw error
      }
    }
  }

  const projects = await getCandidateProjects()
  const seenIssueTypes = new Set<string>()
  const mergedIssueTypes: JiraCreateIssueTypeOption[] = []

  for (const project of projects) {
    if (!project.key) {
      continue
    }

    const projectIssueTypes = await getCreateIssueTypeOptions(project.key)
    for (const issueType of projectIssueTypes) {
      const normalizedIssueTypeName = normalizeIssueType(issueType.name)
      if (issueType.parentRequired || seenIssueTypes.has(normalizedIssueTypeName)) {
        continue
      }

      seenIssueTypes.add(normalizedIssueTypeName)
      mergedIssueTypes.push(issueType)
    }
  }

  return mergedIssueTypes.sort((left, right) => (
    right.hierarchyLevel - left.hierarchyLevel
    || left.name.localeCompare(right.name)
  ))
}

export async function getCreateAssignableUsers(
  issueType: JiraCreateIssueType,
  parentKey?: string | null,
): Promise<JiraAssignableUser[]> {
  const projectKey = await resolveProjectKey(issueType, parentKey)
  const data = await jiraFetch('/user/assignable/multiProjectSearch', {
    params: {
      projectKeys: projectKey,
      maxResults: '100',
    },
  })

  if (!Array.isArray(data)) return []

  return data
    .filter(isJiraApiUser)
    .map((user) => ({
      accountId: user.accountId,
      displayName: user.displayName,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export async function getCreatePriorities(
  issueType: JiraCreateIssueType,
  parentKey?: string | null,
): Promise<JiraPriority[]> {
  void issueType
  void parentKey
  return getAllPriorities()
}

async function getIssueTypeId(issueType: JiraCreateIssueType, projectKey: string): Promise<string> {
  const issueTypes = await getProjectIssueTypes(projectKey)
  const matchedIssueType = issueTypes.find((candidate) => matchesIssueType(candidate.name, issueType))

  if (!matchedIssueType?.id) {
    throw new Error(`Issue type ${issueType} is not available for project ${projectKey}`)
  }

  return matchedIssueType.id
}

async function getIssueTypeOption(issueType: JiraCreateIssueType, projectKey: string): Promise<JiraCreateIssueTypeOption> {
  const issueTypeOptions = await getCreateIssueTypeOptions(projectKey)
  const matchedIssueType = issueTypeOptions.find((candidate) => matchesIssueType(candidate.name, issueType))

  if (!matchedIssueType) {
    throw new Error(`Issue type ${issueType} is not available for project ${projectKey}`)
  }

  return matchedIssueType
}

function serializeFieldValue(
  definition: SupportedCreateFieldDescriptor,
  value: JiraCreateFieldValue,
): unknown {
  if (definition.key === 'description') {
    if (typeof value !== 'string') return null
    const nextValue = value.trim()
    return nextValue ? buildAdfDocument(nextValue) : null
  }

  if (definition.key === 'priority') {
    if (typeof value !== 'string' || !value.trim()) return null
    return { id: value.trim() }
  }

  if (definition.key === 'assignee') {
    if (typeof value !== 'string' || !value.trim()) return null
    return { accountId: value.trim() }
  }

  if (definition.key === 'duedate') {
    if (typeof value !== 'string' || !value.trim()) return null
    return value.trim()
  }

  if (typeof value !== 'string') return ''
  return value.trim()
}

function validateRequiredFields(
  definitions: SupportedCreateFieldDescriptor[],
  providedFields: Record<string, JiraCreateFieldValue>,
): void {
  for (const definition of definitions) {
    if (!definition.required) continue

    const value = providedFields[definition.key]
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${definition.label} is required`)
    }
  }
}

function buildCreateFieldsPayload(
  definitions: SupportedCreateFieldDescriptor[],
  providedFields: Record<string, JiraCreateFieldValue>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const definition of definitions) {
    const value = providedFields[definition.key]
    if (value === undefined) continue

    const serializedValue = serializeFieldValue(definition, value)

    if (serializedValue === null) continue
    if (typeof serializedValue === 'string' && serializedValue === '') continue
    if (Array.isArray(serializedValue) && serializedValue.length === 0) continue

    payload[definition.key] = serializedValue
  }

  return payload
}

async function validateParent(issueType: JiraCreateIssueType, parentKey: string | null | undefined): Promise<void> {
  const projectKey = await resolveProjectKey(issueType, parentKey)
  const childIssueType = await getIssueTypeOption(issueType, projectKey)

  if (!parentKey) {
    if (childIssueType.parentRequired) {
      throw new Error(`${issueType} requires a parent`)
    }
    return
  }

  if (!childIssueType.parentSupported) {
    throw new Error(`${issueType} cannot have a parent`)
  }

  const allowedIssueTypes = await getParentValidatedCreateIssueTypeOptions(parentKey)
  const isAllowedForParent = allowedIssueTypes.some((candidate) => matchesIssueType(candidate.name, issueType))
  if (isAllowedForParent) {
    return
  }

  const parent = await getTicket(parentKey)
  if (matchesIssueType(issueType, 'Epic')) {
    throw new Error('Epic cannot be added as a child')
  }

  if (!isAllowedChildIssueTypeForParent(parent.issueType, issueType)) {
    throw new Error(`${issueType} cannot be added under ${parent.issueType}`)
  }

  throw new Error(`${issueType} is not allowed by Jira for parent ${parentKey}`)
}

export async function createIssue(input: CreateIssueInput): Promise<JiraTicket> {
  if (!isCreateIssueType(input.issueType)) {
    throw new Error(`Unsupported issue type: ${input.issueType}`)
  }

  await validateParent(input.issueType, input.parentKey)

  const projectKey = await resolveProjectKey(input.issueType, input.parentKey)
  const issueTypeId = await getIssueTypeId(input.issueType, projectKey)

  validateRequiredFields(SUPPORTED_CREATE_FIELDS, input.fields)

  const fields = buildCreateFieldsPayload(SUPPORTED_CREATE_FIELDS, input.fields)
  const createPayload: Record<string, unknown> = {
    project: { key: projectKey },
    issuetype: { id: issueTypeId },
    ...fields,
  }

  if (input.parentKey) {
    createPayload.parent = { key: input.parentKey }
  }

  const data = await jiraFetch('/issue', {
    method: 'POST',
    body: {
      fields: createPayload,
    },
  })

  const issueKey = isRecord(data) && typeof data.key === 'string' ? data.key : null
  if (!issueKey) {
    throw new Error('Jira create response did not include an issue key')
  }

  const createdTicket = await getTicket(issueKey)
  broadcast('ticket-created', createdTicket)
  return createdTicket
}

export async function searchTickets(jql?: string): Promise<JiraTicket[]> {
  const query = jql || DEFAULT_QUERY
  const issues: unknown[] = []
  let startAt = 0
  const maxResults = 100

  while (true) {
    const data = await jiraFetch('/search/jql', {
      params: {
        jql: query,
        fields: 'summary,status,priority,issuetype,assignee,parent,created,updated,duedate,resolutiondate',
        maxResults: String(maxResults),
        startAt: String(startAt),
      },
    })

    const batch = isRecord(data) && Array.isArray(data.issues) ? data.issues : []
    const total = isRecord(data) && typeof data.total === 'number' ? data.total : batch.length
    issues.push(...batch)

    if (batch.length < maxResults || issues.length >= total) {
      break
    }

    startAt += batch.length
  }

  return issues.filter(isJiraApiIssue).map((issue) => mapIssue(issue))
}

export async function getTicket(key: string): Promise<JiraTicket> {
  const data = await jiraFetch(`/issue/${key}`, {
    params: {
      fields: 'summary,status,priority,issuetype,assignee,description,parent,created,updated,duedate,resolutiondate',
    },
  })
  return mapIssue(isJiraApiIssue(data) ? data : {}, true)
}

function mapComment(comment: JiraApiComment): JiraMessage {
  return {
    id: comment.id ?? '',
    author: comment.author?.displayName ?? 'Unknown',
    createdAt: comment.created ?? '',
    body: extractDescription(comment.body).trim(),
  }
}

export async function getTicketMessages(key: string): Promise<JiraMessage[]> {
  const data = await jiraFetch(`/issue/${key}/comment`, {
    params: {
      orderBy: '-created',
    },
  })

  if (!isRecord(data) || !Array.isArray(data.comments)) return []

  return data.comments.map(mapComment)
}

export async function addTicketMessage(key: string, body: string): Promise<JiraMessage> {
  const nextBody = body.trim()
  if (!nextBody) {
    throw new Error('Message cannot be empty')
  }

  const data = await jiraFetch(`/issue/${key}/comment`, {
    method: 'POST',
    body: {
      body: buildAdfDocument(nextBody),
    },
  })

  return mapComment(isRecord(data) ? data : {})
}

export async function updateTicketTitle(key: string, summary: string): Promise<JiraTicket> {
  const nextSummary = summary.trim()
  if (!nextSummary) {
    throw new Error('Title cannot be empty')
  }

  await jiraFetch(`/issue/${key}`, {
    method: 'PUT',
    body: {
      fields: {
        summary: nextSummary,
      },
    },
  })

  const updatedTicket = await getTicket(key)
  broadcast('ticket-updated', updatedTicket)
  return updatedTicket
}

export async function updateTicketDescription(key: string, description: string): Promise<JiraTicket> {
  const adfBody = description ? buildAdfDocument(description) : null

  await jiraFetch(`/issue/${key}`, {
    method: 'PUT',
    body: {
      fields: {
        description: adfBody,
      },
    },
  })

  const updatedTicket = await getTicket(key)
  broadcast('ticket-updated', updatedTicket)
  return updatedTicket
}

export async function getAssignableUsers(key: string): Promise<JiraAssignableUser[]> {
  const data = await jiraFetch('/user/assignable/search', {
    params: {
      issueKey: key,
      maxResults: '100',
    },
  })

  if (!Array.isArray(data)) return []

  return data
    .filter(isJiraApiUser)
    .map((user) => ({
      accountId: user.accountId,
      displayName: user.displayName,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function updateTicketAssignee(key: string, accountId: string | null): Promise<JiraTicket> {
  await jiraFetch(`/issue/${key}/assignee`, {
    method: 'PUT',
    body: {
      accountId,
    },
  })

  const updatedTicket = await getTicket(key)
  broadcast('ticket-updated', updatedTicket)
  return updatedTicket
}

export interface JiraPriority {
  id: string
  name: string
}

const projectPrioritiesCache = new Map<string, CacheEntry<JiraPriority[]>>()
let allPrioritiesCache: CacheEntry<JiraPriority[]> | null = null

function parsePrioritySearchResponse(data: unknown): JiraPriority[] {
  const priorities = isRecord(data) && Array.isArray(data.values)
    ? data.values
    : Array.isArray(data)
      ? data
      : []

  return priorities
    .filter(isJiraApiPriority)
    .map((priority) => ({
      id: priority.id,
      name: priority.name,
    }))
}

async function getProjectPriorities(projectKey: string): Promise<JiraPriority[]> {
  const cachedPriorities = getCachedValue(projectPrioritiesCache, projectKey)
  if (cachedPriorities) {
    return cachedPriorities
  }

  const project = await getProject(projectKey)
  const projectId = project?.id

  if (!projectId) {
    return []
  }

  const data = await jiraFetch('/priority/search', {
    params: {
      projectId,
      maxResults: '100',
    },
  })

  return setCachedValue(projectPrioritiesCache, projectKey, parsePrioritySearchResponse(data))
}

export async function getAllPriorities(): Promise<JiraPriority[]> {
  if (allPrioritiesCache && allPrioritiesCache.expiresAt > Date.now()) {
    return allPrioritiesCache.value
  }

  const candidateProjectKeys = new Set<string>()

  if (JIRA_PROJECT_KEY) {
    try {
      const project = await getProject(JIRA_PROJECT_KEY)
      if (project?.key) {
        candidateProjectKeys.add(project.key)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const isMissingProject = message.includes('No project could be found')
        || message.includes('404')

      if (!isMissingProject) {
        throw error
      }
    }
  }

  if (!candidateProjectKeys.size) {
    const projects = await getCandidateProjects()
    for (const project of projects) {
      if (project.key) {
        candidateProjectKeys.add(project.key)
      }
    }
  }

  const prioritiesById = new Map<string, JiraPriority>()

  for (const projectKey of candidateProjectKeys) {
    const priorities = await getProjectPriorities(projectKey)
    for (const priority of priorities) {
      prioritiesById.set(priority.id, priority)
    }
  }

  const priorities = [...prioritiesById.values()]
  allPrioritiesCache = {
    expiresAt: Date.now() + THIRTY_DAYS_MS,
    value: priorities,
  }

  return priorities
}

export async function getPriorities(key: string): Promise<JiraPriority[]> {
  void key
  return getAllPriorities()
}

export async function updateTicketPriority(key: string, priorityId: string): Promise<JiraTicket> {
  const nextPriorityId = priorityId.trim()
  if (!nextPriorityId) {
    throw new Error('Priority is required')
  }

  await jiraFetch(`/issue/${key}`, {
    method: 'PUT',
    body: {
      fields: {
        priority: {
          id: nextPriorityId,
        },
      },
    },
  })

  const updatedTicket = await getTicket(key)
  broadcast('ticket-updated', updatedTicket)
  return updatedTicket
}

export interface JiraTransition {
  id: string
  name: string
  statusCategory: string
}

export async function getTransitions(key: string): Promise<JiraTransition[]> {
  const data = await jiraFetch(`/issue/${key}/transitions`)
  if (!isRecord(data) || !Array.isArray(data.transitions)) return []

  return data.transitions
    .filter(isJiraApiTransition)
    .map((t) => ({
      id: t.id,
      name: t.name,
      statusCategory: t.to?.statusCategory?.key ?? 'indeterminate',
    }))
}

export async function updateTicketStatus(key: string, transitionId: string): Promise<JiraTicket> {
  await jiraFetch(`/issue/${key}/transitions`, {
    method: 'POST',
    body: {
      transition: { id: transitionId },
    },
  })

  const updatedTicket = await getTicket(key)
  broadcast('ticket-updated', updatedTicket)
  return updatedTicket
}

export async function forceRefreshTickets(): Promise<{ tickets: JiraTicket[]; updatedAt: number }> {
  broadcast('refreshing', { status: 'started' })
  try {
    const tickets = await searchTickets()
    const payload = { tickets, updatedAt: Date.now() }
    broadcast('tickets', payload)
    return payload
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Background refresh failed'
    console.error('Background refresh failed:', message)
    broadcast('error', { message })
    throw err
  }
}
