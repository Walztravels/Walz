import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import Papa from 'papaparse'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

// Normalize phone: digits only, for duplicate matching
function normalizePhone(raw: string): string {
  return (raw ?? '').replace(/\D/g, '')
}

type ColumnMapping = {
  name:        string | null
  contact:     string | null
  email:       string | null
  service:     string | null
  destination: string | null
  travelDate:  string | null
  details:     string | null
  createdAt:   string | null
}

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

  const file    = formData.get('file') as File | null
  const mapJson = formData.get('mapping') as string | null
  const source  = (formData.get('source') as string | null) ?? 'csv_import'

  if (!file)    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!mapJson) return NextResponse.json({ error: 'No column mapping provided' }, { status: 400 })

  let mapping: ColumnMapping
  try {
    mapping = JSON.parse(mapJson) as ColumnMapping
  } catch {
    return NextResponse.json({ error: 'Invalid column mapping JSON' }, { status: 400 })
  }

  if (!mapping.name) {
    return NextResponse.json({ error: 'Name column mapping is required' }, { status: 400 })
  }
  if (!mapping.contact && !mapping.email) {
    return NextResponse.json({ error: 'At least one of Contact/Phone or Email must be mapped' }, { status: 400 })
  }

  const text   = await file.text()
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const rows   = result.data as Record<string, string>[]

  // ── Collect all phone/email values for batch duplicate check ──────────────
  const csvEmails  = new Set<string>()
  const csvPhones  = new Set<string>()

  for (const row of rows) {
    const email   = mapping.email   ? (row[mapping.email]   ?? '').trim().toLowerCase() : ''
    const phone   = mapping.contact ? normalizePhone(row[mapping.contact] ?? '') : ''
    if (email)  csvEmails.add(email)
    if (phone)  csvPhones.add(phone)
  }

  // ── Query existing leads & users for those emails/phones ──────────────────
  const [existingLeadsByEmail, existingLeadsByPhone, existingUsersByEmail] = await Promise.all([
    csvEmails.size > 0
      ? prisma.lead.findMany({ where: { email: { in: [...csvEmails], mode: 'insensitive' } }, select: { email: true } })
      : [],
    csvPhones.size > 0
      ? prisma.lead.findMany({ where: { whatsapp: { in: [...csvPhones] } }, select: { whatsapp: true } })
      : [],
    csvEmails.size > 0
      ? prisma.user.findMany({ where: { email: { in: [...csvEmails], mode: 'insensitive' } }, select: { email: true } })
      : [],
  ])

  const knownEmails = new Set<string>([
    ...existingLeadsByEmail.map(l => (l.email ?? '').toLowerCase()),
    ...existingUsersByEmail.map(u => (u.email ?? '').toLowerCase()),
  ])
  const knownPhones = new Set<string>(
    existingLeadsByPhone.map(l => normalizePhone(l.whatsapp ?? ''))
  )

  // ── Process rows ──────────────────────────────────────────────────────────
  const importBatchId   = `batch-${nanoid(12)}`
  const importTimestamp = new Date()

  let imported         = 0
  let skippedDuplicate = 0
  let skippedInvalid   = 0
  const errors: { row: number; reason: string }[] = []

  const toCreate: Parameters<typeof prisma.lead.create>[0]['data'][] = []

  for (let idx = 0; idx < rows.length; idx++) {
    const row    = rows[idx]
    const rowNum = idx + 2 // 1-indexed, accounting for header row

    const rawName    = mapping.name        ? (row[mapping.name]        ?? '').trim() : ''
    const rawContact = mapping.contact     ? (row[mapping.contact]     ?? '').trim() : ''
    const rawEmail   = mapping.email       ? (row[mapping.email]       ?? '').trim() : ''
    const rawService = mapping.service     ? (row[mapping.service]     ?? '').trim() : ''
    const rawDest    = mapping.destination ? (row[mapping.destination] ?? '').trim() : ''
    const rawDate    = mapping.travelDate  ? (row[mapping.travelDate]  ?? '').trim() : ''
    const rawDetails = mapping.details     ? (row[mapping.details]     ?? '').trim() : ''
    const rawCreated = mapping.createdAt   ? (row[mapping.createdAt]   ?? '').trim() : ''

    // Skip rows where both name AND (contact + email) are empty
    if (!rawName && !rawContact && !rawEmail) {
      skippedInvalid++
      if (errors.length < 20) errors.push({ row: rowNum, reason: 'Name, contact, and email all empty' })
      continue
    }
    if (!rawName) {
      skippedInvalid++
      if (errors.length < 20) errors.push({ row: rowNum, reason: 'Name is empty' })
      continue
    }

    const normPhone = normalizePhone(rawContact)
    const normEmail = rawEmail.toLowerCase()

    // Duplicate check
    if (normEmail && knownEmails.has(normEmail)) {
      skippedDuplicate++
      continue
    }
    if (normPhone && knownPhones.has(normPhone)) {
      skippedDuplicate++
      continue
    }

    // Mark as seen within this batch (avoid intra-batch dupes)
    if (normEmail) knownEmails.add(normEmail)
    if (normPhone) knownPhones.add(normPhone)

    let createdAt: Date | undefined
    if (rawCreated) {
      const parsed = new Date(rawCreated)
      if (!isNaN(parsed.getTime())) createdAt = parsed
    }

    toCreate.push({
      name:         rawName,
      whatsapp:     normPhone || undefined,
      email:        normEmail || undefined,
      service:      rawService || 'Other',
      destination:  rawDest   || undefined,
      travelDate:   rawDate   || undefined,
      details:      rawDetails || undefined,
      source:       source,
      status:       'New',
      importBatchId,
      createdAt:    createdAt ?? importTimestamp,
    })

    imported++
  }

  // ── Bulk insert in batches of 100 ─────────────────────────────────────────
  const CHUNK = 100
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK)
    await prisma.lead.createMany({
      data:           chunk as any,
      skipDuplicates: false,
    }).catch((e: Error) => {
      console.error('[import] batch insert error:', e.message)
    })
  }

  return NextResponse.json({
    imported,
    skippedDuplicates: skippedDuplicate,
    skippedInvalid,
    importBatchId,
    errors,
  })
}
