import type { SessionDetail, PermissionMode } from '../lib/types'
import { Icon } from './Icon'
import { Btn, Segmented, Tooltip } from './ui'

const MODE_OPTS: Array<{ value: PermissionMode; label: string; title: string }> = [
  { value: 'readonly', label: '只读', title: 'agent 只能浏览与读取文件，不能改动' },
  { value: 'confirm', label: '确认', title: '读操作自动；写文件、删文件、执行命令前需要你确认' },
  { value: 'auto_exec', label: '命令自动', title: '终端命令自动执行；但写文件、删文件前仍需你确认' },
  { value: 'auto', label: '完全访问', title: '写文件、删文件、命令全部自动执行，不可逆操作也不会提醒——请确认工作目录没有重要未备份的文件' },
]

export function TopBar({
  session,
  configured,
  theme,
  onModeChange,
  onToggleTheme,
  onOpenSettings,
  onOpenDir,
  onOpenNew,
}: {
  session: SessionDetail | null
  configured: boolean
  theme: 'dark' | 'light'
  onModeChange: (m: PermissionMode) => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onOpenDir: () => void
  onOpenNew: () => void
}) {
  const cwdShort = session ? session.cwd.split('/').filter(Boolean).slice(-2).join('/') || '/' : ''
  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-panel px-4 py-2" style={{ height: 52 }}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/14 text-primary ring-1 ring-primary/30">
          <Icon.Logo size={17} />
        </span>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-wide text-fg">Forge</div>
          <div className="text-[10.5px] text-muted">本地代码智能体</div>
        </div>
      </div>

      <div className="mx-2 h-6 w-px bg-border" />

      {/* 工作目录 */}
      <Tooltip label="切换 agent 的工作目录">
        <button
          onClick={onOpenDir}
          disabled={!session}
          className="flex max-w-[260px] items-center gap-1.5 rounded-lg border border-border bg-panel-2 px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-primary/40 hover:text-fg disabled:opacity-50"
        >
          <Icon.Folder size={13} className="shrink-0 text-primary" />
          <span className="truncate font-mono">{cwdShort || '未选择目录'}</span>
          <Icon.Chevron size={12} className="shrink-0" />
        </button>
      </Tooltip>

      {/* 权限档位 */}
      <div className="flex items-center gap-2">
        <Segmented
          size="sm"
          value={session ? session.permission : 'confirm'}
          options={MODE_OPTS}
          onChange={onModeChange}
        />
      </div>

      <div className="flex-1" />

      {!configured ? (
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px] font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
        >
          <Icon.Alert size={13} /> 先配置模型接口
        </button>
      ) : null}

      <Btn variant="primary" size="sm" onClick={onOpenNew}>
        <Icon.Plus size={13} /> 新会话
      </Btn>

      <Tooltip label={theme === 'dark' ? '切换到浅色' : '切换到深色'}>
        <button
          onClick={onToggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-3 hover:text-fg"
        >
          {theme === 'dark' ? <Icon.Sun size={16} /> : <Icon.Moon size={15} />}
        </button>
      </Tooltip>

      <Tooltip label="设置">
        <button
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-3 hover:text-fg"
        >
          <Icon.Settings size={16} />
        </button>
      </Tooltip>
    </header>
  )
}
