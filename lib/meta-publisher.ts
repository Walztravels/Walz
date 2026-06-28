const META_GRAPH_URL = 'https://graph.facebook.com/v19.0'

export interface PublishResult {
  success:     boolean
  metaPostId?: string
  error?:      string
}

export async function publishToInstagram(
  caption:             string,
  imageUrl:            string,
  accessToken:         string,
  instagramAccountId:  string,
): Promise<PublishResult> {
  try {
    // Step 1: Create media container
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

    // Step 2: Publish the container
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

    return { success: true, metaPostId: published.id }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
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
    return { success: true, metaPostId: data.id }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
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
  const accessToken   = process.env.META_PAGE_ACCESS_TOKEN
  const instagramId   = process.env.META_INSTAGRAM_ACCOUNT_ID
  const pageId        = process.env.META_PAGE_ID

  if (!accessToken) return { success: false, error: 'META_PAGE_ACCESS_TOKEN not set' }

  const urls     = Array.isArray(post.imageUrls) ? post.imageUrls as string[] : []
  const imageUrl = urls[0] ?? ''
  const fullCaption = post.caption + (post.hashtags ? '\n\n' + post.hashtags : '')

  if (!imageUrl) return { success: false, error: 'No image URL on post' }

  let result: PublishResult = { success: false, error: 'No platform matched' }

  if (post.platform === 'instagram' || post.platform === 'both') {
    if (!instagramId) return { success: false, error: 'META_INSTAGRAM_ACCOUNT_ID not set' }
    result = await publishToInstagram(fullCaption, imageUrl, accessToken, instagramId)
  }

  if (result.success && (post.platform === 'facebook' || post.platform === 'both')) {
    if (pageId) {
      result = await publishToFacebook(post.caption, imageUrl, accessToken, pageId)
    }
  }

  if (!result.success && (post.platform === 'facebook' || post.platform === 'both') && post.platform !== 'both') {
    if (!pageId) return { success: false, error: 'META_PAGE_ID not set' }
    result = await publishToFacebook(post.caption, imageUrl, accessToken, pageId)
  }

  return result
}
