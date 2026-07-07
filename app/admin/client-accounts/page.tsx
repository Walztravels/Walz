'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserCheck, Search, RefreshCw, Loader2, Mail, FileText, KeyRound } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

interface ClientAccount {
  id:         string
  email:      string
  name:       string
  phone:      string | null
  isVerified: boolean
  createdAt:  string
  _count:     { visaApplications: number }
}

export default function ClientAccountsPage() {
  const [accounts,    setAccounts]    = useState<ClientAccount[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [query,       setQuery]       = useState('')
  const [resetSent,   setResetSent]   = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      const res  = await fetch(`/api/admin/client-accounts?${params}`)
      const data = await res.json() as { accounts?: ClientAccount[]; total?: number }
      setAccounts(data.accounts ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { load() }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setQuery(search)
  }

  async function sendReset(email: string) {
    setResetLoading(email)
    try {
      const res = await fetch('/api/admin/client-accounts/send-reset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setResetSent(email)
        setTimeout(() => setResetSent(null), 5000)
      } else {
        alert(data.error ?? 'Failed to send reset email')
      }
    } catch {
      alert('Failed to send reset email')
    }
    setResetLoading(null)
  }

  return (
    <div className="flex-1 min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0B1F3A]">Client Accounts</h1>
              <p className="text-sm text-gray-500">{total} accounts created via visa form</p>
            </div>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] transition-colors" />
          </div>
          <button type="submit" className="px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#162d52] transition-colors">
            Search
          </button>
        </form>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
          ) : accounts.length === 0 ? (
            <div className="py-20 text-center">
              <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No client accounts yet</p>
              <p className="text-gray-300 text-sm mt-1">Accounts are created automatically when clients submit a visa application</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Phone</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Applications</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {accounts.map(account => (
                    <tr key={account.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-[#0B1F3A]">{account.name}</td>
                      <td className="px-4 py-3 text-gray-600">{account.email}</td>
                      <td className="px-4 py-3 text-gray-500">{account.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-gray-700">
                          <FileText className="w-3.5 h-3.5 text-[#C9A84C]" />
                          {account._count.visaApplications}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {account.isVerified
                          ? <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Verified</span>
                          : <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Temp password</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {format(new Date(account.createdAt), 'd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <a href={`mailto:${account.email}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0B1F3A]/5 text-[#0B1F3A] hover:bg-[#C9A84C]/15 hover:text-[#8B6914] transition-colors">
                            <Mail className="w-3 h-3" /> Email
                          </a>
                          <button
                            onClick={() => sendReset(account.email)}
                            disabled={resetLoading === account.email}
                            title="Send password reset email"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                          >
                            {resetLoading === account.email
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : resetSent === account.email
                                ? <span className="text-green-700">✓ Sent</span>
                                : <><KeyRound className="w-3 h-3" /> Reset</>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400">Accounts are auto-created when clients submit a visa application. Password in &quot;temp password&quot; state means the client hasn&apos;t logged in yet.</p>
      </div>
    </div>
  )
}
