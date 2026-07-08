import { useRef, useState } from 'react'
import { Film, Upload, X } from 'lucide-react'

interface FileDropProps {
  id: string
  label: string
  hint: string
  file: File | null
  required?: boolean
  onChange: (file: File | null) => void
}

export function FileDrop({ id, label, hint, file, required, onChange }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const acceptFile = (next?: File) => {
    if (next?.type.startsWith('video/')) onChange(next)
  }

  return (
    <div className="file-field">
      <div className="field-heading">
        <label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>
        <span>{hint}</span>
      </div>
      {file ? (
        <div className="file-selected">
          <span className="file-icon"><Film size={19} aria-hidden="true" /></span>
          <span className="file-meta"><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
          <button type="button" className="icon-button" onClick={() => onChange(null)} aria-label={`Odebrat ${label.toLowerCase()}`}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]) }}
        >
          <input ref={inputRef} id={id} type="file" accept="video/*" onChange={(event) => acceptFile(event.target.files?.[0])} />
          <Upload size={22} aria-hidden="true" />
          <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>Vybrat video</button>
          <span>nebo ho sem přetáhni</span>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
