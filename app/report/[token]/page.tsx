import type { Metadata } from 'next'
import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'
import { ClientReportView } from '@/components/ClientReportView'

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: 'Financial Eligibility Report — Walz Travels',
    description: 'Your bank statement financial assessment, prepared by Walz Travels Visa Intelligence.',
    robots: 'noindex, nofollow',
  }
}

async function getReport(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.walztravels.com'
  const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json() as Promise<{
    analysis: BankStatementAnalysis
    client_name: string
    destination: string
    passport_country: string
    analyzed_at: string
  }>
}

export default async function ReportPage({ params }: Props) {
  const data = await getReport(params.token)

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f7f8fc] flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Report Not Found</h1>
          <p className="text-gray-500 text-sm">
            This report link may be invalid or has expired. Please contact Walz Travels for assistance.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ClientReportView
      analysis={data.analysis}
      clientName={data.client_name}
      destination={data.destination}
      analyzedAt={data.analyzed_at}
    />
  )
}
