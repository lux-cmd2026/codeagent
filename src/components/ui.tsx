import React, { useEffect } from 'react'

// 基础 UI 小件（不依赖外部组件库）

export function Btn({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  className = '',
  type = 'button',
  title,
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  variant?: 'default' | 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
  title?: string
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors select-none disabled:opacity-45 disabled:cursor-not-allowed'
  const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-[13px]' }
  const variants = {
    default: 'bg-panel-3 text-fg hover:bg-panel-2 border border-border',
    primary: 'bg-primary text-primary-fg hover:brightness-110 shadow-sm',
    ghost: 'text-muted hover:text-fg hover:bg-panel-3',
    outline: 'border border-border text-fg hover:bg-panel-3',
    danger: 'bg-[hsl(var(--danger))]/12 text-[hsl(var(--danger))] border border-[hsl(var(--danger))]/30 hover:bg-[hsl(var(--danger))]/20',
  }
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return (
    <input
      {...rest}
      className={`h-9 w-full rounded-lg border border-border bg-[hsl(var(--input-bg))] px-3 text-[13px] text-fg placeholder:text-muted/70 outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15 ${className}`}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props
  return (
    <select
      {...rest}
      className={`h-9 w-full rounded-lg border border-border bg-[hsl(var(--input-bg))] px-2.5 text-[13px] text-fg outline-none transition-colors focus:border-primary/60 ${className}`}
    >
      {children}
    </select>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 520,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full rounded-2xl border border-border bg-panel shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="text-[14px] font-semibold text-fg">{title}</div>
          <button onClick={onClose} className="rounded-md p-1 text-muted transition-colors hover:bg-panel-3 hover:text-fg" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  const h = size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[12.5px]'
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-lg border border-border bg-panel-2 p-0.5 ${size === 'sm' ? 'p-[2px]' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`${h} rounded-[7px] px-2.5 font-medium transition-all ${
            value === o.value ? 'bg-panel-3 text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin text-current">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    default: 'bg-panel-3 text-muted border-border',
    green: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    red: 'bg-red-500/12 text-red-400 border-red-500/25',
    amber: 'bg-amber-500/12 text-amber-500 border-amber-500/25',
    blue: 'bg-sky-500/12 text-sky-400 border-sky-500/25',
  }
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>
}

export function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-panel-3 px-2 py-1 text-[11px] text-fg opacity-0 shadow-lg transition-opacity group-hover/tt:opacity-100">
        {label}
      </span>
    </span>
  )
}
