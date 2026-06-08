'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, MessageCircle, LayoutDashboard, Clock, Mail, FileCheck, PhoneCall, Loader2 } from 'lucide-react'

function ConfirmationContent() {
  const params = useSearchParams()
  const ref = params.get('ref') ?? '—'
  const name = params.get('name') ?? 'there'
  const flow = params.get('flow') ?? 'client'
  const isAdminFlow = flow === 'admin'

  const whatsappMsg = encodeURIComponent(
    `Hi Jade! I just submitted my visa application. Reference: ${ref}. Please let me know if you need anything else.`
  )
  const whatsappUrl = `https://wa.me/17867977884?text=${whatsappMsg}`

  return (
    <div className="w-full max-w-lg">
      {/* Success card */}
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Gold top bar */}
        <div className="h-2 bg-[#C9A84C]" />

        <div className="p-8 text-center">
          {/* Checkmark */}
          <div className="flex justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-green-50 border-4 border-green-200 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">
            Application Received!
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Thank you, <span className="font-semibold text-[#0B1F3A]">{name}</span>. Your visa application has been submitted successfully.
          </p>

          {/* Reference number */}
          <div className="bg-[#0B1F3A]/5 rounded-2xl p-4 mb-6 inline-block w-full">
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-widest font-semibold">Reference Number</p>
            <p className="text-2xl font-bold text-[#C9A84C] tracking-widest font-mono">{ref}</p>
            <p className="text-xs text-gray-400 mt-1">Save this for your records</p>
          </div>

          {/* What happens next */}
          <div className="text-left mb-8">
            <h2 className="text-sm font-bold text-[#0B1F3A] mb-4 uppercase tracking-wider">What happens next</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileCheck className="w-4 h-4 text-[#C9A84C]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Application review</p>
                  <p className="text-xs text-gray-500">Jade will review your submitted details and verify everything is in order.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-4 h-4 text-[#C9A84C]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Response within 24 hours</p>
                  <p className="text-xs text-gray-500">You'll hear from us within one business day with next steps or any follow-up questions.</p>
                </div>
              </div>

              {isAdminFlow ? (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <PhoneCall className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Payment handled separately</p>
                    <p className="text-xs text-gray-500">Jade will reach out to handle any payment details directly with you.</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Confirmation email sent</p>
                    <p className="text-xs text-gray-500">A confirmation has been sent to your email with your reference number and next steps.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-green-500 hover:bg-green-600 text-white font-bold text-sm rounded-xl transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Message Jade on WhatsApp
            </a>

            <Link
              href="/portal"
              className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-[#0B1F3A] hover:bg-[#122b4f] text-white font-semibold text-sm rounded-xl transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Go to My Portal
            </Link>

            <Link
              href="/"
              className="block text-center text-xs text-gray-400 hover:text-gray-600 transition-colors pt-1"
            >
              Return to home
            </Link>
          </div>
        </div>
      </div>

      {/* Jade note */}
      <div className="mt-6 flex gap-3 items-start px-2">
        <div className="w-9 h-9 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">J</div>
        <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 text-white/80 text-xs leading-relaxed">
          Thank you for choosing Walz Travels! I personally review every application and will be in touch shortly. — <span className="font-semibold text-[#C9A84C]">Jade</span>
        </div>
      </div>
    </div>
  )
}

export default function VisaConfirmationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] to-[#122b4f] flex items-center justify-center px-4 py-16">
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      }>
        <ConfirmationContent />
      </Suspense>
    </div>
  )
}
