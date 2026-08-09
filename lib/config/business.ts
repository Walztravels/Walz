// Central business configuration — single source of truth for contact details,
// office locations, and brand identity.
//
// THREE UNKNOWN NUMBERS REQUIRE OWNER DECISION BEFORE DEPLOYMENT:
//   +1 786 797 7884 — app/admin/settings/emails/page.tsx (×3), app/visa/apply/confirmation/page.tsx,
//                     app/api/admin/clients/route.ts (email template). Appears to be Jade AI line.
//   +44 7389 753787 — app/payment/cancel/page.tsx, app/api/admin/payment-links/send/route.ts.
//                     Appears in payment-failure client journey.
//   +44 7459 327417 — app/(public)/group/[sessionId]/itinerary/page.tsx (×2).
//                     Appears in group booking WhatsApp CTAs.
//
// Do NOT update those files until Seyi confirms ownership of each number.

export const BUSINESS = {
  brand: 'Walz Travels',
  contacts: {
    globalWhatsapp:  { display: '+1 231 790 2336', e164: '12317902336' },
    nigeriaWhatsapp: { display: '+234 707 769 1701', e164: '2347077691701' },
    emergencyPhone:  { display: '+1 984 388 0110', e164: '19843880110' },
    email:           'contact@walztravels.com',
    visaEmail:       'visa@walztravels.com',
  },
  offices: [
    { city: 'London',  country: 'United Kingdom',        active: true },
    { city: 'Toronto', country: 'Canada',                active: true },
    { city: 'Dubai',   country: 'United Arab Emirates',  active: true },
    { city: 'Lagos',   country: 'Nigeria',               active: true },
    { city: 'Accra',   country: 'Ghana',                 active: true },
  ],
} as const

/** Build a WhatsApp deep-link. `text` is pre-filled message (optional). */
export const waLink = (e164: string, text?: string) =>
  `https://wa.me/${e164}${text ? `?text=${encodeURIComponent(text)}` : ''}`
