'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'

export default function WaitingPage() {
  const { token } = useParams<{ token: string }>()
  const [info,      setInfo]      = useState<{ sessionName: string; submitted: number; totalMembers: number; sessionStatus: string } | null>(null)
  const [reminder,  setReminder]  = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  function poll() {
    fetch(`/api/group/${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setInfo(d)
          // Check 48h reminder
          setReminder(false)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 10000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, []) // eslint-disable-line

  const sessionLocked = info?.sessionStatus === 'locked'
  const allSubmitted  = info?.submitted === info?.totalMembers

  return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-6xl mb-6">
          {sessionLocked ? '🎉' : allSubmitted ? '✅' : '⏳'}
        </div>

        <h1 className="text-white text-2xl font-bold mb-2">
          {sessionLocked
            ? 'Voting complete!'
            : allSubmitted
            ? 'All preferences in!'
            : 'Waiting for the group…'}
        </h1>

        {info && (
          <p className="text-white/50 text-sm mb-6">
            <span className="text-[#C9A84C] font-bold">{info.sessionName}</span>
            {' — '}{info.submitted} of {info.totalMembers} have submitted
          </p>
        )}

        {/* Progress dots */}
        {info && (
          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: info.totalMembers }).map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full transition-all ${
                i < info.submitted ? 'bg-[#C9A84C] scale-110' : 'bg-white/20'
              }`} />
            ))}
          </div>
        )}

        {/* Status messages */}
        <div className="bg-white/5 rounded-2xl p-4 text-left space-y-2 mb-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#C9A84C]">✓</span>
            <span className="text-white/70">Your preferences saved privately</span>
          </div>
          <div className={`flex items-center gap-2 text-sm ${allSubmitted ? 'opacity-100' : 'opacity-30'}`}>
            <span className={allSubmitted ? 'text-[#C9A84C]' : 'text-white/30'}>
              {allSubmitted ? '✓' : '○'}
            </span>
            <span className="text-white/70">All members submitted</span>
          </div>
          <div className={`flex items-center gap-2 text-sm ${sessionLocked ? 'opacity-100' : 'opacity-30'}`}>
            <span className={sessionLocked ? 'text-[#C9A84C]' : 'text-white/30'}>
              {sessionLocked ? '✓' : '○'}
            </span>
            <span className="text-white/70">AI synthesising destinations</span>
          </div>
        </div>

        {/* 48h reminder nudge */}
        {reminder && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
            <p className="text-amber-400 text-xs">
              ⏰ It's been 48 hours — some members haven't submitted yet. Consider sending them a reminder.
            </p>
          </div>
        )}

        <p className="text-white/20 text-xs">This page refreshes automatically every 10 seconds</p>
      </div>
    </div>
  )
}
