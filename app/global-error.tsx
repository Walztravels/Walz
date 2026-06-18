'use client'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Global Error]', error)
  }, [error])

  return (
    <html>
      <body style={{
        fontFamily: 'sans-serif', background: '#F5F0E8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', margin: 0,
      }}>
        <div style={{
          background: '#fff', borderRadius: 24, padding: 40,
          maxWidth: 400, textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
        }}>
          <h2 style={{ color: '#0B1F3A', margin: '0 0 12px' }}>Critical Error</h2>
          <p style={{ color: '#666', fontSize: 14, margin: '0 0 24px' }}>
            Something went critically wrong. Please refresh the page.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#C9A84C', color: '#0B1F3A', border: 'none',
              borderRadius: 12, padding: '12px 24px', fontWeight: 700,
              cursor: 'pointer', fontSize: 14,
            }}>
            Refresh
          </button>
        </div>
      </body>
    </html>
  )
}
