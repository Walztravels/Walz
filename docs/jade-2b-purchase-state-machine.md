# Jade Travel Club 2B — Purchase State Machine (final implementation)

This document describes the **actual, current implementation** as built —
not a design proposal, and not the intermediate designs superseded during
independent review. It reflects the code in `lib/jade-club/purchase.ts`,
`lib/jade-club/purchase-activation.ts`, `lib/jade-club/entitlements.ts`,
`lib/jade-club/membership.ts`, and `prisma/schema.prisma` /
`prisma/migrations/jade_travel_club_purchase_v2b*.sql` as they exist today.
It does not propose or invent any new lifecycle rule.

## The two independent state fields

`JadeClubPurchase` carries two orthogonal state machines on one row, never
conflated:

```
paymentStatus:     PENDING -> SUCCEEDED | FAILED | CANCELLED
                    SUCCEEDED -> REFUNDED

activationStatus:  NOT_STARTED
                    -> PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING
                    -> ACTIVATED                                     (terminal, success)
                    -> FAILED_PERMANENTLY                            (terminal — see "retryable vs not" below)
                    -> PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION     (terminal — a different, distinct, paid purchase already won)
```

`paymentStatus` is driven only by the payment provider (webhook events),
via `recordCheckoutSessionPaid`/`recordCheckoutSessionFailed`/
`recordRefund` — plain CAS transitions
(`updateMany({ where: { id, paymentStatus: <expected> }, data: {...} })`
+ `.count === 1` check), each a single boolean-ish transition already
correctly idempotent against duplicate/concurrent webhook delivery.

`activationStatus` is driven only by `attemptActivation`, which — unlike
the payment-side CAS functions — is **one single atomic
`prisma.$transaction`** covering the full purchase-lock-through-purchase-
finalization sequence (see below). A purchase can sit at
`paymentStatus=SUCCEEDED` /
`activationStatus=PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING` for an
arbitrary length of time — that is not an error state, it is the normal
transient state `lib/jade-club/purchase-reconciliation.ts` scans for.

## The atomic activation transaction (the actual sequence, as implemented)

`attemptActivation(purchaseId)` in `lib/jade-club/purchase-activation.ts`:

1. A cheap, lock-free pre-check (`prisma.jadeClubPurchase.findUnique`, no
   transaction yet) short-circuits a no-op call (already `ACTIVATED`,
   already `PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION`, or not in
   `PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING`) before ever bumping the
   attempt counter or opening a transaction.
2. `activationAttempts` is incremented in its own small, **independently
   committed** statement — deliberately *outside* the main transaction, so
   a later rollback of that transaction (a genuine technical failure) does
   not also erase the fact that an attempt was made. Without this, the
   exact same technical failure could repeat forever without ever
   tripping `MAX_ACTIVATION_ATTEMPTS`.
3. Everything else happens inside **one** `prisma.$transaction`:
   1. `SELECT id FROM jade_club_purchases WHERE id = ${purchaseId} FOR UPDATE`
      — the purchase row lock, taken **first** (see "lock order
      invariant" below).
   2. Re-read the purchase's authoritative state under that lock.
   3. **Direct, authoritative same-purchase idempotency lookup**:
      `tx.jadeClubMembershipTerms.findFirst({ where: { purchaseId } })`
      — `JadeClubMembershipTerms.purchaseId` is `@unique` at the DB layer
      (`prisma/migrations/jade_travel_club_purchase_v2b_terms_link.sql`).
      This is the *single* source of truth for "did this exact purchase
      already create its terms?" — it does **not** depend on `expiresAt`
      being in the future, a reverse pointer on the purchase row, the
      membership's current tier, or any client/webhook state. A
      purchase's own terms can be historically expired and this lookup
      still correctly recognizes them as that purchase's own (proven by a
      permanent regression test).
   4. If found: idempotent same-purchase recovery. Reconcile the purchase
      row to `ACTIVATED`/`membershipTermsId` if it isn't already (a
      self-heal for the narrow window where a concurrent call for the
      *same* purchase already created the terms but hadn't yet finalized
      this row), and return — never re-creates anything.
   5. If not found, require `paymentStatus === SUCCEEDED` — a plain
      **branch**, not an exception: `REFUNDED` → `FAILED_PERMANENTLY` /
      `REFUNDED_BEFORE_ACTIVATION`; anything else non-`SUCCEEDED` →
      `NOT_READY` (no write).
   6. Validate `purchase.tier` and re-read the policy fresh by
      `purchase.policyId` (the *exact* policy the member paid for — never
      "the current ACTIVE policy for this scope"). Missing/inactive
      policy → `FAILED_PERMANENTLY` / `UNKNOWN_ACTIVATION_ERROR` or
      `POLICY_NO_LONGER_ACTIVE` respectively, both branches, no throw.
   7. Resolve (get-or-create, `ensureMembershipInTx`) the membership row.
   8. **Winner-determination pre-check** (added in the narrow fix that
      resolved a HIGH finding — see "why the tier bump is where it is"
      below): lock the membership
      (`SELECT id FROM jade_club_memberships WHERE id = ${membership.id} FOR UPDATE`
      — the *same* lock statement `createMembershipTermsCore` itself uses
      moments later) and re-check for an unexpired terms period on it.
      **If a conflicting unexpired terms period exists** (this purchase
      *loses*): branch — `activationStatus: PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION`,
      `failureReason: DUPLICATE_PAID_MEMBERSHIP_PURCHASE` (or
      `DUPLICATE_ACTIVE_TERMS` if the winner is a non-purchase source,
      e.g. an admin grant) — commits normally, **membership tier is never
      touched on this path**, a real staff alert is raised
      (`raiseDuplicatePaidPurchaseAlert`).
   9. **Only if no collision** (this purchase *wins*):
      `applyPurchaseTierBump(tx, ...)` runs *now* — never before this
      point — moving `JadeClubMembership.tier`/`status` to the purchased
      tier/`ACTIVE` with `source: 'PURCHASE'`.
   10. `createMembershipTermsCore(tx, { membershipId, policyId, source: 'PURCHASE', purchaseId })`
       (`lib/jade-club/entitlements.ts`) — the **one** function anywhere
       in this codebase that creates a `JadeClubMembershipTerms` row. It
       re-locks the membership (already held, so this is a no-op
       re-acquire within the same transaction), re-validates policy/tier
       match, re-checks for a collision (structurally guaranteed to still
       find none — the lock has been held continuously since step 8),
       then creates the terms row (with `purchaseId` set — Correction 1/2
       provenance), the benefit snapshots, and pre-issues every
       `COUNT_PER_PERIOD` benefit's entitlement slots, all as one unit.
   11. **Fail-closed invariant guard**: if `createMembershipTermsCore`
       reports a collision *at this point* (step 10) despite step 8's
       pre-check already having found none under the *same, continuously
       held* lock, that is not a business outcome — it is proof an
       assumption behind this design was wrong. The code **throws**
       `JadePurchaseActivationInvariantError` (never writes anything,
       never returns an outcome). This throw is not caught anywhere
       inside the transaction callback; it propagates out of
       `prisma.$transaction`, which rolls back **everything** the
       transaction did — the tier bump from step 9, any purchase-row
       mutation, any terms/snapshot/entitlement writes. The outer
       `try/catch` (outside the transaction) then treats it as a generic
       technical failure (`FAILED_RETRYABLE`, eventually
       `FAILED_PERMANENTLY`/`MAX_RETRIES_EXCEEDED` after
       `MAX_ACTIVATION_ATTEMPTS`) and, specifically for this error type,
       raises a distinct staff operational alert (safe identifiers only —
       purchase id, membership id, error code — after the rollback has
       already completed, never from inside it).
   12. Otherwise: finalize the *same* purchase row —
       `activationStatus: ACTIVATED`, `membershipTermsId: <new terms id>`
       — in the *same* transaction, the *same* commit as step 10. **No
       post-commit purchase-attribution write exists anywhere.**
4. If the transaction throws for any other genuine reason (a real DB
   error, a missing-membership edge case, etc.), the same outer
   `try/catch` applies the same `FAILED_RETRYABLE`/`FAILED_PERMANENTLY`
   handling.

### Why the tier bump is positioned where it is (step 9, not earlier)

An earlier version of this code called `applyPurchaseTierBump` *before*
the collision check (to satisfy `createMembershipTermsCore`'s own
internal "policy tier must already match membership tier" guard).
Independent review found this a HIGH-severity defect: with two
*different-tier* purchases racing the same membership, the *losing*
purchase's tier bump could still commit (the collision branch commits
normally, it doesn't roll back), leaving `JadeClubMembership.tier`
permanently diverged from the tier of the terms the *winner* actually got
issued. The fix reordered the sequence — winner status is determined
*first*, and the tier mutation is *conditioned* on having already
confirmed this purchase wins. `applyPurchaseTierBump` has exactly **one**
call site in the codebase (this one), verified by a permanent regression
test that walks every `.ts`/`.tsx` file in the repo.

## Retryable vs non-retryable failure reasons

`activationStatus = FAILED_PERMANENTLY` does **not** uniformly mean "give
up forever" — `failureReason` distinguishes two categories:

- **Retryable** (`RETRYABLE_ACTIVATION_FAILURE_REASONS` in
  `lib/jade-club/purchase-types.ts`): `MAX_RETRIES_EXCEEDED`,
  `UNKNOWN_ACTIVATION_ERROR` — genuinely transient technical conditions. A
  staff-triggered "Retry Activation" action
  (`lib/jade-club/purchase-activation.ts::adminResetForRetry`) is CAS-gated
  on `activationStatus: 'FAILED_PERMANENTLY'` **and**
  `failureReason: { in: RETRYABLE_ACTIVATION_FAILURE_REASONS }` — a
  structural/business reason can never be retried through this action even
  if it somehow ended up under `FAILED_PERMANENTLY`.
- **Non-retryable, structural**: `POLICY_NO_LONGER_ACTIVE`,
  `REFUNDED_BEFORE_ACTIVATION`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH` — a
  mechanical retry against the *exact same* immutable
  `purchase.policyId`/amount/currency will deterministically fail again.
- **Structurally excluded from retry entirely**:
  `activationStatus = PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION`
  (`DUPLICATE_PAID_MEMBERSHIP_PURCHASE` / `DUPLICATE_ACTIVE_TERMS`) is a
  *different activationStatus value*, not `FAILED_PERMANENTLY` at all —
  `adminResetForRetry`'s CAS cannot match it, so "Retry Activation" is
  never even offered for it in the admin UI. This is the deliberate
  distinction between "an expected business collision, needs a human
  financial decision (normally a refund)" and "a technical hiccup, a
  mechanical retry might work."

## Purchase provenance (`JadeClubMembershipTerms.purchaseId`)

`purchaseId String? @unique` on `JadeClubMembershipTerms`, with
`onDelete: Restrict` to `JadeClubPurchase` — matching this exact table's
own pre-existing `policyId` FK precedent ("traceability that must never
quietly disappear"). Nullable because every pre-2B (`ADMIN_GRANT`/
`PROMOTION`/`DEFAULT`) terms row has no originating purchase; the unique
index permits unlimited `NULL`s while enforcing uniqueness among non-`NULL`
values. `RESTRICT`, never `SET NULL` — `JadeClubPurchase` is a financial/
audit record; once it backs real membership terms, deleting it must never
silently erase that terms row's provenance. See
`prisma/migrations/jade_travel_club_purchase_v2b_terms_link.sql` for the
full justification and the exact SQL.

**⚠️ DEFERRED ENGINEERING NOTE — read before ever building account/User
deletion.** No current code path deletes a `User` row, so this is not a
release blocker for 2B. But when a future User-deletion / GDPR-erasure /
account-deletion workflow is built, it **must** account for this
interaction: `JadeClubMembershipTerms.purchaseId` is `ON DELETE RESTRICT`
to `JadeClubPurchase`, while `JadeClubPurchase.userId` is (per
`prisma/schema.prisma`) `ON DELETE CASCADE` from `User`, and
`JadeClubMembership.userId` is *also* `ON DELETE CASCADE` from `User`
(which cascades further into `JadeClubMembershipTerms` via
`membershipId`). Depending on Postgres's own cascade-processing order for
a single `DELETE FROM "User" WHERE id = ...`, a `User` delete could
attempt to `CASCADE`-delete a `JadeClubPurchase` row at the same moment a
`RESTRICT` FK from an existing `JadeClubMembershipTerms.purchaseId` row is
still pointing at it — the delete would then correctly **fail** (Postgres
respects `RESTRICT` regardless of cascade ordering elsewhere in the same
statement), but that failure needs to be *anticipated and explicitly
handled* by whatever future deletion workflow is built (e.g.
deactivate/archive/anonymize the purchase record — never blindly force
past the restriction) rather than discovered as a surprise runtime error
in production. This same note also appears as a code comment on the
`purchaseId` field in `prisma/schema.prisma`.

## Refund/activation serialization

`recordRefund(providerReference)` is also a single transaction: it locks
the purchase row by its natural key directly
(`SELECT id FROM jade_club_purchases WHERE provider = 'STRIPE' AND provider_reference = ${providerReference} FOR UPDATE`
— avoiding a separate lookup-then-lock TOCTOU gap), re-reads under that
lock, applies the `SUCCEEDED -> REFUNDED` transition (no-op if not
currently `SUCCEEDED`), and — if `activationStatus` is already `ACTIVATED`
at that moment — raises `raiseRefundAfterActivationAlert` (a real
`StaffNotification`, never just a passive row). `recordRefund` never also
locks `JadeClubMembership`, so it trivially satisfies the lock-order
invariant below on its own.

## Lock order invariant

Whenever a transaction in this codebase holds **both** a `JadeClubPurchase`
row lock and the `JadeClubMembership` row lock, the **purchase lock is
always acquired first, the membership lock second** — never the reverse.
`attemptActivation` is the only function that ever takes both (purchase
lock at the top of its transaction; membership lock moments later, inside
its own winner-determination pre-check and again inside
`createMembershipTermsCore`). `recordRefund` only ever takes the purchase
lock. Documented as an explicit code comment at the top of
`lib/jade-club/purchase-activation.ts` — any future feature that needs
both locks in one transaction must follow this same order or it can
deadlock against `attemptActivation`.

## The 12 (+2) scenarios, as actually implemented

### 1. Checkout created but abandoned (never completed)
A `PENDING`/`NOT_STARTED` row with no webhook delivery is simply inert —
`createJadeClubCheckout`'s own pre-check for "already has an unexpired
terms period" only looks at `JadeClubMembershipTerms`, never at
`JadeClubPurchase.paymentStatus`, so the same user can always create a
fresh purchase + a fresh Stripe Checkout Session. No cleanup job exists or
is required for correctness.

### 2. Payment failed
`recordCheckoutSessionFailed`: CAS
`updateMany({ where: { id, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED', failureReason } })`.
`activationStatus` is never touched.

### 3. Payment confirmed
`recordCheckoutSessionPaid`: CAS `PENDING -> SUCCEEDED` (with the exact
amount/currency check — see scenario 12), then a best-effort CAS
`NOT_STARTED -> PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING`.

### 4. Activation pending
A durable, committed intermediate state (not an in-memory flag) — the
reconciliation job scans for exactly this value.

### 5. Activation succeeded
The full atomic transaction described above, steps 1–12, ending with the
`ACTIVATED` finalization in step 12.

### 6. Activation retry (after a transient failure)
The independently-committed attempt counter (step 2 above) plus the outer
`try/catch`'s `FAILED_RETRYABLE`/`FAILED_PERMANENTLY` handling. The
reconciliation job (`reconcilePendingActivations`) is the only place that
re-invokes `attemptActivation` on a schedule for rows still at
`PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING`.

### 7. Refund before activation
`recordRefund`'s own transaction (see "refund/activation serialization"
above); the *next* `attemptActivation` attempt re-checks `paymentStatus`
itself (step 5 of the sequence) and terminates as
`FAILED_PERMANENTLY`/`REFUNDED_BEFORE_ACTIVATION` — never issues
entitlements for a refunded purchase.

### 8. Refund after activation
`recordRefund` records `REFUNDED` truthfully without touching
`activationStatus`/`membershipTermsId`, and raises the operational alert.
2B deliberately does **not** auto-revoke `JadeClubMembershipTerms` or the
membership tier — that is a business decision outside this scope; a human
follows up via the existing, separately-audited `adminAdjustMembership`.

### 9. Duplicate webhook delivery
Every payment-side CAS is a no-op on a repeat (the `where` clause's
expected value no longer matches). `attemptActivation`'s own top-level
pre-check additionally short-circuits `ACTIVATED`/
`PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION` rows before ever opening a
transaction.

### 10. Concurrent webhook delivery / concurrent activation workers (two workers racing the same purchase — Case A)
Structurally handled by step 3's direct `purchaseId` lookup: whichever
call's transaction commits first creates the terms row (with `purchaseId`
set); the losing call's own lookup at step 3 finds that row directly and
reports `ACTIVATED` via the idempotent-recovery path (step 4) — never
`FAILED_PERMANENTLY`. (A distinct, *different-purchase* collision — two
genuinely separate paid purchases — is Case B, covered by step 8's
winner-determination branch, `PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION`.)

### 11. Provider reference uniqueness
`@@unique([provider, providerReference])` on `JadeClubPurchase`.
`recordCheckoutSessionPaid` looks up by `(provider, providerReference)`
only; `purchaseIdHint` (from Stripe's own verified `session.metadata`,
never the browser) is used *only* to self-heal the narrow crash window
where a purchase row still carries its `pending:` placeholder reference at
webhook-arrival time — and only via a CAS that patches a row *still*
carrying that exact placeholder prefix, so it can never hijack an
unrelated or already-healed row. Both the self-heal itself and its refusal
to touch an already-healed/unrelated row are covered by executable
regression tests that force the real crash window (not source inspection).

### 12. Exact currency/amount reconciliation
`amountMinor`/`currency` are frozen on the purchase row at
checkout-creation time from the resolved ACTIVE policy — never
client-supplied, never re-derived. `recordCheckoutSessionPaid` compares the
verified Stripe event's `amount_total`/`currency` against those frozen
values with exact equality; a mismatch records `paymentStatus: SUCCEEDED`
truthfully (money did move) but routes straight to
`activationStatus: FAILED_PERMANENTLY` / `AMOUNT_MISMATCH` or
`CURRENCY_MISMATCH` — never silently activates a mismatched charge.

## Why `policyVersion`/`amountMinor` are copied at checkout-creation time

If an admin supersedes the policy between checkout creation and webhook
delivery, the member must get exactly what they were shown and charged
for. `JadeClubPurchase.policyId`/`policyVersion`/`amountMinor` are frozen
at checkout time; `attemptActivation` always activates against
`purchase.policyId` — the exact, immutable policy row the member paid
for — never "the current ACTIVE policy for this scope." If that specific
policy has since been superseded (`status` flips to `SUPERSEDED`, never
deleted), step 6 of the sequence above catches it and terminates the
purchase as `FAILED_PERMANENTLY`/`POLICY_NO_LONGER_ACTIVE` — proven
end-to-end (not just by inspecting the guard clause) by a permanent
regression test that drives the real `attemptActivation` orchestration
against a policy genuinely superseded between checkout and activation,
asserting zero tier mutation, zero terms/snapshots/entitlements created.
