import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import prisma from '@/lib/db'
import { hotelbedsRequest } from '@/lib/hotelbeds'
import { formatInTimezone } from '@/lib/timezones'
import { CheckCircle, MapPin, Calendar, Users, FileText, AlertTriangle } from 'lucide-react'
import { PrintButton } from '@/components/hotels/PrintButton'

export const dynamic = 'force-dynamic'

async function VoucherContent({ bookingRef }: { bookingRef: string }) {
  const booking = await prisma.booking.findFirst({
    where: { bookingReference: bookingRef, type: 'HOTEL' },
  })
  if (!booking) notFound()

  const info = (booking.passengers as any[])[0]
  const tz   = info?.destinationTimezone ?? 'UTC'

  const fmt = (d: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(d))

  // §4.4 — rate comments mandatory on voucher if applicable
  let rateComments: string[] = []
  if (info?.rateCommentsId) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const rc = await hotelbedsRequest(
        'content',
        `/ratecomments?language=ENG&date=${today}&rateCommentsId=${encodeURIComponent(info.rateCommentsId)}`,
      )
      const top: any[] = rc.rateComments ?? []
      const flat = top.map((c: any) => c.description ?? c.comment ?? '').filter(Boolean)
      const nested = top.flatMap((g: any) =>
        (g.rateComments ?? []).flatMap((d: any) =>
          (d.rateComments ?? []).map((r: any) => r.comment ?? r.description ?? '').filter(Boolean)
        )
      )
      rateComments = flat.length ? flat : nested
    } catch { /* non-critical — best effort */ }
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] py-10 px-4 print:bg-white">
      <div className="max-w-xl mx-auto space-y-4">

        <div className="bg-[#0B1F3A] rounded-2xl p-6 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <h1 className="text-white text-2xl font-bold">Hotel Booking Confirmed</h1>
          <p className="text-white/50 text-sm mt-1">Powered by Hotelbeds · Walz Travels</p>
        </div>

        {/* References */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-[#C9A84C]" /> Booking References
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-400 text-xs">Walz Reference</p>
              <p className="font-bold text-[#0B1F3A] font-mono">{booking.bookingReference}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Hotelbeds Reference</p>
              <p className="font-bold text-[#0B1F3A] font-mono text-sm">{info?.hotelbedsRef}</p>
            </div>
          </div>
        </div>

        {/* Hotel */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-[#C9A84C]" /> Hotel Details
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Hotel</span>
              <span className="font-semibold text-[#0B1F3A] text-right max-w-[60%]">{info?.hotelName}</span>
            </div>
            {info?.hotelAddress && (
              <div className="flex justify-between">
                <span className="text-gray-400">Address</span>
                <span className="text-right max-w-[60%] text-gray-600">{info.hotelAddress}</span>
              </div>
            )}
            {info?.roomName  && <div className="flex justify-between"><span className="text-gray-400">Room</span><span className="font-medium">{info.roomName}</span></div>}
            {info?.boardName && <div className="flex justify-between"><span className="text-gray-400">Board</span><span className="font-medium">{info.boardName}</span></div>}
          </div>
        </div>

        {/* Dates */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-[#C9A84C]" /> Stay Dates
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-gray-400 text-xs">Check-in</p><p className="font-bold text-[#0B1F3A]">{fmt(info?.checkIn)}</p></div>
            <div><p className="text-gray-400 text-xs">Check-out</p><p className="font-bold text-[#0B1F3A]">{fmt(info?.checkOut)}</p></div>
          </div>
        </div>

        {/* Guests */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-[#0B1F3A] mb-3 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-[#C9A84C]" /> Guest Details
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Lead Guest</span><span className="font-semibold text-[#0B1F3A]">{info?.holderName}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-gray-600">{info?.holderEmail}</span></div>
            {info?.holderPhone && <div className="flex justify-between"><span className="text-gray-400">Phone</span><span className="text-gray-600">{info.holderPhone}</span></div>}
            {Array.isArray(info?.childAges) && info.childAges.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Children ages</span>
                <span className="text-gray-600">{(info.childAges as number[]).join(', ')} yrs</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment — cert §4.5 exact required wording */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm">
          <p className="font-semibold text-[#0B1F3A] mb-1">Payment</p>
          <p className="text-gray-600">
            Payable through <strong>{info?.supplier?.name ?? 'HBX Group'}</strong>, acting as agent
            for the service operating company, details of which can be provided upon request.
            VAT: {info?.supplier?.vatNumber ?? 'N/A'} Reference: {info?.hotelbedsRef}.
          </p>
        </div>

        {/* Cancellation — cert §3.8 + IMPORTANTE: destination timezone, not customer local time */}
        {Array.isArray(info?.cancellationPolicies) && info.cancellationPolicies.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm">
            <p className="font-semibold text-red-800 mb-2">Cancellation Policy</p>
            {info.cancellationPolicies.map((p: any, i: number) => (
              <p key={i} className="text-red-700">
                Fee of <strong>{booking.currency} {p.amount}</strong> applies from{' '}
                <strong>{formatInTimezone(p.from, tz)}</strong>
              </p>
            ))}
            <p className="text-red-500 text-xs mt-2">Times shown in hotel's local timezone ({tz}).</p>
          </div>
        )}

        {/* Rate comments — cert §4.4 (separate requirement from §3.9 pre-booking display) */}
        {rateComments.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm">
            <p className="font-semibold text-[#0B1F3A] mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Rate Conditions
            </p>
            <ul className="space-y-1 text-gray-700 list-disc list-inside">
              {rateComments.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        <PrintButton />

        <p className="text-center text-xs text-gray-400 print:hidden">
          Questions? WhatsApp +12317902336 · contact@walztravels.com
        </p>
      </div>
    </div>
  )
}

export default function HotelVoucherPage({ searchParams }: { searchParams: { ref?: string } }) {
  if (!searchParams.ref) notFound()
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#C9A84C] border-t-transparent rounded-full animate-spin" /></div>}>
      <VoucherContent bookingRef={searchParams.ref} />
    </Suspense>
  )
}
