/**
 * Single source of truth for the Privacy Policy and Terms of Service page
 * content, migrated onto the existing SiteContent key-value model (see
 * app/api/admin/content/site/route.ts DEFAULTS — the same generic
 * key/value/label/group pattern already used for the About/Homepage/General
 * groups, extended here with two new groups: 'privacy' and 'terms').
 *
 * Shape: one row per editable field, matching the existing granularity
 * (e.g. `about_company_story` is one paragraph block). Each legal section
 * becomes two SiteContent keys — `${key}_title` and `${key}_body` — so an
 * admin can edit a section's heading and body independently, the same way
 * the About tab edits each paragraph block independently.
 *
 * This module is imported by:
 *   - app/api/admin/content/site/route.ts   (DEFAULTS for the admin editor)
 *   - app/privacy/page.tsx / app/terms/page.tsx (verbatim fallback + key list)
 *   - scripts/seed-legal-content.ts          (initial DB seed)
 * so the verbatim legal text is written exactly once and never risks
 * drifting between the admin defaults, the seed data and the public fallback.
 *
 * Note on dynamic fields: the original hardcoded pages interpolated
 * LEGAL_ENTITIES.uk.registeredOffice / tradingAddress and
 * BUSINESS.contacts.globalWhatsapp.display into a couple of sections
 * (Privacy §1 "Who We Are", Privacy §12 "Contact Us", Terms §14 "Contact").
 * Both address fields are currently empty ('' — "OWNER INPUT REQUIRED" per
 * lib/config/legal-entities.ts), so today's *rendered* text already excludes
 * them. The values below freeze that same resolved output as static text,
 * matching the existing SiteContent convention (every other value in this
 * table is already a static string, no field is live-templated). If the
 * registered office / trading address are filled in later, the
 * `privacy_s1`, `privacy_s12` and `terms_s14` rows will need a manual update
 * too, since they are no longer bound to lib/config/legal-entities.ts.
 */

export interface LegalSection {
  /** SiteContent key prefix -> `${key}_title` / `${key}_body` */
  key: string
  title: string
  body: string
  /** Preserves an HTML id for external deep links (e.g. Meta's data-deletion callback URL) */
  anchorId?: string
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    key: 'privacy_s1',
    title: '1. Who We Are',
    body: `Walz Travels Ltd ("Walz Travels", "we", "us" or "our") is a travel agency operating in the United Kingdom.

We operate the website walztravels.com and related services including flight booking, hotel booking, private tours, visa assistance and gift vouchers.

For any privacy-related queries, contact us at: contact@walztravels.com`,
  },
  {
    key: 'privacy_s2',
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
    key: 'privacy_s3',
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
    key: 'privacy_s4',
    title: '4. Legal Basis for Processing',
    body: `We process your personal data on the following legal bases:

• Contract performance: to fulfil a booking or service you have requested
• Legitimate interests: to improve our services, prevent fraud and manage our business
• Legal obligation: to comply with financial, tax and travel-industry regulations
• Consent: for marketing emails and non-essential cookies (you may withdraw consent at any time)`,
  },
  {
    key: 'privacy_s5',
    title: '5. Data Sharing',
    body: `We share your data only as necessary to deliver our services:

• Airlines and Global Distribution Systems (Sabre GDS) — for flight bookings
• Hotels and accommodation providers — for hotel reservations
• Embassy or visa processing centres — for visa applications
• Stripe — for secure payment processing
• Resend — for transactional email delivery
• Supabase — for secure database hosting (EU region)
• Our WhatsApp business support team

We do not sell your personal data to third parties for marketing purposes.

Mobile information — including your mobile phone number and your SMS opt-in consent — will not be shared with third parties or affiliates for marketing or promotional purposes. Your SMS consent and the phone number you provide for SMS are excluded from every category of data sharing described above: they are used only by Walz Travels to send you the messages you asked to receive.`,
  },
  {
    key: 'privacy_s6',
    title: '6. Data Retention',
    body: `We retain your personal data for as long as necessary to:

• Provide ongoing services and maintain booking records (typically 7 years for financial records)
• Comply with applicable laws and regulations
• Resolve disputes and enforce agreements

When data is no longer required, we securely delete or anonymise it.`,
  },
  {
    key: 'privacy_s7',
    title: '7. Your Rights',
    anchorId: 'data-deletion',
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
    key: 'privacy_s8',
    title: '8. Cookies',
    body: `We use cookies to:

• Keep you signed in to your Walz Travels account (essential cookies)
• Remember your search preferences (functional cookies)
• Measure website traffic and performance (analytics cookies via privacy-respecting tools)

You can control non-essential cookies through your browser settings. Disabling essential cookies will affect your ability to use the booking platform.`,
  },
  {
    key: 'privacy_s9',
    title: '9. International Transfers',
    body: `Some of our service providers (such as Sabre GDS) may process data outside the UK or EEA. Where this occurs, we ensure appropriate safeguards are in place (e.g. Standard Contractual Clauses or adequacy decisions) to protect your data.`,
  },
  {
    key: 'privacy_s10',
    title: '10. Security',
    body: `We implement appropriate technical and organisational measures to protect your personal data, including:

• HTTPS encryption for all data in transit
• Secure, access-controlled database infrastructure (Supabase)
• Payment data handled exclusively by PCI-DSS compliant Stripe
• Restricted staff access to personal data on a need-to-know basis`,
  },
  {
    key: 'privacy_s11',
    title: '11. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or via a prominent notice on our website. Continued use of our services after changes take effect constitutes acceptance of the updated policy.`,
  },
  {
    key: 'privacy_s12',
    title: '12. Contact Us',
    body: `For any privacy-related questions, requests or complaints:

Email: contact@walztravels.com
WhatsApp: +1 231 790 2336
Post: Walz Travels Ltd

If you are unsatisfied with our response, you have the right to lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk.`,
  },
]

export const TERMS_SECTIONS: LegalSection[] = [
  {
    key: 'terms_s1',
    title: '1. About These Terms',
    body: `These Terms of Service ("Terms") govern your use of the Walz Travels website (walztravels.com) and all related booking services operated by Walz Travels Ltd ("Walz Travels", "we", "us" or "our").

By accessing our website or placing a booking, you agree to be bound by these Terms. If you do not agree, please do not use our services.`,
  },
  {
    key: 'terms_s2',
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
    key: 'terms_s3',
    title: '3. Bookings and Payments',
    body: `All prices are displayed in the relevant currency and include applicable fees unless stated otherwise. Fares and availability are subject to change until a booking is confirmed and paid in full.

Payment is processed securely by Stripe. We do not store your card details. A booking confirmation email will be sent to your registered email address within 24 hours of payment.

For group bookings (8+ passengers), special payment terms may apply. Contact us via WhatsApp for details.`,
  },
  {
    key: 'terms_s4',
    title: '4. Cancellations and Refunds',
    body: `Cancellation policies vary by service type:

Flights: Subject to the airline's fare rules. Non-refundable fares will not be refunded. Walz Travels service fees (where applicable) are non-refundable.

Hotels: Subject to the hotel's cancellation policy as displayed at the time of booking. Free cancellation periods apply where specified.

Tours: Private tours cancelled more than 14 days before the start date receive a full refund minus the booking fee. Cancellations within 14 days are non-refundable unless the tour operator grants an exception.

Visa Services: Non-refundable once the application has been submitted to the embassy or processing centre. If we cancel a service before submission, a full refund will be issued.

To cancel a booking, contact us at contact@walztravels.com or via WhatsApp.`,
  },
  {
    key: 'terms_s5',
    title: '5. Visa Assistance',
    body: `Walz Travels assists with visa applications but cannot guarantee approval. Visa decisions are made solely by the relevant embassy or immigration authority. We will not be liable for any losses arising from a visa refusal.

Our 90%+ approval rate reflects the quality of our document preparation, not a guarantee of success. We will provide a full assessment of your eligibility before proceeding.

Clients must provide accurate and complete information. Providing false information may result in criminal liability and permanent visa bans.`,
  },
  {
    key: 'terms_s6',
    title: '6. Travel Documents',
    body: `You are responsible for ensuring that you hold a valid passport and any required visas, vaccinations or permits for your destination. Walz Travels will assist where requested but is not liable for denied boarding or entry due to inadequate documentation.

Passports must typically have at least 6 months validity beyond your return date. Check specific entry requirements with the relevant embassy.`,
  },
  {
    key: 'terms_s7',
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
    key: 'terms_s8',
    title: '8. Gift Vouchers',
    body: `Walz Travels gift vouchers are valid for 12 months from the date of purchase. They are non-transferable and cannot be exchanged for cash. Lost or stolen vouchers cannot be replaced.

Vouchers can be redeemed against flights, hotels, private tours and visa services. They cannot be used toward gift voucher purchases.`,
  },
  {
    key: 'terms_s9',
    title: '9. Intellectual Property',
    body: `All content on this website — including text, images, logos, designs and software — is owned by or licensed to Walz Travels and is protected by copyright law. You may not reproduce, distribute or create derivative works without our written permission.`,
  },
  {
    key: 'terms_s10',
    title: '10. Privacy',
    body: `Use of your personal data is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using our services, you consent to the collection and use of your data as described in our Privacy Policy.`,
  },
  {
    key: 'terms_s11',
    title: '11. Governing Law',
    body: `These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.

If you have a complaint, please contact us first at contact@walztravels.com. We will make every effort to resolve issues amicably.`,
  },
  {
    key: 'terms_s12',
    title: '12. Changes to These Terms',
    body: `We may update these Terms at any time. Material changes will be notified by email or via a notice on our website. Continued use of our services after changes take effect constitutes acceptance of the updated Terms.`,
  },
  {
    key: 'terms_s13',
    title: '13. SMS Messaging',
    body: `Walz Travels operates separate SMS programmes and you opt in to each one independently. Ticking the box for one does not opt you in to the other, and we will not move you between them without a fresh opt-in.

Customer care SMS: when you tick the SMS consent box on a Walz Travels booking, enquiry or application form, you agree to receive text messages from Walz Travels about your bookings, travel arrangements, visa and application updates, customer support requests, payment reminders and other service-related communications. Consent is not a condition of purchase — you can complete any booking or application without ticking the box.

Marketing SMS: promotional and marketing text messages are a separate opt-in. We will never send them on the basis of your customer care consent alone.

For both programmes: message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, or reply HELP for help. You can also email contact@walztravels.com to be removed. Carriers are not liable for delayed or undelivered messages.

We do not sell or share your mobile information — including your phone number and your SMS consent — with third parties or affiliates for marketing or promotional purposes. See our Privacy Policy for details.`,
  },
  {
    key: 'terms_s14',
    title: '14. Contact',
    body: `Walz Travels Ltd
Email: contact@walztravels.com
WhatsApp: +1 231 790 2336`,
  },
]
