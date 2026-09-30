# Jade Travel Club 2B — Purchase State Machine Design

This document is a mandatory pre-implementation deliverable. It walks
through the 12 required scenarios and names the exact mechanism — DB
constraint, CAS transition, or guard clause — that resolves each one, in
the actual code that was then built to match it.

## The two independent state fields

`JadeClubPurchase` carries two orthogonal state machines on one row, never
conflated:

```
paymentStatus:     PENDING -> SUCCEEDED | FAILED | CANCELLED
                    SUCCEEDED -> REFUNDED

activationStatus:  NOT_STARTED
                    -> PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING
                    -> ACTIVATED
                    -> FAILED_PERMANENTLY (terminal, after N retries)
```

`paymentStatus` is driven only by the payment provider (webhook events).
`activationStatus` is driven only by our own activation logic
(`activateMembershipTerms` via the new purchase-activation wrapper). A
purchase can be `paymentStatus=SUCCEEDED` and
`activationStatus=PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING` for an
arbitrary length of time — that is not an error state, it is the normal
transient state the reconciliation job scans for.

Every transition of either field is done with a CAS
(`updateMany({ where: { id, <current-state-field>: <expected-value> }, data: {...} })`
+ `.count === 1` check), never a blind `.update()`. This is the exact
pattern already established by `lib/jade-club/entitlements.ts`.

## The 12 scenarios

### 1. Checkout created but abandoned (never completed)
**Row state:** `paymentStatus=PENDING`, `activationStatus=NOT_STARTED`,
forever, unless the customer returns.
**Mechanism:** No special handling is needed — a `PENDING` row with no
webhook delivery is simply inert. It never blocks a retry: the
checkout-creation route's pre-check for "already has an unexpired terms
period" only looks at `JadeClubMembershipTerms`, never at
`JadeClubPurchase.paymentStatus`, so the same user can create a fresh
`JadeClubPurchase` + a fresh Stripe Checkout Session at any time. Old
abandoned `PENDING` rows are harmless, queryable history. (An optional
future cleanup job could mark very old `PENDING` rows `CANCELLED`, but
nothing in 2B depends on that — it is explicitly not required for
correctness.)

### 2. Payment failed
**Mechanism:** Stripe fires `checkout.session.expired` or
`payment_intent.payment_failed` (session-mode Checkout with a card decline
surfaces as the session never reaching `payment_status: 'paid'`; Stripe
also emits `checkout.session.expired` after the session's timeout). The
webhook handler CAS-transitions:
`updateMany({ where: { id: purchaseId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED', failureReason: <safe string> } })`.
`activationStatus` is untouched — it stays `NOT_STARTED` and no activation
is ever attempted for a `FAILED` purchase (the activation code path is only
reachable from the `SUCCEEDED` branch).

### 3. Payment confirmed
**Mechanism:** `checkout.session.completed` with
`session.payment_status === 'paid'`. CAS:
`updateMany({ where: { id: purchaseId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'SUCCEEDED', paidAt: now } })`.
Only on `cas.count === 1` do we proceed to activation — a second delivery
of the same event, or a delivery that lost a race to another worker, sees
`cas.count === 0` and no-ops (see scenario 9/10).

### 4. Activation pending
**Mechanism:** Immediately after the payment CAS succeeds, in the same
webhook invocation, a second CAS moves `activationStatus`:
`updateMany({ where: { id: purchaseId, activationStatus: 'NOT_STARTED' }, data: { activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' } })`.
This is a deliberate, durable, committed intermediate state — not just an
in-memory flag — so that if the process crashes or throws between here and
scenario 5, the row is left in a state the reconciliation job
(`lib/jade-club/purchase-reconciliation.ts`) can find and retry. The
webhook handler always acks Stripe with 200 once the signature is verified
and this write has landed, regardless of what happens next.

### 5. Activation succeeded
**Mechanism:** The tier-bump function (`applyPurchaseTierBump`, new) is
called first to move `JadeClubMembership.tier`/`status` to the purchased
tier/ACTIVE with `source: 'PURCHASE'`, then `activateMembershipTerms` is
called exactly as-is (its own internal `SELECT ... FOR UPDATE` transaction
guard is untouched — see scenario 6/10 below for why that guard is what
makes this safe under concurrency). On success, a final CAS:
`updateMany({ where: { id: purchaseId, activationStatus: 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING' }, data: { activationStatus: 'ACTIVATED', membershipTermsId: terms.termsId, activatedAt: now } })`.

### 6. Activation retry (after a transient failure)
**Mechanism:** If `applyPurchaseTierBump` or `activateMembershipTerms`
throws (DB blip, transient lock timeout, etc.), the webhook handler catches
it, leaves the row at `activationStatus=PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING`
(no partial state is ever written — both calls are individually
transactional, and the final CAS to `ACTIVATED` is only reached after both
succeed), increments `JadeClubPurchase.activationAttempts` (tracked
in-memory by the reconciliation job via a scan + retry count column is not
needed — see below), and returns 200 to Stripe regardless (signature was
already verified; Stripe must not be asked to retry the whole webhook
forever — retry is the reconciliation job's job, not Stripe's). The
reconciliation job (`reconcilePendingActivations`) is the ONLY place that
re-attempts activation for a
`PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING` row, on a schedule, up to
`MAX_ACTIVATION_ATTEMPTS`. Because `applyPurchaseTierBump` is itself an
idempotent CAS (no-ops if the membership is already at the target
tier/ACTIVE from a previous partial attempt) and `activateMembershipTerms`
has its own "no unexpired terms already exists" guard (which now correctly
recognizes the terms already created by an earlier successful attempt, if
any), a retry after a partial success cannot double-activate.

### 7. Refund before activation
**Row state at time of refund:** `paymentStatus=SUCCEEDED`,
`activationStatus` is either still `PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING`
or has raced to `ACTIVATED`.
**Mechanism:** `charge.refunded` webhook looks up the purchase by
`(provider, providerReference)`, CAS:
`updateMany({ where: { id: purchaseId, paymentStatus: 'SUCCEEDED' }, data: { paymentStatus: 'REFUNDED' } })`.
If `activationStatus` is still `PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING`
at this point, the reconciliation job's next pass will still attempt
activation (payment and activation are independent state machines — see
above) UNLESS the reconciliation job first re-checks `paymentStatus`
immediately before each retry and skips (marking `FAILED_PERMANENTLY` with
a `failureReason` of `REFUNDED_BEFORE_ACTIVATION`) any row whose
`paymentStatus` is no longer `SUCCEEDED`. This check is implemented in
`reconcilePendingActivations` as the very first guard per row.

### 8. Refund after activation
**Row state:** `paymentStatus=SUCCEEDED -> REFUNDED`,
`activationStatus=ACTIVATED`, `membershipTermsId` set.
**Mechanism:** The same `charge.refunded` handler CAS-transitions
`paymentStatus` to `REFUNDED` as above. 2B deliberately does **not**
auto-revoke `JadeClubMembershipTerms` or the membership tier on refund —
`activateMembershipTerms`'s internals are explicitly off-limits (no
revocation/cancellation path exists inside it, and building one is out of
this scope), and a real "refund after benefits may already be consumed"
policy is a business decision, not a code default. Instead: the refund is
recorded truthfully (`paymentStatus=REFUNDED`) and surfaced in the admin
purchase view so a human can decide whether to run the *existing*,
separately-audited `adminAdjustMembership` (e.g. set `status: CANCELLED`)
— which remains the single source of truth for tier/status changes outside
the purchase flow. This is a deliberate scope boundary, called out again
in the "what remains for review" list.

### 9. Duplicate webhook delivery
**Mechanism:** Two mechanisms stack:
1. Every CAS above is a no-op the second time it runs (the `where` clause's
   expected-current-state no longer matches, so `count === 0`).
2. Belt-and-suspenders: before doing any state work, the handler checks
   `purchase.paymentStatus !== 'PENDING'` (for a payment-succeeded event) or
   `purchase.activationStatus === 'ACTIVATED'` (for anything downstream) and
   returns 200 immediately with no writes attempted at all.
Neither path ever throws on a duplicate — a duplicate is a clean, silent
200.

### 10. Concurrent webhook delivery (two workers racing the same purchase)
**Mechanism:** The CAS `updateMany` + `count === 1` check is itself the
concurrency primitive — Postgres's row-level `UPDATE` is atomic, so of two
simultaneous `updateMany` calls with the same `where: { id, paymentStatus:
'PENDING' }`, exactly one sees `count === 1` and proceeds; the other sees
`count === 0` and no-ops. For the activation step specifically, this
codebase already has a *stronger* guarantee one layer down:
`activateMembershipTerms` takes `SELECT ... FOR UPDATE` on the
`jade_club_memberships` row as the first statement of its transaction, so
even if two workers both won their own outer
`PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING` CAS (which cannot happen for the
*same* purchase row, but a user could in principle have two purchases
racing — see scenario 12/"policy race" note below), the second call
blocks on that lock and then correctly sees the just-created unexpired
terms row and throws its existing, unmodified
"already has an unexpired commercial terms period" error, which the
purchase-activation wrapper catches and treats as a **non-retryable**
failure (`FAILED_PERMANENTLY`, `failureReason: 'DUPLICATE_ACTIVE_TERMS'`)
rather than blindly retrying forever.
This test is exercised for real in
`lib/jade-club/__tests__/purchase-postgres-concurrency.test.ts` against a
real Postgres instance (see that file's header for how to run it — it
requires Docker and is skipped, not failed, when Docker is unavailable, as
it was in this implementation environment).

### 11. Provider reference uniqueness
**Mechanism:** `@@unique([provider, providerReference])` on
`JadeClubPurchase` at the DB layer. The webhook handler always looks the
purchase up by `(provider, providerReference)` — the Stripe Checkout
Session id — never by a client-echoed `purchaseId` from the redirect query
string (the confirmation page also never trusts that). If two checkout
sessions were somehow created for the same provider reference (should be
structurally impossible — Stripe generates a fresh session id per
`sessions.create()` call), the second insert would hit the unique
constraint and fail loudly rather than silently overwriting.

### 12. Exact currency/amount reconciliation
**Mechanism:** Two checks, mirroring the Paystack
exact-match-or-`reconciliation_required` precedent:
1. **At checkout-creation time:** `amountMinor` and `currency` are read
   from the resolved ACTIVE `JadeClubCommercialPolicy` row at the moment of
   session creation — never from the client request body, which only ever
   supplies `{ tier, market, currency }` (a *scope selector*, not a price).
   This mirrors `app/api/esim/stripe-session/route.ts`'s
   revalidate-immediately-before-charging pattern.
2. **At webhook time:** the handler re-reads `session.amount_total` /
   `session.currency` from the verified Stripe event and compares them,
   with exact integer/lowercase-vs-uppercase-normalized equality, against
   the `JadeClubPurchase.amountMinor`/`currency` recorded at checkout
   creation (which is itself immutable once written — no route ever
   updates those two columns). A mismatch never activates anything: the
   purchase is CAS-transitioned to `paymentStatus=SUCCEEDED` (the money
   really did move) but `activationStatus` is set straight to
   `FAILED_PERMANENTLY` with `failureReason: 'AMOUNT_MISMATCH'`, and an
   `ActivityLog` entry is written for staff to investigate — money is never
   silently un-accounted-for, and a benefit is never silently granted for
   less than the price a member actually paid.

## Why `policyVersion` is copied at checkout-creation time (not webhook time)

If an admin edits/supersedes the policy between checkout creation and
webhook delivery, the member must get exactly what they were shown and
charged for. `JadeClubPurchase.policyId`/`policyVersion`/`amountMinor` are
frozen at checkout-creation time; `activateMembershipTerms` is then called
against `purchase.policyId` — which, by construction, still points at the
exact policy row (immutable scalar fields) the customer paid for, never a
"current ACTIVE policy for this tier" re-lookup. If that specific policy
row has since been superseded (status flips to `SUPERSEDED`, not deleted —
see 2A's model), `activateMembershipTerms`'s own
`policy.status !== 'ACTIVE'` guard fires, which the wrapper treats as
`FAILED_PERMANENTLY` (`failureReason: 'POLICY_NO_LONGER_ACTIVE'`) rather
than silently activating stale terms — this is the "policy/version race"
edge case called out in the review checklist, and it fails safe (money
collected, benefit not silently granted, staff-visible for manual
resolution) rather than either double-charging or silently reprising an
old price.
