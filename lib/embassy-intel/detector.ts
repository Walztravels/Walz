import { createHash } from 'crypto'
import prisma from '@/lib/db'
import { getAnthropic } from '@/lib/anthropic'
import { type EmbassySource } from '@/lib/embassy-intel/sources'

/**
 * Embassy change detection (INT-7).
 *
 * official source → fetch (conditional GET) → normalized extract →
 * content hash → compare with previous snapshot → deterministic change
 * detection → optional AI summary OF THE DIFF → alert with full source
 * attribution.
 *
 * Hard rules: a fetch failure NEVER creates an alert; the model only
 * summarizes actual old/new excerpts and its failure never blocks the
 * deterministic alert; policy content is never invented.
 */

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const EXTRACT_CAP = 50_000
export const SUMMARY_MODEL = 'claude-haiku-4-5-20251001'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** RSS/Atom: the change signal is the SET OF ENTRIES (guid/link + title) —
 *  immune to layout noise. Returns one line per entry. */
export function extractRssEntries(xml: string): string[] {
  const entries: string[] = []
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? []
  for (const block of blocks.slice(0, 60)) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    const link  = block.match(/<link[^>]*href="([^"]+)"/i)?.[1]
      ?? block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? ''
    const guid  = block.match(/<(guid|id)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? link
    entries.push(`${decodeEntities(guid.trim())} | ${decodeEntities(title.replace(/<[^>]+>/g, '').trim())} | ${decodeEntities(link.trim())}`)
  }
  return entries
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim()
}

/** HTML: extract the content section, strip markup, collapse whitespace.
 *  Deterministic — good enough for hash-based change detection. */
export function extractHtmlText(html: string, section?: string): string {
  let scope = html
  if (section) {
    const m = html.match(new RegExp(`<${section}[^>]*>([\\s\\S]*?)</${section}>`, 'i'))
    if (m) scope = m[1]
  }
  return scope
    .replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, EXTRACT_CAP)
}

export interface FetchOutcome {
  status: number
  extract: string | null      // null = not fetched / unchanged (304)
  etag: string | null
  lastModified: string | null
}

export async function fetchSource(
  source: EmbassySource,
  conditional?: { etag: string | null; lastModified: string | null },
): Promise<FetchOutcome> {
  const headers: Record<string, string> = {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }
  if (source.requiresBrowserUA) headers['user-agent'] = BROWSER_UA
  else headers['user-agent'] = 'WalzTravelsBot/1.0 (+https://www.walztravels.com)'
  if (conditional?.etag) headers['if-none-match'] = conditional.etag
  if (conditional?.lastModified) headers['if-modified-since'] = conditional.lastModified

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(source.url, { headers, signal: controller.signal, redirect: 'follow' })
    if (res.status === 304) {
      return { status: 304, extract: null, etag: conditional?.etag ?? null, lastModified: conditional?.lastModified ?? null }
    }
    const body = await res.text()
    const extract = source.kind === 'rss'
      ? extractRssEntries(body).join('\n').slice(0, EXTRACT_CAP)
      : extractHtmlText(body, source.section)
    return {
      status: res.status,
      extract: res.ok && extract ? extract : null,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    }
  } catch {
    return { status: 0, extract: null, etag: null, lastModified: null }
  } finally {
    clearTimeout(timer)
  }
}

/** New RSS entries relative to the previous extract (line-set diff). */
export function newRssLines(prevExtract: string | null, current: string): string[] {
  const prev = new Set((prevExtract ?? '').split('\n').filter(Boolean))
  return current.split('\n').filter(l => l && !prev.has(l))
}

const SEVERITY_KEYWORDS: Array<[RegExp, string]> = [
  [/suspend|halt|cancel|cease|pause/i, 'high'],
  [/fee|cost|price|charge|mandatory|require/i, 'medium'],
]
export function severityFor(text: string): string {
  for (const [re, sev] of SEVERITY_KEYWORDS) if (re.test(text)) return sev
  return 'low'
}

/** Summarize an ACTUAL detected diff for staff. Failure → null; the
 *  deterministic alert stands either way. */
export async function summarizeChange(input: {
  country: string; sourceUrl: string
  previous: string; current: string
}): Promise<string | null> {
  try {
    const res = await getAnthropic().messages.create({
      model: SUMMARY_MODEL, max_tokens: 350,
      messages: [{
        role: 'user',
        content: [
          `An official ${input.country.toUpperCase()} visa-related source page changed (${input.sourceUrl}).`,
          'Summarize in 2-3 sentences WHAT CHANGED between the two extracts below, for travel-agency staff.',
          'Only describe differences actually visible between the extracts — never speculate about policy meaning that is not stated.',
          `<<<PREVIOUS>>>\n${input.previous.slice(0, 6000)}\n<<<CURRENT>>>\n${input.current.slice(0, 6000)}`,
        ].join('\n'),
      }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
    return text || null
  } catch { return null }
}

async function tryDb<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/does not exist|relation|column/i.test(msg)) return null
    throw e
  }
}

export interface SourceRunResult {
  sourceId: string
  status: number
  changed: boolean
  alertsCreated: number
}

/** Process one source end to end. */
export async function runSource(source: EmbassySource, now = new Date()): Promise<SourceRunResult> {
  const prev = await tryDb(() => prisma.embassySourceSnapshot.findFirst({
    where: { sourceId: source.id },
    orderBy: { fetchedAt: 'desc' },
  }))

  const outcome = await fetchSource(source, prev ? { etag: prev.etag, lastModified: prev.lastModified } : undefined)

  // Failure or 304: record health, NEVER create an alert.
  if (outcome.status === 304 || !outcome.extract) {
    await tryDb(() => prisma.embassySourceSnapshot.create({
      data: { sourceId: source.id, contentHash: prev?.contentHash ?? '', etag: outcome.etag,
        lastModified: outcome.lastModified, extract: null, httpStatus: outcome.status, changed: false },
    }))
    return { sourceId: source.id, status: outcome.status, changed: false, alertsCreated: 0 }
  }

  const hash = sha256(outcome.extract)
  const changed = Boolean(prev && prev.contentHash && prev.contentHash !== hash)
  const isBaseline = !prev || !prev.contentHash

  await tryDb(() => prisma.embassySourceSnapshot.create({
    data: { sourceId: source.id, contentHash: hash, etag: outcome.etag,
      lastModified: outcome.lastModified, extract: outcome.extract,
      httpStatus: outcome.status, changed },
  }))

  if (!changed || isBaseline) return { sourceId: source.id, status: outcome.status, changed: false, alertsCreated: 0 }

  // Dedupe: one alert per source per day.
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
  const already = await prisma.embassyIntelligenceFeed.findFirst({
    where: { sourceUrl: source.url, createdAt: { gte: dayStart } },
    select: { id: true },
  }).catch(() => null)
  if (already) return { sourceId: source.id, status: outcome.status, changed: true, alertsCreated: 0 }

  const affectedClients = await prisma.visaApplication.count({
    where: { destinationIso2: { in: destIso2For(source.country) }, isDraft: false,
      status: { notIn: ['approved', 'refused'] } },
  }).catch(() => 0)

  let alerts = 0
  if (source.kind === 'rss') {
    // Deterministic: each NEW entry is one alert with its own title/link.
    const fresh = newRssLines(prev?.extract ?? null, outcome.extract).slice(0, 5)
    for (const line of fresh) {
      const [, title, link] = line.split(' | ')
      await createAlert({
        source, now, affectedClients,
        title: (title || 'New official publication').slice(0, 180),
        detail: `New publication on the official source: ${title || line}`,
        sourceUrl: link || source.url,
        severity: severityFor(title ?? ''),
        previousValue: null, newValue: title ?? null,
      })
      alerts++
    }
  } else {
    const summary = await summarizeChange({
      country: source.country, sourceUrl: source.url,
      previous: prev?.extract ?? '', current: outcome.extract,
    })
    await createAlert({
      source, now, affectedClients,
      title: `Official ${source.country.toUpperCase()} source updated (${source.visaType})`,
      detail: summary
        ?? 'The monitored official page changed. Automatic summarization was unavailable — review the source directly; the previous and current extracts are stored on the snapshot.',
      sourceUrl: source.url,
      severity: severityFor(outcome.extract.slice(0, 4000)),
      previousValue: (prev?.extract ?? '').slice(0, 400) || null,
      newValue: outcome.extract.slice(0, 400),
    })
    alerts++
  }
  return { sourceId: source.id, status: outcome.status, changed: true, alertsCreated: alerts }
}

function destIso2For(country: string): string[] {
  return ({
    uk: ['gb', 'uk'], usa: ['us'], canada: ['ca'], uae: ['ae'],
    australia: ['au'], ireland: ['ie'],
    schengen: ['fr', 'de', 'nl', 'it', 'es', 'pt', 'be', 'at', 'ch', 'gr'],
  } as Record<string, string[]>)[country] ?? [country]
}

async function createAlert(opts: {
  source: EmbassySource; now: Date; affectedClients: number
  title: string; detail: string; sourceUrl: string; severity: string
  previousValue: string | null; newValue: string | null
}): Promise<void> {
  const base = {
    destination: opts.source.country,
    alertType: 'policy_update',
    severity: opts.severity,
    title: opts.title,
    detail: opts.detail,
    previousValue: opts.previousValue,
    newValue: opts.newValue,
    sourceUrl: opts.sourceUrl,
    affectedClients: opts.affectedClients,
  }
  try {
    await prisma.embassyIntelligenceFeed.create({ data: { ...base, sourceId: opts.source.id } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!/sourceId|column/i.test(msg)) throw e
    await prisma.embassyIntelligenceFeed.create({ data: base as never })   // pre-migration
  }
}
