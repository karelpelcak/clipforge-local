import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Gamepad2, Move, Scaling, Video } from 'lucide-react'
import type { CropRect } from '../types'

type Area = 'gameplay' | 'camera'
type DragMode = 'move' | 'resize'

interface CropSelectorProps {
  videoUrl: string
  gameplay: CropRect
  camera: CropRect
  onGameplayChange: (crop: CropRect) => void
  onCameraChange: (crop: CropRect) => void
}

interface DragState {
  area: Area
  mode: DragMode
  pointerX: number
  pointerY: number
  initial: CropRect
}

export function CropSelector({ videoUrl, gameplay, camera, onGameplayChange, onCameraChange }: CropSelectorProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [active, setActive] = useState<Area>('gameplay')
  const [aspectRatio, setAspectRatio] = useState(16 / 9)

  const updateArea = (area: Area, crop: CropRect) => area === 'gameplay' ? onGameplayChange(crop) : onCameraChange(crop)

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, area: Area, crop: CropRect) => {
    event.preventDefault()
    event.stopPropagation()
    setActive(area)
    event.currentTarget.setPointerCapture(event.pointerId)
    const mode = (event.target as HTMLElement).closest('.resize-handle') ? 'resize' : 'move'
    dragRef.current = { area, mode, pointerX: event.clientX, pointerY: event.clientY, initial: crop }
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    const stage = stageRef.current
    if (!drag || !stage) return
    const bounds = stage.getBoundingClientRect()
    const dx = (event.clientX - drag.pointerX) / bounds.width
    const dy = (event.clientY - drag.pointerY) / bounds.height
    const next = { ...drag.initial }
    if (drag.mode === 'move') {
      next.x = clamp(drag.initial.x + dx, 0, 1 - drag.initial.width)
      next.y = clamp(drag.initial.y + dy, 0, 1 - drag.initial.height)
    } else {
      next.width = clamp(drag.initial.width + dx, .08, 1 - drag.initial.x)
      next.height = clamp(drag.initial.height + dy, .08, 1 - drag.initial.y)
    }
    updateArea(drag.area, next)
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleAreaKey = (event: KeyboardEvent<HTMLButtonElement>, area: Area, crop: CropRect) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    setActive(area)
    const amount = event.altKey ? .001 : .01
    const next = { ...crop }
    if (event.shiftKey) {
      if (event.key === 'ArrowLeft') next.width = clamp(next.width - amount, .08, 1 - next.x)
      if (event.key === 'ArrowRight') next.width = clamp(next.width + amount, .08, 1 - next.x)
      if (event.key === 'ArrowUp') next.height = clamp(next.height - amount, .08, 1 - next.y)
      if (event.key === 'ArrowDown') next.height = clamp(next.height + amount, .08, 1 - next.y)
    } else {
      if (event.key === 'ArrowLeft') next.x = clamp(next.x - amount, 0, 1 - next.width)
      if (event.key === 'ArrowRight') next.x = clamp(next.x + amount, 0, 1 - next.width)
      if (event.key === 'ArrowUp') next.y = clamp(next.y - amount, 0, 1 - next.height)
      if (event.key === 'ArrowDown') next.y = clamp(next.y + amount, 0, 1 - next.height)
    }
    updateArea(area, next)
  }

  return (
    <div className="crop-selector">
      <div className="crop-toolbar" role="group" aria-label="Výřez, který chceš upravit">
        <button type="button" aria-pressed={active === 'gameplay'} className={active === 'gameplay' ? 'active gameplay' : ''} onClick={() => setActive('gameplay')}><Gamepad2 size={16} aria-hidden="true" /> Gameplay výřez</button>
        <button type="button" aria-pressed={active === 'camera'} className={active === 'camera' ? 'active camera' : ''} onClick={() => setActive('camera')}><Video size={16} aria-hidden="true" /> Webcam výřez</button>
      </div>
      <p className="crop-instruction"><Move size={14} aria-hidden="true" /> Táhni výřez pro přesun. Za roh <Scaling size={14} aria-hidden="true" /> změníš velikost.</p>
      <div ref={stageRef} className="crop-stage" style={{ aspectRatio }}>
        <video src={videoUrl} muted autoPlay loop playsInline onLoadedMetadata={(event) => setAspectRatio(event.currentTarget.videoWidth / event.currentTarget.videoHeight)} />
        <AreaBox area="gameplay" crop={gameplay} active={active === 'gameplay'} onActivate={() => setActive('gameplay')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onKeyDown={handleAreaKey} />
        <AreaBox area="camera" crop={camera} active={active === 'camera'} onActivate={() => setActive('camera')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onKeyDown={handleAreaKey} />
      </div>
      <p className="keyboard-hint">Klávesnice: šipky výřez posunují, Shift + šipky mění velikost, Alt zpřesní krok.</p>
    </div>
  )
}

interface AreaBoxProps {
  area: Area
  crop: CropRect
  active: boolean
  onActivate: () => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, area: Area, crop: CropRect) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, area: Area, crop: CropRect) => void
}

function AreaBox({ area, crop, active, onActivate, onPointerDown, onPointerMove, onPointerUp, onKeyDown }: AreaBoxProps) {
  const label = area === 'gameplay' ? 'GAMEPLAY' : 'WEBCAM'
  return (
    <button
      type="button"
      className={`crop-box ${area} ${active ? 'active' : ''}`}
      style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}
      onClick={onActivate}
      onPointerDown={(event) => onPointerDown(event, area, crop)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => onKeyDown(event, area, crop)}
      aria-label={`${label} výřez. Šipkami posuneš, Shift a šipky změní velikost.`}
    >
      <span className="crop-label">{label}</span>
      <span className="resize-handle" aria-hidden="true"><Scaling size={12} /></span>
    </button>
  )
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
