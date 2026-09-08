import React, { useState } from 'react'
import { highlight } from './highlight'
import { Icon } from '../components/Icon'

// 极简 Markdown 渲染：代码块 / 标题 / 列表 / 行内（粗体·行内代码·链接），够 agent 回复使用。

function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } catch {
    /* 忽略 */
  }
  document.body.removeChild(ta)
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const hl = highlight(code, lang && lang !== 'text' ? lang : '')
  return (
    <div className="group/code relative my-2">
      <pre className="overflow-x-auto rounded-lg border border-border bg-[hsl(var(--codebg))] p-3 pr-12 font-mono text-[12.5px] leading-relaxed">
        <code dangerouslySetInnerHTML={{ __html: hl || '' }} />
      </pre>
      <button
        onClick={() => {
          copyText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }}
        className="absolute right-1.5 top-1.5 rounded-md border border-border bg-panel px-1.5 py-1 text-muted opacity-0 transition-opacity hover:text-fg group-hover/code:opacity-100"
        title="复制代码"
      >
        {copied ? <Icon.Check size={13} className="text-emerald-500" /> : <Icon.Copy size={13} />}
      </button>
      {lang && lang !== 'text' ? (
        <span className="absolute bottom-1.5 right-2 select-none text-[10px] uppercase tracking-wide text-muted/50">{lang}</span>
      ) : null}
    </div>
  )
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g)
  return parts.filter(Boolean).map((p, i) => {
    const key = `${keyPrefix}-${i}`
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-fg">
          {p.slice(2, -2)}
        </strong>
      )
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <code key={key} className="rounded bg-panel-3 px-1 py-0.5 font-mono text-[0.85em] text-syn-str">
          {p.slice(1, -1)}
        </code>
      )
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-emerald-400 underline decoration-dotted underline-offset-2">
          {link[1]}
        </a>
      )
    }
    return <span key={key}>{p}</span>
  })
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // 代码块
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        body.push(lines[i])
        i++
      }
      i++ // 跳过结尾 ```
      blocks.push(<CodeBlock key={key++} code={body.join('\n')} lang={lang} />)
      continue
    }

    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const cls = level <= 2 ? 'mt-3 mb-1.5 text-[15px] font-semibold text-fg' : 'mt-2.5 mb-1 text-[13.5px] font-semibold text-fg'
      blocks.push(
        <div key={key++} className={cls}>
          {inline(h[2], `h${key}`)}
        </div>,
      )
      i++
      continue
    }

    // 列表
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="my-1.5 list-disc space-y-1 pl-5 marker:text-muted">
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `l${key}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // 空行
    if (!line.trim()) {
      i++
      continue
    }

    // 段落（连续非空行合并）
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !lines[i].trimStart().startsWith('```') && !/^#{1,4}\s/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className="my-1.5 whitespace-pre-wrap">
        {inline(para.join('\n'), `p${key}`)}
      </p>,
    )
  }

  return <div className="text-[13.5px] leading-relaxed text-fg/90">{blocks}</div>
}
