# A2P consent — scheduled follow-ups

Context: customer-care SMS consent (Twilio A2P 10DLC, error 30907 release). Items 1-3 are scheduled; 4-5 are lower priority.

## 1. Phone normalisation — NEXT PATCH, HIGH
- Problem: national-format numbers (e.g. Nigerian `0803...`) return `null` from `normalizePhoneE164`, so a ticked box silently records nothing. Walz's core market is international/diaspora.
- Evidence: `lib/identity/normalize.ts` (`normalizePhoneE164`); `lib/consent/purposes.ts` (`decideConsentWrite`, called from `lib/consent/capture.ts`, returns `INVALID_NUMBER` -> `recorded: false`, HTTP 200); `lib/consent/client.ts` posts the raw typed string.
- Fix: pass the form's selected country/dial code (several forms already have one); normalise client-side to E.164 before posting and/or accept an optional `defaultCountry` server-side; show a non-blocking warning when a number cannot be normalised; add tests for NG/GH/UK/CA/AE national formats.

## 2. Anonymous re-grant after revoke — MEDIUM
- Problem: an unauthenticated poster can re-opt-in a revoked number or overwrite the consent proof.
- Evidence: `lib/consent/capture.ts`, `prisma.consentRecord.upsert` `update` branch sets `revokedAt: null` and overwrites status/ipAddress/userAgent/source/evidence/consentedAt.
- Fix: never clear `revokedAt` from the public route (require OTP/verified re-grant, as WhatsApp preferences does); keep first-consent evidence immutable (append-only history).

## 3. Consent recorded at submit time, lost on abandon — LOW
- Problem: `record()` fires in submit/pay handlers, so a ticked box on an abandoned flow records nothing. Acceptable for A2P (consent is optional and tied to a completed enquiry/booking); document it.
- Evidence: `components/consent/useSmsConsent.tsx` `record`, called from each wired form's submit handler.
- Optional fix: record on tick with debounced phone-validity check.

## 4. Shared rate limiter behind NAT — LOW
- `lib/rate-limit.ts` `consentCaptureRateLimit` keys on client IP; users behind one NAT/carrier gateway share a budget and may see 429 (silently swallowed client-side).

## 5. Unwired forms — LOW
- Loyalty register, OneTapModal, signup and portal profile collect phone numbers but do not offer the consent box. Wire `useSmsConsent` if they should feed the A2P programme.
