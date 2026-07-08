import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clapperboard, LockKeyhole, Sparkles } from 'lucide-react'
import { ClipQueue } from './components/ClipQueue'
import { CropSelector } from './components/CropSelector'
import { ExportStatus } from './components/ExportStatus'
import { VideoPreview } from './components/VideoPreview'
import { useClipDrafts } from './hooks/useClipDrafts'
import { useClipJob } from './hooks/useClipJob'
import type { EditorSettings, Platform } from './types'

const platformOptions: Array<{ value: Platform; label: string }> = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'kick', label: 'Kick' },
]

export default function App() {
  const [settings, setSettings] = useState<EditorSettings>({ platform: 'twitch', nickname: '' })
  const [error, setError] = useState('')
  const nicknameRef = useRef<HTMLInputElement>(null)
  const drafts = useClipDrafts()
  const { job, submitError, submit, reset } = useClipJob()
  const videoUrl = useObjectUrl(drafts.activeClip?.file || null)
  const preparedCount = drafts.clips.filter((clip) => clip.prepared).length
  const canSubmit = drafts.clips.length > 0 && preparedCount === drafts.clips.length && Boolean(settings.nickname.trim())

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!drafts.clips.length) return setError('Přidej alespoň jeden klip.')
    const unprepared = drafts.clips.find((clip) => !clip.prepared)
    if (unprepared) {
      drafts.setActiveId(unprepared.id)
      return setError(`Nejdřív potvrď výřezy klipu „${unprepared.file.name}“.`)
    }
    if (!settings.nickname.trim()) {
      setError('Doplň nickname, který se zobrazí ve videích.')
      nicknameRef.current?.focus()
      return
    }
    setError('')
    void submit(drafts.clips, { ...settings, nickname: settings.nickname.trim().replace(/^@/, '') })
  }

  const handleReset = () => {
    reset()
    drafts.resetClips()
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
          <h1>Z klipů na <em>shorts</em><br />v jedné dávce.</h1>
          <p>Přidej více klipů, postupně připrav jejich výřezy a stáhni všechny výsledky najednou.</p>
        </div>

        {job ? <ExportStatus job={job} onReset={handleReset} /> : (
          <div className="workspace">
            <form className="editor-card" onSubmit={handleSubmit} noValidate>
              <section className="form-section" aria-labelledby="files-heading">
                <div className="section-number">01</div>
                <div className="section-content">
                  <h2 id="files-heading">Přidej klipy</h2>
                  <p>Vyber až 10 videí. Každé si ponechá vlastní nastavení výřezů.</p>
                  <ClipQueue clips={drafts.clips} activeId={drafts.activeId} onAdd={drafts.addClips} onSelect={drafts.setActiveId} onRemove={drafts.removeClip} />
                </div>
              </section>

              <section className="form-section" aria-labelledby="crop-heading">
                <div className="section-number">02</div>
                <div className="section-content">
                  <h2 id="crop-heading">Připrav výřezy</h2>
                  <p>{drafts.activeClip ? <>Upravuješ <strong>{drafts.activeClip.file.name}</strong>. Posuň gameplay a webcam na správné místo.</> : 'Vyber klip ze seznamu.'}</p>
                  {drafts.activeClip && videoUrl ? (
                    <>
                      <CropSelector
                        videoUrl={videoUrl}
                        gameplay={drafts.activeClip.gameplayCrop}
                        camera={drafts.activeClip.cameraCrop}
                        onGameplayChange={(crop) => drafts.updateCrop('gameplayCrop', crop)}
                        onCameraChange={(crop) => drafts.updateCrop('cameraCrop', crop)}
                      />
                      <button type="button" className={`crop-confirm ${drafts.activeClip.prepared ? 'ready' : ''}`} onClick={drafts.markPrepared}><Check size={17} aria-hidden="true" /> {drafts.activeClip.prepared ? 'Výřezy připravené' : 'Potvrdit a přejít na další'}</button>
                    </>
                  ) : <div className="crop-empty">Nejdřív přidej a vyber klip.</div>}
                </div>
              </section>

              <section className="form-section" aria-labelledby="profile-heading">
                <div className="section-number">03</div>
                <div className="section-content">
                  <h2 id="profile-heading">Profil pro všechny klipy</h2>
                  <p>Platforma a nickname budou stejné v celé dávce.</p>
                  <fieldset className="platform-picker"><legend>Platforma</legend><div>{platformOptions.map((platform) => <label key={platform.value} className={settings.platform === platform.value ? 'active' : ''}><input type="radio" name="platform" value={platform.value} checked={settings.platform === platform.value} onChange={() => setSettings((current) => ({ ...current, platform: platform.value }))} />{platform.label}</label>)}</div></fieldset>
                  <label className="input-label" htmlFor="nickname">Nickname</label>
                  <div className="nickname-input"><span>@</span><input ref={nicknameRef} id="nickname" value={settings.nickname} onChange={(event) => setSettings((current) => ({ ...current, nickname: event.target.value }))} placeholder="tvuj_nickname" maxLength={32} aria-invalid={Boolean(error && !settings.nickname)} aria-describedby={error ? 'form-error' : undefined} /></div>
                </div>
              </section>

              <div className="submit-area">
                {(error || submitError) && <p className="form-error" id="form-error" role="alert">{error || submitError}</p>}
                <button className="primary-button" type="submit" aria-disabled={!canSubmit}><Sparkles size={18} aria-hidden="true" /> Exportovat {drafts.clips.length || 0} {drafts.clips.length === 1 ? 'klip' : 'klipů'}</button>
                <small>{preparedCount}/{drafts.clips.length} připraveno · výstup MP4 nebo ZIP</small>
              </div>
            </form>
            <VideoPreview settings={settings} gameplayCrop={drafts.activeClip?.gameplayCrop} cameraCrop={drafts.activeClip?.cameraCrop} videoUrl={videoUrl} />
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
