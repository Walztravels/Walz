// app/portal/rewards/page.tsx — Release 7.4: Walz Rewards Portal Page (RSC)
// Requires auth. Shows miles balance, tier, progress, and recent transactions.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const TIER_THRESHOLDS = [
  { tier: 'bronze',   min: 0,     label: 'Bronze',   next: 'Silver',   nextMin: 5000  },
  { tier: 'silver',   min: 5000,  label: 'Silver',   next: 'Gold',     nextMin: 20000 },
  { tier: 'gold',     min: 20000, label: 'Gold',     next: 'Platinum', nextMin: 50000 },
  { tier: 'platinum', min: 50000, label: 'Platinum', next: null,       nextMin: null  },
] as const

function getTierInfo(lifetimeMiles: number) {
  let current: typeof TIER_THRESHOLDS[number] = TIER_THRESHOLDS[0]
  for (const t of TIER_THRESHOLDS) {
    if (lifetimeMiles >= t.min) current = t
  }
  const progress = current.nextMin
    ? Math.min(100, Math.round(((lifetimeMiles - current.min) / (current.nextMin - current.min)) * 100))
    : 100
  const milesLeft = current.nextMin ? current.nextMin - lifetimeMiles : 0
  return { ...current, progress, milesLeft }
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    bronze:   'background:#8B6914;color:#fff',
    silver:   'background:#6B7280;color:#fff',
    gold:     'background:#C9A84C;color:#0B1F3A',
    platinum: 'background:linear-gradient(135deg,#B8C4D0,#E8EFF5);color:#0B1F3A',
  }
  const style = colors[tier] ?? colors.bronze
  return (
    <span
      style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '999px', fontWeight: 700, fontSize: '13px', letterSpacing: '0.05em', textTransform: 'uppercase', ...Object.fromEntries(style.split(';').map(s => { const [k, v] = s.split(':'); return [k?.trim(), v?.trim()] }).filter(([k]) => k)) }}
    >
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  )
}

export default async function RewardsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/portal/login?callbackUrl=/portal/rewards')

  const membership = await prisma.walzRewardsMembership.findUnique({
    where: { userId: session.user.id },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  const tierInfo = membership ? getTierInfo(membership.lifetimeMiles) : null

  return (
    <div style={{ minHeight: '100vh', background: '#060e1c', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/portal/dashboard" style={{ color: '#C9A84C', textDecoration: 'none', fontSize: '14px' }}>
            ← Dashboard
          </Link>
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
          Walz Rewards
        </h1>
        <p style={{ color: '#8B9BAE', marginBottom: '32px', fontSize: '14px' }}>
          Earn miles on every confirmed booking and unlock exclusive benefits.
        </p>

        {!membership ? (
          /* ── Not enrolled ─────────────────────────────────────────────── */
          <div style={{ background: '#0B1F3A', borderRadius: '16px', padding: '36px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✈️</div>
            <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
              Join Walz Rewards
            </h2>
            <p style={{ color: '#8B9BAE', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
              Earn miles on every confirmed booking. Redeem them for travel discounts, upgrades, and more.
            </p>
            <form action="/api/rewards/membership" method="POST">
              <button
                type="submit"
                style={{
                  background: 'linear-gradient(135deg,#C9A84C,#E8C97A)',
                  color: '#0B1F3A',
                  fontWeight: 700,
                  padding: '14px 32px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                Enroll Now — It&apos;s Free
              </button>
            </form>
          </div>
        ) : (
          /* ── Enrolled ─────────────────────────────────────────────────── */
          <>
            {/* Miles & Tier card */}
            <div style={{ background: '#0B1F3A', borderRadius: '16px', padding: '28px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <p style={{ color: '#8B9BAE', fontSize: '13px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Miles Balance
                  </p>
                  <p style={{ fontSize: '42px', fontWeight: 800, color: '#C9A84C', margin: 0, lineHeight: 1 }}>
                    {membership.milesBalance.toLocaleString()}
                  </p>
                  <p style={{ color: '#8B9BAE', fontSize: '12px', marginTop: '4px' }}>
                    {membership.lifetimeMiles.toLocaleString()} lifetime miles
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: '#8B9BAE', fontSize: '13px', marginBottom: '8px' }}>Tier</p>
                  <span style={{
                    display: 'inline-block', padding: '5px 16px', borderRadius: '999px',
                    fontWeight: 700, fontSize: '13px', letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    background: membership.tier === 'gold' || membership.tier === 'platinum' ? '#C9A84C' : membership.tier === 'silver' ? '#6B7280' : '#8B6914',
                    color: membership.tier === 'gold' || membership.tier === 'platinum' ? '#0B1F3A' : '#fff',
                  }}>
                    {membership.tier}
                  </span>
                </div>
              </div>

              {/* Progress to next tier */}
              {tierInfo && tierInfo.next && (
                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#8B9BAE' }}>
                      {tierInfo.milesLeft.toLocaleString()} miles to {tierInfo.next}
                    </span>
                    <span style={{ fontSize: '12px', color: '#C9A84C' }}>{tierInfo.progress}%</span>
                  </div>
                  <div style={{ background: '#162847', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                    <div style={{
                      background: 'linear-gradient(90deg,#C9A84C,#E8C97A)',
                      height: '100%',
                      width: `${tierInfo.progress}%`,
                      borderRadius: '999px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {tierInfo && !tierInfo.next && (
                <p style={{ marginTop: '16px', fontSize: '13px', color: '#C9A84C', fontWeight: 600 }}>
                  🏆 You have reached Platinum — the highest tier.
                </p>
              )}
            </div>

            {/* Recent Transactions */}
            <div style={{ background: '#0B1F3A', borderRadius: '16px', padding: '28px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '20px' }}>
                Recent Activity
              </h2>
              {membership.transactions.length === 0 ? (
                <p style={{ color: '#8B9BAE', fontSize: '14px' }}>No transactions yet. Earn miles on your next confirmed booking.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {membership.transactions.map(tx => (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 16px', background: '#0a1a30', borderRadius: '10px',
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', color: '#e2e8f0', fontWeight: 500 }}>
                          {tx.description ?? tx.type}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8B9BAE' }}>
                          {new Date(tx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span style={{
                        fontWeight: 700,
                        fontSize: '15px',
                        color: tx.miles >= 0 ? '#C9A84C' : '#f87171',
                      }}>
                        {tx.miles >= 0 ? '+' : ''}{tx.miles.toLocaleString()} mi
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
