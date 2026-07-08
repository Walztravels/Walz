import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Walz Travels Privacy Policy — how we collect, use and protect your personal data.',
  alternates: { canonical: 'https://www.walztravels.com/privacy' },
}

const SECTIONS = [
  {
    title: '1. Who We Are',
    body: `Walz Travels Ltd ("Walz Travels", "we", "us" or "our") is a travel agency incorporated in the United Kingdom (Company registration pending). Our registered office is at 1 Commercial Street, London, E1 6RF.

We operate the website walztravels.com and related services including flight booking, hotel booking, private tours, visa assistance and gift vouchers.

For any privacy-related queries, contact us at: contact@walztravels.com`,
  },
  {
    title: '2. Information We Collect',
    body: `We collect information you provide directly to us, including:

• Identity data: full name, date of birth, passport number and nationality (required for flight bookings and visa applications)
• Contact data: email address, phone number and postal address
• Travel data: flight preferences, hotel preferences, travel dates and destination history
• Payment data: billing address and payment confirmation (card details are processed by Stripe and never stored by us)
• Communication data: messages sent via WhatsApp, email or our contact forms
• Technical data: IP address, browser type, device identifiers and usage analytics collected via cookies

We do not collect sensitive personal data (such as health data) unless you voluntarily provide it (e.g. dietary requirements or accessibility needs for a tour booking).`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your information to:

• Process and manage bookings (flights, hotels, tours, visa applications)
• Verify your identity and confirm travel document requirements
• Communicate with you about your booking, itinerary changes and support requests
• Send transactional emails (booking confirmations, visa status updates, payment receipts)
• Send marketing communications, where you have opted in (you may opt out at any time)
• Improve our website, products and services
• Comply with legal and regulatory obligations`,
  },
  {
    title: '4. Legal Basis for Processing',
    body: `We process your personal data on the following legal bases:

• Contract performance: to fulfil a booking or service you have requested
• Legitimate interests: to improve our services, prevent fraud and manage our business
• Legal obligation: to comply with financial, tax and travel-industry regulations
• Consent: for marketing emails and non-essential cookies (you may withdraw consent at any time)`,
  },
  {
    title: '5. Data Sharing',
    body: `We share your data only as necessary to deliver our services:

• Airlines and Global Distribution Systems (Sabre GDS) — for flight bookings
• Hotels and accommodation providers — for hotel reservations
• Embassy or visa processing centres — for visa applications
• Stripe — for secure payment processing
• Resend — for transactional email delivery
• Supabase — for secure database hosting (EU region)
• Our WhatsApp business support team

We do not sell your personal data to third parties for marketing purposes.`,
  },
  {
    title: '6. Data Retention',
    body: `We retain your personal data for as long as necessary to:

• Provide ongoing services and maintain booking records (typically 7 years for financial records)
• Comply with applicable laws and regulations
• Resolve disputes and enforce agreements

When data is no longer required, we securely delete or anonymise it.`,
  },
  {
    id: 'data-deletion',
    title: '7. Your Rights',
    body: `To request deletion of your personal data that Walz Travels has received from Facebook or Instagram, please email contact@walztravels.com with the subject line "Data Deletion Request". We will process your request within 30 days and confirm deletion by email.

Under UK GDPR and the Data Protection Act 2018, you have the right to:

• Access: request a copy of the personal data we hold about you
• Rectification: request correction of inaccurate or incomplete data
• Erasure: request deletion of your data (subject to legal retention requirements)
• Portability: receive your data in a structured, machine-readable format
• Restriction: request that we limit processing in certain circumstances
• Objection: object to processing based on legitimate interests or for direct marketing

To exercise any of these rights, email us at contact@walztravels.com. We will respond within 30 days.`,
  },
  {
    title: '8. Cookies',
    body: `We use cookies to:

• Keep you signed in to your Walz Travels account (essential cookies)
• Remember your search preferences (functional cookies)
• Measure website traffic and performance (analytics cookies via privacy-respecting tools)

You can control non-essential cookies through your browser settings. Disabling essential cookies will affect your ability to use the booking platform.`,
  },
  {
    title: '9. International Transfers',
    body: `Some of our service providers (such as Sabre GDS) may process data outside the UK or EEA. Where this occurs, we ensure appropriate safeguards are in place (e.g. Standard Contractual Clauses or adequacy decisions) to protect your data.`,
  },
  {
    title: '10. Security',
    body: `We implement appropriate technical and organisational measures to protect your personal data, including:

• HTTPS encryption for all data in transit
• Secure, access-controlled database infrastructure (Supabase)
• Payment data handled exclusively by PCI-DSS compliant Stripe
• Restricted staff access to personal data on a need-to-know basis`,
  },
  {
    title: '11. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or via a prominent notice on our website. Continued use of our services after changes take effect constitutes acceptance of the updated policy.`,
  },
  {
    title: '12. Contact Us',
    body: `For any privacy-related questions, requests or complaints:

Email: contact@walztravels.com
WhatsApp: +12317902336
Post: Walz Travels Ltd, 1 Commercial Street, London, E1 6RF

If you are unsatisfied with our response, you have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.`,
  },
]

export default function PrivacyPage() {
  const lastUpdated = 'June 2025'

  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Header */}
      <div className="bg-[#0B1F3A] py-14 lg:py-20 px-5 text-center">
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Legal</p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Privacy Policy</h1>
        <p className="text-white/40 text-sm">Last updated: {lastUpdated}</p>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl p-5 mb-10">
          <p className="text-[#0B1F3A] text-sm leading-relaxed">
            <strong>Summary:</strong> We collect only the data needed to provide your travel services. We never sell your data. You have full rights to access, correct or delete your information. Questions? Email <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">contact@walztravels.com</a>.
          </p>
        </div>

        <div className="space-y-10">
          {SECTIONS.map(({ title, body, id }) => (
            <section key={title} {...(id ? { id } : {})}>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-3">{title}</h2>
              <div className="text-[#0B1F3A]/65 text-sm leading-relaxed whitespace-pre-line">{body}</div>
            </section>
          ))}
        </div>

        {/* Footer links */}
        <div className="mt-14 pt-8 border-t border-[#E2D9CC] flex flex-wrap gap-4 text-sm">
          <Link href="/terms" className="text-[#C9A84C] hover:underline font-medium">Terms of Service</Link>
          <Link href="/help" className="text-[#C9A84C] hover:underline font-medium">Help Centre</Link>
          <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline font-medium">Contact Us</a>
        </div>

      </div>
    </div>
  )
}
