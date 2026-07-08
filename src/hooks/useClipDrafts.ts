import { useCallback, useState } from 'react'
import type { ClipDraft, CropRect } from '../types'

const defaultGameplay: CropRect = { x: 0, y: 0, width: 1, height: 1 }
const defaultCamera: CropRect = { x: .72, y: .04, width: .25, height: .3 }

export function useClipDrafts() {
  const [clips, setClips] = useState<ClipDraft[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeClip = clips.find((clip) => clip.id === activeId) || null

  const addClips = useCallback((files: File[]) => {
    const known = new Set(clips.map(fileKey))
    const additions = files
      .filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`))
      .slice(0, Math.max(0, 10 - clips.length))
      .map((file) => ({ id: crypto.randomUUID(), file, nickname: '', gameplayCrop: { ...defaultGameplay }, cameraCrop: { ...defaultCamera }, prepared: false }))
    if (!additions.length) return
    setClips([...clips, ...additions])
    if (!activeId) setActiveId(additions[0].id)
  }, [activeId, clips])

  const updateCrop = useCallback((kind: 'gameplayCrop' | 'cameraCrop', crop: CropRect) => {
    setClips((current) => current.map((clip) => clip.id === activeId ? { ...clip, [kind]: crop, prepared: false } : clip))
  }, [activeId])

  const updateNickname = useCallback((nickname: string) => {
    setClips((current) => current.map((clip) => clip.id === activeId ? { ...clip, nickname } : clip))
  }, [activeId])

  const markPrepared = useCallback(() => {
    const next = clips.map((clip) => clip.id === activeId ? { ...clip, prepared: true } : clip)
    setClips(next)
    const nextUnprepared = next.find((clip) => !clip.prepared)
    if (nextUnprepared) setActiveId(nextUnprepared.id)
  }, [activeId, clips])

  const removeClip = useCallback((id: string) => {
    const index = clips.findIndex((clip) => clip.id === id)
    const next = clips.filter((clip) => clip.id !== id)
    setClips(next)
    if (activeId === id) setActiveId(next[Math.min(index, next.length - 1)]?.id || null)
  }, [activeId, clips])

  const resetClips = useCallback(() => { setClips([]); setActiveId(null) }, [])

  return { clips, activeId, activeClip, addClips, setActiveId, updateCrop, updateNickname, markPrepared, removeClip, resetClips }
}

function fileKey(clip: ClipDraft) { return `${clip.file.name}:${clip.file.size}:${clip.file.lastModified}` }
