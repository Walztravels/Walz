import { BUSINESS } from '@/lib/config/business'
import { prisma } from '@/lib/db'

export interface StaffSignatureData {
  staffName:        string
  staffRole:        string        // roleTitle — formal job title
  signatureTagline: string | null // optional override shown under name; falls back to staffRole
  staffEmail:       string        // sendingEmail ?? login email
}

// ── DB-backed settings with in-process cache ─────────────────────────────────

interface SignatureSettingsRow {
  logoUrl:      string
  accentColor:  string
  brandColor:   string
  officeCities: string[]
  footerNote:   string
}

let _cache: SignatureSettingsRow | null = null
let _cacheAt = 0
const TTL = 5 * 60 * 1000 // 5 minutes

export function invalidateSignatureCache() {
  _cache   = null
  _cacheAt = 0
}

export async function getSignatureSettings(): Promise<SignatureSettingsRow> {
  const now = Date.now()
  if (_cache && now - _cacheAt < TTL) return _cache

  const row = await prisma.signatureSettings.upsert({
    where:  { id: 'singleton' },
    create: {
      id:           'singleton',
      logoUrl:      'https://www.walztravels.com/walz-logo.png',
      accentColor:  '#C9A84C',
      brandColor:   '#0B1F3A',
      officeCities: ['London', 'Toronto', 'Dubai', 'Lagos', 'Accra'],
      footerNote:   '',
    },
    update: {},
  })

  _cache   = row
  _cacheAt = now
  return row
}

// ── Signature HTML builder ────────────────────────────────────────────────────

export async function buildEmailSignature(staff: StaffSignatureData): Promise<string> {
  const settings = await getSignatureSettings()
  return buildSignatureHtml(staff, settings)
}

/** Sync version used for the live preview endpoint (settings already fetched). */
export function buildSignatureHtml(
  staff: StaffSignatureData,
  settings: SignatureSettingsRow,
): string {
  const displayRole = staff.signatureTagline?.trim() || staff.staffRole
  const phone    = BUSINESS.contacts.emergencyPhone
  const whatsapp = BUSINESS.contacts.globalWhatsapp

  const officeStr = settings.officeCities
    .map(c => c.toUpperCase())
    .join(' &nbsp;&middot;&nbsp; ')

  return `
<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin-top:28px;border-top:2px solid ${settings.accentColor};padding-top:20px;">
  <tr>
    <td style="padding-right:18px;vertical-align:top;width:64px;">
      <a href="https://walztravels.com" style="display:block;text-decoration:none;">
        <img src="${settings.logoUrl}" width="56" height="56" alt="Walz Travels" style="display:block;border-radius:8px;border:0;width:56px;height:56px;object-fit:cover;" />
      </a>
    </td>
    <td style="vertical-align:top;border-left:3px solid ${settings.accentColor};padding-left:16px;">
      <p style="margin:0 0 2px 0;font-size:16px;font-weight:700;color:${settings.brandColor};line-height:1.3;">${staff.staffName}</p>
      <p style="margin:0 0 12px 0;font-size:13px;color:#666666;line-height:1.3;">${displayRole} &middot; Walz Travels</p>
      <table cellpadding="0" cellspacing="0" border="0" style="font-size:13px;color:#333333;line-height:1.8;">
        <tr><td style="padding:0;white-space:nowrap;"><a href="tel:+${phone.e164}" style="color:${settings.brandColor};text-decoration:none;">&#128222; ${phone.display}</a></td></tr>
        <tr><td style="padding:0;white-space:nowrap;"><a href="https://wa.me/${whatsapp.e164}" style="color:${settings.brandColor};text-decoration:none;">&#128172; ${whatsapp.display}</a></td></tr>
        <tr><td style="padding:0;white-space:nowrap;"><a href="mailto:${staff.staffEmail}" style="color:${settings.brandColor};text-decoration:none;">&#9993; ${staff.staffEmail}</a></td></tr>
        <tr><td style="padding:0;white-space:nowrap;"><a href="https://walztravels.com" style="color:${settings.accentColor};text-decoration:none;">&#127760; walztravels.com</a></td></tr>
      </table>
      <p style="margin:12px 0 0 0;font-size:11px;color:#999999;letter-spacing:0.08em;text-transform:uppercase;">${officeStr}</p>
      ${settings.footerNote ? `<p style="margin:8px 0 0 0;font-size:11px;color:#bbbbbb;font-style:italic;">${settings.footerNote}</p>` : ''}
    </td>
  </tr>
</table>`.trim()
}
