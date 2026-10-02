'use client'

// app/business/visa-link/[token]/VisaLinkForm.tsx — Walz Business (V1-C
// Phase 2, Slice A) — client component for the visa-link recipient
// landing page. Fetches GET /api/business/link/[token]/preview on mount
// and renders exactly four states: loading -> valid | invalid |
// fetch-failed.
//
// SLICE A SCOPE ONLY: this component does NOT implement the actual visa
// document submission form, file upload, or any submit action, and never
// calls any consume/submission endpoint. It ends at displaying the
// "valid link" preview. A later slice builds the real form in the `valid`
// branch below.
//
// STATE DISTINCTION — deliberately narrow:
//   - `invalid`   : the API gave a clean, well-formed "no" (HTTP 404 with
//                   { ok: false }) — i.e. validateServiceLinkToken() itself
//                   said this token is not live, for ANY reason. The
//                   message is generic ("no longer available") and never
//                   hints at which of the many possible reasons applies —
//                   matching the API's own non-enumeration contract.
//   - `fetch-failed`: anything that is NOT a clean 404 — a network
//                   exception, a non-JSON body, a 5xx, or a 429
//                   (rate-limited; "slow down," not "this token is dead").
//                   This lets a real recipient tell "try reloading" apart
//                   from "this link is gone for good" WITHOUT adding any
//                   enumeration signal: a 429 and a 500 both land here
//                   indistinguishably from each other, and neither this
//                   branch nor `invalid` ever surfaces the underlying
//                   HTTP status to the user.

import { useEffect, useState } from 'react'

type PreviewState =
  | { status: 'loading' }
  | { status: 'valid'; organizationDisplayName: string; travellerFirstName: string; destinationPlaceholder: string }
  | { status: 'invalid' }
  | { status: 'fetch-failed' }

const NAVY = '#0B1F3A'
const GOLD = '#C9A84C'

export default function VisaLinkForm({ token }: { token: string }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      let res: Response
      try {
        res = await fetch(`/api/business/link/${encodeURIComponent(token)}/preview`, { cache: 'no-store' })
      } catch {
        // Network-level failure (offline, DNS, CORS, etc.) — never
        // attributable to the token itself.
        if (!cancelled) setState({ status: 'fetch-failed' })
        return
      }

      if (cancelled) return

      // A clean HTTP 404 is the API's own collapsed "this token is not
      // live, for any reason" response — the only status this component
      // treats as "invalid". Everything else that is not ok (429
      // rate-limited, 5xx, or any other unexpected status) is a
      // transport/server problem, not a verdict on the token, so it goes
      // to fetch-failed instead of being folded into "invalid".
      if (res.status === 404) {
        setState({ status: 'invalid' })
        return
      }
      if (!res.ok) {
        setState({ status: 'fetch-failed' })
        return
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        setState({ status: 'fetch-failed' })
        return
      }

      if (cancelled) return

      const b = body as {
        ok?: unknown
        organizationDisplayName?: unknown
        travellerFirstName?: unknown
        destinationPlaceholder?: unknown
      }
      if (b && b.ok === true && typeof b.organizationDisplayName === 'string' && typeof b.travellerFirstName === 'string') {
        setState({
          status: 'valid',
          organizationDisplayName: b.organizationDisplayName,
          travellerFirstName: b.travellerFirstName,
          destinationPlaceholder: typeof b.destinationPlaceholder === 'string' ? b.destinationPlaceholder : 'visa application',
        })
      } else {
        // A 200 that doesn't carry the expected success shape is an
        // unexpected-response case, not a token verdict.
        setState({ status: 'fetch-failed' })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (state.status === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: '#666' }} role="status" aria-live="polite">
        Checking your link…
      </div>
    )
  }

  if (state.status === 'invalid') {
    return (
      <div
        role="alert"
        style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>This link is no longer available</h1>
        <p style={{ color: '#666', lineHeight: 1.6, margin: 0 }}>
          It may have expired or already been used. Please contact the organization that sent it to you to request a
          new link.
        </p>
      </div>
    )
  }

  if (state.status === 'fetch-failed') {
    return (
      <div
        role="alert"
        style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 16 }}>
          We couldn&apos;t load this page right now. Please check your connection and try reloading.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '10px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // state.status === 'valid'
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div
        style={{
          display: 'inline-block',
          background: NAVY,
          color: GOLD,
          fontSize: 12,
          fontWeight: 700,
          padding: '4px 10px',
          borderRadius: 999,
          marginBottom: 16,
          letterSpacing: 0.4,
        }}
      >
        WALZ BUSINESS
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
        Hi {state.travellerFirstName}, your link is ready
      </h1>
      <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 16 }}>
        <strong>{state.organizationDisplayName}</strong> sent you this link to submit your{' '}
        {state.destinationPlaceholder.toLowerCase()} documents.
      </p>
      <div
        role="status"
        style={{ background: '#eefaf0', border: '1px solid #b7e4c0', color: '#1d5f2c', padding: 12, borderRadius: 8, fontSize: 14 }}
      >
        This link is valid. The document submission form will appear here shortly.
      </div>
    </div>
  )
}
