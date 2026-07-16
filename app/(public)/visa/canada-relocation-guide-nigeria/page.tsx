import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'How to Relocate to Canada from Nigeria 2026 | Walz Travels',
  description: 'Complete guide to relocating from Nigeria to Canada in 2026. Express Entry, Provincial Nominee, study permit routes, costs, and how Walz Travels can help.',
  alternates: { canonical: 'https://www.walztravels.com/visa/canada-relocation-guide-nigeria' },
  openGraph: {
    title: 'How to Relocate to Canada from Nigeria 2026',
    description: 'Step-by-step guide to moving from Nigeria to Canada. Express Entry, PNP, study permit routes, costs and timelines. Expert guidance from Walz Travels.',
    url: 'https://www.walztravels.com/visa/canada-relocation-guide-nigeria',
  },
}

const faqs = [
  {
    q: 'Can a Nigerian move to Canada permanently?',
    a: 'Yes. Nigerians are among the largest groups of successful Canadian permanent resident applicants each year. The main pathways are Express Entry (Federal Skilled Worker, Canadian Experience Class), Provincial Nominee Programs (PNP), and the study-to-PR route. Each pathway has specific eligibility criteria around work experience, language scores, and education.',
  },
  {
    q: 'What is Express Entry and how does it work for Nigerians?',
    a: 'Express Entry is Canada\'s points-based immigration system for skilled workers. You create an Express Entry profile, receive a Comprehensive Ranking System (CRS) score, and IRCC invites the highest-scoring candidates to apply for permanent residence. Nigerians with strong English scores (IELTS 7+), a Canadian job offer, or a provincial nomination score highest. Most Invitation to Apply (ITA) recipients receive PR within 6 months of applying.',
  },
  {
    q: 'How long does it take to relocate from Nigeria to Canada?',
    a: 'Timelines vary by pathway. Express Entry PR (after receiving an ITA) takes approximately 6 months. Provincial Nominee Programs take 12–18 months. Study permits typically take 4–8 weeks. A Temporary Resident Visa (visitor visa) for initial travel takes 8–12 weeks from Nigeria. Walz Travels helps you choose the fastest route for your profile.',
  },
  {
    q: 'How much does it cost to relocate from Nigeria to Canada?',
    a: 'Key costs include: IRCC application fees (CAD $1,365 for Express Entry PR including right of permanent residence fee), IELTS test (approx £200), credential assessment (CAD $200–$300), biometrics (CAD $85), and settlement funds (CAD $13,310 for a single applicant, more for families). Total out-of-pocket costs before arrival typically range from CAD $15,000–$20,000. Walz Travels advises on all fees as part of our consultation.',
  },
  {
    q: 'What English test score do I need for Canadian immigration?',
    a: 'For Express Entry Federal Skilled Worker, you need a minimum CLB 7 (approximately IELTS 6.0 in each skill). To maximise your CRS score, aim for IELTS 7.0–8.0. Canadian Language Benchmark (CLB) 9 or above (IELTS 7.5–8.0) adds significant CRS points and improves your chances of receiving an ITA.',
  },
  {
    q: 'Can I relocate to Canada from Nigeria on a student visa?',
    a: 'Yes. The study-to-PR route is increasingly popular for Nigerians. Study in Canada for 1–2 years, gain Canadian work experience on a Post-Graduate Work Permit (PGWP), and then apply through Canadian Experience Class (CEC) in Express Entry. This route takes 3–5 years total but produces strong PR applications with Canadian credentials and work experience.',
  },
  {
    q: 'Which Canadian province is easiest for Nigerians to immigrate to?',
    a: 'Provincial Nominee Programs (PNPs) in provinces like Ontario, British Columbia, Alberta, and Manitoba actively recruit skilled workers. Ontario Human Capital Priorities stream and British Columbia Skills Immigration are popular choices for Nigerians with Canadian work experience. Prince Edward Island and Nova Scotia have lower CRS thresholds for some streams. The best province depends on your occupation and skills.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.walztravels.com' },
    { '@type': 'ListItem', position: 2, name: 'Visa Services', item: 'https://www.walztravels.com/visa' },
    { '@type': 'ListItem', position: 3, name: 'Canada Relocation Guide — Nigeria', item: 'https://www.walztravels.com/visa/canada-relocation-guide-nigeria' },
  ],
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Relocate to Canada from Nigeria 2026: Complete Guide',
  description: 'Step-by-step guide to relocating from Nigeria to Canada in 2026, covering Express Entry, PNP, study permits, costs, and timelines.',
  author: { '@type': 'Organization', name: 'Walz Travels' },
  publisher: { '@type': 'Organization', name: 'Walz Travels', url: 'https://www.walztravels.com' },
  url: 'https://www.walztravels.com/visa/canada-relocation-guide-nigeria',
}

export default function CanadaRelocationGuideNigeriaPage() {
  return (
    <>
      <Script id="faq-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Script id="breadcrumb-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Script id="article-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <main className="min-h-screen bg-[#F4F6F9]">
        {/* Hero */}
        <div className="bg-[#0B1F3A] text-white px-4 pt-8 pb-12">
          <div className="max-w-3xl mx-auto">
            <nav className="flex items-center gap-2 text-sm text-white/50 mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <span>/</span>
              <Link href="/visa" className="hover:text-white transition-colors">Visa</Link>
              <span>/</span>
              <span className="text-white/80">Canada Relocation Guide — Nigeria</span>
            </nav>
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Immigration Guide · Nigeria → Canada
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              How to Relocate to Canada from Nigeria in 2026
            </h1>
            <p className="text-white/70 text-base max-w-2xl">
              A complete, up-to-date guide covering every pathway to move from Nigeria to Canada — Express Entry, Provincial Nominee, study permits, and family sponsorship. Walz Travels guides you through the full process.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

          {/* Overview */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Can Nigerians Relocate to Canada?</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Yes. Nigerians are among the most successful applicants for Canadian permanent residence. Canada accepts over 400,000 new permanent residents each year under its multi-stream immigration system, and Nigerian applicants with strong English language scores and professional qualifications have a realistic pathway to PR.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              The key is choosing the right pathway for your profile and preparing a strong application. Walz Travels advises clients on every step — from initial profile assessment to departure flights to Toronto, Calgary, or Vancouver.
            </p>
          </div>

          {/* Pathways */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Main Pathways to Relocate to Canada from Nigeria</h2>
            <div className="space-y-4">
              {[
                {
                  title: '1. Express Entry — Federal Skilled Worker (FSW)',
                  timeline: '6–12 months (after ITA)',
                  detail: 'The most common route for skilled Nigerian professionals. You need a minimum CLB 7 English score (IELTS 6.0), at least 1 year of skilled work experience, and a completed secondary or post-secondary education. Higher CRS scores (from IELTS 7.5+, Canadian job offer, or PNP nomination) lead to faster invitations.',
                },
                {
                  title: '2. Provincial Nominee Program (PNP)',
                  timeline: '12–18 months',
                  detail: 'Most Canadian provinces run PNPs that target workers in specific occupations. Ontario, BC, Alberta, and Manitoba are popular with Nigerian applicants. A provincial nomination adds 600 CRS points, virtually guaranteeing an Express Entry ITA. Some PNPs also offer streams outside Express Entry (paper-based).',
                },
                {
                  title: '3. Study Permit → Post-Graduate Work Permit → PR',
                  timeline: '3–5 years total',
                  detail: 'Study at a Designated Learning Institution (DLI) in Canada, graduate, work in Canada on a PGWP, then apply through Canadian Experience Class (CEC). This builds Canadian credentials, work experience, and language scores — all of which boost your CRS score for Express Entry.',
                },
                {
                  title: '4. Family Sponsorship',
                  timeline: '12–24 months',
                  detail: 'If you have a Canadian citizen or permanent resident spouse, common-law partner, or parent who can sponsor you, this is an established pathway. Your sponsor must meet minimum income requirements and commit to supporting you financially for 3 years after your PR is granted.',
                },
                {
                  title: '5. Temporary Resident Visa (first step)',
                  timeline: '8–12 weeks from Nigeria',
                  detail: 'Before applying for permanent routes, many Nigerians first obtain a Canadian visitor visa to attend in-person job interviews, visit a sponsored family member, or attend a Canadian Language Benchmark test. Walz Travels processes Canadian visitor visas for Nigerians end-to-end.',
                },
              ].map((path, i) => (
                <div key={i} className="p-4 border border-gray-100 rounded-xl">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <p className="text-sm font-semibold text-[#0B1F3A]">{path.title}</p>
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-lg font-medium flex-shrink-0">{path.timeline}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{path.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Costs */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Cost to Relocate from Nigeria to Canada</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              These are the main government fees and preparation costs for a single applicant via Express Entry. Family costs are proportionally higher.
            </p>
            <div className="space-y-2">
              {[
                { item: 'Express Entry PR application fee (principal)', cost: 'CAD $1,365' },
                { item: 'IELTS / CELPIP test', cost: 'CAD $280–$320' },
                { item: 'Educational Credential Assessment (ECA)', cost: 'CAD $200–$300' },
                { item: 'Biometrics', cost: 'CAD $85' },
                { item: 'Medical examination', cost: 'CAD $200–$400' },
                { item: 'Police certificate (Nigeria)', cost: 'NGN 15,000–$50,000' },
                { item: 'Settlement funds required (single applicant)', cost: 'CAD $13,310 minimum' },
                { item: 'Flight Lagos → Toronto (one-way)', cost: 'From £640 / CAD $1,100' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <span className="text-xs text-gray-600">{row.item}</span>
                  <span className="text-xs font-semibold text-[#0B1F3A] text-right">{row.cost}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">All figures as at 2026. Government fees are subject to change. Walz Travels provides a personalised cost breakdown during consultation.</p>
          </div>

          {/* Steps */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-4">Step-by-Step: How to Start Your Move to Canada</h2>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Check your eligibility', desc: 'Use the IRCC Come to Canada tool to check which pathways you qualify for. Key factors: education, work experience, age, and English language scores.' },
                { step: '2', title: 'Take the IELTS or CELPIP', desc: 'Most Express Entry pathways require a Canadian Language Benchmark (CLB) of at least 7. Aim for CLB 9+ (IELTS 7.5+) to maximise your CRS score and increase your chances of receiving an ITA.' },
                { step: '3', title: 'Get your credentials assessed', desc: 'Have your Nigerian educational credentials assessed by a Designated Organization (WES is the most widely accepted). This is mandatory for Express Entry FSW.' },
                { step: '4', title: 'Create your Express Entry profile', desc: 'Submit your profile on the IRCC portal with your language scores, work experience, education, and other CRS-boosting factors. Profiles are ranked against other candidates in the pool.' },
                { step: '5', title: 'Receive an Invitation to Apply (ITA)', desc: 'IRCC runs regular Express Entry draws. The lowest accepted CRS score fluctuates — typically 480–550 for general draws. Scores drop in category-based selection draws targeting specific occupations.' },
                { step: '6', title: 'Submit PR application within 60 days', desc: 'Once you receive an ITA, you have 60 days to submit a complete PR application with police certificates, medical results, and reference letters. Walz Travels supports clients through this final critical stage.' },
                { step: '7', title: 'Book your flight to Canada', desc: 'Once you receive your Confirmation of Permanent Residence (COPR), book your Lagos to Toronto/Vancouver/Montreal flight. You must land in Canada before your COPR expiry date to activate your PR status.' },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-[#0B1F3A] font-bold text-sm flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{item.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-[#0B1F3A] mb-5">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <p className="text-sm font-semibold text-[#0B1F3A] mb-1">{faq.q}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-[#0B1F3A] rounded-2xl p-8 text-center">
            <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2">
              Toronto · Vancouver · Calgary · Montreal
            </p>
            <h2 className="text-2xl font-bold text-white mb-3">Start Your Canada Relocation with Walz Travels</h2>
            <p className="text-white/60 text-sm mb-6">
              From visa applications to departure flights, Walz Travels guides Nigerian clients through every step of the Canada relocation process.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/visa/canada-visa-nigeria"
                className="inline-flex items-center justify-center px-8 py-3 bg-amber-500 hover:bg-amber-400 text-[#0B1F3A] font-bold rounded-xl transition-colors"
              >
                Canada Visa for Nigerians →
              </Link>
              <a
                href="https://wa.me/12317902336"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-8 py-3 border-2 border-white/20 hover:border-white/40 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                WhatsApp +12317902336
              </a>
            </div>
          </div>

          {/* Internal links */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] mb-4">Related Guides</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: '/visa/canada-visa-nigeria', label: 'Canada Visitor Visa for Nigerians' },
                { href: '/visa/uk-visa-nigeria', label: 'UK Visa for Nigerians' },
                { href: '/visa/schengen-visa-nigeria', label: 'Schengen Visa for Nigerians' },
                { href: '/flights/los-yyz', label: 'Flights Lagos to Toronto' },
                { href: '/flights/cheap-flights-from-lagos', label: 'Cheap Flights from Lagos' },
                { href: '/visa', label: 'All Visa Services' },
              ].map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-sm text-[#0B1F3A] font-medium"
                >
                  <span className="text-amber-500">→</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center leading-relaxed pb-6">
            Immigration information is sourced from IRCC (Immigration, Refugees and Citizenship Canada) and updated regularly. Immigration decisions are made solely by IRCC. Walz Travels provides application support and is not an immigration law firm.
          </p>
        </div>
      </main>
    </>
  )
}
