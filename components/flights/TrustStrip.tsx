'use client'

const ITEMS = [
  { icon: '✈️', label: 'IATA Accredited',     sub: 'Official travel partner'  },
  { icon: '🔒', label: 'ATOL Protected',       sub: 'Your money is safe'       },
  { icon: '💬', label: '24/7 Expert Support',  sub: 'WhatsApp & phone'         },
  { icon: '💰', label: 'Price Guarantee',       sub: 'We match any fare'        },
  { icon: '🌍', label: '900+ Airlines',         sub: 'Global GDS access'        },
  { icon: '⚡', label: 'Instant Ticketing',     sub: 'E-tickets in minutes'     },
]

export function TrustStrip() {
  return (
    <section className="bg-white border-y border-black/5 py-6">
      <div className="container-walz">
        <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
          {ITEMS.map(({ icon, label, sub }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">{label}</p>
                <p className="text-xs text-[#0B1F3A]/40">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
