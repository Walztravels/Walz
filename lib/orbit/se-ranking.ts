/**
 * SE Ranking REST API adapter (v4).
 *
 * API key stored in orbit_integrations where id = 'se_ranking', meta.apiKey
 * Base URL: https://api4.seranking.com/
 */

const BASE = 'https://api4.seranking.com'

async function seGet<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Token ${apiKey}` },
    next: { revalidate: 3600 }, // cache 1h — SE Ranking charges per request
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SE Ranking ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

export interface DomainOverview {
  organicTraffic: number
  organicKeywords: number
  domainScore: number
  backlinks: number
}

export interface TopKeyword {
  keyword: string
  position: number
  searchVolume: number
  url: string
  positionDelta: number | null
}

export async function getDomainOverview(
  apiKey: string,
  domain: string,
  country = 'uk',
): Promise<DomainOverview | null> {
  try {
    const data = await seGet<{
      organic_traffic?: number
      organic_keywords?: number
      domain_trust?: number
      backlinks?: number
    }>(apiKey, `/research/${country}/overview/?url=${encodeURIComponent(domain)}`)

    return {
      organicTraffic:  data.organic_traffic  ?? 0,
      organicKeywords: data.organic_keywords ?? 0,
      domainScore:     data.domain_trust     ?? 0,
      backlinks:       data.backlinks        ?? 0,
    }
  } catch {
    return null
  }
}

export async function getTopKeywords(
  apiKey: string,
  domain: string,
  limit = 20,
  country = 'uk',
): Promise<TopKeyword[]> {
  try {
    type Row = {
      keyword: string
      pos: number
      vol?: number
      url?: string
      pos_diff?: number | null
    }
    const data = await seGet<{ keywords?: Row[] }>(
      apiKey,
      `/research/${country}/keywords/?url=${encodeURIComponent(domain)}&limit=${limit}&sort=traffic_desc`,
    )

    return (data.keywords ?? []).map((k) => ({
      keyword:       k.keyword,
      position:      k.pos,
      searchVolume:  k.vol  ?? 0,
      url:           k.url  ?? '',
      positionDelta: k.pos_diff ?? null,
    }))
  } catch {
    return []
  }
}

export async function getCompetitorOverview(
  apiKey: string,
  domain: string,
  country = 'uk',
): Promise<DomainOverview & { topKeywords: TopKeyword[] } | null> {
  const [overview, keywords] = await Promise.all([
    getDomainOverview(apiKey, domain, country),
    getTopKeywords(apiKey, domain, 10, country),
  ])
  if (!overview) return null
  return { ...overview, topKeywords: keywords }
}
