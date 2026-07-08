import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Accessibility | Walz Travels',
  description: 'Walz Travels accessibility statement and our commitment to WCAG 2.1 AA.',
}

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#0a1628] pt-32 pb-16 px-5 text-center">
        <p className="text-amber-400 text-xs uppercase tracking-widest mb-3">Legal</p>
        <h1 className="text-white text-4xl md:text-5xl font-bold mb-3">Accessibility Statement</h1>
        <p className="text-white/50 text-sm">Last updated: June 2026</p>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 py-16 pb-24 prose prose-lg prose-headings:text-[#0a1628] prose-p:text-gray-700">
        <h2>Our Commitment</h2>
        <p>
          Walz Travels is committed to ensuring our website is accessible to all users, including
          those with disabilities. We aim to meet the Web Content Accessibility Guidelines (WCAG)
          2.1 Level AA.
        </p>

        <h2>Standards We Follow</h2>
        <p>
          We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA,
          published by the World Wide Web Consortium (W3C).
        </p>

        <h2>What We&apos;ve Done</h2>
        <ul>
          <li>Semantic HTML used throughout the website</li>
          <li>Alt text provided on all meaningful images</li>
          <li>Full keyboard navigation supported</li>
          <li>Colour contrast meets WCAG minimum ratios</li>
          <li>Forms include descriptive labels and instructions</li>
          <li>Text can be resized without loss of content or functionality</li>
          <li>Focus indicators visible for keyboard users</li>
        </ul>

        <h2>Known Limitations</h2>
        <p>
          Some third-party tools including our live chat widget, payment processing forms, and
          embedded maps may not fully meet accessibility standards. We are working with our
          providers to improve these areas.
        </p>

        <h2>Feedback &amp; Contact</h2>
        <p>
          If you experience any difficulties accessing our website, please contact us:
        </p>
        <ul>
          <li>
            Email:{' '}
            <a href="mailto:contact@walztravels.com" className="text-amber-600 hover:text-amber-700">
              contact@walztravels.com
            </a>
          </li>
          <li>
            WhatsApp:{' '}
            <a href="https://wa.me/12317902336" className="text-amber-600 hover:text-amber-700">
              +12317902336
            </a>
          </li>
          <li>
            Or visit our{' '}
            <Link href="/contact" className="text-amber-600 hover:text-amber-700">
              contact page
            </Link>
          </li>
        </ul>
        <p>We aim to respond to accessibility queries within 5 business days.</p>

        <h2>Enforcement</h2>
        <p>
          If you are not satisfied with our response, you can contact the Equality Advisory and
          Support Service (EASS) at{' '}
          <a
            href="https://www.equalityadvisoryservice.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-600 hover:text-amber-700"
          >
            equalityadvisoryservice.com
          </a>
          .
        </p>
      </div>
    </main>
  )
}
