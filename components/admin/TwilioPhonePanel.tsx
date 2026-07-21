'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, X, Loader2 } from 'lucide-react'
import type { Call, Device } from '@twilio/voice-sdk'

type Status = 'loading' | 'ready' | 'incoming' | 'calling' | 'active' | 'error'

function fmt(secs: number) {
  return `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`
}

export function TwilioPhonePanel() {
  const [open,     setOpen]     = useState(false)
  const [status,   setStatus]   = useState<Status>('loading')
  const [callInfo, setCallInfo] = useState<{ from?: string; to?: string } | null>(null)
  const [muted,    setMuted]    = useState(false)
  const [dialNum,  setDialNum]  = useState('')
  const [elapsed,  setElapsed]  = useState(0)
  const [errMsg,   setErrMsg]   = useState<string | null>(null)

  const deviceRef  = useRef<Device | null>(null)
  const callRef    = useRef<Call | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTimer  = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  const startTimer = () => { setElapsed(0); timerRef.current = setInterval(() => setElapsed(n => n + 1), 1000) }

  const resetCall = useCallback(() => {
    callRef.current = null
    stopTimer()
    setElapsed(0)
    setCallInfo(null)
    setMuted(false)
  }, [])

  const hangUp = useCallback(() => {
    callRef.current?.disconnect()
    resetCall()
    setStatus('ready')
  }, [resetCall])

  const answer = useCallback(() => {
    if (!callRef.current) return
    callRef.current.accept()
    setStatus('active')
    startTimer()
  }, [])

  const decline = useCallback(() => {
    callRef.current?.reject()
    resetCall()
    setStatus('ready')
  }, [resetCall])

  const toggleMute = useCallback(() => {
    if (!callRef.current) return
    const next = !muted
    callRef.current.mute(next)
    setMuted(next)
  }, [muted])

  const dial = useCallback(async () => {
    const device = deviceRef.current
    if (!device || !dialNum.trim()) return
    const to = dialNum.trim()
    setStatus('calling')
    setCallInfo({ to })
    try {
      const call = await device.connect({ params: { To: to } })
      callRef.current = call
      call.on('accept',     () => { setStatus('active'); startTimer() })
      call.on('disconnect', () => { resetCall(); setStatus('ready') })
      call.on('error',      () => hangUp())
    } catch {
      resetCall()
      setStatus('ready')
    }
  }, [dialNum, hangUp, resetCall])

  useEffect(() => {
    async function init() {
      try {
        const { Device: TwilioDevice } = await import('@twilio/voice-sdk')

        const res = await fetch('/api/twilio/token', { method: 'POST' })
        if (!res.ok) throw new Error('Token request failed')
        const { token } = await res.json() as { token: string }

        const device = new TwilioDevice(token, { logLevel: 1 })
        deviceRef.current = device

        device.on('registered', () => setStatus('ready'))
        device.on('error',      (err: Error) => { setErrMsg(err.message); setStatus('error') })

        device.on('incoming', (call: Call) => {
          callRef.current = call
          setCallInfo({ from: call.parameters?.From ?? 'Unknown' })
          setStatus('incoming')
          setOpen(true)
          call.on('cancel',     () => { resetCall(); setStatus('ready') })
          call.on('disconnect', () => { resetCall(); setStatus('ready') })
        })

        device.register()

        // Refresh 5 min before the 1-hour token expires
        refreshRef.current = setTimeout(async () => {
          try {
            const r = await fetch('/api/twilio/token', { method: 'POST' })
            if (r.ok) { const { token: t } = await r.json() as { token: string }; device.updateToken(t) }
          } catch { /* ignore refresh errors */ }
        }, 55 * 60 * 1000)
      } catch (e) {
        setErrMsg((e as Error).message ?? 'Connection failed')
        setStatus('error')
      }
    }

    init()

    const onToggle = () => setOpen(o => !o)
    window.addEventListener('openPhonePanel', onToggle)

    return () => {
      window.removeEventListener('openPhonePanel', onToggle)
      stopTimer()
      if (refreshRef.current) clearTimeout(refreshRef.current)
      deviceRef.current?.destroy()
    }
  }, [resetCall])

  const dotClass = {
    ready:   'bg-emerald-400',
    active:  'bg-amber-400 animate-pulse',
    calling: 'bg-amber-400 animate-pulse',
    incoming:'bg-blue-400 animate-pulse',
    loading: 'bg-white/20',
    error:   'bg-red-400',
  }[status]

  const label = {
    loading: 'Connecting…',
    ready:   'Ready',
    incoming:'Incoming call',
    calling: 'Calling…',
    active:  fmt(elapsed),
    error:   'Error',
  }[status]

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 w-72 bg-[#0d1e35] rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden">

          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
              <span className="text-sm font-medium text-white">{label}</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4">

            {status === 'loading' && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
              </div>
            )}

            {status === 'error' && (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-red-400">{errMsg ?? 'Connection failed'}</p>
                <button onClick={() => window.location.reload()}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors">
                  Reload page
                </button>
              </div>
            )}

            {status === 'ready' && (
              <div className="space-y-3">
                <input
                  type="tel"
                  value={dialNum}
                  onChange={e => setDialNum(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void dial()}
                  placeholder="+234 xxx xxx xxxx"
                  className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-amber-500/50 focus:bg-white/8 transition-colors"
                />
                <button
                  onClick={() => void dial()}
                  disabled={!dialNum.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Phone className="w-4 h-4" strokeWidth={1.5} />
                  Call
                </button>
              </div>
            )}

            {status === 'incoming' && (
              <div className="space-y-4 text-center">
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Incoming</p>
                  <p className="text-base font-semibold text-white truncate">{callInfo?.from ?? 'Unknown caller'}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={decline}
                    className="flex-1 bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                    <PhoneOff className="w-4 h-4" /> Decline
                  </button>
                  <button onClick={answer}
                    className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                    <PhoneIncoming className="w-4 h-4" /> Answer
                  </button>
                </div>
              </div>
            )}

            {(status === 'calling' || status === 'active') && (
              <div className="space-y-4 text-center">
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">
                    {status === 'calling' ? 'Dialling…' : 'In call'}
                  </p>
                  <p className="text-base font-semibold text-white truncate">
                    {callInfo?.from ?? callInfo?.to ?? '—'}
                  </p>
                  {status === 'active' && (
                    <p className="text-xs text-white/30 mt-1 font-mono tabular-nums">{fmt(elapsed)}</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={toggleMute}
                    disabled={status === 'calling'}
                    className={`flex-1 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium disabled:opacity-40 transition-colors ${
                      muted ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button onClick={hangUp}
                    className="flex-1 bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-xl py-3 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                    <PhoneOff className="w-4 h-4" /> Hang up
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Mobile FAB — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Phone"
        className={`md:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all ${
          status === 'incoming' ? 'bg-blue-500 animate-bounce' :
          status === 'active'   ? 'bg-emerald-500' :
          'bg-amber-500'
        }`}
      >
        <Phone className="w-5 h-5 text-black" strokeWidth={1.5} />
      </button>
    </>
  )
}
