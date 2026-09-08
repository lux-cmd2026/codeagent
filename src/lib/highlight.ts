// 轻量语法高亮：单遍扫描，覆盖常用语言的基础着色（关键字/字符串/注释/数字/函数/类型）。
// 输出 HTML 字符串（已转义），配合 <code dangerouslySetInnerHTML> 使用。

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESC[c])
}

const KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'def', 'default', 'delete', 'do', 'elif', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'from', 'func', 'function', 'get', 'global', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'is', 'lambda', 'let', 'match', 'new', 'not',
  'null', 'or', 'and', 'package', 'pass', 'private', 'protected', 'public', 'raise', 'readonly',
  'return', 'satisfies', 'set', 'static', 'struct', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'type', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'fn', 'impl', 'pub', 'mut',
  'use', 'where', 'nil', 'None', 'True', 'False', 'end', 'then', 'elseif', 'local', 'echo',
])

const HASH_LANGS = new Set([
  'py', 'python', 'sh', 'bash', 'shell', 'zsh', 'yaml', 'yml', 'toml', 'ini', 'env', 'rb', 'ruby', 'makefile', 'dockerfile', 'conf',
])

const SPAN = (cls: string, text: string) => `<span class="syn-${cls}">${esc(text)}</span>`

export function langOf(path: string): string {
  const base = path.split('/').pop() || path
  if (base.startsWith('.env')) return 'env'
  if (base === 'Dockerfile' || base === 'Makefile') return base.toLowerCase()
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : ''
  return ext
}

export function highlight(code: string, lang: string): string {
  const l = (lang || '').toLowerCase()
  if (['md', 'markdown', 'txt', 'log'].includes(l) || lang === '') {
    return esc(code)
  }
  const hashComment = HASH_LANGS.has(l)
  const n = code.length
  const out: string[] = []
  let i = 0

  while (i < n) {
    const c = code[i]

    // 空白
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      out.push(c)
      i++
      continue
    }

    // 行注释
    if (c === '/' && code[i + 1] === '/') {
      let j = code.indexOf('\n', i)
      if (j === -1) j = n
      out.push(SPAN('com', code.slice(i, j)))
      i = j
      continue
    }
    if (hashComment && c === '#') {
      let j = code.indexOf('\n', i)
      if (j === -1) j = n
      out.push(SPAN('com', code.slice(i, j)))
      i = j
      continue
    }
    // 块注释
    if (c === '/' && code[i + 1] === '*') {
      const j = code.indexOf('*/', i + 2)
      const end = j === -1 ? n : j + 2
      out.push(SPAN('com', code.slice(i, end)))
      i = end
      continue
    }
    if (c === '<' && code.slice(i, i + 4) === '<!--') {
      const j = code.indexOf('-->', i)
      const end = j === -1 ? n : j + 3
      out.push(SPAN('com', code.slice(i, end)))
      i = end
      continue
    }

    // 字符串（含转义）
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (code[j] === '\\') j += 2
        else if (code[j] === c) {
          j++
          break
        } else if (c !== '`' && code[j] === '\n') break
        else j++
      }
      out.push(SPAN('str', code.slice(i, Math.min(j, n))))
      i = Math.min(j, n)
      continue
    }

    // 数字
    if (/[0-9]/.test(c) && !/[A-Za-z0-9_$]/.test(code[i - 1] || '')) {
      const m = /^(0[xXbBoO][0-9a-fA-F_]+|[0-9][0-9_]*(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(code.slice(i))
      const text = m ? m[0] : c
      out.push(SPAN('num', text))
      i += text.length
      continue
    }

    // 标识符 / 关键字
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(code.slice(i))!
      const word = m[0]
      const next = code[i + word.length]
      if (KEYWORDS.has(word)) out.push(SPAN('key', word))
      else if (next === '(') out.push(SPAN('fn', word))
      else if (/^[A-Z]/.test(word)) out.push(SPAN('type', word))
      else out.push(SPAN('var', word))
      i += word.length
      continue
    }

    // HTML/XML 标签名
    if (c === '<' && /[a-zA-Z/!]/.test(code[i + 1] || '')) {
      const m = /^<\/?[a-zA-Z][\w:-]*/.exec(code.slice(i))
      if (m) {
        out.push(SPAN('punc', m[0].startsWith('</') ? '</' : '<'))
        out.push(SPAN('key', m[0].replace(/^<\/?/, '')))
        i += m[0].length
        continue
      }
    }

    out.push(esc(c))
    i++
  }
  return out.join('')
}
