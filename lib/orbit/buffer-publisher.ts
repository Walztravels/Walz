/**
 * Orbit — Buffer publishing adapter (server-side only).
 *
 * Uses Buffer's GraphQL API (the legacy REST API no longer accepts API tokens).
 * GraphQL endpoint: https://api.bufferapp.com/graphql
 *
 * Credentials stored in OrbitIntegration where id = 'buffer':
 *   meta.accessToken   — Buffer personal access token (publish.buffer.com → Settings → API)
 *   meta.channels      — { instagram, facebook, linkedin, twitter } channel IDs
 */

const BUFFER_GRAPHQL = 'https://api.buffer.com/graphql'

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post { id status }
      }
      ... on NotFoundError      { message }
      ... on UnauthorizedError  { message }
      ... on UnexpectedError    { message }
      ... on RestProxyError     { message code }
      ... on LimitReachedError  { message }
      ... on InvalidInputError  { message }
    }
  }
`

export interface BufferCredentials {
  accessToken: string
  channels: Partial<Record<string, string>>
}

export interface PublishPostOptions {
  channelId:   string
  platform:    string    // 'instagram' | 'facebook' | 'linkedin' | 'twitter'
  text:        string
  mediaUrls?:  string[]
  mediaType?:  'image' | 'video'  // defaults to 'image' when omitted
  videoFormat?: string            // 'reel' | 'story' | 'feed_video' — video only
  postNow?:    boolean
}

export interface BufferPublishResult {
  bufferUpdateId: string
}

// Platform-specific metadata required by Buffer's GraphQL API.
// For video, Instagram needs the post type so Buffer can pick the right
// upload path (reel vs story vs feed post).
function buildMetadata(
  platform:    string,
  mediaType?:  string,
  videoFormat?: string,
): Record<string, unknown> | undefined {
  if (platform === 'instagram') {
    let type = 'post'
    if (mediaType === 'video') {
      type = videoFormat === 'story' ? 'story' : 'reel'
    }
    return { instagram: { type, shouldShareToFeed: true } }
  }
  if (platform === 'facebook') {
    return { facebook: { type: 'post' } }
  }
  // linkedin and twitter need no extra metadata for basic posts
  return undefined
}

interface GqlResponse {
  data?: {
    createPost?: {
      post?: { id: string; status?: string }
      message?: string
      code?: number
    }
  }
  errors?: Array<{ message: string }>
}

export async function publishToBuffer(
  creds: BufferCredentials,
  opts: PublishPostOptions,
): Promise<BufferPublishResult> {
  const metadata = buildMetadata(opts.platform, opts.mediaType, opts.videoFormat)

  const isVideo = opts.mediaType === 'video'
  const assets = (opts.mediaUrls ?? [])
    .filter(Boolean)
    .map(url =>
      isVideo
        ? { video: { url } }
        : { image: { url } },
    )

  const input: Record<string, unknown> = {
    channelId:      opts.channelId,
    text:           opts.text,
    mode:           opts.postNow !== false ? 'shareNow' : 'addToQueue',
    schedulingType: 'automatic',
    assets,
  }
  if (metadata) input.metadata = metadata

  const res = await fetch(BUFFER_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: CREATE_POST_MUTATION, variables: { input } }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Buffer GraphQL ${res.status}: ${body.slice(0, 400)}`)
  }

  const result = await res.json() as GqlResponse

  if (result.errors?.length) {
    throw new Error(`Buffer GraphQL error: ${result.errors[0].message}`)
  }

  const payload = result.data?.createPost
  if (!payload) {
    throw new Error('Buffer returned empty createPost response')
  }

  // Any union type other than PostActionSuccess carries a `message` but no `post`
  if (!payload.post?.id) {
    throw new Error(`Buffer rejected post: ${payload.message ?? 'unknown error'}`)
  }

  return { bufferUpdateId: payload.post.id }
}

export function isBufferConfigured(meta: Record<string, unknown>): boolean {
  return typeof meta.accessToken === 'string' && (meta.accessToken as string).length > 10
}
