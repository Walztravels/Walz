'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Tag, ExternalLink } from 'lucide-react'
import Link from 'next/link'

const CATEGORIES = ['Visa Guides', 'Destinations', 'Travel Tips', 'News'] as const

interface Post {
  id: string
  title: string
  slug: string
  excerpt: string | null
  category: string
  featuredImageUrl: string | null
  published: boolean
  createdAt: string
}

interface FormData {
  title: string
  slug: string
  content: string
  excerpt: string
  category: string
  featuredImageUrl: string
  metaDescription: string
  published: boolean
}

const EMPTY: FormData = {
  title: '',
  slug: '',
  content: '',
  excerpt: '',
  category: 'Travel Tips',
  featuredImageUrl: '',
  metaDescription: '',
  published: false,
}

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const CATEGORY_COLORS: Record<string, string> = {
  'Visa Guides':  'bg-blue-100 text-blue-700',
  'Destinations': 'bg-green-100 text-green-700',
  'Travel Tips':  'bg-purple-100 text-purple-700',
  'News':         'bg-orange-100 text-orange-700',
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<(FormData & { id?: string }) | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/blog')
    const data = await res.json()
    setPosts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setModal({ ...EMPTY })
    setError(null)
  }

  function openEdit(post: Post) {
    setModal({
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: '',          // content not in list response — user must re-enter or we fetch
      excerpt: post.excerpt ?? '',
      category: post.category,
      featuredImageUrl: post.featuredImageUrl ?? '',
      metaDescription: '',
      published: post.published,
    })
    // Fetch full post content
    fetch(`/api/admin/blog?id=${post.id}`).then(r => r.json()).then(data => {
      if (data && data.content !== undefined) {
        setModal(m => m ? { ...m, content: data.content, metaDescription: data.metaDescription ?? '' } : m)
      }
    }).catch(() => {})
    setError(null)
  }

  async function save() {
    if (!modal) return
    setError(null)
    setSaving(true)

    try {
      const body = modal.id
        ? { id: modal.id, title: modal.title, slug: modal.slug, content: modal.content, excerpt: modal.excerpt || undefined, category: modal.category, featuredImageUrl: modal.featuredImageUrl || '', metaDescription: modal.metaDescription || '', published: modal.published }
        : { title: modal.title, slug: modal.slug, content: modal.content, excerpt: modal.excerpt || undefined, category: modal.category, featuredImageUrl: modal.featuredImageUrl || '', metaDescription: modal.metaDescription || '', published: modal.published }

      const res = await fetch('/api/admin/blog', {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Save failed')
        return
      }

      setModal(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    await fetch('/api/admin/blog', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteId }),
    })
    setDeleteId(null)
    setDeleting(false)
    load()
  }

  async function togglePublish(post: Post) {
    setToggling(post.id)
    await fetch('/api/admin/blog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, published: !post.published }),
    })
    setToggling(null)
    load()
  }

  function handleTitleChange(val: string) {
    setModal(m => m ? {
      ...m,
      title: val,
      slug: m.id ? m.slug : toSlug(val), // only auto-slug for new posts
    } : m)
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Blog Posts</h1>
          <p className="text-sm text-gray-500 mt-1">{posts.length} article{posts.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors"
        >
          <Plus className="w-4 h-4" /> New Post
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-4xl mb-3">✍️</div>
          <h3 className="font-bold text-[#0B1F3A] text-lg mb-1">No posts yet</h3>
          <p className="text-gray-500 text-sm mb-4">Create your first blog post to get started.</p>
          <button onClick={openNew} className="px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors">
            Create Post
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F8FA] border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#0B1F3A] leading-snug line-clamp-1">{post.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{post.slug}</p>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[post.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      <Tag className="w-3 h-3" />
                      {post.category}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500 hidden md:table-cell">
                    {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => togglePublish(post)}
                      disabled={toggling === post.id}
                      title={post.published ? 'Click to unpublish' : 'Click to publish'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        post.published ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {post.published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {post.published ? 'Live' : 'Draft'}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {post.published && (
                        <Link
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 transition-colors"
                          title="View live"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      <button
                        onClick={() => openEdit(post)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(post.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A] text-lg">
                {modal.id ? 'Edit Post' : 'New Blog Post'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Title *</label>
                <input
                  value={modal.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="e.g. How to Get a Schengen Visa in 2025"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                />
              </div>

              {/* Slug + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Slug *</label>
                  <input
                    value={modal.slug}
                    onChange={(e) => setModal(m => m ? { ...m, slug: toSlug(e.target.value) } : m)}
                    placeholder="how-to-get-schengen-visa"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                  />
                  <p className="text-xs text-gray-400 mt-1">walztravels.us/blog/{modal.slug || '…'}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category *</label>
                  <select
                    value={modal.category}
                    onChange={(e) => setModal(m => m ? { ...m, category: e.target.value } : m)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Featured Image URL */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Featured Image URL</label>
                <input
                  value={modal.featuredImageUrl}
                  onChange={(e) => setModal(m => m ? { ...m, featuredImageUrl: e.target.value } : m)}
                  placeholder="https://images.unsplash.com/…"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                />
              </div>

              {/* Excerpt */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Excerpt <span className="text-gray-400 font-normal normal-case">(auto-generated from content if blank)</span></label>
                <textarea
                  value={modal.excerpt}
                  onChange={(e) => setModal(m => m ? { ...m, excerpt: e.target.value } : m)}
                  placeholder="Short summary shown on the blog listing page…"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] resize-none"
                />
              </div>

              {/* Meta Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Meta Description <span className="text-gray-400 font-normal normal-case">(SEO, max 320 chars)</span></label>
                <textarea
                  value={modal.metaDescription}
                  onChange={(e) => setModal(m => m ? { ...m, metaDescription: e.target.value.slice(0, 320) } : m)}
                  placeholder="Appears in Google search results…"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{(modal.metaDescription || '').length}/320</p>
              </div>

              {/* Content */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Content * <span className="text-gray-400 font-normal normal-case">(HTML supported)</span></label>
                <textarea
                  value={modal.content}
                  onChange={(e) => setModal(m => m ? { ...m, content: e.target.value } : m)}
                  placeholder="<p>Your article content goes here…</p>&#10;&#10;<h2>Section heading</h2>&#10;<p>More content…</p>"
                  rows={16}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">{(modal.content || '').length} characters</p>
              </div>

              {/* Published toggle */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <button
                  type="button"
                  onClick={() => setModal(m => m ? { ...m, published: !m.published } : m)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${modal.published ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${modal.published ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">{modal.published ? 'Published' : 'Draft'}</p>
                  <p className="text-xs text-gray-500">{modal.published ? 'Visible on the blog' : 'Only visible to admins'}</p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !modal.title || !modal.slug || !modal.content || !modal.category}
                className="px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : modal.id ? 'Save Changes' : 'Publish Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-[#0B1F3A] text-lg mb-2">Delete Post?</h3>
            <p className="text-sm text-gray-500 mb-6">This action cannot be undone. The post will be permanently removed.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-sm text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
