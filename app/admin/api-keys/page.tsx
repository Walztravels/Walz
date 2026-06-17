'use client'

import { useEffect, useState } from 'react'
import { Key, CheckCircle, XCircle, ExternalLink, RefreshCw, Loader2 } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

interface Integration {
  name:    string
  key:     string
  docs:    string
  desc:    string
}

const INTEGRATIONS: Integration[] = [
  { name: 'Anthropic (Claude AI)',        key: 'ANTHROPIC_API_KEY',            docs: 'https://console.anthropic.com',          desc: 'Powers Jade AI assistant'          },
  { name: 'Stripe Payments',              key: 'STRIPE_SECRET_KEY',            docs: 'https://dashboard.stripe.com',           desc: 'Card payments processing'          },
  { name: 'Flutterwave Payments',         key: 'FLUTTERWAVE_SECRET_KEY',       docs: 'https://dashboard.flutterwave.com',      desc: 'Africa payments gateway'           },
  { name: 'Resend Email',                 key: 'RESEND_API_KEY',               docs: 'https://resend.com/api-keys',            desc: 'Transactional email delivery'      },
  { name: 'Hotelbeds Activities API',     key: 'HOTELBEDS_ACTIVITIES_API_KEY', docs: 'https://developer.hotelbeds.com',        desc: 'Tours and activities booking'      },
  { name: 'Hotelbeds Transfers API',      key: 'HOTELBEDS_TRANSFERS_API_KEY',  docs: 'https://developer.hotelbeds.com',        desc: 'Airport transfer booking'          },
  { name: 'Supabase Service Role',        key: 'SUPABASE_SERVICE_ROLE_KEY',    docs: 'https://supabase.com/dashboard',         desc: 'Database admin access'             },
  { name: 'TravelPayouts Affiliate',      key: 'TRAVELPAYOUTS_MARKER',         docs: 'https://app.travelpayouts.com',          desc: 'Flight/hotel affiliate network'    },
]

export default function ApiKeysPage() {
  const { can }          = useStaffPermissions()
  const [status, setStatus]   = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/api-keys/status')
    if (res.ok) {
      const d = await res.json()
      setStatus(d.status ?? {})
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!can('settings_integrations')) {
    return (
      <div className="p-8 text-center text-gray-400">
        You don&apos;t have permission to view API key configuration.
      </div>
    )
  }

  const configured = INTEGRATIONS.filter(i => status[i.key]).length

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">API Keys & Integrations</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? '…' : `${configured} of ${INTEGRATIONS.length} integrations configured`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-800">
        <strong>Security note:</strong> API key values are never displayed here. To update a key, edit the environment
        variables in your Vercel project dashboard or <code className="bg-amber-100 px-1 rounded">.env.local</code>.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {INTEGRATIONS.map(intg => {
            const ok = status[intg.key] ?? false
            return (
              <div key={intg.key}
                className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4 shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
                  <Key className={`w-5 h-5 ${ok ? 'text-green-600' : 'text-red-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#0B1F3A]">{intg.name}</p>
                    {ok
                      ? <CheckCircle className="w-4 h-4 text-green-500" />
                      : <XCircle    className="w-4 h-4 text-red-400"   />
                    }
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{intg.desc}</p>
                  <code className="text-[10px] font-mono text-gray-400 mt-1 block">{intg.key}</code>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {ok ? 'Configured' : 'Missing'}
                  </span>
                  <a href={intg.docs} target="_blank" rel="noreferrer"
                    className="text-gray-400 hover:text-[#C9A84C] transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
