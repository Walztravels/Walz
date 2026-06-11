'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import PackageForm, { type TravelPackage } from '@/components/admin/PackageForm'

export default function EditPackagePage() {
  const router              = useRouter()
  const { id }              = useParams<{ id: string }>()
  const [pkg, setPkg]       = useState<Partial<TravelPackage> | null>(null)
  const [fetching, setFetching] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/packages/${id}`)
        if (!res.ok) {
          const data = await res.json()
          setFetchError(data.error ?? 'Package not found')
          return
        }
        const data = await res.json()
        setPkg(data)
      } catch {
        setFetchError('Failed to load package')
      } finally {
        setFetching(false)
      }
    }
    if (id) load()
  }, [id])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSubmit(data: Record<string, any>) {
    setSaveError(null)
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/packages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveError(json.error ?? 'Failed to save package')
        return
      }
      router.push('/admin/packages')
    } catch {
      setSaveError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/packages"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Packages
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">
            {pkg?.title ? `Edit: ${pkg.title}` : 'Edit Package'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Update the details below and save.</p>
        </div>
      </div>

      {/* Loading state */}
      {fetching && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#C9A84C] animate-spin" />
        </div>
      )}

      {/* Fetch error */}
      {fetchError && !fetching && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          {fetchError}
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          {saveError}
        </div>
      )}

      {/* Form */}
      {!fetching && pkg && (
        <PackageForm
          initialData={pkg}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
