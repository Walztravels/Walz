/**
 * lib/team/attachments.ts — the storage-layer half of the MEDIUM security
 * finding fix: the client-declared MIME type must NEVER become the
 * object's actual served Content-Type, and every signed URL must force a
 * download disposition so a mismatched/spoofed declared type can never
 * influence how a browser renders the response.
 */
const mockUpload = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockCreateBucket = jest.fn()
const mockFrom = jest.fn(() => ({ upload: mockUpload, createSignedUrl: mockCreateSignedUrl }))
const mockSupabase = { storage: { from: mockFrom, createBucket: mockCreateBucket } }
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => mockSupabase }))

import { uploadAttachment, getAttachmentSignedUrl } from '@/lib/team/attachments'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('uploadAttachment — SECURITY RE-VERIFICATION (was MEDIUM)', () => {
  it('always stores objects as application/octet-stream — the caller cannot pass a MIME type at all (the function takes none)', async () => {
    mockUpload.mockResolvedValue({ error: null })
    await uploadAttachment('conv1/msg1/1-file.png', Buffer.from('x'))
    expect(mockUpload).toHaveBeenCalledWith(
      'conv1/msg1/1-file.png',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/octet-stream' }),
    )
  })

  it('retries with the same forced content-type after auto-creating a missing bucket', async () => {
    mockUpload
      .mockResolvedValueOnce({ error: { message: 'Bucket not found' } })
      .mockResolvedValueOnce({ error: null })
    await uploadAttachment('conv1/msg1/1-file.png', Buffer.from('x'))
    expect(mockCreateBucket).toHaveBeenCalled()
    expect(mockUpload).toHaveBeenLastCalledWith(
      'conv1/msg1/1-file.png',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'application/octet-stream' }),
    )
  })

  it('throws on a genuine upload failure', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'disk full' } })
    await expect(uploadAttachment('k', Buffer.from('x'))).rejects.toThrow('disk full')
  })
})

describe('getAttachmentSignedUrl — SECURITY RE-VERIFICATION (was MEDIUM)', () => {
  it('always forces Content-Disposition: attachment via the download option', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null })
    const url = await getAttachmentSignedUrl('conv1/msg1/1-file.png', 'invoice.pdf')
    expect(url).toBe('https://signed.example/x')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('conv1/msg1/1-file.png', 3600, { download: 'invoice.pdf' })
  })

  it('returns null (never throws) when Supabase fails to sign', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } })
    const url = await getAttachmentSignedUrl('k', 'f.pdf')
    expect(url).toBeNull()
  })
})
