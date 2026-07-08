'use client'

import Link from 'next/link'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

export default function UnauthorizedPage() {
  const { profile, loading } = useStaffPermissions()

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center mx-auto mb-6">
          <ShieldOff className="w-9 h-9 text-red-400" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Access Restricted</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          You don&apos;t have permission to view this page.
          {!loading && profile && (
            <>
              {' '}Your current role is{' '}
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${profile.roleBadge}`}>
                {profile.roleLabel}
              </span>
              .
            </>
          )}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0B1F3A]/90 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <a
            href="https://wa.me/12317902336"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-all"
          >
            Request Access
          </a>
        </div>

        {/* Hint */}
        <p className="mt-8 text-xs text-gray-400">
          If you believe this is an error, contact your Super Admin to update your role permissions.
        </p>

      </div>
    </div>
  )
}
