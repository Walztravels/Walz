'use client'

// components/business/BusinessSidebar.tsx — Walz Business (V1-A → V1-B)
// Desktop-only vertical nav (hidden below the lg breakpoint — see
// BusinessMobileNav for the small-screen equivalent).
//
// V1-B: all five destinations are now real pages —
//   Dashboard  → app/business/(portal)/[orgId]/page.tsx
//   Requests   → app/business/(portal)/[orgId]/requests/page.tsx
//   Travellers → app/business/(portal)/[orgId]/travellers/page.tsx
//   Team       → app/business/(portal)/[orgId]/team/page.tsx
//   Settings   → app/business/(portal)/[orgId]/settings/page.tsx
//
// The "Travellers" label and the REFERRAL_PARTNER hide-list below are read
// from OrgTypeContext (set by app/business/(portal)/[orgId]/layout.tsx) and
// are COSMETIC ONLY — see that context's own doc comment. The real
// REFERRAL_PARTNER deny is enforced independently, server-side, on the
// Travellers and Requests pages themselves (both call
// assertAgencyOrCorporateAccess, matching their equivalent API routes) —
// hiding the link here can never be the only thing standing between a
// REFERRAL_PARTNER member and that data.
//
// Walz Business hotfix (B1.4) — `hasOrganizations` (sourced from
// app/business/(portal)/layout.tsx's own ACTIVE-membership query, passed
// through BusinessShell — no new query, no schema change) gates the entire
// operational item list. A signed-in user with ZERO active
// OrganizationMembership rows has no workspace to navigate to; showing
// Dashboard/Requests/Travellers/Team/Settings as though they did is
// presentation-only misleading (every one of those destinations already
// independently fail-closes server-side regardless of this flag — see the
// comment above). Defaults to `true` so every existing call site/test that
// doesn't pass it (e.g. the plain /business org-picker page, which may
// still have 1+ real memberships even when no single org is selected yet —
// orgId null there is NOT the same condition as zero memberships) keeps its
// exact prior behavior.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCog,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useOrgType } from './OrgTypeContext'
import type { OrganizationType } from '@/lib/business/organization-type'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
}

function travellerLabel(orgType: OrganizationType | null): string {
  if (orgType === 'CORPORATE') return 'Employees'
  if (orgType === 'TRAVEL_AGENCY') return 'Clients'
  return 'Travellers'
}

function buildNavItems(orgId: string | null, orgType: OrganizationType | null): NavItem[] {
  const base = orgId ? `/business/${orgId}` : '/business'
  // REFERRAL_PARTNER organizations are denied both client-traveller
  // management and travel-request/booking endpoints server-side (see
  // lib/business/org-type-gate.ts) — those two nav items are hidden for
  // them entirely rather than linking to a page that will always 404.
  const hideAgencyCorporateOnly = orgType === 'REFERRAL_PARTNER'

  const items: NavItem[] = [{ label: 'Dashboard', icon: LayoutDashboard, href: base }]
  if (!hideAgencyCorporateOnly) {
    items.push({ label: 'Requests', icon: ClipboardList, href: `${base}/requests` })
    items.push({ label: travellerLabel(orgType), icon: Users, href: `${base}/travellers` })
  }
  items.push({ label: 'Team', icon: UserCog, href: `${base}/team` })
  items.push({ label: 'Settings', icon: Settings, href: `${base}/settings` })
  return items
}

export function BusinessSidebar({
  orgId,
  hasOrganizations = true,
}: {
  orgId: string | null
  hasOrganizations?: boolean
}) {
  const pathname = usePathname() ?? ''
  const orgType = useOrgType()
  const items = buildNavItems(orgId, orgType)

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:flex-shrink-0 bg-[#0B1F3A] text-white min-h-screen sticky top-0">
      <div className="px-6 pt-7 pb-6 border-b border-white/10">
        <Link href="/business" className="inline-flex items-baseline gap-1.5">
          <span className="text-xl font-bold tracking-tight text-white">Walz</span>
          <span className="text-xl font-bold tracking-tight text-[#C9A84C]">Business</span>
        </Link>
        <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-white/40 font-medium">
          Travel management
        </p>
      </div>

      {!hasOrganizations ? (
        <nav aria-label="Business portal navigation" className="flex-1 px-3 py-5">
          <div className="px-3 py-3 text-sm text-white/60 leading-relaxed">
            You&apos;re not a member of any organization yet. Sign out from the menu above, or open a valid
            invitation link to join one.
          </div>
        </nav>
      ) : (
      <nav aria-label="Business portal navigation" className="flex-1 px-3 py-5 space-y-0.5">
        {items.map(item => {
          const isActive = item.href === base(orgId)
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                isActive
                  ? 'bg-white/10 text-white border-[#C9A84C]'
                  : 'text-white/60 border-transparent hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      )}

      <div className="px-6 py-5 border-t border-white/10">
        <p className="text-[11px] text-white/30 leading-relaxed">
          Walz Business &middot; {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  )
}

function base(orgId: string | null) {
  return orgId ? `/business/${orgId}` : '/business'
}
