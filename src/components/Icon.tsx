import React from 'react'

// 内联 SVG 图标集（stroke 风格，继承 currentColor）
// eslint-disable-next-line react-refresh/only-export-components
const S = (props: { children: React.ReactNode; size?: number; className?: string; fill?: string }) => (
  <svg
    width={props.size ?? 15}
    height={props.size ?? 15}
    viewBox="0 0 24 24"
    fill={props.fill ?? 'none'}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    aria-hidden
  >
    {props.children}
  </svg>
)

export const Icon = {
  Logo: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M14.5 4.5 19.5 9.5M4 20l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z" />
      <path d="m12 7 5 5" />
    </S>
  ),
  Folder: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </S>
  ),
  FolderOpen: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h12.5a2 2 0 0 0 1.9-1.4L21.5 12a1.5 1.5 0 0 0-1.4-2H7.6a2 2 0 0 0-1.9 1.4L3 19" />
    </S>
  ),
  File: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </S>
  ),
  Terminal: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="m5 8 4 4-4 4M12 17h7" />
      <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
    </S>
  ),
  Search: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </S>
  ),
  Pencil: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15 17 3.5Z" />
    </S>
  ),
  Trash: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </S>
  ),
  Send: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M4 12 20 4l-4.5 16-4-6.5L4 12Z" />
    </S>
  ),
  Stop: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </S>
  ),
  Settings: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </S>
  ),
  Sun: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </S>
  ),
  Moon: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </S>
  ),
  Plus: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  Refresh: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6" />
    </S>
  ),
  Close: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </S>
  ),
  Chevron: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="m9 6 6 6-6 6" />
    </S>
  ),
  Check: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="m4.5 12.5 5 5L20 7" />
    </S>
  ),
  Alert: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </S>
  ),
  Shield: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
    </S>
  ),
  Sparkle: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </S>
  ),
  Globe: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
    </S>
  ),
  Clock: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </S>
  ),
  Copy: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </S>
  ),
  ListTodo: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="m3 5.5 1.4 1.4L7 4.2M3 11.5l1.4 1.4L7 10.2M3 17.5l1.4 1.4L7 16.2" />
    </S>
  ),
  At: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </S>
  ),
  Message: (p: { size?: number; className?: string }) => (
    <S {...p}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
    </S>
  ),
}
