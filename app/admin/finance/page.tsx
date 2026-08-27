'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function FinancePage() {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/admin/revenue?window=7')
      .then(r => {
        if (r.status === 403) setAllowed(false)
        else setAllowed(true)
      })
      .catch(() => setAllowed(false))
  }, [])

  if (allowed === null) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (allowed === false) return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Finance</h1>
      <p className="text-sm text-red-600">Access restricted — Super Admin or General Manager only.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Finance</h1>
        <p className="text-sm text-gray-400 mt-0.5">Revenue intelligence — Super Admin &amp; General Manager only</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/admin/finance/revenue"
          className="block p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Revenue Command Centre</p>
          <p className="text-lg font-bold text-[#0B1F3A]">GBV, Funnel &amp; Payments</p>
          <p className="text-sm text-gray-500 mt-1">Booking value by provider, cart abandonment, Jade attribution, activity margin.</p>
        </Link>
      </div>
    </div>
  )
}
