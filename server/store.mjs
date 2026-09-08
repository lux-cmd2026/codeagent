import fs from 'node:fs'
import path from 'node:path'
import { APP_ROOT, DATA_DIR, SESSIONS_DIR, SETTINGS_FILE, readJson, writeJson, uid, ensureDataDir } from './util.mjs'

export const DEFAULT_CWD = process.env.FORGE_CWD || path.join(APP_ROOT, 'project')

ensureDataDir()

// ---------- 设置（模型供应商等） ----------

function defaultSettings() {
  return {
    providers: [],
    activeProviderId: null,
    defaultPermission: 'confirm',
    defaultCwd: DEFAULT_CWD,
  }
}

export function loadSettings() {
  const s = readJson(SETTINGS_FILE, null)
  if (!s) return defaultSettings()
  return { ...defaultSettings(), ...s }
}

export function saveSettings(s) {
  writeJson(SETTINGS_FILE, s)
}

export function findProvider(settings, id) {
  return settings.providers.find((p) => p.id === id) || null
}

// ---------- 会话 ----------

function sessionFile(id) {
  return path.join(SESSIONS_DIR, `${id}.json`)
}

export function createSession({ title, cwd, permission }) {
  const s = {
    id: uid('s'),
    title: title || '新会话',
    cwd,
    permission: permission || 'confirm',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionApproved: [],
    events: [],
    llm: [],
    usage: { input: 0, output: 0 },
  }
  writeJson(sessionFile(s.id), s)
  return s
}

export function loadSession(id) {
  if (!/^[a-z0-9_]+$/.test(String(id))) return null
  return readJson(sessionFile(id), null)
}

export function saveSession(s) {
  s.updatedAt = Date.now()
  writeJson(sessionFile(s.id), s)
}

export function deleteSession(id) {
  try {
    fs.unlinkSync(sessionFile(id))
  } catch {
    /* 不存在则忽略 */
  }
}

export function listSessions() {
  let files = []
  try {
    files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const list = []
  for (const f of files) {
    const s = readJson(path.join(SESSIONS_DIR, f), null)
    if (!s) continue
    list.push({
      id: s.id,
      title: s.title,
      cwd: s.cwd,
      permission: s.permission,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.events.filter((e) => e.type === 'user').length,
      lastPreview: previewOf(s.events),
    })
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt)
  return list
}

function previewOf(events) {
  const last = [...events].reverse().find((e) => e.type === 'user' || (e.type === 'assistant' && e.text))
  if (!last) return ''
  if (last.type === 'user') return last.text
  return last.text
}

export function sessionSummary(s) {
  return {
    id: s.id,
    title: s.title,
    cwd: s.cwd,
    permission: s.permission,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    sessionApproved: s.sessionApproved,
    events: s.events,
    usage: s.usage,
  }
}
