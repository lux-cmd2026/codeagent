// Forge · 本地代码智能体 — 服务入口
// 单进程监听 8000：/api/* 走自研 agent 后端，其余交给 Vite（前端 + HMR）。
import http from 'node:http'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { handleApi } from './server/api.mjs'
import { ensureDataDir, APP_ROOT } from './server/util.mjs'
import { DEFAULT_CWD } from './server/store.mjs'

const PORT = Number(process.env.PORT || 8000)
const HOST = process.env.HOST || '0.0.0.0'

ensureDataDir()
// 保证默认工作目录存在（首次启动时给用户一个可操作的初始项目）。
import fs from 'node:fs'
fs.mkdirSync(DEFAULT_CWD, { recursive: true })

const vite = await createViteServer({
  root: APP_ROOT,
  server: { middlewareMode: true },
  appType: 'spa',
})

const server = http.createServer((req, res) => {
  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname
  } catch { /* 交给 vite 处理 */ }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    handleApi(req, res, new URL(req.url || '/', 'http://localhost')).catch((e) => {
      console.error('[api-fatal]', e)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
      }
      try {
        res.end(JSON.stringify({ error: '服务内部错误' }))
      } catch { /* 忽略 */ }
    })
    return
  }
  vite.middlewares(req, res)
})

server.listen(PORT, HOST, () => {
  console.log(`[forge] 本地代码智能体已启动 → http://localhost:${PORT}`)
  console.log(`[forge] 默认工作目录：${DEFAULT_CWD}`)
})

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close()
    process.exit(0)
  })
}
