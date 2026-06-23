'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Users, Calendar, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

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
    const fetchUnread = async () => {
      try {
        const res  = await fetch('/api/admin/inbox/leads?unread=true')
        const data = await res.json() as { leads: Array<{ unread_count?: number }> }
        setUnreadCount((data.leads ?? []).reduce((s, l) => s + (l.unread_count ?? 0), 0))
      } catch { /* non-fatal */ }
    }

    fetchUnread()
    const id = setInterval(fetchUnread, 30_000)
    return () => clearInterval(id)
  }, [])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a1628]/95 backdrop-blur-xl border-t border-white/8 flex items-center justify-around px-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center gap-1 py-3 px-4 transition-all duration-200',
              active ? 'text-amber-400' : 'text-white/40 hover:text-white/60',
            )}
          >
            <Icon size={22} strokeWidth={active ? 2 : 1.5} />
            <span className="text-[10px] font-medium">{label}</span>
            {badge && unreadCount > 0 && (
              <span className="absolute top-2 right-2 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        )
      })}

      <button
        onClick={onOpenDrawer}
        className="flex flex-col items-center gap-1 py-3 px-4 text-white/40 hover:text-white/60 transition-all duration-200"
      >
        <MoreHorizontal size={22} strokeWidth={1.5} />
        <span className="text-[10px] font-medium">More</span>
      </button>
    </nav>
  )
}
