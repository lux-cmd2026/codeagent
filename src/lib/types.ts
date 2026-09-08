export type PermissionMode = 'readonly' | 'confirm' | 'auto_exec' | 'auto'
export type Protocol = 'openai' | 'anthropic'

export interface Provider {
  id: string
  name: string
  protocol: Protocol
  baseUrl: string
  model: string
  keyMasked?: string
  hasKey?: boolean
}

export interface Settings {
  providers: Provider[]
  activeProviderId: string | null
  defaultPermission: PermissionMode
  defaultCwd: string
}

export interface SessionInfo {
  id: string
  title: string
  cwd: string
  permission: PermissionMode
  createdAt: number
  updatedAt: number
  messageCount?: number
  lastPreview?: string
}

export interface DiffRow {
  type: 'same' | 'add' | 'del'
  text: string
  oldNo: number | null
  newNo: number | null
}

export interface Hunk {
  adds: number
  dels: number
  rows: DiffRow[]
}

export interface DiffPayload {
  hunks: Hunk[]
  adds: number
  dels: number
}

export interface DiffCard {
  title: string
  subtitle?: string
  meta?: string
  diff?: DiffPayload
  lines?: string[]
  command?: string
  failed?: boolean
}

export interface BaseEvent {
  id?: string
  at?: number
  type: string
}

export interface PlanItem {
  text: string
  status: 'pending' | 'doing' | 'done'
}

export interface ChatEvent extends BaseEvent {
  text?: string
  message?: string
  callId?: string
  name?: string
  args?: Record<string, unknown>
  ok?: boolean
  error?: string
  card?: DiffCard
  requestId?: string
  kind?: 'write' | 'command'
  title?: string
  subtitle?: string
  diff?: DiffPayload
  command?: string
  decision?: 'allow' | 'allow_session' | 'deny'
  path?: string
  usage?: { input?: number; output?: number }
  items?: PlanItem[]
  durationMs?: number
  toolCalls?: number
}

export interface SessionDetail extends SessionInfo {
  sessionApproved: string[]
  events: ChatEvent[]
  usage?: { input?: number; output?: number }
}

export interface BrowseEntry {
  name: string
  type: 'dir' | 'file' | 'other'
  size?: number | null
}

export interface BrowseResult {
  path: string
  parent: string | null
  entries: BrowseEntry[]
}

export interface FileContent {
  path: string
  content: string
  lines: number
  truncated?: boolean
  binary?: boolean
}
