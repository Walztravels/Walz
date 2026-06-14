'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Mail, MapPin, MessageCircle, Award, Lock } from 'lucide-react'

const LOGO_CACHE_KEY = 'walz_logo_url'
const LOGO_CACHE_TTL  = 60 * 60 * 1000

function FooterLogo() {
  const [src, setSrc] = useState('/walz-logo.svg')

  useEffect(() => {
    function load() {
      fetch('/api/media/logo_main')
        .then(r => r.json())
        .then((d: { url?: string | null }) => {
          if (d.url) {
            setSrc(d.url)
            try { localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify({ url: d.url, ts: Date.now() })) } catch { }
          }
        }).catch(() => {})
    }
    let hit = false
    try {
      const raw = localStorage.getItem(LOGO_CACHE_KEY)
      if (raw) {
        const { url, ts } = JSON.parse(raw) as { url: string; ts: number }
        if (url && Date.now() - ts < LOGO_CACHE_TTL) { setSrc(url); hit = true }
      }
    } catch { }
    if (!hit) load()
    const onUpdate = () => { try { localStorage.removeItem(LOGO_CACHE_KEY) } catch { } load() }
    window.addEventListener('walz:logo-updated', onUpdate)
    return () => window.removeEventListener('walz:logo-updated', onUpdate)
  }, [])

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Walz Travels" className="w-[120px] h-auto object-contain group-hover:opacity-90 transition-opacity" />
}

const footerLinks = {
  services: [
    { label: 'Flight Booking', href: '/flights' },
    { label: 'Hotel Booking', href: '/hotels' },
    { label: 'Private Tours', href: '/tours' },
    { label: 'Visa Assistance', href: '/visa' },
    { label: 'Gift Vouchers', href: '/gift' },
    { label: 'Travel Insurance', href: '/insurance' },
    { label: 'Airport Transfers', href: '/transfers' },
  ],
  company: [
    { label: 'About Walz Travels', href: '/about' },
    { label: 'Our Team', href: '/about#team' },
    { label: 'Travel Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Press & Media', href: '/press' },
    { label: 'Partners', href: '/partners' },
  ],
  support: [
    { label: 'Help Centre', href: '/help' },
    { label: 'Manage Booking', href: '/portal/dashboard' },
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

function SnapchatIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://us.chat-img.sintra.ai/aeb90658-6cce-491a-8a0f-bfc14a8cdc69/d3d4f144-3dac-4ceb-a778-a535493d0156/snapchat-icon-walz-travels.png"
      alt="Snapchat"
      className="w-4 h-4 object-contain"
    />
  )
}

// LinkedIn SVG
function LinkedInIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

// YouTube SVG
function YouTubeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}

// X (Twitter) SVG
function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com/walztravels',            Icon: InstagramIcon },
  { label: 'Facebook',  href: 'https://facebook.com/walztravels',             Icon: FacebookIcon  },
  { label: 'Snapchat',  href: 'https://snapchat.com/add/walztravels',         Icon: SnapchatIcon  },
  { label: 'LinkedIn',  href: 'https://linkedin.com/company/walztravels',     Icon: LinkedInIcon  },
  { label: 'YouTube',   href: 'https://youtube.com/@walztravels',             Icon: YouTubeIcon   },
  { label: 'X',         href: 'https://x.com/walztravels',                    Icon: XIcon         },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-walz-deep-navy text-walz-off-white pb-[100px] sm:pb-0">
      {/* Main Footer */}
      <div className="container-walz py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">

          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex mb-6 group">
              <FooterLogo />
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
                  <div className="text-walz-off-white font-medium text-xs">Locations</div>
                  <div>London · Toronto · Dubai · Lagos · Accra</div>
                </div>
              </div>

              <div className="pt-2 mt-1 border-t border-walz-slate/40 space-y-1.5 text-xs text-walz-muted">
                <div className="text-walz-off-white font-medium text-[11px] uppercase tracking-wide mb-2">Enquiries</div>
                <div>📄 Visa enquiries: <a href="mailto:visa@walztravels.com" className="hover:text-walz-gold transition-colors">visa@walztravels.com</a></div>
                <div>✈️ Group &amp; corporate travel: <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer" className="hover:text-walz-gold transition-colors">WhatsApp us</a></div>
                <div>🚨 Emergency support: <a href="tel:+19843880110" className="hover:text-walz-gold transition-colors">+1 984 388 0110</a></div>
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
