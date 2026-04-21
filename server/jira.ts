import { broadcast } from './events'
import { env } from './config'
import { getAppSettings } from './settings'
import { getJiraCredentials } from './jiraCredentials'
import {
  adfToPlainText,
  isJiraAdfDocument,
  isRecord,
  normalizeAdf,
  parseStringifiedAdf,
  plainTextToAdf,
  type JiraAdfDocument,
  type JiraAdfNode,
} from '../shared/jiraAdf'
import {
  buildEnabledSpaceSearchQuery,
  buildUpdatedSinceSearchQuery,
  type JiraSpaceDirectoryEntry,
} from '../shared/settings'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function getJiraConfig() {
  const { baseUrl, email, apiToken } = getJiraCredentials()

  return {
    baseUrl,
    email,
    apiToken,
    projectKey: env.JIRA_PROJECT_KEY,
    authHeader: 'Basic ' + btoa(`${email}:${apiToken}`),
  }
}

function isJiraAuthenticationFailure(res: Response): boolean {
  return res.headers.get('x-seraph-loginreason') === 'AUTHENTICATED_FAILED'
}

function createJiraAuthenticationError(): Error {
  return new Error('Jira authentication failed. Update your Jira email or API token in Settings.')
}

function serializeJiraLogPayload(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined
  }

  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function formatJiraRequestTarget(url: URL): string {
  return url.pathname.replace(/^\/rest\/api\/3/, '') || '/'
}

function formatJiraLogLines(
  prefix: string,
  method: string,
  target: string,
  details: string[],
): string {
  return [`[jira] ${prefix} ${method} ${target}`, ...details.map(detail => `  ${detail}`)].join('\n')
}

function collectJiraRequestDetails(
  params?: Record<string, string>,
  body?: unknown,
): string[] {
  const details: string[] = []

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      details.push(`param ${key}: ${value}`)
    }
  }

  const serializedBody = serializeJiraLogPayload(body)
  if (serializedBody) {
    details.push(`body: ${serializedBody}`)
  }

  return details
}

async function jiraFetch(
  path: string,
  options?: {
    method?: string
    params?: Record<string, string>
    body?: unknown
  },
): Promise<unknown> {
  const jiraConfig = getJiraConfig()
  const url = new URL(`${jiraConfig.baseUrl}/rest/api/3${path}`)
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v)
    }
  }

  const method = options?.method ?? 'GET'
  const requestUrl = url.toString()
  const requestTarget = formatJiraRequestTarget(url)
  const startedAt = Date.now()
  const requestDetails = collectJiraRequestDetails(options?.params, options?.body)

  console.log(formatJiraLogLines('->', method, requestTarget, requestDetails))

  let res: Response
  try {
    res = await fetch(requestUrl, {
      method,
      headers: {
        'Authorization': jiraConfig.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (error: unknown) {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : 'Unknown Jira fetch error'
    console.error(formatJiraLogLines('xx', method, `${requestTarget} (${durationMs}ms)`, [
      `error: ${message}`,
      ...requestDetails,
    ]))
    throw error
  }

  const durationMs = Date.now() - startedAt
  console.log(`[jira] <- ${res.status} ${method} ${requestTarget} (${durationMs}ms)`)

  if (isJiraAuthenticationFailure(res)) {
    throw createJiraAuthenticationError()
  }

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
  inCurrentSprint: boolean
  createdAt?: string
  updatedAt?: string
  dueDate?: string
  completedAt?: string
  priority: string
  issueType: string
  spaceKey: string
  spaceName: string
  assignee: string
  assigneeAccountId?: string
  description?: string
  descriptionAdf?: JiraAdfDocument
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
  parentMessageId?: string | null
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

export type JiraCreateFieldValue = string | string[] | JiraAdfDocument | null

export interface CreateIssueInput {
  issueType: JiraCreateIssueType
  spaceKey?: string | null
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

interface JiraApiComment {
  id?: string
  author?: JiraApiUser
  created?: string
  body?: JiraAdfNode | string | null
  properties?: JiraApiEntityProperty[]
}

interface JiraApiCommentsResponse {
  comments?: JiraApiComment[]
}

interface JiraApiEntityProperty {
  key?: string
  value?: unknown
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
  project?: {
    key?: string
    name?: string
  }
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

interface JiraApiSprint {
  state?: string
}

let sprintFieldIdPromise: Promise<string | null> | null = null

function isJiraApiUser(value: unknown): value is Required<JiraApiUser> {
  if (!isRecord(value)) return false
  return typeof value.accountId === 'string' && typeof value.displayName === 'string'
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

function isJiraApiSprint(value: unknown): value is JiraApiSprint {
  return isRecord(value)
}

async function getSprintFieldId(): Promise<string | null> {
  if (!sprintFieldIdPromise) {
    sprintFieldIdPromise = (async () => {
      const data = await jiraFetch('/field/search', {
        params: {
          query: 'Sprint',
          maxResults: '50',
        },
      })

      if (!isRecord(data) || !Array.isArray(data.values)) {
        return null
      }

      for (const field of data.values) {
        if (!isRecord(field) || typeof field.id !== 'string' || field.name !== 'Sprint') {
          continue
        }

        const schema = isRecord(field.schema) ? field.schema : null
        if (schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint') {
          return field.id
        }
      }

      return null
    })().catch((error: unknown) => {
      sprintFieldIdPromise = null
      throw error
    })
  }

  return sprintFieldIdPromise
}

async function resolveSprintFieldId(): Promise<string | null> {
  try {
    return await getSprintFieldId()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.warn('Unable to resolve Jira sprint field:', message)
    return null
  }
}

function isTicketInCurrentSprint(fields: JiraApiIssueFields | undefined, sprintFieldId: string | null): boolean {
  if (!fields || !sprintFieldId || !isRecord(fields)) {
    return false
  }

  const sprintValue = fields[sprintFieldId]
  if (!Array.isArray(sprintValue)) {
    return false
  }

  return sprintValue.some((sprint) => isJiraApiSprint(sprint) && sprint.state === 'active')
}

function mapIssue(issue: JiraApiIssue, includeDescription = false, sprintFieldId: string | null = null): JiraTicket {
  const fields = issue.fields
  const descriptionAdf = includeDescription ? extractDescriptionAdf(fields?.description) : undefined
  const ticket: JiraTicket = {
    key: issue.key ?? '',
    summary: fields?.summary ?? '',
    status: fields?.status?.name ?? '',
    statusCategory: fields?.status?.statusCategory?.key ?? '',
    inCurrentSprint: isTicketInCurrentSprint(fields, sprintFieldId),
    createdAt: fields?.created ?? undefined,
    updatedAt: fields?.updated ?? undefined,
    dueDate: fields?.duedate ?? undefined,
    completedAt: fields?.resolutiondate ?? undefined,
    priority: fields?.priority?.name ?? '',
    issueType: fields?.issuetype?.name ?? '',
    spaceKey: fields?.project?.key ?? '',
    spaceName: fields?.project?.name ?? fields?.project?.key ?? 'Unknown space',
    assignee: fields?.assignee?.displayName ?? 'Unassigned',
    assigneeAccountId: fields?.assignee?.accountId ?? undefined,
    description: includeDescription ? extractDescription(fields?.description, descriptionAdf) : undefined,
    descriptionAdf,
    self: issue.self ?? '',
    parent: fields?.parent
      ? {
          key: fields.parent.key ?? '',
          summary: fields.parent.fields?.summary ?? '',
          issueType: fields.parent.fields?.issuetype?.name ?? '',
        }
      : undefined,
  }
  return ticket
}

function extractDescription(desc: unknown, descriptionAdf?: JiraAdfDocument): string {
  if (descriptionAdf) {
    return adfToPlainText(descriptionAdf)
  }

  if (!desc) return ''
  if (typeof desc === 'string') {
    const parsedDescriptionAdf = parseStringifiedAdf(desc)
    if (parsedDescriptionAdf) {
      return extractRawAdfText(parsedDescriptionAdf)
    }

    return desc
  }
  if (isJiraAdfDocument(desc)) {
    return extractRawAdfText(desc)
  }
  return JSON.stringify(desc)
}

function extractDescriptionAdf(desc: unknown): JiraAdfDocument | undefined {
  if (isJiraAdfDocument(desc)) {
    return normalizeAdf(desc) ?? undefined
  }

  if (typeof desc === 'string') {
    const parsedDescriptionAdf = parseStringifiedAdf(desc)
    return parsedDescriptionAdf ? normalizeAdf(parsedDescriptionAdf) ?? undefined : undefined
  }

  return undefined
}

function getRawAdfText(node: unknown): string {
  if (!isRecord(node)) return ''

  const type = typeof node.type === 'string' ? node.type : ''
  const text = typeof node.text === 'string' ? node.text : ''
  const attrs = isRecord(node.attrs) ? node.attrs : null
  const content = Array.isArray(node.content) ? node.content : []

  if (type === 'text') {
    return text
  }

  if (type === 'mention') {
    const mentionText = typeof attrs?.text === 'string' ? attrs.text : text
    return mentionText
  }

  if (type === 'emoji') {
    const emojiText = typeof attrs?.text === 'string'
      ? attrs.text
      : typeof attrs?.shortName === 'string'
        ? attrs.shortName
        : text
    return emojiText
  }

  if (type === 'hardBreak') {
    return '\n'
  }

  if (type === 'paragraph' || type === 'heading' || type === 'blockquote') {
    return content.map(getRawAdfText).join('') + '\n'
  }

  if (type === 'bulletList') {
    return content
      .map((listItem) => `• ${getRawAdfText(listItem).trim()}\n`)
      .join('')
  }

  if (type === 'orderedList') {
    const start = typeof attrs?.order === 'number' && Number.isFinite(attrs.order) ? attrs.order : 1
    return content
      .map((listItem, index) => `${start + index}. ${getRawAdfText(listItem).trim()}\n`)
      .join('')
  }

  if (type === 'codeBlock') {
    return content.map(getRawAdfText).join('')
  }

  if (type === 'doc' || type === 'listItem' || content.length > 0) {
    return content.map(getRawAdfText).join('')
  }

  return ''
}

function extractRawAdfText(doc: JiraAdfDocument): string {
  return getRawAdfText(doc).trimEnd()
}

function buildDefaultSearchQuery(): string | null {
  const enabledSpaceKeys = getAppSettings().spaces
    .filter(space => space.enabled)
    .map(space => space.key)
  return buildEnabledSpaceSearchQuery(enabledSpaceKeys)
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

export async function getAccessibleSpaces(): Promise<JiraSpaceDirectoryEntry[]> {
  const projects = await getCandidateProjects()
  const spacesByKey = new Map<string, JiraSpaceDirectoryEntry>()

  for (const project of projects) {
    const key = typeof project.key === 'string' ? project.key.trim().toUpperCase() : ''
    if (!key || spacesByKey.has(key)) {
      continue
    }

    const name = typeof project.name === 'string' && project.name.trim().length > 0
      ? project.name.trim()
      : key

    spacesByKey.set(key, {
      key,
      name,
    })
  }

  return [...spacesByKey.values()].sort((left, right) => (
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    || left.key.localeCompare(right.key, undefined, { sensitivity: 'base' })
  ))
}

async function getProject(projectKey: string): Promise<JiraApiProject | null> {
  const project = await jiraFetch(`/project/${encodeURIComponent(projectKey)}`)
  return isJiraApiProject(project) ? project : null
}

function normalizeProjectKey(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalizedValue = value.trim().toUpperCase()
  return normalizedValue.length > 0 ? normalizedValue : null
}

async function projectSupportsIssueType(projectKey: string, issueType: JiraCreateIssueType): Promise<boolean> {
  const issueTypes = await getProjectIssueTypes(projectKey)
  return issueTypes.some((candidate) => matchesIssueType(candidate.name, issueType))
}

async function resolveProjectKey(
  issueType: JiraCreateIssueType,
  parentKey?: string | null,
  spaceKey?: string | null,
): Promise<string> {
  const normalizedSpaceKey = normalizeProjectKey(spaceKey)

  if (parentKey) {
    const parentProjectKey = getProjectKeyFromIssueKey(parentKey)
    if (!parentProjectKey) {
      throw new Error(`Invalid parent key: ${parentKey}`)
    }

    if (normalizedSpaceKey && normalizedSpaceKey !== parentProjectKey) {
      throw new Error(`Parent ${parentKey} belongs to ${parentProjectKey}; choose that space or remove the parent`)
    }

    return parentProjectKey
  }

  if (normalizedSpaceKey) {
    const project = await getProject(normalizedSpaceKey)
    if (!project?.key) {
      throw new Error(`Space ${normalizedSpaceKey} is not available in Jira`)
    }

    if (!(await projectSupportsIssueType(normalizedSpaceKey, issueType))) {
      throw new Error(`Issue type ${issueType} is not available for project ${normalizedSpaceKey}`)
    }

    return normalizedSpaceKey
  }

  const configuredProjectKey = getJiraConfig().projectKey
  if (configuredProjectKey) {
    try {
      const project = await getProject(configuredProjectKey)
      if (project && typeof project.key === 'string' && project.key) {
        if (await projectSupportsIssueType(project.key, issueType)) {
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

    if (await projectSupportsIssueType(project.key, issueType)) {
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

  const configuredProjectKey = getJiraConfig().projectKey
  if (configuredProjectKey) {
    try {
      const project = await getProject(configuredProjectKey)
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
  spaceKey?: string | null,
): Promise<JiraAssignableUser[]> {
  const projectKey = await resolveProjectKey(issueType, parentKey, spaceKey)
  return fetchAssignableUsersPageWindow('/user/assignable/multiProjectSearch', {
    projectKeys: projectKey,
  })
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
    if (value === null) return null
    if (typeof value === 'string') {
      const nextValue = value.trim()
      return nextValue ? plainTextToAdf(nextValue) : null
    }

    return isJiraAdfDocument(value) ? normalizeAdf(value) : null
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

async function validateParent(
  issueType: JiraCreateIssueType,
  parentKey: string | null | undefined,
  spaceKey?: string | null,
): Promise<void> {
  const projectKey = await resolveProjectKey(issueType, parentKey, spaceKey)
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

  await validateParent(input.issueType, input.parentKey, input.spaceKey)

  const projectKey = await resolveProjectKey(input.issueType, input.parentKey, input.spaceKey)
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
  const query = jql ?? buildDefaultSearchQuery()
  if (!query) {
    return []
  }
  const sprintFieldId = await resolveSprintFieldId()
  const issues: unknown[] = []
  let startAt = 0
  let nextPageToken: string | null = null
  const maxResults = 100
  const fields = [
    'project',
    'summary',
    'status',
    'priority',
    'issuetype',
    'assignee',
    'parent',
    'created',
    'updated',
    'duedate',
    'resolutiondate',
  ]

  if (sprintFieldId) {
    fields.push(sprintFieldId)
  }

  while (true) {
    const params: Record<string, string> = {
      jql: query,
      fields: fields.join(','),
      maxResults: String(maxResults),
    }

    if (nextPageToken) {
      params.nextPageToken = nextPageToken
    } else {
      params.startAt = String(startAt)
    }

    const data = await jiraFetch('/search/jql', { params })
    const batch = isRecord(data) && Array.isArray(data.issues) ? data.issues : []
    const total = isRecord(data) && typeof data.total === 'number' ? data.total : null
    const isLastPage = isRecord(data) && typeof data.isLast === 'boolean' ? data.isLast : null
    const followingPageToken = isRecord(data) && typeof data.nextPageToken === 'string' && data.nextPageToken.length > 0
      ? data.nextPageToken
      : null

    issues.push(...batch)

    if (batch.length === 0 || isLastPage === true) {
      break
    }

    if (followingPageToken) {
      nextPageToken = followingPageToken
      continue
    }

    if (batch.length < maxResults || (total !== null && issues.length >= total)) {
      break
    }

    startAt += batch.length
  }

  return issues.filter(isJiraApiIssue).map((issue) => mapIssue(issue, false, sprintFieldId))
}

function getIncrementalRefreshQuery(updatedSince?: Date): string | null {
  const query = buildDefaultSearchQuery()
  if (!query) {
    return null
  }

  if (!updatedSince) {
    return query
  }

  return buildUpdatedSinceSearchQuery(query, updatedSince)
}

export async function getTicket(key: string): Promise<JiraTicket> {
  const sprintFieldId = await resolveSprintFieldId()
  const fields = [
    'project',
    'summary',
    'status',
    'priority',
    'issuetype',
    'assignee',
    'description',
    'parent',
    'created',
    'updated',
    'duedate',
    'resolutiondate',
  ]

  if (sprintFieldId) {
    fields.push(sprintFieldId)
  }

  const data = await jiraFetch(`/issue/${key}`, {
    params: {
      fields: fields.join(','),
    },
  })
  return mapIssue(isJiraApiIssue(data) ? data : {}, true, sprintFieldId)
}

function mapComment(comment: JiraApiComment): JiraMessage {
  return {
    id: comment.id ?? '',
    author: comment.author?.displayName ?? 'Unknown',
    createdAt: comment.created ?? '',
    body: extractDescription(comment.body).trim(),
    parentMessageId: extractParentMessageId(comment),
  }
}

function normalizeJiraCommentId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const nextValue = value.trim()
  return /^\d+$/.test(nextValue) ? nextValue : null
}

function extractParentCommentIdFromValue(
  value: unknown,
  path: string[] = [],
  visited = new Set<unknown>(),
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'object') {
    return null
  }

  if (visited.has(value)) {
    return null
  }

  visited.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedId = extractParentCommentIdFromValue(item, path, visited)
      if (nestedId) {
        return nestedId
      }
    }
    return null
  }

  if (!isRecord(value)) {
    return null
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    const nextPath = [...path, normalizedKey]
    const pathHintsParent = nextPath.some((segment) => segment.includes('parent'))
    const pathHintsComment = nextPath.some((segment) => (
      segment.includes('comment')
      || segment.includes('thread')
      || segment === 'id'
    ))

    if (pathHintsParent && pathHintsComment) {
      const directId = normalizeJiraCommentId(nestedValue)
      if (directId) {
        return directId
      }

      if (isRecord(nestedValue)) {
        const nestedId = normalizeJiraCommentId(nestedValue.id)
        if (nestedId) {
          return nestedId
        }
      }
    }

    const nestedId = extractParentCommentIdFromValue(nestedValue, nextPath, visited)
    if (nestedId) {
      return nestedId
    }
  }

  return null
}

function extractParentMessageId(comment: JiraApiComment): string | null {
  if (!Array.isArray(comment.properties)) {
    return null
  }

  for (const property of comment.properties) {
    const parentMessageId = extractParentCommentIdFromValue(property.value, [
      typeof property.key === 'string' ? property.key.toLowerCase() : 'property',
    ])
    if (parentMessageId) {
      return parentMessageId
    }
  }

  return null
}

export async function getTicketMessages(key: string): Promise<JiraMessage[]> {
  const data = await jiraFetch(`/issue/${key}/comment`, {
    params: {
      expand: 'properties',
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
      body: plainTextToAdf(nextBody),
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

export async function updateTicketDescription(key: string, descriptionAdf: JiraAdfDocument | null): Promise<JiraTicket> {
  await jiraFetch(`/issue/${key}`, {
    method: 'PUT',
    body: {
      fields: {
        description: normalizeAdf(descriptionAdf),
      },
    },
  })

  const updatedTicket = await getTicket(key)
  broadcast('ticket-updated', updatedTicket)
  return updatedTicket
}

export async function getAssignableUsers(key: string): Promise<JiraAssignableUser[]> {
  return fetchAssignableUsersPageWindow('/user/assignable/search', {
    issueKey: key,
  })
}

async function fetchAssignableUsersPageWindow(
  path: '/user/assignable/multiProjectSearch' | '/user/assignable/search',
  params: Record<string, string>,
): Promise<JiraAssignableUser[]> {
  const pageSize = 100
  const maxSearchableUsers = 1000
  const usersByAccountId = new Map<string, JiraAssignableUser>()

  // Jira slices the global user list before checking assignability, so a single
  // page can miss valid assignees even when more exist later in the first 1000 users.
  for (let startAt = 0; startAt < maxSearchableUsers; startAt += pageSize) {
    const data = await jiraFetch(path, {
      params: {
        ...params,
        startAt: String(startAt),
        maxResults: String(pageSize),
      },
    })

    if (!Array.isArray(data)) {
      continue
    }

    for (const user of data) {
      if (!isJiraApiUser(user)) {
        continue
      }

      usersByAccountId.set(user.accountId, {
        accountId: user.accountId,
        displayName: user.displayName,
      })
    }
  }

  return [...usersByAccountId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName))
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

  const configuredProjectKey = getJiraConfig().projectKey
  if (configuredProjectKey) {
    try {
      const project = await getProject(configuredProjectKey)
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

export interface RefreshTicketsResult {
  tickets: JiraTicket[]
  updatedAt: number
  mode: 'full' | 'incremental'
}

export async function forceRefreshTickets(updatedSince?: Date): Promise<RefreshTicketsResult> {
  broadcast('refreshing', { status: 'started' })
  try {
    const query = getIncrementalRefreshQuery(updatedSince)
    const tickets = query ? await searchTickets(query) : []
    const payload: RefreshTicketsResult = {
      tickets,
      updatedAt: Date.now(),
      mode: updatedSince ? 'incremental' : 'full',
    }
    broadcast('tickets', payload)
    return payload
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Background refresh failed'
    console.error('Background refresh failed:', message)
    broadcast('error', { message })
    throw err
  }
}

export interface JiraCurrentUser {
  displayName: string
}

export async function getJiraCurrentUser(): Promise<JiraCurrentUser> {
  const data = await jiraFetch('/myself')
  if (!isRecord(data) || typeof data.displayName !== 'string' || !data.displayName.trim()) {
    throw new Error('Jira /myself response did not include displayName')
  }

  return { displayName: data.displayName.trim() }
}
