'use client'

import { useState } from 'react'

interface Props {
  campaignId: string
  destination: string
  objective: string
  tone: string
  promotionDetails: string
  cta: string
  onVideoAdded: () => void
}

const FORMATS = [
  { ar: '9:16', label: 'Reel / TikTok', sub: '9:16 vertical' },
  { ar: '16:9', label: 'Feed video',    sub: '16:9 landscape' },
  { ar: '1:1',  label: 'Square',        sub: '1:1 post' },
]

const DURATIONS = [
  { value: 5,  label: '5 seconds' },
  { value: 10, label: '10 seconds' },
]

function suggestPrompt(destination: string, objective: string, tone: string, promotionDetails: string): string {
  const dest   = destination || 'an exotic destination'
  const toneAdj = tone?.toLowerCase().replace('&', 'and') ?? 'professional'
  const detail = promotionDetails?.slice(0, 80) || ''
  return `Cinematic travel video showcasing ${dest}. ${detail ? detail + '. ' : ''}Stunning visuals, ${toneAdj} tone. Smooth camera movement, vibrant colours, perfect for social media.`
}

type Phase = 'idle' | 'generating' | 'done' | 'error'

export function VideoGeneratorSection({ campaignId, destination, objective, tone, promotionDetails, cta, onVideoAdded }: Props) {
  const [open, setOpen]           = useState(false)
  const [prompt, setPrompt]       = useState('')
  const [aspectRatio, setAspect]  = useState('9:16')
  const [duration, setDuration]   = useState(5)
  const [phase, setPhase]         = useState<Phase>('idle')
  const [progress, setProgress]   = useState('')
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)

  function openPanel() {
    if (!prompt) setPrompt(suggestPrompt(destination, objective, tone, promotionDetails))
    setOpen(true)
    setPhase('idle')
    setResultUrl(null)
    setErrorMsg(null)
  }

  async function generate() {
    setPhase('generating')
    setProgress('Submitting to FAL.ai…')
    setErrorMsg(null)
    setResultUrl(null)

    try {
      // 1. Submit the job
      const submitRes = await fetch(`/api/admin/orbit/campaigns/${campaignId}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', prompt, aspectRatio, duration }),
      })
      const submitData = await submitRes.json() as { requestId?: string; model?: string; error?: string }
      if (!submitRes.ok || !submitData.requestId) {
        throw new Error(submitData.error ?? 'Failed to start generation')
      }

      const { requestId, model } = submitData
      setProgress('Queued — video is being generated (60–120 s)…')

      // 2. Poll until done
      const startMs  = Date.now()
      const timeoutMs = 5 * 60 * 1000  // 5 min hard cap
      let attempt = 0

      while (Date.now() - startMs < timeoutMs) {
        await new Promise(r => setTimeout(r, attempt < 3 ? 5000 : 8000))
        attempt++

        const elapsed = Math.round((Date.now() - startMs) / 1000)
        setProgress(`Generating… ${elapsed}s elapsed`)

        const sp = new URLSearchParams({ requestId, model: model!, aspectRatio, duration: String(duration), prompt })
        const pollRes  = await fetch(`/api/admin/orbit/campaigns/${campaignId}/generate-video?${sp}`)
        const pollData = await pollRes.json() as {
          status: string; error?: string; mediaId?: string; publicUrl?: string
        }

        if (pollData.status === 'done') {
          setResultUrl(pollData.publicUrl ?? null)
          setPhase('done')
          setProgress('')
          onVideoAdded()
          return
        }

        if (pollData.status === 'failed' || pollData.status === 'error') {
          throw new Error(pollData.error ?? 'Generation failed')
        }

        if (pollData.status === 'processing') setProgress(`Rendering… ${elapsed}s elapsed`)
      }

      throw new Error('Generation timed out after 5 minutes')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      setPhase('error')
      setProgress('')
    }
  }

  function reset() {
    setPhase('idle')
    setResultUrl(null)
    setErrorMsg(null)
    setProgress('')
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white text-sm">Generate Video</h2>
          <p className="text-xs text-gray-500 mt-0.5">AI-generated MP4 for TikTok, Reels, and feed — powered by Kling</p>
        </div>
        {!open ? (
          <button
            onClick={openPanel}
            className="bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + Generate video
          </button>
        ) : (
          <button onClick={() => setOpen(false)} className="text-xs text-gray-600 hover:text-gray-400">✕ Close</button>
        )}
      </div>

      {open && (
        <div className="space-y-4">
          {/* Prompt */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Video prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              disabled={phase === 'generating'}
              placeholder="Describe what the video should show…"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-y disabled:opacity-50"
            />
            <p className="text-xs text-gray-600 mt-1">Be specific: include the destination, mood, style, and any key visuals.</p>
          </div>

          {/* Format + duration row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Format</label>
              <div className="space-y-1.5">
                {FORMATS.map(f => (
                  <button
                    key={f.ar}
                    onClick={() => setAspect(f.ar)}
                    disabled={phase === 'generating'}
                    className={`w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                      aspectRatio === f.ar
                        ? 'bg-purple-900/60 border-purple-600 text-purple-200'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="text-gray-600">{f.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Duration</label>
              <div className="space-y-1.5">
                {DURATIONS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    disabled={phase === 'generating'}
                    className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                      duration === d.value
                        ? 'bg-purple-900/60 border-purple-600 text-purple-200'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">~$0.23–$0.45 per video via FAL.ai</p>
            </div>
          </div>

          {/* Generate button / progress */}
          {phase === 'idle' && (
            <button
              onClick={generate}
              disabled={!prompt.trim()}
              className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              Generate video →
            </button>
          )}

          {phase === 'generating' && (
            <div className="space-y-2">
              <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-gray-400 text-center">{progress}</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-3">
              <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">{errorMsg}</div>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-white transition-colors">Try again</button>
            </div>
          )}

          {phase === 'done' && resultUrl && (
            <div className="space-y-3">
              <div className="bg-green-950 border border-green-800 text-green-300 text-xs rounded-lg px-3 py-2">
                Video generated — it has been added to the media gallery below as a pending item. Approve it to include in publish.
              </div>
              <video
                src={resultUrl}
                controls
                className="w-full max-w-xs mx-auto rounded-lg"
                style={{ aspectRatio: aspectRatio.replace(':', '/') }}
              />
              <button
                onClick={reset}
                className="text-xs text-gray-400 hover:text-white transition-colors block"
              >
                Generate another
              </button>
            </div>
          )}
        </div>
      )}

      {!open && (
        <p className="text-xs text-gray-600">
          Generate a short MP4 from a text prompt. Videos appear in the media gallery and can be approved for TikTok and Reels publishing.
        </p>
      )}
    </div>
  )
}
