import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Cookie Policy | Walz Travels',
  description: 'How Walz Travels uses cookies on walztravels.com.',
}

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#0a1628] pt-32 pb-16 px-5 text-center">
        <p className="text-amber-400 text-xs uppercase tracking-widest mb-3">Legal</p>
        <h1 className="text-white text-4xl md:text-5xl font-bold mb-3">Cookie Policy</h1>
        <p className="text-white/50 text-sm">Last updated: June 2026</p>
      </div>

      {/* Summary box */}
      <div className="max-w-3xl mx-auto px-5 -mt-6 mb-12">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-amber-900 text-sm leading-relaxed">
            We use cookies to make our website work and to understand how you use it. You can control
            cookies in your browser settings.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 pb-24 prose prose-lg prose-headings:text-[#0a1628] prose-p:text-gray-700">
        <h2>What Are Cookies</h2>
        <p>
          Cookies are small text files stored on your device when you visit a website. They help us
          remember your preferences and improve your experience.
        </p>

        <h2>Cookies We Use</h2>

        <h3>Strictly Necessary</h3>
        <p>
          These cookies are essential for the site to work and cannot be disabled. They include
          session cookies (keep you logged in), security tokens (prevent fraud), and load balancing
          cookies (server performance).
        </p>

        <h3>Analytics</h3>
        <p>
          We use Vercel Analytics to collect aggregated page view and performance data. No personal
          data is stored. These help us improve the website experience.
        </p>

        <h3>Functional</h3>
        <p>
          These store your preferences such as currency selection (£/$/€), language preference, and
          recent search history to make your experience faster.
        </p>

        <h3>Payment Processing</h3>
        <p>
          Stripe sets cookies to handle secure payment processing. These cookies are set by Stripe,
          not Walz Travels, and are required to process payments securely.
        </p>

        <h2>Third-Party Cookies</h2>
        <ul>
          <li><strong>Stripe</strong> — payment.stripe.com (payment processing)</li>
          <li><strong>Vercel</strong> — vercel.com/analytics (performance monitoring)</li>
          <li><strong>Chatwoot</strong> — live chat functionality</li>
        </ul>

        <h2>How to Control Cookies</h2>
        <p>You can delete or block cookies via your browser settings:</p>
        <ul>
          <li>Chrome: Settings → Privacy &amp; Security → Cookies</li>
          <li>Safari: Preferences → Privacy</li>
          <li>Firefox: Options → Privacy &amp; Security</li>
        </ul>
        <p>
          Note: Blocking necessary cookies may prevent parts of our site from working correctly.
        </p>

        <h2>Contact</h2>
        <p>
          If you have any questions about our use of cookies, please contact us at{' '}
          <a href="mailto:contact@walztravels.com" className="text-amber-600 hover:text-amber-700">
            contact@walztravels.com
          </a>{' '}
          or visit our{' '}
          <Link href="/contact" className="text-amber-600 hover:text-amber-700">
            contact page
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
