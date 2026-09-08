import { TOOLS, toolByName } from './tools.mjs'
import { uid, FriendlyError, truncate } from './util.mjs'
import { summarizeDiff } from './diff.mjs'
import { loadSettings } from './store.mjs'

const MAX_TURNS = 40
const MODE_LABEL = {
  readonly: '只读（只能浏览与读取，不能改动任何文件、不能执行命令）',
  confirm: '谨慎（读操作自动执行；写文件、删文件、执行命令前需要用户逐次确认）',
  auto_exec: '命令自动（终端命令自动执行无需确认；但写文件、删文件前仍需用户逐次确认）',
  auto: '完全访问（所有操作自动执行，无需确认）',
}

function buildSystemPrompt(session) {
  return [
    '你是 Forge，一个运行在用户本地机器上的代码智能体，帮助用户阅读、编写和维护代码项目。',
    '',
    `当前工作目录：${session.cwd}`,
    `本次会话权限模式：${session.permission}（${MODE_LABEL[session.permission] || session.permission}）`,
    '',
    '工作规则：',
    '- 所有文件操作都限定在当前工作目录内，越出范围的路径会被拒绝。',
    '- 动手修改之前，先用 list_dir / read_file / search_text 看清现状，不要凭空猜测文件内容。',
    '- 需要同时了解多个互不依赖的信息时（如读多个文件、边搜索边列目录），在同一轮里一次性发起这些只读工具调用，它们会并行执行，更快。',
    '- 3 步以上的任务先用 update_plan 建任务清单（每项带 status），开始做标 doing、做完标 done，全部完成前不要停；用户会在界面上实时看到进度条。',
    '- 小改动优先用 edit_file 做精准替换；同一文件有多处改动时用 edits 数组一次提交；只有新建文件或大幅重写才用 write_file。',
    '- 写出的代码必须完整、可直接运行，不要留 TODO 或占位符。',
    '- 修改代码后尽量用 run_command 验证（node --check、跑测试、启动冒烟），确认没改坏再交付。',
    '- 执行命令选择非交互形式，避免需要用户输入确认的命令。',
    '- 用户消息里出现的文件路径（如 @src/foo.ts 形式）是用户明确指向的文件，优先阅读它们。',
    '- 用简体中文回复，语气简洁专业。任务完成后给一段简短总结：改了什么、为什么这样改。',
    '- 如果操作被拒绝（权限或用户拒绝），不要反复重试，向用户说明情况并给出替代方案。',
  ].join('\n')
}

// ---------- 协议适配 ----------

function normalizeOpenAIBase(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '')
  if (!base) base = 'https://api.openai.com/v1'
  if (/api\.openai\.com$/.test(base)) base += '/v1'
  return base
}

function normalizeAnthropicBase(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '')
  if (!base) base = 'https://api.anthropic.com'
  base = base.replace(/\/v1$/, '')
  return `${base}/v1`
}

function toOpenAIMessages(sys, llm) {
  const msgs = [{ role: 'system', content: sys }]
  for (const m of llm) {
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: m.text })
    } else if (m.role === 'assistant') {
      if (m.toolUses && m.toolUses.length) {
        msgs.push({
          role: 'assistant',
          content: m.text || null,
          tool_calls: m.toolUses.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.args || {}) },
          })),
        })
      } else {
        msgs.push({ role: 'assistant', content: m.text })
      }
    } else if (m.role === 'tool') {
      msgs.push({ role: 'tool', tool_call_id: m.toolUseId, content: m.text })
    }
  }
  return msgs
}

function toAnthropicMessages(llm) {
  const msgs = []
  for (const m of llm) {
    if (m.role === 'user') {
      msgs.push({ role: 'user', content: [{ type: 'text', text: m.text }] })
    } else if (m.role === 'assistant') {
      const content = []
      if (m.text) content.push({ type: 'text', text: m.text })
      for (const t of m.toolUses || []) {
        content.push({ type: 'tool_use', id: t.id, name: t.name, input: t.args || {} })
      }
      if (content.length) msgs.push({ role: 'assistant', content })
    } else if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolUseId, content: m.text }
      if (m.ok === false) block.is_error = true
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0] && last.content[0].type === 'tool_result') {
        last.content.push(block)
      } else {
        msgs.push({ role: 'user', content: [block] })
      }
    }
  }
  return msgs
}

function toolsForProtocol(protocol) {
  if (protocol === 'anthropic') {
    return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.params }))
  }
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.params },
  }))
}

function safeParseArgs(str, name) {
  if (!str) return {}
  try {
    const v = JSON.parse(str)
    return v && typeof v === 'object' ? v : {}
  } catch {
    throw new FriendlyError(`模型为工具 ${name} 返回的参数不是合法 JSON，请重试。`)
  }
}

async function readApiError(res) {
  let body = ''
  try {
    body = await res.text()
  } catch { /* 忽略 */ }
  body = truncate(body.replace(/\s+/g, ' '), 400, '…')
  return `模型接口返回 ${res.status}${body ? `：${body}` : ''}`
}

async function pumpSSE(res, onEvent) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        onEvent(JSON.parse(payload))
      } catch { /* 忽略无法解析的行 */ }
    }
  }
}

function openAIAggregator(onDelta) {
  const text = []
  const calls = new Map()
  let finish = null
  return {
    on(evt) {
      const ch = evt && evt.choices && evt.choices[0]
      if (!ch) return
      if (ch.finish_reason) finish = ch.finish_reason
      const d = ch.delta || {}
      let content = d.content
      if (Array.isArray(content)) content = content.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('')
      if (typeof content === 'string' && content) {
        text.push(content)
        if (onDelta) onDelta(content)
      }
      for (const tc of d.tool_calls || []) {
        const i = typeof tc.index === 'number' ? tc.index : calls.size
        let cur = calls.get(i)
        if (!cur) {
          cur = { id: tc.id || `call_${i}`, name: '', argsStr: '' }
          calls.set(i, cur)
        }
        if (tc.id) cur.id = tc.id
        if (tc.function && tc.function.name) cur.name += tc.function.name
        if (tc.function && tc.function.arguments) cur.argsStr += tc.function.arguments
      }
    },
    finish() {
      const toolUses = [...calls.values()].map((c) => ({ id: c.id, name: c.name, args: safeParseArgs(c.argsStr, c.name || '?') }))
      return { text: text.join(''), toolUses, finishReason: finish }
    },
  }
}

function anthropicAggregator(onDelta) {
  const blocks = new Map()
  let usage = {}
  return {
    on(evt) {
      if (!evt || !evt.type) return
      if (evt.type === 'message_start') {
        usage = { input: evt.message && evt.message.usage && evt.message.usage.input_tokens }
      }
      if (evt.type === 'content_block_start' && evt.content_block) {
        const b = evt.content_block
        blocks.set(evt.index, b.type === 'tool_use' ? { type: 'tool', id: b.id, name: b.name, parts: [] } : { type: 'text', parts: [] })
      }
      if (evt.type === 'content_block_delta' && evt.delta) {
        const cur = blocks.get(evt.index)
        if (!cur) return
        if (evt.delta.type === 'text_delta' && evt.delta.text) {
          cur.parts.push(evt.delta.text)
          if (onDelta) onDelta(evt.delta.text)
        }
        if (evt.delta.type === 'input_json_delta' && evt.delta.partial_json) cur.parts.push(evt.delta.partial_json)
      }
    },
    finish() {
      let text = ''
      const toolUses = []
      for (const b of blocks.values()) {
        if (b.type === 'text') text += b.parts.join('')
        else toolUses.push({ id: b.id, name: b.name, args: safeParseArgs(b.parts.join(''), b.name || '?') })
      }
      return { text, toolUses, usage }
    },
  }
}

async function callModel({ provider, sys, llm, signal, onDelta }) {
  const protocol = provider.protocol === 'anthropic' ? 'anthropic' : 'openai'
  const url = protocol === 'anthropic' ? `${normalizeAnthropicBase(provider.baseUrl)}/messages` : `${normalizeOpenAIBase(provider.baseUrl)}/chat/completions`
  const headers =
    protocol === 'anthropic'
      ? { 'Content-Type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` }
  const body =
    protocol === 'anthropic'
      ? { model: provider.model, max_tokens: 8192, system: sys, messages: toAnthropicMessages(llm), tools: toolsForProtocol('anthropic'), stream: true }
      : { model: provider.model, messages: toOpenAIMessages(sys, llm), tools: toolsForProtocol('openai'), stream: true, temperature: 0.3 }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!res.ok) throw new FriendlyError(await readApiError(res))
  if (!res.body) throw new FriendlyError('模型接口没有返回数据流')

  const agg = protocol === 'anthropic' ? anthropicAggregator(onDelta) : openAIAggregator(onDelta)
  await pumpSSE(res, (evt) => agg.on(evt))
  return agg.finish()
}

// ---------- 授权 ----------

async function ensureApproval({ session, runtime, tool, args, emit }) {
  if (session.permission === 'auto') return
  // 命令自动档：终端命令免确认，写/删文件仍走确认
  if (session.permission === 'auto_exec' && tool.kind === 'command') return
  if (session.permission === 'readonly') {
    throw new FriendlyError('当前会话是只读模式，该操作已被拒绝。请告诉用户可在顶栏切换权限模式后重试，或先给出修改建议。')
  }
  const kindKey = tool.kind === 'command' ? 'command' : 'write'
  if ((session.sessionApproved || []).includes(kindKey)) return

  const requestId = uid('pm')
  const preview = buildPreview(tool, args, session.cwd)
  const decision = await new Promise((resolve) => {
    runtime.pending.set(requestId, { resolve })
    emit({ type: 'permission', requestId, tool: tool.name, kind: kindKey, ...preview })
  })
  runtime.pending.delete(requestId)
  emit({ type: 'permission_resolved', requestId, decision })
  if (decision === 'allow_session') {
    session.sessionApproved = session.sessionApproved || []
    session.sessionApproved.push(kindKey)
    emit({ type: 'notice', text: kindKey === 'command' ? '本会话内将不再逐条确认命令执行。' : '本会话内将不再逐次确认文件写入。' })
    return
  }
  if (decision === 'deny') {
    throw new FriendlyError('用户拒绝了这次操作。不要反复重试同一个操作，先和用户确认想法，或提出替代方案。')
  }
}

// 授权预览：在真正落盘前算出 diff / 命令内容，供授权卡展示。
function buildPreview(tool, args, cwd) {
  try {
    if (tool.name === 'write_file') {
      const { final } = resolveInRoot(cwd, args.path || '')
      const existed = fs.existsSync(final)
      const before = existed ? fs.readFileSync(final, 'utf8') : ''
      const diff = summarizeDiff(before, String(args.content ?? ''))
      return { title: existed ? '覆写文件' : '创建文件', subtitle: args.path, diff }
    }
    if (tool.name === 'edit_file') {
      const { final } = resolveInRoot(cwd, args.path || '')
      const before = fs.readFileSync(final, 'utf8')
      const list = Array.isArray(args.edits) && args.edits.length
        ? args.edits
        : [{ old_string: args.old_string, new_string: args.new_string, replace_all: args.replace_all }]
      let after = before
      for (const e of list) {
        const old = String((e && e.old_string) ?? '')
        if (!old) continue
        after = e.replace_all ? after.split(old).join(String(e.new_string ?? '')) : after.replace(old, String(e.new_string ?? ''))
      }
      const diff = summarizeDiff(before, after)
      return { title: '编辑文件', subtitle: args.path, diff }
    }
    if (tool.name === 'delete_path') {
      return { title: '删除', subtitle: args.path }
    }
    if (tool.name === 'run_command') {
      return { title: '执行命令', subtitle: args.command, command: args.command }
    }
  } catch {
    // 预览失败不影响授权流程，卡片降级为普通确认。
  }
  return { title: tool.name, subtitle: args && (args.path || args.command || '') }
}

import fs from 'node:fs'
import { resolveInRoot } from './util.mjs'

// ---------- 工具执行 ----------
// （resolveInRoot 供 buildPreview 在落盘前计算 diff 预览）

// 命令输出节流：把碎 chunk 攒成 ~200ms 一批，避免 SSE 事件洪水。
function makeOutputEmitter(emit, callId) {
  let buf = ''
  let timer = null
  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (buf) {
      emit({ type: 'tool_output', callId, text: buf })
      buf = ''
    }
  }
  return {
    push: (s) => {
      buf += s
      if (buf.length >= 800) flush()
      else if (!timer) timer = setTimeout(flush, 200)
    },
    flush,
  }
}

// 长对话上下文压缩：超软上限时，从最老的工具结果开始保留头尾截断。
function compactLLM(llm) {
  const LIMIT = 90000
  let total = 0
  for (const m of llm) total += (m.text || '').length
  if (total <= LIMIT) return
  const target = LIMIT * 0.7
  for (const m of llm) {
    if (total <= target) break
    if (m.role === 'tool' && m.text && m.text.length > 700) {
      const cut = m.text.slice(0, 300) + '\n…（较早的工具输出已压缩省略）…\n' + m.text.slice(-300)
      total -= m.text.length - cut.length
      m.text = cut
    }
  }
}

// 执行单个工具；返回要写回模型的 tool 消息（由调用方按顺序入历史）。
async function executeTool({ session, runtime, tu, emit, skipStart }) {
  const silent = tu.name === 'update_plan'
  if (!silent && !skipStart) emit({ type: 'tool_start', callId: tu.id, name: tu.name, args: tu.args || {} })
  const tool = toolByName(tu.name)
  const out = makeOutputEmitter((e) => emit(e), tu.id)
  let ok = true
  let resultText
  if (!tool) {
    ok = false
    resultText = `未知工具：${tu.name}。可用工具：${TOOLS.map((t) => t.name).join('、')}。`
  } else {
    try {
      if (tool.kind !== 'read') await ensureApproval({ session, runtime, tool, args: tu.args || {}, emit })
      const r = await tool.run({ cwd: session.cwd, emitOutput: out.push }, tu.args || {})
      out.flush()
      resultText = r.forModel
      if (r.planItems) {
        session.plan = r.planItems
        emit({ type: 'plan', items: r.planItems })
        return { role: 'tool', toolUseId: tu.id, name: tu.name, ok: true, text: resultText }
      }
      const card = r.card || { title: tu.name }
      emit({ type: 'tool_result', callId: tu.id, ok: r.ok !== false, card })
      if (r.ok === false) ok = false
      if (card.diff || tool.kind === 'write') emit({ type: 'files_changed', path: (tu.args && tu.args.path) || '' })
    } catch (e) {
      out.flush()
      const friendly = e instanceof FriendlyError
      if (!friendly) ok = false
      resultText = `工具执行失败：${e.message}`
      if (silent) emit({ type: 'notice', text: `任务清单更新失败：${e.message}` })
      else emit({ type: 'tool_result', callId: tu.id, ok: false, error: e.message })
    }
  }
  return { role: 'tool', toolUseId: tu.id, name: tu.name, ok, text: truncate(resultText || '', 12000) }
}

// 连续的只读工具归为并行组（update_plan 无副作用也可并行）；写/命令单独成组保顺序。
function toolGroups(list) {
  const groups = []
  for (const tu of list) {
    const t = toolByName(tu.name)
    const par = Boolean(t && t.kind === 'read')
    const last = groups[groups.length - 1]
    if (par && last && last.par) last.items.push(tu)
    else groups.push({ par, items: [tu] })
  }
  return groups
}

async function runToolGroup({ session, runtime, group, emit }) {
  if (!group.par || group.items.length === 1) {
    for (const tu of group.items) {
      const entry = await executeTool({ session, runtime, tu, emit })
      session.llm.push(entry)
    }
    return
  }
  // 并行只读：先按序发 tool_start，结果按完成序实时推送，历史按原序入列
  for (const tu of group.items) emit({ type: 'tool_start', callId: tu.id, name: tu.name, args: tu.args || {} })
  const entries = new Array(group.items.length)
  await Promise.all(
    group.items.map(async (tu, i) => {
      entries[i] = await executeTool({ session, runtime, tu, emit, skipStart: true })
    }),
  )
  for (const e of entries) session.llm.push(e)
}

// ---------- 主循环 ----------

export async function runAgent({ session, runtime, userText, emit }) {
  const settings = loadSettings()
  const provider = settings.providers.find((p) => p.id === settings.activeProviderId) || settings.providers[0]
  if (!provider || !provider.apiKey || !provider.model) {
    throw new FriendlyError('还没有配置可用的模型接口。请点击右上角「设置」，填入你自己的 API 地址与密钥后再开始对话。')
  }

  session.llm.push({ role: 'user', text: userText })
  let toolCalls = 0
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (runtime.stopped) {
      emit({ type: 'stopped' })
      return { toolCalls }
    }
    compactLLM(session.llm)
    const resp = await callModel({
      provider,
      sys: buildSystemPrompt(session),
      llm: session.llm,
      signal: runtime.ac.signal,
      onDelta: (t) => emit({ type: 'delta', text: t }),
    })
    const assistantMsg = { role: 'assistant', text: resp.text }
    if (resp.toolUses.length) assistantMsg.toolUses = resp.toolUses
    session.llm.push(assistantMsg)
    if (resp.text) emit({ type: 'assistant_text', text: resp.text })
    if (!resp.toolUses.length) {
      emit({ type: 'usage', usage: resp.usage || {} })
      return { toolCalls }
    }
    toolCalls += resp.toolUses.length
    // 中途中断时给未执行的 tool_use 补占位结果，保证历史里 tool_use 与 tool_result 一一对应
    const fillMissing = () => {
      const done = new Set(session.llm.filter((m) => m.role === 'tool').map((m) => m.toolUseId))
      for (const tu of resp.toolUses) {
        if (!done.has(tu.id)) session.llm.push({ role: 'tool', toolUseId: tu.id, name: tu.name, ok: false, text: '（用户中断了这次运行）' })
      }
    }
    if (runtime.stopped) {
      fillMissing()
      emit({ type: 'stopped' })
      return { toolCalls }
    }
    for (const group of toolGroups(resp.toolUses)) {
      if (runtime.stopped) {
        fillMissing()
        emit({ type: 'stopped' })
        return { toolCalls }
      }
      await runToolGroup({ session, runtime, group, emit })
    }
    if (runtime.stopped) {
      fillMissing()
      emit({ type: 'stopped' })
      return { toolCalls }
    }
  }
  emit({ type: 'notice', text: '这个任务步数较多，我先停在这里。你可以继续发消息，我会接着做。' })
  return { toolCalls }
}

// 供「测试连接」使用的非流式小请求。
export async function pingProvider(provider) {
  const started = Date.now()
  const protocol = provider.protocol === 'anthropic' ? 'anthropic' : 'openai'
  const url =
    protocol === 'anthropic'
      ? `${normalizeAnthropicBase(provider.baseUrl)}/messages`
      : `${normalizeOpenAIBase(provider.baseUrl)}/chat/completions`
  const headers =
    protocol === 'anthropic'
      ? { 'Content-Type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` }
  const body =
    protocol === 'anthropic'
      ? { model: provider.model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }
      : { model: provider.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new FriendlyError(await readApiError(res))
  return { latencyMs: Date.now() - started }
}
