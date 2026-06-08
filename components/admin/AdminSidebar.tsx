'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, UserPlus, MessageSquare,
  BookOpen, Plane, Hotel, Map,
  Globe, Send, Brain,
  Rss, Gift, Image as ImageIcon, LayoutGrid, Tv2,
  UserCog, Activity, FileText, ClipboardList,
  Settings, LogOut, PenSquare, Compass, History, Package, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Nav structure ─────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Clients',
    items: [
      { href: '/admin/clients',     label: 'All Clients', icon: Users },
      { href: '/admin/clients/new', label: 'New Client',  icon: UserPlus, exact: true },
      { href: '/admin/leads',       label: 'Leads',       icon: MessageSquare },
    ],
  },
  {
    label: 'Bookings',
    items: [
      { href: '/admin/bookings',              label: 'All Bookings', icon: BookOpen },
      { href: '/admin/bookings?type=flight',  label: 'Flights',      icon: Plane, exact: true },
      { href: '/admin/bookings?type=hotel',   label: 'Hotels',       icon: Hotel, exact: true },
      { href: '/admin/bookings?type=tour',    label: 'Tours (Book)', icon: Map,   exact: true },
    ],
  },
  {
    label: 'Visa',
    items: [
      { href: '/admin/visa-applications', label: 'Applications',     icon: Globe },
      { href: '/admin/visa-intelligence', label: 'Visa Intelligence', icon: Brain },
    ],
  },
  {
    label: 'Planning',
    items: [
      { href: '/admin/trip-planner',         label: 'Trip Planner', icon: Compass },
      { href: '/admin/trip-planner/history', label: 'Trip History', icon: History, exact: true },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/content',   label: 'Content Manager', icon: PenSquare },
      { href: '/admin/tours',     label: 'Tours',           icon: Map },
      { href: '/admin/blog',      label: 'Blog',            icon: Rss },
      { href: '/admin/vouchers',  label: 'Gift Vouchers',   icon: Gift },
      { href: '/admin/images',    label: 'Images',          icon: ImageIcon },
      { href: '/admin/widgets',   label: 'Widgets',         icon: LayoutGrid },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/admin/staff',        label: 'Staff',        icon: UserCog },
      { href: '/admin/activity',     label: 'Activity Log', icon: Activity },
      { href: '/admin/reports',      label: 'My Reports',   icon: FileText, exact: true },
      { href: '/admin/reports/all',  label: 'All Reports',  icon: ClipboardList, exact: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/admin/settings',           label: 'General',  icon: Settings },
      { href: '/admin/settings/payments',  label: 'Payments', icon: Tv2, exact: true },
      { href: '/admin/settings/emails',    label: 'Emails',   icon: Send, exact: true },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────
export function AdminSidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  function isActive(href: string, exact?: boolean) {
    // Strip query string for comparison
    const path = href.split('?')[0]
    if (exact) return pathname === path
    return pathname === path || pathname.startsWith(path + '/')
  }

  async function handleLogout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-[#0B1F3A] flex-shrink-0 border-r border-white/5">

      {/* Logo */}
      <div className="px-5 py-4 border-b border-white/10 flex-shrink-0">
        <Link href="/admin/dashboard" className="flex flex-col items-start gap-0.5">
          <Image
            src="/walz-logo.png"
            alt="Walz Travels"
            width={96}
            height={96}
            className="w-[96px] h-auto object-contain"
          />
          <span className="text-[10px] text-[#C9A84C] tracking-[0.2em] uppercase font-semibold">
            Admin Panel
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {SECTIONS.map(({ label, items }) => (
          <div key={label}>
            <p className="px-3 mb-1 text-[10px] font-bold text-white/30 uppercase tracking-[0.15em]">
              {label}
            </p>
            <div className="space-y-0.5">
              {items.map(({ href, label: itemLabel, icon: Icon, exact }) => {
                const active = isActive(href, exact)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      active
                        ? 'bg-[#C9A84C] text-[#0B1F3A]'
                        : 'text-white/65 hover:bg-white/8 hover:text-white'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{itemLabel}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div className="flex-shrink-0 px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-red-500/15 hover:text-red-400 transition-all font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

    </aside>
  )
}
