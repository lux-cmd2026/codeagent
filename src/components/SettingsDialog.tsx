import { useEffect, useState } from 'react'
import type { PermissionMode, Protocol, Provider, Settings } from '../lib/types'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { Badge, Btn, Dialog, Input, Segmented, Select, Spinner } from './ui'

function blankProvider(): Provider & { apiKey: string } {
  return { id: `prov_${Math.random().toString(36).slice(2, 10)}`, name: '', protocol: 'openai', baseUrl: '', model: '', apiKey: '' }
}

type DraftProvider = Provider & { apiKey: string }

export function SettingsDialog({
  open,
  onClose,
  settings,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  settings: Settings | null
  onSaved: (s: Settings) => void
}) {
  const [providers, setProviders] = useState<DraftProvider[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [defaultPermission, setDefaultPermission] = useState<PermissionMode>('confirm')
  const [defaultCwd, setDefaultCwd] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !settings) return
    setProviders(settings.providers.map((p) => ({ ...p, apiKey: '' })))
    setActiveId(settings.activeProviderId)
    setDefaultPermission(settings.defaultPermission)
    setDefaultCwd(settings.defaultCwd)
    setTestResult({})
    setError(null)
  }, [open, settings])

  const patch = (id: string, fields: Partial<DraftProvider>) =>
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...fields } : p)))

  const test = async (p: DraftProvider) => {
    setTesting(p.id)
    setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg: '' } }))
    try {
      const r = await api.testProvider({ providerId: p.id, provider: { protocol: p.protocol, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey || '__KEEP__' } })
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: true, msg: `连接正常（${r.latencyMs}ms）` } }))
    } catch (e) {
      setTestResult((prev) => ({ ...prev, [p.id]: { ok: false, msg: (e as Error).message } }))
    } finally {
      setTesting(null)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const s = await api.putSettings({
        providers: providers.map((p) => ({ id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey || '__KEEP__' })),
        activeProviderId: activeId,
        defaultPermission,
        defaultCwd,
      })
      onSaved(s)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="设置 · 模型接口与默认项" width={640}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-panel-2/50 p-3 text-[12px] leading-relaxed text-muted">
          <Icon.Shield size={13} className="mr-1 inline text-primary" />
          API Key 只保存在这台机器的应用数据里，对话请求由本地服务直接发给你填的接口地址，不经过任何第三方。
        </div>

        {/* 接口列表 */}
        <div className="space-y-3">
          {providers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-[12.5px] text-muted">
              还没有配置模型接口，点下面「添加接口」开始
            </div>
          ) : null}
          {providers.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3.5 ${activeId === p.id ? 'border-primary/40 bg-primary/[0.04]' : 'border-border'}`}>
              <div className="mb-2.5 flex items-center gap-2">
                <button
                  onClick={() => setActiveId(p.id)}
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${activeId === p.id ? 'border-primary bg-primary' : 'border-muted/50'}`}
                  title="设为当前使用"
                >
                  {activeId === p.id ? <Icon.Check size={10} className="text-primary-fg" /> : null}
                </button>
                <span className="text-[12px] text-muted">{activeId === p.id ? '当前使用' : '设为当前使用'}</span>
                <div className="flex-1" />
                <button
                  onClick={() => setProviders((prev) => prev.filter((x) => x.id !== p.id))}
                  className="rounded p-1 text-muted transition-colors hover:text-red-400"
                  title="删除这个接口"
                >
                  <Icon.Trash size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11.5px] text-muted">名称</label>
                  <Input value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} placeholder="DeepSeek / Claude / 中转站…" />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] text-muted">接口协议</label>
                  <Select
                    value={p.protocol}
                    onChange={(e) => {
                      const protocol = e.target.value as Protocol
                      const preset = protocol === 'anthropic' ? 'https://api.anthropic.com' : p.baseUrl || 'https://api.openai.com/v1'
                      patch(p.id, { protocol, baseUrl: preset })
                    }}
                  >
                    <option value="openai">OpenAI 兼容（DeepSeek/Kimi/中转站…）</option>
                    <option value="anthropic">Anthropic（Claude）</option>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11.5px] text-muted">接口地址 Base URL</label>
                  <Input
                    value={p.baseUrl}
                    onChange={(e) => patch(p.id, { baseUrl: e.target.value })}
                    placeholder={p.protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1 或 https://api.deepseek.com'}
                    className="font-mono text-[12px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] text-muted">API Key {p.hasKey ? <span className="text-muted/60">（已保存 {p.keyMasked}）</span> : null}</label>
                  <Input
                    type="password"
                    value={p.apiKey}
                    onChange={(e) => patch(p.id, { apiKey: e.target.value })}
                    placeholder={p.hasKey ? '留空则保持不变' : 'sk-…'}
                    className="font-mono text-[12px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11.5px] text-muted">模型名</label>
                  <Input
                    value={p.model}
                    onChange={(e) => patch(p.id, { model: e.target.value })}
                    placeholder={p.protocol === 'anthropic' ? 'claude-sonnet-4-5' : 'deepseek-chat / gpt-4o…'}
                    className="font-mono text-[12px]"
                  />
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <Btn size="sm" variant="outline" onClick={() => test(p)} disabled={testing === p.id}>
                  {testing === p.id ? <Spinner size={12} /> : <Icon.Sparkle size={12} />} 测试连接
                </Btn>
                {testResult[p.id] ? (
                  testResult[p.id].ok ? (
                    <Badge tone="green">
                      <Icon.Check size={10} /> {testResult[p.id].msg}
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      <Icon.Alert size={10} /> {testResult[p.id].msg || '测试中…'}
                    </Badge>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <Btn variant="outline" onClick={() => setProviders((prev) => [...prev, blankProvider()])} className="w-full border-dashed">
          <Icon.Plus size={13} /> 添加接口
        </Btn>

        {/* 默认项 */}
        <div className="rounded-xl border border-border p-3.5">
          <div className="mb-2.5 text-[12.5px] font-medium text-fg">新会话默认值</div>
          <div className="grid grid-cols-2 items-end gap-2.5">
            <div>
              <label className="mb-1 block text-[11.5px] text-muted">默认权限模式</label>
              <Segmented
                value={defaultPermission}
                onChange={setDefaultPermission}
                options={[
                  { value: 'readonly', label: '只读' },
                  { value: 'confirm', label: '确认' },
                  { value: 'auto_exec', label: '命令自动' },
                  { value: 'auto', label: '完全访问' },
                ]}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] text-muted">默认工作目录</label>
              <Input value={defaultCwd} onChange={(e) => setDefaultCwd(e.target.value)} className="font-mono text-[12px]" />
            </div>
          </div>
        </div>

        {error ? <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-400">{error}</div> : null}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" onClick={save} disabled={saving}>
            {saving ? <Spinner size={13} /> : <Icon.Check size={13} />} 保存设置
          </Btn>
        </div>
      </div>
    </Dialog>
  )
}
