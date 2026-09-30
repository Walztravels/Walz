// app/business/claim/[token]/page.tsx — Walz Business (Release 2)
// Public landing page for a BusinessTraveller account-claim link.
//
// Deliberately does NO database lookup on GET: rendering this page reveals
// nothing about whether the token exists, is expired, or which organization
// it belongs to (no enumeration oracle), and a GET can never consume the
// token (email link scanners / prefetch are harmless). Consumption happens
// only when the signed-in user presses "Confirm", which POSTs to
// /api/business/claim — see lib/business/claim.ts for the one-time CAS.
// A static segment ('claim') takes precedence over the sibling [orgId]
// dynamic route in the Next.js app router.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import ClaimConfirm from './ClaimConfirm'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Confirm traveller profile', robots: { index: false, follow: false } }

export default async function BusinessClaimPage({ params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions)
  const token = typeof params.token === 'string' ? params.token.slice(0, 128) : ''
  const callbackUrl = `/business/claim/${encodeURIComponent(token)}`

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '48px auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Confirm your traveller profile</h1>
      <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.6 }}>
        An organization using Walz Business has added you as a traveller. Confirming links that traveller
        profile to your Walz account so you can see trips arranged for you. You must be signed in with the
        account registered to the email address this link was sent to.
      </p>

      {session?.user?.id ? (
        <>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
            Signed in as <strong>{session.user.email ?? 'your account'}</strong>.
          </p>
          <ClaimConfirm token={token} />
        </>
      ) : (
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, background: '#0B1F3A', color: '#fff', textDecoration: 'none', fontWeight: 600 }}
        >
          Sign in to continue
        </Link>
      )}
    </div>
  )
}
