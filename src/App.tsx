import { useEffect, useRef, useState } from 'react'
import type { ChatEvent, PermissionMode, SessionDetail, SessionInfo, Settings } from './lib/types'
import { api, streamChat } from './lib/api'
import { TopBar } from './components/TopBar'
import { SessionList } from './components/SessionList'
import { ChatPanel } from './components/ChatPanel'
import { FilePanel } from './components/FilePanel'
import { SettingsDialog } from './components/SettingsDialog'
import { NewSessionDialog } from './components/NewSessionDialog'
import { DirBrowser } from './components/DirPicker'
import { Dialog } from './components/ui'

type Theme = 'dark' | 'light'

function initialTheme(): Theme {
  const saved = localStorage.getItem('forge-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [liveEvents, setLiveEvents] = useState<ChatEvent[]>([])
  const [streamText, setStreamText] = useState('')
  const [running, setRunning] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [dirOpen, setDirOpen] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)

  // 主题
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light')
    localStorage.setItem('forge-theme', theme)
  }, [theme])

  const selectSession = async (id: string) => {
    setActiveId(id)
    setLiveEvents([])
    setStreamText('')
    setSendError(null)
    try {
      const r = await api.getSession(id)
      setDetail(r.session)
    } catch {
      setDetail(null)
    }
  }

  const refreshSessions = () => {
    api
      .listSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {})
  }

  // 初始加载：设置 + 最近会话
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
    api
      .listSessions()
      .then((r) => {
        setSessions(r.sessions)
        if (r.sessions.length) selectSession(r.sessions[0].id)
      })
      .catch(() => {})
  }, [])

  const configured = Boolean(settings && settings.providers.some((p) => p.hasKey && p.model))

  // 发送消息（SSE 消费）
  const send = async (text: string) => {
    if (!activeId || running) return
    setSendError(null)
    const localUser: ChatEvent = { id: `local-u-${Date.now()}`, type: 'user', text }
    setLiveEvents([localUser])
    setRunning(true)
    setStreamText('')
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    let draft = ''

    const flush = (finalText?: string) => {
      const content = finalText !== undefined ? finalText : draft
      if (content) {
        setLiveEvents((prev) => [...prev, { id: `local-a-${Date.now()}-${prev.length}`, type: 'assistant', text: content }])
      }
      draft = ''
      setStreamText('')
    }

    try {
      await streamChat(
        activeId,
        text,
        (evt) => {
          switch (evt.type) {
            case 'delta':
              draft += evt.text || ''
              setStreamText(draft)
              break
            case 'assistant_text':
              flush(evt.text || '')
              break
            case 'tool_start':
            case 'permission':
              flush()
              setLiveEvents((prev) => [...prev, evt])
              break
            case 'tool_result':
            case 'permission_resolved':
            case 'notice':
            case 'stopped':
            case 'error':
            case 'plan':
            case 'tool_output':
            case 'run_end':
              setLiveEvents((prev) => [...prev, evt])
              break
            case 'files_changed':
              window.dispatchEvent(new CustomEvent('forge:files-changed', { detail: { path: evt.path } }))
              break
            default:
              break
          }
        },
        ctrl.signal,
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setSendError((e as Error).message)
    } finally {
      flush()
      setRunning(false)
      ctrlRef.current = null
      // 以服务端落盘的会话为准做一次同步
      try {
        const r = await api.getSession(activeId)
        setDetail(r.session)
        setLiveEvents([])
      } catch {
        /* 会话可能已被删除 */
      }
      refreshSessions()
    }
  }

  const stop = async () => {
    if (!activeId) return
    try {
      await api.stop(activeId)
    } catch {
      /* 忽略 */
    }
    ctrlRef.current?.abort()
  }

  const approve = async (requestId: string, decision: 'allow' | 'allow_session' | 'deny') => {
    if (!activeId) return
    // 本地先渲染决议，后端的 permission_resolved 事件随后到达（幂等）
    setLiveEvents((prev) => [...prev, { id: `local-p-${Date.now()}`, type: 'permission_resolved', requestId, decision }])
    try {
      await api.approve(activeId, requestId, decision)
    } catch (e) {
      setSendError((e as Error).message)
    }
  }

  const patchSession = async (patch: Record<string, unknown>) => {
    if (!activeId) return
    try {
      const r = await api.patchSession(activeId, patch)
      setDetail(r.session)
      refreshSessions()
    } catch (e) {
      setSendError((e as Error).message)
    }
  }

  const deleteSession = async (id: string) => {
    if (!window.confirm('删除这个会话？聊天与改动记录会清除（不会删除你的文件）。')) return
    try {
      await api.deleteSession(id)
    } catch {
      /* 忽略 */
    }
    if (id === activeId) {
      setActiveId(null)
      setDetail(null)
      setLiveEvents([])
    }
    refreshSessions()
  }

  const onModeChange = (m: PermissionMode) => {
    if (!detail) {
      setSettingsOpen(true)
      return
    }
    patchSession({ permission: m, resetApproval: true })
  }

  const events: ChatEvent[] = detail ? [...detail.events, ...liveEvents] : liveEvents

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-fg">
      <TopBar
        session={detail}
        configured={configured}
        theme={theme}
        onModeChange={onModeChange}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenDir={() => setDirOpen(true)}
        onOpenNew={() => setNewOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-border bg-panel">
          <SessionList
            sessions={sessions}
            activeId={activeId}
            onSelect={selectSession}
            onCreate={() => setNewOpen(true)}
            onDelete={deleteSession}
          />
        </aside>

        <main className="min-w-0 flex-1 bg-background">
          {detail ? (
            <ChatPanel
              session={detail}
              events={events}
              running={running}
              streamText={streamText}
              onSend={send}
              onStop={stop}
              onApprove={approve}
              sendError={sendError}
            />
          ) : (
            <EmptyState
              configured={configured}
              hasSessions={sessions.length > 0}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenNew={() => setNewOpen(true)}
            />
          )}
        </main>

        <aside className="w-[380px] shrink-0 border-l border-border bg-panel">
          <FilePanel cwd={detail ? detail.cwd : null} onOpenDir={() => setDirOpen(true)} />
        </aside>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSaved={(s) => {
          setSettings(s)
          refreshSessions()
        }}
      />
      <NewSessionDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultCwd={settings?.defaultCwd || '/workspace/app/project'}
        defaultPermission={settings?.defaultPermission || 'confirm'}
        onCreated={(id) => {
          refreshSessions()
          selectSession(id)
        }}
      />
      <Dialog open={dirOpen} onClose={() => setDirOpen(false)} title="切换工作目录" width={540}>
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-muted">
            切换后 agent 的读写与命令都会限定在新目录内，之前的授权记录会被清空。
          </p>
          {detail ? (
            <DirBrowser
              initial={detail.cwd}
              pickLabel="切换到这个目录"
              onPick={(p) => {
                if (p && p !== detail.cwd) patchSession({ cwd: p, resetApproval: true })
                setDirOpen(false)
              }}
            />
          ) : (
            <DirBrowser initial={settings?.defaultCwd || '/'} pickLabel="选定" onPick={() => setDirOpen(false)} />
          )}
        </div>
      </Dialog>
    </div>
  )
}

function EmptyState({
  configured,
  hasSessions,
  onOpenSettings,
  onOpenNew,
}: {
  configured: boolean
  hasSessions: boolean
  onOpenSettings: () => void
  onOpenNew: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4.5 19.5 9.5M4 20l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z" />
          <path d="m12 7 5 5" />
        </svg>
      </div>
      <h1 className="text-[22px] font-semibold text-fg">Forge · 本地代码智能体</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        在浏览器里和 agent 对话，它能阅读、搜索、修改你本地项目里的文件，也能执行终端命令 —— 每一步敏感操作都由你授权。
      </p>
      {!configured ? (
        <button
          onClick={onOpenSettings}
          className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[13px] font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
        >
          第一步：填入你自己的模型 API →
        </button>
      ) : (
        <button
          onClick={onOpenNew}
          className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110"
        >
          {hasSessions ? '开一个新会话' : '选择工作目录，开始'}
        </button>
      )}
      <div className="mt-8 grid max-w-lg grid-cols-3 gap-3 text-left">
        {[
          { t: '接你自己的模型', d: 'OpenAI 兼容或 Claude 协议，Key 只存本机' },
          { t: '授权后动文件', d: '写入、删除、命令执行前弹出 diff 让你确认' },
          { t: '改动全程可见', d: '每一步工具调用与代码差异都可回看' },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border border-border bg-panel p-3">
            <div className="text-[12.5px] font-medium text-fg">{c.t}</div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-muted">{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
