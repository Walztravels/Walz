'use client'

import Link from 'next/link'
import { FileText, Check, ArrowRight, MessageCircle } from 'lucide-react'

const visaDestinations = [
  { name: 'United Kingdom', code: 'uk', flag: '🇬🇧', processingTime: '3-4 weeks', from: '$188' },
  { name: 'Canada', code: 'canada', flag: '🇨🇦', processingTime: '8-12 weeks', from: '$281' },
  { name: 'United Arab Emirates', code: 'uae', flag: '🇦🇪', processingTime: '3-5 days', from: '$470' },
  { name: 'United States', code: 'usa', flag: '🇺🇸', processingTime: '15-30 days', from: '$185' },
  { name: 'Schengen Area', code: 'schengen', flag: '🇪🇺', processingTime: '10-15 days', from: '$90' },
  { name: 'Australia', code: 'australia', flag: '🇦🇺', processingTime: '20-30 days', from: '$145' },
]

const visaBenefits = [
  'Route-specific document guidance',
  'Expert review before submission',
  'Faster clarity on requirements',
  'Support for individuals and families',
]

export function VisaConversionSection() {
  return (
    <section className="py-20 lg:py-28 bg-white relative">
      <div className="container-walz">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center mb-4">
            <FileText className="w-4 h-4" />
            <span>Visa Services</span>
          </div>
          <h2 className="section-title text-balance mb-4">
            Visa support that helps you avoid mistakes and move faster
          </h2>
          <p className="text-walz-muted max-w-2xl mx-auto text-lg leading-relaxed">
            Our visa specialists guide you through the right documents, help reduce common errors, and support you from preparation to submission.
          </p>
        </div>

        {/* Benefits */}
        <div className="flex flex-wrap items-center justify-center gap-4 lg:gap-8 mb-12">
          {visaBenefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-2 text-sm text-walz-deep-navy">
              <div className="w-5 h-5 rounded-full bg-walz-gold/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-walz-gold" />
              </div>
              {benefit}
            </div>
          ))}
        </div>

        {/* Visa Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5 mb-8">
          {visaDestinations.map((country) => (
            <Link
              key={country.code}
              href={`/visa/${country.code}`}
              className="group card-elevated p-5 text-center hover:border-walz-gold/30"
            >
              <div className="text-4xl mb-3">{country.flag}</div>
              <div className="text-sm font-semibold text-walz-deep-navy leading-tight mb-1.5">
                {country.name}
              </div>
              <div className="text-xs text-walz-muted mb-2">{country.processingTime}</div>
              <div className="text-sm font-bold text-walz-gold">From {country.from}</div>
            </Link>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          <Link href="/visa">
            <button className="btn-gold inline-flex items-center gap-2 px-8 py-3.5 rounded-xl">
              <span>View All Visa Services</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border-2 border-walz-border text-walz-deep-navy hover:bg-walz-deep-navy hover:text-walz-white hover:border-walz-deep-navy transition-all text-sm font-semibold"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Start Visa Support</span>
          </a>
        </div>

        {/* Why Pay */}
        <div className="max-w-2xl mx-auto text-center p-6 rounded-2xl bg-walz-cream border border-walz-gold/20">
          <p className="text-walz-deep-navy text-sm leading-relaxed">
            <strong className="text-walz-gold">Why clients pay for visa support:</strong> Because one mistake can cause delays, stress, or refusal. Walz Travels helps you prepare properly.
          </p>
        </div>
      </div>
    </section>
  )
}
