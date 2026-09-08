import type { Settings, SessionInfo, SessionDetail, BrowseResult, FileContent, ChatEvent } from './types'

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers ? init.headers : {}) },
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* 空响应 */
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `请求失败（${res.status}）`
    throw new Error(msg)
  }
  return data as T
}

export const api = {
  getSettings: () => jfetch<Settings>('/api/settings'),
  putSettings: (body: unknown) => jfetch<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  testProvider: (body: unknown) => jfetch<{ ok: boolean; latencyMs: number }>('/api/settings/test', { method: 'POST', body: JSON.stringify(body) }),
  browse: (path: string) => jfetch<BrowseResult>(`/api/fs/browse?path=${encodeURIComponent(path)}`),
  completeFiles: (cwd: string, q: string) =>
    jfetch<{ files: string[] }>(`/api/fs/complete?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`),
  readFile: (path: string, cwd: string) => jfetch<FileContent>(`/api/fs/file?path=${encodeURIComponent(path)}&cwd=${encodeURIComponent(cwd)}`),
  listSessions: () => jfetch<{ sessions: SessionInfo[] }>('/api/sessions'),
  createSession: (body: { cwd: string; permission: string; title?: string }) =>
    jfetch<{ session: SessionDetail }>('/api/sessions', { method: 'POST', body: JSON.stringify(body) }),
  getSession: (id: string) => jfetch<{ session: SessionDetail }>(`/api/sessions/${id}`),
  patchSession: (id: string, body: Record<string, unknown>) =>
    jfetch<{ session: SessionDetail }>(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSession: (id: string) => jfetch<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  approve: (id: string, requestId: string, decision: 'allow' | 'allow_session' | 'deny') =>
    jfetch<{ ok: boolean }>(`/api/sessions/${id}/approve`, { method: 'POST', body: JSON.stringify({ requestId, decision }) }),
  stop: (id: string) => jfetch<{ ok: boolean }>(`/api/sessions/${id}/stop`, { method: 'POST' }),
}

// 发起一轮对话，SSE 流式接收事件。
export async function streamChat(
  sessionId: string,
  text: string,
  onEvent: (evt: ChatEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!res.ok || !res.body) {
    let msg = `连接失败（${res.status}）`
    try {
      const d = await res.json()
      if (d && d.error) msg = d.error
    } catch {
      /* 忽略 */
    }
    throw new Error(msg)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent)
        } catch {
          /* 跳过坏帧 */
        }
      }
    }
  }
}
