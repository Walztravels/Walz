// app/business/visa-link/[token]/page.tsx — Walz Business (V1-C Phase 2,
// Slice A) — public landing page for a BusinessServiceLinkToken recipient.
// This is the EXACT URL shape the Phase 1 issuance route generates
// (${BASE_URL}/business/visa-link/${token} — see
// app/api/business/organizations/[id]/requests/[requestId]/services/
// [serviceId]/visa-link/route.ts's header, which this file does not
// modify).
//
// Mirrors app/business/claim/[token]/page.tsx's precedent exactly: this
// page does NO database lookup on GET — no Prisma import at all. A mere
// page load (including an email-scanner prefetch) can never consume the
// token, reveal whether it exists, or distinguish any failure mode,
// because this component does nothing with the token except pass the
// string through to a client component. ALL validation happens behind
// GET /api/business/link/[token]/preview (see that route's header for the
// read-only, zero-write, non-enumerating discipline), called client-side
// by VisaLinkForm.
//
// SLICE A SCOPE: renders only the "valid link" preview state — NOT the
// actual visa document submission form, which is a later slice. See
// VisaLinkForm's own header.
//
// CONSUMER CHROME / JADE WIDGET: because this path is under /business/**,
// both components/common/PublicShell.tsx (pathname.startsWith('/business/'))
// and components/common/JadeChatWidgetLazy.tsx (same check,
// independently, since it renders as a layout sibling of PublicShell, not
// a child) already suppress themselves with ZERO code change required —
// confirmed by reading both files before writing this one; neither file
// is touched by this slice.
//
// REFERRER-POLICY — DISCLOSED LIMITATION: the brief asks for a
// route-specific `Referrer-Policy: no-referrer` on this page. Next.js
// 14's App Router gives a Server Component page.tsx no mechanism to set
// its own response headers (only a Route Handler — route.ts — can return
// a NextResponse with custom headers; a page cannot). The only ways to
// add a header here would be (a) a next.config.mjs `headers()` entry, or
// (b) middleware.ts — and this slice's brief explicitly requires
// middleware.ts's matcher to stay untouched (it currently does not cover
// /business/** at all) and treats next.config.mjs as global config not to
// be weakened or altered. Rather than force either, this page inherits
// only the SITE-WIDE Referrer-Policy already set in next.config.mjs
// (`strict-origin-when-cross-origin`) — disclosed here, not silently
// dropped. See the implementation report for the full writeup.
//
// NO third-party script or analytics tag is added anywhere on this page.

import type { Metadata } from 'next'
import { privateMetadata } from '@/lib/seo'
import VisaLinkForm from './VisaLinkForm'

export const dynamic = 'force-dynamic'

// noindex, nofollow, noarchive, nosnippet — the fuller PRIVATE_ROBOTS set
// from lib/seo.ts (not the minimal inline `{ index: false, follow: false }`
// object app/business/claim/[token]/page.tsx uses), as the brief asks for
// explicitly. Title carries no name, organization, or token.
export const metadata: Metadata = privateMetadata(
  'Visa document link',
  'This page is personal to its recipient and is not publicly listed.',
)

export default function VisaLinkPage({ params }: { params: { token: string } }) {
  // Same defensive truncation as app/business/claim/[token]/page.tsx —
  // real tokens are a fixed 64 lowercase hex chars; this is just a sane
  // upper bound before the string is handed to the client component.
  const token = typeof params.token === 'string' ? params.token.slice(0, 128) : ''

  return (
    <div style={{ minHeight: '100vh', background: '#F7F7F5', padding: '24px 16px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 560, margin: '48px auto' }}>
        <VisaLinkForm token={token} />
      </div>
    </div>
  )
}
