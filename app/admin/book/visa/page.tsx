'use client'

import { useRouter } from 'next/navigation'
import { FileText, ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function AdminVisaBookingPage() {
  const router = useRouter()

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/admin/book" className="flex items-center gap-2 text-gray-400 hover:text-[#0B1F3A] text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Booking Centre
      </Link>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-600 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-[#0B1F3A] text-xl">Visa Application</h1>
          <p className="text-gray-400 text-xs">Internal · Visa tracker</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
          <FileText className="w-7 h-7 text-slate-500" />
        </div>
        <p className="text-[#0B1F3A] font-semibold">Create a Visa Application</p>
        <p className="text-gray-400 text-sm">
          Visa applications are managed through the Visa Applications module. Click below to create a new entry.
        </p>
        <button
          onClick={() => router.push('/admin/visa-applications/new')}
          className="inline-flex items-center gap-2 bg-slate-700 text-white font-bold px-6 py-3 rounded-xl hover:bg-slate-800 transition-colors">
          <ExternalLink className="w-4 h-4" />
          Go to Visa Applications
        </button>
      </div>
    </div>
  )
}
