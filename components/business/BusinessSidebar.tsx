'use client'

// components/business/BusinessSidebar.tsx — Walz Business (V1-A)
// Desktop-only vertical nav (hidden below the lg breakpoint — see
// BusinessMobileNav for the small-screen equivalent).
//
// SCOPE: Dashboard is the only item backed by a real page in this release
// (app/business/(portal)/[orgId]/page.tsx). Requests/Travellers/Team/
// Settings are intentionally visual placeholders that link to not-yet-built
// routes (they 404) — building those destination pages is explicitly out of
// scope for V1-A (see release notes). They stay in the nav now so the
// information architecture is visible and stable for V1-B to fill in.

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
    { label: 'Dashboard', icon: LayoutDashboard, href: base },
    { label: 'Requests', icon: ClipboardList, href: `${base}/requests` },
    { label: 'Travellers', icon: Users, href: `${base}/travellers` },
    { label: 'Team', icon: UserCog, href: `${base}/team` },
    { label: 'Settings', icon: Settings, href: `${base}/settings` },
  ]
}

export function BusinessSidebar({ orgId }: { orgId: string | null }) {
  const pathname = usePathname() ?? ''
  const items = buildNavItems(orgId)

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
