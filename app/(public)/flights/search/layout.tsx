import type { Metadata } from 'next'

export async function generateMetadata(props: {
  params: Record<string, string>
  searchParams: Record<string, string | string[]>
}): Promise<Metadata> {
  const sp = props.searchParams
  const from = Array.isArray(sp.from) ? sp.from[0] : (sp.from ?? '')
  const to   = Array.isArray(sp.to)   ? sp.to[0]   : (sp.to   ?? '')

  const title = from && to
    ? `Flights from ${from} to ${to} | Walz Travels`
    : 'Flight Search Results | Walz Travels'

  const canonical = from && to
    ? `https://www.walztravels.com/flights/search?from=${from}&to=${to}`
    : 'https://www.walztravels.com/flights/search'

  return {
    title,
    description: `Compare live flight prices from ${from || 'your origin'} to ${to || 'your destination'} across 400+ airlines. Book with Walz Travels for the best fares and expert support.`,
    robots: { index: false, follow: true },
    alternates: { canonical },
  }
}

export default function FlightSearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
