import Link from 'next/link'
import {
  Plane, Hotel, MapPin, Car, Map, FileText, ArrowRight,
} from 'lucide-react'

const SERVICES = [
  {
    href:  '/admin/book/flight',
    icon:  Plane,
    label: 'Flight',
    desc:  'Duffel · 400+ airlines · Round trip, one-way, multi-city',
    color: 'from-blue-600 to-blue-800',
    badge: 'Duffel',
  },
  {
    href:  '/admin/book/hotel',
    icon:  Hotel,
    label: 'Hotel',
    desc:  'Hotelbeds · Live rates · Instant confirmation',
    color: 'from-emerald-600 to-emerald-800',
    badge: 'Hotelbeds',
  },
  {
    href:  '/admin/book/activity',
    icon:  MapPin,
    label: 'Activity',
    desc:  'Hotelbeds · Tickets & excursions · 100+ destinations',
    color: 'from-amber-600 to-amber-800',
    badge: 'Hotelbeds',
  },
  {
    href:  '/admin/book/transfer',
    icon:  Car,
    label: 'Transfer',
    desc:  'Hotelbeds · Airport transfers · Private vehicles',
    color: 'from-purple-600 to-purple-800',
    badge: 'Hotelbeds',
  },
  {
    href:  '/admin/book/tour',
    icon:  Map,
    label: 'Tour',
    desc:  'Viator · Day tours & packages · Worldwide',
    color: 'from-rose-600 to-rose-800',
    badge: 'Viator',
  },
  {
    href:  '/admin/book/visa',
    icon:  FileText,
    label: 'Visa Application',
    desc:  'Internal · Create visa tracker entry for client',
    color: 'from-slate-600 to-slate-800',
    badge: 'Internal',
  },
]

export default function BookHubPage() {
  return (
    <div className="max-w-5xl mx-auto">

      <div className="mb-8">
        <p className="text-[#C9A84C] text-xs font-bold tracking-widest uppercase mb-1">
          Admin · Booking Centre
        </p>
        <h1 className="text-3xl font-bold text-[#0B1F3A]">New Booking</h1>
        <p className="text-gray-500 text-sm mt-1">
          Book any service on behalf of a client. All bookings are logged and the client is notified automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {SERVICES.map(({ href, icon: Icon, label, desc, color, badge }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white rounded-2xl border border-gray-200 hover:border-[#C9A84C]/40
              hover:shadow-lg transition-all duration-200 overflow-hidden"
          >
            <div className={`h-2 bg-gradient-to-r ${color}`} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-2 py-1 rounded-full">
                  {badge}
                </span>
              </div>
              <h3 className="font-bold text-[#0B1F3A] text-base mb-1">{label}</h3>
              <p className="text-gray-400 text-xs leading-relaxed mb-4">{desc}</p>
              <div className="flex items-center gap-1 text-[#C9A84C] text-xs font-semibold group-hover:gap-2 transition-all">
                Book now <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#0B1F3A]">Recent Admin Bookings</h2>
          <Link href="/admin/bookings" className="text-xs text-[#C9A84C] font-semibold hover:underline">
            View all →
          </Link>
        </div>
        <p className="text-gray-400 text-sm">Bookings made from this panel will appear here.</p>
      </div>

    </div>
  )
}
