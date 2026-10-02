'use client'

// components/business/OrgTypeContext.tsx — Walz Business (V1-B)
//
// COSMETIC ONLY. Makes the current organization's `organizationType`
// available to BusinessSidebar/BusinessMobileNav so the nav can show the
// right "Travellers" label (Employees/Clients) and hide the
// REFERRAL_PARTNER-denied items. This context carries NO authorization
// weight whatsoever — every page that renders under this provider performs
// its own independent server-side gate (assertOrgScopedAccess /
// assertAgencyOrCorporateAccess), matching whatever the equivalent API
// route already uses. A stale, missing, or tampered context value can only
// ever make the NAV show the wrong label or an extra link that itself 404s
// when followed — it can never grant access to data.
//
// Set by app/business/(portal)/[orgId]/layout.tsx (a Server Component) via
// <OrgTypeContext.Provider value={...}>. Absent (null) outside any
// org-scoped route, e.g. the plain /business organization-picker page.

import { createContext, useContext } from 'react'
import type { OrganizationType } from '@/lib/business/organization-type'

export const OrgTypeContext = createContext<OrganizationType | null>(null)

export function useOrgType(): OrganizationType | null {
  return useContext(OrgTypeContext)
}
