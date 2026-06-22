'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  LayoutDashboard, TrendingUp, MessageSquare,
  Users, UserPlus, Calendar, Plus, Plane, Building2, Car,
  FileText, Map, FolderOpen, ClipboardList, ScanSearch, Tag,
  CreditCard, Award, DollarSign, Gift,
  BarChart2, CheckCircle,
  BookOpen, Edit, Sliders,
  Shield, Package, Wrench, Activity, Key, Settings,
  MapPin, Signal, Globe, Image,
  ShieldCheck, Star, Mail, AlertTriangle,
  Brain, Dna, Radio, AlertOctagon, Zap, UserCheck, Sparkles,
  Ticket, Receipt, GitBranch, Phone,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import {
  getNavForStaff,
  ROLE_BADGE_CLASSES,
  ROLE_LABELS,
  type AdminRole,
  type Permission,
} from '@/lib/admin/permissions'

// ── Icon map: string name → Lucide component ──────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  TrendingUp,
  MessageSquare,
  Users,
  UserPlus,
  Calendar,
  Plus,
  Plane,
  Building2,
  Car,
  FileText,
  Map,
  FolderOpen,
  ClipboardList,
  ScanSearch,
  CreditCard,
  Award,
  DollarSign,
  Gift,
  BarChart2,
  CheckCircle,
  BookOpen,
  Edit,
  Sliders,
  Shield,
  Package,
  Wrench,
  Activity,
  Key,
  Settings,
  MapPin,
  Signal,
  Globe,
  Image,
  ShieldCheck,
  Tag,
  Star,
  Mail,
  AlertTriangle,
  Brain,
  Dna,
  Radio,
  AlertOctagon,
  Zap,
  UserCheck,
  Sparkles,
  Ticket,
  Receipt,
  GitBranch,
  Phone,
}

const LOGO_CACHE_KEY = 'walz_logo_url'
const LOGO_CACHE_TTL  = 60 * 60 * 1000

export function AdminSidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const { profile, loading } = useStaffPermissions()

  const [logoUrl,     setLogoUrl]     = useState('/walz-logo.svg')
  const [unreadCount, setUnreadCount] = useState(0)

  // ── Logo loader ──────────────────────────────────────────────────────────────
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

  // ── Live unread badge ────────────────────────────────────────────────────────
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

  // ── Build nav from new RBAC system ──────────────────────────────────────────
  const staffForNav = profile
    ? { role: profile.role, permissions: profile.permissions }
    : { role: '', permissions: {} }

  const navSections = getNavForStaff(staffForNav)

  // ── Role display ─────────────────────────────────────────────────────────────
  const roleKey    = (profile?.role ?? '') as AdminRole
  const badgeClass = ROLE_BADGE_CLASSES[roleKey] ?? 'bg-gray-500 text-white'
  const roleLabel  = ROLE_LABELS[roleKey]        ?? profile?.roleLabel ?? profile?.role ?? ''

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
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', badgeClass)}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation — built from new RBAC system */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {navSections.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 mb-1 text-[10px] font-bold text-white/30 uppercase tracking-[0.15em]">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map(({ href, label, icon }) => {
                const Icon   = ICON_MAP[icon]
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      active
                        ? 'bg-[#C9A84C] text-[#0B1F3A]'
                        : 'text-white/65 hover:bg-white/8 hover:text-white',
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                    <span className="flex-1">{label}</span>
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
