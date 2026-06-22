'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  X, LogOut,
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
  Ticket, Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import { getNavForStaff, ROLE_BADGE_CLASSES, ROLE_LABELS, type AdminRole } from '@/lib/admin/permissions'

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, TrendingUp, MessageSquare, Users, UserPlus, Calendar, Plus,
  Plane, Building2, Car, FileText, Map, FolderOpen, ClipboardList, ScanSearch,
  CreditCard, Award, DollarSign, Gift, BarChart2, CheckCircle, BookOpen, Edit,
  Sliders, Shield, Package, Wrench, Activity, Key, Settings, MapPin, Signal,
  Globe, Image, ShieldCheck, Tag, Star, Mail, AlertTriangle, Brain, Dna, Radio,
  AlertOctagon, Zap, UserCheck, Sparkles, Ticket, Receipt,
}

interface MobileMoreDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileMoreDrawer({ isOpen, onClose }: MobileMoreDrawerProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const { profile, loading } = useStaffPermissions()

  const staffForNav  = profile ? { role: profile.role, permissions: profile.permissions } : { role: '', permissions: {} }
  const navSections  = getNavForStaff(staffForNav)
  const roleKey      = (profile?.role ?? '') as AdminRole
  const badgeClass   = ROLE_BADGE_CLASSES[roleKey] ?? 'bg-gray-500 text-white'
  const roleLabel    = ROLE_LABELS[roleKey] ?? profile?.roleLabel ?? profile?.role ?? ''

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  async function handleLogout() {
    onClose()
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <div className={cn('md:hidden fixed inset-0 z-[55] transition-all duration-300', isOpen ? 'visible' : 'invisible pointer-events-none')}>
      {/* Backdrop */}
      <div
        className={cn('absolute inset-0 bg-black/60 transition-opacity duration-300', isOpen ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 max-h-[90dvh] bg-[#0B1F3A] rounded-t-2xl flex flex-col transition-transform duration-300',
        isOpen ? 'translate-y-0' : 'translate-y-full',
      )}>
        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full absolute left-1/2 -translate-x-1/2 top-2" />
          <p className="text-white font-semibold text-sm">Menu</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Staff profile pill */}
        {!loading && profile && (
          <div className="mx-4 mt-3 mb-1 px-3 py-2.5 bg-white/5 rounded-xl flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">
                {profile.name[0]?.toUpperCase() ?? 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold leading-tight truncate">{profile.name}</p>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-block', badgeClass)}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Nav sections */}
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
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                        active
                          ? 'bg-[#C9A84C] text-[#0B1F3A]'
                          : 'text-white/65 hover:bg-white/8 hover:text-white active:bg-white/10',
                      )}
                    >
                      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                      <span className="flex-1">{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-white/10 pb-safe">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-red-500/15 hover:text-red-400 transition-all font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
