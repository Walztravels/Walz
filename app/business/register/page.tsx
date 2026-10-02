import { Suspense } from 'react'
import type { Metadata } from 'next'
import BusinessRegisterForm from './BusinessRegisterForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Create your Walz Business account',
  description: 'Create a Walz Business account to manage travel requests, travellers and your organization.',
  robots: { index: false, follow: false },
}

export default function BusinessRegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0B1F3A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BusinessRegisterForm />
    </Suspense>
  )
}
