'use client'

import { useState, useMemo } from 'react'
import {
  CreditCard, FileText, XCircle, User, Headphones,
  ChevronDown, Search, MessageCircle, Mail, Phone,
} from 'lucide-react'

// ── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'bookings',
    icon: CreditCard,
    title: 'Bookings & Payments',
    faqs: [
      {
        q: 'How do I book a flight with Walz Travels?',
        a: 'Visit walztravels.com/flights and search your route. Select your preferred flight and complete the booking form. Our team will confirm and issue your ticket within 2 hours of payment.',
      },
      {
        q: 'What payment methods do you accept?',
        a: 'We accept card payments via Stripe, bank transfer and mobile payments. All transactions are secured and encrypted.',
      },
      {
        q: 'When is payment due?',
        a: 'A non-refundable service deposit is required to begin processing. Full payment is due before ticket issuance or visa submission.',
      },
      {
        q: 'Can I pay in instalments?',
        a: 'Contact Jade on WhatsApp to discuss flexible payment options for larger bookings.',
      },
      {
        q: 'How do I get a receipt for my payment?',
        a: 'Receipts are automatically emailed after payment and available in your portal under My Payments.',
      },
      {
        q: 'Is my payment secure?',
        a: 'Yes. All card payments are processed through Stripe which is PCI DSS Level 1 certified — the highest level of payment security.',
      },
    ],
  },
  {
    id: 'visa',
    icon: FileText,
    title: 'Visa Applications',
    faqs: [
      {
        q: 'How does the visa application process work?',
        a: 'You submit your application through our portal or WhatsApp. We prepare all documents, write your cover letter and submit to the embassy on your behalf. You track progress in your portal.',
      },
      {
        q: 'How long does a UK visa take?',
        a: 'Typically 3 to 4 weeks from submission. We recommend applying at least 8 weeks before your travel date.',
      },
      {
        q: 'How long does a Canada visa take?',
        a: '8 to 12 weeks for Nigerian and Ghanaian applicants. Apply as early as possible.',
      },
      {
        q: 'Do you guarantee visa approval?',
        a: 'We guarantee professional preparation and a 90%+ approval rate. Final decisions rest solely with the embassy. We cannot guarantee approval.',
      },
      {
        q: 'What happens if my visa is refused?',
        a: 'One free resubmission is included in your service fee. We review the refusal reasons and prepare a stronger application.',
      },
      {
        q: 'What documents do I need for a UK visa?',
        a: 'Passport, 2 photographs, 6 month bank statement, employment letter with leave dates, travel itinerary and hotel booking. We send you a personalised checklist.',
      },
      {
        q: 'How do I upload my documents?',
        a: 'Log into your portal at walztravels.com/portal and go to My Documents. Upload each document in the correct category.',
      },
      {
        q: 'Can you help with family visa applications?',
        a: 'Yes. We handle individual and family applications. Each applicant uses one application slot.',
      },
    ],
  },
  {
    id: 'cancellations',
    icon: XCircle,
    title: 'Cancellations & Refunds',
    faqs: [
      {
        q: 'Can I cancel my booking?',
        a: 'Yes. Cancellation terms depend on the service type and timing. See below for specific policies.',
      },
      {
        q: 'What is the cancellation policy for tours?',
        a: '7 or more days before — full refund minus 10% admin fee. 3 to 6 days before — 50% refund. Less than 48 hours — no refund.',
      },
      {
        q: 'Can I get a refund on visa service fees?',
        a: 'Service deposits are non-refundable once application preparation has begun. Government fees are non-refundable once submitted to the embassy.',
      },
      {
        q: 'What is a travel credit voucher?',
        a: 'Instead of a cash refund we can issue a travel credit voucher valid for 12 months toward any Walz Travels service.',
      },
      {
        q: 'How long do refunds take?',
        a: 'Card refunds take 5 to 10 business days to appear on your statement.',
      },
      {
        q: 'How do I request a cancellation?',
        a: 'WhatsApp Jade at +447398753797 or email contact@walztravels.com with your booking reference number.',
      },
    ],
  },
  {
    id: 'account',
    icon: User,
    title: 'Account & Portal',
    faqs: [
      {
        q: 'How do I access my client portal?',
        a: 'Go to walztravels.com/login and sign in with your email and password. Your portal shows all your applications, bookings and documents.',
      },
      {
        q: 'How do I create an account?',
        a: 'Your Walz Travels advisor creates your account and sends you a welcome email with login details.',
      },
      {
        q: 'I forgot my password — what do I do?',
        a: 'Click Forgot Password on the login page. A reset link will be sent to your email within 5 minutes.',
      },
      {
        q: 'How do I update my passport details?',
        a: 'Log into your portal and go to Passport Vault to update your details.',
      },
      {
        q: 'Can I add family members to my account?',
        a: 'Contact Jade on WhatsApp to add family members to your application.',
      },
      {
        q: 'How do I track my visa application?',
        a: 'Log into your portal. Go to My Applications and click your application to see the full status and activity log.',
      },
      {
        q: 'How do I see my payment history?',
        a: 'Log into your portal and go to My Payments to see all transactions and download receipts.',
      },
    ],
  },
  {
    id: 'support',
    icon: Headphones,
    title: 'Support',
    faqs: [
      {
        q: 'How do I contact Walz Travels?',
        a: 'WhatsApp us at +447398753797 or email contact@walztravels.com. Jade AI is available 24/7 on the website.',
      },
      {
        q: 'What are your support hours?',
        a: 'Jade AI is available 24 hours 7 days a week. Human support is available Monday to Friday 9AM to 6PM WAT.',
      },
      {
        q: 'How quickly will I get a response?',
        a: 'WhatsApp messages are responded to within 1 hour during business hours. Jade AI responds instantly at any time.',
      },
      {
        q: 'Can I speak to someone on the phone?',
        a: 'Call Jade on +19843880110 for immediate assistance.',
      },
      {
        q: 'How do I report a problem?',
        a: 'WhatsApp us or email contact@walztravels.com with details of the issue and your booking reference.',
      },
      {
        q: 'Do you have an emergency line?',
        a: 'Yes. For travel emergencies call +19843880110 available 24 hours.',
      },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-[#C9A84C]/30 text-[#0B1F3A] rounded px-0.5">{part}</mark>
      : part
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FAQItem({ q, a, query }: { q: string; a: string; query: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-[#0B1F3A]/8 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-4 py-4 text-left group"
      >
        <span className="text-[#0B1F3A] text-sm font-medium leading-snug group-hover:text-[#C9A84C] transition-colors duration-200">
          {highlight(q, query)}
        </span>
        <ChevronDown
          className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? '400px' : '0px', opacity: open ? 1 : 0 }}
      >
        <p className="text-[#0B1F3A]/60 text-sm leading-relaxed pb-4 pr-8">
          {highlight(a, query)}
        </p>
      </div>
    </div>
  )
}

function CategoryCard({
  cat,
  isOpen,
  onToggle,
  query,
}: {
  cat: typeof CATEGORIES[0]
  isOpen: boolean
  onToggle: () => void
  query: string
}) {
  const Icon = cat.icon
  const faqs = query.trim()
    ? cat.faqs.filter(
        f =>
          f.q.toLowerCase().includes(query.toLowerCase()) ||
          f.a.toLowerCase().includes(query.toLowerCase())
      )
    : cat.faqs

  if (query.trim() && faqs.length === 0) return null

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${
        isOpen
          ? 'border-[#C9A84C] bg-white shadow-lg'
          : 'border-[#E2D9CC] bg-white hover:border-[#C9A84C]/50 hover:shadow-md'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 p-5 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
              isOpen ? 'bg-[#C9A84C]' : 'bg-[#0B1F3A]'
            }`}
          >
            <Icon className={`w-5 h-5 transition-colors duration-200 ${isOpen ? 'text-[#0B1F3A]' : 'text-[#C9A84C]'}`} />
          </div>
          <span
            className={`font-semibold text-sm transition-colors duration-200 ${
              isOpen ? 'text-[#C9A84C]' : 'text-[#0B1F3A]'
            }`}
          >
            {cat.title}
          </span>
        </div>

        <ChevronDown
          className={`w-5 h-5 flex-shrink-0 transition-all duration-300 ${
            isOpen ? 'text-[#C9A84C] rotate-180' : 'text-[#0B1F3A]/30'
          }`}
        />
      </button>

      {/* Expanded FAQ list */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isOpen ? `${faqs.length * 120 + 32}px` : '0px' }}
      >
        <div className="px-5 pb-2 border-t border-[#0B1F3A]/6">
          {faqs.map(faq => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} query={query} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Search results view ────────────────────────────────────────────────────────

function SearchResults({ query }: { query: string }) {
  const results = useMemo(() => {
    const q = query.toLowerCase()
    return CATEGORIES.flatMap(cat =>
      cat.faqs
        .filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
        .map(f => ({ ...f, category: cat.title }))
    )
  }, [query])

  if (results.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[#0B1F3A]/40 text-sm mb-1">No results for &ldquo;{query}&rdquo;</p>
        <a
          href="https://wa.me/447398753797"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#C9A84C] text-sm font-medium hover:underline"
        >
          Try WhatsApp us at +447398753797 →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {results.map(({ q, a, category }) => (
        <div key={q} className="bg-white rounded-2xl border border-[#E2D9CC] px-5 py-4">
          <p className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-wider mb-2">
            {category}
          </p>
          <p className="text-[#0B1F3A] text-sm font-medium mb-2 leading-snug">
            {highlight(q, query)}
          </p>
          <p className="text-[#0B1F3A]/60 text-sm leading-relaxed">
            {highlight(a, query)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [openId, setOpenId]   = useState<string | null>(null)
  const [query, setQuery]     = useState('')

  const isSearching = query.trim().length > 1

  function toggle(id: string) {
    setOpenId(prev => (prev === id ? null : id))
  }

  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#0B1F3A] pt-14 pb-12 px-5">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[#C9A84C] text-[10px] font-semibold tracking-[0.22em] uppercase mb-3">
            Help Centre
          </p>
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-7">
            How Can We Help?
          </h1>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0B1F3A]/40 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search questions…"
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-white text-[#0B1F3A] text-sm placeholder-[#0B1F3A]/40 outline-none focus:ring-2 focus:ring-[#C9A84C] transition-shadow"
            />
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 py-10 lg:py-14">

        {isSearching ? (
          /* Search results */
          <SearchResults query={query} />
        ) : (
          /* Category cards */
          <div className="space-y-3">
            {CATEGORIES.map(cat => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                isOpen={openId === cat.id}
                onToggle={() => toggle(cat.id)}
                query={query}
              />
            ))}
          </div>
        )}

        {/* ── Bottom CTA ─────────────────────────────────────────────────── */}
        <div className="mt-14 bg-[#0B1F3A] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-white text-center mb-1">
            Still need help?
          </h2>
          <p className="text-white/40 text-sm text-center mb-8">
            Our team is ready — pick the fastest option for you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-5 rounded-xl bg-white/5 hover:bg-[#C9A84C]/10 border border-white/10 hover:border-[#C9A84C]/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <p className="text-white font-semibold text-sm">WhatsApp Jade</p>
              <p className="text-white/40 text-xs text-center">+44 7398 753797</p>
            </a>

            <a
              href="mailto:contact@walztravels.com"
              className="flex flex-col items-center gap-2 p-5 rounded-xl bg-white/5 hover:bg-[#C9A84C]/10 border border-white/10 hover:border-[#C9A84C]/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-[#C9A84C] flex items-center justify-center">
                <Mail className="w-5 h-5 text-[#0B1F3A]" />
              </div>
              <p className="text-white font-semibold text-sm">Email Us</p>
              <p className="text-white/40 text-xs text-center">contact@walztravels.com</p>
            </a>

            <a
              href="tel:+19843880110"
              className="flex flex-col items-center gap-2 p-5 rounded-xl bg-white/5 hover:bg-[#C9A84C]/10 border border-white/10 hover:border-[#C9A84C]/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-[#1C3557] flex items-center justify-center">
                <Phone className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <p className="text-white font-semibold text-sm">Call Jade</p>
              <p className="text-white/40 text-xs text-center">+1 984 388 0110</p>
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
