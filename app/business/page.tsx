// app/business/page.tsx — Walz Business (Release 1) portal shell.
// Session-gated. Lists the organizations the caller belongs to (ACTIVE
// membership rows only), or an empty state if none. Deliberately minimal —
// a working, secure shell, not a polished product.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function BusinessPortalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/business')

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: session.user.id, status: 'ACTIVE' },
    include: { organization: { select: { id: true, legalName: true, tradingName: true, status: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Walz Business</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>Organizations you belong to.</p>

      {memberships.length === 0 ? (
        <p style={{ color: '#666' }}>
          You are not a member of any organization yet. Ask your organization&apos;s admin to invite you.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memberships.map(m => (
            <li key={m.id}>
              <Link
                href={`/business/${m.organization.id}`}
                style={{
                  display: 'block', padding: 16, border: '1px solid #ddd', borderRadius: 8,
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600 }}>{m.organization.tradingName ?? m.organization.legalName}</div>
                <div style={{ color: '#666', fontSize: 13 }}>Your role: {m.role}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
