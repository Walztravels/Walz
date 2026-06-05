'use client'

import Link from 'next/link'
import NextImage from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, BookOpen, Plane, Map, FileText, Users,
  Settings, LayoutGrid, Image, LogOut, ChevronRight, Globe, Rss, Gift, UserCog, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Bookings', icon: BookOpen },
  { href: '/admin/leads', label: 'Lead Enquiries', icon: MessageSquare },
  { href: '/admin/portal', label: 'Client Portal', icon: LayoutDashboard },
  { href: '/admin/flights', label: 'Flights', icon: Plane },
  { href: '/admin/tours', label: 'Tours', icon: Map },
  { href: '/admin/visa-applications', label: 'Visa Applications', icon: Globe },
  { href: '/admin/visa', label: 'Visa Services', icon: FileText },
  { href: '/admin/visa-intelligence', label: 'Visa Intelligence', icon: Globe },
  { href: '/admin/blog', label: 'Blog', icon: Rss },
  { href: '/admin/vouchers', label: 'Vouchers', icon: Gift },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/widgets', label: 'Widgets', icon: LayoutGrid },
  { href: '/admin/images', label: 'Images', icon: Image },
  { href: '/admin/staff', label: 'Staff', icon: UserCog },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

interface Props {
  adminEmail?: string
}

export function AdminSidebar({ adminEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-[#0B1F3A] text-white">

      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <Link href="/admin/dashboard" className="flex flex-col items-start">
          <NextImage
            src="/walz-logo.png"
            alt="Walz Travels"
            width={120}
            height={120}
            className="w-[120px] h-auto object-contain"
          />
          <div className="text-[10px] text-[#C9A84C] tracking-widest uppercase mt-1">Admin CRM</div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                active
                  ? 'bg-[#C9A84C] text-[#0B1F3A]'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
        >
          <Globe className="w-4 h-4" />
          View Live Site
        </Link>
        <div className="px-3 py-2">
          <p className="text-xs text-white/40 truncate">{adminEmail}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-red-500/20 hover:text-red-400 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

    </aside>
  )
}
