'use client'
import { useState, useEffect } from 'react'
import { Loader2, Users } from 'lucide-react'

interface ReferralCode {
  id: string
  code: string
  uses: number
  credits: number
  createdAt: string
  user: { name: string | null; email: string | null }
}

export default function ReferralsPage() {
  const [items,   setItems]   = useState<ReferralCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/referrals')
      .then(r => r.json())
      .then(data => { setItems(data.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Referral Codes</h1>
        <p className="text-gray-400 text-sm mt-0.5">Client referral codes and earned credits</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No referral codes yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Code</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">User</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Uses</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Credits</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-[#0B1F3A] text-sm bg-[#C9A84C]/10 px-2 py-1 rounded-lg">
                      {item.code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-[#0B1F3A]">{item.user.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{item.user.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-[#0B1F3A]">{item.uses}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-green-600">£{item.credits.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                    {new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
