'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function FormTrackerRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/visa-applications') }, [router])
  return null
}
