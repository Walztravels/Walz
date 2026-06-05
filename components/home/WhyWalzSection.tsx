import { Globe, FileText, MessageCircle, ShieldCheck, Route, Sparkles } from 'lucide-react'

const features = [
  {
    icon: Globe,
    title: 'Real Travel Expertise',
    description: 'Global flight systems and destination knowledge built from years of helping travellers reach their goals.',
  },
  {
    icon: FileText,
    title: 'Trusted Visa Guidance',
    description: 'Document preparation and application support that reduces errors and improves approval chances.',
  },
  {
    icon: MessageCircle,
    title: 'Fast Human Support',
    description: 'WhatsApp, email and phone when you need answers — not automated bots or endless hold times.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Booking Experience',
    description: 'IATA certification and Stripe payments protect your money and personal information.',
  },
  {
    icon: Route,
    title: 'Simple and Complex Trips',
    description: 'From single flights to multi-part itineraries with visas, hotels, and tours — we handle it all.',
  },
  {
    icon: Sparkles,
    title: 'Global Service Mindset',
    description: 'UK, Canada, UAE, Nigeria, Ghana and beyond — we understand the routes you travel.',
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
          <h2 className="section-title text-balance mb-5">
            Why travelers choose Walz Travels
          </h2>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
          {features.map(({ icon: Icon, title, description }) => (
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
              <p className="text-walz-muted text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
