import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import prisma from '@/lib/db'
import { publicJobWhere, DEFAULT_AI_DISCLOSURE } from '@/lib/recruitment/core'
import { ApplyForm } from '@/components/careers/ApplyForm'

export const revalidate = 60

export default async function ApplyPage({ params }: { params: { slug: string } }) {
  const job = await prisma.jobOpening.findFirst({
    where: { slug: params.slug, ...publicJobWhere() },
    select: {
      slug: true, title: true, location: true, type: true, aiDisclosure: true,
      screeningQuestions: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, question: true, kind: true, required: true, options: true },
      },
    },
  }).catch(() => null)
  if (!job) notFound()

  return (
    <div className="min-h-screen bg-[#F5F2EE]">
      <div className="bg-[#0B1F3A] py-12 px-5">
        <div className="max-w-2xl mx-auto">
          <Link href={`/careers/${job.slug}`} className="inline-flex items-center gap-1.5 text-white/40 text-xs hover:text-white/70 mb-5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to job
          </Link>
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-2">Apply</p>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-white">{job.title}</h1>
          <p className="text-white/50 text-sm mt-1.5">{job.location} · {job.type}</p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10">
        <ApplyForm
          jobSlug={job.slug!}
          jobTitle={job.title}
          questions={job.screeningQuestions.map(q => ({ ...q, options: (q.options as string[]) ?? [] }))}
          aiDisclosure={job.aiDisclosure?.trim() || DEFAULT_AI_DISCLOSURE}
        />
      </div>
    </div>
  )
}
