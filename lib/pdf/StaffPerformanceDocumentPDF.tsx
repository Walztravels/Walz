import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { WALZ_LOGO_BASE64 } from '@/lib/assets/walz-logo-base64'
import { warningTypeHeading, type WarningType } from '@/lib/performance/template'

const NAVY = '#0B1F3A'
const GOLD = '#C9A84C'
const GREY = '#6b7280'
const WHITE = '#ffffff'

const s = StyleSheet.create({
  page: { backgroundColor: WHITE, fontFamily: 'Helvetica', fontSize: 9.5, color: '#1f2937', padding: 40, paddingBottom: 70 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logo: { width: 40, height: 40 },
  confidential: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#b91c1c', letterSpacing: 1 },
  titleBlock: { marginBottom: 16, borderBottomWidth: 2, borderBottomColor: GOLD, paddingBottom: 12 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY },
  subtitle: { fontSize: 10, color: GOLD, marginTop: 2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 10 },
  metaBox: { width: '30%', marginBottom: 8 },
  metaLabel: { fontSize: 7, color: GREY, marginBottom: 2, textTransform: 'uppercase' },
  metaValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  para: { marginBottom: 10, lineHeight: 1.5 },
  sectionHeader: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 14, marginBottom: 6 },
  ackBox: { marginTop: 24, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4, padding: 12 },
  ackText: { fontSize: 8.5, color: '#374151', marginBottom: 6 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerTxt: { fontSize: 7, color: GREY },
})

export interface StaffPerformanceDocumentPDFProps {
  warningType: WarningType
  employeeName: string
  jobTitle: string
  department: string
  issuedDate: string // pre-formatted display date
  reviewDate: string
  issuedByName: string
  paragraphs: string[]
  acknowledgement?: {
    acknowledgedAt: string | null
    acknowledgementText: string
  }
  /** false for a DRAFT preview — adds a watermark-style label. */
  isIssued: boolean
}

export function StaffPerformanceDocumentPDF(props: StaffPerformanceDocumentPDFProps) {
  const heading = warningTypeHeading(props.warningType)
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <Image src={WALZ_LOGO_BASE64} style={s.logo} />
          <Text style={s.confidential}>CONFIDENTIAL{props.isIssued ? '' : ' — DRAFT, NOT YET ISSUED'}</Text>
        </View>

        <View style={s.titleBlock}>
          <Text style={s.title}>{heading.title}</Text>
          <Text style={s.subtitle}>{heading.subtitle}</Text>
        </View>

        <View style={s.metaGrid}>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Date</Text>
            <Text style={s.metaValue}>{props.issuedDate}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Employee</Text>
            <Text style={s.metaValue}>{props.employeeName}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Role</Text>
            <Text style={s.metaValue}>{props.jobTitle}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Department</Text>
            <Text style={s.metaValue}>{props.department}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Review Date</Text>
            <Text style={s.metaValue}>{props.reviewDate}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Issued By</Text>
            <Text style={s.metaValue}>{props.issuedByName}</Text>
          </View>
        </View>

        {props.paragraphs.map((p, i) => (
          <Text key={i} style={s.para}>
            {p}
          </Text>
        ))}

        <View style={s.ackBox}>
          <Text style={[s.sectionHeader, { marginTop: 0 }]}>Acknowledgement</Text>
          <Text style={s.ackText}>
            {props.acknowledgement?.acknowledgementText ??
              'I acknowledge that I have received and reviewed this notice.'}
          </Text>
          <Text style={s.ackText}>
            Status:{' '}
            {props.acknowledgement?.acknowledgedAt
              ? `Acknowledged on ${props.acknowledgement.acknowledgedAt}`
              : 'Not yet acknowledged'}
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>Walz Travels — Confidential HR Document</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
