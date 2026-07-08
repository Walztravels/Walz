import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import Papa from 'papaparse'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin' && session.staffRole !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Could not parse form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'csv') {
    return NextResponse.json({ error: 'Only .csv files are supported' }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large — max 20 MB' }, { status: 400 })
  }

  const text = await file.text()

  const result = Papa.parse<Record<string, string>>(text, {
    header:         true,
    skipEmptyLines: true,
  })

  const headers     = (result.meta.fields ?? []).filter(Boolean)
  const allRows     = result.data as Record<string, string>[]
  const previewRows = allRows.slice(0, 5)
  const totalRows   = allRows.length

  if (headers.length === 0) {
    return NextResponse.json({ error: 'CSV appears to be empty or has no header row' }, { status: 400 })
  }

  return NextResponse.json({ headers, previewRows, totalRows })
}
