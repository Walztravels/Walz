'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import {
  Menu,
  X,
  Plane,
  Hotel,
  Map,
  FileText,
  ChevronDown,
  User,
  LogOut,
  LayoutDashboard,
  Globe,
  MessageCircle,
  Gift,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/flights', label: 'Flights', icon: Plane },
  { href: '/hotels', label: 'Hotels', icon: Hotel },
  { href: '/tours', label: 'Tours', icon: Map },
  { href: '/visa', label: 'Visa', icon: FileText },
  { href: '/gift-vouchers', label: 'Gift Vouchers', icon: Gift },
]

export function Navbar() {
  const { data: session, status } = useSession()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileOpen])

  return (
    <>
      {/* Top Utility Bar */}
      <div className="bg-walz-deep-navy border-b border-walz-slate/50 hidden lg:block">
        <div className="container-walz">
          <div className="flex items-center justify-between h-10 text-xs">
            <p className="text-walz-muted">
              Visa support, flights, hotels, tours and group travel — with expert help from Walz Travels.
            </p>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-green-400 hover:text-green-300 font-medium transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp: +44 7398 753797
            </a>
          </div>
        </div>
      </div>

      <header
        className={cn(
          'fixed top-0 lg:top-10 left-0 right-0 z-50 transition-all duration-300',
          isScrolled
            ? 'lg:top-0 bg-walz-deep-navy/95 backdrop-blur-md shadow-luxury'
            : 'bg-walz-deep-navy'
        )}
      >
        <div className="container-walz">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group" onClick={() => setIsMobileOpen(false)}>
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg walz-gold-gradient flex items-center justify-center shadow-gold-glow group-hover:shadow-lg transition-shadow">
                <Globe className="w-5 h-5 text-walz-deep-navy" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-display text-walz-white text-lg lg:text-xl font-semibold tracking-tight">
                  Walz <span className="text-walz-gold">Travels</span>
                </span>
                <span className="text-walz-muted text-[10px] tracking-widest uppercase hidden sm:block">
                  Luxury Travel Agency
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-walz-muted hover:text-walz-gold hover:bg-walz-slate/50 transition-all duration-200 text-sm font-medium"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </nav>

            {/* Desktop Auth */}
            <div className="hidden lg:flex items-center gap-3">
              {status === 'loading' ? (
                <div className="w-8 h-8 rounded-full bg-walz-slate animate-pulse" />
              ) : session ? (
                <div className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-walz-slate/50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold text-sm">
                      {session.user?.name?.[0]?.toUpperCase() || session.user?.email?.[0]?.toUpperCase() || 'W'}
                    </div>
                    <span className="text-walz-white text-sm font-medium max-w-[120px] truncate">
                      {session.user?.name?.split(' ')[0] || 'Account'}
                    </span>
                    <ChevronDown className={cn('w-4 h-4 text-walz-muted transition-transform', isUserMenuOpen && 'rotate-180')} />
                  </button>

                  {isUserMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsUserMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-luxury border border-walz-border z-20 overflow-hidden">
                        <div className="px-4 py-3 border-b border-walz-border">
                          <p className="text-xs text-walz-muted">Signed in as</p>
                          <p className="text-sm font-medium text-walz-deep-navy truncate">
                            {session.user?.email}
                          </p>
                        </div>
                        <div className="py-1">
                          <Link
                            href="/dashboard"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm text-walz-deep-navy hover:bg-walz-off-white transition-colors"
                          >
                            <LayoutDashboard className="w-4 h-4 text-walz-muted" />
                            My Dashboard
                          </Link>
                          <Link
                            href="/dashboard?tab=bookings"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm text-walz-deep-navy hover:bg-walz-off-white transition-colors"
                          >
                            <Plane className="w-4 h-4 text-walz-muted" />
                            My Bookings
                          </Link>
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false)
                              signOut({ callbackUrl: '/' })
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-walz-error hover:bg-red-50 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="text-walz-muted hover:text-walz-white hover:bg-walz-slate/50">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/login?signup=true">
                    <Button variant="gold" size="sm">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2 rounded-lg text-walz-muted hover:text-walz-white hover:bg-walz-slate/50 transition-colors"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              aria-label="Toggle menu"
            >
              {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden transition-opacity duration-300',
          isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="absolute inset-0 bg-black/60" onClick={() => setIsMobileOpen(false)} />
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-72 bg-walz-deep-navy shadow-luxury transition-transform duration-300 flex flex-col',
            isMobileOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div className="flex items-center justify-between p-4 pt-5 border-b border-walz-slate">
            <Link href="/" onClick={() => setIsMobileOpen(false)} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg walz-gold-gradient flex items-center justify-center">
                <Globe className="w-4 h-4 text-walz-deep-navy" />
              </div>
              <span className="font-display text-walz-white font-semibold">
                Walz <span className="text-walz-gold">Travels</span>
              </span>
            </Link>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="p-1 rounded text-walz-muted hover:text-walz-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile WhatsApp Banner */}
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white text-sm font-medium"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp: +44 7398 753797
          </a>

          <nav className="flex-1 overflow-y-auto py-4">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsMobileOpen(false)}
                className="flex items-center gap-3 px-6 py-3.5 text-walz-muted hover:text-walz-gold hover:bg-walz-slate/30 transition-colors"
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t border-walz-slate space-y-2">
            {session ? (
              <>
                <div className="flex items-center gap-3 px-2 py-2 mb-2">
                  <div className="w-9 h-9 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold">
                    {session.user?.name?.[0]?.toUpperCase() || 'W'}
                  </div>
                  <div>
                    <p className="text-walz-white text-sm font-medium">{session.user?.name}</p>
                    <p className="text-walz-muted text-xs truncate">{session.user?.email}</p>
                  </div>
                </div>
                <Link href="/dashboard" onClick={() => setIsMobileOpen(false)}>
                  <Button variant="navy" className="w-full" size="sm">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    My Dashboard
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="w-full text-walz-error hover:bg-red-500/10"
                  size="sm"
                  onClick={() => {
                    setIsMobileOpen(false)
                    signOut({ callbackUrl: '/' })
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setIsMobileOpen(false)}>
                  <Button variant="navy" className="w-full border border-walz-slate">
                    <User className="w-4 h-4 mr-2" />
                    Sign In
                  </Button>
                </Link>
                <Link href="/login?signup=true" onClick={() => setIsMobileOpen(false)}>
                  <Button variant="gold" className="w-full">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Spacer for fixed navbar */}
      <div className="h-16 lg:h-[7.5rem]" />
    </>
  )
}
