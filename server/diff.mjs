// 行级 diff（LCS），供写文件/编辑文件的授权预览与结果展示使用。
const MAX_CELLS = 4_000_000

export function diffLines(oldText, newText) {
  const A = String(oldText ?? '').split('\n')
  const B = String(newText ?? '').split('\n')
  if (A.length * B.length > MAX_CELLS) {
    const rows = []
    A.forEach((t, i) => rows.push({ type: 'del', text: t, oldNo: i + 1, newNo: null }))
    B.forEach((t, i) => rows.push({ type: 'add', text: t, oldNo: null, newNo: i + 1 }))
    return rows
  }
  const n = A.length
  const m = B.length
  // dp[i][j]：A[i..] 与 B[j..] 的 LCS 长度。用一维滚动数组。
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const rows = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      rows.push({ type: 'same', text: A[i], oldNo: oldNo++, newNo: newNo++ })
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      rows.push({ type: 'del', text: A[i], oldNo: oldNo++, newNo: null })
      i++
    } else {
      rows.push({ type: 'add', text: B[j], oldNo: null, newNo: newNo++ })
      j++
    }
  }
  while (i < n) rows.push({ type: 'del', text: A[i++], oldNo: oldNo++, newNo: null })
  while (j < m) rows.push({ type: 'add', text: B[j++], oldNo: null, newNo: newNo++ })
  return rows
}

// 压缩成带上下文的 hunk，方便渲染与传输。
export function toHunks(rows, context = 3) {
  const marks = rows.map((r) => r.type !== 'same')
  const keep = new Array(rows.length).fill(false)
  marks.forEach((v, idx) => {
    if (!v) return
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep[k] = true
  })
  const hunks = []
  let cur = null
  rows.forEach((r, idx) => {
    if (!keep[idx]) {
      if (cur) {
        hunks.push(cur)
        cur = null
      }
      return
    }
    if (!cur) cur = { rows: [] }
    cur.rows.push(r)
  })
  if (cur) hunks.push(cur)
  const result = hunks.map((h) => {
    const adds = h.rows.filter((r) => r.type === 'add').length
    const dels = h.rows.filter((r) => r.type === 'del').length
    return { adds, dels, rows: h.rows }
  })
  return { hunks: result, adds: rows.filter((r) => r.type === 'add').length, dels: rows.filter((r) => r.type === 'del').length }
}

export function summarizeDiff(oldText, newText) {
  const rows = diffLines(oldText, newText)
  return toHunks(rows)
}
