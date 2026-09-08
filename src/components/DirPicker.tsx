import { useEffect, useRef, useState } from 'react'
import type { BrowseEntry } from '../lib/types'
import { api } from '../lib/api'
import { Icon } from './Icon'
import { Btn, Input, Spinner } from './ui'

// 通用目录选择器：输入路径或逐级点选
export function DirBrowser({ initial, onPick, pickLabel = '用这个目录' }: { initial: string; onPick: (path: string) => void; pickLabel?: string }) {
  const [input, setInput] = useState(initial || '/')
  const [path, setPath] = useState(initial || '/')
  const [entries, setEntries] = useState<BrowseEntry[] | null>(null)
  const [parent, setParent] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const loaded = useRef(false)

  const load = async (p: string) => {
    setErr(null)
    try {
      const r = await api.browse(p || '/')
      setPath(r.path)
      setInput(r.path)
      setEntries(r.entries.filter((e) => e.type === 'dir'))
      setParent(r.parent)
    } catch (e) {
      setErr((e as Error).message)
      setEntries([])
    }
  }

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true
      void load(initial || '/')
    }
  }, [initial])

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load(input)
          }}
          placeholder="/workspace/app/project"
          className="font-mono text-[12px]"
        />
        <Btn variant="outline" onClick={() => load(input)}>
          前往
        </Btn>
      </div>
      <div className="mt-2 h-52 overflow-y-auto rounded-lg border border-border bg-panel-2/50">
        {entries === null ? (
          <div className="flex justify-center py-10 text-muted">
            <Spinner />
          </div>
        ) : (
          <div className="p-1.5">
            {parent ? (
              <button onClick={() => load(parent)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted hover:bg-panel-3">
                <Icon.Chevron size={12} className="rotate-180" /> 返回上一级
              </button>
            ) : null}
            {entries.map((e) => (
              <button
                key={e.name}
                onClick={() => load(path === '/' ? `/${e.name}` : `${path}/${e.name}`)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-fg/85 hover:bg-panel-3"
              >
                <Icon.Folder size={13} className="shrink-0 text-primary/80" />
                <span className="truncate">{e.name}</span>
              </button>
            ))}
            {entries.length === 0 && !parent ? <div className="py-8 text-center text-[12px] text-muted/60">这里没有子目录了</div> : null}
          </div>
        )}
      </div>
      {err ? <div className="mt-1.5 text-[12px] text-red-400">{err}</div> : null}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted">{path}</span>
        <Btn variant="primary" size="sm" onClick={() => onPick(path)}>
          <Icon.Check size={13} /> {pickLabel}
        </Btn>
      </div>
    </div>
  )
}