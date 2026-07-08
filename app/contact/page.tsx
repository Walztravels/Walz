'use client'

import { useState } from 'react'

export default function ContactPage() {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit() {
    if (!name || !email || !subject || !message) {
      setError('Please fill in all required fields.')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, subject, message }),
      })
      if (!res.ok) throw new Error('Failed')
      setSent(true)
      setName(''); setEmail(''); setPhone(''); setSubject(''); setMessage('')
    } catch {
      setError('Something went wrong. Please try WhatsApp instead.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#060f1e]">
      {/* Hero */}
      <div className="bg-[#0a1628] pt-32 pb-20 px-5 text-center">
        <p className="text-amber-400 text-xs uppercase tracking-widest mb-3">Contact Us</p>
        <h1 className="text-white text-4xl md:text-5xl font-bold mb-4">Get in Touch</h1>
        <p className="text-white/60 text-lg max-w-lg mx-auto">
          Our team responds within 2 hours. Available 7 days a week.
        </p>
      </div>

      {/* Contact cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto px-5 -mt-8 mb-16">
        <a
          href="https://wa.me/12317902336"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#0B1F3A] rounded-2xl p-7 text-center border border-white/8 hover:border-green-500/40 transition-all"
        >
          <div className="text-3xl mb-3">💬</div>
          <h3 className="text-white font-semibold mb-1">WhatsApp</h3>
          <p className="text-white/50 text-sm mb-3">+12317902336</p>
          <p className="text-green-400 text-xs font-semibold">Available 24/7</p>
        </a>

        <a
          href="mailto:contact@walztravels.com"
          className="bg-[#0B1F3A] rounded-2xl p-7 text-center border border-white/8 hover:border-amber-500/40 transition-all"
        >
          <div className="text-3xl mb-3">✉️</div>
          <h3 className="text-white font-semibold mb-1">Email Us</h3>
          <p className="text-white/50 text-sm mb-3">contact@walztravels.com</p>
          <p className="text-amber-400 text-xs font-semibold">Reply within 2 hours</p>
        </a>

        <a
          href="tel:+19843880110"
          className="bg-[#0B1F3A] rounded-2xl p-7 text-center border border-white/8 hover:border-blue-500/40 transition-all"
        >
          <div className="text-3xl mb-3">📞</div>
          <h3 className="text-white font-semibold mb-1">Phone</h3>
          <p className="text-white/50 text-sm mb-3">+1 984 388 0110</p>
          <p className="text-blue-400 text-xs font-semibold">Mon–Sat 9am–8pm GMT</p>
        </a>
      </div>

      {/* Enquiry form */}
      <div className="max-w-2xl mx-auto px-5 pb-24">
        <div className="bg-[#0B1F3A] rounded-2xl p-8 border border-white/8">
          <h2 className="text-white text-2xl font-bold mb-6">Send an Enquiry</h2>

          <div className="space-y-4">
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Full Name *</label>
              <input
                aria-label="Full name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                placeholder="James Agyemang"
              />
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Email Address *</label>
              <input
                aria-label="Email address"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                placeholder="james@email.com"
              />
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Phone / WhatsApp</label>
              <input
                aria-label="Phone or WhatsApp number"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                placeholder="+44 7700 000000"
              />
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Subject *</label>
              <select
                aria-label="Enquiry subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-[#0a1628] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50"
              >
                <option value="">Select a subject</option>
                <option>Flight Booking</option>
                <option>Hotel Reservation</option>
                <option>Visa Application</option>
                <option>Private Tour</option>
                <option>Group Travel</option>
                <option>General Enquiry</option>
              </select>
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Message *</label>
              <textarea
                aria-label="Your message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50 resize-none"
                placeholder="Tell us how we can help you..."
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={sending}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-4 rounded-xl transition-all active:scale-[0.98]"
            >
              {sending ? 'Sending...' : 'Send Enquiry →'}
            </button>

            {sent && (
              <p className="text-green-400 text-center text-sm">
                ✓ Message sent! We&apos;ll reply within 2 hours.
              </p>
            )}
            {error && (
              <p className="text-red-400 text-center text-sm">{error}</p>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-white/40 text-sm">
            Mon–Fri 9am–8pm · Sat 10am–6pm · Sun 12pm–5pm GMT
          </p>
          <p className="text-white/40 text-sm mt-1">WhatsApp available 24/7</p>
        </div>
      </div>
    </main>
  )
}
