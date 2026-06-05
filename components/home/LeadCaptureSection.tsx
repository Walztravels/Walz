'use client'

import { useState } from 'react'
import { MessageCircle, Send, FileText, ArrowRight, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'

const serviceOptions = [
  'Visa Processing',
  'Flight Booking',
  'Holiday Package',
  'Group Travel',
  'Corporate Travel',
  'Hotel Only',
  'Other',
]

export function LeadCaptureSection() {
  const [formData, setFormData] = useState({
    name: '',
    service: '',
    destination: '',
    travelDate: '',
    whatsapp: '',
    details: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          source: 'homepage',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit')
      }

      setIsSubmitted(true)
      setFormData({
        name: '',
        service: '',
        destination: '',
        travelDate: '',
        whatsapp: '',
        details: '',
      })
    } catch (err) {
      setError('Something went wrong. Please try WhatsApp instead.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="py-20 lg:py-28 bg-luxury-dark relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-walz-gold/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-walz-gold/5 rounded-full blur-3xl" />

      <div className="container-walz relative">
        <div className="text-center mb-12">
          <h2 className="section-title-light mb-4">
            Ready to start your trip, visa process, or group booking?
          </h2>
          <p className="text-walz-muted max-w-xl mx-auto">
            Tell us where you want to go and what support you need. Walz Travels will help you choose the right next step.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-500 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            Chat on WhatsApp
          </a>
          <Link
            href="/visa"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl border-2 border-walz-gold text-walz-gold font-semibold hover:bg-walz-gold hover:text-walz-deep-navy transition-colors"
          >
            <FileText className="w-5 h-5" />
            Start Visa Support
          </Link>
        </div>

        {/* Lead Form */}
        <div className="max-w-2xl mx-auto">
          <div className="card-glass p-8 lg:p-10">
            <h3 className="font-display text-xl font-bold text-walz-white mb-6 text-center">
              Get a Service Quote
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
                  We&apos;ll be in touch within 24 hours with your personalised quote.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                    <label className="block text-walz-muted text-sm mb-2">Service Needed *</label>
                    <select
                      required
                      value={formData.service}
                      onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white focus:outline-none focus:border-walz-gold transition-colors"
                    >
                      <option value="">Select a service</option>
                      {serviceOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-walz-muted text-sm mb-2">Destination *</label>
                    <input
                      type="text"
                      required
                      value={formData.destination}
                      onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white placeholder-walz-muted focus:outline-none focus:border-walz-gold transition-colors"
                      placeholder="United Kingdom"
                    />
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
                </div>

                <div>
                  <label className="block text-walz-muted text-sm mb-2">WhatsApp Number *</label>
                  <input
                    type="tel"
                    required
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white placeholder-walz-muted focus:outline-none focus:border-walz-gold transition-colors"
                    placeholder="+44 7398 753797"
                  />
                </div>

                <div>
                  <label className="block text-walz-muted text-sm mb-2">Additional Details (optional)</label>
                  <textarea
                    rows={3}
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-walz-slate/50 border border-walz-slate text-walz-white placeholder-walz-muted focus:outline-none focus:border-walz-gold transition-colors resize-none"
                    placeholder="Tell us more about your travel plans..."
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-gold py-4 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
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
  )
}
