'use client'

import { MessageCircle, ArrowRight, Plane, Heart, Briefcase, Users } from 'lucide-react'

const travelTypes = [
  {
    icon: Users,
    title: 'Family Holidays',
    description: 'Smooth planning with hotel and transfer support',
    color: 'bg-blue-500/10',
    iconColor: 'text-blue-600',
  },
  {
    icon: Heart,
    title: 'Honeymoons & Special Trips',
    description: 'Premium stays and curated experiences',
    color: 'bg-pink-500/10',
    iconColor: 'text-pink-600',
  },
  {
    icon: Briefcase,
    title: 'Business Travel',
    description: 'Reliable coordination for meetings and executive trips',
    color: 'bg-walz-gold/10',
    iconColor: 'text-walz-gold',
  },
  {
    icon: Plane,
    title: 'Group Travel',
    description: 'Churches, student organisations, retreats, corporate teams',
    color: 'bg-green-500/10',
    iconColor: 'text-green-600',
  },
]

export function PackageGroupSection() {
  return (
    <section className="py-20 lg:py-28 bg-walz-off-white">
      <div className="container-walz">
        <div className="text-center mb-14">
          <h2 className="section-title mb-4">
            Complete travel planning for families, professionals, and groups
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {travelTypes.map(({ icon: Icon, title, description, color, iconColor }) => (
            <div
              key={title}
              className="card-elevated p-7 text-center hover:border-walz-gold/30 transition-all"
            >
              <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center mx-auto mb-5`}>
                <Icon className={`w-7 h-7 ${iconColor}`} />
              </div>
              <h3 className="font-display text-lg font-bold text-walz-deep-navy mb-2">
                {title}
              </h3>
              <p className="text-walz-muted text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold inline-flex items-center gap-2 px-8 py-4 rounded-xl"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Request a Custom Travel Quote</span>
          </a>
        </div>
      </div>
    </section>
  )
}
