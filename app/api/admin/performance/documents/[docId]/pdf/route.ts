import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { StaffPerformanceDocumentPDF } from '@/lib/pdf/StaffPerformanceDocumentPDF'
import type { WarningType } from '@/lib/performance/template'
import { logPerformanceHistory } from '@/lib/performance/history'
import { ACKNOWLEDGEMENT_TEXT } from '@/lib/performance/acknowledgement'

export const dynamic = 'force-dynamic'

function fmt(d: Date | null | undefined): string {
  if (!d) return 'not on record'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// GET /api/admin/performance/documents/[docId]/pdf
//
// Authorization (no public URLs — mission brief §7/§12):
//   - Super Admin: may preview ANY document at ANY status (draft or issued).
//   - The document's own staff member: may only fetch it once status is
//     ISSUED or ACKNOWLEDGED — never a DRAFT/APPROVED preview of their own
//     warning before a Super Admin has actually issued it.
//   - Everyone else: 403. staffId/documentId in the URL is never trusted
//     as an identity claim — the owning staffId is always read back from
//     the resolved document row.
export async function GET(_req: NextRequest, { params }: { params: { docId: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const document = await prisma.staffPerformanceDocument.findUnique({ where: { id: params.docId } })
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const callerStaffId = session.staffId ?? session.id
  const isSuperAdmin = session.staffRole === 'super_admin'
  const isOwner = callerStaffId === document.staffId
  const ownerCanView = isOwner && (document.status === 'ISSUED' || document.status === 'ACKNOWLEDGED')

  if (!isSuperAdmin && !ownerCanView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isIssued = document.status === 'ISSUED' || document.status === 'ACKNOWLEDGED'
  const content = isIssued ? document.issuedContent ?? document.draftContent : document.draftContent
  const paragraphs = content.split(/\n\n+/)

  // Non-super-admin (the employee) opening the document for the first
  // time — record openedAt exactly once, matching the *SentAt/timestamp
  // idempotency convention used elsewhere in this codebase.
  if (isOwner && !isSuperAdmin && isIssued && !document.openedAt) {
    await prisma.staffPerformanceDocument.update({ where: { id: document.id }, data: { openedAt: new Date() } })
    await logPerformanceHistory({
      caseId: document.caseId,
      documentId: document.id,
      actorStaffId: callerStaffId,
      actorName: session.name,
      action: 'OPENED',
      documentVersion: document.version,
    })
  }

  const element = React.createElement(StaffPerformanceDocumentPDF, {
    warningType: document.warningType as WarningType,
    employeeName: document.employeeNameSnapshot,
    jobTitle: document.jobTitleSnapshot,
    department: document.departmentSnapshot,
    issuedDate: fmt(document.createdAt),
    reviewDate: fmt(document.reviewDate),
    issuedByName: document.issuedByName ?? document.employeeNameSnapshot,
    paragraphs,
    acknowledgement: {
      acknowledgedAt: document.acknowledgedAt ? fmt(document.acknowledgedAt) : null,
      acknowledgementText: document.acknowledgementText ?? ACKNOWLEDGEMENT_TEXT,
    },
    isIssued,
  })
  const pdfBuffer = await renderToBuffer(element as unknown as React.ReactElement)

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="performance-notice-${document.id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
