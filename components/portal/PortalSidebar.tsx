'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, FileText, Upload, CreditCard,
  CheckSquare, Users, LogOut, Globe, ChevronRight,
  UserCircle, MessageCircle, Shield, Compass,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/portal/dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/plan/library',            label: 'My Trips',         icon: Compass         },
  { href: '/portal/application',      label: 'Applications',     icon: FileText        },
  { href: '/portal/documents',        label: 'Documents',        icon: Upload          },
  { href: '/portal/payments',         label: 'Payments',         icon: CreditCard      },
  { href: '/portal/checklist',        label: 'Checklist',        icon: CheckSquare     },
  { href: '/portal/passport-vault',   label: 'Passport Vault',   icon: Shield          },
  { href: '/visa-hub',                label: 'Visa Intelligence', icon: Globe           },
  { href: '/portal/referral',         label: 'Refer & Earn',     icon: Users           },
  { href: '/portal/profile',          label: 'My Profile',       icon: UserCircle      },
]

interface Props {
  userName: string
  userEmail: string
}

export function PortalSidebar({ userName, userEmail }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-[#0B1F3A] text-white flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/" className="flex flex-col items-start">
          <Image src="/walz-logo.png" alt="Walz Travels" width={110} height={40}
            className="w-[110px] h-auto object-contain" />
          <div className="text-[10px] text-[#C9A84C] tracking-widest uppercase mt-1">Client Portal</div>
        </Link>
      </div>

      {/* User pill */}
      <div className="mx-3 mt-4 mb-2 px-3 py-3 bg-white/5 rounded-xl">
        <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm mb-1.5">
          {userName[0]?.toUpperCase() ?? 'C'}
        </div>
        <p className="text-white text-sm font-semibold leading-tight truncate">{userName}</p>
        <p className="text-white/40 text-xs truncate">{userEmail}</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                active
                  ? 'bg-[#C9A84C] text-[#0B1F3A]'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <Link href="/"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">
          <Globe className="w-4 h-4" />
          Back to Website
        </Link>
        <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-green-400/80 hover:text-green-300 hover:bg-white/10 transition-all">
          <MessageCircle className="w-4 h-4" />
          WhatsApp Support
        </a>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-red-500/20 hover:text-red-400 transition-all">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
