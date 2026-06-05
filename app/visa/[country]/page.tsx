import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Check, Clock, DollarSign, FileText, AlertCircle, Phone, Mail } from 'lucide-react'
import type { Metadata } from 'next'

interface VisaType {
  type: string
  fee: number
  processingTime: string
}

interface CountryVisaData {
  name: string
  flag: string
  description: string
  visaTypes: VisaType[]
  requirements: string[]
  importantNotes: string[]
  processingNotes: string
}

const visaData: Record<string, CountryVisaData> = {
  uae: {
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    description: 'The UAE is one of the most popular destinations for British travellers, offering world-class shopping, dining, and attractions in Dubai and Abu Dhabi. Visa requirements depend on your nationality.',
    visaTypes: [
      { type: 'Tourist Visa (30 days)', fee: 85, processingTime: '3–5 business days' },
      { type: 'Tourist Visa (90 days)', fee: 165, processingTime: '5–7 business days' },
      { type: 'Business Visa (30 days)', fee: 145, processingTime: '5–7 business days' },
      { type: 'Transit Visa (48 hours)', fee: 45, processingTime: '1–2 business days' },
    ],
    requirements: [
      'Valid passport with at least 6 months validity',
      'Confirmed return flight ticket',
      'Hotel booking confirmation',
      'Bank statement showing sufficient funds (last 3 months)',
      '2 passport-size photographs (white background)',
      'Comprehensive travel insurance',
      'Completed visa application form',
    ],
    importantNotes: [
      'British passport holders can obtain a free 30-day visa on arrival',
      'Visa can be extended once for an additional 30 days',
      'Dress codes apply in public areas — pack modestly',
      'Alcohol is only permitted in licensed venues',
    ],
    processingNotes: 'Applications should be submitted at least 2 weeks before travel to allow processing time.',
  },
  usa: {
    name: 'United States of America',
    flag: '🇺🇸',
    description: 'The USA offers an incredible variety of experiences, from New York City\'s iconic skyline to the beaches of Florida and the National Parks of the West. Visa requirements vary based on your nationality and travel purpose.',
    visaTypes: [
      { type: 'ESTA (Visa Waiver Program)', fee: 21, processingTime: '72 hours (usually faster)' },
      { type: 'B-1/B-2 Tourist/Business Visa', fee: 185, processingTime: '15–30 business days' },
      { type: 'Transit Visa (C)', fee: 185, processingTime: '10–15 business days' },
    ],
    requirements: [
      'Valid passport (at least 6 months beyond travel dates)',
      'Completed DS-160 application form',
      'US visa photograph (2×2 inches)',
      'Bank statements (last 6 months)',
      'Employment letter and pay slips',
      'Proof of strong ties to home country',
      'Travel itinerary and hotel bookings',
      'Evidence of return travel',
      'Interview at US Embassy/Consulate (for B-1/B-2)',
    ],
    importantNotes: [
      'Most British citizens can use ESTA (check eligibility at esta.cbp.dhs.gov)',
      'ESTA is valid for 2 years or until passport expires',
      'ESTA allows stays of up to 90 days',
      'Criminal record or previous visa refusals may affect eligibility',
    ],
    processingNotes: 'US Embassy appointments can be limited. Book as early as possible — ideally 3–6 months before travel.',
  },
  canada: {
    name: 'Canada',
    flag: '🇨🇦',
    description: 'Canada is a vast and beautiful country with stunning natural landscapes, vibrant multicultural cities, and world-renowned hospitality. Entry requirements depend on how you\'re travelling.',
    visaTypes: [
      { type: 'eTA (Electronic Travel Authorization)', fee: 7, processingTime: '72 hours (often minutes)' },
      { type: 'Visitor Visa (Temporary Resident Visa)', fee: 100, processingTime: '10–20 business days' },
      { type: 'Super Visa (Parents & Grandparents)', fee: 100, processingTime: '4–8 weeks' },
    ],
    requirements: [
      'Valid passport',
      'IMM 5257 (Visitor Visa) or online eTA application',
      'Recent photographs (35mm × 45mm)',
      'Proof of financial support',
      'Ties to home country (employment, family, property)',
      'Travel itinerary',
      'Letter of invitation (if applicable)',
      'Medical examination (if required)',
    ],
    importantNotes: [
      'British passport holders travelling by air only need an eTA',
      'eTA is linked electronically to your passport',
      'eTA is valid for 5 years or until passport expires',
      'Land or sea travel requires a Visitor Visa',
    ],
    processingNotes: 'Apply for your eTA or visa well in advance. Processing can take longer during peak periods.',
  },
  schengen: {
    name: 'Schengen Area',
    flag: '🇪🇺',
    description: 'The Schengen Area comprises 27 European countries that have abolished passport and border controls at their mutual borders. A single Schengen visa allows travel across all member states.',
    visaTypes: [
      { type: 'Short-Stay Visa (Type C) — up to 90 days', fee: 90, processingTime: '10–15 business days' },
      { type: 'Long-Stay National Visa (Type D)', fee: 90, processingTime: '15–30 business days' },
      { type: 'Airport Transit Visa (Type A)', fee: 90, processingTime: '5–10 business days' },
    ],
    requirements: [
      'Valid passport (at least 3 months beyond planned departure)',
      'Completed Schengen visa application form',
      '2 recent passport-size photographs',
      'Travel insurance (minimum €30,000 coverage)',
      'Confirmed flight reservations',
      'Proof of accommodation',
      'Bank statements (last 3 months)',
      'Employment letter/payslips or proof of self-employment',
      'Proof of civil status (marriage certificate if applicable)',
    ],
    importantNotes: [
      'Apply to the embassy of your primary destination country',
      'You can stay up to 90 days within any 180-day period',
      'Travel insurance must cover the entire Schengen area',
      'Processing fee is non-refundable regardless of outcome',
    ],
    processingNotes: 'Apply no earlier than 6 months before travel and no later than 15 working days before departure.',
  },
  australia: {
    name: 'Australia',
    flag: '🇦🇺',
    description: 'Australia offers a unique blend of vibrant cities, stunning outback landscapes, and world-famous beaches. From the Sydney Opera House to the Great Barrier Reef, it\'s a destination like no other.',
    visaTypes: [
      { type: 'eVisitor (subclass 651) — UK passport holders', fee: 0, processingTime: '24–72 hours' },
      { type: 'Visitor Visa (subclass 600)', fee: 145, processingTime: '20–30 business days' },
      { type: 'Electronic Travel Authority (subclass 601)', fee: 20, processingTime: '24–72 hours' },
    ],
    requirements: [
      'Valid passport',
      'Online visa application via ImmiAccount',
      'Health insurance',
      'Bank statements',
      'Employment evidence',
      'Travel itinerary',
      'Character documents (police check) if required',
      'Health examination if required',
    ],
    importantNotes: [
      'UK passport holders can apply for the free eVisitor visa online',
      'Allows stays of up to 3 months per visit (12-month validity)',
      'Must declare certain items at the border',
      'Working Holiday Visa available for 18–30 year olds',
    ],
    processingNotes: 'Most British travellers receive their visa quickly via the online system. Allow extra time for complex cases.',
  },
  china: {
    name: 'China',
    flag: '🇨🇳',
    description: 'China is a land of contrasts — ancient traditions alongside futuristic cities, the Great Wall, and the Forbidden City. Experience one of the world\'s most fascinating cultures.',
    visaTypes: [
      { type: 'Tourist Visa (L)', fee: 151, processingTime: '4–5 business days' },
      { type: 'Business Visa (M)', fee: 151, processingTime: '4–5 business days' },
      { type: 'Transit Visa (G)', fee: 151, processingTime: '4–5 business days' },
      { type: 'Express Processing (+50%)', fee: 226, processingTime: '2–3 business days' },
    ],
    requirements: [
      'Valid passport (at least 6 months validity)',
      'Completed China visa application form (V.2013)',
      '1 passport-size photograph',
      'Round-trip flight tickets',
      'Hotel booking confirmation',
      'Bank statement (last 3 months)',
      'Employment letter',
      'Invitation letter (for business visa)',
    ],
    importantNotes: [
      'China introduced 15-day visa-free entry for UK passport holders (2024)',
      'Visa-free applies to ordinary passport holders — check current rules',
      'Internet access is restricted — use a VPN',
      'Mandarin or at least some Chinese phrases will be very helpful',
    ],
    processingNotes: 'Apply at the Chinese Visa Application Service Centre. Bring originals and photocopies of all documents.',
  },
}

type Props = {
  params: { country: string }
}

export async function generateStaticParams() {
  return Object.keys(visaData).map((country) => ({ country }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = visaData[params.country]
  if (!data) return {}
  return {
    title: `${data.name} Visa`,
    description: `Visa requirements, fees and processing times for ${data.name}. Expert assistance from Walz Travels.`,
  }
}

export default function VisaCountryPage({ params }: Props) {
  const data = visaData[params.country]

  if (!data) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Header */}
      <div className="bg-walz-deep-navy">
        <div className="container-walz py-10 lg:py-14">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-5xl">{data.flag}</span>
                <div>
                  <div className="text-walz-muted text-xs tracking-wider uppercase mb-1">
                    Visa Services
                  </div>
                  <h1 className="font-display text-2xl lg:text-3xl font-bold text-walz-white">
                    {data.name} Visa
                  </h1>
                </div>
              </div>
              <p className="text-walz-muted max-w-2xl text-sm leading-relaxed">
                {data.description}
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <a
                href="https://wa.me/447398753797"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold text-sm px-5 py-2.5 rounded-lg flex items-center gap-2 whitespace-nowrap"
              >
                <Phone className="w-4 h-4" />
                Apply via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="container-walz py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visa Types & Fees */}
            <div className="bg-white rounded-2xl border border-walz-border shadow-card p-6">
              <h2 className="font-display text-xl font-bold text-walz-deep-navy mb-5 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-walz-gold" />
                Visa Types & Fees
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-walz-border">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-walz-slate">Visa Type</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-walz-slate">Processing Time</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-walz-slate">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.visaTypes.map((visaType, index) => (
                      <tr
                        key={index}
                        className={index % 2 === 0 ? 'bg-walz-off-white/50' : ''}
                      >
                        <td className="py-3 px-4 text-sm text-walz-deep-navy font-medium">
                          {visaType.type}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-sm text-walz-muted">
                            <Clock className="w-3.5 h-3.5 text-walz-gold" />
                            {visaType.processingTime}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {visaType.fee === 0 ? (
                            <span className="badge-gold">Free</span>
                          ) : (
                            <span className="font-bold text-walz-gold">£{visaType.fee}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-walz-muted mt-4 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {data.processingNotes}
              </p>
            </div>

            {/* Requirements */}
            <div className="bg-white rounded-2xl border border-walz-border shadow-card p-6">
              <h2 className="font-display text-xl font-bold text-walz-deep-navy mb-5 flex items-center gap-2">
                <FileText className="w-5 h-5 text-walz-gold" />
                Required Documents
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.requirements.map((req, index) => (
                  <div key={index} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full walz-gold-gradient flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-walz-deep-navy" />
                    </div>
                    <span className="text-sm text-walz-slate">{req}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Important Notes */}
            <div className="bg-walz-deep-navy rounded-2xl p-6">
              <h2 className="font-display text-xl font-bold text-walz-white mb-5 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-walz-gold" />
                Important Notes
              </h2>
              <div className="space-y-3">
                {data.importantNotes.map((note, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-walz-gold mt-2 flex-shrink-0" />
                    <p className="text-walz-off-white/80 text-sm leading-relaxed">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Apply CTA */}
            <div className="bg-white rounded-2xl border border-walz-border shadow-card p-5">
              <h3 className="font-display text-lg font-bold text-walz-deep-navy mb-3">
                Apply with Walz Travels
              </h3>
              <p className="text-walz-muted text-sm leading-relaxed mb-5">
                Let our experienced visa specialists handle your application from start to finish.
                We ensure everything is correct before submission.
              </p>
              <div className="space-y-3">
                <a
                  href={`/visa/${params.country}/apply`}
                  className="btn-gold w-full flex items-center justify-center gap-2 text-sm rounded-lg"
                >
                  <FileText className="w-4 h-4" />
                  Start Application
                </a>
                <a
                  href="https://wa.me/447398753797"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg border-2 border-green-600 text-green-600 hover:bg-green-50 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  WhatsApp Us
                </a>
                <a
                  href="mailto:visa@walztravels.com"
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg border border-walz-border text-walz-slate hover:border-walz-gold hover:text-walz-gold transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  Email Us
                </a>
              </div>
            </div>

            {/* Why use Walz */}
            <div className="bg-walz-off-white rounded-2xl border border-walz-border p-5">
              <h3 className="font-semibold text-walz-deep-navy text-sm mb-3">
                Why use Walz Travels?
              </h3>
              <div className="space-y-2.5">
                {[
                  'Document checklist provided',
                  'Application review before submission',
                  'Embassy appointment assistance',
                  'Regular status updates',
                  'Resubmission support if required',
                ].map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-walz-gold flex-shrink-0" />
                    <span className="text-sm text-walz-slate">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Visa Destinations */}
            <div className="bg-white rounded-2xl border border-walz-border shadow-card p-5">
              <h3 className="font-semibold text-walz-deep-navy text-sm mb-3">
                Other Destinations
              </h3>
              <div className="space-y-2">
                {Object.entries(visaData)
                  .filter(([key]) => key !== params.country)
                  .slice(0, 5)
                  .map(([key, country]) => (
                    <Link
                      key={key}
                      href={`/visa/${key}`}
                      className="flex items-center gap-2 text-sm text-walz-slate hover:text-walz-gold transition-colors py-0.5"
                    >
                      <span>{country.flag}</span>
                      <span>{country.name}</span>
                    </Link>
                  ))}
              </div>
              <Link
                href="/visa"
                className="text-xs text-walz-gold hover:underline mt-3 block"
              >
                View all visa services →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
