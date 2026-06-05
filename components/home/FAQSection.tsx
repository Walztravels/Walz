'use client'

import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const faqs = [
  {
    question: 'What services does Walz Travels handle?',
    answer: 'We handle visa processing, flight bookings, hotel reservations, tour packages, travel insurance, airport transfers, and corporate and group travel across all major destinations.',
  },
  {
    question: 'Can Walz Travels help with both visa and flight booking?',
    answer: 'Yes. We handle both together or separately depending on what you need.',
  },
  {
    question: 'How do I begin a visa application?',
    answer: 'Contact us on WhatsApp or complete our lead form. We send you a personalised document checklist within 24 hours and begin processing after your deposit.',
  },
  {
    question: 'Do you support family and group travel?',
    answer: 'Yes. We handle individual, family, corporate and group applications and bookings across all destinations.',
  },
  {
    question: 'Can I speak to someone on WhatsApp?',
    answer: 'Yes. WhatsApp us at +447398753797. Jade AI is also available 24/7 on the website.',
  },
  {
    question: 'Do you offer travel insurance and airport transfers?',
    answer: 'Yes. Both are available as add-ons on any booking.',
  },
  {
    question: 'How do payments work?',
    answer: 'We require a non-refundable service deposit before processing begins. Government visa fees are always paid separately by the client.',
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="py-20 lg:py-28 bg-walz-off-white">
      <div className="container-walz">
        <div className="text-center mb-12">
          <div className="section-label justify-center mb-4">
            <HelpCircle className="w-4 h-4" />
            <span>FAQ</span>
          </div>
          <h2 className="section-title mb-4">
            Frequently asked questions
          </h2>
        </div>

        <div className="max-w-3xl mx-auto">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border-b border-walz-border last:border-b-0"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between py-5 text-left group"
              >
                <span className="font-medium text-walz-deep-navy pr-4 group-hover:text-walz-gold transition-colors">
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    'w-5 h-5 text-walz-muted flex-shrink-0 transition-transform',
                    openIndex === index && 'rotate-180 text-walz-gold'
                  )}
                />
              </button>
              <div
                className={cn(
                  'overflow-hidden transition-all duration-300',
                  openIndex === index ? 'max-h-96 pb-5' : 'max-h-0'
                )}
              >
                <p className="text-walz-muted text-sm leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
