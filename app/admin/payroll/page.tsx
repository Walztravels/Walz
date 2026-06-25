'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Plus, Send, CheckCircle, Loader2, X, Mail } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CURRENCIES = ['NGN','GHS','GBP','USD','EUR','CAD','KES','ZAR']

interface StaffMember {
  id: string; name: string; email: string; role: string
  location: string; department: string; currency: string
  baseSalary: number; payDay: number; bankName: string | null
  accountNumber: string | null; isActive: boolean
  payslips: Payslip[]
}

interface Payslip {
  id: string; staffMemberId: string; month: number; year: number
  baseSalary: number; bonus: number; allowance: number
  attendanceDeduction: number; otherDeduction: number; deductionNote: string | null
  grossPay: number; netPay: number; currency: string; status: string
  emailSentAt: string | null; paidAt: string | null; missedCheckIns: number
  adviceSent?: boolean; adviceSentAt?: string | null
  transferId?: string | null; transferStatus?: string | null
  transferReference?: string | null; paidVia?: string | null
  staffMember?: StaffMember
}

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

function StatusBadge({ status, adviceSent }: { status: string; adviceSent?: boolean }) {
  const map: Record<string, string> = {
    PENDING:   'bg-yellow-100 text-yellow-700',
    EMAILED:   'bg-blue-100 text-blue-700',
    PAID:      'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-600',
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
        {status}
      </span>
      {adviceSent && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">
          ✉ Advice Sent
        </span>
      )}
    </span>
  )
}

interface SystemStaff { id: string; name: string; email: string; roleTitle: string; role: string; isActive: boolean }

function AddStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name:'', email:'', role:'', location:'', department:'Operations', currency:'NGN', baseSalary:'', payDay:'28', bankName:'', accountNumber:'' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [staff,          setStaff]          = useState<SystemStaff[]>([])
  const [loadingStaff,   setLoadingStaff]   = useState(false)
  const [showPicker,     setShowPicker]     = useState(false)
  const [selectedStaff,  setSelectedStaff]  = useState<SystemStaff | null>(null)

  useEffect(() => {
    setLoadingStaff(true)
    fetch('/api/admin/staff')
      .then(r => r.json())
      .then(d => { setStaff(d.staff || []); setLoadingStaff(false) })
      .catch(() => setLoadingStaff(false))
  }, [])

  function pickStaff(member: SystemStaff) {
    setSelectedStaff(member)
    setShowPicker(false)
    setForm(p => ({ ...p, name: member.name || '', email: member.email || '', role: member.roleTitle || member.role || '' }))
  }

  function clearStaff() {
    setSelectedStaff(null)
    setForm(p => ({ ...p, name: '', email: '', role: '' }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/payroll/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, baseSalary: Number(form.baseSalary), payDay: Number(form.payDay) }),
      })
      const text = await res.text()
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { msg = JSON.parse(text).error ?? msg } catch {}
        throw new Error(msg)
      }
      // Close modal first so the unmount is clean, then reload the list
      setSaving(false)
      onClose()
      setTimeout(() => onSaved(), 150)
    } catch (e: any) {
      setError(e.message ?? 'Failed to add staff')
      setSaving(false)
    }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-bold text-[#0B1F3A]">Add Staff Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* ── Load from existing staff ── */}
          <div className="pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Load from existing staff</p>
              {!loadingStaff && staff.length > 0 && (
                <button type="button" onClick={() => setShowPicker(v => !v)}
                  className="text-xs text-[#C9A84C] font-semibold hover:text-[#b8943d] transition-colors">
                  {showPicker ? 'Hide ▲' : `Browse ${staff.length} staff ▼`}
                </button>
              )}
              {loadingStaff && <span className="text-xs text-gray-400">Loading…</span>}
            </div>

            {selectedStaff && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] text-sm font-bold flex-shrink-0">
                  {selectedStaff.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{selectedStaff.name}</p>
                  <p className="text-xs text-gray-500 truncate">{selectedStaff.roleTitle} · {selectedStaff.email}</p>
                </div>
                <button type="button" onClick={clearStaff} className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-xs">✕ Clear</button>
              </div>
            )}

            {showPicker && (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                {staff.map(member => (
                  <button key={member.id} type="button" onClick={() => pickStaff(member)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition-colors text-left border-b border-gray-50 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600 text-sm font-bold flex-shrink-0">
                      {member.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{member.name}</p>
                      <p className="text-xs text-gray-400 truncate">{member.roleTitle || member.role} · {member.email}</p>
                    </div>
                    {member.isActive && <span className="text-[10px] text-green-600 font-semibold flex-shrink-0">Active</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Form fields ── */}
          <div className="grid grid-cols-2 gap-3">
            {(['name','email','role','location'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">
                  {k}{k === 'name' ? ' *' : ''}
                </label>
                <input value={form[k]} onChange={f(k)} required={k === 'name'}
                  placeholder={k === 'email' ? 'staff@walztravels.com' : undefined}
                  className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <input value={form.department} onChange={f('department')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Currency</label>
              <select value={form.currency} onChange={f('currency')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pay Day</label>
              <input type="number" min={1} max={28} value={form.payDay} onChange={f('payDay')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Base Salary</label>
            <input type="number" min={0} value={form.baseSalary} onChange={f('baseSalary')} required
              className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
              <input value={form.bankName} onChange={f('bankName')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Account Number</label>
              <input value={form.accountNumber} onChange={f('accountNumber')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Add Staff Member'}
          </button>
        </form>
      </div>
    </div>
  )
}

function GenerateModal({ staff, onClose, onSaved }: { staff: StaffMember; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const [form, setForm] = useState({
    month: now.getMonth() + 1, year: now.getFullYear(),
    bonus: 0, allowance: 0, attendanceDeduction: 0, otherDeduction: 0,
    deductionNote: '', missedCheckIns: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/payroll/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffMemberId: staff.id, ...form }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onSaved(); onClose()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: k === 'deductionNote' ? e.target.value : Number(e.target.value) }))

  const gross = staff.baseSalary + form.bonus + form.allowance
  const net   = gross - form.attendanceDeduction - form.otherDeduction

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-[#0B1F3A]">Generate Payslip</h2>
            <p className="text-gray-400 text-xs mt-0.5">{staff.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month</label>
              <select value={form.month} onChange={f('month')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C] bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Year</label>
              <input type="number" value={form.year} onChange={f('year')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Base Salary</p>
            <p className="text-[#0B1F3A] font-bold">{fmtCurrency(staff.baseSalary, staff.currency)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['bonus','allowance'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1 capitalize">{k}</label>
                <input type="number" min={0} value={form[k]} onChange={f(k)}
                  className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Missed Check-ins</label>
              <input type="number" min={0} value={form.missedCheckIns} onChange={f('missedCheckIns')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Attendance Deduction</label>
              <input type="number" min={0} value={form.attendanceDeduction} onChange={f('attendanceDeduction')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Other Deduction</label>
              <input type="number" min={0} value={form.otherDeduction} onChange={f('otherDeduction')}
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Deduction Note</label>
              <input value={form.deductionNote} onChange={e => setForm(p => ({ ...p, deductionNote: e.target.value }))}
                placeholder="Reason…"
                className="w-full border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#C9A84C]" />
            </div>
          </div>
          <div className="bg-[#0B1F3A] rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40">Gross</p>
              <p className="text-white font-semibold">{fmtCurrency(gross, staff.currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Net Pay</p>
              <p className="text-[#C9A84C] font-extrabold text-xl">{fmtCurrency(net, staff.currency)}</p>
            </div>
          </div>
          {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            {saving ? 'Generating…' : 'Generate Payslip'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function PayrollPage() {
  const now = new Date()
  const [tab,        setTab]       = useState<'staff' | 'payslips'>('staff')
  const [staff,      setStaff]     = useState<StaffMember[]>([])
  const [payslips,   setPayslips]  = useState<Payslip[]>([])
  const [loading,    setLoading]   = useState(true)
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
  const [filterYear,  setFilterYear]  = useState(now.getFullYear())
  const [showAdd,     setShowAdd]     = useState(false)
  const [generateFor, setGenerateFor] = useState<StaffMember | null>(null)
  const [sending,     setSending]     = useState<string | null>(null)
  const [sendingAll,  setSendingAll]  = useState(false)
  const [toast,       setToast]       = useState<string | null>(null)

  // Edit salary state
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [editForm, setEditForm] = useState({
    baseSalary: 0, currency: 'NGN', payDay: 28,
    bankName: '', accountNumber: '',
    allowances: 0, deductions: 0,
    location: '', department: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [adviceSending, setAdviceSending] = useState<string | null>(null)

  // Payroll run states
  const [showPayroll,   setShowPayroll]   = useState(false)
  const [dryRun,        setDryRun]        = useState<any>(null)
  const [payrollResult, setPayrollResult] = useState<any>(null)
  const [processing,    setProcessing]    = useState(false)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/payroll/staff')
      const text = await res.text().catch(() => '')
      if (!res.ok || !text) {
        console.error('[payroll] staff API error', res.status, text?.slice(0, 200))
        return // don't clear existing list on error
      }
      const d = JSON.parse(text)
      setStaff(d.staff ?? [])
    } catch (err: any) {
      console.error('[payroll] loadStaff error', err)
    } finally { setLoading(false) }
  }, [])

  const loadPayslips = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/payroll/payslips?month=${filterMonth}&year=${filterYear}`)
      const d   = await res.json()
      setPayslips(d.payslips ?? [])
    } finally { setLoading(false) }
  }, [filterMonth, filterYear])

  useEffect(() => { if (tab === 'staff') loadStaff(); else loadPayslips() }, [tab, loadStaff, loadPayslips])

  function openEdit(s: StaffMember) {
    setEditingStaff(s)
    setEditForm({
      baseSalary:    s.baseSalary,
      currency:      s.currency,
      payDay:        s.payDay,
      bankName:      s.bankName || '',
      accountNumber: s.accountNumber || '',
      allowances:    s.payslips[0]?.allowance      ?? 0,
      deductions:    s.payslips[0]?.otherDeduction ?? 0,
      location:      s.location || '',
      department:    s.department || '',
    })
  }

  async function handleSaveSalary() {
    if (!editingStaff) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/admin/payroll/staff/${editingStaff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        setEditingStaff(null)
        loadStaff()
        showToast('Salary updated!')
      } else {
        const d = await res.json()
        showToast(`Error: ${d.error}`)
      }
    } finally { setEditSaving(false) }
  }

  async function sendAdvice(staffId: string, name: string) {
    setAdviceSending(staffId)
    try {
      const res = await fetch('/api/admin/payroll/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      })
      const d = await res.json()
      if (res.ok) showToast(`Salary advice sent to ${name}`)
      else showToast(`Error: ${d.error}`)
    } finally { setAdviceSending(null) }
  }

  async function sendPaystub(payslipId: string) {
    setSending(payslipId)
    try {
      const res = await fetch('/api/admin/payroll/send-paystub', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payslipId }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      showToast('Paystub sent!'); loadPayslips()
    } catch (e: any) { showToast(`Error: ${e.message}`) } finally { setSending(null) }
  }

  async function sendPayslip(payslipId: string) {
    setSending(payslipId)
    try {
      const res = await fetch('/api/admin/payroll/send-payslip', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payslipId }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      showToast('Payslip sent & marked PAID!'); loadPayslips()
    } catch (e: any) { showToast(`Error: ${e.message}`) } finally { setSending(null) }
  }

  async function markPaid(payslipId: string) {
    await fetch(`/api/admin/payroll/payslips/${payslipId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAID' }),
    })
    showToast('Marked as paid'); loadPayslips()
  }

  async function sendAll() {
    setSendingAll(true)
    try {
      const res = await fetch('/api/admin/payroll/send-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: filterMonth, year: filterYear }),
      })
      const d = await res.json()
      showToast(`Sent ${d.sent}, failed ${d.failed}`); loadPayslips()
    } finally { setSendingAll(false) }
  }

  async function handlePreview() {
    setProcessing(true)
    try {
      const res  = await fetch('/api/admin/payroll/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDryRun(data)
      setPayrollResult(null)
      setShowPayroll(true)
    } catch (e: any) { showToast(`Error: ${e.message}`) } finally { setProcessing(false) }
  }

  async function handleRunPayroll() {
    setProcessing(true)
    try {
      const res  = await fetch('/api/admin/payroll/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      })
      const data = await res.json()
      setPayrollResult(data)
    } catch (e: any) {
      setPayrollResult({ error: e.message })
    } finally { setProcessing(false) }
  }

  const netPreview = editForm.baseSalary + editForm.allowances - editForm.deductions

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#0B1F3A] text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-[#C9A84C]" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="font-bold text-[#0B1F3A] text-2xl">Payroll</h1>
            <p className="text-gray-400 text-sm">Manage staff salaries and payslips</p>
          </div>
        </div>
        {tab === 'staff' && (
          <div className="flex items-center gap-2">
            <button onClick={handlePreview} disabled={processing || !staff.length}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : '💸'}
              {processing ? 'Processing…' : 'Run Payroll'}
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
              <Plus className="w-4 h-4" /> Add Staff
            </button>
          </div>
        )}
        {tab === 'payslips' && (
          <button onClick={sendAll} disabled={sendingAll}
            className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {sendingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send All Pending
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100 pb-0">
        {(['staff', 'payslips'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t}
          </button>
        ))}
        {tab === 'payslips' && (
          <div className="ml-auto flex items-center gap-2 pb-2">
            <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
              className="border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] bg-white">
              {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
            <input type="number" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              className="w-24 border border-gray-200 text-[#0B1F3A] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
          </div>
        )}
      </div>

      {/* Content */}
      <div>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : tab === 'staff' ? (
          <div className="space-y-3">
            {staff.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                No staff members yet. Add your first.
              </div>
            )}
            {staff.map(s => (
              <div
                key={s.id}
                onClick={() => openEdit(s)}
                className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm cursor-pointer hover:border-amber-300 hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0 font-bold text-[#C9A84C]">
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0B1F3A] truncate">{s.name}</span>
                    {!s.isActive && <span className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Inactive</span>}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">{s.role} · {s.department} · {s.location}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-[#C9A84C]">{fmtCurrency(s.baseSalary, s.currency)}</p>
                  <p className="text-gray-400 text-xs">Pay day: {s.payDay}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => sendAdvice(s.id, s.name)}
                    disabled={adviceSending === s.id}
                    className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50">
                    {adviceSending === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Advice
                  </button>
                  <button onClick={() => setGenerateFor(s)}
                    className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[#C9A84C] text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex-shrink-0">
                    <DollarSign className="w-3.5 h-3.5" /> Payslip
                  </button>
                </div>
              </div>
            ))}
            <p className="text-center text-xs text-gray-400 pt-1">Click a card to edit salary details</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payslips.length === 0 && (
              <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                No payslips for {MONTHS[filterMonth-1]} {filterYear}.
              </div>
            )}
            {payslips.map(p => (
              <div key={p.id} className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0 font-bold text-[#C9A84C] text-sm">
                    {(p.staffMember?.name ?? '?')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-[#0B1F3A]">{p.staffMember?.name}</span>
                      <StatusBadge status={p.status} adviceSent={p.adviceSent} />
                    </div>
                    <p className="text-gray-400 text-xs">
                      {MONTHS[p.month-1]} {p.year}
                      {' · '}Base {fmtCurrency(p.baseSalary, p.currency)}
                      {p.allowance > 0 ? ` · +Allow ${fmtCurrency(p.allowance, p.currency)}` : ''}
                      {p.attendanceDeduction > 0 ? ` · −Att ${fmtCurrency(p.attendanceDeduction, p.currency)}` : ''}
                      {p.otherDeduction > 0 ? ` · −${p.deductionNote ?? 'Ded'} ${fmtCurrency(p.otherDeduction, p.currency)}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-extrabold text-[#C9A84C] text-lg">{fmtCurrency(p.netPay, p.currency)}</p>
                    <p className="text-gray-400 text-[10px]">Net Pay</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => sendAdvice(p.staffMemberId, p.staffMember?.name ?? '')}
                    disabled={adviceSending === p.staffMemberId}
                    className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                    {adviceSending === p.staffMemberId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                    Salary Advice
                  </button>
                  {p.status !== 'PAID' && (
                    <button onClick={() => sendPaystub(p.id)} disabled={sending === p.id}
                      className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      {sending === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Email Paystub
                    </button>
                  )}
                  {p.status !== 'PAID' && (
                    <button onClick={() => sendPayslip(p.id)} disabled={sending === p.id}
                      className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      {sending === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                      Send Payslip (Paid)
                    </button>
                  )}
                  {p.status === 'EMAILED' && (
                    <button onClick={() => markPaid(p.id)}
                      className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      <CheckCircle className="w-3 h-3" /> Mark Paid
                    </button>
                  )}
                  {p.paidAt && (
                    <span className="text-[10px] text-gray-400 ml-auto">
                      Paid {new Date(p.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd     && <AddStaffModal onClose={() => setShowAdd(false)} onSaved={loadStaff} />}
      {generateFor && <GenerateModal staff={generateFor} onClose={() => setGenerateFor(null)}
        onSaved={() => { loadStaff(); setTab('payslips'); loadPayslips() }} />}

      {/* Edit Salary Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Edit Staff Salary</h3>
                <p className="text-gray-500 text-sm mt-0.5">{editingStaff.name}</p>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Base Salary + Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Base Salary</label>
                  <input
                    type="number"
                    value={editForm.baseSalary}
                    onChange={e => setEditForm(p => ({ ...p, baseSalary: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Currency</label>
                  <select
                    value={editForm.currency}
                    onChange={e => setEditForm(p => ({ ...p, currency: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-gray-800 focus:outline-none focus:border-amber-400 bg-white">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Allowances + Deductions */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Allowances</label>
                  <input
                    type="number"
                    value={editForm.allowances}
                    onChange={e => setEditForm(p => ({ ...p, allowances: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Deductions</label>
                  <input
                    type="number"
                    value={editForm.deductions}
                    onChange={e => setEditForm(p => ({ ...p, deductions: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Net pay preview */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-700 text-xs font-semibold uppercase tracking-wider mb-1">Net Pay (Preview)</p>
                <p className="text-amber-800 text-2xl font-bold">
                  {editForm.currency} {netPreview.toLocaleString()}
                </p>
              </div>

              {/* Bank Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Bank Name</label>
                  <input
                    type="text"
                    value={editForm.bankName}
                    onChange={e => setEditForm(p => ({ ...p, bankName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                    placeholder="Access Bank"
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Account Number</label>
                  <input
                    type="text"
                    value={editForm.accountNumber}
                    onChange={e => setEditForm(p => ({ ...p, accountNumber: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                    placeholder="0000000000"
                  />
                </div>
              </div>

              {/* Location + Department */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Location</label>
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Department</label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={e => setEditForm(p => ({ ...p, department: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Pay Day */}
              <div>
                <label className="text-gray-600 text-xs font-semibold uppercase tracking-wider block mb-1.5">Pay Day (day of month)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={editForm.payDay}
                  onChange={e => setEditForm(p => ({ ...p, payDay: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                onClick={handleSaveSalary}
                disabled={editSaving}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-3.5 rounded-xl transition">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payroll Run Modal ── */}
      {showPayroll && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B1F3A] rounded-2xl w-full max-w-md p-7 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-xl mb-1">
              {payrollResult ? (payrollResult.error ? '✗ Payroll Error' : '✓ Payroll Complete') : 'Confirm Payroll Run'}
            </h3>
            <p className="text-white/40 text-sm mb-5">
              {payrollResult
                ? (payrollResult.error
                    ? payrollResult.error
                    : `${payrollResult.summary?.successful ?? 0} transferred · ${payrollResult.summary?.failed ?? 0} failed`)
                : 'Review transfers before sending real money'}
            </p>

            {/* Preview */}
            {!payrollResult && dryRun && (
              <>
                <div className="space-y-2 mb-5">
                  {dryRun.transfers?.map((t: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-black text-xs font-bold flex-shrink-0">
                          {t.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{t.name}</p>
                          <p className={`text-xs ${t.bankCodeFound === false ? 'text-red-400' : 'text-white/40'}`}>
                            {t.bank} · {t.account}
                            {t.bankCodeFound === false && ' ⚠️ Unknown bank'}
                          </p>
                        </div>
                      </div>
                      <p className="text-amber-400 font-bold text-sm flex-shrink-0 ml-3">
                        {t.currency} {t.amount?.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="bg-white/5 rounded-xl p-4 mb-5">
                  {Object.entries(dryRun.totals || {}).map(([currency, total]: any) => (
                    <div key={currency} className="flex justify-between text-sm mb-1 last:mb-0">
                      <span className="text-white/50">Total {currency}</span>
                      <span className="text-white font-bold">{currency} {Number(total).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-5">
                  <p className="text-red-400 text-sm">⚠️ This sends real money via Flutterwave. Ensure your FLW balance is sufficient before confirming.</p>
                </div>
              </>
            )}

            {/* Results */}
            {payrollResult && !payrollResult.error && (
              <div className="space-y-2 mb-5">
                {payrollResult.results?.map((r: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    r.status === 'SUCCESS' ? 'bg-green-500/10 border border-green-500/20'
                    : r.status === 'FAILED'  ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-white/5'
                  }`}>
                    <div>
                      <p className="text-white text-sm font-medium">{r.status === 'SUCCESS' ? '✓' : r.status === 'ALREADY_PAID' ? '—' : '✗'} {r.name}</p>
                      {r.error       && <p className="text-red-400 text-xs mt-0.5">{r.error}</p>}
                      {r.message     && <p className="text-white/40 text-xs mt-0.5">{r.message}</p>}
                      {r.transferId  && <p className="text-white/30 text-xs mt-0.5">ID: {r.transferId}</p>}
                    </div>
                    {r.amount && <p className="text-white/60 text-sm font-semibold flex-shrink-0 ml-3">{r.currency} {r.amount?.toLocaleString()}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {!payrollResult ? (
              <div className="flex gap-3">
                <button onClick={handleRunPayroll} disabled={processing}
                  className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-3.5 rounded-xl transition text-sm flex items-center justify-center gap-2">
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {processing ? 'Sending…' : '✓ Confirm & Pay All'}
                </button>
                <button onClick={() => { setShowPayroll(false); setDryRun(null) }} disabled={processing}
                  className="px-5 bg-white/5 hover:bg-white/10 text-white py-3.5 rounded-xl transition text-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => { setShowPayroll(false); setDryRun(null); setPayrollResult(null); loadStaff() }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition text-sm">
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
