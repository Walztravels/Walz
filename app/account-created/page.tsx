import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle, Plane } from 'lucide-react'

export const metadata = {
  title: 'Welcome to Walz Travels',
  description: 'Your account has been verified.',
}

export default function AccountCreatedPage() {
  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 bg-[#F7F8FA]">
      <div className="w-full max-w-md text-center">

        <Link href="/" className="flex justify-center mb-8">
          <Image src="/walz-logo.png" alt="Walz Travels" width={140} height={140}
            className="h-12 w-auto object-contain" />
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
          {/* Tick */}
          <div className="w-20 h-20 rounded-full walz-gold-gradient flex items-center justify-center mx-auto mb-6 shadow-lg">
            <CheckCircle className="w-10 h-10 text-[#0B1F3A]" />
          </div>

          <h1 className="font-bold text-[#0B1F3A] text-2xl lg:text-3xl mb-3">
            Welcome to Walz Travels
          </h1>

          <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
            Your account has been created and verified. You can now manage your bookings,
            vouchers and visa applications from your personal dashboard.
          </p>

          {/* Features strip */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { emoji: '✈️', label: 'Book Flights' },
              { emoji: '📋', label: 'Track Visas' },
              { emoji: '🎁', label: 'Gift Vouchers' },
            ].map(({ emoji, label }) => (
              <div key={label} className="bg-[#F7F8FA] rounded-xl py-3 px-2">
                <div className="text-2xl mb-1">{emoji}</div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="space-y-3">
            <Link href="/portal/dashboard" className="block">
              <button className="w-full h-12 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
                Go to My Account →
              </button>
            </Link>
            <Link href="/flights" className="block">
              <button className="w-full h-12 border-2 border-[#C9A84C] text-[#0B1F3A] font-semibold text-sm rounded-xl hover:bg-[#FFFBF0] transition-colors flex items-center justify-center gap-2">
                <Plane className="w-4 h-4" />
                Start Booking
              </button>
            </Link>
          </div>
        </div>

        {/* Contact strip */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Need help?{' '}
            <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
              className="text-[#C9A84C] font-semibold hover:underline">WhatsApp us</a>
            {' '}or email{' '}
            <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] font-semibold hover:underline">
              contact@walztravels.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
