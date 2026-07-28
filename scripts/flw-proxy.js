#!/usr/bin/env node
// Flutterwave transfer proxy — copy this file to your Oracle Cloud free VM.
// The VM has a static IP you whitelist in Flutterwave.
// Vercel calls this proxy; the proxy calls Flutterwave with the static IP.
//
// Setup on the VM:
//   sudo apt-get install -y nodejs
//   npm install -g pm2
//   PROXY_SECRET=<random> FLW_SECRET_KEY=<your-key> pm2 start flw-proxy.js --name flw-proxy
//   pm2 startup && pm2 save
//
// Open port 3001 in Oracle Cloud console:
//   Networking → Virtual Cloud Networks → your VCN → Security Lists → add Ingress rule TCP 3001
//
// Vercel env vars to add:
//   PAYROLL_PROXY_URL    = http://YOUR_VM_IP:3001
//   PAYROLL_PROXY_SECRET = (same value as PROXY_SECRET above)

const http = require('http')

const PROXY_SECRET = process.env.PROXY_SECRET
const FLW_KEY      = process.env.FLW_SECRET_KEY
const PORT         = Number(process.env.PORT) || 3001

if (!PROXY_SECRET) { console.error('[proxy] PROXY_SECRET env var is required'); process.exit(1) }
if (!FLW_KEY)      { console.error('[proxy] FLW_SECRET_KEY env var is required'); process.exit(1) }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end',  ()    => resolve(data))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (req.method === 'GET' && req.url === '/health') {
    return send(200, { ok: true, ip: req.socket.localAddress })
  }

  if (req.method !== 'POST' || req.url !== '/transfer') {
    return send(404, { error: 'Not found' })
  }

  if (req.headers['x-proxy-secret'] !== PROXY_SECRET) {
    console.warn('[proxy] Unauthorized from', req.socket.remoteAddress)
    return send(401, { error: 'Unauthorized' })
  }

  try {
    const rawBody = await readBody(req)
    const payload = JSON.parse(rawBody)

    console.log('[proxy] Forwarding:', payload.beneficiary_name, payload.currency, payload.amount)

    const flwRes = await fetch('https://api.flutterwave.com/v3/transfers', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${FLW_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await flwRes.json()
    console.log('[proxy] FLW response:', data.status, data.message, 'id:', data.data?.id)
    send(flwRes.status, data)
  } catch (err) {
    console.error('[proxy] Error:', err.message)
    send(500, { error: err.message })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxy] Listening on 0.0.0.0:${PORT}`)
})
