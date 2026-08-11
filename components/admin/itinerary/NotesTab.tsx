'use client'

import { useState, useEffect, useRef } from 'react'

interface Note {
  id: string
  author: string
  body: string
  pinned: boolean
  created_at: string
}

export function NotesTab({ itinId }: { itinId: string }) {
  const [notes, setNotes]     = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody]       = useState('')
  const [pinned, setPinned]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = () => {
    setLoading(true)
    fetch(`/api/admin/itineraries/${itinId}/notes`)
      .then(r => r.json())
      .then((d: { notes?: Note[] }) => setNotes(d.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [itinId])

  const add = async () => {
    if (!body.trim()) return
    setSaving(true)
    const res = await fetch(`/api/admin/itineraries/${itinId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim(), pinned }),
    })
    if (res.ok) { setBody(''); setPinned(false); load() }
    setSaving(false)
  }

  const togglePin = async (note: Note) => {
    await fetch(`/api/admin/itineraries/${itinId}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: note.id, pinned: !note.pinned }),
    })
    load()
  }

  const saveEdit = async (noteId: string) => {
    if (!editBody.trim()) return
    await fetch(`/api/admin/itineraries/${itinId}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId, body: editBody.trim() }),
    })
    setEditId(null)
    load()
  }

  const del = async (noteId: string) => {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/admin/itineraries/${itinId}/notes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId }),
    })
    load()
  }

  const fmtDate = (d: string) => {
    const date = new Date(d)
    const diff = Date.now() - date.getTime()
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const pinned_notes  = notes.filter(n => n.pinned)
  const regular_notes = notes.filter(n => !n.pinned)

  return (
    <div className="max-w-3xl space-y-6">
      {/* Add note */}
      <div className="bg-white/5 border border-white/[0.08] rounded-2xl p-5">
        <h3 className="text-white font-bold text-sm mb-3">Add Internal Note</h3>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Staff-only note — never shown to the client..."
          rows={3}
          className="w-full bg-white/5 border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-400 resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={e => setPinned(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-white/50 text-xs">📌 Pin note</span>
          </label>
          <button
            onClick={add}
            disabled={saving || !body.trim()}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2 rounded-xl text-sm transition disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-white/30 text-sm">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
          Loading notes…
        </div>
      )}

      {/* Pinned */}
      {pinned_notes.length > 0 && (
        <div className="space-y-3">
          <p className="text-amber-400/70 text-xs font-bold uppercase tracking-wider">📌 Pinned</p>
          {pinned_notes.map(n => <NoteCard key={n.id} note={n} onPin={togglePin} onEdit={(id, b) => { setEditId(id); setEditBody(b) }} onDelete={del} editId={editId} editBody={editBody} setEditBody={setEditBody} onSaveEdit={saveEdit} fmtDate={fmtDate} />)}
        </div>
      )}

      {/* Regular */}
      {regular_notes.length > 0 && (
        <div className="space-y-3">
          {pinned_notes.length > 0 && <p className="text-white/30 text-xs font-bold uppercase tracking-wider">Notes</p>}
          {regular_notes.map(n => <NoteCard key={n.id} note={n} onPin={togglePin} onEdit={(id, b) => { setEditId(id); setEditBody(b) }} onDelete={del} editId={editId} editBody={editBody} setEditBody={setEditBody} onSaveEdit={saveEdit} fmtDate={fmtDate} />)}
        </div>
      )}

      {!loading && notes.length === 0 && (
        <div className="text-center py-12 text-white/30 text-sm">
          <p className="text-2xl mb-2">📝</p>
          <p>No internal notes yet.</p>
          <p className="text-xs mt-1">Notes are only visible to staff — never shown to the client.</p>
        </div>
      )}
    </div>
  )
}

function NoteCard({
  note, onPin, onEdit, onDelete, editId, editBody, setEditBody, onSaveEdit, fmtDate,
}: {
  note: Note
  onPin: (n: Note) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  editId: string | null
  editBody: string
  setEditBody: (v: string) => void
  onSaveEdit: (id: string) => void
  fmtDate: (d: string) => string
}) {
  const isEditing = editId === note.id
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                rows={3}
                autoFocus
                className="w-full bg-white/5 border border-amber-400/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => onSaveEdit(note.id)} className="bg-amber-500 text-black font-bold px-4 py-1.5 rounded-lg text-xs">Save</button>
                <button onClick={() => onEdit('', '')} className="text-white/40 hover:text-white text-xs px-3">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-white/30 text-xs">{note.author}</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/30 text-xs">{fmtDate(note.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onPin(note)} className={`p-1.5 rounded-lg text-xs transition ${note.pinned ? 'text-amber-400' : 'text-white/20 hover:text-white/60'}`}>📌</button>
          <button onClick={() => onEdit(note.id, note.body)} className="p-1.5 rounded-lg text-white/20 hover:text-white/60 transition text-xs">✏️</button>
          <button onClick={() => onDelete(note.id)} className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition text-xs">🗑</button>
        </div>
      </div>
    </div>
  )
}
