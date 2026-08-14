/**
 * Orbit — Buffer publishing adapter (server-side only).
 *
 * Credentials stored in OrbitIntegration where id = 'buffer':
 *   meta.accessToken   — Buffer personal access token (publish.buffer.com → Settings → API)
 *   meta.channels      — { instagram, facebook, linkedin, twitter } channel IDs
 *
 * API: Buffer v1 REST (https://api.bufferapp.com/1)
 */

const BUFFER_API = 'https://api.bufferapp.com/1'

export interface BufferCredentials {
  accessToken: string
  channels: Partial<Record<string, string>>
}

export interface PublishPostOptions {
  channelId: string
  text: string
  mediaUrls?: string[]
  postNow?: boolean
}

export interface BufferPublishResult {
  bufferUpdateId: string
}

export async function publishToBuffer(
  creds: BufferCredentials,
  opts: PublishPostOptions,
): Promise<BufferPublishResult> {
  const params = new URLSearchParams()
  params.append('profile_ids[]', opts.channelId)
  params.append('text', opts.text)
  params.append('now', opts.postNow !== false ? 'true' : 'false')

  if (opts.mediaUrls?.[0]) {
    params.append('media[photo]', opts.mediaUrls[0])
  }

  const res = await fetch(`${BUFFER_API}/updates/create.json`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Buffer API ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json() as { id?: string; success?: boolean; message?: string }

  if (!data.id) {
    throw new Error(data.message ?? 'Buffer returned no update ID')
  }

  return { bufferUpdateId: data.id }
}

export function isBufferConfigured(meta: Record<string, unknown>): boolean {
  return typeof meta.accessToken === 'string' && (meta.accessToken as string).length > 10
}
