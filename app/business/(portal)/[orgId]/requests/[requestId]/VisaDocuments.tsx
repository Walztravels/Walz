'use client'

// Visa-case document list for one VISA service. Rendered only for callers
// the server already determined hold visa-document access (ADMIN/OWNER
// baseline or an explicit VISA_DOCUMENTS_VIEW grant); the API re-checks the
// capability and the two-pronged tenant scope on every call regardless.

import { useState } from 'react'

interface Doc { id: string; documentType: string; fileName: string; createdAt: string }
interface Payload { application: { reference: string; applicantName: string | null; status: string; passportExpiryDate: string | null }; documents: Doc[] }

export default function VisaDocuments({ orgId, requestId, serviceId }: { orgId: string; requestId: string; serviceId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/requests/${requestId}/services/${serviceId}/visa-documents`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setError('Visa documents are not available.')
      else setData(body)
    } finally {
      setLoading(false)
    }
  }

  if (!data) {
    return (
      <div style={{ marginTop: 6 }}>
        {error && <p style={{ color: '#900', fontSize: 13 }}>{error}</p>}
        <button type="button" onClick={load} disabled={loading} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', fontSize: 13 }}>
          {loading ? 'Loading…' : 'View visa documents'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 6, padding: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 6, fontSize: 13 }}>
      <div style={{ marginBottom: 6 }}>
        {data.application.applicantName ?? 'Applicant'} &middot; {data.application.status}
        {data.application.passportExpiryDate && <> &middot; passport expires {new Date(data.application.passportExpiryDate).toISOString().slice(0, 10)}</>}
      </div>
      {data.documents.length === 0 ? <p style={{ color: '#666' }}>No documents uploaded yet.</p> : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.documents.map(d => <li key={d.id}>{d.documentType.replace(/_/g, ' ')} — {d.fileName} <span style={{ color: '#888' }}>({new Date(d.createdAt).toISOString().slice(0, 10)})</span></li>)}
        </ul>
      )}
    </div>
  )
}
