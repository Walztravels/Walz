'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function NewBlogPostRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/blog') }, [router])
  return null
}
