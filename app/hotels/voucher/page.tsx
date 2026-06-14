import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import prisma from '@/lib/db'
import { CheckCircle, Calendar, Users, FileText, Building } from 'lucide-react'

import { PrintButton } from '@/components/hotels/PrintButton'

export const dynamic = 'force-dynamic'

async function VoucherContent({ ref }: { ref: string }) {
  const booking = await prisma.booking.findFirst({
    where: { bookingReference: ref, type: 'HOTEL' },
  })

  if (!booking) notFound()

  const info = (booking.passengers as any[])[0]

  return (
    <div className="min-h-screen bg-[#F5F0E8] py-10 px-4">
      <div className="max-w-2xl mx-auto">

        <div className="bg-[#0B1F3A] rounded-2xl p-6 mb-6 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <h1 className="text-white text-2xl font-bold">Booking Confirmed</h1>
          <p className="text-white/60 text-sm mt-1">Your hotel booking is confirmed</p>
        </div>

        {/* Cert 4.4 — booking references mandatory */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#C9A84C]" /> Booking References
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Walz Travels Reference</p>
              <p className="font-bold text-[#0B1F3A] font-mono">{booking.bookingReference}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Supplier Reference</p>
              <p className="font-bold text-[#0B1F3A] font-mono">{info?.hotelbedsRef ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Cert 4.2 — hotel information mandatory */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
            <Building className="w-4 h-4 text-[#C9A84C]" /> Hotel Information
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Hotel</span>
              <span className="font-semibold text-[#0B1F3A]">{info?.hotelName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Room type</span>
              <span className="font-semibold">{info?.roomName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Board type</span>
              <span className="font-semibold">{info?.boardName}</span>
            </div>
          </div>
        </div>

        {/* Cert 4.4 — stay dates mandatory */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#C9A84C]" /> Stay Dates
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Check-in</p>
              <p className="font-bold text-[#0B1F3A]">{info?.checkIn}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Check-out</p>
              <p className="font-bold text-[#0B1F3A]">{info?.checkOut}</p>
            </div>
          </div>
        </div>

        {/* Cert 4.3 — guest details mandatory */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#C9A84C]" /> Guest Details
          </h2>
          <div className="text-sm">
            <p className="text-gray-500">Lead Passenger</p>
            <p className="font-bold text-[#0B1F3A]">{info?.holderName}</p>
          </div>
        </div>

        {/* Cert 4.5 — payment information mandatory */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4 text-sm text-gray-700">
          <p className="font-semibold text-[#0B1F3A] mb-1">Payment Information</p>
          <p>
            Payable through <strong>{info?.supplier?.name ?? 'HBX Group'}</strong>,
            acting as agent for the service operating company, details of which can be provided
            upon request. VAT: {info?.supplier?.vatNumber ?? 'N/A'}.
            Reference: {info?.hotelbedsRef}
          </p>
        </div>

        {/* Cert 3.8 — cancellation policies */}
        {Array.isArray(info?.cancellationPolicies) && info.cancellationPolicies.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-4 text-sm">
            <p className="font-semibold text-red-800 mb-2">Cancellation Policy</p>
            {info.cancellationPolicies.map((p: any, i: number) => (
              <p key={i} className="text-red-700">
                Cancellation fee of <strong>{booking.currency} {p.amount}</strong> applies
                from <strong>{new Date(p.from).toLocaleDateString('en-GB')}</strong>
              </p>
            ))}
          </div>
        )}

        <PrintButton />

        <p className="text-center text-xs text-gray-400 mt-4">
          Questions? WhatsApp us on +44 7398 753797 · contact@walztravels.com
        </p>
      </div>
    </div>
  )
}

export default function VoucherPage({ searchParams }: { searchParams: { ref: string } }) {
  return (
    <Suspense>
      <VoucherContent ref={searchParams.ref} />
    </Suspense>
  )
}
