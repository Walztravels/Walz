/**
 * Device-aware WhatsApp delivery for Jade Connect eSIM orders.
 *
 * Uses the structured Airalo instructions endpoint (GET /v2/sims/{iccid}/instructions)
 * — NOT the HTML blobs from the order response. Sends three messages:
 *   1. Greeting (via template if configured — reaches new contacts)
 *   2. Install steps (iOS tap-to-install or QR-based numbered steps)
 *   3. Network setup + support sign-off
 *
 * QR code images are sent as Twilio media attachments, not bare URLs.
 */

import type { AiraloInstallInstructions, AiraloInstallPlatform } from './airalo'
import { sendWhatsAppViaTwilio, sendWhatsAppBody, twilioConfigured } from './twilio-whatsapp'

export type DeviceOS = 'ios' | 'android' | 'unknown'

function stepsToText(steps: Record<string, string> | undefined): string {
  if (!steps || Object.keys(steps).length === 0) return ''
  return Object.entries(steps)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, t]) => `${n}. ${t}`)
    .join('\n')
}

function getPlatform(
  instructions: AiraloInstallInstructions | null,
  os: DeviceOS,
): AiraloInstallPlatform | null {
  if (!instructions) return null
  const list = os === 'android' ? instructions.android : instructions.ios
  return list?.[0] ?? null
}

export async function sendEsimWhatsApp(opts: {
  toPhone:         string
  customerName:    string
  orderRef:        string
  destination:     string
  instructions:    AiraloInstallInstructions | null
  qrCodeUrl:       string       // from order response sim entry
  appleInstallUrl: string       // from order response sim entry
  os?:             DeviceOS
}): Promise<void> {
  if (!twilioConfigured()) {
    console.warn('[esim-wa] Twilio not configured — skipping WhatsApp delivery')
    return
  }

  const { toPhone, customerName, orderRef, destination, instructions, qrCodeUrl, appleInstallUrl, os = 'unknown' } = opts

  // ── Message 1: greeting + context (template if available) ──────────────────
  // sendWhatsAppViaTwilio uses the approved template when TWILIO_CONTENT_TEMPLATE_SID
  // is set — this reaches clients who haven't messaged us yet.
  const greeting =
    `📶 Your Jade Connect eSIM for *${destination}* is ready!\n\n` +
    `Ref: ${orderRef} — installation guide coming in the next message.`
  await sendWhatsAppViaTwilio(toPhone, customerName, orderRef, greeting).catch(e =>
    console.error('[esim-wa] greeting send failed:', e),
  )

  // ── Message 2: install steps ───────────────────────────────────────────────
  const platform = getPlatform(instructions, os === 'unknown' ? 'ios' : os)
  const qrInstall = platform?.installation_via_qr_code

  // iOS 17.4+: direct tap-to-install is a materially better experience.
  // Fall back to numbered QR steps for older iOS or Android.
  const directInstallUrl = qrInstall?.direct_apple_installation_url || appleInstallUrl
  const useDirectInstall = os !== 'android' && !!directInstallUrl

  let installMsg: string
  let installMediaUrl: string | undefined

  if (useDirectInstall) {
    installMsg =
      `📱 *Install on iPhone — one tap:*\n${directInstallUrl}\n\n` +
      `_Can't tap the link? Reply "QR" and we'll send the scan code._`
  } else {
    // Numbered QR-based steps
    const stepText = stepsToText(qrInstall?.steps)
    if (stepText) {
      installMsg = `📱 *Install your eSIM${os === 'android' ? ' (Android)' : ''}:*\n\n${stepText}`
    } else {
      // Generic fallback — structured steps not available
      installMsg =
        os === 'android'
          ? `📱 *Install your eSIM (Android):*\n\n1. Open Settings → Network & internet\n2. Tap SIMs → Add SIM\n3. Scan the QR code below\n4. Follow on-screen prompts`
          : `📱 *Install your eSIM (iPhone):*\n\n1. Open Settings → Mobile Data\n2. Tap Add eSIM → Use QR Code\n3. Scan the QR code below\n4. Label it "Jade Connect" and tap Done`
    }
    // Send QR image as media attachment so it's scannable from WhatsApp
    if (qrInstall?.qr_code_url || qrCodeUrl) {
      installMediaUrl = qrInstall?.qr_code_url || qrCodeUrl
    }
  }

  await sendWhatsAppBody(toPhone, installMsg, installMediaUrl).catch(e =>
    console.error('[esim-wa] install message send failed:', e),
  )

  // ── Message 3: network setup + support sign-off ────────────────────────────
  const netSteps = stepsToText(platform?.network_setup?.steps)
  const networkMsg = netSteps
    ? `⚙️ *Enable mobile data after installing:*\n\n${netSteps}\n\n` +
      `💬 Need help? Reply here anytime — Jade support is 24/7.`
    : `✅ After installing, go to Settings → Mobile Data and switch to your Jade eSIM as the data line.\n\n` +
      `💬 Questions? Reply here — we're available 24/7.`

  await sendWhatsAppBody(toPhone, networkMsg).catch(e =>
    console.error('[esim-wa] network setup message send failed:', e),
  )
}
