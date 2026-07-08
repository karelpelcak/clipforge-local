import { Check, Download, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import type { JobStatus } from '../types'

interface ExportStatusProps {
  job: JobStatus
  onReset: () => void
}

export function ExportStatus({ job, onReset }: ExportStatusProps) {
  const done = job.state === 'done'
  const failed = job.state === 'error'

  return (
    <section className={`export-status ${done ? 'success' : ''} ${failed ? 'failure' : ''}`} aria-live="polite">
      <div className="status-icon">
        {done ? <Check aria-hidden="true" /> : failed ? <TriangleAlert aria-hidden="true" /> : <LoaderCircle className="spin" aria-hidden="true" />}
      </div>
      <div className="status-copy">
        <h2>{done ? 'Klip je připravený' : failed ? 'Export se zastavil' : 'Vyrábím tvůj klip'}</h2>
        <p>{failed ? job.error : job.phase}</p>
      </div>
      {!done && !failed && <div className="progress-track"><span style={{ width: `${job.progress}%` }} /></div>}
      {done && (
        <a className="primary-button" href={`/api/jobs/${job.id}/download`} download>
          <Download size={18} aria-hidden="true" /> Stáhnout MP4
        </a>
      )}
      {(done || failed) && <button className="secondary-button" type="button" onClick={onReset}><RotateCcw size={17} aria-hidden="true" /> Nový klip</button>}
    </section>
  )
}
