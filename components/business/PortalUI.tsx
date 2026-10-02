// components/business/PortalUI.tsx — Walz Business (V1-B)
// Small shared layout primitives (card shell, section header, empty state)
// reused across Dashboard/Requests/Travellers/Team/Settings so the five
// pages read as one cohesive portal rather than five one-off layouts.
// Presentation only — carries no authorization meaning.

import Link from 'next/link'

export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{eyebrow}</p>}
      <h1 className="text-2xl font-bold text-[#0B1F3A]">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">{description}</p>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
      <h2 className="text-sm font-semibold text-[#0B1F3A]">{title}</h2>
      {action}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-400 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function StatCard({
  label, value, hint, tone = 'default',
}: { label: string; value: number | string; hint?: string; tone?: 'default' | 'gold' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${tone === 'gold' ? 'text-[#8a6d1f]' : 'text-[#0B1F3A]'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function PrimaryLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors"
    >
      {children}
    </Link>
  )
}
