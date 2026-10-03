'use client'

// app/business/visa-link/[token]/VisaLinkForm.tsx — Walz Business (V1-C
// Phase 2) — client component for the visa-link recipient landing page.
// Fetches GET /api/business/link/[token]/preview on mount and renders:
// loading -> valid | invalid | fetch-failed.
//
// ============================================================================
// SLICE A (unchanged): the preview fetch/state machine below (loading,
// invalid, fetch-failed, and the shape of PreviewState) is exactly as
// accepted in Slice A. It still never calls any write endpoint and still
// ends every non-'valid' branch exactly as before.
// ============================================================================
//
// SLICE B (this change): the 'valid' branch now renders a two-step Visa
// intake FORM -> REVIEW flow, still with ZERO write calls anywhere:
//   - form   : destinationIso2 / visaType / firstName / lastName / email —
//              the EXACT formFields keys lib/business/visa-intake.ts's
//              submitVisaIntake() reads (confirmed directly from that
//              file's current source; no other field exists in that
//              contract — no passport number, DOB, nationality, address,
//              employment, family, travel history, refusal history, or
//              financial details is ever asked for here).
//   - review : shows back exactly what the recipient entered (after the
//              same trim/case normalization submitVisaIntake() itself
//              applies), with an "Edit answers" control that returns to
//              the form WITHOUT losing anything typed, and a "Continue to
//              Documents" control that is permanently disabled — a visual
//              placeholder for a later slice, never a working stub. It
//              performs no fetch, calls no submit/consume function, and
//              creates no fake success state.
//
// VALIDATION SOURCE OF TRUTH: checkLength / FIELD_LIMITS / isValidIso2 are
// imported directly from lib/business/validation.ts — the same shared
// module submitVisaIntake() itself uses — rather than reimplementing any
// numeric cap or regex here. The one addition with no domain counterpart is
// a minimal email-shape check (submitVisaIntake() itself never validates
// email FORMAT, only length when non-empty) — see validate() below for why
// that is presentation-only and does not contradict the domain contract.
//
// REQUIRED-VS-OPTIONAL SEMANTICS (mirrors submitVisaIntake() exactly):
// destinationIso2 is the ONLY field submitVisaIntake() hard-requires (it
// 400s if missing). visaType/firstName/lastName/email are all optional
// there — if omitted, the function falls back to the request's existing
// traveller data (visaType defaults to 'tourist'). This form mirrors that:
// only destinationIso2 is marked/validated as required; the others are
// optional, left blank is valid, and the review step says so explicitly
// rather than implying something was lost.
//
// TRAVELLER-FIELD PREFILL DECISION: firstName is prefilled (once, still
// freely editable) from `travellerFirstName`, a field Slice A's preview
// contract ALREADY exposes — no expansion of that frozen contract was
// needed or made. lastName and email are left as empty, optional,
// recipient-typed inputs: Slice A's preview deliberately does not expose
// either (only travellerFirstName), and expanding that contract to prefill
// them was judged NOT minimally necessary, since submitVisaIntake() already
// gracefully falls back to the traveller's stored lastName/email when the
// recipient leaves them blank. The browser/API data contract is therefore
// UNCHANGED from Slice A: nothing beyond the raw URL token and Slice A's
// existing preview response fields is ever required or used.
//
// PRIVACY / ZERO-WRITE: no organization/traveller/request/service/
// membership/token id ever appears in this component (checked: nothing
// beyond `token`, the raw path param, and the two Slice A preview strings
// is held in any state here). No hidden form inputs. No localStorage /
// sessionStorage / cookie read or write anywhere in this file. No form
// value or the token is ever put in a URL/query string. No console.* call
// anywhere in this file. This component calls fetch() exactly once, for
// the existing GET preview endpoint, and never calls submitVisaIntake(),
// consumeServiceLinkToken(), storeCaseDocument(), or any
// /api/business/link/[token]/submit endpoint (which does not exist).

import { useEffect, useState } from 'react'
import { checkLength, FIELD_LIMITS, isValidIso2 } from '@/lib/business/validation'

type PreviewState =
  | { status: 'loading' }
  | { status: 'valid'; organizationDisplayName: string; travellerFirstName: string; destinationPlaceholder: string }
  | { status: 'invalid' }
  | { status: 'fetch-failed' }

const NAVY = '#0B1F3A'
const GOLD = '#C9A84C'

// The EXACT formFields keys submitVisaIntake() reads — see
// lib/business/visa-intake.ts lines 103 (destinationIso2), 112 (visaType),
// 113 (firstName), 114 (lastName), 115 (email). Nothing else.
interface FormValues {
  destinationIso2: string
  visaType: string
  firstName: string
  lastName: string
  email: string
}

type FormErrors = Partial<Record<keyof FormValues, string>>

type IntakeStep = 'form' | 'review'

// Minimal, presentation-only shape check. submitVisaIntake() itself never
// validates email FORMAT — only trims, lowercases, and length-checks it
// (see lib/business/visa-intake.ts line 115 and its checkLength() call at
// line 125). This regex therefore has no domain counterpart to reuse; it
// is an additive client-side convenience that never conflicts with the
// domain contract (a value this regex accepts can still fail the domain's
// own length check, and the domain places no further constraint this
// could contradict).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY_VALUES: FormValues = { destinationIso2: '', visaType: '', firstName: '', lastName: '', email: '' }

function validate(v: FormValues): FormErrors {
  const errors: FormErrors = {}

  // destinationIso2 — the only field submitVisaIntake() hard-requires.
  // Same normalization (trim + uppercase) and the same strict ISO2 check
  // (lib/business/validation.ts::isValidIso2) — malformed input is
  // rejected with a message, never silently cut down to 2 characters.
  const destinationIso2 = v.destinationIso2.trim().toUpperCase()
  if (!destinationIso2) {
    errors.destinationIso2 = 'Destination country is required'
  } else if (!isValidIso2(destinationIso2)) {
    errors.destinationIso2 = 'Enter a 2-letter country code (e.g. US, GB, NG)'
  }

  // visaType — optional; submitVisaIntake() defaults to 'tourist' when
  // blank. Only length is checked here (FIELD_LIMITS.VISA_TYPE), same as
  // the domain.
  const visaType = v.visaType.trim()
  if (visaType) {
    const check = checkLength(visaType, 'Visa type', FIELD_LIMITS.VISA_TYPE)
    if (!check.ok) errors.visaType = check.error!
  }

  // firstName / lastName — optional; submitVisaIntake() falls back to the
  // traveller's stored name when blank. Only length is checked
  // (FIELD_LIMITS.PERSON_NAME), same as the domain.
  const firstName = v.firstName.trim()
  if (firstName) {
    const check = checkLength(firstName, 'First name', FIELD_LIMITS.PERSON_NAME)
    if (!check.ok) errors.firstName = check.error!
  }

  const lastName = v.lastName.trim()
  if (lastName) {
    const check = checkLength(lastName, 'Last name', FIELD_LIMITS.PERSON_NAME)
    if (!check.ok) errors.lastName = check.error!
  }

  // email — optional; submitVisaIntake() falls back to the traveller's
  // stored email when blank. Length check mirrors the domain
  // (FIELD_LIMITS.EMAIL); the format check is additive (see EMAIL_SHAPE
  // above).
  const email = v.email.trim().toLowerCase()
  if (email) {
    const lengthCheck = checkLength(email, 'Email', FIELD_LIMITS.EMAIL)
    if (!lengthCheck.ok) {
      errors.email = lengthCheck.error!
    } else if (!EMAIL_SHAPE.test(email)) {
      errors.email = 'Enter a valid email address'
    }
  }

  return errors
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 14,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: NAVY,
  marginBottom: 4,
}

const fieldWrapStyle: React.CSSProperties = { marginBottom: 14 }

const errorStyle: React.CSSProperties = { color: '#900', fontSize: 12, marginTop: 4 }
const hintStyle: React.CSSProperties = { color: '#888', fontSize: 12, marginTop: 4 }

export default function VisaLinkForm({ token }: { token: string }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  // Slice B intake state — lives only in this component's React state for
  // the lifetime of the page view. Never persisted anywhere (no
  // localStorage/sessionStorage/cookie), never put in the URL, never
  // logged. Reset is implicit: a reload starts over, by design — this
  // slice creates no draft-save mechanism.
  const [step, setStep] = useState<IntakeStep>('form')
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<FormErrors>({})
  const [attempted, setAttempted] = useState(false)
  const [firstNamePrefilled, setFirstNamePrefilled] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      let res: Response
      try {
        res = await fetch(`/api/business/link/${encodeURIComponent(token)}/preview`, { cache: 'no-store' })
      } catch {
        // Network-level failure (offline, DNS, CORS, etc.) — never
        // attributable to the token itself.
        if (!cancelled) setState({ status: 'fetch-failed' })
        return
      }

      if (cancelled) return

      // A clean HTTP 404 is the API's own collapsed "this token is not
      // live, for any reason" response — the only status this component
      // treats as "invalid". Everything else that is not ok (429
      // rate-limited, 5xx, or any other unexpected status) is a
      // transport/server problem, not a verdict on the token, so it goes
      // to fetch-failed instead of being folded into "invalid".
      if (res.status === 404) {
        setState({ status: 'invalid' })
        return
      }
      if (!res.ok) {
        setState({ status: 'fetch-failed' })
        return
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        setState({ status: 'fetch-failed' })
        return
      }

      if (cancelled) return

      const b = body as {
        ok?: unknown
        organizationDisplayName?: unknown
        travellerFirstName?: unknown
        destinationPlaceholder?: unknown
      }
      if (b && b.ok === true && typeof b.organizationDisplayName === 'string' && typeof b.travellerFirstName === 'string') {
        setState({
          status: 'valid',
          organizationDisplayName: b.organizationDisplayName,
          travellerFirstName: b.travellerFirstName,
          destinationPlaceholder: typeof b.destinationPlaceholder === 'string' ? b.destinationPlaceholder : 'visa application',
        })
      } else {
        // A 200 that doesn't carry the expected success shape is an
        // unexpected-response case, not a token verdict.
        setState({ status: 'fetch-failed' })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  // Prefill firstName exactly once from the already-exposed
  // travellerFirstName preview field — still freely editable afterward.
  // No expansion of Slice A's preview contract: this is the one traveller
  // field that contract already returns.
  useEffect(() => {
    if (state.status === 'valid' && !firstNamePrefilled) {
      setValues(v => ({ ...v, firstName: state.travellerFirstName }))
      setFirstNamePrefilled(true)
    }
  }, [state, firstNamePrefilled])

  function update<K extends keyof FormValues>(key: K, raw: string) {
    const value = key === 'destinationIso2' ? raw.toUpperCase() : raw
    setValues(v => ({ ...v, [key]: value }))
  }

  function handleContinueToReview() {
    setAttempted(true)
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) {
      setStep('review')
    }
  }

  function handleEdit() {
    setStep('form')
  }

  if (state.status === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: '#666' }} role="status" aria-live="polite">
        Checking your link…
      </div>
    )
  }

  if (state.status === 'invalid') {
    return (
      <div
        role="alert"
        style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>This link is no longer available</h1>
        <p style={{ color: '#666', lineHeight: 1.6, margin: 0 }}>
          It may have expired or already been used. Please contact the organization that sent it to you to request a
          new link.
        </p>
      </div>
    )
  }

  if (state.status === 'fetch-failed') {
    return (
      <div
        role="alert"
        style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: '#666', lineHeight: 1.6, marginBottom: 16 }}>
          We couldn&apos;t load this page right now. Please check your connection and try reloading.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: '10px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // state.status === 'valid'
  const showError = (key: keyof FormValues) => (attempted ? errors[key] : undefined)

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div
        style={{
          display: 'inline-block',
          background: NAVY,
          color: GOLD,
          fontSize: 12,
          fontWeight: 700,
          padding: '4px 10px',
          borderRadius: 999,
          marginBottom: 16,
          letterSpacing: 0.4,
        }}
      >
        WALZ BUSINESS
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
        Hi {state.travellerFirstName}, your link is ready
      </h1>
      <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
        <strong>{state.organizationDisplayName}</strong> sent you this link to submit your{' '}
        {state.destinationPlaceholder.toLowerCase()} documents.
      </p>

      {step === 'form' && (
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault()
            handleContinueToReview()
          }}
        >
          <div style={fieldWrapStyle}>
            <label style={labelStyle} htmlFor="destinationIso2">
              Destination country code <span aria-hidden="true">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id="destinationIso2"
              name="destinationIso2"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="e.g. US, GB, NG"
              value={values.destinationIso2}
              onChange={e => update('destinationIso2', e.target.value)}
              style={inputStyle}
              aria-required="true"
              aria-invalid={Boolean(showError('destinationIso2'))}
              aria-describedby={showError('destinationIso2') ? 'destinationIso2-error' : undefined}
            />
            {showError('destinationIso2') && (
              <p id="destinationIso2-error" role="alert" style={errorStyle}>
                {errors.destinationIso2}
              </p>
            )}
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle} htmlFor="visaType">
              Visa type <span style={{ fontWeight: 400, color: '#888' }}>(optional)</span>
            </label>
            <input
              id="visaType"
              name="visaType"
              type="text"
              autoComplete="off"
              placeholder="e.g. tourist, business, student"
              value={values.visaType}
              onChange={e => update('visaType', e.target.value)}
              style={inputStyle}
              aria-invalid={Boolean(showError('visaType'))}
              aria-describedby={showError('visaType') ? 'visaType-error' : 'visaType-hint'}
            />
            {showError('visaType') ? (
              <p id="visaType-error" role="alert" style={errorStyle}>
                {errors.visaType}
              </p>
            ) : (
              <p id="visaType-hint" style={hintStyle}>
                Leave blank to default to &quot;tourist&quot;.
              </p>
            )}
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle} htmlFor="firstName">
              First name <span style={{ fontWeight: 400, color: '#888' }}>(optional)</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={values.firstName}
              onChange={e => update('firstName', e.target.value)}
              style={inputStyle}
              aria-invalid={Boolean(showError('firstName'))}
              aria-describedby={showError('firstName') ? 'firstName-error' : undefined}
            />
            {showError('firstName') && (
              <p id="firstName-error" role="alert" style={errorStyle}>
                {errors.firstName}
              </p>
            )}
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle} htmlFor="lastName">
              Last name <span style={{ fontWeight: 400, color: '#888' }}>(optional)</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={values.lastName}
              onChange={e => update('lastName', e.target.value)}
              style={inputStyle}
              aria-invalid={Boolean(showError('lastName'))}
              aria-describedby={showError('lastName') ? 'lastName-error' : 'lastName-hint'}
            />
            {showError('lastName') ? (
              <p id="lastName-error" role="alert" style={errorStyle}>
                {errors.lastName}
              </p>
            ) : (
              <p id="lastName-hint" style={hintStyle}>
                Leave blank to use what&apos;s already on file.
              </p>
            )}
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle} htmlFor="email">
              Email <span style={{ fontWeight: 400, color: '#888' }}>(optional)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={e => update('email', e.target.value)}
              style={inputStyle}
              aria-invalid={Boolean(showError('email'))}
              aria-describedby={showError('email') ? 'email-error' : 'email-hint'}
            />
            {showError('email') ? (
              <p id="email-error" role="alert" style={errorStyle}>
                {errors.email}
              </p>
            ) : (
              <p id="email-hint" style={hintStyle}>
                Leave blank to use what&apos;s already on file.
              </p>
            )}
          </div>

          <button
            type="submit"
            style={{ padding: '10px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
          >
            Continue to review
          </button>
        </form>
      )}

      {step === 'review' && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Review your answers</h2>
          <dl style={{ margin: 0, marginBottom: 16 }}>
            <ReviewRow label="Destination country code" value={values.destinationIso2.trim().toUpperCase()} />
            <ReviewRow
              label="Visa type"
              value={values.visaType.trim() || 'Not provided — defaults to "tourist"'}
              placeholder={!values.visaType.trim()}
            />
            <ReviewRow
              label="First name"
              value={values.firstName.trim() || "Not provided — will use what's on file"}
              placeholder={!values.firstName.trim()}
            />
            <ReviewRow
              label="Last name"
              value={values.lastName.trim() || "Not provided — will use what's on file"}
              placeholder={!values.lastName.trim()}
            />
            <ReviewRow
              label="Email"
              value={values.email.trim().toLowerCase() || "Not provided — will use what's on file"}
              placeholder={!values.email.trim()}
            />
          </dl>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleEdit}
              style={{ padding: '10px 20px', borderRadius: 8, background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, fontWeight: 700, cursor: 'pointer' }}
            >
              Edit answers
            </button>
            {/* Non-functional placeholder for a later slice (document
                upload). Deliberately disabled — never a working stub, never
                wired to any endpoint, never clickable. */}
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Document upload is not available yet"
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                background: '#e5e5e5',
                color: '#999',
                border: 'none',
                fontWeight: 700,
                cursor: 'not-allowed',
              }}
            >
              Continue to Documents
            </button>
          </div>
          <p style={{ color: '#888', fontSize: 12, marginTop: 10 }}>Document upload isn&apos;t available yet.</p>
        </div>
      )}
    </div>
  )
}

function ReviewRow({ label, value, placeholder }: { label: string; value: string; placeholder?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
      <dt style={{ color: '#666', fontSize: 13 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, fontWeight: 600, color: placeholder ? '#999' : NAVY, textAlign: 'right' }}>{value}</dd>
    </div>
  )
}
