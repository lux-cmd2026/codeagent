import type { SessionInfo } from '../lib/types'
import { Icon } from './Icon'

function relTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${Math.floor(diff / 86400_000)} 天前`
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  sessions: SessionInfo[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-panel-2/60 py-2.5 text-[12.5px] font-medium text-muted transition-colors hover:border-primary/50 hover:text-fg"
        >
          <Icon.Plus size={14} /> 新建会话
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] leading-relaxed text-muted/70">
            还没有会话
            <br />
            选一个工作目录开始吧
          </div>
        ) : null}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group mb-1 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
              s.id === activeId
                ? 'border-primary/35 bg-primary/[0.08]'
                : 'border-transparent hover:border-border hover:bg-panel-2'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon.Message size={13} className={s.id === activeId ? 'shrink-0 text-primary' : 'shrink-0 text-muted'} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{s.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(s.id)
                }}
                className="hidden shrink-0 rounded p-0.5 text-muted transition-colors hover:text-red-400 group-hover:block"
                title="删除会话"
              >
                <Icon.Trash size={13} />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1.5 pl-5 text-[11px] text-muted/80">
              <span className="truncate font-mono">{s.cwd.split('/').filter(Boolean).slice(-1)[0] || '/'}</span>
              <span>·</span>
              <span className="shrink-0">{relTime(s.updatedAt)}</span>
            </div>
            {s.lastPreview ? (
              <div className="mt-0.5 line-clamp-1 pl-5 text-[11px] text-muted/60">{s.lastPreview}</div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-2.5 text-[10.5px] leading-relaxed text-muted/60">
        文件操作限定在会话工作目录内
        <br />
        API Key 只保存在本机
      </div>
    </div>
  )
}
