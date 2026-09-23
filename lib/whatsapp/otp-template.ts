/**
 * WhatsApp Broadcast V1.2 P1 FIX — the Meta payload for an OTP AUTHENTICATION
 * template send. Deliberately separate from
 * lib/whatsapp/broadcast/template.ts's buildTemplatePayload(): that one
 * validates a staff-configured MARKETING/UTILITY broadcast template's
 * mapped body parameters; this one sends exactly one thing (a
 * server-generated code) through a fixed, env-configured template whose
 * exact shape (with or without a Copy-Code button) is controlled by
 * OtpTemplateConfig.hasCodeButton — see lib/whatsapp/config.ts's
 * getOtpTemplateConfig() doc comment for why that flag exists and what
 * this codebase could not verify about Meta's current requirements.
 */

import type { OtpTemplateConfig } from './config'

interface MetaTemplateComponent {
  type: 'body' | 'button'
  sub_type?: 'url'
  index?: string
  parameters: Array<{ type: 'text'; text: string }>
}

export interface MetaOtpTemplatePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components: MetaTemplateComponent[]
  }
}

/** Build the Meta send payload for one OTP code. Pure — no I/O. */
export function buildOtpTemplatePayload(input: {
  to: string
  code: string
  config: OtpTemplateConfig
}): MetaOtpTemplatePayload {
  const components: MetaTemplateComponent[] = [
    { type: 'body', parameters: [{ type: 'text', text: input.code }] },
  ]
  if (input.config.hasCodeButton) {
    // The widely-documented shape for a Copy-Code authentication button as
    // of this codebase's last check — see the config module's doc comment:
    // confirm this against the actual approved template before relying on
    // it, and adjust here if Meta's current API disagrees.
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.code }] })
  }
  return {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: {
      name: input.config.templateName,
      language: { code: input.config.templateLanguage },
      components,
    },
  }
}
