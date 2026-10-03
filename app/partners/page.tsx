// app/partners/page.tsx — Walz Business (Track C: /partners → Walz Business
// integration)
//
// Public acquisition front door for prospective Walz Travels partners:
// choose a relationship type -> "Start Application" -> Walz Business
// authentication (app/business/register, unchanged) -> (Track B, later)
// company application -> verification -> Walz review -> approval -> Business
// portal. This page implements ONLY the public-facing entry point; nothing
// here creates an Organization, OrganizationMembership, or
// OrganizationInvitation row, and nothing here implies instant approval.
//
// Handoff design: each card's CTA links to the EXISTING, unchanged
// /business/register start point via buildBusinessRegisterHref() (see
// lib/business/partner-handoff.ts), which carries only a minimal,
// server-validated acquisition-context marker drawn from a closed
// allowlist — never raw user input, never company information. See that
// file's header comment for exactly what Track B still needs to add
// (reading the marker on the register page) before it has any visible
// effect there.
//
// The "Sign in to Walz Business" CTA is a literal, hardcoded link to
// /business/login — never the consumer /login page.

import type { Metadata } from 'next'
import { Check, ArrowRight, Briefcase, Building2, Users, Globe2 } from 'lucide-react'
import { BUSINESS, waLink } from '@/lib/config/business'
import { buildBusinessRegisterHref, BUSINESS_SIGN_IN_HREF } from '@/lib/business/partner-handoff'
import { TrackedLink } from './TrackedLink'

export const metadata: Metadata = {
  title: 'Partner With Walz Travels',
  description:
    'Apply to become a Walz Travels partner — travel agency, corporate account, referral partner or relocation partner — through Walz Business.',
}

const CARD_BASE =
  'bg-white rounded-2xl border border-[#E2D9CC] p-7 flex flex-col focus-within:ring-2 focus-within:ring-[#C9A84C] focus-within:ring-offset-2'

const CTA_CLASS =
  'inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-semibold text-sm rounded-xl transition-colors mt-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2'

const PARTNER_TYPES = [
  {
    key: 'TRAVEL_AGENCY' as const,
    title: 'Travel Agency',
    Icon: Briefcase,
    description:
      'Run your own client cases through Walz Travels as a trade partner, with support from a dedicated team.',
    highlights: [
      'Manage your own client requests',
      'Dedicated account support',
      'Apply to set up your own Walz Business account',
    ],
    ctaLabel: 'Start Application',
    ariaLabel: 'Start application as a Travel Agency',
  },
  {
    key: 'CORPORATE' as const,
    title: 'Corporate / Business Travel',
    Icon: Building2,
    description:
      'Manage flights, hotels, visas and travel requests for your organisation’s employees in one place.',
    highlights: [
      'Centralised travel requests for your team',
      'Priority support once approved',
      'Custom travel policies for your organisation',
    ],
    ctaLabel: 'Start Application',
    ariaLabel: 'Start application as a Corporate partner',
  },
  {
    key: 'REFERRAL_PARTNER' as const,
    title: 'Referral Partner',
    Icon: Users,
    description:
      'Refer your clients to Walz Travels and earn commission on completed bookings — no case management required.',
    highlights: [
      'Earn commission on completed referred bookings',
      'No case management required',
      'Simple, lightweight referral process',
    ],
    ctaLabel: 'Start Application',
    ariaLabel: 'Start application as a Referral Partner',
  },
  {
    key: 'RELOCATION' as const,
    title: 'Relocation Partner',
    Icon: Globe2,
    description:
      'HR teams and relocation agencies — apply to coordinate visas, flights and accommodation for employee relocations.',
    highlights: [
      'Support for bulk relocation cases',
      'Dedicated relocation coordination',
      'Organised document tracking support',
    ],
    ctaLabel: 'Start Application',
    ariaLabel: 'Start application as a Relocation Partner',
  },
]

const PROCESS_STEPS = [
  { step: '1', title: 'Apply', description: 'Choose your partnership type and start your application.' },
  { step: '2', title: 'Verify', description: 'We confirm your organisation’s details.' },
  { step: '3', title: 'Walz Review', description: 'Our team reviews every application individually.' },
  { step: '4', title: 'Get Access', description: 'Approved partners get access to the Walz Business portal.' },
]

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 lg:py-24 px-5">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">
            Walz Business Partnerships
          </p>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Partner with Walz Travels
          </h1>
          <p className="text-white/50 text-base lg:text-lg max-w-xl leading-relaxed mb-8">
            Travel agencies, corporate teams, referral partners and relocation specialists — apply to
            work with Walz Travels through Walz Business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <TrackedLink
              href="#partner-types"
              eventAction="partner_cta_click"
              eventCategory="partners_page"
              eventLabel="hero_become_a_partner"
              ariaLabel="Become a Partner — see partnership types below"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
            >
              Become a Partner <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </TrackedLink>
            <TrackedLink
              href={BUSINESS_SIGN_IN_HREF}
              eventAction="partner_cta_click"
              eventCategory="partners_page"
              eventLabel="hero_business_sign_in"
              ariaLabel="Sign in to Walz Business"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-white/20 text-white font-semibold text-sm rounded-xl hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
            >
              Sign in to Walz Business
            </TrackedLink>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 lg:py-20">

        {/* How it works */}
        <section aria-labelledby="how-it-works-heading" className="mb-16">
          <h2 id="how-it-works-heading" className="font-display text-xl lg:text-2xl font-bold text-[#0B1F3A] mb-2 text-center">
            How it works
          </h2>
          <p className="text-[#0B1F3A]/60 text-sm text-center max-w-xl mx-auto mb-10">
            Every application is reviewed individually. Submitting an application does not guarantee approval.
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PROCESS_STEPS.map(({ step, title, description }) => (
              <li key={step} className="bg-white rounded-2xl border border-[#E2D9CC] p-6 text-center">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold mb-3" aria-hidden="true">
                  {step}
                </span>
                <h3 className="font-display text-base font-bold text-[#0B1F3A] mb-1.5">{title}</h3>
                <p className="text-[#0B1F3A]/60 text-sm leading-relaxed">{description}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Partner types */}
        <section id="partner-types" aria-labelledby="partner-types-heading" className="mb-16 scroll-mt-8">
          <h2 id="partner-types-heading" className="font-display text-xl lg:text-2xl font-bold text-[#0B1F3A] mb-8 text-center">
            Choose your partnership type
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PARTNER_TYPES.map(({ key, title, Icon, description, highlights, ctaLabel, ariaLabel }) => (
              <div key={key} className={CARD_BASE}>
                <Icon className="w-7 h-7 text-[#C9A84C] mb-4" aria-hidden="true" />
                <h3 className="font-display text-lg font-bold text-[#0B1F3A] mb-3">{title}</h3>
                <p className="text-[#0B1F3A]/60 text-sm leading-relaxed mb-5">{description}</p>
                <ul className="space-y-2 flex-1 mb-6">
                  {highlights.map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[#0B1F3A]/70">
                      <Check className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <TrackedLink
                  href={buildBusinessRegisterHref(key)}
                  eventAction="partner_cta_click"
                  eventCategory="partners_page"
                  eventLabel={key}
                  ariaLabel={ariaLabel}
                  className={CTA_CLASS}
                >
                  {ctaLabel} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </TrackedLink>
              </div>
            ))}
          </div>
        </section>

        {/* Fallback / other enquiries — preserves the existing working lead path */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-white mb-3">Other Enquiries</h2>
          <p className="text-white/50 text-sm mb-8 max-w-md mx-auto">
            Don&apos;t see your partnership type above, or have a question first? Get in touch directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <TrackedLink
              href="mailto:contact@walztravels.com?subject=Partnership%20Enquiry"
              eventAction="lead_form_submit"
              eventCategory="conversion"
              eventLabel="partners_email"
              ariaLabel="Email us about a partnership enquiry"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
            >
              Email Us <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </TrackedLink>
            <TrackedLink
              href={waLink(BUSINESS.contacts.globalWhatsapp.e164)}
              external
              eventAction="whatsapp_click"
              eventCategory="engagement"
              eventLabel="partners_page"
              ariaLabel={`WhatsApp us at ${BUSINESS.contacts.globalWhatsapp.display}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border-2 border-white/20 text-white font-semibold text-sm rounded-xl hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F3A]"
            >
              WhatsApp {BUSINESS.contacts.globalWhatsapp.display}
            </TrackedLink>
          </div>
        </div>

      </div>
    </div>
  )
}
