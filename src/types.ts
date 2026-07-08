export type Platform = 'youtube' | 'twitch' | 'kick'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface EditorSettings {
  platform: Platform
  nickname: string
}

export interface ClipDraft {
  id: string
  file: File
  gameplayCrop: CropRect
  cameraCrop: CropRect
  prepared: boolean
}

export interface JobStatus {
  id: string
  state: 'queued' | 'processing' | 'done' | 'error'
  phase: string
  progress: number
  error?: string
  filename?: string
  completed?: number
  total?: number
}
