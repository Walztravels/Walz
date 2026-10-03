'use client'

// components/business/BusinessShell.tsx — Walz Business (V1-A)
//
// The authenticated portal shell: desktop sidebar + top bar on large
// screens, a top bar + bottom tab bar on small screens. Applied by
// app/business/(portal)/layout.tsx to every route inside the (portal)
// route group — never to /business/login, /business/register, or
// /business/invitations/[token], which get a lighter unauthenticated
// treatment instead (see app/business/login/page.tsx).
//
// This is the visual foundation V1-B's Dashboard/Requests/Travellers/Team/
// Settings pages will be built inside, so it is deliberately NOT a copy of
// app/admin's dense, table-first visual language: a cool slate canvas, a
// single deep-navy sidebar, restrained gold used only as an accent (active
// nav indicator, wordmark), generous padding and a clear content column.

import { usePathname } from 'next/navigation'
import { BusinessSidebar } from './BusinessSidebar'
import { BusinessMobileNav } from './BusinessMobileNav'
import { OrgSwitcher, type OrgSwitcherOrg } from './OrgSwitcher'
import { AccountMenu, type AccountMenuUser } from './AccountMenu'

function currentOrgIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/business\/([^/]+)/)
  if (!match) return null
  return match[1]
}

export function BusinessShell({
  user,
  organizations,
  children,
}: {
  user: AccountMenuUser
  organizations: OrgSwitcherOrg[]
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? ''
  const orgId = currentOrgIdFromPathname(pathname)
  // Walz Business hotfix (B1.4) — `organizations` is already the caller's
  // ACTIVE-membership list (see app/business/(portal)/layout.tsx, which
  // queries it for the OrgSwitcher); reused here as-is, no new query, no
  // schema change. Zero memberships means zero workspace, so the nav must
  // not present operational destinations as though one exists.
  const hasOrganizations = organizations.length > 0

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <BusinessSidebar orgId={orgId} hasOrganizations={hasOrganizations} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="h-16 px-4 lg:px-8 flex items-center justify-between gap-3">
            {/* Wordmark shown only on small screens — the sidebar already
                carries it on desktop. */}
            <a href="/business" className="lg:hidden inline-flex items-baseline gap-1 flex-shrink-0">
              <span className="text-base font-bold tracking-tight text-[#0B1F3A]">Walz</span>
              <span className="text-base font-bold tracking-tight text-[#C9A84C]">Business</span>
            </a>

            <div className="flex-1 flex justify-start lg:justify-start min-w-0">
              <OrgSwitcher organizations={organizations} currentOrgId={orgId} />
            </div>

            <AccountMenu user={user} />
          </div>
        </header>

        <main className="flex-1 w-full">
          <div className="max-w-7xl mx-auto px-4 py-6 lg:px-10 lg:py-10 pb-24 lg:pb-10">
            {children}
          </div>
        </main>
      </div>

      <BusinessMobileNav orgId={orgId} hasOrganizations={hasOrganizations} />
    </div>
  )
}
