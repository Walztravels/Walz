'use client'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type SupplierStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'

interface SupplierInfo {
  label:       string
  status:      SupplierStatus
  latencyMs?:  number
  lastChecked: number
}

interface HealthResponse {
  suppliers: Record<string, SupplierInfo>
  env:       string
  checkedAt: string
}

const STATUS_CONFIG: Record<SupplierStatus, { dot: string; text: string; label: string }> = {
  ONLINE:   { dot: 'bg-green-400',  text: 'text-green-400',  label: 'Online'   },
  DEGRADED: { dot: 'bg-amber-400',  text: 'text-amber-400',  label: 'Slow'     },
  OFFLINE:  { dot: 'bg-red-500',    text: 'text-red-400',    label: 'Offline'  },
  UNKNOWN:  { dot: 'bg-gray-500',   text: 'text-gray-500',   label: 'Unknown'  },
}

interface SupplierHealthProps {
  /** Which supplier keys to display. Defaults to all. */
  suppliers?: string[]
  /** Auto-refresh interval in ms. Default: none (manual only). */
  refreshInterval?: number
  className?: string
}

export default function SupplierHealth({ suppliers: filter, refreshInterval, className }: SupplierHealthProps) {
  const [data,     setData]     = useState<HealthResponse | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/admin/supplier-health')
      if (!res.ok) throw new Error('non-200')
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (!refreshInterval) return
    const id = setInterval(load, refreshInterval)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval])

  const entries = data
    ? Object.entries(data.suppliers).filter(
        ([key]) => !filter || filter.includes(key)
      )
    : []

  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${className ?? ''}`}>
      <span className="text-[10px] font-bold tracking-widest text-gray-600 uppercase">Supplier Status</span>

      {loading && !data && (
        <span className="text-xs text-gray-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-pulse" />
          Checking…
        </span>
      )}

      {error && !data && (
        <span className="text-xs text-gray-600">Could not reach health endpoint</span>
      )}

      {entries.map(([key, info]) => {
        const cfg = STATUS_CONFIG[info.status]
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${
              info.status === 'ONLINE' ? 'animate-none' : ''
            }`} />
            <span className="text-xs text-gray-400">{info.label}</span>
            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
          </div>
        )
      })}

      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="ml-auto text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
        aria-label="Refresh supplier status"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
