import Link from 'next/link'
import { Globe, Mail, MapPin, MessageCircle, Award, Lock, Phone } from 'lucide-react'

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

// X (Twitter) SVG
function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com/walztravels', Icon: InstagramIcon },
  { label: 'Facebook',  href: 'https://facebook.com/walztravels',  Icon: FacebookIcon  },
  { label: 'X',  href: 'https://x.com/walztravels', Icon: XIcon },
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
              Walz Travels helps clients book flights, hotels, tours, visas, insurance and transfers with expert support from start to finish.
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

            {/* Additional Contact Info */}
            <div className="p-4 rounded-xl bg-walz-slate/30 border border-walz-slate/50 mb-6">
              <p className="text-walz-gold text-xs font-semibold mb-2">Enquiries</p>
              <div className="space-y-1 text-sm text-walz-muted">
                <p>Visa enquiries: <a href="mailto:visa@walztravels.com" className="text-walz-off-white hover:text-walz-gold">visa@walztravels.com</a></p>
                <p>Group & corporate: <a href="mailto:groups@walztravels.com" className="text-walz-off-white hover:text-walz-gold">groups@walztravels.com</a></p>
              </div>
              <div className="mt-3 pt-3 border-t border-walz-slate/50">
                <p className="text-walz-gold text-xs font-semibold mb-1">Emergency Support</p>
                <a href="tel:+19843880110" className="flex items-center gap-2 text-walz-off-white hover:text-walz-gold">
                  <Phone className="w-4 h-4" />
                  +1 984 388 0110
                </a>
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
