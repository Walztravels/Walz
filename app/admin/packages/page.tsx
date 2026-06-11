'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Star, Pencil, Trash2, Loader2, Zap } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TravelPackage {
  id: string
  slug: string
  title: string
  destination: string
  package_type: 'group' | 'private' | 'honeymoon' | 'corporate'
  price_per_person: number
  currency: string
  seats_booked: number
  total_seats: number | null
  is_featured: boolean
  is_spotlight: boolean
  is_active: boolean
  images: string[]
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  group:     'bg-blue-100 text-blue-700',
  private:   'bg-purple-100 text-purple-700',
  honeymoon: 'bg-pink-100 text-pink-700',
  corporate: 'bg-gray-100 text-gray-700',
}

function fmt(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const [packages, setPackages] = useState<TravelPackage[]>([])
  const [loading, setLoading]   = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/packages')
      const data = await res.json()
      setPackages(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleField(pkg: TravelPackage, field: 'is_featured' | 'is_spotlight' | 'is_active') {
    setToggling(`${pkg.id}-${field}`)
    // Optimistic update
    setPackages(prev =>
      prev.map(p => p.id === pkg.id ? { ...p, [field]: !p[field] } : p)
    )
    try {
      await fetch(`/api/admin/packages/${pkg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !pkg[field] }),
      })
    } catch {
      // Revert on error
      setPackages(prev =>
        prev.map(p => p.id === pkg.id ? { ...p, [field]: pkg[field] } : p)
      )
    } finally {
      setToggling(null)
    }
  }

  async function deletePackage(pkg: TravelPackage) {
    if (!window.confirm(`Delete "${pkg.title}"? This cannot be undone.`)) return
    try {
      await fetch(`/api/admin/packages/${pkg.id}`, { method: 'DELETE' })
      setPackages(prev => prev.filter(p => p.id !== pkg.id))
    } catch {
      alert('Failed to delete package.')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Packages</h1>
          <p className="text-gray-500 text-sm mt-1">
            {packages.length} package{packages.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/packages/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Package
        </Link>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4">✈️</div>
          <h3 className="font-bold text-[#0B1F3A] text-lg mb-1">No packages yet</h3>
          <p className="text-gray-500 text-sm mb-5">Create your first travel package to get started.</p>
          <Link
            href="/admin/packages/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Package
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F8FA] border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Destination</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Seats</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Spotlight</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Featured</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packages.map(pkg => (
                  <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Package name + thumb */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {pkg.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={pkg.images[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">✈️</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#0B1F3A] leading-snug line-clamp-1">{pkg.title}</p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{pkg.slug}</p>
                        </div>
                      </div>
                    </td>

                    {/* Destination */}
                    <td className="px-4 py-3.5 text-gray-600 text-sm hidden md:table-cell">
                      {pkg.destination || '—'}
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${TYPE_COLORS[pkg.package_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {pkg.package_type}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3.5 font-semibold text-[#0B1F3A]">
                      {fmt(pkg.price_per_person, pkg.currency)}
                    </td>

                    {/* Seats */}
                    <td className="px-4 py-3.5 text-gray-600 text-sm hidden lg:table-cell">
                      {pkg.seats_booked ?? 0}
                      {pkg.total_seats != null ? ` / ${pkg.total_seats}` : ''}
                    </td>

                    {/* Spotlight toggle */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        onClick={() => toggleField(pkg, 'is_spotlight')}
                        disabled={toggling === `${pkg.id}-is_spotlight`}
                        title={pkg.is_spotlight ? 'Remove from spotlight' : 'Add to spotlight slider'}
                        className="transition-colors disabled:opacity-40"
                      >
                        {toggling === `${pkg.id}-is_spotlight` ? (
                          <Loader2 className="w-4 h-4 text-gray-400 animate-spin mx-auto" />
                        ) : (
                          <Zap
                            className={`w-5 h-5 mx-auto transition-colors ${
                              pkg.is_spotlight ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-400'
                            }`}
                          />
                        )}
                      </button>
                    </td>

                    {/* Featured toggle */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        onClick={() => toggleField(pkg, 'is_featured')}
                        disabled={toggling === `${pkg.id}-is_featured`}
                        title={pkg.is_featured ? 'Remove from featured' : 'Mark as featured'}
                        className="transition-colors disabled:opacity-40"
                      >
                        {toggling === `${pkg.id}-is_featured` ? (
                          <Loader2 className="w-4 h-4 text-gray-400 animate-spin mx-auto" />
                        ) : (
                          <Star
                            className={`w-5 h-5 mx-auto transition-colors ${
                              pkg.is_featured ? 'fill-[#C9A84C] text-[#C9A84C]' : 'text-gray-300 hover:text-[#C9A84C]'
                            }`}
                          />
                        )}
                      </button>
                    </td>

                    {/* Active toggle */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        onClick={() => toggleField(pkg, 'is_active')}
                        disabled={toggling === `${pkg.id}-is_active`}
                        title={pkg.is_active ? 'Deactivate' : 'Activate'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${
                          pkg.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${pkg.is_active ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/packages/${pkg.id}/edit`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => deletePackage(pkg)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
