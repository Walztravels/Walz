'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneIncoming, ChevronDown, X } from 'lucide-react'

type WidgetState = 'hidden' | 'minimised' | 'open'
type CallState   = 'idle' | 'incoming' | 'connecting' | 'active' | 'ended'

interface CallInfo {
  from?: string
  to?:   string
}

export function AircallWidget() {
  const workspaceRef              = useRef<import('aircall-everywhere').default | null>(null)
  const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null)
  const [widgetState, setWidgetState] = useState<WidgetState>('hidden')
  const [callState,   setCallState]   = useState<CallState>('idle')
  const [callInfo,    setCallInfo]    = useState<CallInfo | null>(null)
  const [isLoaded,    setIsLoaded]    = useState(false)
  const [timer,       setTimer]       = useState(0)

  useEffect(() => {
    let mounted = true

    import('aircall-everywhere').then(({ default: AircallWorkspace }) => {
      if (!mounted) return

      const workspace = new AircallWorkspace({
        domToLoadWorkspace: '#aircall-workspace',
        integrationToLoad:  'zendesk',
        onLogin:  () => { if (mounted) setIsLoaded(true) },
        onLogout: () => { if (mounted) setIsLoaded(false) },
      })

      workspaceRef.current = workspace

      workspace.on('incoming_call', (info) => {
        if (!mounted) return
        setCallInfo({ from: info.from })
        setCallState('incoming')
        setWidgetState('open')
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

  // Expose click-to-call globally
  useEffect(() => {
    const dialNumber = (phone: string) => {
      setWidgetState('open')
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

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

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
              onClick={() => setWidgetState('open')}
              className="w-full py-3 rounded-xl bg-amber-500 text-black font-semibold text-sm"
            >
              Open Phone to Answer
            </button>
          </div>
        </div>
      )}

      {/* Floating FAB — shown when widget is hidden/minimised */}
      {widgetState !== 'open' && (
        <button
          id="aircall-open-btn"
          onClick={() => setWidgetState('open')}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-12 h-12 rounded-full bg-amber-500 shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Open Aircall phone"
        >
          {callState === 'active'
            ? <span className="text-black text-[10px] font-bold">{formatTime(timer)}</span>
            : <Phone className="w-5 h-5 text-black" strokeWidth={1.5} />
          }
        </button>
      )}

      {/* Minimised pill */}
      {widgetState === 'minimised' && (
        <button
          onClick={() => setWidgetState('open')}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 bg-[#0a1628] border border-white/10 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg"
        >
          <Phone className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.5} />
          <span className="text-white text-xs font-medium">
            {callState === 'active' ? formatTime(timer) : 'Phone'}
          </span>
        </button>
      )}

      {/* Aircall workspace panel */}
      <div className={[
        'fixed z-50 transition-all duration-300 ease-out',
        'bottom-16 left-0 right-0',
        'md:bottom-6 md:right-6 md:left-auto md:w-80',
        widgetState === 'open' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none',
      ].join(' ')}>
        <div className="bg-[#0a1628] border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden w-full">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0d1e35]">
            <div className="flex items-center gap-2">
              <Phone
                className={callState === 'active' ? 'w-4 h-4 text-green-400' : 'w-4 h-4 text-amber-400'}
                strokeWidth={1.5}
              />
              <span className="text-white text-sm font-medium">
                {callState === 'active'     ? `On call · ${formatTime(timer)}` :
                 callState === 'connecting' ? 'Connecting…' :
                 callState === 'incoming'   ? 'Incoming call' : 'Aircall Phone'}
              </span>
              {callState === 'active' && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWidgetState('minimised')}
                className="text-white/40 hover:text-white/70 transition-colors p-1.5"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => setWidgetState('hidden')}
                className="text-white/40 hover:text-white/70 transition-colors p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Iframe mount point — Aircall SDK targets this */}
          <div id="aircall-workspace" style={{ height: 480, width: '100%' }} />
        </div>
      </div>
    </>
  )
}
