import { redirect } from 'next/navigation'

export default function LegacyBookings() {
  redirect('/portal/dashboard#bookings')
}
