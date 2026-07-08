import { useEffect, useRef } from 'react'
import { Youtube } from 'lucide-react'
import type { CropRect, EditorSettings } from '../types'

interface VideoPreviewProps {
  settings: EditorSettings
  videoUrl: string
  gameplayCrop?: CropRect
  cameraCrop?: CropRect
}

export function VideoPreview({ settings, videoUrl, gameplayCrop, cameraCrop }: VideoPreviewProps) {
  return (
    <section className="preview-panel" aria-labelledby="preview-heading">
      <div className="preview-heading">
        <div><span className="eyebrow">ŽIVÝ NÁHLED</span><h2 id="preview-heading">Výsledný klip</h2></div>
        <span className="format-pill">9:16 · 1080p</span>
      </div>
      <div className="phone-frame">
        <div className="video-stage">
          <div className="split-camera">
            {videoUrl && cameraCrop ? <CroppedVideo src={videoUrl} crop={cameraCrop} /> : <div className="split-placeholder">WEBCAM</div>}
          </div>
          <div className="split-gameplay">
            {videoUrl && gameplayCrop ? <CroppedVideo src={videoUrl} crop={gameplayCrop} /> : <div className="split-placeholder">GAMEPLAY</div>}
          </div>
          {settings.nickname && (
            <div className={`creator-tag ${settings.platform}`}>
              <PlatformMark platform={settings.platform} />
              <span>@{settings.nickname.replace(/^@/, '')}</span>
            </div>
          )}
          <div className="safe-zone" aria-hidden="true" />
        </div>
      </div>
      <p className="preview-note">Pevný split: webcam nahoře, gameplay dole.</p>
    </section>
  )
}

function CroppedVideo({ src, crop }: { src: string; crop: CropRect }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2) {
        const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio))
        const height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio))
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        let sx = crop.x * video.videoWidth
        let sy = crop.y * video.videoHeight
        let sw = crop.width * video.videoWidth
        let sh = crop.height * video.videoHeight
        const sourceAspect = sw / sh
        const targetAspect = width / height
        if (sourceAspect > targetAspect) { const nextWidth = sh * targetAspect; sx += (sw - nextWidth) / 2; sw = nextWidth }
        else { const nextHeight = sw / targetAspect; sy += (sh - nextHeight) / 2; sh = nextHeight }
        canvas.getContext('2d')?.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [crop, src])

  return (
    <div className="cropped-video" aria-hidden="true">
      <video ref={videoRef} src={src} muted autoPlay loop playsInline />
      <canvas ref={canvasRef} />
    </div>
  )
}

function PlatformMark({ platform }: { platform: EditorSettings['platform'] }) {
  if (platform === 'youtube') return <Youtube size={17} aria-hidden="true" />
  return <b aria-hidden="true">{platform === 'twitch' ? 'T' : 'K'}</b>
}
