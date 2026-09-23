/**
 * WhatsApp Broadcast V1.2 — the disclosure shown on the public WhatsApp
 * marketing preferences page (/whatsapp/preferences).
 *
 * A SEPARATE disclosure from the SMS Customer Care one (Consent Foundation
 * V1, components/consent/SmsCustomerCareConsent.tsx) — different channel,
 * different purpose (marketing, not service messages), different table
 * (WhatsAppConsent, not ConsentRecord). Do not reuse or paraphrase the SMS
 * wording here; the two programmes are independently disclosed and
 * independently opted into.
 *
 * `DISCLOSURE_VERSION` is written into WhatsAppConsent.disclosureVersion on
 * every write this page's API route performs, so an audit can always
 * reproduce exactly what a person agreed to. Bump it whenever the wording
 * below changes in any way that could matter to a later compliance review.
 */

export const DISCLOSURE_VERSION = 'whatsapp-preferences-v1'

export const WHATSAPP_MARKETING_DISCLOSURE =
  'Walz Travels would like to send you WhatsApp messages about offers, ' +
  'promotions and travel deals. This is completely optional and separate ' +
  'from any booking or customer-service messages we may send you. You can ' +
  'stop receiving these messages at any time by replying STOP to any ' +
  'WhatsApp message from us, or by returning to this page.'

export const WHATSAPP_UNSUBSCRIBE_CONFIRMATION =
  'You will no longer receive WhatsApp marketing messages from Walz Travels ' +
  'at this number. You may still receive messages you have separately ' +
  'requested (such as booking updates).'
