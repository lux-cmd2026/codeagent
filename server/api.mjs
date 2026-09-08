import fs from 'node:fs'
import path from 'node:path'
import {
  json, readBody, sseInit, sseSend, uid, FriendlyError, maskKey,
  resolveInRoot, truncate, APP_ROOT,
} from './util.mjs'
import {
  loadSettings, saveSettings, createSession, loadSession, saveSession,
  deleteSession, listSessions, sessionSummary,
} from './store.mjs'
import { runAgent, pingProvider } from './agent.mjs'
import { matchFiles } from './tools.mjs'

// 命令输出的流式碎片只用于实时展示，不落盘（完整输出在 tool_result 里）。
const VOLATILE = new Set(['delta', 'tool_output'])

const RUNTIMES = new Map()

function getRuntime(id) {
  let rt = RUNTIMES.get(id)
  if (!rt) {
    rt = { running: false, stopped: false, ac: null, pending: new Map() }
    RUNTIMES.set(id, rt)
  }
  return rt
}

function sanitizeSettings(s) {
  return {
    providers: (s.providers || []).map((p) => ({
      id: p.id,
      name: p.name,
      protocol: p.protocol,
      baseUrl: p.baseUrl,
      model: p.model,
      keyMasked: maskKey(p.apiKey),
      hasKey: Boolean(p.apiKey),
    })),
    activeProviderId: s.activeProviderId,
    defaultPermission: s.defaultPermission,
    defaultCwd: s.defaultCwd,
  }
}

function validCwd(p) {
  const abs = path.resolve(String(p || ''))
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new FriendlyError(`工作目录不存在或不是目录：${p}`)
  }
  return abs
}

function parseSessionId(rest) {
  return decodeURIComponent(String(rest || '').split('/')[0])
}

// ---------- SSE 事件出口：落盘 + 推送 ----------

function makeEmitter(session, res) {
  return (evt) => {
    if (!VOLATILE.has(evt.type)) {
      evt.id = uid('e')
      evt.at = Date.now()
      session.events.push(evt)
      if (session.events.length > 4000) session.events.splice(0, session.events.length - 4000)
      saveSession(session)
    }
    sseSend(res, evt)
  }
}

// ---------- 路由 ----------

export async function handleApi(req, res, url) {
  const { pathname } = url
  const method = req.method || 'GET'
  try {
    // ---- 健康 ----
    if (method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, name: 'forge' })

    // ---- 设置 ----
    if (method === 'GET' && pathname === '/api/settings') {
      return json(res, 200, sanitizeSettings(loadSettings()))
    }

    if (method === 'PUT' && pathname === '/api/settings') {
      const body = await readBody(req)
      const s = loadSettings()
      if (Array.isArray(body.providers)) {
        const byId = new Map(s.providers.map((p) => [p.id, p]))
        s.providers = body.providers.map((p) => {
          const id = p.id || uid('prov')
          const old = byId.get(id)
          const apiKey = !p.apiKey || p.apiKey === '__KEEP__' ? (old && old.apiKey) || '' : String(p.apiKey)
          return {
            id,
            name: String(p.name || '未命名接口').slice(0, 40),
            protocol: p.protocol === 'anthropic' ? 'anthropic' : 'openai',
            baseUrl: String(p.baseUrl || '').trim(),
            model: String(p.model || '').trim(),
            apiKey,
          }
        })
        if (s.activeProviderId && !s.providers.some((p) => p.id === s.activeProviderId)) s.activeProviderId = null
      }
      if (body.activeProviderId !== undefined) {
        s.activeProviderId = body.activeProviderId || null
      }
      if (['readonly', 'confirm', 'auto_exec', 'auto'].includes(body.defaultPermission)) s.defaultPermission = body.defaultPermission
      if (body.defaultCwd) s.defaultCwd = validCwd(body.defaultCwd)
      saveSettings(s)
      return json(res, 200, sanitizeSettings(s))
    }

    if (method === 'POST' && pathname === '/api/settings/test') {
      const body = await readBody(req)
      const s = loadSettings()
      let provider = null
      if (body.providerId) provider = s.providers.find((p) => p.id === body.providerId)
      else if (body.provider) {
        provider = {
          protocol: body.provider.protocol,
          baseUrl: body.provider.baseUrl,
          model: body.provider.model,
          apiKey: body.provider.apiKey && body.provider.apiKey !== '__KEEP__'
            ? body.provider.apiKey
            : (s.providers.find((p) => p.id === body.providerId || p.id === s.activeProviderId) || {}).apiKey,
        }
      }
      if (!provider) provider = s.providers.find((p) => p.id === s.activeProviderId) || s.providers[0]
      if (!provider || !provider.apiKey) throw new FriendlyError('请先填写 API 密钥')
      const r = await pingProvider(provider)
      return json(res, 200, { ok: true, latencyMs: r.latencyMs })
    }

    // ---- 文件浏览（选择工作目录 / 文件预览） ----
    if (method === 'GET' && pathname === '/api/fs/browse') {
      const target = path.resolve(url.searchParams.get('path') || '/')
      const stat = fs.existsSync(target) && fs.statSync(target)
      if (!stat || !stat.isDirectory()) throw new FriendlyError('目录不存在')
      const entries = fs
        .readdirSync(target, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.') || e.name === '.env')
        .map((e) => {
          let size = null
          if (e.isFile()) {
            try {
              size = fs.statSync(path.join(target, e.name)).size
            } catch { /* 忽略 */ }
          }
          return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size }
        })
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
      return json(res, 200, { path: target, parent: path.dirname(target) !== target ? path.dirname(target) : null, entries })
    }

    if (method === 'GET' && pathname === '/api/fs/file') {
      const p = url.searchParams.get('path') || ''
      const cwd = url.searchParams.get('cwd') || '.'
      const { final } = resolveInRoot(cwd, p)
      const stat = fs.statSync(final)
      if (stat.isDirectory()) throw new FriendlyError('这是一个目录')
      if (stat.size > 512 * 1024) {
        return json(res, 200, { path: p, content: '', lines: 0, truncated: true, size: stat.size })
      }
      const buf = fs.readFileSync(final)
      let content = buf.toString('utf8')
      let binary = false
      if (buf.includes(0)) {
        binary = true
        content = ''
      }
      return json(res, 200, {
        path: p,
        content,
        lines: content ? content.split('\n').length : 0,
        binary,
        size: stat.size,
      })
    }

    // ---- @ 文件引用补全 ----
    if (method === 'GET' && pathname === '/api/fs/complete') {
      const cwd = url.searchParams.get('cwd') || loadSettings().defaultCwd
      const q = url.searchParams.get('q') || ''
      let root = ''
      try {
        root = validCwd(cwd)
      } catch {
        return json(res, 200, { files: [] })
      }
      return json(res, 200, { files: matchFiles(root, q) })
    }

    // ---- 会话 ----
    if (method === 'GET' && pathname === '/api/sessions') {
      return json(res, 200, { sessions: listSessions() })
    }

    if (method === 'POST' && pathname === '/api/sessions') {
      const body = await readBody(req)
      const cwd = validCwd(body.cwd || loadSettings().defaultCwd)
      const permission = ['readonly', 'confirm', 'auto_exec', 'auto'].includes(body.permission) ? body.permission : loadSettings().defaultPermission
      const s = createSession({ title: body.title, cwd, permission })
      return json(res, 200, { session: sessionSummary(s) })
    }

    if (pathname.startsWith('/api/sessions/')) {
      const rest = pathname.slice('/api/sessions/'.length)
      const id = parseSessionId(rest)
      const sub = rest.split('/')[1] || ''
      const session = loadSession(id)
      if (!session) return json(res, 404, { error: '会话不存在' })

      if (!sub && method === 'GET') {
        return json(res, 200, { session: sessionSummary(session) })
      }
      if (!sub && method === 'PATCH') {
        const body = await readBody(req)
        if (body.permission && ['readonly', 'confirm', 'auto_exec', 'auto'].includes(body.permission)) session.permission = body.permission
        if (typeof body.title === 'string' && body.title.trim()) session.title = body.title.trim().slice(0, 60)
        if (body.cwd) session.cwd = validCwd(body.cwd)
        if (body.resetApproval) session.sessionApproved = []
        saveSession(session)
        return json(res, 200, { session: sessionSummary(session) })
      }
      if (!sub && method === 'DELETE') {
        deleteSession(id)
        RUNTIMES.delete(id)
        return json(res, 200, { ok: true })
      }
      if (sub === 'chat' && method === 'POST') return chatHandler(req, res, session)
      if (sub === 'approve' && method === 'POST') {
        const body = await readBody(req)
        const rt = getRuntime(id)
        const pending = rt.pending.get(body.requestId)
        const decision = ['allow', 'allow_session', 'deny'].includes(body.decision) ? body.decision : 'deny'
        if (pending) pending.resolve(decision)
        return json(res, 200, { ok: Boolean(pending) })
      }
      if (sub === 'stop' && method === 'POST') {
        const rt = getRuntime(id)
        rt.stopped = true
        if (rt.ac) rt.ac.abort()
        for (const [, p] of rt.pending) p.resolve('deny')
        return json(res, 200, { ok: true })
      }
    }

    return json(res, 404, { error: '接口不存在' })
  } catch (e) {
    const status = e instanceof FriendlyError ? 400 : 500
    if (!(e instanceof FriendlyError)) console.error('[api]', e)
    return json(res, status, { error: e.message || '服务内部错误' })
  }
}

async function chatHandler(req, res, session) {
  const body = await readBody(req)
  const text = String(body.text || '').trim()
  if (!text) throw new FriendlyError('消息内容不能为空')
  if (text.length > 20000) throw new FriendlyError('消息太长了，请精简后再发')

  const rt = getRuntime(session.id)
  if (rt.running) return json(res, 409, { error: '当前会话正在执行任务，请等它完成或先停止' })

  // 首条消息自动给会话起标题
  if (!session.events.some((e) => e.type === 'user')) {
    session.title = text.replace(/\s+/g, ' ').slice(0, 24) + (text.length > 24 ? '…' : '')
  }

  const startMs = Date.now()
  rt.running = true
  rt.stopped = false
  rt.ac = new AbortController()
  sseInit(res)

  let closed = false
  res.on('close', () => {
    closed = true
    rt.stopped = true
    if (rt.ac) rt.ac.abort()
  })

  const emit = (evt) => {
    if (closed) return
    if (!VOLATILE.has(evt.type)) {
      evt.id = uid('e')
      evt.at = Date.now()
      session.events.push(evt)
      if (session.events.length > 4000) session.events.splice(0, session.events.length - 4000)
      saveSession(session)
    }
    sseSend(res, evt)
  }

  try {
    const stats = await runAgent({ session, runtime: rt, userText: text, emit })
    emit({ type: 'run_end', ok: !rt.stopped, durationMs: Date.now() - startMs, toolCalls: (stats && stats.toolCalls) || 0 })
  } catch (e) {
    if (rt.stopped || (e && e.name === 'AbortError')) {
      emit({ type: 'stopped' })
      emit({ type: 'run_end', ok: true, durationMs: Date.now() - startMs })
    } else {
      const msg = e instanceof FriendlyError ? e.message : `执行出错：${e.message}`
      if (!(e instanceof FriendlyError)) console.error('[agent]', e)
      emit({ type: 'error', message: msg })
      emit({ type: 'run_end', ok: false, message: msg, durationMs: Date.now() - startMs })
    }
  } finally {
    rt.running = false
    rt.pending.clear()
    saveSession(session)
    if (!closed) {
      try {
        res.end()
      } catch { /* 忽略 */ }
    }
  }
}

export const _internal = { APP_ROOT, truncate }
