'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Users, Calendar, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

interface MobileNavProps {
  onOpenDrawer: () => void
}

const TABS = [
  { href: '/admin/dashboard', label: 'Home',     icon: LayoutDashboard },
  { href: '/admin/inbox',     label: 'Inbox',    icon: MessageSquare, badge: true },
  { href: '/admin/clients',   label: 'Clients',  icon: Users },
  { href: '/admin/bookings',  label: 'Bookings', icon: Calendar },
]

export function MobileNav({ onOpenDrawer }: MobileNavProps) {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return

    const fetchUnread = async () => {
      try {
        const res  = await fetch('/api/admin/inbox/leads?unread=true')
        const data = await res.json() as { leads: Array<{ unread_count?: number }> }
        setUnreadCount((data.leads ?? []).reduce((s, l) => s + (l.unread_count ?? 0), 0))
      } catch { /* non-fatal */ }
    }

    fetchUnread()

    const sb      = createClient(url, key)
    const channel = sb
      .channel('mobile-nav-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchUnread)
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B1F3A] border-t border-white/10 pb-safe">
      <div className="flex items-center">
        {TABS.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2 px-1',
                active ? 'text-[#C9A84C]' : 'text-white/50 active:text-white/80',
              )}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}

        <button
          onClick={onOpenDrawer}
          className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2 px-1 text-white/50 active:text-white/80"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  )
}
