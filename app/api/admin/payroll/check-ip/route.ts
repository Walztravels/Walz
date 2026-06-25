import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const [res1, res2] = await Promise.all([
      fetch('https://api.ipify.org?format=json'),
      fetch('https://api4.my-ip.io/ip.json'),
    ])
    const ip1 = await res1.json()
    const ip2 = await res2.json()

    return NextResponse.json({
      vercelOutboundIp: ip1.ip || ip2.ip,
      ipify:   ip1.ip,
      myip:    ip2.ip,
      message: 'Add this IP to Flutterwave whitelist',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
