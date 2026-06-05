import { Database, Clock, Award, HeadphonesIcon, Globe, ShieldCheck } from 'lucide-react'

const features = [
  {
    icon: Database,
    title: 'Sabre GDS Access',
    description:
      'Direct access to the world\'s leading Global Distribution System, ensuring you get the best available fares and real-time inventory across 400+ airlines.',
    highlight: 'Best available fares',
  },
  {
    icon: Clock,
    title: 'Expert Travel Team',
    description:
      'Seasoned travel specialists dedicated to crafting extraordinary experiences for discerning travellers. Our expertise means fewer surprises and more unforgettable moments.',
    highlight: 'Expert specialists',
  },
  {
    icon: Award,
    title: 'IATA Certified',
    description:
      'Fully accredited by the International Air Transport Association. Your bookings are secure, and you benefit from the industry\'s highest standards of service.',
    highlight: 'Industry standard',
  },
  {
    icon: HeadphonesIcon,
    title: '24/7 Support',
    description:
      'Our dedicated team is available around the clock via WhatsApp, email, and phone. Whether you\'re boarding in Bangkok or departing from Dubai, we\'re always here.',
    highlight: 'Always available',
  },
  {
    icon: Globe,
    title: 'Global Reach',
    description:
      'From the Maldives to Manhattan, we have partnerships and expertise across every major destination. Wherever your journey takes you, Walz Travels goes further.',
    highlight: '190+ countries',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Payments',
    description:
      'All payments are processed securely via Stripe with industry-standard encryption. Book with confidence knowing your money and personal details are fully protected.',
    highlight: 'Stripe secured',
  },
]

export function WhyWalzSection() {
  return (
    <section className="py-16 lg:py-24 bg-white">
      <div className="container-walz">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-0.5 bg-walz-gold" />
            <span className="text-walz-gold text-sm font-semibold tracking-wider uppercase">
              Why Choose Us
            </span>
            <div className="w-8 h-0.5 bg-walz-gold" />
          </div>
          <h2 className="font-display text-3xl lg:text-4xl xl:text-5xl font-bold text-walz-deep-navy mb-4">
            The Walz Travels Difference
          </h2>
          <p className="text-walz-muted max-w-2xl mx-auto text-lg leading-relaxed">
            We don&apos;t just book travel — we craft journeys. Here&apos;s what sets us apart
            from every other travel agency.
          </p>
          <div className="divider-gold mx-auto mt-4" />
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map(({ icon: Icon, title, description, highlight }) => (
            <div
              key={title}
              className="group p-6 lg:p-7 rounded-2xl border border-walz-border hover:border-walz-gold/30 bg-white hover:bg-walz-off-white transition-all duration-300 hover:shadow-card"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl walz-gold-gradient flex items-center justify-center mb-5 shadow-gold-glow group-hover:scale-110 transition-transform duration-300">
                <Icon className="w-6 h-6 text-walz-deep-navy" />
              </div>

              {/* Title */}
              <h3 className="font-display text-lg font-bold text-walz-deep-navy mb-2">
                {title}
              </h3>

              {/* Description */}
              <p className="text-walz-muted text-sm leading-relaxed mb-4">
                {description}
              </p>

              {/* Highlight */}
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-walz-gold" />
                <span className="text-walz-gold text-xs font-semibold tracking-wide">
                  {highlight}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4 p-6 rounded-2xl bg-gradient-to-r from-walz-deep-navy to-walz-slate">
            <div className="text-center sm:text-left">
              <p className="text-walz-white font-semibold">Ready to start your journey?</p>
              <p className="text-walz-muted text-sm">Speak with our travel experts today</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <a
                href="https://wa.me/447398753797"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold text-sm px-5 py-2.5 rounded-lg whitespace-nowrap"
              >
                WhatsApp Us
              </a>
              <a
                href="/flights"
                className="px-5 py-2.5 rounded-lg border border-walz-gold/40 text-walz-gold hover:bg-walz-gold/10 transition-colors text-sm font-medium whitespace-nowrap"
              >
                Search Flights
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
