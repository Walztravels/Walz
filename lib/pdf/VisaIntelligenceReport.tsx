import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'

// ── Colour palette ──────────────────────────────────────────────────────────
const NAVY  = '#0B1F3A'
const GOLD  = '#C9A84C'
const CREAM = '#F5F0E8'
const GREEN = '#22c55e'
const AMBER = '#f59e0b'
const RED   = '#ef4444'
const GREY  = '#6b7280'
const LIGHT = '#f9fafb'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1f2937',
    paddingBottom: 40,
  },
  // Cover
  cover: { backgroundColor: NAVY, height: '100%', padding: 50, flexDirection: 'column' },
  coverTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 8 },
  coverSubtitle: { fontSize: 13, color: GOLD, marginBottom: 40 },
  coverDivider: { height: 2, backgroundColor: GOLD, marginBottom: 40, width: 80 },
  coverDetail: { fontSize: 11, color: '#94a3b8', marginBottom: 8 },
  coverDetailBold: { fontSize: 11, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  coverFooter: { position: 'absolute', bottom: 40, left: 50, right: 50, borderTopWidth: 1, borderTopColor: '#1e3a5f', paddingTop: 16 },
  coverFooterText: { fontSize: 8, color: '#475569' },
  // Section headers
  sectionHeader: { backgroundColor: NAVY, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11, padding: '10 16', letterSpacing: 0.5 },
  sectionHeaderGold: { backgroundColor: GOLD, color: NAVY, fontFamily: 'Helvetica-Bold', fontSize: 10, padding: '8 16' },
  // Content
  contentPad: { padding: '12 16', backgroundColor: '#ffffff' },
  // Scores
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: '12 16', backgroundColor: LIGHT },
  scoreCard: { width: '30%', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 10, alignItems: 'center' },
  scoreValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  scoreLabel: { fontSize: 7, color: GREY, textAlign: 'center' },
  // Verdict
  verdictBanner: { flexDirection: 'row', alignItems: 'center', padding: '14 20' },
  verdictTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  verdictSub: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  // Tables
  tableHeader: { flexDirection: 'row', backgroundColor: NAVY, padding: '6 8' },
  tableHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableRowAlt: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fafafa' },
  tableCell: { fontSize: 8, color: '#374151' },
  // Flags
  flagOk:      { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 4, padding: '6 10', marginBottom: 4 },
  flagWarning: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 4, padding: '6 10', marginBottom: 4 },
  flagDanger:  { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 4, padding: '6 10', marginBottom: 4 },
  // Narrative
  narrativeBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4, borderLeftColor: NAVY, padding: '12 14', borderRadius: 4 },
  narrativeText: { fontSize: 9, lineHeight: 1.7, color: '#374151', fontStyle: 'italic' },
  // Improvement plan
  blockerCard: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderLeftWidth: 3, borderLeftColor: RED, borderRadius: 4, padding: '8 10', marginBottom: 6 },
  quickWinCard: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderLeftWidth: 3, borderLeftColor: GREEN, borderRadius: 4, padding: '8 10', marginBottom: 6 },
  // Prediction
  predRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  predLabel: { width: 70, fontSize: 8, color: GREY },
  predBar: { flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4 },
  predFill: { height: 8, borderRadius: 4 },
  predPct: { width: 35, fontSize: 8, color: NAVY, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  // Footer
  pageFooter: { position: 'absolute', bottom: 16, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, curr = ''): string {
  if (n == null || isNaN(n)) return '—'
  const s = Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })
  return curr ? `${curr} ${s}` : s
}

function pct(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '—'
  return `${Math.round(n as number)}%`
}

function scoreCol(s: number): string {
  if (s >= 80) return GREEN
  if (s >= 60) return AMBER
  return RED
}

function verdictColor(v: string): string {
  if (v === 'recommend')   return '#16a34a'
  if (v === 'conditional') return '#d97706'
  return '#dc2626'
}

function verdictLabel(v: string): string {
  if (v === 'recommend')   return '  RECOMMEND FOR VISA APPLICATION'
  if (v === 'conditional') return '  CONDITIONAL — ADDRESS CONCERNS FIRST'
  return '  NOT READY — IMPROVEMENT REQUIRED'
}

function destName(d: string): string {
  const m: Record<string, string> = {
    uk: 'United Kingdom', canada: 'Canada', usa: 'United States of America',
    schengen: 'Schengen / Europe', uae: 'United Arab Emirates',
    australia: 'Australia', nigeria: 'Nigeria', ghana: 'Ghana',
  }
  return m[d?.toLowerCase()] ?? d?.toUpperCase() ?? 'Unknown'
}

function visaType(d: string): string {
  const m: Record<string, string> = {
    uk: 'Standard Visitor Visa (PBS Appendix V)',
    canada: 'Temporary Resident Visa / eTA',
    usa: 'B-1/B-2 Visitor Visa',
    schengen: 'Schengen Short-Stay Visa (Type C)',
    uae: 'UAE Tourist / Visit Visa',
    australia: 'Subclass 600 Visitor Visa',
  }
  return m[d?.toLowerCase()] ?? `${d?.toUpperCase()} Visitor Visa`
}

// ── Page footer ───────────────────────────────────────────────────────────────

function PageFooter({ applicantName, refId }: { applicantName: string; refId: string }) {
  return (
    <View style={styles.pageFooter} fixed>
      <Text style={styles.footerText}>WALZ TRAVELS · CONFIDENTIAL · Ref: {refId}</Text>
      <Text style={styles.footerText}>{applicantName} · Jade Financial Intelligence Report</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
}

// ── Cover page ────────────────────────────────────────────────────────────────

function CoverPage({
  applicantName, destination, passportCountry, date, refId, status, overallScore,
}: {
  applicantName: string; destination: string; passportCountry: string
  date: string; refId: string; status: string; overallScore: number
}) {
  const statusColor = status === 'PASS' ? GREEN : status === 'FLAG' ? RED : AMBER
  const statusLabel = status === 'PASS' ? 'PASS' : status === 'FLAG' ? 'FLAG' : 'REVIEW'

  return (
    <Page size="A4" style={styles.cover}>
      <View style={{ marginBottom: 40 }}>
        <Text style={{ fontSize: 24, color: GOLD, fontFamily: 'Helvetica-Bold', letterSpacing: 2 }}>
          WALZ TRAVELS
        </Text>
        <Text style={{ fontSize: 9, color: '#64748b', letterSpacing: 3 }}>
          JADE FINANCIAL INTELLIGENCE
        </Text>
      </View>

      <View style={styles.coverDivider} />

      <Text style={styles.coverTitle}>Financial Intelligence{'\n'}& Forensic Analysis</Text>
      <Text style={styles.coverSubtitle}>Visa Application Support Report</Text>

      <View style={{ marginBottom: 40 }}>
        {[
          ['Applicant',   applicantName],
          ['Destination', destName(destination)],
          ['Visa Type',   visaType(destination)],
          ['Passport',    passportCountry],
          ['Report Date', date],
          ['Reference',   refId],
        ].map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', marginBottom: 10 }}>
            <Text style={{ ...styles.coverDetail, width: 100 }}>{label}:</Text>
            <Text style={styles.coverDetailBold}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: statusColor, borderRadius: 8, padding: '16 20', marginBottom: 20, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 4 }}>
          {statusLabel}
        </Text>
        <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>
          {overallScore}/100
        </Text>
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>Financial Credibility Score</Text>
      </View>

      <View style={styles.coverFooter}>
        <Text style={styles.coverFooterText}>
          STRICTLY CONFIDENTIAL — This report is produced by Walz Travels Ltd for internal and client use only.
          Contains AI-generated financial intelligence. Not legal advice.
        </Text>
        <Text style={{ ...styles.coverFooterText, marginTop: 4 }}>
          {`© ${new Date().getFullYear()} Walz Travels Ltd · walztravels.com · contact@walztravels.com`}
        </Text>
      </View>
    </Page>
  )
}

// ── Executive Summary page ────────────────────────────────────────────────────

function ExecutiveSummaryPage({
  a, applicantName, destination, refId,
}: {
  a: BankStatementAnalysis; applicantName: string; destination: string; refId: string
}) {
  const s = a.financialCredibilityScore
  return (
    <Page size="A4" style={styles.page}>
      {/* Verdict banner */}
      <View style={{ ...styles.verdictBanner, backgroundColor: verdictColor(a.finalVerdict ?? 'decline') }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.verdictTitle}>{verdictLabel(a.finalVerdict ?? 'decline')}</Text>
          <Text style={styles.verdictSub}>{a.verdictReason}</Text>
        </View>
        <View style={{ alignItems: 'center', marginLeft: 20 }}>
          <Text style={{ fontSize: 32, fontFamily: 'Helvetica-Bold', color: '#ffffff' }}>{s?.overall ?? 0}</Text>
          <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)' }}>Overall Score</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>EXECUTIVE SUMMARY</Text>
      <View style={{ padding: '12 16 8', backgroundColor: '#ffffff' }}>
        <Text style={{ fontSize: 9, lineHeight: 1.7, color: '#374151' }}>{a.summary}</Text>
      </View>

      <Text style={styles.sectionHeaderGold}>FINANCIAL CREDIBILITY SCORECARD</Text>
      <View style={styles.scoreGrid}>
        {[
          { label: 'Income\nStability',        score: s?.incomeStability ?? 0 },
          { label: 'Source of\nFunds',          score: s?.sourceOfFunds ?? 0 },
          { label: 'Balance\nSustainability',   score: s?.balanceSustainability ?? 0 },
          { label: 'Transaction\nAuthenticity', score: s?.transactionAuthenticity ?? 0 },
          { label: 'Travel\nAffordability',     score: s?.travelAffordability ?? 0 },
          { label: 'Immigration\nRisk Score',   score: s?.immigrationRisk ?? 0 },
        ].map(({ label, score }) => (
          <View key={label} style={styles.scoreCard}>
            <Text style={{ ...styles.scoreValue, color: scoreCol(score) }}>{score}</Text>
            <Text style={{ fontSize: 7, color: GREY, marginBottom: 2 }}>/100</Text>
            <Text style={styles.scoreLabel}>{label}</Text>
            <View style={{ width: '100%', height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, marginTop: 5 }}>
              <View style={{ width: `${score}%`, height: 4, backgroundColor: scoreCol(score), borderRadius: 2 }} />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionHeader}>KEY FINANCIAL INDICATORS</Text>
      <View style={{ padding: '10 16', backgroundColor: '#ffffff' }}>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <View style={{ flex: 1 }}>
            {[
              ['Statement Period',     a.statementPeriod ?? '—'],
              ['Currency',             a.currency ?? '—'],
              ['Months Analysed',      String(a.monthsAnalyzed ?? '—')],
              ['Avg Monthly Balance',  fmt(a.averageMonthlyBalance, a.currency)],
              ['Closing Balance',      fmt(a.closingBalance, a.currency)],
              ['Lowest Balance',       fmt(a.lowestBalance, a.currency)],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 5 }}>
                <Text style={{ width: 140, fontSize: 8, color: GREY }}>{k}</Text>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY }}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            {[
              ['Total Credits',       fmt(a.totalCredits, a.currency)],
              ['Total Debits',        fmt(a.totalDebits, a.currency)],
              ['Savings Rate',        pct(a.savingsRate ?? 0)],
              ['Est. Monthly Income', fmt(a.estimatedMonthlyIncome, a.currency)],
              ['Overdrafts',          a.overdraftsDetected ? `Yes (${a.overdraftCount})` : 'None detected'],
              ['Embassy Threshold',   a.embassyThresholdMet ? 'MET' : 'NOT MET'],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 5 }}>
                <Text style={{ width: 140, fontSize: 8, color: GREY }}>{k}</Text>
                <Text style={{
                  fontSize: 8, fontFamily: 'Helvetica-Bold',
                  color: k === 'Embassy Threshold' ? (a.embassyThresholdMet ? GREEN : RED)
                    : k === 'Overdrafts' && a.overdraftsDetected ? RED : NAVY,
                }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {a.approvalProbability && (
        <>
          <Text style={styles.sectionHeader}>APPROVAL PROBABILITY ASSESSMENT</Text>
          <View style={{ padding: '12 16', backgroundColor: '#ffffff' }}>
            {([
              ['Financial Evidence',          a.approvalProbability.financial],
              ['Source of Funds',             a.approvalProbability.sourceOfFunds],
              ['Transaction Authenticity',    a.approvalProbability.transactionAuthenticity],
              ['Travel Affordability',        a.approvalProbability.travelAffordability],
              ['Overall Approval Probability', a.approvalProbability.overall],
            ] as [string, number][]).map(([label, val], i) => (
              <View key={label} style={styles.predRow}>
                <Text style={{ ...styles.predLabel, fontFamily: i === 4 ? 'Helvetica-Bold' : 'Helvetica' }}>{label}</Text>
                <View style={styles.predBar}>
                  <View style={{ ...styles.predFill, width: `${val}%`, backgroundColor: scoreCol(val) }} />
                </View>
                <Text style={{ ...styles.predPct, color: scoreCol(val) }}>{pct(val)}</Text>
              </View>
            ))}
            <Text style={{ fontSize: 8, color: GREY, marginTop: 8, lineHeight: 1.5 }}>
              {a.approvalProbability.note}
            </Text>
          </View>
        </>
      )}

      <PageFooter applicantName={applicantName} refId={refId} />
    </Page>
  )
}

// ── Forensic Analysis page ────────────────────────────────────────────────────

function ForensicPage({ a, applicantName, refId }: { a: BankStatementAnalysis; applicantName: string; refId: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionHeader}>FORENSIC INVESTIGATION FINDINGS</Text>

      <Text style={styles.sectionHeaderGold}>INCOME ANALYSIS & SALARY VERIFICATION</Text>
      <View style={styles.contentPad}>
        {a.salaryVerification && (
          <View style={{ marginBottom: 10 }}>
            {[
              ['Salary Detected',    a.salaryVerification.detected ? 'Yes' : 'No'],
              ['Employer',           a.salaryVerification.employer ?? '—'],
              ['Monthly Amount',     fmt(a.salaryVerification.monthlyAmount ?? 0, a.currency)],
              ['Consistency Score',  pct(a.salaryVerification.consistencyScore)],
              ['Missing Months',     (a.salaryVerification.missingMonths ?? []).join(', ') || 'None'],
            ].map(([k, v]) => (
              <View key={k as string} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 4 }}>
                <Text style={{ width: 140, fontSize: 8, color: GREY }}>{k as string}</Text>
                <Text style={{ fontSize: 8, color: NAVY }}>{v as string}</Text>
              </View>
            ))}
          </View>
        )}
        {a.incomeForensics && (
          <View style={styles.narrativeBox}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 }}>FORENSIC INCOME ASSESSMENT</Text>
            <Text style={styles.narrativeText}>{a.incomeForensics.conclusion}</Text>
            {a.incomeForensics.inflationDetected && a.incomeForensics.inflationNote && (
              <Text style={{ fontSize: 8, color: RED, marginTop: 6, fontFamily: 'Helvetica-Bold' }}>
                SALARY INFLATION DETECTED: {a.incomeForensics.inflationNote}
              </Text>
            )}
          </View>
        )}
      </View>

      <Text style={styles.sectionHeaderGold}>BALANCE BEHAVIOUR & SUSTAINABILITY</Text>
      <View style={styles.contentPad}>
        {a.balanceForensics && [
          ['Fund Parking Detected',         a.balanceForensics.parkingDetected ? 'YES' : 'No'],
          ['End-of-Statement Boost',        a.balanceForensics.endOfStatementBoostDetected ? 'YES' : 'No'],
          ['Rapid Withdrawal After Salary', a.balanceForensics.rapidWithdrawalAfterSalary ? 'YES' : 'No'],
          ['Balance Trend',                 a.balanceForensics.sustainabilityTrend?.toUpperCase() ?? '—'],
        ].map(([k, v]) => (
          <View key={k as string} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 5 }}>
            <Text style={{ width: 200, fontSize: 8, color: GREY }}>{k as string}</Text>
            <Text style={{
              fontSize: 8, fontFamily: 'Helvetica-Bold',
              color: (v as string) === 'YES' ? RED : NAVY,
            }}>{v as string}</Text>
          </View>
        ))}
        {a.balanceForensics?.sustainabilityNote && (
          <Text style={{ fontSize: 8, color: '#374151', marginTop: 6, lineHeight: 1.5 }}>
            {a.balanceForensics.sustainabilityNote}
          </Text>
        )}
      </View>

      <Text style={styles.sectionHeaderGold}>SPENDING PATTERN & ACCOUNT CHARACTER</Text>
      <View style={styles.contentPad}>
        {a.spendingForensics && (
          <>
            <View style={{
              backgroundColor: a.spendingForensics.accountCharacter === 'genuine' ? '#f0fdf4' : a.spendingForensics.accountCharacter === 'uncertain' ? '#fffbeb' : '#fef2f2',
              borderWidth: 1, borderColor: a.spendingForensics.accountCharacter === 'genuine' ? '#bbf7d0' : a.spendingForensics.accountCharacter === 'uncertain' ? '#fde68a' : '#fecaca',
              borderRadius: 4, padding: '8 12', marginBottom: 8,
            }}>
              <Text style={{
                fontSize: 9, fontFamily: 'Helvetica-Bold',
                color: a.spendingForensics.accountCharacter === 'genuine' ? '#15803d' : a.spendingForensics.accountCharacter === 'uncertain' ? '#92400e' : '#991b1b',
              }}>
                Account Character: {(a.spendingForensics.accountCharacter ?? '').toUpperCase()}
              </Text>
              <Text style={{ fontSize: 8, color: '#374151', marginTop: 4, lineHeight: 1.5 }}>
                {a.spendingForensics.characterConclusion}
              </Text>
            </View>
            {a.spendingForensics.circularTransfersDetected && (
              <Text style={{ fontSize: 8, color: RED, fontFamily: 'Helvetica-Bold' }}>
                Circular transfers detected: {a.spendingForensics.circularTransferNote}
              </Text>
            )}
          </>
        )}
      </View>

      <Text style={styles.sectionHeaderGold}>BEHAVIOURAL ANOMALY DETECTION</Text>
      <View style={styles.contentPad}>
        {(a.behavioralAnomalies ?? []).length > 0 ? (
          a.behavioralAnomalies!.map((anomaly, i) => (
            <View key={i} style={
              anomaly.detected && anomaly.risk === 'high' ? styles.flagDanger :
              anomaly.detected && anomaly.risk === 'medium' ? styles.flagWarning :
              styles.flagOk
            }>
              <Text style={{
                fontSize: 8, fontFamily: 'Helvetica-Bold',
                color: anomaly.detected && anomaly.risk === 'high' ? '#991b1b' : anomaly.detected && anomaly.risk === 'medium' ? '#92400e' : '#15803d',
              }}>
                {anomaly.detected ? (anomaly.risk === 'high' ? 'DETECTED HIGH' : 'DETECTED') : 'CLEAR'}{' '}
                — {(anomaly.type ?? '').replace(/_/g, ' ').toUpperCase()}
              </Text>
              <Text style={{ fontSize: 7.5, color: '#374151', marginTop: 3 }}>{anomaly.detail ?? anomaly.evidence}</Text>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: 8, color: GREEN }}>No behavioural anomalies detected</Text>
        )}
      </View>

      <PageFooter applicantName={applicantName} refId={refId} />
    </Page>
  )
}

// ── Risk, Consensus & Officer Assessment page ─────────────────────────────────

function RiskAndOfficerPage({
  a, applicantName, destination, refId,
}: { a: BankStatementAnalysis; applicantName: string; destination: string; refId: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionHeader}>RISK FLAG ASSESSMENT</Text>
      <View style={styles.contentPad}>
        {(a.riskFlags ?? []).map((flag, i) => (
          <View key={i} style={flag.status === 'ok' ? styles.flagOk : flag.status === 'warning' ? styles.flagWarning : styles.flagDanger}>
            <Text style={{
              fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3,
              color: flag.status === 'ok' ? '#15803d' : flag.status === 'warning' ? '#92400e' : '#991b1b',
            }}>
              {flag.status === 'ok' ? 'OK' : flag.status === 'warning' ? 'WARNING' : 'DANGER'} — {flag.category}
            </Text>
            <Text style={{ fontSize: 8, color: '#374151' }}>{flag.detail}</Text>
          </View>
        ))}
        {(a.riskFlags ?? []).length === 0 && (
          <Text style={{ fontSize: 8, color: GREEN }}>No risk flags identified</Text>
        )}
      </View>

      {a.multiAgentConsensus && (
        <>
          <Text style={styles.sectionHeader}>MULTI-AGENT AI CONSENSUS</Text>
          <View style={styles.contentPad}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1, borderWidth: 2, borderColor: NAVY, borderRadius: 6, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 }}>{a.multiAgentConsensus.primaryAgent}</Text>
                <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: verdictColor(a.multiAgentConsensus.primaryVerdict) }}>{a.multiAgentConsensus.primaryScore}</Text>
                <Text style={{ fontSize: 8, color: verdictColor(a.multiAgentConsensus.primaryVerdict), fontFamily: 'Helvetica-Bold' }}>
                  {a.multiAgentConsensus.primaryVerdict.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, borderWidth: 2, borderColor: '#10a37f', borderRadius: 6, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#10a37f', marginBottom: 4 }}>{a.multiAgentConsensus.secondaryAgent}</Text>
                <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: verdictColor(a.multiAgentConsensus.secondaryVerdict) }}>{a.multiAgentConsensus.secondaryScore}</Text>
                <Text style={{ fontSize: 8, color: verdictColor(a.multiAgentConsensus.secondaryVerdict), fontFamily: 'Helvetica-Bold' }}>
                  {a.multiAgentConsensus.secondaryVerdict.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1.2, borderWidth: 2, borderColor: GOLD, borderRadius: 6, padding: 10, alignItems: 'center', backgroundColor: '#fffbeb' }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 4 }}>CONSENSUS VERDICT</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'center' }}>
                  {(a.multiAgentConsensus.consensus ?? '').replace(/_/g, ' ').toUpperCase()}
                </Text>
                <Text style={{ fontSize: 7, color: '#92400e', marginTop: 4, textAlign: 'center' }}>
                  {a.multiAgentConsensus.agreementLevel?.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 8, color: GREY, lineHeight: 1.5 }}>{a.multiAgentConsensus.consensusNote}</Text>
          </View>
        </>
      )}

      <Text style={styles.sectionHeader}>{`EMBASSY ASSESSMENT — ${destName(destination).toUpperCase()}`}</Text>
      {(a.embassyAssessments ?? []).map((ea, i) => (
        <View key={i} style={styles.contentPad}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              {[
                ['Required Balance',  `${fmt(ea.requiredAmount)} ${ea.currency}`],
                ['Applicant Balance', `${fmt(ea.applicantEquivalent)} ${ea.currency}`],
                ['Threshold Met',     ea.met ? 'YES' : 'NO'],
                ['Confidence',        pct(ea.confidence)],
              ].map(([k, v]) => (
                <View key={k as string} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                  <Text style={{ width: 130, fontSize: 8, color: GREY }}>{k as string}</Text>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: k === 'Threshold Met' ? (ea.met ? GREEN : RED) : NAVY }}>
                    {v as string}
                  </Text>
                </View>
              ))}
            </View>
            {(ea.concerns ?? []).length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 4 }}>Concerns:</Text>
                {ea.concerns.map((c, ci) => (
                  <Text key={ci} style={{ fontSize: 7.5, color: '#374151', marginBottom: 3 }}>{c}</Text>
                ))}
              </View>
            )}
          </View>
          {ea.recommendation && (
            <View style={{ backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: NAVY, padding: '8 12', marginTop: 8, borderRadius: 3 }}>
              <Text style={{ fontSize: 8, color: '#374151' }}>{ea.recommendation}</Text>
            </View>
          )}
        </View>
      ))}

      {a.officerSimulation && (
        <>
          <Text style={styles.sectionHeader}>IMMIGRATION OFFICER SIMULATION</Text>
          <View style={styles.contentPad}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
              {(a.officerSimulation.reasonsToApprove ?? []).length > 0 && (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREEN, marginBottom: 5 }}>REASONS TO APPROVE:</Text>
                  {(a.officerSimulation.reasonsToApprove ?? []).map((r, i) => (
                    <Text key={i} style={{ fontSize: 7.5, color: '#374151', marginBottom: 3, lineHeight: 1.4 }}>{r}</Text>
                  ))}
                </View>
              )}
              {(a.officerSimulation.reasonsForConcern ?? []).length > 0 && (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 5 }}>CONCERNS RAISED:</Text>
                  {a.officerSimulation.reasonsForConcern.map((r, i) => (
                    <Text key={i} style={{ fontSize: 7.5, color: '#374151', marginBottom: 3, lineHeight: 1.4 }}>{r}</Text>
                  ))}
                </View>
              )}
            </View>
            {a.officerSimulation.officerConclusion && (
              <View style={{
                backgroundColor: a.officerSimulation.approvalRecommendation === 'approve' ? '#f0fdf4' : a.officerSimulation.approvalRecommendation === 'refuse' ? '#fef2f2' : '#fffbeb',
                borderWidth: 1, borderColor: a.officerSimulation.approvalRecommendation === 'approve' ? '#bbf7d0' : a.officerSimulation.approvalRecommendation === 'refuse' ? '#fecaca' : '#fde68a',
                borderRadius: 4, padding: '8 12',
              }}>
                <Text style={{
                  fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3,
                  color: a.officerSimulation.approvalRecommendation === 'approve' ? '#15803d' : a.officerSimulation.approvalRecommendation === 'refuse' ? '#991b1b' : '#92400e',
                }}>
                  Officer Recommendation: {(a.officerSimulation.approvalRecommendation ?? '').replace(/_/g, ' ').toUpperCase()}
                </Text>
                <Text style={{ fontSize: 8, color: '#374151' }}>{a.officerSimulation.officerConclusion}</Text>
              </View>
            )}
          </View>
        </>
      )}

      <PageFooter applicantName={applicantName} refId={refId} />
    </Page>
  )
}

// ── Monthly Breakdown & Source of Funds page ──────────────────────────────────

function DataTablesPage({ a, applicantName, refId }: { a: BankStatementAnalysis; applicantName: string; refId: string }) {
  return (
    <Page size="A4" style={styles.page}>
      {a.embassyOfficerNarrative && (
        <>
          <Text style={styles.sectionHeader}>FORMAL EMBASSY OFFICER NARRATIVE</Text>
          <View style={{ ...styles.contentPad, backgroundColor: '#f8fafc' }}>
            <View style={styles.narrativeBox}>
              <Text style={styles.narrativeText}>{a.embassyOfficerNarrative ?? a.aiNarrative ?? 'Officer narrative unavailable.'}</Text>
            </View>
          </View>
        </>
      )}

      {(a.monthlyBreakdown ?? []).length > 0 && (
        <>
          <Text style={styles.sectionHeader}>MONTHLY FINANCIAL BREAKDOWN</Text>
          <View style={styles.tableHeader}>
            {['Month', 'Opening', 'Credits', 'Debits', 'Net Flow', 'Closing'].map(h => (
              <Text key={h} style={{ ...styles.tableHeaderCell, flex: 1, textAlign: h === 'Month' ? 'left' : 'right' }}>{h}</Text>
            ))}
          </View>
          {(a.monthlyBreakdown ?? []).map((m, i) => {
            const net = m.netFlow ?? (m.totalCredits - m.totalDebits)
            return (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <Text style={{ ...styles.tableCell, flex: 1 }}>{m.month}</Text>
                <Text style={{ ...styles.tableCell, flex: 1, textAlign: 'right' }}>{fmt(m.openingBalance)}</Text>
                <Text style={{ ...styles.tableCell, flex: 1, textAlign: 'right', color: GREEN }}>{fmt(m.totalCredits)}</Text>
                <Text style={{ ...styles.tableCell, flex: 1, textAlign: 'right', color: RED }}>{fmt(m.totalDebits)}</Text>
                <Text style={{ ...styles.tableCell, flex: 1, textAlign: 'right', color: net >= 0 ? GREEN : RED, fontFamily: 'Helvetica-Bold' }}>
                  {net >= 0 ? '+' : ''}{fmt(net)}
                </Text>
                <Text style={{ ...styles.tableCell, flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: NAVY }}>{fmt(m.closingBalance)}</Text>
              </View>
            )
          })}
        </>
      )}

      {(a.sourceOfFunds ?? []).length > 0 && (
        <>
          <Text style={{ ...styles.sectionHeader, marginTop: 12 }}>SOURCE OF FUNDS CLASSIFICATION</Text>
          <View style={styles.tableHeader}>
            {['Source', 'Amount', 'Share', 'Risk', 'Note'].map(h => (
              <Text key={h} style={{ ...styles.tableHeaderCell, flex: h === 'Source' || h === 'Note' ? 2 : 1 }}>{h}</Text>
            ))}
          </View>
          {(a.sourceOfFunds ?? []).map((sf, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tableCell, flex: 2 }}>{sf.source}</Text>
              <Text style={{ ...styles.tableCell, flex: 1 }}>{fmt(sf.amount)}</Text>
              <Text style={{ ...styles.tableCell, flex: 1 }}>{pct(sf.percentage)}</Text>
              <Text style={{ ...styles.tableCell, flex: 1, color: sf.risk === 'low' ? GREEN : sf.risk === 'medium' ? AMBER : RED, fontFamily: 'Helvetica-Bold' }}>
                {sf.risk?.toUpperCase()}
              </Text>
              <Text style={{ ...styles.tableCell, flex: 2 }}>{sf.note}</Text>
            </View>
          ))}
        </>
      )}

      <PageFooter applicantName={applicantName} refId={refId} />
    </Page>
  )
}

// ── Action Plan page ──────────────────────────────────────────────────────────

function ActionPlanPage({ a, applicantName, refId }: { a: BankStatementAnalysis; applicantName: string; refId: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionHeader}>WALZ TRAVELS ACTION PLAN & RECOMMENDATIONS</Text>

      <View style={{ padding: '12 16', backgroundColor: CREAM }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 6 }}>Dear {applicantName},</Text>
        <Text style={{ fontSize: 9, lineHeight: 1.7, color: '#374151' }}>{a.summary}</Text>
      </View>

      {(a.recommendations ?? []).length > 0 && (
        <>
          <Text style={styles.sectionHeaderGold}>OUR RECOMMENDATIONS</Text>
          <View style={styles.contentPad}>
            {(a.recommendations ?? []).map((rec, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' }}>
                <View style={{ width: 20, height: 20, backgroundColor: NAVY, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 }}>
                  <Text style={{ fontSize: 8, color: '#ffffff', fontFamily: 'Helvetica-Bold' }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: 8.5, color: '#374151', lineHeight: 1.6, flex: 1 }}>{rec}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {(a.warnings ?? []).length > 0 && (
        <>
          <Text style={styles.sectionHeaderGold}>IMPORTANT WARNINGS</Text>
          <View style={styles.contentPad}>
            {a.warnings!.map((w, i) => (
              <View key={i} style={{ ...styles.flagWarning, marginBottom: 6 }}>
                <Text style={{ fontSize: 8, color: '#92400e' }}>{w}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.sectionHeaderGold}>NEXT STEPS WITH WALZ TRAVELS</Text>
      <View style={styles.contentPad}>
        {[
          'Share this report with your Walz Travels visa consultant.',
          'Your consultant will review the findings and prepare your application pack.',
          'Any additional documents flagged will be requested with specific guidance.',
          'Once ready, Walz Travels handles submission, tracking, and embassy liaison.',
          'You will receive updates at every stage via WhatsApp and email.',
        ].map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', marginBottom: 7, alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 9, color: GOLD, fontFamily: 'Helvetica-Bold', marginRight: 8 }}>{i + 1}.</Text>
            <Text style={{ fontSize: 8.5, color: '#374151', flex: 1, lineHeight: 1.5 }}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: NAVY, borderRadius: 8, padding: '14 18', marginHorizontal: 16 }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: GOLD, marginBottom: 8 }}>Contact Your Walz Travels Team</Text>
        {[
          ['WhatsApp UK',  '+44 7398 753797'],
          ['WhatsApp US',  '+1 984 388 0110'],
          ['Email',        'contact@walztravels.com'],
          ['Website',      'www.walztravels.com'],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', marginBottom: 5 }}>
            <Text style={{ fontSize: 8.5, color: '#94a3b8', width: 90 }}>{k}:</Text>
            <Text style={{ fontSize: 8.5, color: '#ffffff', fontFamily: 'Helvetica-Bold' }}>{v}</Text>
          </View>
        ))}
      </View>

      <PageFooter applicantName={applicantName} refId={refId} />
    </Page>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

export function VisaIntelligenceReport({
  analysis,
  applicantName,
  destination,
  passportCountry,
  refId,
}: {
  analysis:        BankStatementAnalysis
  applicantName:   string
  destination:     string
  passportCountry: string
  refId?:          string
}) {
  const date   = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const ref    = refId ?? `WALZ-VFIP-${Date.now().toString(36).toUpperCase()}`

  return (
    <Document
      title={`Walz Travels Jade Financial Intelligence Report — ${applicantName}`}
      author="Walz Travels Ltd"
      subject={`Jade Financial Intelligence Report — ${destName(destination)}`}
      creator="Walz Travels Jade Financial Intelligence v2.0"
    >
      <CoverPage
        applicantName={applicantName}
        destination={destination}
        passportCountry={passportCountry}
        date={date}
        refId={ref}
        status={analysis.status}
        overallScore={analysis.financialCredibilityScore?.overall ?? 0}
      />
      <ExecutiveSummaryPage a={analysis} applicantName={applicantName} destination={destination} refId={ref} />
      <ForensicPage a={analysis} applicantName={applicantName} refId={ref} />
      <RiskAndOfficerPage a={analysis} applicantName={applicantName} destination={destination} refId={ref} />
      <DataTablesPage a={analysis} applicantName={applicantName} refId={ref} />
      <ActionPlanPage a={analysis} applicantName={applicantName} refId={ref} />
    </Document>
  )
}
