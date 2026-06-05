'use client'

import { useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Save, CheckCircle } from 'lucide-react'

interface Widget {
  id: string; key: string; label: string; enabled: boolean; order: number
}

const ICON_MAP: Record<string, string> = {
  flight_search: '✈️',
  hotel_search: '🏨',
  visa_checker: '🛂',
  ai_chatbot: '🤖',
  whatsapp_button: '💬',
}

function SortableWidget({ widget, onToggle }: { widget: Widget; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      {/* Icon */}
      <span className="text-xl">{ICON_MAP[widget.key] ?? '🔧'}</span>

      {/* Label */}
      <div className="flex-1">
        <div className="font-medium text-[#0B1F3A] text-sm">{widget.label}</div>
        <div className="text-xs text-gray-400 capitalize">{widget.key.replace(/_/g, ' ')}</div>
      </div>

      {/* Toggle */}
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          widget.enabled ? 'bg-[#C9A84C]' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            widget.enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>

      <span className={`text-xs font-medium w-12 text-right ${widget.enabled ? 'text-green-600' : 'text-gray-400'}`}>
        {widget.enabled ? 'On' : 'Off'}
      </span>
    </div>
  )
}

export function AdminWidgets({ initial }: { initial: Widget[] }) {
  const [widgets, setWidgets] = useState<Widget[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex((w) => w.id === active.id)
      const newIndex = widgets.findIndex((w) => w.id === over.id)
      setWidgets(arrayMove(widgets, oldIndex, newIndex))
    }
  }

  function toggleWidget(key: string) {
    setWidgets((prev) => prev.map((w) => w.key === key ? { ...w, enabled: !w.enabled } : w))
  }

  async function save() {
    setSaving(true)
    const payload = widgets.map((w, i) => ({ key: w.key, enabled: w.enabled, order: i }))
    await fetch('/api/admin/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-[#0B1F3A] mb-1">Homepage Widgets</h2>
        <p className="text-sm text-gray-500 mb-5">Drag to reorder. Toggle to show/hide on the homepage. Changes publish immediately when saved.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {widgets.map((widget) => (
                <SortableWidget key={widget.id} widget={widget} onToggle={() => toggleWidget(widget.key)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-bold px-6 py-3 rounded-xl transition-colors disabled:opacity-60"
        >
          {saving ? <Save className="w-4 h-4 animate-pulse" /> : <Save className="w-4 h-4" />}
          {saving ? 'Publishing…' : 'Publish Changes'}
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Changes published to live site
          </div>
        )}
      </div>
    </div>
  )
}
