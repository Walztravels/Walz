export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#C9A84C]/20 border-t-[#C9A84C] rounded-full animate-spin" />
        <p className="text-[#0B1F3A]/40 text-sm font-medium">Loading…</p>
      </div>
    </div>
  )
}
