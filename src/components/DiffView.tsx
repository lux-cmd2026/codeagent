import type { DiffPayload } from '../lib/types'
import { highlight } from '../lib/highlight'

// diff 渲染：hunk 头 + 行级着色（lang 供语法高亮）
export function DiffView({ diff, dense = false, lang = '' }: { diff: DiffPayload; dense?: boolean; lang?: string }) {
  if (!diff || !diff.hunks || !diff.hunks.length) {
    return <div className="rounded-lg border border-border bg-panel-2 p-3 text-xs text-muted">（无文本差异）</div>
  }
  return (
    <div className={`overflow-hidden rounded-lg border border-border font-mono ${dense ? 'text-[11.5px]' : 'text-[12px]'}`}>
      {diff.hunks.map((h, hi) => (
        <div key={hi} className={hi > 0 ? 'border-t border-border' : ''}>
          {h.rows.map((r, ri) => {
            const bg =
              r.type === 'add'
                ? 'bg-emerald-500/10'
                : r.type === 'del'
                  ? 'bg-red-500/10'
                  : ''
            const marker = r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '
            const markerColor = r.type === 'add' ? 'text-emerald-500' : r.type === 'del' ? 'text-red-400' : 'text-transparent'
            const lineNo = (r.type === 'del' ? r.oldNo : r.newNo) ?? ''
            return (
              <div key={ri} className={`flex ${bg}`}>
                <span className="w-10 shrink-0 select-none border-r border-border/60 px-1.5 text-right text-[10.5px] leading-5 text-muted/60">
                  {lineNo}
                </span>
                <span className={`w-4 shrink-0 select-none text-center leading-5 ${markerColor}`}>{marker}</span>
                <span
                  className="min-w-0 flex-1 whitespace-pre-wrap break-all leading-5 text-fg/85"
                  dangerouslySetInnerHTML={{ __html: highlight(r.text, lang) }}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
