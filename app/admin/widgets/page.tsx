import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { AdminWidgets } from '@/components/admin/AdminWidgets'

export const dynamic = 'force-dynamic'

const DEFAULT_WIDGETS = [
  { key: 'flight_search', label: 'Flight Search Widget', enabled: true, order: 0 },
  { key: 'hotel_search', label: 'Hotel Search Widget', enabled: true, order: 1 },
  { key: 'visa_checker', label: 'Visa Checker Widget', enabled: true, order: 2 },
  { key: 'ai_chatbot', label: 'AI Travel Assistant Chatbot', enabled: true, order: 3 },
  { key: 'whatsapp_button', label: 'WhatsApp Chat Button', enabled: true, order: 4 },
]

export default async function WidgetsPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  let widgets = await prisma.widgetConfig.findMany({ orderBy: { order: 'asc' } })

  if (widgets.length === 0) {
    await prisma.widgetConfig.createMany({ data: DEFAULT_WIDGETS, skipDuplicates: true })
    widgets = await prisma.widgetConfig.findMany({ orderBy: { order: 'asc' } })
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Widget Management</h1>
        <p className="text-gray-500 text-sm mt-1">Control which widgets appear on your website and their order.</p>
      </div>
      <AdminWidgets initial={widgets} />
    </div>
  )
}
