'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Upload, CreditCard, CheckSquare, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/portal/dashboard',  label: 'Apps',       icon: LayoutDashboard },
  { href: '/portal/documents',  label: 'Documents',  icon: Upload },
  { href: '/portal/payments',   label: 'Payments',   icon: CreditCard },
  { href: '/portal/checklist',  label: 'Checklist',  icon: CheckSquare },
  { href: '/portal/referral',   label: 'Referral',   icon: Users },
]

export function PortalBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0B1F3A] border-t border-white/10 lg:hidden">
      <div className="flex items-stretch h-16">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-all',
                active ? 'text-[#C9A84C]' : 'text-white/50 hover:text-white/80'
              )}
            >
              <Icon className={cn('w-5 h-5', active && 'text-[#C9A84C]')} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
