import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatEvent, PlanItem, SessionDetail } from '../lib/types'
import { api } from '../lib/api'
import { langOf } from '../lib/highlight'
import { Markdown } from '../lib/markdown'
import { DiffView } from './DiffView'
import { Icon } from './Icon'
import { Badge, Btn, Spinner } from './ui'

const TOOL_ICON: Record<string, (p: { size?: number; className?: string }) => React.ReactElement> = {
  list_dir: Icon.Folder,
  read_file: Icon.File,
  search_text: Icon.Search,
  find_files: Icon.Search,
  write_file: Icon.Pencil,
  edit_file: Icon.Pencil,
  delete_path: Icon.Trash,
  run_command: Icon.Terminal,
  update_plan: Icon.ListTodo,
}

const TOOL_LABEL: Record<string, string> = {
  list_dir: '浏览目录',
  read_file: '读取文件',
  search_text: '全文搜索',
  find_files: '查找文件',
  write_file: '写入文件',
  edit_file: '编辑文件',
  delete_path: '删除',
  run_command: '执行命令',
  update_plan: '更新任务清单',
}

// 这些工具卡片上的路径可以点开，在右侧预览
const OPENABLE = new Set(['read_file', 'write_file', 'edit_file', 'delete_path', 'list_dir'])

function openInPreview(path: string) {
  window.dispatchEvent(new CustomEvent('forge:open-file', { detail: { path } }))
}

function ToolCard({ evt, result, live }: { evt: ChatEvent; result?: ChatEvent; live?: string }) {
  const IconCmp = TOOL_ICON[evt.name || ''] || Icon.File
  const card = result && result.card ? result.card : null
  const running = !result
  const ok = result ? result.ok !== false : true
  // 写文件的 diff 与正在滚动的命令输出默认展开；其他默认收起
  const [openState, setOpenState] = useState<boolean | null>(null)
  const open = openState !== null ? openState : Boolean(card && card.diff) || Boolean(live)
  const outRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [live])

  const pathArg = evt.args && typeof evt.args.path === 'string' ? evt.args.path : null
  const clickable = Boolean(pathArg) && OPENABLE.has(evt.name || '')
  const diffLang = langOf(String(card?.subtitle || pathArg || ''))

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-border bg-panel-2/60">
      <div
        onClick={() => setOpenState(!open)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-panel-3/50"
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${ok ? 'bg-primary/12 text-primary' : 'bg-red-500/12 text-red-400'}`}>
          <IconCmp size={13} />
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-fg">{card?.title || TOOL_LABEL[evt.name || ''] || evt.name}</span>
        {card?.subtitle ? (
          clickable ? (
            <span
              onClick={(e) => {
                e.stopPropagation()
                openInPreview(pathArg!)
              }}
              className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted underline decoration-dotted decoration-muted/40 underline-offset-2 transition-colors hover:text-primary"
              title="点击在右侧预览这个文件"
            >
              {card.subtitle}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted">{card.subtitle}</span>
          )
        ) : (
          <span className="flex-1" />
        )}
        {card?.meta ? <span className="shrink-0 text-[11px] text-muted">{card.meta}</span> : null}
        {running ? (
          <Spinner size={13} />
        ) : ok ? (
          <Icon.Check size={14} className="shrink-0 text-emerald-500" />
        ) : (
          <Icon.Close size={13} className="shrink-0 text-red-400" />
        )}
        <Icon.Chevron size={13} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
      </div>
      {open ? (
        <div className="border-t border-border/70 px-3 py-2.5">
          {result?.error ? (
            <div className="flex items-start gap-1.5 text-[12px] text-red-400">
              <Icon.Alert size={13} className="mt-0.5 shrink-0" />
              <span>{result.error}</span>
            </div>
          ) : null}
          {card?.diff ? (
            <div className="max-h-80 overflow-auto">
              <DiffView diff={card.diff} dense lang={diffLang} />
            </div>
          ) : null}
          {card?.lines && card.lines.length ? (
            <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-[hsl(var(--codebg))] p-2.5 font-mono text-[11.5px] leading-relaxed text-fg/80">
              {card.lines.join('\n')}
            </pre>
          ) : null}
          {!result && live ? (
            <pre ref={outRef} className="max-h-64 overflow-auto rounded-lg border border-border bg-[hsl(var(--codebg))] p-2.5 font-mono text-[11.5px] leading-relaxed text-fg/80">
              {live}
              <span className="ml-0.5 inline-block h-3 w-[6px] animate-pulse bg-primary/70 align-middle" />
            </pre>
          ) : null}
          {!result?.error && !card?.diff && !(card?.lines && card.lines.length) && !(running && live) ? (
            <div className="text-[12px] text-muted">{running ? '执行中…' : '已完成，无附加输出。'}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function PlanCard({ items }: { items: PlanItem[] }) {
  const done = items.filter((i) => i.status === 'done').length
  const pct = Math.round((done / items.length) * 100)
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.04]">
      <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2">
        <Icon.ListTodo size={13} className="shrink-0 text-primary" />
        <span className="text-[12.5px] font-medium text-fg">任务进度</span>
        <span className="flex-1" />
        <span className="text-[11.5px] text-muted">
          {done}/{items.length}
        </span>
      </div>
      <div className="px-3.5 pt-2.5">
        <div className="h-1 overflow-hidden rounded-full bg-panel-3">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="space-y-1 px-3.5 py-2.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[12.5px]">
            {it.status === 'done' ? (
              <Icon.Check size={12} className="shrink-0 text-primary" />
            ) : it.status === 'doing' ? (
              <Spinner size={12} />
            ) : (
              <span className="h-[11px] w-[11px] shrink-0 rounded-full border border-muted/40" />
            )}
            <span className={it.status === 'done' ? 'text-muted line-through' : it.status === 'doing' ? 'text-fg' : 'text-fg/60'}>{it.text}</span>
            {it.status === 'doing' ? <span className="shrink-0 text-[11px] text-primary">进行中</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function PermissionCard({
  evt,
  resolved,
  onApprove,
  busy,
}: {
  evt: ChatEvent
  resolved?: 'allow' | 'allow_session' | 'deny'
  onApprove: (requestId: string, decision: 'allow' | 'allow_session' | 'deny') => void
  busy: boolean
}) {
  const isCommand = evt.kind === 'command'
  const title = evt.title || (isCommand ? '执行命令' : '修改文件')
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-amber-500/35 bg-amber-500/[0.05]">
      <div className="flex items-center gap-2 border-b border-amber-500/20 px-3.5 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
          <Icon.Shield size={13} />
        </span>
        <span className="text-[13px] font-semibold text-fg">需要你的授权</span>
        <span className="text-[12px] text-muted">{isCommand ? 'agent 想执行一条终端命令' : 'agent 想修改你的文件'}</span>
      </div>
      <div className="px-3.5 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[12.5px] font-medium text-fg">{title}</span>
          {evt.subtitle ? <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted">{evt.subtitle}</span> : null}
        </div>
        {isCommand && evt.command ? (
          <pre className="overflow-x-auto rounded-lg border border-border bg-[hsl(var(--codebg))] p-2.5 font-mono text-[12px] text-amber-200/90">{evt.command}</pre>
        ) : null}
        {evt.diff ? (
          <div className="mt-1.5 max-h-80 overflow-auto rounded-lg border border-border">
            <DiffView diff={evt.diff} dense lang={langOf(evt.subtitle || '')} />
          </div>
        ) : null}
        {resolved ? (
          <div className="mt-2.5 flex items-center gap-2">
            {resolved === 'deny' ? (
              <Badge tone="red">
                <Icon.Close size={11} /> 已拒绝
              </Badge>
            ) : (
              <Badge tone="green">
                <Icon.Check size={11} /> {resolved === 'allow_session' ? '本会话内已允许' : '已允许'}
              </Badge>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn variant="primary" size="sm" disabled={busy} onClick={() => onApprove(evt.requestId!, 'allow')}>
              <Icon.Check size={13} /> 允许这次
            </Btn>
            <Btn variant="outline" size="sm" disabled={busy} onClick={() => onApprove(evt.requestId!, 'allow_session')}>
              本会话内都允许
            </Btn>
            <Btn variant="danger" size="sm" disabled={busy} onClick={() => onApprove(evt.requestId!, 'deny')}>
              拒绝
            </Btn>
            <span className="text-[11px] text-muted">拒绝后 agent 会停下来询问你的想法</span>
          </div>
        )}
      </div>
    </div>
  )
}

const SUGGESTIONS = ['看看这个项目的结构，给我讲讲', '帮我写一个新功能', '找出代码里的问题并修复', '把代码整理重构一下']

export function ChatPanel({
  session,
  events,
  running,
  streamText,
  onSend,
  onStop,
  onApprove,
  sendError,
}: {
  session: SessionDetail | null
  events: ChatEvent[]
  running: boolean
  streamText: string
  onSend: (text: string) => void
  onStop: () => void
  onApprove: (requestId: string, decision: 'allow' | 'allow_session' | 'deny') => void
  sendError: string | null
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickBottom = useRef(true)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // @ 文件引用
  const [mention, setMention] = useState<{ from: number; q: string } | null>(null)
  const [cands, setCands] = useState<string[]>([])
  const [mIdx, setMIdx] = useState(0)
  const seqRef = useRef(0)

  // 结果索引：callId → tool_result 事件；requestId → 决议；callId → 实时输出
  const resultMap = useMemo(() => {
    const m = new Map<string, ChatEvent>()
    for (const e of events) if (e.type === 'tool_result' && e.callId) m.set(e.callId, e)
    return m
  }, [events])

  const resolvedMap = useMemo(() => {
    const m = new Map<string, 'allow' | 'allow_session' | 'deny'>()
    for (const e of events) if (e.type === 'permission_resolved' && e.requestId) m.set(e.requestId, e.decision || 'deny')
    return m
  }, [events])

  const outputMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of events) if (e.type === 'tool_output' && e.callId) m.set(e.callId, (m.get(e.callId) || '') + (e.text || ''))
    return m
  }, [events])

  // 只渲染最后一条任务清单（历史快照跳过，避免刷屏）
  const lastPlanIdx = useMemo(() => {
    let idx = -1
    events.forEach((e, i) => {
      if (e.type === 'plan') idx = i
    })
    return idx
  }, [events])

  // 非流式输出阶段的活动提示（正在读哪个文件 / 执行什么命令 / 等你授权）
  const activity = useMemo(() => {
    if (!running || streamText) return null
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e.type === 'user') break
      if (e.type === 'permission' && !resolvedMap.has(e.requestId || '')) return '等待你的授权…'
      if (e.type === 'tool_start' && !resultMap.has(e.callId || '')) {
        const label = TOOL_LABEL[e.name || '']
        return label ? `正在${label.replace('文件', '').replace('目录', '')}…` : '正在执行…'
      }
    }
    return '正在思考…'
  }, [running, streamText, events, resultMap, resolvedMap])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight
  }, [events, streamText, running, activity])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const syncMention = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const m = /(^|\s)@([^\s@]*)$/.exec(before)
    if (!m || !session) {
      setMention(null)
      setCands([])
      return
    }
    const q = m[2]
    setMention({ from: caret - q.length - 1, q })
    setMIdx(0)
    const seq = ++seqRef.current
    api
      .completeFiles(session.cwd, q)
      .then((r) => {
        if (seq === seqRef.current) setCands(r.files)
      })
      .catch(() => {
        if (seq === seqRef.current) setCands([])
      })
  }

  const pickMention = (path: string) => {
    if (!mention) return
    const ta = taRef.current
    const caret = ta ? ta.selectionStart : input.length
    const next = input.slice(0, mention.from) + '@' + path + ' ' + input.slice(caret)
    const pos = mention.from + path.length + 2
    setInput(next)
    setMention(null)
    setCands([])
    requestAnimationFrame(() => {
      const t = taRef.current
      if (t) {
        t.focus()
        t.setSelectionRange(pos, pos)
      }
    })
  }

  const submit = () => {
    const text = input.trim()
    if (!text || running || !session) return
    setInput('')
    setMention(null)
    setCands([])
    stickBottom.current = true
    onSend(text)
  }

  const isEmpty = events.length === 0

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 消息流 */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          {session && isEmpty ? (
            <div className="flex flex-col items-center pt-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
                <Icon.Logo size={26} />
              </div>
              <h2 className="text-[19px] font-semibold text-fg">这个会话能做什么？</h2>
              <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
                我可以阅读 <span className="font-mono text-fg/80">{session.cwd}</span> 里的代码，帮你查找、修改、执行命令，复杂任务会列清单同步进度。
                当前权限模式下，写文件和跑命令前会先征求你的同意。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-border bg-panel-2 px-3.5 py-1.5 text-[12.5px] text-muted transition-colors hover:border-primary/40 hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {events.map((e, idx) => {
            const key = e.id || `live-${idx}`
            if (e.type === 'user') {
              return (
                <div key={key} className="my-3 flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/12 px-4 py-2.5 text-[13.5px] leading-relaxed text-fg ring-1 ring-primary/20">
                    <span className="whitespace-pre-wrap">{e.text}</span>
                  </div>
                </div>
              )
            }
            if (e.type === 'assistant') {
              return (
                <div key={key} className="my-3 flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-3 text-primary ring-1 ring-border">
                    <Icon.Logo size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Markdown text={e.text || ''} />
                  </div>
                </div>
              )
            }
            if (e.type === 'tool_start') {
              return <ToolCard key={key} evt={e} result={resultMap.get(e.callId || '')} live={outputMap.get(e.callId || '')} />
            }
            if (e.type === 'plan') {
              if (idx !== lastPlanIdx) return null
              return <PlanCard key={key} items={e.items || []} />
            }
            if (e.type === 'permission') {
              return (
                <PermissionCard
                  key={key}
                  evt={e}
                  resolved={resolvedMap.get(e.requestId || '')}
                  onApprove={onApprove}
                  busy={false}
                />
              )
            }
            if (e.type === 'error') {
              return (
                <div key={key} className="my-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-3.5 py-2.5 text-[12.5px] text-red-400">
                  <Icon.Alert size={14} className="mt-0.5 shrink-0" />
                  <span>{e.message}</span>
                </div>
              )
            }
            if (e.type === 'run_end') {
              if (!e.durationMs || !e.toolCalls) return null
              return (
                <div key={key} className="my-2 flex items-center gap-2 pl-8 text-[11px] text-muted/60">
                  <Icon.Clock size={10} />
                  <span>
                    本轮用时 {(e.durationMs / 1000).toFixed(1)}s · {e.toolCalls} 次工具调用
                  </span>
                </div>
              )
            }
            if (e.type === 'notice') {
              return (
                <div key={key} className="my-2 rounded-lg border border-border bg-panel-2 px-3 py-2 text-[12px] text-muted">
                  {e.text}
                </div>
              )
            }
            if (e.type === 'stopped') {
              return (
                <div key={key} className="my-2 flex items-center gap-1.5 text-[12px] text-muted">
                  <Icon.Stop size={10} /> 已停止执行
                </div>
              )
            }
            return null
          })}

          {/* 流式输出 */}
          {running && streamText ? (
            <div className="my-3 flex gap-2.5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-3 text-primary ring-1 ring-border">
                <Icon.Logo size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <Markdown text={streamText} />
                <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary align-middle" />
              </div>
            </div>
          ) : null}
          {running && !streamText && activity ? (
            <div className="my-3 flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel-3 text-primary ring-1 ring-border">
                <Icon.Logo size={13} />
              </div>
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <Spinner size={13} /> {activity}
              </div>
            </div>
          ) : null}

          {sendError ? (
            <div className="my-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-3.5 py-2.5 text-[12.5px] text-red-400">
              <Icon.Alert size={14} className="mt-0.5 shrink-0" />
              <span>{sendError}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-border bg-panel/70 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {running ? (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-border bg-panel-2 px-3 py-1.5">
              <span className="flex items-center gap-2 text-[12px] text-muted">
                <Spinner size={12} /> agent 正在工作，期间会按权限模式征求你的确认
              </span>
              <Btn size="sm" variant="outline" onClick={onStop}>
                <Icon.Stop size={11} /> 停止
              </Btn>
            </div>
          ) : null}
          <div className="relative">
            {/* @ 文件补全下拉 */}
            {mention && cands.length ? (
              <div className="absolute bottom-full left-2 z-20 mb-2 max-h-60 w-96 overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl">
                <div className="sticky top-0 flex items-center gap-1.5 border-b border-border bg-panel px-3 py-1.5 text-[10.5px] text-muted">
                  <Icon.At size={11} /> 引用文件 · ↑↓ 选择 · Enter/Tab 插入
                </div>
                {cands.map((f, i) => {
                  const base = f.split('/').slice(-1)[0]
                  const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''
                  return (
                    <div
                      key={f}
                      onMouseDown={(ev) => {
                        ev.preventDefault()
                        pickMention(f)
                      }}
                      onMouseEnter={() => setMIdx(i)}
                      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === mIdx ? 'bg-primary/10' : ''}`}
                    >
                      <Icon.File size={12} className="shrink-0 text-muted" />
                      <span className="shrink-0 text-[12.5px] text-fg">{base}</span>
                      {dir ? <span className="min-w-0 flex-1 truncate text-right font-mono text-[10.5px] text-muted/60">{dir}</span> : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-[hsl(var(--input-bg))] p-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  syncMention(e.target.value, e.currentTarget.selectionStart)
                }}
                onKeyDown={(e) => {
                  if (mention && cands.length) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setMIdx((i) => (i + 1) % cands.length)
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setMIdx((i) => (i - 1 + cands.length) % cands.length)
                      return
                    }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.nativeEvent.isComposing)) {
                      e.preventDefault()
                      pickMention(cands[mIdx])
                      return
                    }
                    if (e.key === 'Escape') {
                      setMention(null)
                      return
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    submit()
                  }
                }}
                rows={1}
                placeholder={session ? '让 agent 做点什么…（@ 可以引用项目文件）' : '先创建一个会话'}
                disabled={!session}
                className="max-h-44 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] text-fg placeholder:text-muted/60 outline-none"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = `${Math.min(t.scrollHeight, 176)}px`
                }}
              />
              {running ? (
                <Btn variant="outline" onClick={onStop} className="h-9 w-9 !px-0" title="停止">
                  <Icon.Stop size={14} />
                </Btn>
              ) : (
                <Btn variant="primary" onClick={submit} disabled={!input.trim() || !session} className="h-9 w-9 !px-0" title="发送（Enter）">
                  <Icon.Send size={15} />
                </Btn>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted/70">
            <span>Enter 发送 · Shift+Enter 换行 · @ 引用文件</span>
            {session ? (
              <span>
                权限：
                {session.permission === 'readonly'
                  ? '只读'
                  : session.permission === 'confirm'
                    ? '写操作需确认'
                    : session.permission === 'auto_exec'
                      ? '命令自动 · 写文件需确认'
                      : '完全访问'}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
