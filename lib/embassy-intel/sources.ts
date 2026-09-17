/**
 * Official-source registry for the Embassy Intelligence Feed (INT-7).
 *
 * Every entry is an OFFICIAL government/embassy source, verified fetchable
 * on 2026-09-16. Sources that block datacenter traffic are kept with
 * enabled:false and a reason — never scraped through workarounds, and no
 * alert is ever fabricated for them. Checked in as code so changes go
 * through review, not runtime config.
 */

export interface EmbassySource {
  id: string
  country: string            // matches EmbassyIntelligenceFeed.destination values
  visaType: string           // 'all' | 'visitor' | …
  url: string
  kind: 'rss' | 'html'
  /** html only: extract this region before hashing (e.g. 'main'). */
  section?: string
  requiresBrowserUA: boolean
  enabled: boolean
  note?: string
}

export const EMBASSY_SOURCES: EmbassySource[] = [
  // ── UK ──
  { id: 'uk-ukvi-atom', country: 'uk', visaType: 'all',
    url: 'https://www.gov.uk/government/organisations/uk-visas-and-immigration.atom',
    kind: 'rss', requiresBrowserUA: false, enabled: true,
    note: 'Every UKVI publication/guidance change.' },
  { id: 'uk-standard-visitor', country: 'uk', visaType: 'visitor',
    url: 'https://www.gov.uk/standard-visitor',
    kind: 'html', section: 'main', requiresBrowserUA: false, enabled: true },
  // ── USA ──
  { id: 'usa-embassy-ng-visas', country: 'usa', visaType: 'all',
    url: 'https://ng.usembassy.gov/category/visas/feed/',
    kind: 'rss', requiresBrowserUA: true, enabled: true,
    note: 'US Embassy Nigeria visa notices — where Nigeria-specific changes land.' },
  { id: 'usa-embassy-gh-visas', country: 'usa', visaType: 'all',
    url: 'https://gh.usembassy.gov/category/visas/feed/',
    kind: 'rss', requiresBrowserUA: true, enabled: true },
  { id: 'usa-travel-state', country: 'usa', visaType: 'all',
    url: 'https://travel.state.gov/content/travel/en/News/visas-news.html',
    kind: 'html', requiresBrowserUA: true, enabled: false,
    note: 'Akamai blocks datacenter IPs (403 verified) — do not fetch from Vercel.' },
  // ── Canada ──
  { id: 'canada-ircc-news', country: 'canada', visaType: 'all',
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&type=newsreleases&format=atom',
    kind: 'rss', requiresBrowserUA: false, enabled: true },
  { id: 'canada-visitor-visa', country: 'canada', visaType: 'visitor',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/visitor-visa.html',
    kind: 'html', section: 'main', requiresBrowserUA: false, enabled: true },
  // ── Schengen ──
  { id: 'schengen-france-ng-embassy', country: 'schengen', visaType: 'all',
    url: 'https://ng.ambafrance.org/spip.php?page=backend',
    kind: 'rss', requiresBrowserUA: false, enabled: true,
    note: 'French Embassy Nigeria feed (SPIP backend; content-type mislabeled, parse as XML).' },
  { id: 'schengen-france-visas', country: 'schengen', visaType: 'all',
    url: 'https://france-visas.gouv.fr/en/news',
    kind: 'html', requiresBrowserUA: true, enabled: false,
    note: 'Datadome blocks datacenter IPs (403 verified).' },
  { id: 'schengen-germany-ng', country: 'schengen', visaType: 'all',
    url: 'https://abuja.diplo.de/ng-en/service/visa-einreise',
    kind: 'html', section: 'main', requiresBrowserUA: false, enabled: true },
  { id: 'schengen-netherlands', country: 'schengen', visaType: 'all',
    url: 'https://www.netherlandsworldwide.nl/visa-the-netherlands',
    kind: 'html', section: 'main', requiresBrowserUA: false, enabled: true },
  { id: 'schengen-eu-policy', country: 'schengen', visaType: 'all',
    url: 'https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en',
    kind: 'html', section: 'main', requiresBrowserUA: false, enabled: true,
    note: 'Bloc-wide changes (fees, EES/ETIAS).' },
  // ── UAE ──
  { id: 'uae-federal-portal', country: 'uae', visaType: 'all',
    url: 'https://u.ae/en/information-and-services/visa-and-emirates-id',
    kind: 'html', section: 'main', requiresBrowserUA: false, enabled: true,
    note: 'Only fetchable official UAE source (ICP/GDRFA are JS SPAs).' },
  // ── Australia ──
  { id: 'australia-homeaffairs-news', country: 'australia', visaType: 'all',
    url: 'https://immi.homeaffairs.gov.au/news-media/archive',
    kind: 'html', section: 'main', requiresBrowserUA: true, enabled: true,
    note: '1.3MB page — section extraction essential.' },
  { id: 'australia-visitor-600', country: 'australia', visaType: 'visitor',
    url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600',
    kind: 'html', section: 'main', requiresBrowserUA: true, enabled: true },
  // ── Ireland ──
  { id: 'ireland-isd-feed', country: 'ireland', visaType: 'all',
    url: 'https://www.irishimmigration.ie/feed/',
    kind: 'rss', requiresBrowserUA: false, enabled: true },
]

export const enabledSources = () => EMBASSY_SOURCES.filter(s => s.enabled)
