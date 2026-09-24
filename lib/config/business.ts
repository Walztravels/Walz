// Central business configuration — single source of truth for contact details,
// office locations, and brand identity.

// The Walz Travels PHONE (call) number and WHATSAPP number are the SAME
// number. Both entries below deliberately share this one value so the two
// can never drift apart again (a stale, separately-typed copy of the phone
// number is how a wrong number ended up on the live site).
const MAIN_LINE = { display: '+1 231 790 2336', e164: '12317902336' } as const

export const BUSINESS = {
  brand: 'Walz Travels',
  contacts: {
    globalWhatsapp:  MAIN_LINE,
    visaWhatsapp:    { display: '+44 7949 448680', e164: '447949448680' },
    nigeriaWhatsapp: { display: '+234 707 769 1701', e164: '2347077691701' },
    emergencyPhone:  MAIN_LINE,
    email:              'contact@walztravels.com',
    reservationsEmail:  'reservations@walztravels.com',
    visaEmail:          'visa@walztravels.com',
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
