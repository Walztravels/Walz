'use client'

// components/business/BusinessMobileNav.tsx — Walz Business (V1-A)
//
// A genuine mobile-first nav, not a squeezed version of the desktop
// sidebar: a fixed bottom tab bar (the standard mobile app-shell pattern),
// shown only below the lg breakpoint. Covers the same five placeholder
// destinations as BusinessSidebar — see that file's SCOPE note.

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

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
}

function buildNavItems(orgId: string | null): NavItem[] {
  const base = orgId ? `/business/${orgId}` : '/business'
  return [
    { label: 'Home', icon: LayoutDashboard, href: base },
    { label: 'Requests', icon: ClipboardList, href: `${base}/requests` },
    { label: 'Travellers', icon: Users, href: `${base}/travellers` },
    { label: 'Team', icon: UserCog, href: `${base}/team` },
    { label: 'Settings', icon: Settings, href: `${base}/settings` },
  ]
}

export function BusinessMobileNav({ orgId }: { orgId: string | null }) {
  const pathname = usePathname() ?? ''
  const base = orgId ? `/business/${orgId}` : '/business'
  const items = buildNavItems(orgId)

  return (
    <nav
      aria-label="Business portal navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5">
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
