import { NextResponse } from 'next/server'

const EMBED_URL =
  'https://app.trysoro.com/api/embed/2780678f-725a-44f8-9eda-6b44bd24b5e1'

export interface SoroArticle {
  id:      string
  title:   string
  slug:    string
  excerpt: string | null
  date:    string
}

export async function GET() {
  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 10_000)

    let res: Response
    try {
      res = await fetch(EMBED_URL, {
        signal: controller.signal,
        next:   { revalidate: 3600 },
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      console.error(`soro-articles: HTTP ${res.status} from embed URL`)
      return NextResponse.json({ articles: [] }, { status: 200 })
    }

    const js = await res.text()

    // Locate var SORO_ARTICLES = [ ... ]
    // Use bracket-counting instead of regex to handle nested arrays correctly.
    const varIdx = js.indexOf('SORO_ARTICLES')
    if (varIdx === -1) {
      console.error('soro-articles: SORO_ARTICLES not found in response')
      return NextResponse.json({ articles: [] }, { status: 200 })
    }

    const arrayStart = js.indexOf('[', varIdx)
    if (arrayStart === -1) {
      console.error('soro-articles: array start "[" not found after SORO_ARTICLES')
      return NextResponse.json({ articles: [] }, { status: 200 })
    }

    // Walk forward counting brackets so nested arrays don't truncate the result.
    let depth    = 0
    let arrayEnd = -1
    let inString = false
    let escape   = false
    for (let i = arrayStart; i < js.length; i++) {
      const ch = js[i]
      if (escape)                   { escape = false; continue }
      if (ch === '\\' && inString)  { escape = true;  continue }
      if (ch === '"')               { inString = !inString; continue }
      if (inString)                 continue
      if (ch === '[')               depth++
      else if (ch === ']')          { depth--; if (depth === 0) { arrayEnd = i; break } }
    }

    if (arrayEnd === -1) {
      console.error('soro-articles: could not find matching "]" for SORO_ARTICLES array')
      return NextResponse.json({ articles: [] }, { status: 200 })
    }

    const jsonStr = js.slice(arrayStart, arrayEnd + 1)
    const all: SoroArticle[] = JSON.parse(jsonStr)

    const articles = all.slice(0, 3).map(({ id, title, slug, excerpt, date }) => ({
      id, title, slug, excerpt, date,
    }))

    return NextResponse.json({ articles })
  } catch (err) {
    console.error('soro-articles error:', err)
    return NextResponse.json({ articles: [] }, { status: 200 })
  }
}
