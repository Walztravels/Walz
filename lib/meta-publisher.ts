const META_GRAPH_URL = 'https://graph.facebook.com/v19.0'

export interface PublishResult {
  success:     boolean
  metaPostId?: string
  platform?:   string
  error?:      string
}

export async function publishToInstagram(
  caption:            string,
  imageUrl:           string,
  accessToken:        string,
  instagramAccountId: string,
): Promise<PublishResult> {
  try {
    const containerRes = await fetch(
      `${META_GRAPH_URL}/${instagramAccountId}/media`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
      }
    )
    const container = await containerRes.json() as { id?: string; error?: { message: string } }
    if (!container.id) throw new Error(container.error?.message ?? 'Failed to create IG media container')

    const publishRes = await fetch(
      `${META_GRAPH_URL}/${instagramAccountId}/media_publish`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ creation_id: container.id, access_token: accessToken }),
      }
    )
    const published = await publishRes.json() as { id?: string; error?: { message: string } }
    if (!published.id) throw new Error(published.error?.message ?? 'Failed to publish IG media')

    return { success: true, metaPostId: published.id, platform: 'instagram' }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error', platform: 'instagram' }
  }
}

export async function publishToFacebook(
  caption:     string,
  imageUrl:    string,
  accessToken: string,
  pageId:      string,
): Promise<PublishResult> {
  try {
    const res = await fetch(
      `${META_GRAPH_URL}/${pageId}/photos`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: imageUrl, caption, access_token: accessToken }),
      }
    )
    const data = await res.json() as { id?: string; error?: { message: string } }
    if (!data.id) throw new Error(data.error?.message ?? 'Failed to post to Facebook')
    return { success: true, metaPostId: data.id, platform: 'facebook' }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error', platform: 'facebook' }
  }
}

export async function publishTextToFacebook(
  message:     string,
  accessToken: string,
  pageId:      string,
): Promise<PublishResult> {
  try {
    const res = await fetch(
      `${META_GRAPH_URL}/${pageId}/feed`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message, access_token: accessToken }),
      }
    )
    const data = await res.json() as { id?: string; error?: { message: string } }
    if (!data.id) throw new Error(data.error?.message ?? 'Failed to post text to Facebook')
    return { success: true, metaPostId: data.id, platform: 'facebook' }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error', platform: 'facebook' }
  }
}

/** Shared helper used by the manual publish endpoint and the cron job */
export async function publishPost(post: {
  id:        string
  platform:  string
  caption:   string
  hashtags:  string
  imageUrls: unknown
}): Promise<PublishResult> {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN
  const instagramId = process.env.META_INSTAGRAM_ACCOUNT_ID
  const pageId      = process.env.META_PAGE_ID

  if (!accessToken) return { success: false, error: 'META_PAGE_ACCESS_TOKEN not set' }

  const urls        = Array.isArray(post.imageUrls) ? post.imageUrls as string[] : []
  const imageUrl    = urls[0] ?? ''
  const fullCaption = post.caption + (post.hashtags ? '\n\n' + post.hashtags : '')

  const results: PublishResult[] = []

  if (post.platform === 'instagram' || post.platform === 'both') {
    if (!instagramId) return { success: false, error: 'META_INSTAGRAM_ACCOUNT_ID not set' }
    if (!imageUrl) {
      results.push({ success: false, error: 'Instagram requires an image URL', platform: 'instagram' })
    } else {
      results.push(await publishToInstagram(fullCaption, imageUrl, accessToken, instagramId))
    }
  }

  if (post.platform === 'facebook' || post.platform === 'both') {
    if (!pageId) return { success: false, error: 'META_PAGE_ID not set' }
    const fbResult = imageUrl
      ? await publishToFacebook(post.caption, imageUrl, accessToken, pageId)
      : await publishTextToFacebook(post.caption, accessToken, pageId)
    results.push(fbResult)
  }

  if (results.length === 0) return { success: false, error: 'No platform matched' }

  const succeeded = results.filter(r => r.success)
  const failed    = results.filter(r => !r.success)

  return succeeded[0] ?? failed[0]
}
