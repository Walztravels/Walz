'use client'

import Link from 'next/link'
import { ArrowRight, ExternalLink } from 'lucide-react'

const popularServices = [
  {
    title: 'UK Visit Visa Support',
    description: 'Document guidance and expert processing.',
    cta: 'Apply for UK Visa',
    href: '/visa/uk',
    icon: '🇬🇧',
  },
  {
    title: 'Canada Visa Assistance',
    description: 'Structured support for visitor and travel applications.',
    cta: 'Start Canada Process',
    href: '/visa/canada',
    icon: '🇨🇦',
  },
  {
    title: 'Holiday Packages',
    description: 'Flights, hotels, transfers and tours arranged in one place.',
    cta: 'Build My Package',
    href: '/tours',
    icon: '✈️',
  },
  {
    title: 'Corporate & Group Travel',
    description: 'Travel coordination for businesses, student groups, church trips and events.',
    cta: 'Get Group Quote',
    href: 'https://wa.me/447398753797',
    external: true,
    icon: '👥',
  },
]

export function HeroOffersStrip() {
  return (
    <section className="py-12 lg:py-16 bg-walz-off-white">
      <div className="container-walz">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy mb-2">
            Popular ways clients book with Walz Travels
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {popularServices.map((service) => {
            const isExternal = service.external
            const Wrapper = isExternal ? 'a' : Link
            const wrapperProps = isExternal
              ? { href: service.href, target: '_blank', rel: 'noopener noreferrer' }
              : { href: service.href }

            return (
              <Wrapper
                key={service.title}
                {...wrapperProps}
                className="group card-elevated p-6 hover:border-walz-gold/40 transition-all duration-300"
              >
                <div className="text-4xl mb-4">{service.icon}</div>
                <h3 className="font-display text-lg font-bold text-walz-deep-navy mb-2">
                  {service.title}
                </h3>
                <p className="text-walz-muted text-sm mb-4 leading-relaxed">
                  {service.description}
                </p>
                <span className="inline-flex items-center gap-1.5 text-walz-gold text-sm font-semibold group-hover:gap-2.5 transition-all">
                  {service.cta}
                  {isExternal ? (
                    <ExternalLink className="w-4 h-4" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                </span>
              </Wrapper>
            )
          })}
        </div>
      </div>
    </section>
  )
}
