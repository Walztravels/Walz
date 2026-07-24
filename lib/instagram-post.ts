// lib/instagram-post.ts
// Resolves Instagram post/story/ad context from Meta webhook attachment + referral data.
// Called at webhook time so Jade knows what post the customer was looking at.

export interface IGAttachment {
  type:    string
  payload: {
    url?:   string
    title?: string
    id?:    string
  }
}

export interface IGReferral {
  ref?:    string
  source?: string
  type?:   string
  ad_id?:  string
  ads_context_data?: {
    photo_url?:    string
    product_name?: string
    ad_title?:     string
  }
}

export interface PostContext {
  summary:  string
  postType: 'post' | 'reel' | 'story' | 'ad' | 'unknown'
}

/**
 * Resolves Instagram post context from webhook attachment / referral data.
 * Priority order:
 *   1. Ad referral with ads_context_data (richest, no API call)
 *   2. Story mention / story reply
 *   3. Share attachment — fetches caption from Instagram Graph API if URL present
 * Returns null if no recognisable post data found.
 */
export async function resolveInstagramPostContext(
  attachments?: IGAttachment[],
  referral?:    IGReferral,
): Promise<PostContext | null> {
  // ── 1. Ad referral ────────────────────────────────────────────────────────────
  if (referral?.ads_context_data) {
    const { ad_title, product_name } = referral.ads_context_data
    const parts = [ad_title, product_name].filter(Boolean)
    if (parts.length > 0) {
      return {
        postType: 'ad',
        summary:  `Customer tapped "Send Message" from our ad: "${parts.join(' — ')}"`,
      }
    }
  }

  if (!attachments?.length) return null

  for (const att of attachments) {
    const type = (att.type ?? '').toLowerCase()

    // ── 2. Story mention / reply ────────────────────────────────────────────────
    if (type === 'story_mention' || type === 'story_reply') {
      return {
        postType: 'story',
        summary:  'Customer replied to or highlighted one of our Instagram stories.',
      }
    }

    // ── 3. Shared post (share / ig_share / link) ────────────────────────────────
    if (type === 'share' || type === 'ig_share' || type === 'link') {
      const url   = att.payload?.url   ?? ''
      const title = att.payload?.title ?? ''

      // Payload already contains a caption snippet — use it directly
      if (title.trim()) {
        return {
          postType: 'post',
          summary:  `Customer replied to our post: "${title.slice(0, 200)}"`,
        }
      }

      // Try to resolve the full caption from Instagram Graph API
      if (url.includes('instagram.com')) {
        const isReel = url.includes('/reel/')
        const kind   = isReel ? 'Reel' : 'post'
        const caption = await fetchPostCaptionByUrl(url)
        if (caption) {
          return {
            postType: isReel ? 'reel' : 'post',
            summary:  `Customer replied to our ${kind}: "${caption.slice(0, 250)}"`,
          }
        }
        return {
          postType: isReel ? 'reel' : 'post',
          summary:  `Customer shared or replied to our Instagram ${kind}.`,
        }
      }
    }
  }

  return null
}

/**
 * Fetches our own Instagram post's caption by matching a permalink shortcode
 * against the Walz Travels IG account's recent media (up to 50 posts).
 */
async function fetchPostCaptionByUrl(url: string): Promise<string | null> {
  const token    = process.env.INSTAGRAM_ACCESS_TOKEN
  const igUserId = process.env.INSTAGRAM_ACCOUNT_ID
  if (!token || !igUserId) return null

  try {
    const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)
    if (!match) return null
    const shortcode = match[1]

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${igUserId}/media` +
      `?fields=id,caption,permalink,media_type&limit=50&access_token=${token}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null

    type MediaItem = { id: string; caption?: string; permalink?: string }
    const data = await res.json() as { data?: MediaItem[] }
    const found = (data.data ?? []).find(p => p.permalink?.includes(shortcode))
    return found?.caption ?? null
  } catch {
    return null
  }
}
