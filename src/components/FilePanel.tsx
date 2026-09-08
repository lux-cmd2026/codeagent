import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowseEntry, FileContent } from '../lib/types'
import { api } from '../lib/api'
import { highlight, langOf } from '../lib/highlight'
import { Icon } from './Icon'
import { Spinner } from './ui'

const CODE_BG = 'bg-[hsl(var(--codebg))]'

function extOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function fmtSize(n?: number | null) {
  if (n == null) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  return `${(n / 1024 / 1024).toFixed(1)}M`
}

function DirNode({
  cwd,
  rel,
  name,
  depth,
  isOpen,
  expandedSet,
  childrenMap,
  loading,
  onToggle,
  onSelectFile,
  selected,
}: {
  cwd: string
  rel: string
  name: string
  depth: number
  isOpen: boolean
  expandedSet: Set<string>
  childrenMap: Map<string, BrowseEntry[]>
  loading: Set<string>
  onToggle: (rel: string) => void
  onSelectFile: (rel: string) => void
  selected: string | null
}) {
  const children = childrenMap.get(rel)
  return (
    <div>
      <button
        onClick={() => onToggle(rel)}
        className={`flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left transition-colors hover:bg-panel-3/60 ${
          selected === rel ? 'bg-primary/[0.08]' : ''
        }`}
        style={{ paddingLeft: 6 + depth * 13 }}
      >
        <Icon.Chevron size={11} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        {isOpen ? <Icon.FolderOpen size={13} className="shrink-0 text-primary/80" /> : <Icon.Folder size={13} className="shrink-0 text-primary/80" />}
        <span className="min-w-0 truncate text-[12px] text-fg/85">{name}</span>
        {loading.has(rel) ? <Spinner size={11} /> : null}
      </button>
      {isOpen && children ? (
        <div>
          {children.map((c) =>
            c.type === 'dir' ? (
              <DirNode
                key={c.name}
                cwd={cwd}
                rel={`${rel}/${c.name}`}
                name={c.name}
                depth={depth + 1}
                isOpen={expandedSet.has(`${rel}/${c.name}`)}
                expandedSet={expandedSet}
                childrenMap={childrenMap}
                loading={loading}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
                selected={selected}
              />
            ) : (
              <FileNode key={c.name} name={c.name} rel={`${rel}/${c.name}`} depth={depth + 1} onSelectFile={onSelectFile} selected={selected} size={c.size} />
            ),
          )}
          {children.length === 0 ? <div style={{ paddingLeft: 24 + depth * 13 }} className="py-0.5 text-[11px] text-muted/50">（空目录）</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function FileNode({
  name,
  rel,
  depth,
  onSelectFile,
  selected,
  size,
}: {
  name: string
  rel: string
  depth: number
  onSelectFile: (rel: string) => void
  selected: string | null
  size?: number | null
}) {
  const ext = extOf(name)
  const color =
    ['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext)
      ? 'text-sky-400'
      : ['json', 'md', 'txt'].includes(ext)
        ? 'text-muted'
        : ['css', 'scss', 'html'].includes(ext)
          ? 'text-violet-400'
          : ['py', 'sh'].includes(ext)
            ? 'text-emerald-400'
            : 'text-muted'
  return (
    <button
      onClick={() => onSelectFile(rel)}
      className={`flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left transition-colors hover:bg-panel-3/60 ${
        selected === rel ? 'bg-primary/[0.10]' : ''
      }`}
      style={{ paddingLeft: 19 + depth * 13 }}
    >
      <Icon.File size={13} className={`shrink-0 ${color}`} />
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg/75">{name}</span>
      {size != null ? <span className="shrink-0 text-[10px] text-muted/50">{fmtSize(size)}</span> : null}
    </button>
  )
}

export function FilePanel({ cwd, onOpenDir }: { cwd: string | null; onOpenDir: () => void }) {
  const [rootEntries, setRootEntries] = useState<BrowseEntry[] | null>(null)
  const [childrenMap, setChildrenMap] = useState<Map<string, BrowseEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [file, setFile] = useState<FileContent | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const cwdRef = useRef(cwd)
  useEffect(() => { cwdRef.current = cwd }, [cwd])

  const loadDir = useCallback(async (dir: string, isRoot: boolean) => {
    if (!cwdRef.current) return
    try {
      const r = await api.browse(dir === '.' ? cwdRef.current : dir)
      const entries = r.entries
      if (isRoot) setRootEntries(entries)
      else setChildrenMap((prev) => new Map(prev).set(dir, entries))
    } catch {
      if (isRoot) setRootEntries([])
    }
  }, [])

  // 工作目录变化 → 重置
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRootEntries(null)
    setChildrenMap(new Map())
    setExpanded(new Set())
    setSelected(null)
    setFile(null)
    if (cwd) loadDir('.', true)
  }, [cwd, loadDir])

  const toggle = (rel: string) => {
    const next = new Set(expanded)
    if (next.has(rel)) {
      next.delete(rel)
      setExpanded(next)
      return
    }
    next.add(rel)
    setExpanded(next)
    if (!childrenMap.has(rel)) {
      setLoading((prev) => new Set(prev).add(rel))
      loadDir(rel, false).finally(() =>
        setLoading((prev) => {
          const s = new Set(prev)
          s.delete(rel)
          return s
        }),
      )
    }
  }

  const selectFile = async (rel: string) => {
    setSelected(rel)
    if (!cwd) return
    setFileLoading(true)
    try {
      const f = await api.readFile(rel, cwd)
      setFile(f)
    } catch (e) {
      setFile({ path: rel, content: '', lines: 0, binary: false })
      void e
    } finally {
      setFileLoading(false)
    }
  }

  // agent 改了文件 → 刷新树与已打开的预览
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { path?: string } | undefined
      loadDir('.', true)
      expanded.forEach((d) => loadDir(d, false))
      if (detail && detail.path && selected && (detail.path === selected || selected.startsWith(detail.path + '/'))) {
        selectFile(selected)
      }
    }
    window.addEventListener('forge:files-changed', handler)
    return () => window.removeEventListener('forge:files-changed', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, selected, cwd, loadDir])

  // 对话里点文件路径 → 展开所在目录并打开预览
  useEffect(() => {
    const handler = (e: Event) => {
      const p = (e as CustomEvent<{ path?: string }>).detail?.path
      if (!p || !cwd) return
      const rel = p.startsWith('/') ? (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : null) : p
      if (!rel || rel.includes('..')) return
      const segs = rel.split('/')
      const next = new Set(expanded)
      let acc = ''
      for (let i = 0; i < segs.length - 1; i++) {
        acc = acc ? `${acc}/${segs[i]}` : segs[i]
        next.add(acc)
        loadDir(acc, false)
      }
      setExpanded(next)
      selectFile(rel)
    }
    window.addEventListener('forge:open-file', handler)
    return () => window.removeEventListener('forge:open-file', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, expanded, loadDir])

  const cwdName = cwd ? cwd.split('/').filter(Boolean).slice(-1)[0] || '/' : '未选择'

  return (
    <div className="flex h-full flex-col">
      {/* 树区 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <Icon.Folder size={13} className="text-primary" />
          <button onClick={onOpenDir} className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-fg/85 hover:text-primary" title={cwd || ''}>
            {cwdName}
          </button>
          <button
            onClick={() => {
              loadDir('.', true)
              expanded.forEach((d) => loadDir(d, false))
            }}
            className="rounded p-1 text-muted transition-colors hover:bg-panel-3 hover:text-fg"
            title="刷新"
          >
            <Icon.Refresh size={13} />
          </button>
          <button onClick={onOpenDir} className="rounded p-1 text-muted transition-colors hover:bg-panel-3 hover:text-fg" title="切换目录">
            <Icon.Globe size={13} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {!cwd ? (
            <div className="px-4 py-8 text-center text-[12px] text-muted/70">先在会话里选择工作目录</div>
          ) : rootEntries === null ? (
            <div className="flex justify-center py-6 text-muted">
              <Spinner />
            </div>
          ) : rootEntries.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] leading-relaxed text-muted/70">
              目录是空的
              <br />
              让 agent 帮你创建第一个文件
            </div>
          ) : (
            rootEntries.map((e) =>
              e.type === 'dir' ? (
                <DirNode
                  key={e.name}
                  cwd={cwd!}
                  rel={e.name}
                  name={e.name}
                  depth={0}
                  isOpen={expanded.has(e.name)}
                  expandedSet={expanded}
                  childrenMap={childrenMap}
                  loading={loading}
                  onToggle={toggle}
                  onSelectFile={selectFile}
                  selected={selected}
                />
              ) : (
                <FileNode key={e.name} name={e.name} rel={e.name} depth={0} onSelectFile={selectFile} selected={selected} size={e.size} />
              ),
            )
          )}
        </div>
      </div>

      {/* 预览区 */}
      {selected ? (
        <div className="flex min-h-0 flex-[1.2] flex-col border-t border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Icon.File size={12} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg/80">{selected}</span>
            {file && file.lines ? <span className="shrink-0 text-[10.5px] text-muted">{file.lines} 行</span> : null}
            <button onClick={() => { setSelected(null); setFile(null) }} className="rounded p-0.5 text-muted transition-colors hover:text-fg" title="关闭预览">
              <Icon.Close size={13} />
            </button>
          </div>
          <div className={`min-h-0 flex-1 overflow-auto ${CODE_BG}`}>
            {fileLoading ? (
              <div className="flex justify-center py-8 text-muted">
                <Spinner />
              </div>
            ) : file && file.binary ? (
              <div className="p-4 text-[12px] text-muted">二进制文件，无法预览。</div>
            ) : file && file.truncated ? (
              <div className="p-4 text-[12px] text-muted">文件超过 512KB，暂不支持预览。</div>
            ) : file && file.content ? (
              <div className="flex font-mono text-[11.5px] leading-[1.6]">
                <div className="sticky left-0 select-none border-r border-border/50 bg-[hsl(var(--codebg))] px-2 py-2 text-right text-muted/40">
                  {file.content.split('\n').slice(0, 3000).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <pre className="min-w-0 flex-1 whitespace-pre px-3 py-2 text-fg/85">
                  <code dangerouslySetInnerHTML={{ __html: highlight(file.content.split('\n').slice(0, 3000).join('\n'), langOf(selected!)) }} />
                </pre>
              </div>
            ) : (
              <div className="p-4 text-[12px] text-muted">（空文件）</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
