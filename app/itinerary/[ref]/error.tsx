'use client'

export default function ItineraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0B1F3A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/walz-logo.png" alt="Walz Travels" style={{ height: 36, marginBottom: 48, opacity: 0.85 }} />

      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 24,
          padding: '48px 40px',
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#C9A84C', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          Something Went Wrong
        </p>
        <h1
          style={{
            color: '#fff',
            fontSize: 28,
            fontWeight: 700,
            fontFamily: '"Playfair Display", Georgia, serif',
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Unable to load your itinerary
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.65, marginBottom: 36 }}>
          A temporary error occurred while loading your trip details. Please try again, or contact Walz Travels and we&apos;ll resend your link.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={reset}
            style={{
              background: '#C9A84C',
              color: '#0B1F3A',
              fontWeight: 700,
              fontSize: 15,
              padding: '14px 24px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Try Again
          </button>
          <a
            href={`https://wa.me/12317902336?text=${encodeURIComponent('Hi Walz Travels, I am having trouble viewing my itinerary.')}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              padding: '12px 24px',
              borderRadius: 14,
              textDecoration: 'none',
            }}
          >
            Contact Us on WhatsApp
          </a>
        </div>
      </div>
    </main>
  )
}
