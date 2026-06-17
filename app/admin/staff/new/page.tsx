'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewStaffRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/staff') }, [router])
  return null
}
