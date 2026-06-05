import Link from 'next/link'
import { Globe, Mail, MapPin, MessageCircle, Award, Lock } from 'lucide-react'

const footerLinks = {
  services: [
    { label: 'Flight Booking', href: '/flights' },
    { label: 'Hotel Booking', href: '/hotels' },
    { label: 'Private Tours', href: '/tours' },
    { label: 'Visa Assistance', href: '/visa' },
    { label: 'Travel Insurance', href: '/insurance' },
    { label: 'Airport Transfers', href: '/transfers' },
  ],
  company: [
    { label: 'About Walz Travels', href: '/about' },
    { label: 'Our Team', href: '/about#team' },
    { label: 'Careers', href: '/careers' },
    { label: 'Press & Media', href: '/press' },
    { label: 'Partners', href: '/partners' },
    { label: 'Affiliates', href: '/affiliates' },
  ],
  support: [
    { label: 'Help Centre', href: '/help' },
    { label: 'Manage Booking', href: '/dashboard' },
    { label: 'Cancellations', href: '/help/cancellations' },
    { label: 'Baggage Policy', href: '/help/baggage' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
}

// Instagram SVG
function InstagramIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  )
}

// Facebook SVG
function FacebookIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

// Snapchat ghost SVG
function SnapchatIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.166 1.001c.096 0 .192.003.288.008 1.808.104 3.454.933 4.636 2.306.792.916 1.228 2.022 1.285 3.29l.012.52.003.337c0 .16-.005.32-.015.48l-.006.082.08.032c.38.147.81.219 1.285.219.126 0 .255-.005.384-.015l.104-.009a.48.48 0 0 1 .347.154.466.466 0 0 1-.04.66c-.388.329-.796.594-1.214.79a5.23 5.23 0 0 1-.67.258l-.116.032-.013.12a5.516 5.516 0 0 1-.111.633c-.028.107-.082.2-.154.27-.07.066-.158.105-.256.105-.08 0-.157-.02-.23-.06l-.164-.09c-.52-.284-1.098-.428-1.717-.428-.356 0-.703.054-1.033.163l-.146.055c.21.405.37.833.472 1.276.13.573.165 1.18.102 1.804a6.32 6.32 0 0 1-.52 1.928c-.414.884-1.023 1.612-1.763 2.108a4.72 4.72 0 0 1-1.007.492l-.11.034c.007.038.017.075.028.113.07.24.185.465.34.669.322.425.77.754 1.296.952.2.075.394.13.58.163.228.04.385.052.456.052.153 0 .3-.017.437-.051l.08-.022a.474.474 0 0 1 .403.086.47.47 0 0 1 .161.363v.02a.473.473 0 0 1-.31.44 6.296 6.296 0 0 1-1.028.265c-.263.044-.528.068-.79.072l-.1.001c-.3 0-.573-.036-.804-.107a3.822 3.822 0 0 1-.514-.196c-.418-.2-.8-.476-1.13-.815-.16-.162-.298-.328-.413-.496l-.046-.07-.048.07c-.115.168-.253.334-.413.496-.33.34-.712.615-1.13.815a3.822 3.822 0 0 1-.514.196c-.23.071-.503.107-.804.107l-.1-.001a5.71 5.71 0 0 1-.79-.072 6.296 6.296 0 0 1-1.028-.265.473.473 0 0 1-.31-.44v-.02a.47.47 0 0 1 .161-.363.474.474 0 0 1 .403-.086l.08.022c.137.034.284.051.437.051.07 0 .228-.013.456-.052.186-.033.38-.088.58-.163.526-.198.974-.527 1.296-.952.155-.204.27-.429.34-.669.011-.038.021-.075.028-.113l-.11-.034a4.72 4.72 0 0 1-1.007-.492c-.74-.496-1.349-1.224-1.763-2.108a6.32 6.32 0 0 1-.52-1.928c-.063-.624-.028-1.23.102-1.804.102-.443.262-.871.472-1.276l-.146-.055a3.372 3.372 0 0 0-1.033-.163c-.619 0-1.197.144-1.717.428l-.164.09c-.073.04-.15.06-.23.06-.098 0-.186-.04-.256-.105a.568.568 0 0 1-.154-.27 5.516 5.516 0 0 1-.111-.633l-.013-.12-.116-.032a5.23 5.23 0 0 1-.67-.258c-.418-.196-.826-.461-1.214-.79a.466.466 0 0 1-.04-.66.48.48 0 0 1 .347-.154l.104.009c.129.01.258.015.384.015.475 0 .905-.072 1.285-.219l.08-.032-.006-.082a7.29 7.29 0 0 1-.015-.48l.003-.337.012-.52c.057-1.268.493-2.374 1.285-3.29C8.546 1.94 10.192 1.11 12 1.005l.166-.004z"/>
    </svg>
  )
}

const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com/walztravels', Icon: InstagramIcon },
  { label: 'Facebook',  href: 'https://facebook.com/walztravels',  Icon: FacebookIcon  },
  { label: 'Snapchat',  href: 'https://snapchat.com/add/walztravels', Icon: SnapchatIcon },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-walz-deep-navy text-walz-off-white">
      {/* Main Footer */}
      <div className="container-walz py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">

          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6 group">
              <div className="w-10 h-10 rounded-xl walz-gold-gradient flex items-center justify-center shadow-gold-glow">
                <Globe className="w-5 h-5 text-walz-deep-navy" />
              </div>
              <div>
                <div className="font-display text-xl font-bold text-white">
                  Walz <span className="text-walz-gold">Travels</span>
                </div>
                <div className="text-walz-muted text-[10px] tracking-widest uppercase">
                  Luxury Travel Agency
                </div>
              </div>
            </Link>

            <p className="text-walz-muted text-sm leading-relaxed mb-6 max-w-sm">
              Your trusted partner for luxury travel experiences worldwide.
              IATA certified specialists in flights, tours, visas and hotels.
            </p>

            {/* Contact Info */}
            <div className="space-y-3 mb-6">
              {/* WhatsApp UK */}
              <a
                href="https://wa.me/447398753797"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-walz-muted hover:text-walz-gold transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500 transition-colors">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-walz-off-white font-medium text-xs">WhatsApp UK</div>
                  <div>+44 7398 753797</div>
                </div>
              </a>

              {/* WhatsApp Canada */}
              <a
                href="https://wa.me/15557107823"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-walz-muted hover:text-walz-gold transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500 transition-colors">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-walz-off-white font-medium text-xs">WhatsApp Canada</div>
                  <div>+1 555 710 7823</div>
                </div>
              </a>

              {/* Email */}
              <a
                href="mailto:contact@walztravels.com"
                className="flex items-center gap-3 text-sm text-walz-muted hover:text-walz-gold transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-walz-slate flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-walz-gold" />
                </div>
                <div>
                  <div className="text-walz-off-white font-medium text-xs">Email</div>
                  <div>contact@walztravels.com</div>
                </div>
              </a>

              <div className="flex items-center gap-3 text-sm text-walz-muted">
                <div className="w-8 h-8 rounded-lg bg-walz-slate flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-walz-gold" />
                </div>
                <div>
                  <div className="text-walz-off-white font-medium text-xs">Office</div>
                  <div>1 Commercial Street, London, E1 6RF</div>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center gap-2">
              {socialLinks.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-lg bg-walz-slate hover:bg-walz-slate/80 flex items-center justify-center text-walz-muted hover:text-walz-gold transition-all hover:-translate-y-0.5"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-walz-white font-semibold text-sm tracking-wide uppercase mb-4 flex items-center gap-2">
              <span className="w-4 h-0.5 bg-walz-gold" />
              Services
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.services.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-walz-muted hover:text-walz-gold transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-walz-white font-semibold text-sm tracking-wide uppercase mb-4 flex items-center gap-2">
              <span className="w-4 h-0.5 bg-walz-gold" />
              Company
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.company.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-walz-muted hover:text-walz-gold transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-walz-white font-semibold text-sm tracking-wide uppercase mb-4 flex items-center gap-2">
              <span className="w-4 h-0.5 bg-walz-gold" />
              Support
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.support.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-walz-muted hover:text-walz-gold transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Call Jade */}
            <div className="mt-6 p-3 rounded-xl bg-walz-slate/50 border border-walz-slate">
              <p className="text-walz-gold text-xs font-semibold mb-1">Call Jade — 24/7</p>
              <a
                href="tel:+19843880110"
                className="text-walz-off-white text-sm font-medium hover:text-walz-gold transition-colors"
              >
                +1 984 388 0110
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-walz-slate/50">
        <div className="container-walz py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-walz-slate/30 border border-walz-slate/50">
                <Award className="w-4 h-4 text-walz-gold" />
                <span className="text-walz-muted text-xs font-medium">IATA Certified</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-walz-slate/30 border border-walz-slate/50">
                <Lock className="w-4 h-4 text-walz-gold" />
                <span className="text-walz-muted text-xs font-medium">Stripe Secured</span>
              </div>
            </div>

            <p className="text-walz-muted text-xs text-center sm:text-right">
              © {currentYear} Walz Travels Ltd. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
