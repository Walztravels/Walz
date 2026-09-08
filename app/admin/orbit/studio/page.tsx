'use client'

/**
 * Creative Studio — standalone creative workspace.
 *
 * Runs the full Creative Studio (generate, upload, poster designer, video,
 * assets) WITHOUT a campaign: API calls use the explicit 'studio' scope and
 * assets persist with campaignId = null — no hidden dummy campaigns.
 * Everything created here saves automatically to the shared Media Library.
 *
 * Query params:
 *   ?project=<id>     reopen a saved design project
 *   ?returnTo=<url>   show a "back to campaign" link (create-from-campaign flow)
 *   ?brief=<text>     prefill the designer brief from a campaign
 */

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CreativeStudioSection } from '../campaigns/[id]/CreativeStudioSection'
import { STUDIO_SCOPE } from '@/lib/orbit/studio-scope'
import { saveDraft, serializeDraft } from '@/lib/orbit/designer-draft'
import type { DesignControls } from '@/lib/orbit/composer/design-controls'

function StudioInner() {
  const params = useSearchParams()
  const projectId = params.get('project')
  const returnTo  = params.get('returnTo')
  const brief     = params.get('brief')
  const [projectReady, setProjectReady] = useState(!projectId)
  const [projectError, setProjectError] = useState<string | null>(null)

  // Reopening a project: seed the local draft from the durable server copy
  // BEFORE mounting the studio, so the section restores it on load.
  useEffect(() => {
    if (!projectId) return
    fetch(`/api/admin/orbit/design-projects/${projectId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.project) { setProjectError(d.error ?? 'Project not found'); setProjectReady(true); return }
        const p = d.project
        const draft = serializeDraft(
          p.templateKey,
          null,
          p.format,
          p.visualMediaId ?? null,
          (p.commercialFields ?? {}) as Record<string, string>,
          (p.controls ?? {}) as DesignControls,
          (p.layerOverrides ?? {}) as Record<string, unknown>,
        )
        saveDraft(STUDIO_SCOPE, draft)
        setProjectReady(true)
      })
      .catch(() => { setProjectError('Could not load the project'); setProjectReady(true) })
  }, [projectId])

  if (!projectReady) {
    return <div className="py-24 text-center text-gray-500 text-sm">Opening project…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Creative Studio</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Create images, posters and videos — no campaign required. Everything you make is saved to the Media Library automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/orbit/library"
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
            Media Library →
          </Link>
          {returnTo && returnTo.startsWith('/admin/') && (
            <Link href={returnTo}
              className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              ← Back to campaign
            </Link>
          )}
        </div>
      </div>

      {projectError && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{projectError}</p>
      )}

      <CreativeStudioSection
        campaignId={STUDIO_SCOPE}
        destination=""
        objective={brief ?? ''}
        promotionDetails={brief ?? ''}
        cta=""
        tone="professional"
        initialProjectId={projectId}
      />
    </div>
  )
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-gray-500 text-sm">Loading Studio…</div>}>
      <StudioInner />
    </Suspense>
  )
}
