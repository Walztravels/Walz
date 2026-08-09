// Central business configuration — single source of truth for contact details,
// office locations, and brand identity.

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
