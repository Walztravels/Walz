'use client'

const TIERS = [
  { name: 'Bronze', miles: '0+',    mult: '1×',   color: '#CD7F32', bg: '#CD7F3215', desc: 'Welcome reward' },
  { name: 'Silver', miles: '5,000+', mult: '1.25×', color: '#94A3B8', bg: '#94A3B815', desc: 'Priority access' },
  { name: 'Gold',   miles: '20,000+', mult: '1.5×', color: '#C9A84C', bg: '#C9A84C15', desc: 'Premium perks' },
  { name: 'Platinum',miles: '50,000+',mult: '2×',   color: '#8B5CF6', bg: '#8B5CF615', desc: 'Concierge level' },
]

const PERKS = [
  {
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    title: '10 Miles per £1',
    desc: 'Earn on every booking — flights, hotels, visas and extras.',
  },
  {
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
      </svg>
    ),
    title: '100 Miles = £1',
    desc: 'Redeem instantly at checkout for discounts on your next flight.',
  },
  {
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
      </svg>
    ),
    title: 'Tier Benefits',
    desc: 'Upgrade to Gold or Platinum for lounge access, free seat selection and more.',
  },
  {
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    title: 'Partner Airlines',
    desc: 'Transfer Jade Miles to Qatar, Emirates, BA and more at Gold & Platinum level.',
  },
]

export function JadeMilesSection() {
  return (
    <section className="bg-[#0B1F3A] py-20 lg:py-28 px-5 sm:px-8 relative overflow-hidden">
      {/* Decorative gold gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-1 bg-gradient-to-r from-transparent via-[#C9A84C] to-transparent opacity-30" />

      <div className="container-walz">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left — tiers */}
          <div>
            {/* Logo mark */}
            <div className="flex items-center gap-3 mb-8">
              <img src="/jade-avatar.jpg" alt="Jade" className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-[#C9A84C]/30" />
              <div>
                <p className="text-[#C9A84C] font-bold text-base leading-none">Jade Miles</p>
                <p className="text-white/30 text-xs mt-0.5 tracking-widest uppercase">Loyalty Programme</p>
              </div>
            </div>

            <h2 className="font-display text-4xl lg:text-5xl font-bold text-white leading-tight mb-5">
              Every flight<br />
              <span style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #F0D98A 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                earns rewards
              </span>
            </h2>
            <p className="text-white/45 text-base leading-relaxed mb-10 max-w-md">
              Earn 10 Jade Miles for every £1 you spend with Walz Travels. Climb the tiers for multiplied rewards, lounge access, and exclusive partner airline transfers.
            </p>

            {/* Tier cards */}
            <div className="grid grid-cols-2 gap-3 mb-10">
              {TIERS.map(t => (
                <div key={t.name}
                  className="rounded-2xl border p-4 transition-all hover:scale-[1.02]"
                  style={{ borderColor: `${t.color}30`, backgroundColor: t.bg }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm" style={{ color: t.color }}>{t.name}</span>
                    <span className="text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{t.miles}</span>
                  </div>
                  <p className="text-white text-xl font-bold leading-none">{t.mult}</p>
                  <p className="text-white/30 text-[11px] mt-1">{t.desc}</p>
                </div>
              ))}
            </div>

            <a href="/flights/loyalty"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[#C9A84C]/30 text-[#C9A84C] text-sm font-semibold hover:bg-[#C9A84C] hover:text-[#0B1F3A] transition-all group">
              Discover Jade Miles
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </a>
          </div>

          {/* Right — perks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PERKS.map(p => (
              <div key={p.title}
                className="bg-white/4 border border-white/6 rounded-2xl p-6 hover:border-[#C9A84C]/20 hover:bg-white/6 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center text-[#C9A84C] mb-4 group-hover:bg-[#C9A84C]/15 transition-colors">
                  {p.svg}
                </div>
                <p className="font-bold text-white text-sm mb-1.5">{p.title}</p>
                <p className="text-white/40 text-xs leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
