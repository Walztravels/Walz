'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewPackageRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/packages') }, [router])
  return null
}
