import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Clock, CheckCircle, AlertTriangle, ArrowLeft, MessageCircle, Plane, Hotel, Shield } from 'lucide-react'
import { prisma } from '@/lib/db'
import { ADVISORY_CONFIG, RULE_TYPE_CONFIG } from '@/lib/countries'
import type { Metadata } from 'next'
import { Price } from '@/components/common/Price'
import { JadeChatButton } from '@/components/ui/JadeChatButton'

export const dynamic = 'force-dynamic'

// ─── Slug → ISO2 map ─────────────────────────────────────────────────────────
// Covers old static slugs, new friendly slugs, and raw ISO2 codes
const SLUG_TO_ISO2: Record<string, string> = {
  // Friendly slugs
  uk:             'GB',
  'great-britain': 'GB',
  gb:             'GB',
  canada:         'CA',
  uae:            'AE',
  'united-arab-emirates': 'AE',
  schengen:       'FR',
  france:         'FR',
  usa:            'US',
  'united-states': 'US',
  america:        'US',
  australia:      'AU',
  vietnam:        'VN',
  india:          'IN',
  turkey:         'TR',
  kenya:          'KE',
  egypt:          'EG',
  philippines:    'PH',
  morocco:        'MA',
  'new-zealand':  'NZ',
  'south-africa': 'ZA',
}

interface Props {
  params: { country: string }
}

function resolveIso2(slug: string): string {
  const lower = slug.toLowerCase()
  // Check friendly slug map first
  if (SLUG_TO_ISO2[lower]) return SLUG_TO_ISO2[lower]
  // Fall through to upper-cased ISO2 direct lookup
  return slug.toUpperCase()
}

function AdvisoryBadge({ level }: { level: number }) {
  const cfg = ADVISORY_CONFIG[level as keyof typeof ADVISORY_CONFIG] ?? ADVISORY_CONFIG[1]
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      Level {level} — {cfg.label}
    </span>
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const iso2 = resolveIso2(params.country)
  const portal = await prisma.countryPortal.findUnique({ where: { destinationIso2: iso2 } })
  if (!portal) return { title: 'Visa Requirements — Walz Travels' }
  return {
    title: `${portal.countryName} Visa Requirements — Walz Travels`,
    description: `Visa fees, processing times, required documents and Jade's insider tips for ${portal.countryName}. Expert visa assistance from Walz Travels.`,
  }
}

export default async function VisaCountryPage({ params }: Props) {
  const iso2 = resolveIso2(params.country)

  const [portal, advisory, ngRule, docGuides] = await Promise.all([
    prisma.countryPortal.findUnique({ where: { destinationIso2: iso2 } }),
    prisma.travelAdvisory.findUnique({ where: { destinationIso2: iso2 } }),
    prisma.visaRule.findUnique({
      where: { passportIso2_destinationIso2: { passportIso2: 'NG', destinationIso2: iso2 } },
    }),
    prisma.documentGuide.findMany({ where: { destinationIso2: iso2 } }),
  ])

  if (!portal) notFound()

  const ruleType = ngRule?.ruleType ?? 'visa_required'
  const ruleCfg  = RULE_TYPE_CONFIG[ruleType as keyof typeof RULE_TYPE_CONFIG] ?? RULE_TYPE_CONFIG.visa_required
  const advisoryLevel = advisory?.advisoryLevel ?? portal.advisoryLevel
  const advisoryCfg   = ADVISORY_CONFIG[advisoryLevel as keyof typeof ADVISORY_CONFIG] ?? ADVISORY_CONFIG[1]

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Hero */}
      <div className="bg-[#0B1F3A] text-white px-4 pt-8 pb-12">
        <div className="max-w-3xl mx-auto">
          <Link href="/visa"
            className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Visa Intelligence
          </Link>
          <div className="flex items-start gap-5">
            <span className="text-6xl leading-none">{portal.flagEmoji}</span>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{portal.countryName} Visa</h1>
              <div className="flex items-center gap-3 flex-wrap">
                <AdvisoryBadge level={advisoryLevel} />
                <span className="text-white/40 text-sm">{portal.region}</span>
              </div>
              {advisory?.message && (
                <p className="text-white/60 text-sm mt-3">{advisory.message}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Visa Requirement (Nigerian passport default) */}
        <div className={`rounded-2xl p-6 border-2 ${ruleCfg.bg} ${
          ruleType === 'visa_free' ? 'border-green-300' :
          ruleType === 'evisa' || ruleType === 'eta' ? 'border-purple-200' :
          ruleType === 'visa_on_arrival' ? 'border-blue-200' : 'border-red-200'
        }`}>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">{ruleCfg.badge}</span>
            <div>
              <h2 className={`text-xl font-bold ${ruleCfg.color}`}>{ruleCfg.label}</h2>
              <p className={`text-sm ${ruleCfg.color} opacity-70`}>
                For 🇳🇬 Nigerian passport holders
                {ngRule?.maxDays ? ` · up to ${ngRule.maxDays} days` : ''}
              </p>
            </div>
          </div>
          {ngRule?.notes && <p className={`text-sm mt-2 ${ruleCfg.color} opacity-60`}>{ngRule.notes}</p>}
          <p className="text-xs mt-3 text-gray-400">
            Requirements may vary by passport. Use the{' '}
            <Link href="/visa" className="text-[#C9A84C] hover:underline">Visa Checker</Link>
            {' '}for your specific passport.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Walz Fee — uses Price for live currency conversion */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            {portal.walzFeeUsd > 0 ? (
              <>
                <Price amount={portal.walzFeeUsd} from="USD" size="md" />
                {portal.walzFeeNgn > 0 && (
                  <div className="text-gray-400 text-xs mt-0.5">₦{(portal.walzFeeNgn / 1000).toFixed(0)}k</div>
                )}
              </>
            ) : (
              <div className="text-[#0B1F3A] font-bold text-lg">Contact us</div>
            )}
            <div className="text-gray-400 text-xs mt-1">Walz Fee</div>
            <div className="text-gray-300 text-[10px] mt-0.5">Change currency ↑</div>
          </div>
          {/* Govt Fee */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-[#0B1F3A] font-bold text-lg">
              {portal.govtFeeAmount > 0 ? `${portal.govtFeeCurrency} ${portal.govtFeeAmount}` : 'Included'}
            </div>
            <div className="text-gray-400 text-xs mt-1">Govt Fee</div>
          </div>
          {/* Processing */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-[#0B1F3A] font-bold text-lg">{portal.processingDaysMin}–{portal.processingDaysMax} days</div>
            <div className="text-gray-400 text-xs mt-1">Processing</div>
          </div>
          {/* Max Stay */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="text-[#0B1F3A] font-bold text-lg">{portal.maxStayDays} days</div>
            <div className="text-gray-400 text-xs">{portal.singleOrMultiple} entry</div>
            <div className="text-gray-400 text-xs mt-1">Max Stay</div>
          </div>
        </div>

        {/* Required Documents */}
        {portal.requiredDocuments.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#C9A84C]" />
              Required Documents
            </h3>
            <div className="space-y-3">
              {portal.requiredDocuments.map((doc, i) => {
                const guide = docGuides.find(g => doc.toLowerCase().includes(g.documentName.toLowerCase().split(' ')[0]))
                return (
                  <div key={i} className="p-3 border border-gray-100 rounded-xl">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#0B1F3A]">{doc}</p>
                        {guide && (
                          <div className="mt-2 space-y-2">
                            {guide.whatItIs && <p className="text-xs text-gray-500">{guide.whatItIs}</p>}
                            {(guide.whatItMustShow as string[]).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-gray-600 mb-1">Must show:</p>
                                <ul className="space-y-1">
                                  {(guide.whatItMustShow as string[]).map((item, j) => (
                                    <li key={j} className="text-xs text-gray-500 flex items-start gap-1">
                                      <span className="text-[#C9A84C] flex-shrink-0">·</span> {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {(guide.commonMistakes as string[]).length > 0 && (
                              <div className="bg-amber-50 rounded-lg p-2">
                                <p className="text-xs font-semibold text-amber-700 mb-1">Common mistakes:</p>
                                {(guide.commonMistakes as string[]).slice(0, 3).map((m, j) => (
                                  <p key={j} className="text-xs text-amber-700">⚠ {m}</p>
                                ))}
                              </div>
                            )}
                            {guide.jadeTip && (
                              <div className="bg-[#0B1F3A] rounded-lg p-2.5 flex gap-2">
                                <span className="text-[#C9A84C] font-bold text-xs flex-shrink-0">J</span>
                                <p className="text-xs text-white/70">{guide.jadeTip}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Jade Tips */}
        {portal.jadeTips && (
          <div className="bg-[#0B1F3A] rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold flex-shrink-0">J</div>
              <div>
                <p className="text-[#C9A84C] font-bold text-sm uppercase tracking-wider mb-2">Jade's Insider Guide</p>
                <p className="text-white/80 leading-relaxed">{portal.jadeTips}</p>
              </div>
            </div>
          </div>
        )}

        {/* Common Refusals */}
        {portal.commonRefusals.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Why Applications Get Rejected
            </h3>
            <div className="space-y-2">
              {portal.commonRefusals.map((r, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-700">{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Insurance upsell — varies by destination ────────────── */}
        {iso2 === 'FR' && (
          /* Schengen — MANDATORY: all Schengen visas require min €30,000 medical cover */
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-800 text-base mb-1">
                  Travel Insurance is Mandatory for a Schengen Visa
                </h3>
                <p className="text-sm text-red-700 mb-3">
                  All Schengen visa applicants must show proof of travel insurance covering a minimum of
                  <strong> €30,000 in medical expenses</strong>, valid for the entire Schengen area and
                  duration of stay. Without it, your application will be refused.
                </p>
                <div className="bg-white rounded-xl border border-red-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-[#C9A84C] shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[#0B1F3A]">Walz Travel Shield — Schengen Compliant</p>
                      <p className="text-xs text-gray-500">Covers the full €30,000+ requirement · from USD $45 · instant policy document</p>
                    </div>
                    <Link
                      href="/insurance?dest=FR"
                      className="flex-shrink-0 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors"
                    >
                      Get Cover
                    </Link>
                  </div>
                </div>
                <p className="text-xs text-red-600">
                  Your policy document will be emailed instantly after payment — submit it directly with your visa application.
                </p>
              </div>
            </div>
          </div>
        )}

        {iso2 === 'US' && (
          /* USA — STRONG recommendation: US medical costs can exceed $50,000 */
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center shrink-0 mt-0.5">
                <Shield className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#0B1F3A] text-base mb-1">
                  We Strongly Recommend Travel Insurance for the USA
                </h3>
                <p className="text-sm text-gray-700 mb-3">
                  The United States has the highest healthcare costs in the world.
                  A single emergency hospital admission can exceed <strong>$50,000 USD</strong>.
                  There is no reciprocal health agreement — you pay in full, upfront.
                </p>
                <div className="bg-white rounded-xl border border-amber-200 p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-[#C9A84C] shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[#0B1F3A]">Walz Travel Shield — USA</p>
                      <p className="text-xs text-gray-500">Medical cover + cancellation + baggage · from USD $55 · instant policy</p>
                    </div>
                    <Link
                      href="/insurance?dest=US"
                      className="flex-shrink-0 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors"
                    >
                      Get Cover
                    </Link>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Not required for a US visa but considered essential by every experienced traveller.
                </p>
              </div>
            </div>
          </div>
        )}

        {iso2 === 'GB' && (
          /* UK — optional upsell */
          <div className="rounded-2xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center shrink-0 mt-0.5">
                <Shield className="w-5 h-5 text-[#C9A84C]" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#0B1F3A] text-base mb-1">
                  Add Travel Insurance for Your UK Trip
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  While not mandatory for a UK visa, travel insurance protects your trip cost if your application is refused,
                  your flight is cancelled, or you fall ill abroad. Cover starts from USD $35.
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href="/insurance?dest=GB"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#0d2345] transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    Get a Free Quote
                  </Link>
                  <span className="text-xs text-gray-400">From USD $35 · instant policy document</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Apply CTAs */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-bold text-[#0B1F3A] mb-1">Ready to apply?</h3>
          <p className="text-sm text-gray-500 mb-4">Start your {portal.countryName} visa application with Walz Travels. We handle everything end-to-end.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href={`/visa/apply/${params.country}`}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors">
              Apply with Walz Travels →
            </Link>
            <JadeChatButton
              service="Visa"
              detail={`${portal.countryName} Visa`}
              page={`/visa/${params.country}`}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 border-2 border-[#0B1F3A] text-[#0B1F3A] font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors"
            >
              Ask Jade First
            </JadeChatButton>
          </div>
          <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-100">
            <p className="text-sm text-green-800 font-medium">💬 WhatsApp Support Available</p>
            <p className="text-xs text-green-700 mt-0.5">+44 7398 753797 — Mon–Sat 8am–8pm (UK time)</p>
          </div>
        </div>

        {/* Other Visa Destinations */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-bold text-[#0B1F3A] mb-4">Popular Destinations</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { slug: 'uk',       flag: '🇬🇧', name: 'United Kingdom' },
              { slug: 'canada',   flag: '🇨🇦', name: 'Canada'         },
              { slug: 'uae',      flag: '🇦🇪', name: 'UAE'            },
              { slug: 'schengen', flag: '🇪🇺', name: 'Schengen'       },
              { slug: 'usa',      flag: '🇺🇸', name: 'USA'            },
              { slug: 'australia',flag: '🇦🇺', name: 'Australia'      },
            ]
              .filter(d => d.slug !== params.country)
              .map(d => (
                <Link key={d.slug} href={`/visa/${d.slug}`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-[#C9A84C]/40 hover:bg-[#F4F6F9] transition-colors text-sm text-[#0B1F3A] font-medium">
                  <span>{d.flag}</span>
                  <span>{d.name}</span>
                </Link>
              ))}
          </div>
          <Link href="/visa" className="block text-center text-xs text-[#C9A84C] hover:underline mt-4">
            View all destinations →
          </Link>
        </div>

        {/* Cross-sell */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/flights" className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl hover:border-blue-200 transition-colors">
            <Plane className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Flights to {portal.countryName}</p>
              <p className="text-xs text-blue-600">Search best fares →</p>
            </div>
          </Link>
          <Link href="/hotels" className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-100 rounded-xl hover:border-purple-200 transition-colors">
            <Hotel className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-purple-900">Hotels in {portal.countryName}</p>
              <p className="text-xs text-purple-600">Compare & book →</p>
            </div>
          </Link>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center leading-relaxed pb-8">
          Walz Travels provides visa information sourced from official government portals, refreshed regularly.
          Entry decisions are made solely by destination country immigration authorities. Always verify current
          requirements with the official embassy before travel. Walz Travels is not liable for denied entry or
          application rejections.
        </p>
      </div>
    </div>
  )
}
