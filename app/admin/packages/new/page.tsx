'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import PackageForm from '@/components/admin/PackageForm'

export default function NewPackagePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSubmit(data: Record<string, any>) {
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to create package')
        return
      }
      router.push('/admin/packages')
    } catch {
      setError('An unexpected error occurred')
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
          <h1 className="text-2xl font-bold text-[#0B1F3A]">New Package</h1>
          <p className="text-gray-500 text-sm mt-0.5">Fill in the details below to create a new travel package.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <PackageForm onSubmit={handleSubmit} isLoading={isLoading} />
    </div>
  )
}
