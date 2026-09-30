// app/business/invitations/[token]/page.tsx — Walz Business (Release 2.1)
// Public landing page for an OrganizationInvitation link.
//
// Deliberately does NO database lookup on GET: rendering this page reveals
// nothing about whether the token exists, is expired, or which
// organization/email it belongs to (no enumeration oracle), and a GET can
// never consume the token (email link scanners / prefetch are harmless).
// Consumption happens only when the signed-in user presses "Accept", which
// POSTs to /api/business/invitations/accept — see
// lib/business/invitations.ts for the one-time CAS. Mirrors
// app/business/claim/[token]/page.tsx exactly.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import AcceptInvitation from './AcceptInvitation'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Accept invitation', robots: { index: false, follow: false } }

export default async function OrganizationInvitationPage({ params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions)
  const token = typeof params.token === 'string' ? params.token.slice(0, 128) : ''
  const callbackUrl = `/business/invitations/${encodeURIComponent(token)}`

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '48px auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Accept your Walz Business invitation</h1>
      <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.6 }}>
        You&apos;ve been invited to join an organization on Walz Business. You must be signed in with the
        account registered to the email address this invitation was sent to.
      </p>

      {session?.user?.id ? (
        <>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
            Signed in as <strong>{session.user.email ?? 'your account'}</strong>.
          </p>
          <AcceptInvitation token={token} />
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
