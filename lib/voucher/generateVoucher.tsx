import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#F5F0E8',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#C9A84C',
  },
  logo: { width: 120, height: 40, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  confirmed: { fontSize: 10, color: '#22c55e', fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  ref: { fontSize: 22, color: '#C9A84C', fontFamily: 'Helvetica-Bold', marginTop: 4 },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 10, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 12 },
  itemTitle: { fontSize: 16, color: '#0B1F3A', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  itemType: { fontSize: 10, color: '#C9A84C', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  label: { fontSize: 10, color: '#6b7280' },
  value: { fontSize: 10, color: '#0B1F3A', fontFamily: 'Helvetica-Bold' },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B1F3A',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  totalLabel: { fontSize: 12, color: '#ffffff' },
  totalAmount: { fontSize: 24, color: '#C9A84C', fontFamily: 'Helvetica-Bold' },
  footer: {
    marginTop: 'auto',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 9, color: '#9ca3af' },
  important: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  importantText: { fontSize: 10, color: '#92400e' },
})

export interface VoucherItem {
  id:       string
  type:     string
  title:    string
  price:    number
  currency: string
  quantity: number
  meta:     Record<string, string>
}

export interface VoucherData {
  bookingReference: string
  customerName:     string
  customerEmail:    string
  items:            VoucherItem[]
  total:            number
  currency:         string
  createdAt:        string
}

function VoucherDocument({ data }: { data: VoucherData }) {
  const bookingDate = new Date(data.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src="https://www.walztravels.com/walz-logo.png" style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.confirmed}>BOOKING CONFIRMED</Text>
            <Text style={styles.ref}>{data.bookingReference}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
          <Text style={styles.itemTitle}>{data.customerName}</Text>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>{data.customerEmail}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Booking Date</Text>
            <Text style={styles.value}>{bookingDate}</Text>
          </View>
        </View>

        {data.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BOOKING DETAILS</Text>
            {data.items.map((item, i) => (
              <View
                key={item.id}
                style={{
                  marginBottom:      i < data.items.length - 1 ? 16 : 0,
                  paddingBottom:     i < data.items.length - 1 ? 16 : 0,
                  borderBottomWidth: i < data.items.length - 1 ? 1  : 0,
                  borderBottomColor: '#f3f4f6',
                }}
              >
                <Text style={styles.itemType}>{item.type}</Text>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.meta?.date     && <View style={styles.row}><Text style={styles.label}>Date</Text><Text style={styles.value}>{item.meta.date}</Text></View>}
                {item.meta?.location && <View style={styles.row}><Text style={styles.label}>Location</Text><Text style={styles.value}>{item.meta.location}</Text></View>}
                {item.meta?.duration && <View style={styles.row}><Text style={styles.label}>Duration</Text><Text style={styles.value}>{item.meta.duration}</Text></View>}
                {item.meta?.adults   && <View style={styles.row}><Text style={styles.label}>Guests</Text><Text style={styles.value}>{item.meta.adults} Adults</Text></View>}
                {item.meta?.from     && <View style={styles.row}><Text style={styles.label}>From</Text><Text style={styles.value}>{item.meta.from}</Text></View>}
                {item.meta?.to       && <View style={styles.row}><Text style={styles.label}>To</Text><Text style={styles.value}>{item.meta.to}</Text></View>}
                {item.price > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Price</Text>
                    <Text style={styles.value}>{item.currency} {(item.price * item.quantity).toFixed(2)}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total Paid</Text>
          <Text style={styles.totalAmount}>{data.currency} {data.total.toFixed(2)}</Text>
        </View>

        <View style={styles.important}>
          <Text style={styles.importantText}>
            Please present this voucher (digital or printed) at the point of service.
            For assistance: WhatsApp +44 7398 753797 or email contact@walztravels.com
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Walz Travels LLC</Text>
          <Text style={styles.footerText}>walztravels.com</Text>
          <Text style={styles.footerText}>Ref: {data.bookingReference}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function generateVoucherPDF(data: VoucherData): Promise<Buffer> {
  const element = React.createElement(VoucherDocument, { data })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (pdf as any)(element).toBuffer()

  if (Buffer.isBuffer(result)) return result

  // v4 may return a Web ReadableStream in some environments — consume it
  if (result && typeof (result as ReadableStream).getReader === 'function') {
    const reader = (result as ReadableStream<Uint8Array>).getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    return Buffer.concat(chunks)
  }

  // Blob fallback
  if (result && typeof (result as Blob).arrayBuffer === 'function') {
    return Buffer.from(await (result as Blob).arrayBuffer())
  }

  throw new Error('generateVoucherPDF: unexpected result type from pdf().toBuffer()')
}
