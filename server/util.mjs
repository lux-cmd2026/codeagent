import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const APP_ROOT = path.resolve(import.meta.dirname, '..')
export const DATA_DIR = process.env.PB_DATA_DIR || path.join(APP_ROOT, 'agent-data')
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions')
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

export class FriendlyError extends Error {}

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`
}

export function ensureDataDir() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// 把任意用户路径约束在某个根目录内（含 symlink 解析后的真实位置）。
export function resolveInRoot(root, rel) {
  const rootReal = safeReal(root)
  const abs = path.resolve(rootReal, rel)
  let check = abs
  const tail = []
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(check)) break
    tail.unshift(path.basename(check))
    const parent = path.dirname(check)
    if (parent === check) break
    check = parent
  }
  let real
  try {
    real = fs.realpathSync(check)
  } catch {
    throw new FriendlyError(`路径不存在或不可访问：${rel}`)
  }
  const finalAbs = tail.length ? path.join(real, ...tail) : real
  if (finalAbs !== rootReal && !finalAbs.startsWith(rootReal + path.sep)) {
    throw new FriendlyError('路径越出了工作目录范围，已拒绝。')
  }
  return { abs, final: finalAbs }
}

function safeReal(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    throw new FriendlyError(`目录不存在：${p}`)
  }
}

export function truncate(text, max, suffix = '\n…（内容过长，已截断）') {
  if (typeof text !== 'string') return String(text)
  if (text.length <= max) return text
  return text.slice(0, max) + suffix
}

export function maskKey(key) {
  if (!key) return ''
  const k = String(key)
  if (k.length <= 10) return k.slice(0, 2) + '…'
  return `${k.slice(0, 6)}…${k.slice(-4)}`
}

export function relFrom(root, abs) {
  const r = path.resolve(root)
  const a = path.resolve(abs)
  if (a === r) return '.'
  return a.startsWith(r + path.sep) ? a.slice(r.length + 1) : a
}

export function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new FriendlyError('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new FriendlyError('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function json(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  if (res.flushHeaders) res.flushHeaders()
}

export function sseSend(res, evt) {
  try {
    res.write(`data: ${JSON.stringify(evt)}\n\n`)
  } catch {
    /* 客户端已断开 */
  }
}
