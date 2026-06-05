'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Clock, FileText, MessageCircle, ArrowLeft, Star, Shield, Loader2, Send } from 'lucide-react'

const included = [
  'Document checklist tailored to your situation',
  'Expert review of all submitted documents',
  'Application form guidance and verification',
  'Cover letter preparation',
  'Interview preparation tips',
  'Status tracking and updates',
]

const documents = [
  'Valid passport (with at least 6 months validity)',
  'Passport-sized photographs (UK specification)',
  'Bank statements (last 6 months)',
  'Employment letter or business registration',
  'Travel itinerary and accommodation proof',
  'Previous visa history (if applicable)',
]

const serviceOptions = [
  'UK Visit Visa',
  'UK Tourist Visa',
  'UK Family Visit',
  'Other',
]

export default function UKVisaPage() {
  const [formData, setFormData] = useState({
    name: '',
    service: 'UK Visit Visa',
    destination: 'United Kingdom',
    travelDate: '',
    whatsapp: '',
    details: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, source: 'uk-visa-page' }),
      })
      setIsSubmitted(true)
    } catch {
      // Fallback to WhatsApp
      window.open('https://wa.me/447398753797', '_blank')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Hero */}
      <section className="bg-luxury-dark py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute top-20 left-10 w-64 h-64 bg-walz-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-walz-gold/5 rounded-full blur-3xl" />

        <div className="container-walz relative">
          <Link
            href="/visa"
            className="inline-flex items-center gap-2 text-walz-muted hover:text-walz-gold text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Visa Services
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-6xl mb-6">🇬🇧</div>
              <h1 className="font-display text-4xl lg:text-5xl font-bold text-walz-white mb-4">
                UK Tourist Visa
              </h1>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-walz-gold text-4xl font-bold">From USD $188</span>
                <span className="text-walz-muted text-sm">(Service fee only)</span>
              </div>

              <div className="flex flex-wrap gap-4 mb-8">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-walz-slate/50">
                  <Clock className="w-4 h-4 text-walz-gold" />
                  <span className="text-walz-white text-sm">3–4 weeks processing</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-walz-slate/50">
                  <Shield className="w-4 h-4 text-walz-gold" />
                  <span className="text-walz-white text-sm">90%+ approval rate</span>
                </div>
              </div>

              <p className="text-walz-muted text-lg leading-relaxed mb-8">
                Get expert guidance for your UK visitor visa application. Our team handles document preparation, form assistance, and interview coaching to maximize your approval chances.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="https://wa.me/447398753797"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gold inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl"
                >
                  <MessageCircle className="w-5 h-5" />
                  Start Application
                </a>
              </div>
            </div>

            {/* Lead Form */}
            <div className="card-glass p-8">
              <h3 className="font-display text-xl font-bold text-walz-white mb-6">
                Get Your UK Visa Quote
              </h3>

              {isSubmitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full walz-gold-gradient flex items-center justify-center mx-auto mb-4 shadow-gold-glow">
                    <Check className="w-8 h-8 text-walz-deep-navy" />
                  </div>
                  <h4 className="font-display text-xl font-bold text-walz-white mb-2">
                    Thank you!
                  </h4>
                  <p className="text-walz-muted">
                    We&apos;ll send your personalised document checklist within 24 hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-walz-muted text-sm mb-2">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white placeholder-walz-muted focus:outline-none focus:border-walz-gold transition-colors"
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-walz-muted text-sm mb-2">Service Type *</label>
                    <select
                      value={formData.service}
                      onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white focus:outline-none focus:border-walz-gold transition-colors"
                    >
                      {serviceOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-walz-muted text-sm mb-2">Travel Date</label>
                    <input
                      type="date"
                      value={formData.travelDate}
                      onChange={(e) => setFormData({ ...formData, travelDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white focus:outline-none focus:border-walz-gold transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-walz-muted text-sm mb-2">WhatsApp Number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white placeholder-walz-muted focus:outline-none focus:border-walz-gold transition-colors"
                      placeholder="+234 xxx xxx xxxx"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full btn-gold py-4 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Get My Quote
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="container-walz">
          <h2 className="section-title text-center mb-12">What&apos;s Included</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {included.map((item) => (
              <div key={item} className="flex items-start gap-3 p-4 card-elevated">
                <div className="w-6 h-6 rounded-full bg-walz-gold/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-walz-gold" />
                </div>
                <span className="text-walz-deep-navy text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Document Checklist */}
      <section className="py-16 lg:py-20 bg-walz-off-white">
        <div className="container-walz">
          <div className="text-center mb-12">
            <div className="section-label justify-center mb-4">
              <FileText className="w-4 h-4" />
              <span>Documents Required</span>
            </div>
            <h2 className="section-title">Document Checklist</h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-3">
            {documents.map((doc, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-walz-border">
                <span className="w-8 h-8 rounded-full bg-walz-gold/10 flex items-center justify-center text-walz-gold text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-walz-deep-navy text-sm">{doc}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-walz-muted text-sm mt-8 max-w-xl mx-auto">
            This is a general checklist. Your exact requirements may vary based on your specific situation. Our team will provide a personalised checklist after reviewing your case.
          </p>
        </div>
      </section>

      {/* Why Pay */}
      <section className="py-16 lg:py-20 bg-walz-cream">
        <div className="container-walz">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="section-title mb-6">Why Pay for Visa Support?</h2>
            <p className="text-walz-muted text-lg leading-relaxed mb-8">
              One mistake on your UK visa application can result in refusal, wasted fees, and months of delay. Our service ensures your documents are complete, properly formatted, and present the strongest possible case for approval.
            </p>

            <div className="p-6 bg-white rounded-2xl border border-walz-gold/20">
              <p className="text-walz-deep-navy font-medium">
                &ldquo;Walz Travels got my UK visa approved in 3 weeks after two previous refusals. The team handled everything for me.&rdquo;
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <span className="text-walz-muted text-sm">— Adaeze N., Lagos</span>
                <div className="flex">
                  {[1,2,3,4,5].map((i) => (
                    <Star key={i} className="w-4 h-4 text-walz-gold fill-walz-gold" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20 bg-luxury-dark">
        <div className="container-walz text-center">
          <h2 className="section-title-light mb-4">Ready to Start Your UK Visa Application?</h2>
          <p className="text-walz-muted mb-8 max-w-xl mx-auto">
            Contact us today and receive your personalised document checklist within 24 hours.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl"
            >
              <MessageCircle className="w-5 h-5" />
              Chat on WhatsApp
            </a>
            <Link
              href="/visa"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-walz-gold text-walz-gold hover:bg-walz-gold hover:text-walz-deep-navy transition-colors font-semibold"
            >
              View All Visa Services
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
