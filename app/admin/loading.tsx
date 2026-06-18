export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-[3px] border-[#C9A84C]/20 border-t-[#C9A84C] rounded-full animate-spin" />
        <p className="text-gray-400 text-xs">Loading…</p>
      </div>
    </div>
  )
}
