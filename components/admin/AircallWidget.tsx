'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneIncoming, X } from 'lucide-react'

type CallState = 'idle' | 'incoming' | 'connecting' | 'active' | 'ended'

interface CallInfo {
  from?: string
  to?:   string
}

export function AircallWidget() {
  const workspaceRef              = useRef<import('aircall-everywhere').default | null>(null)
  const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isOpen,     setIsOpen]   = useState(false)
  const [callState,  setCallState]  = useState<CallState>('idle')
  const [callInfo,   setCallInfo]   = useState<CallInfo | null>(null)
  const [isLoaded,   setIsLoaded]   = useState(false)
  const [timer,      setTimer]      = useState(0)

  // Initialise Aircall SDK
  useEffect(() => {
    let mounted = true

    import('aircall-everywhere').then(({ default: AircallWorkspace }) => {
      if (!mounted) return

      const workspace = new AircallWorkspace({
        domToLoadWorkspace: '#aircall-workspace',
        integrationToLoad:  'generic',
        onLogin:  (settings: Record<string, unknown>) => {
          if (!mounted) return
          const email = (settings?.user as { email?: string } | undefined)?.email
          console.log('[Aircall] Logged in:', email)
          setIsLoaded(true)
        },
        onLogout: () => { if (mounted) setIsLoaded(false) },
      })

      workspaceRef.current = workspace

      workspace.on('incoming_call', (info) => {
        if (!mounted) return
        setCallInfo({ from: info.from })
        setCallState('incoming')
        setIsOpen(true)
      })

      workspace.on('outgoing_call', (info) => {
        if (!mounted) return
        setCallInfo({ to: info.to })
        setCallState('connecting')
      })

      workspace.on('outgoing_answered', () => {
        if (!mounted) return
        setCallState('active')
        setTimer(0)
        timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
      })

      workspace.on('call_ended', () => {
        if (!mounted) return
        if (timerRef.current) clearInterval(timerRef.current)
        setCallState('ended')
        setTimeout(() => {
          if (mounted) { setCallState('idle'); setCallInfo(null); setTimer(0) }
        }, 3_000)
      })
    }).catch(e => console.error('[Aircall] Init failed:', e))

    return () => {
      mounted = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Listen for openAircallWidget event from the desktop header button
  useEffect(() => {
    const handler = () => setIsOpen(true)
    window.addEventListener('openAircallWidget', handler)
    return () => window.removeEventListener('openAircallWidget', handler)
  }, [])

  // Request mic permission when widget opens — required on mobile Chrome / PWA
  // so the Aircall iframe can access the microphone without a secondary prompt
  useEffect(() => {
    if (!isOpen) return
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => console.log('[Aircall] Mic permission denied'))
  }, [isOpen])

  // Expose click-to-call globally for CallButton components
  useEffect(() => {
    const dialNumber = (phone: string) => {
      setIsOpen(true)
      setCallState('connecting')
      setCallInfo({ to: phone })
      setTimeout(() => {
        workspaceRef.current?.send('dial_number', { phone_number: phone }, (success: boolean) => {
          if (!success) { setCallState('idle'); setCallInfo(null) }
        })
      }, 600)
    }
    ;(window as unknown as Record<string, unknown>).walzDialNumber = dialNumber
  }, [isLoaded])

  function fmt(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const headerLabel =
    callState === 'active'     ? `On call · ${fmt(timer)}` :
    callState === 'connecting' ? 'Connecting…' :
    callState === 'incoming'   ? `Incoming · ${callInfo?.from ?? ''}` :
    'Aircall Phone'

  return (
    <>
      {/* Incoming call overlay */}
      {callState === 'incoming' && (
        <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center md:items-end md:justify-end md:p-6">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-6 w-80 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <PhoneIncoming className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
            </div>
            <p className="text-white/60 text-sm mb-1">Incoming Call</p>
            <p className="text-white font-semibold text-xl mb-1">{callInfo?.from ?? 'Unknown'}</p>
            <p className="text-white/40 text-xs mb-6">Walz Travels</p>
            <button
              onClick={() => setIsOpen(true)}
              className="w-full py-3 rounded-xl bg-amber-500 text-black font-semibold text-sm"
            >
              Open Phone to Answer
            </button>
          </div>
        </div>
      )}

      {/* Mobile FAB — shown when widget is closed; desktop uses the header Phone button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-amber-500 shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Open Aircall phone"
        >
          {callState === 'active'
            ? <span className="text-black text-[10px] font-bold">{fmt(timer)}</span>
            : <Phone className="w-5 h-5 text-black" strokeWidth={1.5} />
          }
        </button>
      )}

      {/* Aircall workspace panel */}
      {isOpen && (
        <div
          className="fixed z-50 bottom-16 left-0 right-0 md:bottom-6 md:right-6 md:left-auto md:w-80 bg-[#0a1628] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0d1e35] flex-shrink-0">
            <div className="flex items-center gap-2">
              <Phone
                className={callState === 'active' ? 'w-4 h-4 text-green-400' : 'w-4 h-4 text-amber-400'}
                strokeWidth={1.5}
              />
              <span className="text-white text-sm font-medium">{headerLabel}</span>
              {callState === 'active' && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white/70 p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Aircall iframe — no spinner, no overlay, always visible */}
          <div
            id="aircall-workspace"
            style={{
              height: 'min(540px, calc(100vh - 120px))',
              width: '100%',
              flexShrink: 0,
            }}
          />
        </div>
      )}
    </>
  )
}
