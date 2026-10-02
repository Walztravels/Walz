import { Suspense } from 'react'
import type { Metadata } from 'next'
import BusinessLoginForm from './BusinessLoginForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in to Walz Business',
  description: 'Sign in to your Walz Business account to manage travel requests, travellers and your organization.',
  robots: { index: false, follow: false },
}

export default function BusinessLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0B1F3A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BusinessLoginForm />
    </Suspense>
  )
}
