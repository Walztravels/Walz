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
    const res = await fetch(EMBED_URL, {
      next: { revalidate: 3600 }, // re-fetch at most once per hour
    })
    if (!res.ok) throw new Error(`Soro fetch failed: ${res.status}`)

    const js = await res.text()

    // Extract the SORO_ARTICLES JSON array from the embedded script
    const match = js.match(/var SORO_ARTICLES\s*=\s*(\[[\s\S]*?\]);/)
    if (!match) return NextResponse.json({ articles: [] })

    const all: SoroArticle[] = JSON.parse(match[1])
    const articles = all.slice(0, 3).map(({ id, title, slug, excerpt, date }) => ({
      id, title, slug, excerpt, date,
    }))

    return NextResponse.json({ articles })
  } catch (err) {
    console.error('soro-articles error:', err)
    return NextResponse.json({ articles: [] })
  }
}
