'use client'

// components/business/BusinessMobileNav.tsx — Walz Business (V1-A → V1-B)
//
// A genuine mobile-first nav, not a squeezed version of the desktop
// sidebar: a fixed bottom tab bar (the standard mobile app-shell pattern),
// shown only below the lg breakpoint.
//
// V1-B: all destinations are real pages now — see BusinessSidebar.tsx's
// header comment for the full route list. The "Travellers" label and the
// REFERRAL_PARTNER hide-list are COSMETIC ONLY (read from OrgTypeContext —
// see that file's doc comment); the real deny is enforced independently,
// server-side, on the Travellers/Requests pages themselves.

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
  const hideAgencyCorporateOnly = orgType === 'REFERRAL_PARTNER'

  const items: NavItem[] = [{ label: 'Home', icon: LayoutDashboard, href: base }]
  if (!hideAgencyCorporateOnly) {
    items.push({ label: 'Requests', icon: ClipboardList, href: `${base}/requests` })
    items.push({ label: travellerLabel(orgType), icon: Users, href: `${base}/travellers` })
  }
  items.push({ label: 'Team', icon: UserCog, href: `${base}/team` })
  items.push({ label: 'Settings', icon: Settings, href: `${base}/settings` })
  return items
}

export function BusinessMobileNav({ orgId }: { orgId: string | null }) {
  const pathname = usePathname() ?? ''
  const orgType = useOrgType()
  const base = orgId ? `/business/${orgId}` : '/business'
  const items = buildNavItems(orgId, orgType)
  // Tailwind needs static, literal class names — grid-cols-N is chosen
  // explicitly rather than built from a template string.
  const gridColsClass = items.length === 5 ? 'grid-cols-5' : 'grid-cols-3'

  return (
    <nav
      aria-label="Business portal navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div className={`grid ${gridColsClass}`}>
        {items.map(item => {
          const isActive = item.href === base ? pathname === item.href : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#0B1F3A]' : 'text-slate-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-[#C9A84C]' : 'text-slate-400'}`} aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
