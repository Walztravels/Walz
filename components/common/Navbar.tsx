'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSettings } from '@/lib/settings-context'
import { whatsappLink } from '@/lib/site-settings'
import { useSession, signOut } from 'next-auth/react'
import {
  Menu, X, Plane, Building2, Map, FileText, ChevronDown,
  User, LogOut, LayoutDashboard, Gift, MessageCircle,
  Upload, CreditCard, Users, UserCircle, Globe, Compass,
  Signal, Wifi, Check, MapPin, Car, Package, ShoppingCart, BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/lib/context/CurrencyContext'
import { CURRENCIES } from '@/lib/currencies'
import { useCart } from '@/lib/context/CartContext'

const LOGO_CACHE_KEY = 'walz_logo_url'
const LOGO_CACHE_TTL = 60 * 60 * 1000 // 1 hour

const navLinks = [
  { href: '/flights',  label: 'Flights',       icon: Plane     },
  { href: '/hotels',   label: 'Hotels',        icon: Building2 },
  { href: '/blog',     label: 'Blog',          icon: BookOpen  },
  { href: '/esim',     label: 'Jade Connect',  icon: Wifi      },
  { href: '/about',    label: 'About',         icon: Users     },
  { href: '/gift',     label: 'Gift Vouchers', icon: Gift      },
]

const experienceLinks = [
  { href: '/group/create', label: 'Group Trips', sub: 'Plan together with Jade',                   icon: Users   },
  { href: '/activities',   label: 'Activities',  sub: 'Things to do in 100+ destinations',         icon: MapPin  },
  { href: '/transfers',    label: 'Transfers',   sub: 'Airport & hotel transfers worldwide',        icon: Car     },
  { href: '/tours',        label: 'Tours',       sub: 'Private guided tours with local experts',   icon: Map     },
  { href: '/packages',     label: 'Packages',    sub: 'All-inclusive group packages & bundles',    icon: Package },
]

const visaDropdownLinks = [
  { href: '/visa',           label: 'Visa Intelligence',  sub: 'Check any passport + destination', icon: Globe,    divider: false },
  { href: '/visa#checker',   label: 'Check Requirements', sub: 'Instant visa requirement lookup',  icon: FileText, divider: false },
  { href: '/visa/uk',        label: 'UK Visa',            sub: 'British visa requirements',        icon: FileText, divider: true  },
  { href: '/visa/canada',    label: 'Canada Visa',        sub: 'eTA & visitor visa',               icon: FileText, divider: false },
  { href: '/visa/uae',       label: 'UAE Visa',           sub: 'Dubai, Abu Dhabi & beyond',        icon: FileText, divider: false },
  { href: '/visa/schengen',  label: 'Schengen Visa',      sub: '27 European countries',            icon: FileText, divider: false },
  { href: '/visa/usa',       label: 'USA Visa',           sub: 'ESTA, B-1/B-2 & transit',         icon: FileText, divider: false },
  { href: '/visa#directory', label: 'All Countries',      sub: 'Browse 15+ destinations',          icon: Globe,    divider: true  },
]

const portalMenu = [
  { href: '/dashboard',          label: 'My Dashboard',    icon: LayoutDashboard },
  { href: '/plan/library',       label: 'My Trips',        icon: Compass         },
  { href: '/portal/application', label: 'My Applications', icon: FileText        },
  { href: '/dashboard',          label: 'My Bookings',     icon: Plane           },
  { href: '/dashboard',          label: 'My Vouchers',     icon: Gift            },
  { href: '/portal/documents',   label: 'My Documents',    icon: Upload          },
  { href: '/portal/esims',       label: 'My eSIMs',        icon: Signal          },
  { href: '/portal/payments',    label: 'My Payments',     icon: CreditCard      },
  { href: '/portal/referral',    label: 'Refer a Friend',  icon: Users           },
  { href: '/portal/profile',     label: 'Profile Settings',icon: UserCircle      },
]

export function Navbar() {
  const settings = useSettings()
  const { data: session, status } = useSession()
  const [isScrolled,       setIsScrolled]       = useState(false)
  const [isMobileOpen,     setIsMobileOpen]     = useState(false)
  const [isUserMenuOpen,   setIsUserMenuOpen]   = useState(false)
  const [isVisaOpen,           setIsVisaOpen]           = useState(false)
  const [isMobileVisaOpen,     setIsMobileVisaOpen]     = useState(false)
  const [isExperiencesOpen,    setIsExperiencesOpen]    = useState(false)
  const [isMobileExpOpen,      setIsMobileExpOpen]      = useState(false)
  const [isCurrencyOpen,   setIsCurrencyOpen]   = useState(false)
  const [logoUrl,          setLogoUrl]          = useState('/walz-logo.png')
  const dropdownRef    = useRef<HTMLDivElement>(null)
  const visaRef        = useRef<HTMLDivElement>(null)
  const experiencesRef = useRef<HTMLDivElement>(null)
  const currencyRef    = useRef<HTMLDivElement>(null)

  const { selectedCurrency, setSelectedCurrency } = useCurrency()
  const activeCurrency = CURRENCIES.find(c => c.code === selectedCurrency) ?? CURRENCIES[0]
  const pathname = usePathname()
  const isHome   = pathname === '/'
  const { itemCount } = useCart()

  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Dynamic logo — fetch from site_media, cache 1 hour in localStorage
  useEffect(() => {
    function loadFromApi() {
      fetch('/api/media/logo_main')
        .then(r => r.json())
        .then((d: { url?: string | null }) => {
          if (d.url) {
            setLogoUrl(d.url)
            try {
              localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify({ url: d.url, ts: Date.now() }))
            } catch { /* storage unavailable */ }
          }
        })
        .catch(() => { /* keep static fallback */ })
    }

    // Try localStorage cache first
    let cacheHit = false
    try {
      const raw = localStorage.getItem(LOGO_CACHE_KEY)
      if (raw) {
        const { url, ts } = JSON.parse(raw) as { url: string; ts: number }
        if (url && Date.now() - ts < LOGO_CACHE_TTL) {
          setLogoUrl(url)
          cacheHit = true
        }
      }
    } catch { /* ignore */ }
    if (!cacheHit) loadFromApi()

    // Admin uploads a new logo → clear cache and refetch
    const onLogoUpdated = () => {
      try { localStorage.removeItem(LOGO_CACHE_KEY) } catch { /* ignore */ }
      loadFromApi()
    }
    window.addEventListener('walz:logo-updated', onLogoUpdated)
    return () => window.removeEventListener('walz:logo-updated', onLogoUpdated)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isMobileOpen])

  // Close user dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    if (isUserMenuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isUserMenuOpen])

  // Close visa dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (visaRef.current && !visaRef.current.contains(e.target as Node)) {
        setIsVisaOpen(false)
      }
    }
    if (isVisaOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isVisaOpen])

  // Close experiences dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (experiencesRef.current && !experiencesRef.current.contains(e.target as Node)) {
        setIsExperiencesOpen(false)
      }
    }
    if (isExperiencesOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isExperiencesOpen])

  // Close currency dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setIsCurrencyOpen(false)
      }
    }
    if (isCurrencyOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isCurrencyOpen])

  const firstName = session?.user?.name?.split(' ')[0] || 'Account'
  const initial   = session?.user?.name?.[0]?.toUpperCase()
              || session?.user?.email?.[0]?.toUpperCase()
              || 'W'

  const navDark = isScrolled || !isHome || isMobileOpen

  return (
    <>
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        navDark
          ? 'bg-walz-deep-navy/97 backdrop-blur-md shadow-luxury'
          : 'bg-transparent',
      )}>
        {/* Utility bar — hidden on homepage when hero is showing */}
        <div className={cn(
          'hidden lg:block border-b border-walz-slate/50 bg-walz-navy/60',
          !navDark && 'hidden',
        )}>
          <div className="container-walz flex items-center justify-between py-1.5 text-xs text-walz-muted">
            <span>Visa support, flights, hotels, tours and group travel — expert help from Walz Travels.</span>
            <a href={whatsappLink(settings.whatsapp_header)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-green-400 hover:text-green-300 transition-colors font-medium">
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp {settings.whatsapp_header_display}
            </a>
          </div>
        </div>

        <div className="container-walz">
          <div className="flex items-center justify-between h-16 lg:h-20">

            {/* Logo */}
            <Link href="/" className="flex items-center group" onClick={() => setIsMobileOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Walz Travels"
                className={`h-10 lg:h-12 w-auto min-w-[100px] max-w-[160px] object-contain group-hover:opacity-90 transition-opacity ${navDark ? 'brightness-0 invert' : ''}`} />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50 transition-all text-sm font-medium tracking-wide">
                  <Icon className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.5} />
                  {label}
                </Link>
              ))}

              {/* Experiences dropdown */}
              <div ref={experiencesRef} className="relative">
                <button
                  onClick={() => { setIsExperiencesOpen(p => !p); setIsVisaOpen(false) }}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all text-sm font-medium',
                    isExperiencesOpen
                      ? 'text-walz-gold bg-walz-slate/50'
                      : 'text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50',
                  )}
                >
                  <Compass className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.5} />
                  <span className="tracking-wide">Experiences</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', isExperiencesOpen && 'rotate-180')} />
                </button>

                {isExperiencesOpen && (
                  <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-luxury border border-gray-100 overflow-hidden z-50 py-2">
                    {experienceLinks.map(({ href, label, sub, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setIsExperiencesOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                      >
                        <Icon className="w-[14px] h-[14px] flex-shrink-0 mt-1 text-walz-deep-navy" strokeWidth={1.5} />
                        <div>
                          <p className="text-sm font-semibold text-walz-deep-navy">{label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Visa dropdown */}
              <div className="relative" ref={visaRef}>
                <button
                  onClick={() => setIsVisaOpen(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all text-sm font-medium',
                    isVisaOpen
                      ? 'text-walz-gold bg-walz-slate/50'
                      : 'text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50',
                  )}
                >
                  <Globe className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.5} />
                  <span className="tracking-wide">Visa</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', isVisaOpen && 'rotate-180')} />
                </button>

                {isVisaOpen && (
                  <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-luxury border border-walz-border z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-[#0B1F3A]">
                      <p className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider">Visa Intelligence</p>
                      <p className="text-[10px] text-white/40 mt-0.5">199 destinations · live government data</p>
                    </div>
                    <div className="py-1">
                      {visaDropdownLinks.map(({ href, label, sub, icon: Icon, divider }) => (
                        <span key={href}>
                          {divider && <div className="my-1 border-t border-gray-100" />}
                          <Link
                            href={href}
                            onClick={() => setIsVisaOpen(false)}
                            className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#F4F6F9] transition-colors group"
                          >
                            <Icon className="w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#C9A84C] transition-colors leading-tight">{label}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                            </div>
                          </Link>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </nav>

            {/* Currency selector — desktop */}
            <div className="hidden lg:block relative" ref={currencyRef}>
              <button
                onClick={() => setIsCurrencyOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50 transition-all text-sm font-medium"
              >
                <span className="text-base leading-none">{activeCurrency.flag}</span>
                <span>{activeCurrency.code}</span>
                <ChevronDown className={cn('w-3 h-3 transition-transform', isCurrencyOpen && 'rotate-180')} />
              </button>

              {isCurrencyOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-luxury border border-walz-border z-50 overflow-hidden py-1">
                  {CURRENCIES.map(c => (
                    <button
                      key={c.code}
                      onClick={() => { setSelectedCurrency(c.code); setIsCurrencyOpen(false) }}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-walz-deep-navy hover:bg-[#F4F6F9] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-base">{c.flag}</span>
                        <span className="font-medium">{c.code}</span>
                        <span className="text-walz-muted text-xs truncate">{c.name}</span>
                      </span>
                      {c.code === selectedCurrency && (
                        <Check className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart icon — desktop */}
            <Link href="/cart" className="hidden lg:flex relative items-center p-2 rounded-lg text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50 transition-all">
              <ShoppingCart className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#C9A84C] text-[#0B1F3A]
                  text-[10px] font-bold rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>

            {/* Desktop Auth */}
            <div className="hidden lg:flex items-center gap-3">
              {status === 'loading' ? (
                <div className="w-8 h-8 rounded-full bg-walz-slate animate-pulse" />
              ) : session ? (
                /* ── Logged-in dropdown ── */
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(v => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-walz-slate/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold text-sm">
                      {initial}
                    </div>
                    <span className="text-walz-white text-sm font-medium max-w-[110px] truncate">{firstName}</span>
                    <ChevronDown className={cn('w-4 h-4 text-walz-muted transition-transform', isUserMenuOpen && 'rotate-180')} />
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-luxury border border-walz-border z-50 overflow-hidden">
                      <div className="px-4 py-3 bg-[#0B1F3A]">
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">Signed in as</p>
                        <p className="text-sm font-semibold text-white truncate mt-0.5">{session.user?.email}</p>
                      </div>
                      <div className="py-1">
                        {portalMenu.map(({ href, label, icon: Icon }) => (
                          <Link key={label} href={href}
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-walz-deep-navy hover:bg-[#F4F6F9] transition-colors">
                            <Icon className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                            {label}
                          </Link>
                        ))}
                        <div className="my-1 border-t border-gray-100" />
                        <button
                          onClick={() => { setIsUserMenuOpen(false); signOut({ callbackUrl: '/' }) }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Logged-out ── */
                <>
                  <Link href="/portal">
                    <Button variant="ghost" size="sm" className="text-walz-muted hover:text-walz-white hover:bg-walz-slate/50">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/portal">
                    <Button variant="gold" size="sm">Get Started</Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button className="lg:hidden w-11 h-11 flex items-center justify-center rounded-lg text-walz-muted hover:text-walz-white hover:bg-walz-slate/50 transition-colors"
              onClick={() => setIsMobileOpen(v => !v)} aria-label="Toggle menu">
              {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu — z-[60] sits above the z-50 header */}
      <div className={cn(
        'fixed inset-0 z-[60] lg:hidden transition-opacity duration-300',
        isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}>
        <div className="absolute inset-0 bg-black/60" onClick={() => setIsMobileOpen(false)} />
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-72 bg-walz-deep-navy shadow-luxury transition-transform duration-300 flex flex-col',
            isMobileOpen ? 'translate-x-0' : 'translate-x-full',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 pt-5 border-b border-walz-slate">
            <Link href="/" onClick={() => setIsMobileOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Walz Travels" className="h-9 w-auto min-w-[90px] max-w-[140px] object-contain brightness-0 invert" />
            </Link>
            <button onClick={() => setIsMobileOpen(false)} className="w-11 h-11 flex items-center justify-center rounded text-walz-muted hover:text-walz-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4">
            {/* Main site links */}
            <p className="px-6 py-1.5 text-[10px] font-semibold text-walz-muted uppercase tracking-wider">Explore</p>
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setIsMobileOpen(false)}
                className="flex items-center gap-3 px-6 py-3 text-walz-muted hover:text-walz-gold hover:bg-walz-slate/30 transition-colors">
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                <span className="font-medium text-sm tracking-wide">{label}</span>
              </Link>
            ))}

            {/* Experiences accordion */}
            <button
              onClick={() => setIsMobileExpOpen(v => !v)}
              className="w-full flex items-center justify-between px-6 py-3 text-walz-muted hover:text-walz-gold hover:bg-walz-slate/30 transition-colors"
            >
              <span className="flex items-center gap-3">
                <Compass className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                <span className="font-medium text-sm tracking-wide">Experiences</span>
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', isMobileExpOpen && 'rotate-180')} />
            </button>
            {isMobileExpOpen && (
              <div className="bg-walz-slate/20 border-l-2 border-[#C9A84C]/40 ml-6 mr-3 rounded-r-lg mb-1">
                {experienceLinks.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => { setIsMobileOpen(false); setIsMobileExpOpen(false) }}
                    className="flex items-center gap-2 px-4 py-2.5 text-walz-muted hover:text-walz-gold transition-colors text-sm"
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                    {label}
                  </Link>
                ))}
              </div>
            )}

            {/* Cart link — mobile */}
            <Link
              href="/cart"
              onClick={() => setIsMobileOpen(false)}
              className="flex items-center justify-between px-6 py-3 text-walz-muted hover:text-walz-gold hover:bg-walz-slate/30 transition-colors"
            >
              <span className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5" />
                <span className="font-medium text-sm">Cart</span>
              </span>
              {itemCount > 0 && (
                <span className="w-5 h-5 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>

            {/* Visa accordion */}
            <button
              onClick={() => setIsMobileVisaOpen(v => !v)}
              className="w-full flex items-center justify-between px-6 py-3 text-walz-muted hover:text-walz-gold hover:bg-walz-slate/30 transition-colors"
            >
              <span className="flex items-center gap-3">
                <Globe className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                <span className="font-medium text-sm tracking-wide">Visa</span>
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', isMobileVisaOpen && 'rotate-180')} />
            </button>
            {isMobileVisaOpen && (
              <div className="bg-walz-slate/20 border-l-2 border-[#C9A84C]/40 ml-6 mr-3 rounded-r-lg mb-1">
                {visaDropdownLinks.map(({ href, label, divider }) => (
                  <span key={href}>
                    {divider && <div className="border-t border-white/10 mx-3" />}
                    <Link href={href}
                      onClick={() => { setIsMobileOpen(false); setIsMobileVisaOpen(false) }}
                      className="flex items-center gap-2 px-4 py-2.5 text-walz-muted hover:text-walz-gold transition-colors text-sm">
                      <span className="w-1 h-1 rounded-full bg-[#C9A84C] flex-shrink-0" />
                      {label}
                    </Link>
                  </span>
                ))}
              </div>
            )}

            {session && (
              <>
                <div className="my-2 border-t border-walz-slate/50 mx-4" />
                <p className="px-6 py-1.5 text-[10px] font-semibold text-walz-muted uppercase tracking-wider">My Account</p>
                {portalMenu.map(({ href, label, icon: Icon }) => (
                  <Link key={label} href={href} onClick={() => setIsMobileOpen(false)}
                    className="flex items-center gap-3 px-6 py-3 text-walz-muted hover:text-walz-gold hover:bg-walz-slate/30 transition-colors">
                    <Icon className="w-4 h-4 text-[#C9A84C]" />
                    <span className="font-medium text-sm">{label}</span>
                  </Link>
                ))}
              </>
            )}
          </nav>

          <div className="p-4 border-t border-walz-slate space-y-2">
            {session ? (
              <>
                <div className="flex items-center gap-3 px-2 py-2 mb-2">
                  <div className="w-9 h-9 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-walz-white text-sm font-medium truncate">{session.user?.name || firstName}</p>
                    <p className="text-walz-muted text-xs truncate">{session.user?.email}</p>
                  </div>
                </div>
                <Link href="/dashboard" onClick={() => setIsMobileOpen(false)}>
                  <Button variant="navy" className="w-full border border-walz-slate" size="sm">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    My Account
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full text-walz-error hover:bg-red-500/10" size="sm"
                  onClick={() => { setIsMobileOpen(false); signOut({ callbackUrl: '/' }) }}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link href="/portal" onClick={() => setIsMobileOpen(false)}>
                  <Button variant="navy" className="w-full border border-walz-slate">
                    <User className="w-4 h-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
                <Link href="/portal" onClick={() => setIsMobileOpen(false)}>
                  <Button variant="gold" className="w-full">Get Started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Spacer — collapses on homepage so hero overlaps the transparent nav */}
      <div className={cn('h-16', !isHome && 'lg:h-28')} />
    </>
  )
}
