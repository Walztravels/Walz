'use client'

/**
 * Admin-wide Floating Team Hub — edge/corner resize handling, mirroring
 * useFloatingDrag.ts's pointer-capture shape. Each of the 8 handle elements
 * (see FloatingTeamHubWindow.tsx) calls `startResize(handle)` from its own
 * onPointerDown.
 */
import { useCallback, useRef, useState } from 'react'
import { resizeGeometry, type Geometry, type ResizeHandle } from '@/lib/team-hub-floating/geometry'
import { useFloatingTeamHub } from './FloatingTeamHubContext'

export function useFloatingResize() {
  const { geometry, isMaximized, previewGeometry, commitGeometry, getContentAreaBounds } = useFloatingTeamHub()
  const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null)
  const startRef = useRef<{ pointerId: number; startX: number; startY: number; geom: Geometry; handle: ResizeHandle } | null>(null)

  const startResize = useCallback((handle: ResizeHandle) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMaximized) return
    startRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, geom: geometry, handle }
    setResizingHandle(handle)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }, [geometry, isMaximized])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start || start.pointerId !== e.pointerId) return
    const dx = e.clientX - start.startX
    const dy = e.clientY - start.startY
    previewGeometry(resizeGeometry(start.geom, start.handle, dx, dy, getContentAreaBounds()))
  }, [getContentAreaBounds, previewGeometry])

  const endResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    if (!start || start.pointerId !== e.pointerId) return
    startRef.current = null
    setResizingHandle(null)
    const dx = e.clientX - start.startX
    const dy = e.clientY - start.startY
    commitGeometry(resizeGeometry(start.geom, start.handle, dx, dy, getContentAreaBounds()))
  }, [commitGeometry, getContentAreaBounds])

  return { resizingHandle, startResize, onPointerMove, onPointerUp: endResize, onPointerCancel: endResize }
}
