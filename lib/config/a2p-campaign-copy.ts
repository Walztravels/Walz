// Twilio A2P 10DLC (CUSTOMER_CARE) registration copy — SINGLE SOURCE.
// Paste these into the Twilio campaign registration verbatim. They are
// guarded by __tests__/a2p-entity-consent.test.ts so the registration copy
// and the live website cannot drift apart. No promotional/marketing SMS is
// part of this campaign.

export const A2P_CAMPAIGN_DESCRIPTION =
  'The Walz Travels Inc. is the Canadian legal entity operating under the customer-facing Walz Travels brand. ' +
  'This A2P 10DLC Customer Care campaign is operated by The Walz Travels Inc. and is used to communicate with customers who voluntarily opt in to SMS communications through walztravels.com.\n\n' +
  'Messages include travel enquiry responses, booking confirmations and updates, payment reminders, itinerary notifications, visa-service status notifications, appointment or consultation reminders, and customer-support communications.\n\n' +
  'Walz Travels operates internationally through locally registered entities in Canada and the United Kingdom. This A2P 10DLC campaign specifically relates to The Walz Travels Inc. in Canada.'

export const A2P_MESSAGE_FLOW =
  'Customers opt in to receive customer-care SMS messages from The Walz Travels Inc., operating as Walz Travels, through the Walz Travels website at https://www.walztravels.com/.\n\n' +
  'During an eligible travel enquiry, booking, visa-service request, consultation request or other customer-service interaction, the customer enters their mobile telephone number and is presented with a separate, unchecked SMS consent checkbox.\n\n' +
  'The customer must actively select the checkbox to consent to receiving SMS communications from Walz Travels.\n\n' +
  'SMS consent is optional and is not required to make a purchase or use Walz Travels services.\n\n' +
  'The disclosure informs customers that message frequency varies, message and data rates may apply, and customers may reply STOP to opt out or HELP for assistance.\n\n' +
  'Links to the Walz Travels Privacy Policy and Terms & Conditions are displayed with the consent disclosure.\n\n' +
  'This opt-in is for customer-care/service communications and does not enroll the customer in promotional or marketing SMS messages.'

export const A2P_SAMPLE_MESSAGES = [
  'Walz Travels: Hi {{first_name}}, we received your travel enquiry. A member of our team will contact you shortly with the requested information. Reply STOP to opt out or HELP for help.',
  'Walz Travels: Hi {{first_name}}, your booking {{booking_reference}} has been confirmed. Please review your booking details in your Walz Travels account. Reply STOP to opt out or HELP for help.',
  'Walz Travels: Hi {{first_name}}, there is an update regarding your travel service request {{reference_number}}. Please sign in to your Walz Travels account or contact our support team for details. Reply STOP to opt out or HELP for help.',
  'Walz Travels: Reminder: your scheduled consultation is on {{date}} at {{time}}. Reply STOP to opt out or HELP for help.',
  'Walz Travels: Hi {{first_name}}, your requested travel quotation is ready for review. Please check your Walz Travels account for details. Reply STOP to opt out or HELP for help.',
] as const
