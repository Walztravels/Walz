import { BUSINESS } from '@/lib/config/business'

export interface StaffSignatureData {
  staffName:  string
  staffRole:  string   // roleTitle — free-text job title
  staffEmail: string
}

// Build the offices footer string from BUSINESS config
const OFFICES = BUSINESS.offices
  .filter(o => o.active)
  .map(o => o.city.toUpperCase())
  .join(' &nbsp;&middot;&nbsp; ')

export function buildEmailSignature(staff: StaffSignatureData): string {
  const { staffName, staffRole, staffEmail } = staff
  const phone     = BUSINESS.contacts.emergencyPhone
  const whatsapp  = BUSINESS.contacts.globalWhatsapp

  return `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin-top: 28px; border-top: 2px solid #C9A84C; padding-top: 20px;">
  <tr>
    <!-- Logo mark -->
    <td style="padding-right: 18px; vertical-align: top; width: 64px;">
      <a href="https://walztravels.com" style="display: block; text-decoration: none;">
        <img
          src="https://www.walztravels.com/icon-192x192.png"
          width="56"
          height="56"
          alt="Walz Travels"
          style="display: block; border-radius: 8px; border: 0;"
        />
      </a>
    </td>

    <!-- Details column -->
    <td style="vertical-align: top; border-left: 3px solid #C9A84C; padding-left: 16px;">

      <!-- Name & title -->
      <p style="margin: 0 0 2px 0; font-size: 16px; font-weight: 700; color: #0B1F3A; line-height: 1.3;">${staffName}</p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666; line-height: 1.3;">${staffRole} &middot; Walz Travels</p>

      <!-- Contact lines -->
      <table cellpadding="0" cellspacing="0" border="0" style="font-size: 13px; color: #333333; line-height: 1.8;">
        <tr>
          <td style="padding: 0; white-space: nowrap;">
            <a href="tel:+${phone.e164}" style="color: #0B1F3A; text-decoration: none;">&#128222; ${phone.display}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 0; white-space: nowrap;">
            <a href="https://wa.me/${whatsapp.e164}" style="color: #0B1F3A; text-decoration: none;">&#128172; ${whatsapp.display}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 0; white-space: nowrap;">
            <a href="mailto:${staffEmail}" style="color: #0B1F3A; text-decoration: none;">&#9993; ${staffEmail}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 0; white-space: nowrap;">
            <a href="https://walztravels.com" style="color: #C9A84C; text-decoration: none;">&#127760; walztravels.com</a>
          </td>
        </tr>
      </table>

      <!-- Office cities -->
      <p style="margin: 12px 0 0 0; font-size: 11px; color: #999999; letter-spacing: 0.08em; text-transform: uppercase;">
        ${OFFICES}
      </p>
    </td>
  </tr>
</table>
`.trim()
}
