import { ImageResponse } from 'next/og'
import { loadPublicItineraryPreview } from '@/lib/itinerary/og-loader'
import { sanitizeText } from '@/lib/itinerary/og-metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Itinerary-specific Walz fallback share card. Shows the DESTINATION only —
// never client name, reference, prices or any other itinerary data.
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  let destination = ''
  try {
    const { ref } = await params
    const preview = await loadPublicItineraryPreview(ref)
    destination = preview ? sanitizeText(preview.destination, 48) : ''
  } catch {
    destination = ''
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '0 90px', background: '#0B1F3A', color: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', width: 120, height: 8, background: '#C9A24B', marginBottom: 40 }} />
        <div style={{ display: 'flex', fontSize: 34, letterSpacing: 6, color: '#C9A24B', marginBottom: 24 }}>WALZ TRAVELS</div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, lineHeight: 1.1 }}>Walz Travels Itinerary</div>
        {destination ? (
          <div style={{ display: 'flex', fontSize: 56, marginTop: 28, color: '#E8D9AE' }}>{destination}</div>
        ) : null}
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  )
}
