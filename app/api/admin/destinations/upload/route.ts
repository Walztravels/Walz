import { NextResponse }       from 'next/server'
import { getAdminSession }   from '@/lib/admin-auth'
import { getSupabaseAdmin }  from '@/lib/supabase'

const BUCKET = 'destination-images'

export async function POST(req: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase  = getSupabaseAdmin()
    const formData  = await req.formData()
    const file      = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Use JPG, PNG, WebP or AVIF.' }, { status: 400 })
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large — max 8 MB.' }, { status: 400 })
    }

    // Create bucket if it doesn't exist yet
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.some(b => b.name === BUCKET)) {
      const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 8388608,
        allowedMimeTypes: allowed,
      })
      if (bucketErr && !bucketErr.message.includes('already exists')) {
        return NextResponse.json({ error: 'Storage unavailable.' }, { status: 500 })
      }
    }

    const ext      = file.name.split('.').pop() ?? 'jpg'
    const fileName = `dest-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer   = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: file.type, cacheControl: '3600', upsert: false })

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
    return NextResponse.json({ url: urlData.publicUrl })
  } catch (err) {
    console.error('[dest-upload]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
