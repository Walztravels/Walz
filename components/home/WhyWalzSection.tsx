import { Database, Clock, Award, HeadphonesIcon, Globe, ShieldCheck, Sparkles } from 'lucide-react'

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
    <section className="py-20 lg:py-28 bg-white relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-walz-gold/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-walz-deep-navy/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      
      <div className="container-walz relative">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="section-label justify-center mb-4">
            <Sparkles className="w-4 h-4" />
            <span>Why Choose Us</span>
          </div>
          <h2 className="section-title text-balance mb-5">
            The Walz Travels Difference
          </h2>
          <p className="text-walz-muted max-w-2xl mx-auto text-lg leading-relaxed">
            We don&apos;t just book travel — we craft journeys. Here&apos;s what sets us apart
            from every other travel agency.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
          {features.map(({ icon: Icon, title, description, highlight }) => (
            <div
              key={title}
              className="group card-elevated p-7 lg:p-8"
            >
              {/* Icon */}
              <div className="w-14 h-14 rounded-2xl walz-gold-gradient flex items-center justify-center mb-6 shadow-gold-glow group-hover:scale-105 transition-transform duration-300">
                <Icon className="w-7 h-7 text-walz-deep-navy" />
              </div>

              {/* Title */}
              <h3 className="font-display text-xl font-bold text-walz-deep-navy mb-3">
                {title}
              </h3>

              {/* Description */}
              <p className="text-walz-muted text-sm leading-relaxed mb-5">
                {description}
              </p>

              {/* Highlight */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-walz-gold/10 border border-walz-gold/20">
                <div className="w-1.5 h-1.5 rounded-full bg-walz-gold" />
                <span className="text-walz-gold text-xs font-semibold">
                  {highlight}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-5 p-8 rounded-3xl bg-luxury-dark shadow-luxury">
            <div className="text-center sm:text-left">
              <p className="text-walz-white font-display text-xl font-semibold mb-1">Ready to start your journey?</p>
              <p className="text-walz-muted text-sm">Speak with our travel experts today</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <a
                href="https://wa.me/447398753797"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold text-sm px-6 py-3 rounded-xl whitespace-nowrap"
              >
                WhatsApp Us
              </a>
              <a
                href="/flights"
                className="btn-outline-gold text-sm px-6 py-3 rounded-xl whitespace-nowrap border border-walz-gold/50"
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
