type Announcement = {
  id: string
  title: string
  category: string
  summary: string
  detail: string | null
  whatToDo: string | null
  relevantUrl: string | null
  priority: string
}

type TravelItem = {
  headline: string
  summary: string
  relevance?: string
  category: 'FLIGHTS' | 'DESTINATION' | 'INDUSTRY' | 'WEATHER'
}

type VisaItem = {
  destination: string
  status: string
  processingDays: string
  notes: string
  alert: 'GREEN' | 'AMBER' | 'RED'
}

type BriefContent = {
  announcements?: Announcement[]
  travel?: TravelItem[]
  visa?: VisaItem[]
  urgentCount?: number
}

export type BriefEmailOpts = {
  staffName: string
  briefDate: string        // "YYYY-MM-DD"
  motivation: string
  motivationThought: string
  contentJson: BriefContent
  baseUrl: string
}

const CAT_LABEL: Record<string, string> = {
  NEW_FEATURE:    'New Feature',
  SYSTEM_UPDATE:  'System Update',
  POLICY:         'Policy',
  SUPPLIER:       'Supplier',
  IMPORTANT:      'Important',
  TRAINING:       'Training',
}

function formattedDate(briefDate: string) {
  return new Date(briefDate + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const TRAVEL_CAT_ICON: Record<string, string> = {
  FLIGHTS: '✈️', DESTINATION: '🌍', INDUSTRY: '📊', WEATHER: '⛈️',
}
const VISA_ALERT_COLOR: Record<string, string> = {
  GREEN: '#10b981', AMBER: '#f59e0b', RED: '#ef4444',
}
const VISA_ALERT_EMOJI: Record<string, string> = {
  GREEN: '🟢', AMBER: '🟡', RED: '🔴',
}

export function renderBriefHtml(opts: BriefEmailOpts): string {
  const { staffName, briefDate, motivation, motivationThought, contentJson, baseUrl } = opts
  const firstName = staffName.split(' ')[0]
  const date = formattedDate(briefDate)
  const announcements = contentJson.announcements ?? []
  const travel = contentJson.travel ?? []
  const visa   = contentJson.visa   ?? []

  const announcementBlock = (ann: Announcement) => `
    <tr>
      <td style="padding:0 0 20px 0">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="background:#0d2442;border-radius:8px;border-left:3px solid #C9A84C;padding:18px 20px">
              <p style="margin:0 0 4px 0;font-size:10px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1px">${escapeHtml(CAT_LABEL[ann.category] ?? ann.category)}</p>
              <p style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:#ffffff;line-height:1.3">${escapeHtml(ann.title)}</p>
              <p style="margin:0 0 12px 0;font-size:14px;color:#94a3b8;line-height:1.6">${escapeHtml(ann.summary)}</p>
              ${ann.whatToDo ? `
              <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px">What you need to do:</p>
              <p style="margin:0 0 14px 0;font-size:13px;color:#cbd5e1;line-height:1.6">${escapeHtml(ann.whatToDo)}</p>
              ` : ''}
              <a href="${baseUrl}/admin/staff-updates/${ann.id}" style="display:inline-block;padding:8px 18px;background:#C9A84C;color:#0B1F3A;font-size:12px;font-weight:700;text-decoration:none;border-radius:6px">View Update →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Jade Daily Brief — ${date}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a1628;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0a1628">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table width="100%" style="max-width:600px" cellpadding="0" cellspacing="0" role="presentation">

        <!-- Wordmark -->
        <tr>
          <td style="padding:0 0 32px 0;text-align:center">
            <p style="margin:0 0 4px 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">WALZ TRAVELS</p>
            <p style="margin:0;font-size:10px;color:#C9A84C;letter-spacing:2.5px;text-transform:uppercase">Powered by Jade</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:0 0 24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#112240;border-radius:14px;padding:24px 28px">
                  <p style="margin:0 0 4px 0;font-size:11px;color:#C9A84C;font-weight:700;text-transform:uppercase;letter-spacing:1.5px">Jade Daily Brief</p>
                  <p style="margin:0 0 14px 0;font-size:13px;color:#64748b">${date}</p>
                  <p style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#ffffff">Good morning, ${escapeHtml(firstName)} 👋</p>
                  <p style="margin:0;font-size:14px;color:#64748b">Here is what you need to know today.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Motivation -->
        <tr>
          <td style="padding:0 0 24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#112240;border-radius:14px;padding:24px 28px">
                  <p style="margin:0 0 16px 0;font-size:11px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1.5px">✨ Today&rsquo;s Motivation</p>
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="background:#0d2442;border-left:3px solid #C9A84C;padding:16px 18px;border-radius:0 6px 6px 0">
                        <p style="margin:0;font-size:15px;color:#f1f5f9;line-height:1.7;font-style:italic">&ldquo;${escapeHtml(motivation)}&rdquo;</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:18px 0 6px 0;font-size:11px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1px">Jade&rsquo;s Thought</p>
                  <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.65">${escapeHtml(motivationThought)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${announcements.length > 0 ? `
        <!-- Announcements -->
        <tr>
          <td style="padding:0 0 24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#112240;border-radius:14px;padding:24px 28px">
                  <p style="margin:0 0 20px 0;font-size:11px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1.5px">🚀 What&rsquo;s New at Walz</p>
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    ${announcements.map(ann => announcementBlock(ann)).join('')}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ` : ''}

        ${travel.length > 0 ? `
        <!-- Travel Intelligence -->
        <tr>
          <td style="padding:0 0 24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#112240;border-radius:14px;padding:24px 28px">
                  <p style="margin:0 0 20px 0;font-size:11px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1.5px">✈️ Travel Intelligence</p>
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    ${travel.map(item => `
                    <tr>
                      <td style="padding:0 0 18px 0">
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                          <tr>
                            <td style="background:#0d2442;border-radius:8px;padding:16px 18px">
                              <p style="margin:0 0 4px 0;font-size:10px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1px">${escapeHtml(TRAVEL_CAT_ICON[item.category] ?? '📌')} ${escapeHtml(item.category)}</p>
                              <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#ffffff;line-height:1.4">${escapeHtml(item.headline)}</p>
                              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">${escapeHtml(item.summary)}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>`).join('')}
                  </table>
                  <p style="margin:8px 0 0 0;font-size:10px;color:#334155;font-style:italic">AI-generated intelligence — verify time-sensitive information independently.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ` : ''}

        ${visa.length > 0 ? `
        <!-- Visa Intelligence -->
        <tr>
          <td style="padding:0 0 24px 0">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:#112240;border-radius:14px;padding:24px 28px">
                  <p style="margin:0 0 20px 0;font-size:11px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:1.5px">🛂 Visa Intelligence</p>
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    ${visa.map(item => `
                    <tr>
                      <td style="padding:0 0 12px 0;border-bottom:1px solid #1e3a5f">
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                          <tr>
                            <td style="padding:12px 0">
                              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                  <td>
                                    <p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#ffffff">${escapeHtml(VISA_ALERT_EMOJI[item.alert] ?? '⚪')} ${escapeHtml(item.destination)}</p>
                                    <p style="margin:0 0 4px 0;font-size:12px;color:#64748b">${escapeHtml(item.status)} &middot; ~${escapeHtml(item.processingDays)} days</p>
                                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5">${escapeHtml(item.notes)}</p>
                                  </td>
                                  <td style="text-align:right;vertical-align:top;white-space:nowrap;padding-left:12px">
                                    <span style="display:inline-block;font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;background:${VISA_ALERT_COLOR[item.alert] ?? '#334155'}22;color:${VISA_ALERT_COLOR[item.alert] ?? '#94a3b8'}">${escapeHtml(item.alert)}</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>`).join('')}
                  </table>
                  <p style="margin:16px 0 0 0;font-size:10px;color:#334155;font-style:italic">AI-generated estimates — always verify with official government sources before advising clients.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ` : ''}

        <!-- Footer -->
        <tr>
          <td style="padding:28px 0 0 0;text-align:center;border-top:1px solid #1e3a5f">
            <p style="margin:0 0 4px 0;font-size:13px;color:#64748b">Have a productive day.</p>
            <p style="margin:0 0 20px 0;font-size:13px;font-weight:700;color:#94a3b8">Jade &middot; Walz Travels</p>
            <p style="margin:0;font-size:10px;color:#334155;line-height:1.6">
              This is an internal Walz Travels staff communication. Not for forwarding.<br>
              Questions? Contact your supervisor or <a href="mailto:contact@walztravels.com" style="color:#475569;text-decoration:underline">contact@walztravels.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export function renderBriefText(opts: BriefEmailOpts): string {
  const { staffName, briefDate, motivation, motivationThought, contentJson, baseUrl } = opts
  const firstName = staffName.split(' ')[0]
  const date = formattedDate(briefDate)
  const announcements = contentJson.announcements ?? []
  const travel = contentJson.travel ?? []
  const visa   = contentJson.visa   ?? []

  const line = '─'.repeat(42)
  let text = `WALZ TRAVELS · Powered by Jade\n`
  text += `Jade Daily Brief — ${date}\n`
  text += `${line}\n\n`
  text += `Good morning, ${firstName}\n\n`
  text += `${line}\n`
  text += `TODAY'S MOTIVATION\n\n`
  text += `"${motivation}"\n\n`
  text += `Jade's Thought:\n${motivationThought}\n\n`

  if (announcements.length > 0) {
    text += `${line}\n`
    text += `WHAT'S NEW AT WALZ\n\n`
    for (const ann of announcements) {
      text += `[${CAT_LABEL[ann.category] ?? ann.category}] ${ann.title}\n`
      text += `${ann.summary}\n`
      if (ann.whatToDo) {
        text += `\nWhat you need to do:\n${ann.whatToDo}\n`
      }
      text += `View: ${baseUrl}/admin/staff-updates/${ann.id}\n\n`
    }
  }

  if (travel.length > 0) {
    text += `${line}\n`
    text += `TRAVEL INTELLIGENCE\n\n`
    for (const item of travel) {
      text += `[${item.category}] ${item.headline}\n`
      text += `${item.summary}\n\n`
    }
    text += `(AI-generated — verify time-sensitive information independently)\n\n`
  }

  if (visa.length > 0) {
    text += `${line}\n`
    text += `VISA INTELLIGENCE\n\n`
    for (const item of visa) {
      const alertMark = item.alert === 'GREEN' ? '[OK]' : item.alert === 'AMBER' ? '[!]' : '[!!]'
      text += `${alertMark} ${item.destination} — ${item.status} · ~${item.processingDays} days\n`
      text += `${item.notes}\n\n`
    }
    text += `(AI estimates — always verify with official government sources)\n\n`
  }

  text += `${line}\n`
  text += `Have a productive day.\nJade · Walz Travels\n\n`
  text += `This is an internal Walz Travels staff communication. Not for forwarding.\n`
  return text
}

// Condensed WhatsApp-friendly plain text for Phase 5
export function renderBriefWhatsApp(opts: BriefEmailOpts): string {
  const { staffName, briefDate, motivation, motivationThought, contentJson } = opts
  const firstName = staffName.split(' ')[0]
  const date = formattedDate(briefDate)
  const announcements = contentJson.announcements ?? []
  const travel = contentJson.travel ?? []
  const visa   = contentJson.visa   ?? []

  let text = `*WALZ TRAVELS · Jade Daily Brief*\n`
  text += `📅 ${date}\n\n`
  text += `Good morning, ${firstName}! 🌅\n\n`
  text += `✨ *Motivation*\n`
  text += `_"${motivation}"_\n\n`
  text += `${motivationThought}\n`

  if (announcements.length > 0) {
    text += `\n---\n`
    text += `🚀 *Staff Updates (${announcements.length})*\n`
    for (const ann of announcements) {
      text += `📌 *${ann.title}*\n${ann.summary}\n`
    }
  }

  if (travel.length > 0) {
    text += `\n---\n`
    text += `✈️ *Travel Intel*\n`
    for (const item of travel) {
      const icon = TRAVEL_CAT_ICON[item.category] ?? '•'
      text += `${icon} *${item.headline}*\n${item.summary}\n\n`
    }
  }

  if (visa.length > 0) {
    text += `\n---\n`
    text += `🛂 *Visa Intel*\n`
    for (const item of visa) {
      const emoji = VISA_ALERT_EMOJI[item.alert] ?? '⚪'
      text += `${emoji} *${item.destination}* — ~${item.processingDays} days\n${item.notes}\n\n`
    }
  }

  text += `\n---\n_Jade · Walz Travels_`
  return text
}
