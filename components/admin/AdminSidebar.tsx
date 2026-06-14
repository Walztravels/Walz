'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  LayoutDashboard, Users, UserPlus, MessageSquare,
  BookOpen, Plane, Hotel, Map,
  Globe, Send, Brain,
  Rss, Gift, Image as ImageIcon, LayoutGrid, Tv2,
  UserCog, Activity, FileText, ClipboardList,
  Settings, LogOut, PenSquare, Compass, History,
  CreditCard, Shield, Signal, Ticket, LayoutTemplate, Layers,
  Briefcase, Inbox, ScanSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import type { PermissionKey } from '@/lib/permissions'

// ── Nav item type ─────────────────────────────────────────────────────────────
interface NavItem {
  href:            string
  label:           string
  icon:            React.ElementType
  exact?:          boolean
  /** If set, item is hidden unless the staff has this permission */
  permission?:     PermissionKey
  /** If true, item is hidden unless the logged-in staff is super_admin */
  superAdminOnly?: boolean
}

interface NavSection {
  label:       string
  items:       NavItem[]
  /** If set, the entire section is hidden unless staff has any of these */
  anyPermission?: PermissionKey[]
}

// ── Nav structure ─────────────────────────────────────────────────────────────
const SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard_view' },
    ],
  },
  {
    label: 'Communications',
    anyPermission: ['applications_view'],
    items: [
      { href: '/admin/inbox', label: 'Inbox', icon: Inbox, permission: 'applications_view' },
      { href: '/admin/leads', label: 'Leads', icon: MessageSquare, permission: 'applications_view' },
    ],
  },
  {
    label: 'Clients',
    anyPermission: ['applications_view', 'bookings_view'],
    items: [
      { href: '/admin/clients',     label: 'All Clients', icon: Users,        permission: 'applications_view' },
      { href: '/admin/clients/new', label: 'New Client',  icon: UserPlus,     permission: 'applications_create', exact: true },
    ],
  },
  {
    label: 'Bookings',
    anyPermission: ['bookings_view'],
    items: [
      { href: '/admin/bookings',             label: 'All Bookings', icon: BookOpen, permission: 'bookings_view' },
      { href: '/admin/bookings?type=flight', label: 'Flights',      icon: Plane,    permission: 'bookings_view', exact: true },
      { href: '/admin/bookings?type=hotel',  label: 'Hotels',       icon: Hotel,    permission: 'bookings_view', exact: true },
      { href: '/admin/bookings?type=tour',   label: 'Tours',        icon: Map,      permission: 'bookings_view', exact: true },
      { href: '/admin/flights',              label: 'Flight Promos', icon: Plane,   permission: 'cms_view', exact: true },
      { href: '/admin/hotels',               label: 'Hotel Promos',  icon: Hotel,   permission: 'cms_view', exact: true },
    ],
  },
  {
    label: 'Visa',
    anyPermission: ['visa_view'],
    items: [
      { href: '/admin/visa-applications',      label: 'Applications',     icon: Globe,      permission: 'visa_view' },
      { href: '/admin/visa-intelligence',      label: 'Visa Intelligence', icon: Brain,      permission: 'visa_view' },
      { href: '/admin/visa/bank-analyser',     label: 'Bank Analyser',     icon: ScanSearch, permission: 'visa_view' },
    ],
  },
  {
    label: 'Insurance',
    items: [
      { href: '/admin/insurance', label: 'Insurance Orders', icon: Shield },
    ],
  },
  {
    label: 'Jade Connect',
    items: [
      { href: '/admin/esim', label: 'eSIM Orders', icon: Signal },
    ],
  },
  {
    label: 'Planning',
    anyPermission: ['trips_view'],
    items: [
      { href: '/admin/trip-planner',         label: 'Trip Planner', icon: Compass, permission: 'trips_view' },
      { href: '/admin/trip-planner/history', label: 'Trip History', icon: History, permission: 'trips_view', exact: true },
    ],
  },
  {
    label: 'Documents',
    items: [
      { href: '/admin/ticket-generator',           label: 'Ticket Generator', icon: Ticket },
      { href: '/admin/ticket-generator/history',   label: 'Ticket History',   icon: History, exact: true },
      { href: '/admin/ticket-generator/templates', label: 'Templates',        icon: LayoutTemplate, exact: true },
    ],
  },
  {
    label: 'Payments',
    anyPermission: ['payments_view'],
    items: [
      { href: '/admin/payments', label: 'Payments', icon: CreditCard, permission: 'payments_view' },
    ],
  },
  {
    label: 'Content',
    anyPermission: ['cms_view'],
    items: [
      { href: '/admin/content',      label: 'Content Manager', icon: PenSquare,  permission: 'cms_view' },
      { href: '/admin/hero-slides',  label: 'Hero Slides',     icon: Layers,     permission: 'cms_view' },
      { href: '/admin/tours',        label: 'Tours',           icon: Map,        permission: 'cms_view' },
      { href: '/admin/blog',         label: 'Blog',            icon: Rss,        permission: 'cms_view' },
      { href: '/admin/vouchers',     label: 'Gift Vouchers',   icon: Gift,       permission: 'cms_view' },
      { href: '/admin/images',       label: 'Media & Images',  icon: ImageIcon,  superAdminOnly: true },
      { href: '/admin/widgets',      label: 'Widgets',         icon: LayoutGrid, permission: 'cms_view' },
    ],
  },
  {
    label: 'Packages',
    anyPermission: ['cms_view'],
    items: [
      { href: '/admin/packages',          label: 'All Packages', icon: Briefcase, permission: 'cms_view' },
      { href: '/admin/package-bookings',  label: 'Bookings',     icon: BookOpen,  permission: 'bookings_view' },
    ],
  },
  {
    label: 'Team',
    anyPermission: ['staff_view', 'reports_view'],
    items: [
      { href: '/admin/staff',       label: 'Staff',        icon: UserCog,      permission: 'staff_view' },
      { href: '/admin/activity',    label: 'Activity Log', icon: Activity,     permission: 'staff_view' },
      { href: '/admin/reports',     label: 'My Reports',   icon: FileText,     permission: 'reports_view', exact: true },
      { href: '/admin/reports/all', label: 'All Reports',  icon: ClipboardList, permission: 'reports_all',  exact: true },
    ],
  },
  {
    label: 'Settings',
    anyPermission: ['settings_view'],
    items: [
      { href: '/admin/settings',              label: 'General',       icon: Settings, permission: 'settings_view' },
      { href: '/admin/settings/roles',        label: 'Role Manager',  icon: Shield,   permission: 'settings_roles', exact: true },
      { href: '/admin/settings/payments',     label: 'Payments',      icon: Tv2,      permission: 'settings_edit', exact: true },
      { href: '/admin/settings/emails',       label: 'Emails',        icon: Send,     permission: 'settings_edit', exact: true },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────
const LOGO_CACHE_KEY = 'walz_logo_url'
const LOGO_CACHE_TTL  = 60 * 60 * 1000

export function AdminSidebar() {
  const pathname   = usePathname()
  const router     = useRouter()
  const { can, canAny, profile, loading } = useStaffPermissions()
  const [logoUrl,      setLogoUrl]      = useState('/walz-logo.svg')
  const [unreadCount,  setUnreadCount]  = useState(0)

  useEffect(() => {
    function loadLogo() {
      fetch('/api/media/logo_main')
        .then(r => r.json())
        .then((d: { url?: string | null }) => {
          if (d.url) {
            setLogoUrl(d.url)
            try { localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify({ url: d.url, ts: Date.now() })) } catch { }
          }
        }).catch(() => {})
    }
    let hit = false
    try {
      const raw = localStorage.getItem(LOGO_CACHE_KEY)
      if (raw) {
        const { url, ts } = JSON.parse(raw) as { url: string; ts: number }
        if (url && Date.now() - ts < LOGO_CACHE_TTL) { setLogoUrl(url); hit = true }
      }
    } catch { }
    if (!hit) loadLogo()
    const onUpdate = () => { try { localStorage.removeItem(LOGO_CACHE_KEY) } catch { } loadLogo() }
    window.addEventListener('walz:logo-updated', onUpdate)
    return () => window.removeEventListener('walz:logo-updated', onUpdate)
  }, [])

  // Live unread badge
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const fetchUnread = async () => {
      try {
        const res  = await fetch('/api/admin/inbox/leads?unread=true')
        const data = await res.json() as { leads: Array<{ unread_count?: number }> }
        const total = (data.leads ?? []).reduce((s, l) => s + (l.unread_count ?? 0), 0)
        setUnreadCount(total)
      } catch { /* non-fatal */ }
    }

    fetchUnread()

    const sb = createClient(url, key)
    const channel = sb
      .channel('sidebar-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchUnread())
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [])

  function isActive(href: string, exact?: boolean) {
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Walz Travels" className="w-[96px] h-auto object-contain" />
          <span className="text-[10px] text-[#C9A84C] tracking-[0.2em] uppercase font-semibold">
            Admin Panel
          </span>
        </Link>
      </div>

      {/* Staff pill */}
      {!loading && profile && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2.5 bg-white/5 rounded-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-xs flex-shrink-0">
              {profile.name[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold leading-tight truncate">{profile.name}</p>
              <span className={cn('inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5', profile.roleBadge)}>
                {profile.roleLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {SECTIONS.map(({ label, items, anyPermission }) => {
          // Hide entire section if no permissions
          const sectionVisible = anyPermission
            ? canAny(anyPermission)
            : true

          // Filter items individually
          const visibleItems = items.filter((item) => {
            if (item.superAdminOnly && profile?.role !== 'super_admin') return false
            if (item.permission && !can(item.permission)) return false
            return true
          })

          if (!sectionVisible || visibleItems.length === 0) return null

          return (
            <div key={label}>
              <p className="px-3 mb-1 text-[10px] font-bold text-white/30 uppercase tracking-[0.15em]">
                {label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(({ href, label: itemLabel, icon: Icon, exact }) => {
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
                      <span className="flex-1">{itemLabel}</span>
                      {href === '/admin/inbox' && unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
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
