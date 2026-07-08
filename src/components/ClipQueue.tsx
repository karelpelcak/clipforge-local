import { useRef, useState } from 'react'
import { Check, Film, Plus, Trash2, Upload } from 'lucide-react'
import type { ClipDraft } from '../types'

interface ClipQueueProps {
  clips: ClipDraft[]
  activeId: string | null
  onAdd: (files: File[]) => void
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

export function ClipQueue({ clips, activeId, onAdd, onSelect, onRemove }: ClipQueueProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    onAdd(Array.from(files).filter((file) => file.type.startsWith('video/')))
  }

  return (
    <div className="clip-queue">
      <div
        className={`batch-drop-zone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}
      >
        <input ref={inputRef} id="clips" type="file" accept="video/*" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
        <Upload size={22} aria-hidden="true" />
        <div><button type="button" className="text-button" onClick={() => inputRef.current?.click()}>{clips.length ? 'Přidat další klipy' : 'Vybrat klipy'}</button><span> nebo je sem přetáhni</span></div>
        <small>MP4, MOV nebo WebM · maximálně 10 klipů</small>
      </div>

      {clips.length > 0 && (
        <div className="queue-list" aria-label="Klipy ve frontě">
          <div className="queue-summary"><strong>{clips.length} {clipWord(clips.length)}</strong><span>{clips.filter((clip) => clip.prepared).length}/{clips.length} připraveno</span></div>
          {clips.map((clip, index) => (
            <div className={`queue-item ${clip.id === activeId ? 'active' : ''}`} key={clip.id}>
              <button type="button" className="queue-select" onClick={() => onSelect(clip.id)} aria-current={clip.id === activeId ? 'true' : undefined}>
                <span className="queue-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="queue-file-icon"><Film size={16} aria-hidden="true" /></span>
                <span className="queue-file"><strong>{clip.file.name}</strong><small>{formatBytes(clip.file.size)}</small></span>
                <span className={`queue-state ${clip.prepared ? 'ready' : ''}`}>{clip.prepared ? <><Check size={12} aria-hidden="true" /> Připraveno</> : clip.id === activeId ? 'Upravuješ' : 'Čeká'}</span>
              </button>
              <button type="button" className="queue-remove" onClick={() => onRemove(clip.id)} aria-label={`Odebrat ${clip.file.name}`}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          ))}
          {clips.length < 10 && <button type="button" className="queue-add" onClick={() => inputRef.current?.click()}><Plus size={15} aria-hidden="true" /> Přidat klip</button>}
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

function clipWord(count: number) { return count === 1 ? 'klip' : count >= 2 && count <= 4 ? 'klipy' : 'klipů' }
