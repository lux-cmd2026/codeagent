import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveInRoot, truncate, FriendlyError } from './util.mjs'
import { summarizeDiff } from './diff.mjs'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__',
  '.venv', 'venv', '.pnpm-store', 'agent-data', '.rh', 'coverage', '.turbo',
])
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.less',
  '.html', '.htm', '.md', '.mdx', '.txt', '.py', '.go', '.rs', '.java', '.rb',
  '.php', '.c', '.h', '.cpp', '.hpp', '.cs', '.sh', '.bash', '.yml', '.yaml',
  '.toml', '.ini', '.env', '.sql', '.vue', '.svelte', '.xml', '.svg', '.gitignore',
])
const MAX_SEARCH_FILES = 3000
const MAX_SEARCH_HITS = 40
const MAX_READ_LINES = 400
const MAX_WRITE_BYTES = 2 * 1024 * 1024
const MAX_CMD_OUTPUT = 8000

function isProbablyTextFile(file) {
  const ext = path.extname(file).toLowerCase()
  if (TEXT_EXT.has(ext)) return true
  if (!ext) return true
  return false
}

// 头尾保留式截断：长输出的开头结尾比中间有价值。
function clip(s, head = 6000, tail = 2000) {
  if (!s) return ''
  if (s.length <= head + tail) return s
  return s.slice(0, head) + '\n…（中间输出已省略）\n' + s.slice(-tail)
}

// ---------- 工具实现 ----------

function doListDir(ctx, args) {
  const rel = args.path || '.'
  const { final } = resolveInRoot(ctx.cwd, rel)
  const entries = fs.readdirSync(final, { withFileTypes: true })
  const items = entries
    .filter((e) => e.name !== '.DS_Store')
    .map((e) => {
      let size = null
      if (e.isFile()) {
        try {
          size = fs.statSync(path.join(final, e.name)).size
        } catch { /* 忽略 */ }
      }
      return { name: e.name, type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other', size }
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  if (!items.length) return { forModel: `目录 ${rel} 为空。`, card: { title: '浏览目录', subtitle: rel } }
  const forModel = items.map((i) => `${i.type === 'dir' ? '[目录]' : '[文件]'} ${i.name}${i.size != null ? ` (${i.size}B)` : ''}`).join('\n')
  return { forModel: `${rel} 下的内容：\n${forModel}`, card: { title: '浏览目录', subtitle: rel, meta: `${items.length} 项` } }
}

function doReadFile(ctx, args) {
  if (!args.path) throw new FriendlyError('read_file 需要 path 参数')
  const { final } = resolveInRoot(ctx.cwd, args.path)
  const stat = fs.statSync(final)
  if (stat.isDirectory()) throw new FriendlyError(`${args.path} 是目录，请用 list_dir`)
  if (stat.size > 1024 * 1024) throw new FriendlyError('文件超过 1MB，请用 offset/limit 分段读取或先 search_text 定位')
  const raw = fs.readFileSync(final, 'utf8')
  const lines = raw.split('\n')
  const total = lines.length
  const offset = Math.max(1, parseInt(args.offset, 10) || 1)
  const limit = Math.min(MAX_READ_LINES, Math.max(1, parseInt(args.limit, 10) || MAX_READ_LINES))
  const slice = lines.slice(offset - 1, offset - 1 + limit)
  let body = slice.join('\n')
  if (slice.length >= limit && offset - 1 + limit < total) body += `\n…（仅显示第 ${offset}-${offset + slice.length - 1} 行，共 ${total} 行；可用 offset/limit 继续读）`
  const range = total <= limit && offset === 1 ? `共 ${total} 行` : `第 ${offset}-${offset + slice.length - 1} 行 / 共 ${total} 行`
  return { forModel: body || '（空文件）', card: { title: '读取文件', subtitle: args.path, meta: range } }
}

function doWriteFile(ctx, args) {
  if (!args.path || typeof args.content !== 'string') throw new FriendlyError('write_file 需要 path 和 content 参数')
  if (Buffer.byteLength(args.content, 'utf8') > MAX_WRITE_BYTES) throw new FriendlyError('文件内容超过 2MB 限制')
  const { final } = resolveInRoot(ctx.cwd, args.path)
  fs.mkdirSync(path.dirname(final), { recursive: true })
  let before = ''
  const existed = fs.existsSync(final)
  if (existed) {
    if (fs.statSync(final).isDirectory()) throw new FriendlyError(`${args.path} 是已存在的目录`)
    before = fs.readFileSync(final, 'utf8')
  }
  fs.writeFileSync(final, args.content, 'utf8')
  const diff = summarizeDiff(existed ? before : '', args.content)
  const note = existed ? '已覆盖写入' : '已创建'
  const forModel = `${note} ${args.path}（+${diff.adds} / -${diff.dels} 行）。当前内容以你的写入为准。`
  return {
    forModel,
    card: { title: existed ? '覆写文件' : '创建文件', subtitle: args.path, meta: `+${diff.adds} -${diff.dels}`, diff },
  }
}

function doEditFile(ctx, args) {
  // 两种写法：单条 old_string/new_string，或一次提交多处 edits 数组（串行应用）
  let edits = null
  if (Array.isArray(args.edits) && args.edits.length) edits = args.edits
  else if (typeof args.old_string === 'string') edits = [{ old_string: args.old_string, new_string: args.new_string, replace_all: args.replace_all }]
  if (!args.path || !edits) throw new FriendlyError('edit_file 需要 path，以及 old_string/new_string 或 edits 数组')
  const { final } = resolveInRoot(ctx.cwd, args.path)
  if (!fs.existsSync(final) || fs.statSync(final).isDirectory()) throw new FriendlyError(`文件不存在：${args.path}`)
  const before = fs.readFileSync(final, 'utf8')
  let after = before
  let replacedCount = 0
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] || {}
    const old = String(e.old_string ?? '')
    const rep = String(e.new_string ?? '')
    if (!old) throw new FriendlyError(`第 ${i + 1} 处编辑的 old_string 为空`)
    const count = after.split(old).length - 1
    if (count === 0) throw new FriendlyError(`第 ${i + 1} 处编辑未匹配到内容（注意前面的编辑可能已改变文本，old_string 需与当前内容完全一致）`)
    if (count > 1 && !e.replace_all) throw new FriendlyError(`第 ${i + 1} 处编辑的 old_string 出现了 ${count} 次：加长它保证唯一，或设 replace_all=true`)
    after = e.replace_all ? after.split(old).join(rep) : after.replace(old, rep)
    replacedCount += e.replace_all ? count : 1
  }
  fs.writeFileSync(final, after, 'utf8')
  const diff = summarizeDiff(before, after)
  return {
    forModel: `已编辑 ${args.path}（应用 ${edits.length} 处修改，共替换 ${replacedCount} 处，+${diff.adds} / -${diff.dels} 行）。`,
    card: { title: '编辑文件', subtitle: args.path, meta: `×${edits.length} · +${diff.adds} -${diff.dels}`, diff },
  }
}

function doDeletePath(ctx, args) {
  if (!args.path) throw new FriendlyError('delete_path 需要 path 参数')
  const { final } = resolveInRoot(ctx.cwd, args.path)
  if (final === resolveInRoot(ctx.cwd, '.').final) throw new FriendlyError('不能删除工作目录本身')
  if (!fs.existsSync(final)) throw new FriendlyError(`路径不存在：${args.path}`)
  const isDir = fs.statSync(final).isDirectory()
  if (isDir) {
    const entries = fs.readdirSync(final)
    if (entries.length && !args.recursive) throw new FriendlyError('目录非空，删除需要 recursive=true')
    fs.rmSync(final, { recursive: true, force: true })
  } else {
    fs.unlinkSync(final)
  }
  return {
    forModel: `已删除${isDir ? '目录' : '文件'} ${args.path}。`,
    card: { title: isDir ? '删除目录' : '删除文件', subtitle: args.path },
  }
}

function walkFiles(root) {
  const out = []
  const queue = [root]
  while (queue.length && out.length < MAX_SEARCH_FILES) {
    const dir = queue.shift()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (out.length >= MAX_SEARCH_FILES) break
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue
        queue.push(full)
      } else if (e.isFile()) {
        out.push(full)
      }
    }
  }
  return out
}

function globToRegExp(pattern) {
  let re = ''
  let i = 0
  const s = pattern
  while (i < s.length) {
    const c = s[i]
    if (c === '*') {
      if (s[i + 1] === '*') {
        if (s[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 3
        } else {
          re += '.*'
          i += 2
        }
      } else {
        re += '[^/]*'
        i++
      }
    } else if (c === '?') {
      re += '[^/]'
      i++
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i++
    }
  }
  return new RegExp(`^${re}$`)
}

function doSearchText(ctx, args) {
  if (!args.query) throw new FriendlyError('search_text 需要 query 参数')
  const base = args.path ? resolveInRoot(ctx.cwd, args.path).final : resolveInRoot(ctx.cwd, '.').final
  const needle = String(args.query).toLowerCase()
  const files = walkFiles(base).filter(isProbablyTextFile)
  const hits = []
  for (const file of files) {
    if (hits.length >= MAX_SEARCH_HITS) break
    let content
    try {
      if (fs.statSync(file).size > 512 * 1024) continue
      content = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        const rel = path.relative(base, file) || file
        hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 240)}`)
        if (hits.length >= MAX_SEARCH_HITS) break
      }
    }
  }
  if (!hits.length) return { forModel: `没有找到包含「${args.query}」的内容（已扫描 ${files.length} 个文件）。`, card: { title: '全文搜索', subtitle: args.query, meta: '无结果' } }
  return {
    forModel: `找到 ${hits.length} 处：\n${hits.join('\n')}`,
    card: { title: '全文搜索', subtitle: args.query, meta: `${hits.length} 处`, lines: hits.slice(0, 20) },
  }
}

function doFindFiles(ctx, args) {
  if (!args.pattern) throw new FriendlyError('find_files 需要 pattern 参数，如 **/*.ts 或 src/*')
  const base = resolveInRoot(ctx.cwd, '.').final
  const re = globToRegExp(args.pattern)
  const files = walkFiles(base)
  const rels = files.map((f) => path.relative(base, f))
  const hits = rels.filter((r) => re.test(r)).slice(0, 100)
  if (!hits.length) return { forModel: `没有匹配 ${args.pattern} 的文件。`, card: { title: '查找文件', subtitle: args.pattern, meta: '无结果' } }
  return {
    forModel: `匹配到 ${hits.length} 个文件：\n${hits.join('\n')}`,
    card: { title: '查找文件', subtitle: args.pattern, meta: `${hits.length} 个` },
  }
}

// 流式执行命令：输出分块实时回调（ctx.emitOutput），结束后汇总返回。
function doRunCommand(ctx, args) {
  const command = String(args.command || '').trim()
  if (!command) throw new FriendlyError('run_command 需要 command 参数')
  const timeout = Math.min(300, Math.max(3, parseInt(args.timeout_sec, 10) || 120)) * 1000
  const onOutput = typeof ctx.emitOutput === 'function' ? ctx.emitOutput : () => {}
  const cwd = resolveInRoot(ctx.cwd, '.').final
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-c', command], {
      cwd,
      timeout,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let errOut = ''
    let settled = false
    child.stdout.on('data', (d) => {
      const s = d.toString()
      if (out.length < MAX_CMD_OUTPUT * 3) out += s
      onOutput(s)
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      if (errOut.length < MAX_CMD_OUTPUT * 3) errOut += s
      onOutput(s)
    })
    child.on('error', (e) => {
      if (settled) return
      settled = true
      resolve({
        forModel: `$ ${command}\n无法启动命令：${e.message}`,
        card: { title: '执行命令', subtitle: command, meta: '启动失败', failed: true },
        ok: false,
      })
    })
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      const timedOut = code === null && signal === 'SIGTERM'
      let text = ''
      if (out) text += clip(out)
      if (errOut) text += (text ? '\n--- stderr ---\n' : '') + clip(errOut, 4000, 1500)
      if (timedOut) text += `\n（命令超时被终止，限时 ${timeout / 1000}s）`
      if (!text) text = code === 0 ? '（无输出）' : `（命令执行失败，退出码 ${code ?? '?'}）`
      const exitNote = timedOut ? 'timeout' : `退出码 ${code}`
      resolve({
        forModel: `$ ${command}\n${text}\n（${exitNote}）`,
        card: {
          title: '执行命令',
          subtitle: command,
          meta: exitNote,
          lines: truncate(out + (errOut ? `\n${errOut}` : ''), 4000).split('\n'),
          failed: code !== 0,
        },
        ok: code === 0 && !timedOut,
      })
    })
  })
}

function doUpdatePlan(ctx, args) {
  const raw = Array.isArray(args.items) ? args.items : []
  const items = raw.slice(0, 20).map((i) => ({
    text: String((i && i.text) || '').slice(0, 120) || '（未命名任务）',
    status: ['pending', 'doing', 'done'].includes(i && i.status) ? i.status : 'pending',
  }))
  if (!items.length) throw new FriendlyError('update_plan 需要非空的 items 数组')
  const done = items.filter((i) => i.status === 'done').length
  const forModel =
    `任务清单已更新（${done}/${items.length} 完成）：\n` +
    items.map((i) => `${i.status === 'done' ? '[x]' : i.status === 'doing' ? '[~]' : '[ ]'} ${i.text}`).join('\n')
  return { forModel, planItems: items }
}

// ---------- 工具表（供模型调用的 schema 用 JSON Schema 描述） ----------

export const TOOLS = [
  {
    name: 'list_dir',
    kind: 'read',
    description: '列出工作目录下某个目录的内容（子目录与文件）。',
    params: { type: 'object', properties: { path: { type: 'string', description: '相对工作目录的路径，缺省为根' } } },
    run: doListDir,
  },
  {
    name: 'read_file',
    kind: 'read',
    description: '读取一个文本文件的内容。大文件可用 offset/limit 分段。',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对工作目录）' },
        offset: { type: 'integer', description: '起始行（从 1 开始）' },
        limit: { type: 'integer', description: '读取行数，默认 400' },
      },
      required: ['path'],
    },
    run: doReadFile,
  },
  {
    name: 'search_text',
    kind: 'read',
    description: '在工作目录内做全文搜索（大小写不敏感），返回 file:line: 内容。',
    params: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索的文本' },
        path: { type: 'string', description: '限定搜索的子目录' },
      },
      required: ['query'],
    },
    run: doSearchText,
  },
  {
    name: 'find_files',
    kind: 'read',
    description: '按通配符查找文件，支持 ** 与 *，例如 **/*.ts。',
    params: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    run: doFindFiles,
  },
  {
    name: 'write_file',
    kind: 'write',
    description: '创建新文件或整体覆盖一个文件。小改动请优先用 edit_file。',
    params: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    run: doWriteFile,
  },
  {
    name: 'edit_file',
    kind: 'write',
    description:
      '对文件做精确替换编辑。单处改动传 old_string/new_string；多处改动用 edits 数组一次提交（按顺序应用）。old_string 必须与文件当前内容完全一致且唯一。',
    params: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string', description: '要被替换的原文（单处编辑时）' },
        new_string: { type: 'string', description: '替换后的文本（单处编辑时）' },
        replace_all: { type: 'boolean', description: '替换所有出现，默认 false' },
        edits: {
          type: 'array',
          description: '多处编辑（优先于 old_string），按顺序串行应用',
          items: {
            type: 'object',
            properties: {
              old_string: { type: 'string' },
              new_string: { type: 'string' },
              replace_all: { type: 'boolean' },
            },
            required: ['old_string', 'new_string'],
          },
        },
      },
      required: ['path'],
    },
    run: doEditFile,
  },
  {
    name: 'delete_path',
    kind: 'write',
    description: '删除文件或目录（目录需 recursive=true）。',
    params: {
      type: 'object',
      properties: { path: { type: 'string' }, recursive: { type: 'boolean' } },
      required: ['path'],
    },
    run: doDeletePath,
  },
  {
    name: 'run_command',
    kind: 'command',
    description: '在当前工作目录执行一条 shell 命令（bash），输出实时回传，返回 stdout/stderr。避免需要交互输入的命令。',
    params: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_sec: { type: 'integer', description: '超时秒数，默认 120，最大 300' },
      },
      required: ['command'],
    },
    run: doRunCommand,
  },
  {
    name: 'update_plan',
    kind: 'read',
    description:
      '创建或更新任务清单（3 步以上的任务先列清单，边做边更新状态，items 全量覆盖）。用户会在界面上实时看到进度。',
    params: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '任务项（全量替换旧清单），最多 20 项',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'doing', 'done'], description: '待办/进行中/已完成' },
            },
            required: ['text', 'status'],
          },
        },
      },
      required: ['items'],
    },
    run: doUpdatePlan,
  },
]

export function toolByName(name) {
  return TOOLS.find((t) => t.name === name) || null
}

// 供输入框 @ 文件引用补全：按文件名/路径匹配，文件名前缀优先。
export function matchFiles(root, q, limit = 12) {
  const needle = String(q || '').toLowerCase()
  const files = walkFiles(root)
  const scored = []
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/')
    const lower = rel.toLowerCase()
    const base = path.basename(lower)
    if (!needle) scored.push({ rel, s: 50 })
    else if (base.startsWith(needle)) scored.push({ rel, s: 100 })
    else if (base.includes(needle)) scored.push({ rel, s: 70 })
    else if (lower.includes(needle)) scored.push({ rel, s: 40 })
    else if (needle.split('/').every((seg) => lower.includes(seg))) scored.push({ rel, s: 20 })
  }
  scored.sort((a, b) => b.s - a.s || a.rel.length - b.rel.length)
  return scored.slice(0, limit).map((x) => x.rel)
}
