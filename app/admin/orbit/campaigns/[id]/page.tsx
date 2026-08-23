'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ImagesSection } from './ImagesSection'
import { PublishSection } from './PublishSection'

interface Campaign {
  id: string
  status: string
  objective: string
  destination: string
  audience: string
  country: string
  platforms: string[]
  tone: string
  promotionDetails: string
  cta: string
  landingPage: string
  startDate: string | null
  endDate: string | null
  content: Record<string, unknown>
  tokensUsed: number
  costUsd: string
  generatedAt: string | null
  generatedBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  publishedAt: string | null
  rejectedBy: string | null
  rejectionReason: string | null
  createdBy: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  review: 'bg-yellow-900 text-yellow-300',
  approved: 'bg-blue-900 text-blue-300',
  published: 'bg-green-900 text-green-300',
  rejected: 'bg-red-900 text-red-300',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

function ContentBlock({ label, children, text }: { label: string; children: React.ReactNode; text: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <CopyButton text={text} />
      </div>
      {children}
    </div>
  )
}

function StringField({ value }: { value: unknown }) {
  return <p className="text-sm text-gray-200 whitespace-pre-wrap">{String(value ?? '')}</p>
}

export default function CampaignDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [campaign, setCampaign]       = useState<Campaign | null>(null)
  const [imageCostUsd, setImageCostUsd] = useState<string>('0')
  const [imageCount, setImageCount]   = useState(0)
  const [loading, setLoading]         = useState(true)
  const [generating, setGenerating]   = useState(false)
  const [actioning, setActioning]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [genError, setGenError]       = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${id}`)
      const data = await res.json()
      if (data.campaign) setCampaign(data.campaign)
      if (data.imageCostUsd !== undefined) setImageCostUsd(String(data.imageCostUsd))
      if (data.imageCount  !== undefined) setImageCount(data.imageCount)
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setGenerating(true); setGenError(null)
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${id}/generate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      await load()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  async function action(act: string, extra?: Record<string, string>) {
    setActioning(true); setError(null)
    try {
      const res = await fetch(`/api/admin/orbit/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      if (data.campaign) setCampaign(data.campaign)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setActioning(false)
    }
  }

  if (loading) return <div className="py-24 text-center text-gray-500 text-sm">Loading…</div>
  if (!campaign) return (
    <div className="py-24 text-center">
      <p className="text-gray-400">Campaign not found.</p>
      <Link href="/admin/orbit/campaigns" className="text-indigo-400 underline text-sm mt-2 inline-block">← Campaigns</Link>
    </div>
  )

  const c = campaign.content as Record<string, unknown>
  const hasContent = campaign.generatedAt !== null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/orbit/campaigns" className="text-gray-500 hover:text-white text-sm mt-1">← Campaigns</Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">{campaign.objective}</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[campaign.status] ?? 'bg-gray-700 text-gray-300'}`}>
                {campaign.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {campaign.destination && `${campaign.destination} · `}
              {campaign.platforms.join(', ')}
              {campaign.createdBy && ` · by ${campaign.createdBy}`}
            </p>
            {campaign.tokensUsed > 0 && (
              <p className="text-xs text-gray-600 mt-0.5">
                {campaign.tokensUsed.toLocaleString()} tokens · ${Number(campaign.costUsd).toFixed(4)} text
                {imageCount > 0 && ` · $${Number(imageCostUsd).toFixed(4)} images (${imageCount})`}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          {!hasContent && (
            <button onClick={generate} disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {generating ? 'Generating…' : 'Generate content'}
            </button>
          )}
          {hasContent && campaign.status === 'review' && (
            <>
              <button onClick={() => action('approve')} disabled={actioning}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Approve
              </button>
              <button onClick={() => action('reject')} disabled={actioning}
                className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Reject
              </button>
            </>
          )}
          {campaign.status === 'approved' && (
            <button onClick={() => action('publish')} disabled={actioning}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {actioning ? 'Publishing…' : 'Publish to Buffer →'}
            </button>
          )}
          {hasContent && (campaign.status === 'draft' || campaign.status === 'review') && (
            <button onClick={generate} disabled={generating}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {generating ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}
      {genError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{genError}</div>}

      {campaign.status === 'approved' && campaign.approvedBy && (
        <div className="bg-blue-950 border border-blue-800 text-blue-300 text-sm rounded-lg px-4 py-3">
          Approved by {campaign.approvedBy} · {campaign.approvedAt && new Date(campaign.approvedAt).toLocaleString('en-GB')}
        </div>
      )}
      {campaign.status === 'published' && (
        <div className="bg-green-950 border border-green-800 text-green-300 text-sm rounded-lg px-4 py-3">
          Published · {campaign.publishedAt && new Date(campaign.publishedAt).toLocaleString('en-GB')} · Approved by {campaign.approvedBy}
        </div>
      )}
      {campaign.status === 'rejected' && campaign.rejectionReason && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
          Rejected by {campaign.rejectedBy}: {campaign.rejectionReason}
        </div>
      )}

      {/* Brief summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold text-white mb-3 text-sm">Campaign Brief</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {[
            ['Audience', campaign.audience],
            ['Country', campaign.country],
            ['Tone', campaign.tone],
            ['CTA', campaign.cta],
            ['Landing Page', campaign.landingPage],
            ['Promotion', campaign.promotionDetails],
          ].map(([k, v]) => v && (
            <div key={k}>
              <p className="text-xs text-gray-500 mb-0.5">{k}</p>
              <p className="text-gray-300 text-xs break-words">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Generated content */}
      {!hasContent ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl py-16 text-center space-y-3">
          <p className="text-gray-400 text-sm">No content generated yet.</p>
          <p className="text-gray-600 text-xs">Click "Generate content" to produce all platform variants in one API call.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="font-semibold text-white">Generated Content</h2>

          {/* Strategy */}
          {c.strategy ? (
            <ContentBlock label="Campaign Strategy" text={String(c.strategy)}>
              <StringField value={c.strategy} />
            </ContentBlock>
          ) : null}

          {/* Meta ads */}
          {Array.isArray(c.meta_ads) ? (
            <ContentBlock label="Meta Ad Variants" text={(c.meta_ads as Array<Record<string,string>>).map(a => `${a.headline}\n${a.body}\n${a.cta}`).join('\n\n')}>
              <div className="space-y-3">
                {(c.meta_ads as Array<Record<string, string>>).map((ad, i) => (
                  <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500">Variant {i + 1}</p>
                    <p className="text-sm font-semibold text-white">{ad.headline}</p>
                    <p className="text-sm text-gray-300">{ad.body}</p>
                    <span className="inline-block bg-indigo-900 text-indigo-300 text-xs px-2 py-0.5 rounded">{ad.cta}</span>
                  </div>
                ))}
              </div>
            </ContentBlock>
          ) : null}

          {/* Instagram captions */}
          {Array.isArray(c.instagram_captions) ? (
            <ContentBlock label="Instagram Captions" text={(c.instagram_captions as string[]).join('\n\n---\n\n')}>
              <div className="space-y-3">
                {(c.instagram_captions as string[]).map((cap, i) => (
                  <div key={i} className="border border-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Caption {i + 1}</p>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{cap}</p>
                  </div>
                ))}
              </div>
            </ContentBlock>
          ) : null}

          {/* Google Ads */}
          {c.google_ads ? (
            <ContentBlock label="Google Ads" text={JSON.stringify(c.google_ads, null, 2)}>
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Headlines (max 30 chars)</p>
                {((c.google_ads as Record<string,string[]>).headlines ?? []).map((h, i) => (
                  <p key={i} className="text-sm text-gray-200">{i + 1}. {h}</p>
                ))}
                <p className="text-xs text-gray-500 mt-2">Descriptions (max 90 chars)</p>
                {((c.google_ads as Record<string,string[]>).descriptions ?? []).map((d, i) => (
                  <p key={i} className="text-sm text-gray-200">{i + 1}. {d}</p>
                ))}
              </div>
            </ContentBlock>
          ) : null}

          {/* LinkedIn */}
          {c.linkedin_post ? (
            <ContentBlock label="LinkedIn Post" text={String(c.linkedin_post)}>
              <StringField value={c.linkedin_post} />
            </ContentBlock>
          ) : null}

          {/* X post */}
          {c.x_post ? (
            <ContentBlock label="X (Twitter) Post" text={String(c.x_post)}>
              <StringField value={c.x_post} />
            </ContentBlock>
          ) : null}

          {/* Email */}
          {c.email ? (
            <ContentBlock label="Email" text={JSON.stringify(c.email, null, 2)}>
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Subject Lines</p>
                {((c.email as Record<string,unknown>).subject_lines as string[] ?? []).map((s, i) => (
                  <p key={i} className="text-sm text-gray-200">{i + 1}. {s}</p>
                ))}
                <p className="text-xs text-gray-500 mt-3">Email Body</p>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{String((c.email as Record<string,unknown>).body ?? '')}</p>
              </div>
            </ContentBlock>
          ) : null}

          {/* Video script */}
          {c.video_script ? (
            <ContentBlock label="Short-form Video Script" text={String(c.video_script)}>
              <StringField value={c.video_script} />
            </ContentBlock>
          ) : null}

          {/* Hashtags */}
          {Array.isArray(c.hashtags) ? (
            <ContentBlock label="Hashtags" text={(c.hashtags as string[]).join(' ')}>
              <div className="flex flex-wrap gap-1">
                {(c.hashtags as string[]).map((h) => (
                  <span key={h} className="bg-indigo-950 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
                    {h.startsWith('#') ? h : `#${h}`}
                  </span>
                ))}
              </div>
            </ContentBlock>
          ) : null}

          {/* UTM Links */}
          {c.utm_links ? (
            <ContentBlock label="UTM-Tagged Links" text={Object.entries(c.utm_links as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n')}>
              <div className="space-y-1.5">
                {Object.entries(c.utm_links as Record<string, string>).map(([platform, url]) => (
                  <div key={platform} className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 capitalize w-20 flex-shrink-0 mt-0.5">{platform}</span>
                    <p className="text-xs text-indigo-400 break-all font-mono">{url}</p>
                  </div>
                ))}
              </div>
            </ContentBlock>
          ) : null}
        </div>
      )}

      {/* Campaign Images */}
      <ImagesSection campaignId={campaign.id} campaignContext={{
        destination: campaign.destination,
        objective: campaign.objective,
        cta: campaign.cta,
        promotionDetails: campaign.promotionDetails,
      }} />

      {/* Buffer Publishing */}
      {hasContent && (
        <PublishSection
          campaignId={campaign.id}
          platforms={campaign.platforms}
          campaignStatus={campaign.status}
          content={campaign.content}
          onPublished={load}
        />
      )}
    </div>
  )
}
