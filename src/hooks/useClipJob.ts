import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipDraft, EditorSettings, JobStatus } from '../types'

export function useClipJob() {
  const [job, setJob] = useState<JobStatus | null>(null)
  const [submitError, setSubmitError] = useState('')
  const pollingRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) window.clearInterval(pollingRef.current)
    pollingRef.current = null
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const poll = useCallback((jobId: string) => {
    stopPolling()
    const readStatus = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { signal: AbortSignal.timeout(5000) })
        const status = await readApiResponse<JobStatus>(response)
        setJob(status)
        if (status.state === 'done' || status.state === 'error') stopPolling()
      } catch (error) {
        stopPolling()
        setSubmitError(error instanceof Error ? error.message : 'Spojení se serverem selhalo.')
      }
    }
    void readStatus()
    pollingRef.current = window.setInterval(readStatus, 1000)
  }, [stopPolling])

  const submit = useCallback(async (clips: ClipDraft[], settings: EditorSettings) => {
    setSubmitError('')
    setJob({ id: '', state: 'queued', phase: 'Nahrávám klipy…', progress: 4 })
    const data = new FormData()
    clips.forEach((clip) => data.append('clips', clip.file))
    data.append('items', JSON.stringify(clips.map((clip) => ({
      originalName: clip.file.name,
      nickname: clip.nickname.trim().replace(/^@/, ''),
      gameplayCrop: clip.gameplayCrop,
      cameraCrop: clip.cameraCrop,
    }))))
    Object.entries(settings).forEach(([key, value]) => data.append(key, value))

    try {
      const response = await fetch('/api/jobs', { method: 'POST', body: data })
      const body = await readApiResponse<{ id?: string }>(response)
      if (!body.id) throw new Error('Server nevrátil ID exportu.')
      poll(body.id)
    } catch (error) {
      setJob(null)
      setSubmitError(error instanceof Error ? error.message : 'Export se nepodařilo spustit.')
    }
  }, [poll])

  const reset = useCallback(() => {
    stopPolling()
    setJob(null)
    setSubmitError('')
  }, [stopPolling])

  return { job, submitError, submit, reset }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    const detail = text.trim().slice(0, 80)
    throw new Error(detail === '404 Not Found'
      ? 'Lokální video server neběží. Ukonči terminál a spusť znovu npm run dev.'
      : `Server vrátil neplatnou odpověď${detail ? `: ${detail}` : '.'}`)
  }

  const body = await response.json() as T & { error?: string | { message?: string } }
  if (!response.ok) {
    const apiError = body.error
    const message = typeof apiError === 'string' ? apiError : apiError?.message
    throw new Error(message || `Požadavek selhal (HTTP ${response.status}).`)
  }
  return body
}
