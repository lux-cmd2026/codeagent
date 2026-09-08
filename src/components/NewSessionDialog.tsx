import { useState } from 'react'
import type { PermissionMode } from '../lib/types'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { Btn, Dialog, Spinner } from './ui'
import { DirBrowser } from './DirPicker'

const PERMS: Array<{ value: PermissionMode; label: string; desc: string; warn?: boolean }> = [
  { value: 'readonly', label: '只读', desc: 'agent 只能看和搜，不能动任何文件' },
  { value: 'confirm', label: '谨慎（推荐）', desc: '看代码自动；改文件、跑命令前逐次征求你同意' },
  { value: 'auto_exec', label: '命令自动审批', desc: '终端命令直接执行不弹窗；改文件、删文件前仍然逐次确认' },
  { value: 'auto', label: '完全访问', desc: '改文件、删文件、命令全部直接执行，不再弹确认——目录里的重要文件请先自行备份', warn: true },
]

export function NewSessionDialog({
  open,
  onClose,
  defaultCwd,
  defaultPermission,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  defaultCwd: string
  defaultPermission: PermissionMode
  onCreated: (id: string) => void
}) {
  const [cwd, setCwd] = useState(defaultCwd)
  const [permission, setPermission] = useState<PermissionMode>(defaultPermission)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const r = await api.createSession({ cwd, permission })
      onCreated(r.session.id)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="新建会话" width={560}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
            <Icon.Folder size={13} className="text-primary" /> 选择工作目录
          </div>
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
            agent 的所有文件操作都被限定在这个目录里，不会碰目录以外的东西。
          </p>
          <DirBrowser initial={defaultCwd} onPick={setCwd} pickLabel="选定为工作目录" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
            <Icon.Shield size={13} className="text-primary" /> 权限模式（会话中随时可切）
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PERMS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPermission(p.value)}
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  permission === p.value
                    ? p.warn
                      ? 'border-red-500/50 bg-red-500/[0.06]'
                      : 'border-primary/50 bg-primary/[0.07]'
                    : 'border-border hover:border-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {permission === p.value ? (
                    p.warn ? <Icon.Check size={12} className="text-red-400" /> : <Icon.Check size={12} className="text-primary" />
                  ) : null}
                  <span className={`text-[12.5px] font-medium ${p.warn ? 'text-red-400' : 'text-fg'}`}>{p.label}</span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-400">{error}</div> : null}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" onClick={create} disabled={creating || !cwd}>
            {creating ? <Spinner size={13} /> : <Icon.Send size={13} />} 开始
          </Btn>
        </div>
      </div>
    </Dialog>
  )
}
