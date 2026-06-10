'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Compass, Shield, UserCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/portal/dashboard',   label: 'Home',         icon: LayoutDashboard },
  { href: '/plan/library',       label: 'My Trips',     icon: Compass         },
  { href: '/portal/application', label: 'Applications', icon: FileText        },
  { href: '/insurance',          label: 'Insurance',    icon: Shield          },
  { href: '/portal/profile',     label: 'Account',      icon: UserCircle      },
]

export function PortalBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0B1F3A] border-t border-white/10 lg:hidden">
      <div className="flex items-stretch h-16">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const base   = href.split('#')[0]
          const active = pathname === base || (base !== '/portal/dashboard' && pathname.startsWith(base + '/'))
          return (
            <Link key={label} href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-all',
                active ? 'text-[#C9A84C]' : 'text-white/50 hover:text-white/80',
              )}>
              <Icon className={cn('w-5 h-5', active && 'text-[#C9A84C]')} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
