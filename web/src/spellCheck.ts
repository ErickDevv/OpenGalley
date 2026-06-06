// @ts-ignore – typo-js has no type declarations
import Typo from 'typo-js'
import * as monaco from 'monaco-editor'

export type SpellLang = 'en' | 'es' | 'both' | 'off'

interface Checker {
  check(word: string): boolean
  suggest(word: string): string[]
}

const checkerCache = new Map<string, Checker | null>()
const inflight = new Map<string, Promise<Checker | null>>()

// word-level result cache — key: `${lang}:${word}`, value: true=ok
const wordCache = new Map<string, boolean>()

async function loadChecker(lang: 'en' | 'es'): Promise<Checker | null> {
  if (checkerCache.has(lang)) return checkerCache.get(lang)!
  if (inflight.has(lang)) return inflight.get(lang)!

  const p = (async (): Promise<Checker | null> => {
    try {
      const dictId = lang === 'en' ? 'en_US' : 'es_ES'
      const [affRes, dicRes] = await Promise.all([
        fetch(`/dictionaries/${dictId}.aff`),
        fetch(`/dictionaries/${dictId}.dic`),
      ])
      if (!affRes.ok || !dicRes.ok) { checkerCache.set(lang, null); return null }
      const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()])
      const t = new Typo(dictId, aff, dic, { platform: 'any' })
      const checker: Checker = {
        check: (w) => t.check(w),
        suggest: (w) => t.suggest(w) as string[],
      }
      checkerCache.set(lang, checker)
      return checker
    } catch {
      checkerCache.set(lang, null)
      return null
    }
  })()

  inflight.set(lang, p)
  return p
}

function checkWord(checkers: Array<{ lang: string; checker: Checker }>, word: string): boolean {
  for (const { lang, checker } of checkers) {
    const key = `${lang}:${word}`
    let ok = wordCache.get(key)
    if (ok === undefined) {
      ok = checker.check(word)
      wordCache.set(key, ok)
    }
    if (ok) return true
  }
  return false
}

// ─── LaTeX word extractor ─────────────────────────────────────────────────────

interface WordToken {
  word: string
  line: number   // 1-based
  col: number    // 1-based
}

const SKIP_WORDS = new Set([
  'tex', 'latex', 'pdf', 'pdflatex', 'xelatex', 'lualatex',
  'utf', 'ascii', 'url', 'doi', 'isbn', 'etc', 'bib',
])

const MAX_MARKERS = 200

function extractWords(text: string): WordToken[] {
  const tokens: WordToken[] = []
  const lines = text.split('\n')

  for (let li = 0; li < lines.length; li++) {
    let line = lines[li]

    const commentIdx = line.search(/(?<!\\)%/)
    if (commentIdx !== -1) line = line.slice(0, commentIdx)

    line = line.replace(/(?<!\\)\$[^$]*(?<!\\)\$/g, (m) => ' '.repeat(m.length))
    line = line.replace(/\\[a-zA-Z@*]+/g, (m) => ' '.repeat(m.length))

    const wordRe = /[a-zA-ZÀ-ÿ]{3,}/g
    let m: RegExpExecArray | null
    while ((m = wordRe.exec(line)) !== null) {
      const word = m[0]
      if (!SKIP_WORDS.has(word.toLowerCase())) {
        tokens.push({ word, line: li + 1, col: m.index + 1 })
      }
    }
  }

  return tokens
}

// ─── Public API ───────────────────────────────────────────────────────────────

let currentLang: SpellLang = (localStorage.getItem('spellLang') as SpellLang) ?? 'off'

export function getSpellLang(): SpellLang {
  return currentLang
}

export function setSpellLang(lang: SpellLang) {
  currentLang = lang
  localStorage.setItem('spellLang', lang)
  wordCache.clear()
  if (lang === 'en' || lang === 'both') loadChecker('en')
  if (lang === 'es' || lang === 'both') loadChecker('es')
}

export async function getSpellMarkers(
  text: string
): Promise<monaco.editor.IMarkerData[]> {
  if (currentLang === 'off') return []

  const tagged: Array<{ lang: string; checker: Checker }> = []
  if (currentLang === 'en' || currentLang === 'both') {
    const c = await loadChecker('en')
    if (c) tagged.push({ lang: 'en', checker: c })
  }
  if (currentLang === 'es' || currentLang === 'both') {
    const c = await loadChecker('es')
    if (c) tagged.push({ lang: 'es', checker: c })
  }
  if (tagged.length === 0) return []

  const tokens = extractWords(text)
  const markers: monaco.editor.IMarkerData[] = []

  for (const { word, line, col } of tokens) {
    if (markers.length >= MAX_MARKERS) break
    if (!checkWord(tagged, word)) {
      markers.push({
        severity: monaco.MarkerSeverity.Info,
        message: `"${word}" not in dictionary`,
        startLineNumber: line,
        endLineNumber: line,
        startColumn: col,
        endColumn: col + word.length,
      })
    }
  }

  return markers
}

export async function getSuggestionsFor(word: string): Promise<string[]> {
  if (currentLang === 'off') return []

  const langs: Array<'en' | 'es'> = []
  if (currentLang === 'en' || currentLang === 'both') langs.push('en')
  if (currentLang === 'es' || currentLang === 'both') langs.push('es')

  const seen = new Set<string>()
  const results: string[] = []

  for (const lang of langs) {
    const c = checkerCache.get(lang)
    if (!c) continue
    for (const s of c.suggest(word)) {
      if (!seen.has(s)) { seen.add(s); results.push(s) }
      if (results.length >= 6) return results
    }
  }

  return results
}
