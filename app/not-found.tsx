import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: { absolute: 'Page Not Found | Walz Travels' },
}

export default function NotFound() {
  return (
    <div className="min-h-[85vh] flex items-center justify-center py-16 px-4 bg-[#F7F8FA]">
      <div className="w-full max-w-md text-center">

        {/* Logo */}
        <Link href="/" className="inline-flex justify-center mb-8">
          <Image
            src="/walz-logo.png"
            alt="Walz Travels"
            width={140}
            height={140}
            className="w-[140px] h-auto object-contain"
          />
        </Link>

        {/* 404 */}
        <div className="mb-6">
          <p className="text-[#C9A84C] text-7xl font-bold mb-2">404</p>
          <h1 className="text-2xl font-bold text-[#0B1F3A] mb-3">Page Not Found</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Looks like this destination doesn&apos;t exist. Let&apos;s get you back on track.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#0B1F3A] text-white font-semibold rounded-xl text-sm hover:bg-[#0d2345] transition-colors"
          >
            ← Back to Homepage
          </Link>
          <Link
            href="/visa"
            className="inline-flex items-center justify-center px-6 py-3 border-2 border-[#C9A84C] text-[#C9A84C] font-semibold rounded-xl text-sm hover:bg-[#C9A84C] hover:text-[#0B1F3A] transition-colors"
          >
            Explore Our Services
          </Link>
        </div>

        {/* Help */}
        <p className="mt-8 text-gray-400 text-xs">
          Need help?{' '}
          <a href="https://wa.me/12317902336" className="text-[#C9A84C] hover:underline font-medium">
            WhatsApp us
          </a>{' '}
          or{' '}
          <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline font-medium">
            email us
          </a>
        </p>

      </div>
    </div>
  )
}
