export const NGN_BANK_CODES: Record<string, string> = {
  'access bank': '044',
  'access':      '044',
  'gtbank':      '058',
  'gtb':         '058',
  'guaranty trust': '058',
  'zenith bank': '057',
  'zenith':      '057',
  'first bank':  '011',
  'firstbank':   '011',
  'uba':         '033',
  'united bank': '033',
  'stanbic ibtc': '221',
  'stanbic':     '221',
  'sterling bank': '232',
  'sterling':    '232',
  'wema bank':   '035',
  'wema':        '035',
  'polaris bank': '076',
  'polaris':     '076',
  'keystone bank': '082',
  'keystone':    '082',
  'union bank':  '032',
  'fidelity bank': '070',
  'fidelity':    '070',
  'ecobank':     '050',
  'fcmb':        '214',
  'heritage bank': '030',
  'heritage':    '030',
  'opay':        '999992',
  'kuda':        '090267',
  'kuda bank':   '090267',
  'palmpay':     '999991',
  'moniepoint':  '090405',
  'vfd':         '090110',
  'carbon':      '565',
  'rubies':      '090175',
  'providus':    '101',
  'mtn':         '120001',
  'mtn momo':    '120001',
  'airtel':      '120002',
  'glo':         '120003',
}

export const GHS_MOBILE_NETWORKS: Record<string, string> = {
  'mtn':      'MTN',
  'vodafone': 'VOD',
  'airtel':   'ATL',
  'tigo':     'TGO',
}

export const GHS_BANK_CODES: Record<string, string> = {
  'ecobank': 'ECO',
  'gcb':     'GCB',
  'fidelity': 'FBL',
  'absa':    'ABSA',
  'cal bank': 'CAL',
  'stanbic': 'SBG',
  'zenith':  'ZBL',
  'uba':     'UBA',
}

export function getNGNBankCode(bankName: string): string {
  const lower = (bankName || '').toLowerCase()
  for (const [key, code] of Object.entries(NGN_BANK_CODES)) {
    if (lower.includes(key)) return code
  }
  return ''
}

export function getGHSNetwork(bankName: string): { isMobile: boolean; code: string } {
  const lower = (bankName || '').toLowerCase()
  for (const [key, code] of Object.entries(GHS_MOBILE_NETWORKS)) {
    if (lower.includes(key)) return { isMobile: true, code }
  }
  for (const [key, code] of Object.entries(GHS_BANK_CODES)) {
    if (lower.includes(key)) return { isMobile: false, code }
  }
  return { isMobile: true, code: 'MTN' }
}

export function getFLWKey(): string {
  const key = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || ''
  if (!key) throw new Error('Flutterwave secret key not found. Set FLW_SECRET_KEY in Vercel env vars.')
  return key
}
