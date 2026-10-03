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
// numeric cap or regex here.
//
// SLICE C ADDENDUM FIX — email format LOW: Slice B originally added an
// EMAIL_SHAPE regex with no domain counterpart (submitVisaIntake() never
// validates email FORMAT, only length when non-empty — see
// lib/business/visa-intake.ts). That made this UI STRICTER than the real
// domain contract it is supposed to mirror: a value the domain would
// happily accept (anything under FIELD_LIMITS.EMAIL) could be rejected
// here for not "looking like" an email. Per an authorized follow-up
// instruction, that extra check has been REMOVED — validate() below now
// checks only length for email, exactly matching submitVisaIntake()'s own
// rule, with no stricter client-side invention. See the updated test in
// __tests__/business-v1c-phase2-slice-b-visa-link-form.test.tsx proving an
// odd-shaped-but-short string now proceeds to review, matching the domain.
//
// SLICE C (this change): adds a client-side-only "Attach documents"
// section to the SAME review step (see the module-level comment further
// below, near the document-validation imports, for the full write-up:
// scope, the MIME/size/count validation source, the magic-byte-signature
// honest disclosure, and why this lives inside the existing review step
// rather than as a new step in the state machine).
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
// /api/business/link/[token]/submit endpoint (which does not exist). This
// remains true after Slice C's document-attachment addition below — see
// that section's own header comment for the write-up of why.
//
// ============================================================================
// SLICE C — SECURE DOCUMENT UPLOAD HARDENING (client-side selection only)
// ============================================================================
//
// JUDGMENT CALL — no real upload call in this slice: the brief's default is
// client-side file selection + client-side validation + an in-memory file
// list, with NO network call to any upload endpoint, mirroring exactly how
// Slice B left "Continue to Documents" non-functional. That default is what
// is implemented below: selecting, listing, and removing files triggers
// zero fetch() calls (the component still calls fetch() exactly once, for
// the Slice A preview GET, across its entire lifecycle — see the Slice C
// test file's "exactly one fetch call total" assertion). No server
// endpoint was created for this slice. See the Slice C report for the
// researched follow-up question of whether a real upload call will even be
// viable later (it bears on Slice D's design, not this one): Vercel
// Serverless Functions on this project enforce a well-known ~4.5MB request
// body ceiling — this exact codebase already works around that same limit
// in several other places (see e.g. app/api/upload/[token]/presign/
// route.ts, app/api/admin/bank-analyser/presign/route.ts,
// app/api/admin/orbit/media/presign/route.ts, all of which mint a
// presigned, direct-to-storage upload URL specifically to bypass it) for
// files far smaller than this surface's own 15MB-per-file ceiling. Holding
// every selected file in browser memory and sending them all in one final
// multipart POST — the naive reading of "client-side until final submit" —
// is therefore NOT viable once a real submission exists: a single file at
// the existing 15MB cap already exceeds that platform ceiling, let alone
// several. This is flagged here as an architecture finding for whichever
// slice builds the real submission endpoint, not something this slice
// needs to resolve, since Slice C never submits anything over the network.
//
// MIME / SIZE VALIDATION SOURCE: lib/business/visa-link-document-validation.ts
// exports SECURE_LINK_ALLOWED_MIME_TYPES / SECURE_LINK_MAX_FILE_BYTES,
// which mirror lib/intelligence/document-store.ts's own exported
// INTEL_ALLOWED_TYPES / INTEL_MAX_BYTES EXACTLY (same 4 MIME types, same
// 15MB) — copied rather than imported directly, because document-store.ts
// pulls in server-only dependencies (a Supabase service-role client
// factory, the Prisma client, Node's `crypto` module) that do not belong
// in, and are not guaranteed to even bundle for, a 'use client' browser
// chunk. See that file's own header for the full reasoning and for the
// dedicated test that asserts the two modules' constants stay identical.
//
// FILE COUNT CAP: SECURE_LINK_MAX_FILES (10) is a NEW, this-surface-only,
// client-side-only guard — the discovery before writing this file found no
// existing cap on file COUNT anywhere in the domain, only a per-file byte
// cap. See lib/business/visa-link-document-validation.ts for the full
// reasoning.
//
// MAGIC-BYTE VERIFICATION — HONEST DISCLOSURE: validateFileSignature() in
// lib/business/visa-link-document-validation.ts DOES inspect real leading
// bytes (the PDF/JPEG/PNG/WEBP magic numbers) and will reject a file whose
// content doesn't match its claimed extension/MIME type — this is genuine
// content-sniffing, not merely trusting File.type. What it is NOT: a
// malware/virus scanner. No such scanner exists anywhere in this codebase
// (VisaCaseDocument.scanStatus defaults to SCAN_UNAVAILABLE precisely
// because none does), and nothing here claims otherwise — a well-formed,
// correctly-signed PDF/JPEG/PNG/WEBP that happens to carry malicious
// content would pass this check, exactly as it would pass every other
// upload surface in this codebase today. package.json was checked fresh
// before writing this file for an existing content-sniffing library
// (file-type, magic-bytes.js, or similar) — none exists, so the signature
// check above is this slice's own small, auditable, from-scratch
// implementation, not a wrapped third-party library.
//
// STATE / PRIVACY: selected files live in `documents` React state only —
// id (a local counter, not derived from file content), filename, size, and
// the File object itself (needed only so its bytes can be read locally for
// the signature check; never read into a persisted form, never
// base64-encoded, never put in localStorage/sessionStorage/IndexedDB — all
// three are structurally incapable of holding a File efficiently anyway,
// but no attempt is made here regardless). No thumbnail/preview is
// rendered — skipped as explicitly optional in the brief, and would need
// URL.createObjectURL() + matching revocation bookkeeping for no required
// benefit at this stage. No console.* call anywhere in this file ever
// includes a filename (the existing "no console.* call anywhere in this
// file" invariant above is actually stronger than the brief's minimum bar
// of "no filenames" — this file calls console.* precisely zero times, by
// design, exactly as before Slice C).
//
// WHY THE DOCUMENT UI LIVES *INSIDE* THE EXISTING 'review' STEP RATHER
// THAN AS A NEW STEP IN THE STATE MACHINE: Slice B's own regression tests
// (frozen, must keep passing) assert that clicking "Continue to review"
// shows "Review your answers" IMMEDIATELY, and that "Continue to
// Documents" stays disabled with no click handler. Inserting a literal new
// step between 'form' and 'review' — the most literal reading of "a
// document-attachment step between the form/review states" — would break
// both of those frozen assertions. Enabling "Continue to Documents" itself
// to transition into a new step would break the other ("stays disabled")
// assertion. The design below satisfies the brief's actual functional
// requirements (file UI exists; MIME/size/count validated; files listed
// and removable; shown in review "alongside the Slice B form answers";
// zero network calls; the final action stays disabled exactly as Slice B
// left it) without touching either frozen behavior: the attachment section
// is additional content rendered inside the existing review step, above
// the untouched "Edit answers" / "Continue to Documents" button row.
// "Continue to Documents" itself — text, disabled attribute, lack of an
// onClick handler — is completely untouched by this slice (aside from the
// one explicitly-authorized trivial fix below: removing its redundant
// aria-disabled, which does not change hasAttribute('disabled')).

import { useEffect, useState } from 'react'
import { checkLength, FIELD_LIMITS, isValidIso2 } from '@/lib/business/validation'
import {
  SECURE_LINK_ALLOWED_MIME_TYPES,
  SECURE_LINK_MAX_FILES,
  SECURE_LINK_MAX_FILE_BYTES,
  SECURE_LINK_SIGNATURE_HEADER_BYTES,
  validateFileSignature,
  validateFileSize,
} from '@/lib/business/visa-link-document-validation'

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
  // stored email when blank. SLICE C ADDENDUM FIX: only the domain's own
  // length check (FIELD_LIMITS.EMAIL) is applied here — no client-only
  // format/shape regex. submitVisaIntake() itself never validates email
  // FORMAT (see lib/business/visa-intake.ts), so this UI must not be
  // stricter than the contract it mirrors.
  const email = v.email.trim().toLowerCase()
  if (email) {
    const lengthCheck = checkLength(email, 'Email', FIELD_LIMITS.EMAIL)
    if (!lengthCheck.ok) errors.email = lengthCheck.error!
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
// SLICE C ADDENDUM FIX (trivial, Slice B LOW): #888 on white is ~3.5:1
// contrast, below WCAG AA's 4.5:1 minimum for this size of text. #666
// (already used elsewhere in this file for body copy) is ~5.7:1 — passes,
// with no other visual change.
const hintStyle: React.CSSProperties = { color: '#666', fontSize: 12, marginTop: 4 }

// Slice C — one locally-held, SELECTED (never "uploaded") file. `id` is a
// local counter for React keys / the remove control only — never derived
// from file content, never sent anywhere.
interface SelectedDocument {
  id: string
  name: string
  size: number
  mimeType: string
}

let nextDocumentId = 0

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Reads only the first SECURE_LINK_SIGNATURE_HEADER_BYTES of a File via
// FileReader (NOT File.prototype.arrayBuffer(), which is not implemented
// by every runtime this component is tested/rendered in) so the magic-byte
// signature check has real bytes to inspect without reading the whole file
// into memory.
function readHeaderBytes(file: File, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsArrayBuffer(file.slice(0, maxBytes))
  })
}

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

  // Slice C — SELECTED (never "uploaded") documents. Metadata only
  // (filename, size, declared MIME) is kept in state; the File object
  // itself is read transiently (just its first few header bytes, for the
  // signature check) and then discarded — nothing here persists a file's
  // bytes anywhere, in this component's state or otherwise. Resets with
  // the rest of this component's state on reload, exactly like `values`.
  const [documents, setDocuments] = useState<SelectedDocument[]>([])
  const [docErrors, setDocErrors] = useState<string[]>([])
  const [docProcessing, setDocProcessing] = useState(false)

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

  // Slice C — validates and queues newly selected files. ZERO network
  // calls: everything here is local FileReader reads + pure function
  // calls against lib/business/visa-link-document-validation.ts. Never
  // calls storeCaseDocument(), fetch(), or anything write-capable.
  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList)

    setDocProcessing(true)
    const newErrors: string[] = []
    const accepted: SelectedDocument[] = []
    let remainingSlots = SECURE_LINK_MAX_FILES - documents.length

    for (const file of incoming) {
      if (remainingSlots <= 0) {
        newErrors.push(`"${file.name}" was not added — you can attach a maximum of ${SECURE_LINK_MAX_FILES} files.`)
        continue
      }

      const sizeCheck = validateFileSize(file.size)
      if (!sizeCheck.ok) {
        newErrors.push(`"${file.name}": ${sizeCheck.error}`)
        continue
      }

      let headerBytes: Uint8Array
      try {
        headerBytes = await readHeaderBytes(file, SECURE_LINK_SIGNATURE_HEADER_BYTES)
      } catch {
        newErrors.push(`"${file.name}" could not be read. Please try again.`)
        continue
      }

      const signatureCheck = validateFileSignature({
        fileName: file.name,
        declaredMimeType: file.type,
        headerBytes,
      })
      if (!signatureCheck.ok) {
        newErrors.push(`"${file.name}": ${signatureCheck.error}`)
        continue
      }

      accepted.push({ id: String(nextDocumentId++), name: file.name, size: file.size, mimeType: file.type })
      remainingSlots--
    }

    if (accepted.length > 0) {
      setDocuments(prev => [...prev, ...accepted])
    }
    setDocErrors(newErrors)
    setDocProcessing(false)
  }

  function handleRemoveDocument(id: string) {
    setDocuments(prev => prev.filter(d => d.id !== id))
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

          {/* Slice C — client-side-only document attachment. Files are
              SELECTED, never uploaded: no fetch/storeCaseDocument() call
              happens anywhere in this section. See the module header for
              the full write-up (MIME/size/count validation source, the
              magic-byte-signature honest disclosure, why this lives here
              rather than as a separate step). */}
          <div style={{ marginBottom: 20, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
              Attach documents <span style={{ fontWeight: 400, color: '#888' }}>(optional for now)</span>
            </h3>
            <p style={hintStyle}>
              Select up to {SECURE_LINK_MAX_FILES} PDF, JPG, PNG or WEBP files (max {SECURE_LINK_MAX_FILE_BYTES / (1024 * 1024)}MB each).
              Selected files are not uploaded yet — document upload isn&apos;t available until a later step.
            </p>

            <input
              id="documents"
              name="documents"
              type="file"
              multiple
              disabled={docProcessing || documents.length >= SECURE_LINK_MAX_FILES}
              accept={[...SECURE_LINK_ALLOWED_MIME_TYPES, '.pdf', '.jpg', '.jpeg', '.png', '.webp'].join(',')}
              onChange={e => {
                const picked = e.target.files
                // Reset immediately so selecting the exact same file again
                // still fires a change event next time (browsers otherwise
                // dedupe an identical FileList value).
                e.target.value = ''
                void handleFilesSelected(picked)
              }}
              aria-describedby="documents-hint"
              style={{ fontSize: 13 }}
            />
            <p id="documents-hint" style={hintStyle}>
              {documents.length} of {SECURE_LINK_MAX_FILES} files selected.
            </p>

            {docErrors.length > 0 && (
              <ul role="alert" style={{ ...errorStyle, margin: '4px 0 0', paddingLeft: 18 }}>
                {docErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}

            {documents.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                {documents.map(doc => (
                  <li
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                      borderBottom: '1px solid #f5f5f5',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.name} <span style={{ color: '#888' }}>({formatFileSize(doc.size)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument(doc.id)}
                      aria-label={`Remove ${doc.name}`}
                      style={{
                        flexShrink: 0,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: '#fff',
                        color: '#900',
                        border: '1px solid #e5b4b4',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleEdit}
              style={{ padding: '10px 20px', borderRadius: 8, background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, fontWeight: 700, cursor: 'pointer' }}
            >
              Edit answers
            </button>
            {/* Non-functional placeholder for a later slice (final
                submission). Deliberately disabled — never a working stub,
                never wired to any endpoint, never clickable. Untouched by
                Slice C except removing the redundant aria-disabled below
                (a SLICE C ADDENDUM FIX, trivial Slice B LOW): the native
                `disabled` attribute alone already conveys this to
                assistive tech and removes the element from the tab order,
                so aria-disabled was redundant. hasAttribute('disabled') is
                unchanged. */}
            <button
              type="button"
              disabled
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
