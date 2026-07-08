import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, LockKeyhole, Sparkles } from 'lucide-react'
import { CropSelector } from './components/CropSelector'
import { ExportStatus } from './components/ExportStatus'
import { FileDrop } from './components/FileDrop'
import { VideoPreview } from './components/VideoPreview'
import { useClipJob } from './hooks/useClipJob'
import type { EditorSettings, Platform } from './types'

const platformOptions: Array<{ value: Platform; label: string }> = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'kick', label: 'Kick' },
]

export default function App() {
  const [clip, setClip] = useState<File | null>(null)
  const [settings, setSettings] = useState<EditorSettings>({
    platform: 'twitch',
    nickname: '',
    gameplayCrop: { x: 0, y: 0, width: 1, height: 1 },
    cameraCrop: { x: .72, y: .04, width: .25, height: .3 },
  })
  const [error, setError] = useState('')
  const nicknameRef = useRef<HTMLInputElement>(null)
  const { job, submitError, submit, reset } = useClipJob()

  const videoUrl = useObjectUrl(clip)
  const canSubmit = Boolean(clip && settings.nickname.trim())

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!clip) return setError('Nahraj klip, ve kterém je gameplay a kamera.')
    if (!settings.nickname.trim()) {
      setError('Doplň nickname, který se zobrazí ve videu.')
      nicknameRef.current?.focus()
      return
    }
    setError('')
    void submit(clip, { ...settings, nickname: settings.nickname.trim().replace(/^@/, '') })
  }

  const handleReset = () => {
    reset()
    setClip(null)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="ClipForge domů"><span><Clapperboard size={21} aria-hidden="true" /></span>ClipForge<small>LOCAL</small></a>
        <div className="local-badge"><LockKeyhole size={14} aria-hidden="true" /> Vše zůstává v počítači</div>
      </header>

      <main id="main">
        <div className="hero">
          <span className="eyebrow"><Sparkles size={14} aria-hidden="true" /> LOKÁLNÍ CLIP STUDIO</span>
          <h1>Z klipu na <em>short</em><br />během pár kliknutí.</h1>
          <p>Nahraj jeden klip, uprav výřez gameplaye a webkamery a vytvoř čistý vertikální split.</p>
        </div>

        {job ? <ExportStatus job={job} onReset={handleReset} /> : (
          <div className="workspace">
            <form className="editor-card" onSubmit={handleSubmit} noValidate>
              <section className="form-section" aria-labelledby="files-heading">
                <div className="section-number">01</div>
                <div className="section-content">
                  <h2 id="files-heading">Nahraj jeden klip</h2>
                  <p>Klip už obsahuje gameplay i obraz z kamery. Video se zpracuje pouze lokálně.</p>
                  <FileDrop id="clip" label="Zdrojový klip" hint="MP4, MOV, WebM" file={clip} required onChange={setClip} />
                </div>
              </section>

              <section className="form-section" aria-labelledby="crop-heading">
                <div className="section-number">02</div>
                <div className="section-content">
                  <h2 id="crop-heading">Uprav výřezy</h2>
                  <p>Výřezy jsou připravené automaticky. Zapni gameplay nebo webcam a obdélník posuň či zvětši.</p>
                  {videoUrl ? (
                    <CropSelector
                      videoUrl={videoUrl}
                      gameplay={settings.gameplayCrop}
                      camera={settings.cameraCrop}
                      onGameplayChange={(gameplayCrop) => setSettings((current) => ({ ...current, gameplayCrop }))}
                      onCameraChange={(cameraCrop) => setSettings((current) => ({ ...current, cameraCrop }))}
                    />
                  ) : <div className="crop-empty">Nejdřív nahraj klip.</div>}
                </div>
              </section>

              <section className="form-section" aria-labelledby="profile-heading">
                <div className="section-number">03</div>
                <div className="section-content">
                  <h2 id="profile-heading">Profil ve videu</h2>
                  <p>Platforma a nickname se zobrazí jako čistý štítek v horní části klipu.</p>
                  <fieldset className="platform-picker">
                    <legend>Platforma</legend>
                    <div>
                      {platformOptions.map((platform) => <label key={platform.value} className={settings.platform === platform.value ? 'active' : ''}><input type="radio" name="platform" value={platform.value} checked={settings.platform === platform.value} onChange={() => setSettings((current) => ({ ...current, platform: platform.value }))} />{platform.label}</label>)}
                    </div>
                  </fieldset>
                  <label className="input-label" htmlFor="nickname">Nickname</label>
                  <div className="nickname-input"><span>@</span><input ref={nicknameRef} id="nickname" value={settings.nickname} onChange={(event) => setSettings((current) => ({ ...current, nickname: event.target.value }))} placeholder="tvuj_nickname" maxLength={32} aria-invalid={Boolean(error && !settings.nickname)} aria-describedby={error ? 'form-error' : undefined} /></div>
                </div>
              </section>

              <div className="submit-area">
                {(error || submitError) && <p className="form-error" id="form-error" role="alert">{error || submitError}</p>}
                <button className="primary-button" type="submit" aria-disabled={!canSubmit}><Sparkles size={18} aria-hidden="true" /> Vytvořit klip</button>
                <small>Výstup: MP4 · 1080 × 1920 · H.264</small>
              </div>
            </form>
            <VideoPreview settings={settings} videoUrl={videoUrl} />
          </div>
        )}
      </main>
      <footer><span>ClipForge Local</span><span>Bez cloudu. Bez účtu. Bez uploadu.</span></footer>
    </div>
  )
}

function useObjectUrl(file: File | null) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}
