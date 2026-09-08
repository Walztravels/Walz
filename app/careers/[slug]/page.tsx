import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Clock, ArrowRight, ArrowLeft, CalendarDays, Users } from 'lucide-react'
import prisma from '@/lib/db'
import { publicJobWhere, DEFAULT_AI_DISCLOSURE } from '@/lib/recruitment/core'
import { parseBulletBlocks } from '@/lib/recruitment/format'
import { absoluteUrl, socialPreview, truncateDescription } from '@/lib/seo'

export const revalidate = 60

const WORKPLACE_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

async function getJob(slug: string) {
  try {
    // Drafts, paused, closed, archived and past-deadline jobs are NOT public
    return await prisma.jobOpening.findFirst({
      where: { slug, ...publicJobWhere() },
    })
  } catch (err) {
    console.error('[careers slug] DB read failed:', err)
    return null
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const job = await getJob(params.slug)
  if (!job) {
    // Draft/paused/closed/archived/unknown jobs must not surface as vacancies.
    return { title: 'Careers', robots: { index: false, follow: true } }
  }
  const title = `${job.title} — Careers`   // root template appends "| Walz Travels"
  const description = truncateDescription(
    `${job.title} at Walz Travels — ${job.location} · ${job.type}. ${job.description}`,
  )
  const url = absoluteUrl(`/careers/${job.slug}`)
  return {
    title,
    description,
    alternates: { canonical: url },
    ...socialPreview(`${job.title} — Careers at Walz Travels`, description, url),
  }
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body?.trim()) return null
  const blocks = parseBulletBlocks(body)
  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-bold text-[#0B1F3A] mb-3">{title}</h2>
      {blocks.map((block, i) =>
        block.kind === 'ul' ? (
          <ul key={i} className="list-disc pl-5 space-y-1.5 text-[#0B1F3A]/65 text-sm leading-relaxed mb-3">
            {block.items.map((item, j) => <li key={j}>{item}</li>)}
          </ul>
        ) : (
          <p key={i} className="text-[#0B1F3A]/65 text-sm leading-relaxed mb-3">{block.items[0]}</p>
        ),
      )}
    </div>
  )
}

export default async function JobDetailPage({ params }: { params: { slug: string } }) {
  const job = await getJob(params.slug)
  if (!job) notFound()

  const compensation = job.compensationMin || job.compensationMax
    ? `${job.currency} ${job.compensationMin ? Number(job.compensationMin).toLocaleString() : ''}${job.compensationMin && job.compensationMax ? ' – ' : ''}${job.compensationMax ? Number(job.compensationMax).toLocaleString() : ''}${job.compensationType === 'commission' ? ' (commission)' : ''}`
    : job.compensationType === 'commission' ? 'Commission-based' : null

  // Structured job-posting metadata for search engines — schema.org enum
  // values, database values only, and compensation ONLY when real figures
  // are stored (salary is never invented).
  const EMPLOYMENT_TYPE_SCHEMA: Record<string, string> = {
    'Full-time': 'FULL_TIME', 'Part-time': 'PART_TIME', 'Contract': 'CONTRACTOR',
    'Internship': 'INTERN', 'Commission-based': 'OTHER',
  }
  // "Nigeria & Ghana" / "UK, Canada" → applicant location countries for remote roles
  const locationParts = job.location.split(/\s*[&,\/]\s*/).map(s => s.trim()).filter(Boolean)
  const hasRealComp = job.compensationMin != null || job.compensationMax != null
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: (job.publishedAt ?? job.createdAt).toISOString(),
    ...(job.deadline ? { validThrough: job.deadline.toISOString() } : {}),
    employmentType: EMPLOYMENT_TYPE_SCHEMA[job.type] ?? 'OTHER',
    hiringOrganization: { '@type': 'Organization', name: 'Walz Travels', sameAs: 'https://www.walztravels.com' },
    ...(job.workplaceType === 'remote'
      ? {
          jobLocationType: 'TELECOMMUTE',
          applicantLocationRequirements: locationParts.map(name => ({ '@type': 'Country', name })),
        }
      : {
          jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } },
        }),
    ...(hasRealComp
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.currency,
            value: {
              '@type': 'QuantitativeValue',
              ...(job.compensationMin != null ? { minValue: Number(job.compensationMin) } : {}),
              ...(job.compensationMax != null ? { maxValue: Number(job.compensationMax) } : {}),
              unitText: 'YEAR',
            },
          },
        }
      : {}),
    directApply: true,
    url: absoluteUrl(`/careers/${job.slug}`),
  }

  return (
    <div className="min-h-screen bg-[#F5F2EE]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-14 lg:py-20 px-5">
        <div className="max-w-3xl mx-auto">
          <Link href="/careers" className="inline-flex items-center gap-1.5 text-white/40 text-xs hover:text-white/70 mb-6">
            <ArrowLeft className="w-3.5 h-3.5" /> All positions
          </Link>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {job.department && (
              <span className="text-[11px] font-semibold text-white/60 bg-white/10 px-2.5 py-1 rounded-full">{job.department}</span>
            )}
            <span className="text-[11px] font-semibold text-[#C9A84C] bg-[#C9A84C]/15 px-2.5 py-1 rounded-full">{job.type}</span>
          </div>
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">{job.title}</h1>
          <div className="flex items-center gap-4 text-white/50 text-sm flex-wrap">
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{job.location} · {WORKPLACE_LABEL[job.workplaceType] ?? job.workplaceType}</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{job.type}</span>
            {job.positions > 1 && <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{job.positions} positions</span>}
            {job.deadline && (
              <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />
                Apply by {job.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <Section title="About the role" body={job.description} />
        <Section title="What you'll do" body={job.responsibilities} />
        <Section title="What we're looking for" body={job.requirements} />
        <Section title="What we offer" body={job.benefits} />

        {compensation && (
          <div className="mb-8">
            <h2 className="font-display text-xl font-bold text-[#0B1F3A] mb-3">Compensation</h2>
            <p className="text-[#0B1F3A]/65 text-sm">{compensation}</p>
          </div>
        )}

        <Section title="How to apply" body={job.applicationInstructions} />

        {/* Apply CTA */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 mb-8">
          <p className="text-white font-bold text-lg mb-1.5">Ready to apply?</p>
          <p className="text-white/50 text-sm mb-5">Send your CV and a short introduction — we review every application.</p>
          <Link
            href={`/careers/${job.slug}/apply`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors"
          >
            Apply Now <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-white/30 text-xs mt-4">
            Prefer email? Send your CV to{' '}
            <a href={`mailto:careers@walztravels.com?subject=${encodeURIComponent(`Application for ${job.title}`)}`}
              className="text-[#C9A84C]/80 hover:underline">careers@walztravels.com</a>
          </p>
        </div>

        {/* AI-use disclosure */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-6 mb-6">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#C9A84C] mb-2">How we use AI in hiring</p>
          <p className="text-[#0B1F3A]/55 text-xs leading-relaxed">{job.aiDisclosure?.trim() || DEFAULT_AI_DISCLOSURE}</p>
        </div>

        {/* Accessibility / accommodation */}
        <p className="text-[#0B1F3A]/45 text-xs leading-relaxed">
          Walz Travels is an equal-opportunity employer. If you need an accommodation or human assistance at any
          point in the application process, email{' '}
          <a href="mailto:careers@walztravels.com?subject=Accommodation%20request" className="text-[#C9A84C] hover:underline">
            careers@walztravels.com
          </a>{' '}
          and we&apos;ll be glad to help. To share this role, copy this page&apos;s link.
        </p>
      </div>
    </div>
  )
}
