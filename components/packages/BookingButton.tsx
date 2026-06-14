'use client'

import { useState } from 'react'
import PackageBookingModal from '@/components/PackageBookingModal'

interface BookingButtonProps {
  pkg: {
    id: string
    slug: string
    title: string
    price_per_person: number
    currency: string
    deposit_amount: number | null
    departure_date: string | null
    total_seats: number | null
    seats_booked: number
  }
}

export default function BookingButton({ pkg }: BookingButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const seatsLeft = pkg.total_seats != null ? pkg.total_seats - (pkg.seats_booked || 0) : null
  const soldOut = seatsLeft !== null && seatsLeft <= 0

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={soldOut}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
      >
        {soldOut ? 'Fully Booked' : 'Book This Package'}
      </button>

      <PackageBookingModal
        pkg={pkg}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  )
}
