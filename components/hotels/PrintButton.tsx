'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="w-full bg-[#0B1F3A] text-white font-bold py-3 rounded-xl hover:bg-[#1a3358] transition-colors print:hidden"
    >
      Download / Print Voucher
    </button>
  )
}
