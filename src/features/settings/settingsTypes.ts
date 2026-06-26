import type { StatusGroup } from '@/types/jira'

export type SettingsSectionId
  = | 'workspace'
    | 'ai'
    | 'instructions'
    | 'team-overview'
    | 'team-members'
    | 'team-statuses'
    | 'team-workflows'
    | 'team-triage'
    | 'team-cycles'
    | 'team-ai'
    | 'danger'

export interface SettingsSummaryRow {
  label: string
  value: string
  detail: string
}

export interface SettingsDetailRow {
  label: string
  value: string
  detail: string
}

export interface TeamStatusSettingsRow {
  status: string
  group: StatusGroup
  issueCount: number
  spaces: string
}

export interface TeamMemberSettingsRow {
  teamKey: string
  teamName: string
  memberCount: number
  issueCount: number
  topMembers: string
}
