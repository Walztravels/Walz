import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Walz Travels Terms of Service — the rules and conditions that govern use of our travel booking platform.',
}

const SECTIONS = [
  {
    title: '1. About These Terms',
    body: `These Terms of Service ("Terms") govern your use of the Walz Travels website (walztravels.us) and all related booking services operated by Walz Travels Ltd ("Walz Travels", "we", "us" or "our").

By accessing our website or placing a booking, you agree to be bound by these Terms. If you do not agree, please do not use our services.`,
  },
  {
    title: '2. Our Services',
    body: `Walz Travels acts as a travel agent facilitating bookings on your behalf. Our services include:

• Flight bookings via Sabre GDS on behalf of airlines
• Hotel reservations on behalf of accommodation providers
• Private tour bookings with our curated tour operators
• Visa application assistance (we act as a facilitator, not a guarantor of visa approval)
• Gift voucher issuance and redemption
• Travel insurance referral (in partnership with third-party insurers)`,
  },
  {
    title: '3. Bookings and Payments',
    body: `All prices are displayed in the relevant currency and include applicable fees unless stated otherwise. Fares and availability are subject to change until a booking is confirmed and paid in full.

Payment is processed securely by Stripe. We do not store your card details. A booking confirmation email will be sent to your registered email address within 24 hours of payment.

For group bookings (8+ passengers), special payment terms may apply. Contact us via WhatsApp for details.`,
  },
  {
    title: '4. Cancellations and Refunds',
    body: `Cancellation policies vary by service type:

Flights: Subject to the airline's fare rules. Non-refundable fares will not be refunded. Walz Travels service fees (where applicable) are non-refundable.

Hotels: Subject to the hotel's cancellation policy as displayed at the time of booking. Free cancellation periods apply where specified.

Tours: Private tours cancelled more than 14 days before the start date receive a full refund minus the booking fee. Cancellations within 14 days are non-refundable unless the tour operator grants an exception.

Visa Services: Non-refundable once the application has been submitted to the embassy or processing centre. If we cancel a service before submission, a full refund will be issued.

To cancel a booking, contact us at contact@walztravels.com or via WhatsApp.`,
  },
  {
    title: '5. Visa Assistance',
    body: `Walz Travels assists with visa applications but cannot guarantee approval. Visa decisions are made solely by the relevant embassy or immigration authority. We will not be liable for any losses arising from a visa refusal.

Our 90%+ approval rate reflects the quality of our document preparation, not a guarantee of success. We will provide a full assessment of your eligibility before proceeding.

Clients must provide accurate and complete information. Providing false information may result in criminal liability and permanent visa bans.`,
  },
  {
    title: '6. Travel Documents',
    body: `You are responsible for ensuring that you hold a valid passport and any required visas, vaccinations or permits for your destination. Walz Travels will assist where requested but is not liable for denied boarding or entry due to inadequate documentation.

Passports must typically have at least 6 months validity beyond your return date. Check specific entry requirements with the relevant embassy.`,
  },
  {
    title: '7. Liability',
    body: `Walz Travels acts as an agent for airlines, hotels and tour operators. We are not liable for:

• Changes, cancellations or delays made by airlines or accommodation providers
• Loss, damage or theft of personal property during travel
• Injury, illness or death arising from activities during your trip
• Force majeure events (natural disasters, pandemics, political instability, etc.)

Our maximum liability to you shall not exceed the total amount paid for the affected booking, except where prohibited by applicable law.

We strongly recommend purchasing comprehensive travel insurance.`,
  },
  {
    title: '8. Gift Vouchers',
    body: `Walz Travels gift vouchers are valid for 12 months from the date of purchase. They are non-transferable and cannot be exchanged for cash. Lost or stolen vouchers cannot be replaced.

Vouchers can be redeemed against flights, hotels, private tours and visa services. They cannot be used toward gift voucher purchases.`,
  },
  {
    title: '9. Intellectual Property',
    body: `All content on this website — including text, images, logos, designs and software — is owned by or licensed to Walz Travels and is protected by copyright law. You may not reproduce, distribute or create derivative works without our written permission.`,
  },
  {
    title: '10. Privacy',
    body: `Use of your personal data is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using our services, you consent to the collection and use of your data as described in our Privacy Policy.`,
  },
  {
    title: '11. Governing Law',
    body: `These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.

If you have a complaint, please contact us first at contact@walztravels.com. We will make every effort to resolve issues amicably.`,
  },
  {
    title: '12. Changes to These Terms',
    body: `We may update these Terms at any time. Material changes will be notified by email or via a notice on our website. Continued use of our services after changes take effect constitutes acceptance of the updated Terms.`,
  },
  {
    title: '13. Contact',
    body: `Walz Travels Ltd
1 Commercial Street, London, E1 6RF
Email: contact@walztravels.com
WhatsApp: +44 7398 753797`,
  },
]

export default function TermsPage() {
  const lastUpdated = 'June 2025'

  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Header */}
      <div className="bg-[#0B1F3A] py-14 lg:py-20 px-5 text-center">
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Legal</p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Terms of Service</h1>
        <p className="text-white/40 text-sm">Last updated: {lastUpdated}</p>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl p-5 mb-10">
          <p className="text-[#0B1F3A] text-sm leading-relaxed">
            <strong>Key points:</strong> Walz Travels acts as your travel agent, not the airline or hotel. Visa approvals are not guaranteed. Cancellation terms vary by service type. Questions? <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">Contact us</a>.
          </p>
        </div>

        <div className="space-y-10">
          {SECTIONS.map(({ title, body }) => (
            <section key={title}>
              <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-3">{title}</h2>
              <div className="text-[#0B1F3A]/65 text-sm leading-relaxed whitespace-pre-line">{body}</div>
            </section>
          ))}
        </div>

        {/* Footer links */}
        <div className="mt-14 pt-8 border-t border-[#E2D9CC] flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-[#C9A84C] hover:underline font-medium">Privacy Policy</Link>
          <Link href="/help/cancellations" className="text-[#C9A84C] hover:underline font-medium">Cancellation Policy</Link>
          <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline font-medium">Contact Us</a>
        </div>

      </div>
    </div>
  )
}
