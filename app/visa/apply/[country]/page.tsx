'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { getVisaConfig, SLUG_TO_ISO2 } from '@/lib/visa-config'
import { getCountryByIso2 } from '@/lib/countries'
import { VisaApplicationForm } from '@/components/VisaApplicationForm'

export default function VisaApplyPage() {
  const params        = useParams<{ country: string }>()
  const searchParams  = useSearchParams()

  const iso2         = SLUG_TO_ISO2[params.country?.toLowerCase() ?? ''] ?? params.country?.toUpperCase()
  const config       = getVisaConfig(iso2)
  const countryInfo  = getCountryByIso2(iso2)

  const adminToken   = searchParams.get('token') ?? undefined
  const initialDraft = searchParams.get('draft') ?? undefined

  const destName = config?.name ?? countryInfo?.name ?? iso2
  const destFlag = config?.flag ?? countryInfo?.flag

  return (
    <VisaApplicationForm
      destinationIso2={iso2}
      destinationName={destName}
      destinationFlag={destFlag}
      source={config ? 'apply_page' : 'unsupported_destination'}
      adminToken={adminToken}
      initialDraftId={initialDraft}
    />
  )
}
