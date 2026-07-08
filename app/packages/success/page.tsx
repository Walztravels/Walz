import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, MessageCircle, ArrowLeft } from 'lucide-react'
import prisma from '@/lib/db'

export const metadata: Metadata = {
  title: { absolute: 'Booking Confirmed | Walz Travels' },
}

type Props = { searchParams: { ref?: string; redirect_status?: string } }

export default async function PackageSuccessPage({ searchParams }: Props) {
  const { ref, redirect_status } = searchParams

  if (!ref) notFound()

  const booking = await prisma.booking.findUnique({ where: { bookingReference: ref } })
  if (!booking) notFound()

  if (redirect_status === 'succeeded' && booking.paymentStatus === 'PENDING') {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', paymentStatus: 'SUCCEEDED' },
    })
  }

  const addons = booking.addons as Record<string, unknown> | null
  const packageName  = (addons?.packageName  as string)  ?? 'Your Package'
  const travelers    = (addons?.travelers    as number)  ?? 1
  const paymentType  = (addons?.paymentType  as string)  ?? 'full'
  const contactName  = (addons?.contactName  as string)  ?? ''

  const firstName = contactName.split(' ')[0]

  const waText = encodeURIComponent(
    `Hi! I just booked the ${packageName} package. My booking reference is ${ref}. Can you send me the next steps?`
  )

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center py-16 px-4">
      <div className="max-w-lg w-full">

        {/* Success mark */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-[#C9A84C]/15 flex items-center justify-center mx-auto mb-5">
            <Check className="w-10 h-10 text-[#C9A84C]" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-bold text-[#0B1F3A] mb-2">
            {paymentType === 'deposit' ? 'Deposit Received!' : 'Payment Confirmed!'}
          </h1>
          <p className="text-gray-500">
            {firstName ? `Thank you, ${firstName}! ` : 'Thank you! '}Your booking is confirmed.
          </p>
        </div>

        {/* Booking details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="text-center mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Booking Reference</p>
            <p className="text-2xl font-bold text-[#0B1F3A] font-mono tracking-wider">{ref}</p>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Package</span>
              <span className="font-semibold text-[#0B1F3A] text-right max-w-[60%]">{packageName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Travelers</span>
              <span className="font-semibold text-[#0B1F3A]">
                {travelers} {Number(travelers) === 1 ? 'person' : 'people'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Payment type</span>
              <span className="font-semibold text-[#0B1F3A]">
                {paymentType === 'deposit' ? '30% deposit' : 'Full payment'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Amount paid</span>
              <span className="font-bold text-[#C9A84C]">
                {booking.currency} {booking.totalAmount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="bg-[#0B1F3A] rounded-2xl p-6 mb-6">
          <h2 className="font-bold text-xs uppercase tracking-widest mb-4 text-[#C9A84C]">What happens next</h2>
          <ul className="space-y-3">
            {([
              'Our team will review your booking within 24 hours',
              'You will receive a confirmation email with full details',
              'We will contact you on WhatsApp to confirm your seat',
              paymentType === 'deposit' ? 'Remaining balance is due 60 days before departure' : null,
            ] as (string | null)[]).filter(Boolean).map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                <span className="w-5 h-5 rounded-full bg-[#C9A84C]/20 text-[#C9A84C] text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <a
            href={`https://wa.me/12317902336?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-4 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
          >
            <MessageCircle className="w-5 h-5" />
            Message us on WhatsApp
          </a>
          <Link
            href="/packages"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-[#0B1F3A] text-[#0B1F3A] font-semibold text-sm hover:bg-[#0B1F3A] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse more packages
          </Link>
        </div>

      </div>
    </div>
  )
}
