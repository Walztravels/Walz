import Link from 'next/link'
import { FileText, Clock, Check, Phone, Star } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Visa Services',
  description: 'Expert visa assistance for over 50 countries. Let our specialists handle your application.',
}

const visaServices = [
  {
    country: 'United Arab Emirates',
    code: 'uae',
    flag: '🇦🇪',
    processingTime: '3–5 days',
    fromFee: 85,
    description: 'Tourist, business and transit visas for Dubai, Abu Dhabi and beyond.',
    popular: true,
  },
  {
    country: 'United States of America',
    code: 'usa',
    flag: '🇺🇸',
    processingTime: '15–30 days',
    fromFee: 185,
    description: 'B-1/B-2 visitor visas and ESTA applications for the USA.',
    popular: true,
  },
  {
    country: 'Canada',
    code: 'canada',
    flag: '🇨🇦',
    processingTime: '10–20 days',
    fromFee: 100,
    description: 'Visitor visas and eTA applications for Canadian travel.',
    popular: true,
  },
  {
    country: 'Schengen Area',
    code: 'schengen',
    flag: '🇪🇺',
    processingTime: '10–15 days',
    fromFee: 90,
    description: 'Single visa for 27 European countries including France, Germany, Italy and Spain.',
    popular: true,
  },
  {
    country: 'Australia',
    code: 'australia',
    flag: '🇦🇺',
    processingTime: '20–30 days',
    fromFee: 145,
    description: 'Visitor visas and eVisitor applications for Australian travel.',
    popular: true,
  },
  {
    country: 'China',
    code: 'china',
    flag: '🇨🇳',
    processingTime: '4–5 days',
    fromFee: 151,
    description: 'Tourist and business visas for mainland China.',
    popular: true,
  },
]

const whyUs = [
  { title: 'Document Checklist', desc: 'We provide a complete tailored checklist for your application.' },
  { title: 'Pre-Submission Review', desc: 'Our experts review every document before submission.' },
  { title: 'Embassy Liaison', desc: 'We communicate with embassies on your behalf when needed.' },
  { title: 'Regular Updates', desc: 'You receive regular status updates throughout the process.' },
  { title: 'Resubmission Support', desc: 'If your application needs resubmission, we guide you through it.' },
  { title: '95% Approval Rate', desc: 'Our expertise gives your application the best chance of success.' },
]

export default function VisaPage() {
  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Hero */}
      <div className="bg-walz-deep-navy py-14 lg:py-20">
        <div className="container-walz text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-walz-gold/10 border border-walz-gold/30 mb-5">
            <FileText className="w-4 h-4 text-walz-gold" />
            <span className="text-walz-gold text-sm font-medium">Visa Assistance</span>
          </div>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-walz-white mb-4">
            Expert Visa Services
          </h1>
          <p className="text-walz-muted max-w-2xl mx-auto text-lg leading-relaxed mb-8">
            Navigating visa applications can be stressful. Our specialist team handles everything
            from document preparation to submission — giving you peace of mind and the best
            chance of approval.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 bg-walz-slate/50 rounded-full px-4 py-2">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-walz-white text-sm">95% Approval Rate</span>
            </div>
            <div className="flex items-center gap-2 bg-walz-slate/50 rounded-full px-4 py-2">
              <Clock className="w-4 h-4 text-walz-gold" />
              <span className="text-walz-white text-sm">Fast Processing</span>
            </div>
            <div className="flex items-center gap-2 bg-walz-slate/50 rounded-full px-4 py-2">
              <Check className="w-4 h-4 text-walz-success" />
              <span className="text-walz-white text-sm">50+ Countries</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visa Services Grid */}
      <div className="container-walz py-12 lg:py-16">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy mb-3">
            Popular Destinations
          </h2>
          <div className="divider-gold mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visaServices.map((service) => (
            <Link
              key={service.code}
              href={`/visa/${service.code}`}
              className="card-luxury p-5 group"
            >
              <div className="flex items-start gap-4">
                <span className="text-4xl flex-shrink-0">{service.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-display text-lg font-bold text-walz-deep-navy leading-tight">
                      {service.country}
                    </h3>
                    {service.popular && (
                      <span className="badge-gold text-[10px] flex-shrink-0">Popular</span>
                    )}
                  </div>
                  <p className="text-walz-muted text-sm leading-relaxed mb-3">
                    {service.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-walz-muted">
                      <Clock className="w-3.5 h-3.5 text-walz-gold" />
                      <span>{service.processingTime}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-walz-muted">from </span>
                      <span className="font-bold text-walz-gold">£{service.fromFee}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-walz-gold text-sm font-medium group-hover:gap-2 flex items-center gap-1 transition-all">
                View requirements
                <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Why Use Walz */}
      <div className="bg-white py-12 lg:py-16">
        <div className="container-walz">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl lg:text-3xl font-bold text-walz-deep-navy mb-3">
              Why Our Visa Service?
            </h2>
            <p className="text-walz-muted max-w-xl mx-auto text-sm">
              We&apos;ve helped thousands of travellers secure their visas. Here&apos;s what you get with Walz Travels.
            </p>
            <div className="divider-gold mx-auto mt-4" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {whyUs.map(({ title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-4 rounded-xl bg-walz-off-white border border-walz-border">
                <div className="w-8 h-8 rounded-lg walz-gold-gradient flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-walz-deep-navy" />
                </div>
                <div>
                  <h4 className="font-semibold text-walz-deep-navy text-sm">{title}</h4>
                  <p className="text-walz-muted text-xs mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-walz-deep-navy py-12">
        <div className="container-walz text-center">
          <h2 className="font-display text-2xl font-bold text-walz-white mb-3">
            Need Visa Assistance?
          </h2>
          <p className="text-walz-muted mb-6 max-w-lg mx-auto text-sm">
            Our visa specialists are available via WhatsApp, email and phone.
            Contact us today for a free consultation.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold inline-flex items-center gap-2 text-sm"
            >
              <Phone className="w-4 h-4" />
              WhatsApp Us
            </a>
            <a
              href="mailto:visa@walztravels.com"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-walz-gold/40 text-walz-gold hover:bg-walz-gold/10 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              Email Visa Team
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
