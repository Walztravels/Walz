import type { Metadata } from 'next'
import { visaSocialMetadata } from '@/lib/seo/visa-social'
import { SLUG_TO_ISO2, VISA_CONFIGS, SCHENGEN_MEMBERS } from '@/lib/visa-config'

function resolveCountryName(slug: string): string {
  const iso2 = SLUG_TO_ISO2[slug.toLowerCase()] ?? slug.toUpperCase()
  // Direct config entry (UK, Canada, UAE, USA, Schengen/FR, Australia, etc.)
  if (VISA_CONFIGS[iso2]?.name) return VISA_CONFIGS[iso2].name
  // Individual Schengen member (DE, IT, ES, etc.)
  if (SCHENGEN_MEMBERS[iso2]?.name) return SCHENGEN_MEMBERS[iso2].name
  // Fallback: capitalise the slug
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function generateMetadata(
  { params }: { params: { country: string } }
): Promise<Metadata> {
  const name = resolveCountryName(params.country)
  const description = `Start your ${name} visa application with Walz Travels. We handle everything end-to-end — documents, submission, and real-time tracking.`
  return {
    title: `Apply for ${name} Visa`,
    description,
    ...visaSocialMetadata({ title: `Apply for ${name} Visa — Walz Travels`, description, url: `https://www.walztravels.com/visa/apply/${params.country}` }),
    alternates: { canonical: `https://www.walztravels.com/visa/apply/${params.country}` },
  }
}

export default function VisaApplyCountryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
