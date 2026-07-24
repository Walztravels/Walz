'use client'

import { useState, useEffect } from 'react'
import { Fingerprint, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'

interface StoredCredential {
  credentialID: string
  deviceName:   string
  createdAt:    string
}

export function BiometricRegistration() {
  const [supportsBio, setSupportsBio]     = useState(false)
  const [registering, setRegistering]     = useState(false)
  const [deviceName, setDeviceName]       = useState('')
  const [credentials, setCredentials]     = useState<StoredCredential[]>([])
  const [status, setStatus]               = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(setSupportsBio)
        .catch(() => setSupportsBio(false))
    }
    fetchCredentials()
  }, [])

  async function fetchCredentials() {
    try {
      const res = await fetch('/api/admin/auth/webauthn/credentials')
      if (res.ok) setCredentials(await res.json())
    } catch { /* ignore */ }
  }

  async function handleRegister() {
    setStatus(null)
    setRegistering(true)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/admin/auth/webauthn/register')
      if (!optRes.ok) {
        const d = await optRes.json()
        setStatus({ ok: false, msg: d.error ?? 'Could not start registration' })
        return
      }
      const opts = await optRes.json()

      const credential = await startRegistration(opts)

      const verRes = await fetch('/api/admin/auth/webauthn/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ credential, deviceName: deviceName || 'My Device' }),
      })
      const verData = await verRes.json()

      if (!verRes.ok) {
        setStatus({ ok: false, msg: verData.error ?? 'Registration failed' })
        return
      }

      setStatus({ ok: true, msg: 'Biometric login registered for this device.' })
      setDeviceName('')
      fetchCredentials()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('NotAllowedError')) {
        setStatus({ ok: false, msg: 'Registration failed. Make sure you approved the prompt.' })
      }
    } finally {
      setRegistering(false)
    }
  }

  async function handleRemove(credentialID: string) {
    const res = await fetch('/api/admin/auth/webauthn/credentials', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ credentialID }),
    })
    if (res.ok) fetchCredentials()
  }

  if (!supportsBio) return null

  return (
    <div className="mt-8 max-w-2xl rounded-xl border border-white/10 bg-white/3 overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-[#C9A84C]" />
        <h3 className="text-white font-semibold text-sm">Biometric Login</h3>
        <span className="ml-auto text-[10px] text-white/30 uppercase tracking-wider">Face ID · Touch ID · Fingerprint</span>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-white/50 text-xs leading-relaxed">
          Register this device so you can sign in with Face ID or your fingerprint — no password needed next time.
        </p>

        {/* Existing credentials */}
        {credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map(c => (
              <div key={c.credentialID} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/8">
                <div>
                  <p className="text-white/80 text-xs font-medium">{c.deviceName}</p>
                  <p className="text-white/30 text-[10px]">Added {new Date(c.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => handleRemove(c.credentialID)}
                  className="text-white/25 hover:text-red-400 transition-colors"
                  title="Remove this device"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Register new */}
        <div className="flex gap-2">
          <input
            type="text"
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            placeholder='Device name (e.g. "Work iPhone")'
            maxLength={50}
            className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none focus:border-[#C9A84C] transition-colors"
          />
          <button
            onClick={handleRegister}
            disabled={registering}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#C9A84C] hover:bg-[#d4b05c] text-[#0B1F3A] font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            <Fingerprint className="w-3.5 h-3.5" />
            {registering ? 'Waiting…' : 'Register Device'}
          </button>
        </div>

        {status && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
            status.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {status.ok ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            {status.msg}
          </div>
        )}
      </div>
    </div>
  )
}
