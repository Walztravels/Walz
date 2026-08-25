'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type QuoteStatus =
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'changes_requested'
  | 'expired'
  | 'converted';

interface Segment {
  segmentOrder: number;
  originCode: string;
  originCity: string;
  originTerminal: string | null;
  departureAt: string;
  destinationCode: string;
  destinationCity: string;
  destinationTerminal: string | null;
  arrivalAt: string;
  flightNumber: string;
  durationMinutes: number;
  stops: number;
}

interface FlightOption {
  id: string;
  label: string;
  isRecommended: boolean;
  sortOrder: number;
  airline: string;
  airlineCode: string;
  airlineLogoUrl: string | null;
  tripType: string;
  cabinClass: string;
  isRefundable: boolean;
  changesAllowed: boolean;
  changeFee: string | null;
  seatIncluded: boolean;
  mealIncluded: boolean;
  personalItem: string | null;
  cabinBaggage: string | null;
  checkedBaggage: string | null;
  sellingPriceMinor: number;
  currency: string;
  fareExpiresAt: string | null;
  clientNote: string | null;
  segments: Segment[];
  media: unknown[];
}

interface HotelOption {
  id: string;
  label: string;
  isRecommended: boolean;
  sortOrder: number;
  hotelName: string;
  starRating: number;
  city: string;
  country: string;
  description: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  roomType: string | null;
  breakfastIncluded: boolean;
  isRefundable: boolean;
  amenities: string[];
  sellingPriceMinor: number;
  currency: string;
  showPerNight: boolean;
  clientNote: string | null;
  media: unknown[];
}

interface QuoteItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  sortOrder: number;
  sellingPriceMinor: number;
  currency: string;
  showPriceToClient: boolean;
  clientNote: string | null;
  metadata: Record<string, unknown>;
}

interface QuoteData {
  id: string;
  reference: string;
  status: QuoteStatus;
  clientName: string;
  currency: string;
  title: string;
  description: string | null;
  version: number;
  validUntil: string | null;
  totalMinor: number;
  subtotalMinor: number;
  depositMinor: number | null;
  depositCurrency: string | null;
  depositPercentage: number | null;
  selectedFlightOptionId: string | null;
  selectedHotelOptionId: string | null;
  items: QuoteItem[];
  flightOptions: FlightOption[];
  hotelOptions: HotelOption[];
  media: unknown[];
}

type PageView =
  | 'loading'
  | 'expired'
  | 'not_found'
  | 'error'
  | 'already_accepted'
  | 'already_declined'
  | 'ready';

type ActionPanel = 'idle' | 'declining' | 'changes';
type ActionResult = 'accepted' | 'declined' | 'changes_sent' | null;

// ── Constants ──────────────────────────────────────────────────────────────────

const NAVY = '#0A1628';
const GOLD = '#C9A84C';
const ACTIONABLE: QuoteStatus[] = ['sent', 'viewed', 'changes_requested'];

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string): string {
  // Flight times are always local airport time — extract HH:MM directly
  const m = iso.match(/T(\d{2}:\d{2})/)
  if (m) return m[1]
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function cabinClassLabel(code: string): string {
  const map: Record<string, string> = {
    ECONOMY: 'Economy',
    PREMIUM_ECONOMY: 'Premium Economy',
    BUSINESS: 'Business',
    FIRST: 'First Class',
  };
  return map[code] ?? code;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold mb-4 uppercase tracking-widest text-xs" style={{ color: GOLD }}>
      {children}
    </h2>
  );
}

function Stars({ count }: { count: number }) {
  const full = Math.max(0, Math.min(5, Math.round(count)));
  return (
    <span className="text-yellow-400 tracking-tight">
      {'★'.repeat(full)}
      <span className="text-gray-200">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full whitespace-nowrap">
      {children}
    </span>
  );
}

function ChipAlert({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full whitespace-nowrap">
      {children}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const palette: Record<string, { bg: string; color: string }> = {
    visa:          { bg: '#eff6ff', color: '#1e40af' },
    insurance:     { bg: '#f0fdf4', color: '#166534' },
    transfer:      { bg: '#fdf4ff', color: '#6b21a8' },
    activity:      { bg: '#fff7ed', color: '#c2410c' },
    accommodation: { bg: '#ecfeff', color: '#0e7490' },
    fee:           { bg: '#f9fafb', color: '#374151' },
  };
  const c = palette[type.toLowerCase()] ?? { bg: '#f3f4f6', color: '#374151' };
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {type}
    </span>
  );
}

function FarePill({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
      <span className="text-xs text-gray-400">{label}</span>
      <span
        className="text-xs font-semibold"
        style={{ color: positive ? '#16a34a' : '#9ca3af' }}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryLine({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number;
  currency: string;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{formatMoney(amount, currency)}</p>
    </div>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <div
      className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
      style={{ borderColor: checked ? GOLD : '#d1d5db' }}
    >
      {checked && (
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GOLD }} />
      )}
    </div>
  );
}

// ── Page Header ────────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <header
      className="w-full px-6 py-4 flex items-center"
      style={{ backgroundColor: NAVY }}
    >
      <img src="/walz-logo.png" alt="Walz Travels" className="h-10 object-contain" />
    </header>
  );
}

// ── Page Footer ────────────────────────────────────────────────────────────────

function PageFooter({ clientName }: { clientName: string }) {
  return (
    <footer
      className="mt-16 py-10 px-6 text-center"
      style={{ backgroundColor: NAVY }}
    >
      <p className="font-semibold text-white mb-1">Walz Travels</p>
      <p className="text-sm text-white/60">
        Questions?{' '}
        <a
          href="mailto:hello@walztravels.com"
          className="underline hover:text-white transition-colors"
        >
          hello@walztravels.com
        </a>
      </p>
      {clientName && (
        <p className="mt-3 text-xs text-white/30">
          This proposal was prepared exclusively for {clientName}.
        </p>
      )}
    </footer>
  );
}

// ── Shell wrapper ──────────────────────────────────────────────────────────────

function Shell({
  children,
  clientName = '',
}: {
  children: React.ReactNode;
  clientName?: string;
}) {
  return (
    <div style={{ backgroundColor: '#f2f0ec', minHeight: '100vh' }} className="flex flex-col">
      <PageHeader />
      {children}
      <PageFooter clientName={clientName} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function QuoteProposalPage() {
  const params = useParams();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token as string) ?? '';

  // ── State ──────────────────────────────────────────────────────────────────

  const [pageView, setPageView] = useState<PageView>('loading');
  const [quote, setQuote] = useState<QuoteData | null>(null);

  // Selection state
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);

  // Action panel UI
  const [actionPanel, setActionPanel] = useState<ActionPanel>('idle');
  const [signatureName, setSignatureName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [changesNote, setChangesNote] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult>(null);

  // ── Fetch quote ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setPageView('not_found');
      return;
    }

    fetch(`/api/quote-proposal/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setPageView('not_found'); return; }
        if (res.status === 410) { setPageView('expired'); return; }
        if (!res.ok) { setPageView('error'); return; }

        const data: QuoteData = await res.json();
        setQuote(data);

        // Pre-select a flight: existing selection → recommended → first
        setSelectedFlightId(
          data.selectedFlightOptionId
            ?? data.flightOptions.find((f) => f.isRecommended)?.id
            ?? data.flightOptions[0]?.id
            ?? null,
        );
        // Pre-select a hotel: existing selection → recommended → first
        setSelectedHotelId(
          data.selectedHotelOptionId
            ?? data.hotelOptions.find((h) => h.isRecommended)?.id
            ?? data.hotelOptions[0]?.id
            ?? null,
        );

        if (data.status === 'expired') { setPageView('expired'); return; }
        if (data.status === 'accepted' || data.status === 'converted') {
          setPageView('already_accepted'); return;
        }
        if (data.status === 'declined') { setPageView('already_declined'); return; }

        setPageView('ready');
      })
      .catch(() => setPageView('error'));
  }, [token]);

  // ── Computed total ─────────────────────────────────────────────────────────

  const computedTotal = (() => {
    if (!quote) return 0;
    const hasOptions = quote.flightOptions.length > 0 || quote.hotelOptions.length > 0;
    if (!hasOptions) return quote.totalMinor;

    let total = 0;
    for (const item of quote.items) {
      if (item.showPriceToClient) total += item.sellingPriceMinor;
    }
    const flight = quote.flightOptions.find((f) => f.id === selectedFlightId);
    if (flight) total += flight.sellingPriceMinor;
    const hotel = quote.hotelOptions.find((h) => h.id === selectedHotelId);
    if (hotel) total += hotel.sellingPriceMinor;
    return total;
  })();

  // ── Action helpers ─────────────────────────────────────────────────────────

  async function postAction(body: Record<string, unknown>): Promise<boolean> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/quote-proposal/${token}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(
          (payload as { message?: string }).message ??
            'Something went wrong. Please try again.',
        );
      }
      return true;
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (!signatureName.trim()) {
      setSubmitError('Please enter your full name to sign.');
      return;
    }
    const ok = await postAction({
      action: 'accept',
      signatureName: signatureName.trim(),
      ...(selectedFlightId ? { selectedFlightOptionId: selectedFlightId } : {}),
      ...(selectedHotelId ? { selectedHotelOptionId: selectedHotelId } : {}),
    });
    if (ok) setActionResult('accepted');
  }

  async function handleDecline() {
    if (!declineReason.trim()) {
      setSubmitError('Please provide a reason for declining.');
      return;
    }
    const ok = await postAction({ action: 'decline', declineReason: declineReason.trim() });
    if (ok) setActionResult('declined');
  }

  async function handleChanges() {
    if (!changesNote.trim()) {
      setSubmitError('Please describe the changes you need.');
      return;
    }
    const ok = await postAction({ action: 'changes', changesNote: changesNote.trim() });
    if (ok) setActionResult('changes_sent');
  }

  function togglePanel(panel: 'declining' | 'changes') {
    setSubmitError(null);
    setActionPanel((prev) => (prev === panel ? 'idle' : panel));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Non-ready states
  // ─────────────────────────────────────────────────────────────────────────

  if (pageView === 'loading') {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center py-32">
          <div className="text-center space-y-4">
            <div
              className="w-12 h-12 rounded-full border-4 animate-spin mx-auto"
              style={{
                borderColor: `${GOLD}33`,
                borderTopColor: GOLD,
              }}
            />
            <p className="text-sm font-medium" style={{ color: NAVY }}>
              Loading your proposal…
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (pageView === 'expired') {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-5">⏰</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
              Proposal Expired
            </h1>
            <p className="text-gray-500 mb-7 leading-relaxed">
              This quote proposal is no longer valid. Please contact us and we&apos;ll
              put together a fresh proposal for you.
            </p>
            <a
              href="mailto:hello@walztravels.com"
              className="inline-block text-white font-semibold px-7 py-3 rounded-xl hover:opacity-90 transition"
              style={{ backgroundColor: GOLD }}
            >
              Contact Walz Travels
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  if (pageView === 'not_found' || pageView === 'error') {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-5">{pageView === 'not_found' ? '🔍' : '⚠️'}</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
              {pageView === 'not_found' ? 'Proposal Not Found' : 'Something Went Wrong'}
            </h1>
            <p className="text-gray-500 mb-7 leading-relaxed">
              {pageView === 'not_found'
                ? "We couldn't find this proposal. The link may be incorrect or has been removed."
                : 'We encountered an error loading your proposal. Please try again or contact us.'}
            </p>
            <a
              href="mailto:hello@walztravels.com"
              className="inline-block text-white font-semibold px-7 py-3 rounded-xl hover:opacity-90 transition"
              style={{ backgroundColor: GOLD }}
            >
              Get in Touch
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  if (pageView === 'already_accepted') {
    return (
      <Shell clientName={quote?.clientName}>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: '#d1fae5' }}
            >
              <svg className="w-8 h-8" fill="none" stroke="#16a34a" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
              Already Accepted
            </h1>
            <p className="text-gray-500 leading-relaxed">
              You&apos;ve already accepted this proposal. Our team is progressing your
              booking and will be in touch shortly.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (pageView === 'already_declined') {
    return (
      <Shell clientName={quote?.clientName}>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-5">📋</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
              Response Received
            </h1>
            <p className="text-gray-500 mb-7 leading-relaxed">
              We&apos;ve already received your response for this proposal. If you change
              your mind or need a new quote, we&apos;re happy to help.
            </p>
            <a
              href="mailto:hello@walztravels.com"
              className="inline-block text-white font-semibold px-7 py-3 rounded-xl hover:opacity-90 transition"
              style={{ backgroundColor: GOLD }}
            >
              Contact Us
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Post-action result screens ───────────────────────────────────────────

  if (actionResult === 'accepted') {
    return (
      <Shell clientName={quote?.clientName ?? ''}>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-lg p-12 max-w-lg w-full text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: '#d1fae5' }}
            >
              <svg className="w-10 h-10" fill="none" stroke="#16a34a" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-3" style={{ color: NAVY }}>
              Booking Approved!
            </h1>
            <p className="text-gray-600 text-lg mb-2">
              Thank you, <strong>{signatureName}</strong>.
            </p>
            <p className="text-gray-500 leading-relaxed">
              We&apos;ve received your approval for{' '}
              <strong>{quote?.title}</strong>. Our team will be in touch within
              24 hours to confirm your booking and arrange payment.
            </p>
            <div
              className="mt-8 rounded-xl p-4 text-sm"
              style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}
            >
              <p className="text-blue-700">
                Reference: <strong>{quote?.reference}</strong>
              </p>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (actionResult === 'declined') {
    return (
      <Shell clientName={quote?.clientName ?? ''}>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-5">📋</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
              Response Received
            </h1>
            <p className="text-gray-500 leading-relaxed">
              Thank you for letting us know. We&apos;ve recorded your decision and
              our team may reach out to discuss alternative options.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (actionResult === 'changes_sent') {
    return (
      <Shell clientName={quote?.clientName ?? ''}>
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-5">✉️</div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
              Changes Requested
            </h1>
            <p className="text-gray-500 leading-relaxed">
              We&apos;ve received your requested changes and will revise the proposal
              shortly. Keep an eye on your inbox for the updated version.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN QUOTE VIEW
  // ─────────────────────────────────────────────────────────────────────────

  if (!quote) return null;

  const isActionable = ACTIONABLE.includes(quote.status);
  const selectedFlight = quote.flightOptions.find((f) => f.id === selectedFlightId) ?? null;
  const selectedHotel = quote.hotelOptions.find((h) => h.id === selectedHotelId) ?? null;
  const visibleItems = quote.items.filter((i) => i.showPriceToClient);

  return (
    <div style={{ backgroundColor: '#f2f0ec', minHeight: '100vh' }} className="flex flex-col">
      <PageHeader />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="py-16 px-6 text-white text-center"
        style={{
          background: `linear-gradient(135deg, ${NAVY} 0%, #112240 100%)`,
        }}
      >
        <p
          className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: GOLD }}
        >
          {quote.reference}
          {quote.version > 1 ? ` · Version ${quote.version}` : ''}
        </p>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight max-w-3xl mx-auto">
          {quote.title}
        </h1>
        <p className="text-white/70 text-lg mb-1.5">
          Prepared exclusively for{' '}
          <span className="text-white font-semibold">{quote.clientName}</span>
        </p>
        {quote.validUntil && (
          <p className="text-white/50 text-sm">
            Valid until{' '}
            <span className="text-white/80">{formatDate(quote.validUntil)}</span>
          </p>
        )}
        {quote.description && (
          <p className="mt-6 text-white/65 max-w-2xl mx-auto leading-relaxed">
            {quote.description}
          </p>
        )}
      </section>

      {/* ── Total strip (overlapping hero) ────────────────────────────────── */}
      <div className="flex justify-center -mt-6 px-4 mb-10">
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
          style={{ borderTop: `4px solid ${GOLD}` }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            <div className="flex-1 w-full text-center sm:text-left px-8 py-6">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1 font-semibold">
                Total Investment
              </p>
              <p className="text-4xl font-bold" style={{ color: GOLD }}>
                {formatMoney(computedTotal, quote.currency)}
              </p>
              {quote.depositMinor && (
                <p className="text-sm text-gray-500 mt-1.5">
                  Deposit required:{' '}
                  <span className="font-semibold text-gray-700">
                    {formatMoney(
                      quote.depositMinor,
                      quote.depositCurrency ?? quote.currency,
                    )}
                  </span>
                  {quote.depositPercentage ? ` (${quote.depositPercentage}%)` : ''}
                </p>
              )}
            </div>
            {selectedFlight && (
              <div className="px-8 py-5 text-center w-full sm:w-auto">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1 font-semibold">
                  Flights
                </p>
                <p className="font-bold text-gray-800">
                  {formatMoney(selectedFlight.sellingPriceMinor, selectedFlight.currency)}
                </p>
              </div>
            )}
            {selectedHotel && (
              <div className="px-8 py-5 text-center w-full sm:w-auto">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1 font-semibold">
                  Hotel
                </p>
                <p className="font-bold text-gray-800">
                  {formatMoney(selectedHotel.sellingPriceMinor, selectedHotel.currency)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 pb-16 space-y-10">

        {/* ── Flight Options ─────────────────────────────────────────────── */}
        {quote.flightOptions.length > 0 && (
          <section>
            <SectionHeading>✈ Flight Options</SectionHeading>
            <div className="space-y-4">
              {[...quote.flightOptions]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((opt) => {
                  const isSelected = opt.id === selectedFlightId;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => isActionable && setSelectedFlightId(opt.id)}
                      className={[
                        'bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-150',
                        isActionable ? 'cursor-pointer hover:shadow-md' : '',
                      ].join(' ')}
                      style={{
                        outline: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                        outlineOffset: '-2px',
                      }}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
                        style={{ backgroundColor: isSelected ? '#faf8f3' : '#fafafa' }}
                      >
                        <div className="flex items-center gap-3">
                          {isActionable && <RadioDot checked={isSelected} />}
                          <div>
                            <span
                              className="font-bold text-base"
                              style={{ color: NAVY }}
                            >
                              {opt.label}
                            </span>
                            {opt.isRecommended && (
                              <span
                                className="ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                                style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
                              >
                                Recommended
                              </span>
                            )}
                          </div>
                        </div>
                        <p
                          className="text-xl font-bold ml-4 flex-shrink-0"
                          style={{ color: GOLD }}
                        >
                          {formatMoney(opt.sellingPriceMinor, opt.currency)}
                        </p>
                      </div>

                      {/* Segments */}
                      <div className="px-6 py-5 space-y-5">
                        {[...opt.segments]
                          .sort((a, b) => a.segmentOrder - b.segmentOrder)
                          .map((seg) => (
                            <div key={seg.segmentOrder} className="flex items-center gap-3">
                              {/* Origin */}
                              <div className="text-center min-w-[60px]">
                                <p
                                  className="text-2xl font-bold leading-none"
                                  style={{ color: NAVY }}
                                >
                                  {formatTime(seg.departureAt)}
                                </p>
                                <p className="text-xs font-bold text-gray-500 mt-1">
                                  {seg.originCode}
                                </p>
                                {seg.originCity && (
                                  <p className="text-xs text-gray-400 hidden sm:block">
                                    {seg.originCity}
                                  </p>
                                )}
                                {seg.originTerminal && (
                                  <p className="text-xs text-gray-300">
                                    T{seg.originTerminal}
                                  </p>
                                )}
                              </div>

                              {/* Route line */}
                              <div className="flex-1 flex flex-col items-center gap-1">
                                <p className="text-xs text-gray-400">
                                  {formatDuration(seg.durationMinutes)}
                                </p>
                                <div className="w-full flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                                  <div className="flex-1 h-px bg-gray-200" />
                                  {seg.stops === 0 ? (
                                    <span className="text-xs text-gray-400 px-1.5 whitespace-nowrap">
                                      Direct
                                    </span>
                                  ) : (
                                    <span className="text-xs text-orange-500 px-1.5 whitespace-nowrap">
                                      {seg.stops} stop{seg.stops > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  <div className="flex-1 h-px bg-gray-200" />
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                                </div>
                                <p className="text-xs text-gray-400">
                                  {seg.flightNumber} · {opt.airline}
                                </p>
                              </div>

                              {/* Destination */}
                              <div className="text-center min-w-[60px]">
                                <p
                                  className="text-2xl font-bold leading-none"
                                  style={{ color: NAVY }}
                                >
                                  {formatTime(seg.arrivalAt)}
                                </p>
                                <p className="text-xs font-bold text-gray-500 mt-1">
                                  {seg.destinationCode}
                                </p>
                                {seg.destinationCity && (
                                  <p className="text-xs text-gray-400 hidden sm:block">
                                    {seg.destinationCity}
                                  </p>
                                )}
                                {seg.destinationTerminal && (
                                  <p className="text-xs text-gray-300">
                                    T{seg.destinationTerminal}
                                  </p>
                                )}
                              </div>

                              {/* Date (hidden on small screens) */}
                              <div className="hidden md:block text-right min-w-[64px]">
                                <p className="text-xs text-gray-400">
                                  {formatShortDate(seg.departureAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>

                      {/* Fare conditions */}
                      <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/60">
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">
                          {cabinClassLabel(opt.cabinClass)} · Fare Conditions
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <FarePill
                            label="Refundable"
                            value={opt.isRefundable ? 'Yes' : 'No'}
                            positive={opt.isRefundable}
                          />
                          <FarePill
                            label="Changes"
                            value={
                              opt.changesAllowed
                                ? opt.changeFee
                                  ? `Yes · ${opt.changeFee}`
                                  : 'Yes'
                                : 'No'
                            }
                            positive={opt.changesAllowed}
                          />
                          <FarePill
                            label="Cabin bag"
                            value={opt.cabinBaggage ?? '—'}
                            positive={!!opt.cabinBaggage}
                          />
                          <FarePill
                            label="Checked bag"
                            value={opt.checkedBaggage ?? '—'}
                            positive={!!opt.checkedBaggage}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {opt.seatIncluded && <Chip>Seat included</Chip>}
                          {opt.mealIncluded && <Chip>Meal included</Chip>}
                          {opt.personalItem && (
                            <Chip>{opt.personalItem} personal item</Chip>
                          )}
                        </div>
                      </div>

                      {opt.clientNote && (
                        <div className="px-6 py-3 border-t border-gray-100 text-sm text-gray-500 italic">
                          Note: {opt.clientNote}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* ── Hotel Options ──────────────────────────────────────────────── */}
        {quote.hotelOptions.length > 0 && (
          <section>
            <SectionHeading>🏨 Hotel Options</SectionHeading>
            <div className="space-y-4">
              {[...quote.hotelOptions]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((opt) => {
                  const isSelected = opt.id === selectedHotelId;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => isActionable && setSelectedHotelId(opt.id)}
                      className={[
                        'bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-150',
                        isActionable ? 'cursor-pointer hover:shadow-md' : '',
                      ].join(' ')}
                      style={{
                        outline: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                        outlineOffset: '-2px',
                      }}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-start justify-between px-6 py-5 border-b border-gray-100"
                        style={{ backgroundColor: isSelected ? '#faf8f3' : '#fafafa' }}
                      >
                        <div className="flex items-start gap-3">
                          {isActionable && (
                            <div className="mt-1">
                              <RadioDot checked={isSelected} />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center flex-wrap gap-2">
                              <span
                                className="font-bold text-lg leading-snug"
                                style={{ color: NAVY }}
                              >
                                {opt.hotelName}
                              </span>
                              {opt.isRecommended && (
                                <span
                                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: '#fef3c7',
                                    color: '#92400e',
                                  }}
                                >
                                  Recommended
                                </span>
                              )}
                            </div>
                            <Stars count={opt.starRating} />
                            <p className="text-sm text-gray-400 mt-0.5">
                              {opt.city}, {opt.country}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <p className="text-xl font-bold" style={{ color: GOLD }}>
                            {formatMoney(opt.sellingPriceMinor, opt.currency)}
                          </p>
                          {opt.showPerNight && (
                            <p className="text-xs text-gray-400">per night</p>
                          )}
                        </div>
                      </div>

                      {/* Dates + details */}
                      <div className="px-6 py-5 space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-gray-50 rounded-xl px-3 py-4">
                            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1.5">
                              Check-in
                            </p>
                            <p className="font-semibold text-sm" style={{ color: NAVY }}>
                              {formatDate(opt.checkIn)}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-3 py-4 flex flex-col items-center justify-center">
                            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
                              Nights
                            </p>
                            <p className="text-3xl font-bold" style={{ color: GOLD }}>
                              {opt.nights}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-3 py-4">
                            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1.5">
                              Check-out
                            </p>
                            <p className="font-semibold text-sm" style={{ color: NAVY }}>
                              {formatDate(opt.checkOut)}
                            </p>
                          </div>
                        </div>

                        {/* Room chips */}
                        <div className="flex flex-wrap gap-2">
                          {opt.roomType && <Chip>{opt.roomType}</Chip>}
                          <Chip>
                            {opt.rooms} room{opt.rooms > 1 ? 's' : ''}
                          </Chip>
                          <Chip>
                            {opt.adults} adult{opt.adults > 1 ? 's' : ''}
                          </Chip>
                          {opt.breakfastIncluded && <Chip>Breakfast included</Chip>}
                          {opt.isRefundable ? (
                            <Chip>Refundable</Chip>
                          ) : (
                            <ChipAlert>Non-refundable</ChipAlert>
                          )}
                        </div>

                        {opt.description && (
                          <p className="text-sm text-gray-500 leading-relaxed">
                            {opt.description}
                          </p>
                        )}

                        {opt.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {opt.amenities.map((a) => (
                              <span
                                key={a}
                                className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {opt.clientNote && (
                        <div className="px-6 py-3 border-t border-gray-100 text-sm text-gray-500 italic">
                          Note: {opt.clientNote}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* ── Additional Services ────────────────────────────────────────── */}
        {visibleItems.length > 0 && (
          <section>
            <SectionHeading>📋 Additional Services</SectionHeading>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100" style={{ backgroundColor: '#fafafa' }}>
                      <th className="text-left px-6 py-3 text-gray-400 uppercase text-xs tracking-widest font-semibold">
                        Service
                      </th>
                      <th className="text-left px-6 py-3 text-gray-400 uppercase text-xs tracking-widest font-semibold hidden sm:table-cell">
                        Type
                      </th>
                      <th className="text-right px-6 py-3 text-gray-400 uppercase text-xs tracking-widest font-semibold">
                        Price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...visibleItems]
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((item, idx, arr) => (
                        <tr
                          key={item.id}
                          className={idx < arr.length - 1 ? 'border-b border-gray-50' : ''}
                        >
                          <td className="px-6 py-4">
                            <p className="font-medium" style={{ color: NAVY }}>
                              {item.title}
                            </p>
                            {item.clientNote && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {item.clientNote}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <TypeBadge type={item.type} />
                          </td>
                          <td className="px-6 py-4 text-right font-semibold" style={{ color: NAVY }}>
                            {formatMoney(item.sellingPriceMinor, item.currency)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Price Summary ──────────────────────────────────────────────── */}
        <section>
          <SectionHeading>💷 Price Summary</SectionHeading>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {selectedFlight && (
                <SummaryLine
                  label={`Flights — ${selectedFlight.label}`}
                  amount={selectedFlight.sellingPriceMinor}
                  currency={selectedFlight.currency}
                />
              )}
              {selectedHotel && (
                <SummaryLine
                  label={`Hotel — ${selectedHotel.hotelName}`}
                  amount={selectedHotel.sellingPriceMinor}
                  currency={selectedHotel.currency}
                />
              )}
              {visibleItems.map((item) => (
                <SummaryLine
                  key={item.id}
                  label={item.title}
                  amount={item.sellingPriceMinor}
                  currency={item.currency}
                />
              ))}

              {/* Total row */}
              <div
                className="flex items-center justify-between px-6 py-5"
                style={{ backgroundColor: '#faf8f3' }}
              >
                <p className="font-bold text-base" style={{ color: NAVY }}>
                  Total
                </p>
                <p className="text-2xl font-bold" style={{ color: GOLD }}>
                  {formatMoney(computedTotal, quote.currency)}
                </p>
              </div>

              {/* Deposit row */}
              {quote.depositMinor && (
                <div className="flex items-center justify-between px-6 py-4 bg-blue-50/50">
                  <p className="text-sm text-blue-700">
                    Deposit required
                    {quote.depositPercentage ? ` (${quote.depositPercentage}%)` : ''}
                  </p>
                  <p className="font-semibold text-blue-800">
                    {formatMoney(
                      quote.depositMinor,
                      quote.depositCurrency ?? quote.currency,
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Action Panel ──────────────────────────────────────────────── */}
        {isActionable && (
          <section>
            <SectionHeading>✅ Your Response</SectionHeading>
            <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8 space-y-7">

              {/* Error banner */}
              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  {submitError}
                </div>
              )}

              {/* Accept */}
              <div>
                <h3 className="font-bold text-base mb-1" style={{ color: NAVY }}>
                  Ready to book?
                </h3>
                <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                  Type your full name below to approve this proposal. This acts as your
                  electronic signature and confirms your selections above.
                </p>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={signatureName}
                  onChange={(e) => {
                    setSignatureName(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  style={{ fontFamily: 'inherit' }}
                />
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-semibold py-3 px-8 rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: '#16a34a' }}
                >
                  {submitting && actionPanel === 'idle' ? (
                    <>
                      <span
                        className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
                      />
                      Submitting…
                    </>
                  ) : (
                    '✓ Accept & Approve Proposal'
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">or</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Decline / Changes toggle buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => togglePanel('declining')}
                  className="flex-1 border text-sm font-medium py-2.5 px-5 rounded-xl transition-colors"
                  style={{
                    borderColor: actionPanel === 'declining' ? '#fca5a5' : '#e5e7eb',
                    color: actionPanel === 'declining' ? '#dc2626' : '#6b7280',
                    backgroundColor: actionPanel === 'declining' ? '#fef2f2' : 'transparent',
                  }}
                >
                  Decline This Proposal
                </button>
                <button
                  type="button"
                  onClick={() => togglePanel('changes')}
                  className="flex-1 border text-sm font-medium py-2.5 px-5 rounded-xl transition-colors"
                  style={{
                    borderColor: actionPanel === 'changes' ? '#93c5fd' : '#e5e7eb',
                    color: actionPanel === 'changes' ? '#2563eb' : '#6b7280',
                    backgroundColor: actionPanel === 'changes' ? '#eff6ff' : 'transparent',
                  }}
                >
                  Request Changes
                </button>
              </div>

              {/* Decline form */}
              {actionPanel === 'declining' && (
                <div className="border border-red-100 rounded-xl p-5 bg-red-50/20 space-y-3">
                  <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>
                    Reason for declining
                  </p>
                  <textarea
                    rows={3}
                    placeholder="Please let us know why you're declining — we'd love to understand and improve…"
                    value={declineReason}
                    onChange={(e) => {
                      setDeclineReason(e.target.value);
                      if (submitError) setSubmitError(null);
                    }}
                    className="w-full border border-red-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
                    style={{ fontFamily: 'inherit' }}
                  />
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 text-white text-sm font-semibold py-2.5 px-6 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: '#dc2626' }}
                  >
                    {submitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      'Submit Decline'
                    )}
                  </button>
                </div>
              )}

              {/* Changes form */}
              {actionPanel === 'changes' && (
                <div className="border border-blue-100 rounded-xl p-5 bg-blue-50/20 space-y-3">
                  <p className="text-sm font-semibold text-blue-700">
                    What would you like changed?
                  </p>
                  <textarea
                    rows={4}
                    placeholder="e.g. Can we have the hotel closer to JBR? Or could we fly a day later?"
                    value={changesNote}
                    onChange={(e) => {
                      setChangesNote(e.target.value);
                      if (submitError) setSubmitError(null);
                    }}
                    className="w-full border border-blue-200 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
                    style={{ fontFamily: 'inherit' }}
                  />
                  <button
                    type="button"
                    onClick={handleChanges}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 text-white text-sm font-semibold py-2.5 px-6 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: '#2563eb' }}
                  >
                    {submitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Sending…
                      </>
                    ) : (
                      'Send Change Request'
                    )}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <PageFooter clientName={quote.clientName} />
    </div>
  );
}
