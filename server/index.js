import cors from 'cors'
import express from 'express'
import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import multer from 'multer'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workRoot = path.join(root, '.clipforge')
const port = 8790
const upload = multer({ dest: path.join(workRoot, 'uploads'), limits: { fileSize: 1_500_000_000, files: 1 } })
const jobs = new Map()
const app = express()

await fs.mkdir(path.join(workRoot, 'uploads'), { recursive: true })
await fs.mkdir(path.join(workRoot, 'jobs'), { recursive: true })

app.use(cors())
app.use(express.json())

app.post('/api/jobs', upload.single('clip'), async (req, res) => {
  const body = req.body || {}
  const clip = req.file
  const nickname = String(body.nickname || '').trim().replace(/^@/, '').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 32)
  const gameplayCrop = parseCrop(body.gameplayCrop)
  const cameraCrop = parseCrop(body.cameraCrop)
  const reject = async (message) => {
    if (clip?.path) await fs.rm(clip.path, { force: true })
    return res.status(400).json({ error: message })
  }

  if (!clip) return reject('Chybí zdrojový klip.')
  if (!gameplayCrop || !cameraCrop) return reject('Vybrané oblasti videa nejsou platné.')
  if (!nickname) return reject('Nickname nesmí být prázdný.')

  const id = crypto.randomUUID()
  const jobDir = path.join(workRoot, 'jobs', id)
  await fs.mkdir(jobDir, { recursive: true })
  const job = { id, state: 'queued', phase: 'Čekám na zpracování…', progress: 8, output: '', filename: `clipforge-${nickname}.mp4` }
  jobs.set(id, job)
  res.status(202).json({ id })

  void processJob(job, {
    clip: clip.path,
    gameplayCrop,
    cameraCrop,
    nickname,
    platform: ['youtube', 'twitch', 'kick'].includes(body.platform) ? body.platform : 'youtube',
    jobDir,
  }).finally(async () => {
    await fs.rm(clip.path, { force: true })
  })
})

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'Export nebyl nalezen.' })
  const { output: _output, ...publicJob } = job
  res.json(publicJob)
})

app.get('/api/jobs/:id/download', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job || job.state !== 'done') return res.status(404).send('Soubor ještě není připravený.')
  res.type('video/mp4')
  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`)
  createReadStream(job.output).on('error', (error) => res.destroy(error)).pipe(res)
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')))
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(error?.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: error?.code === 'LIMIT_FILE_SIZE' ? 'Video je větší než 1,5 GB.' : 'Server nedokázal požadavek zpracovat.' })
})

app.listen(port, '127.0.0.1', () => console.log(`ClipForge server běží na http://localhost:${port}`))

async function processJob(job, config) {
  try {
    update(job, 'processing', 'Připravuji výřezy a rozložení…', 30)
    const duration = await getDuration(config.clip)
    const assPath = path.join(config.jobDir, 'profile.ass')
    await fs.writeFile(assPath, makeProfileOverlay(config, duration), 'utf8')

    update(job, 'processing', 'Renderuji finální MP4…', 60)
    const output = path.join(config.jobDir, 'output.mp4')
    await renderVideo(config, assPath, output, duration)

    job.output = output
    update(job, 'done', 'Hotovo — klip je připravený ke stažení.', 100)
  } catch (error) {
    console.error(error)
    job.error = friendlyError(error)
    update(job, 'error', 'Export selhal.', job.progress)
  }
}

function update(job, state, phase, progress) { Object.assign(job, { state, phase, progress }) }

async function renderVideo(config, assPath, output, duration) {
  const assFilter = `ass='${escapeFilterPath(assPath)}'`
  const args = ['-y', '-i', config.clip]
  const gameplayCrop = cropFilter(config.gameplayCrop)
  const cameraCrop = cropFilter(config.cameraCrop)
  const filter = `[0:v]split=2[cameraSource][gameSource];[cameraSource]${cameraCrop},scale=1080:640:force_original_aspect_ratio=increase,crop=1080:640[camera];[gameSource]${gameplayCrop},scale=1080:1280:force_original_aspect_ratio=increase,crop=1080:1280[gameplay];[camera][gameplay]vstack=inputs=2,${assFilter}[v]`

  args.push('-filter_complex', filter, '-map', '[v]', '-map', '0:a?', '-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', output)
  await run(ffmpegPath, args)
}

function makeProfileOverlay(config, duration) {
  const handle = `${platformLabel(config.platform)}  @${config.nickname}`.replace(/[{}]/g, '')
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Profile,Arial,38,&H00FFFFFF,&H000000FF,&H00101010,&HC0000000,-1,0,0,0,100,100,0,0,3,0,0,8,40,40,62,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,${assTime(duration)},Profile,,0,0,0,,${handle}\n`
}

function assTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = (safe % 60).toFixed(2).padStart(5, '0')
  return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
}

function platformLabel(platform) { return platform === 'youtube' ? 'YOUTUBE' : platform === 'kick' ? 'KICK' : 'TWITCH' }
function escapeFilterPath(file) { return file.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'") }
function cropFilter(crop) { return `crop=iw*${crop.width}:ih*${crop.height}:iw*${crop.x}:ih*${crop.y}` }

function parseCrop(value) {
  try {
    const crop = JSON.parse(value)
    const numbers = [crop.x, crop.y, crop.width, crop.height]
    if (!numbers.every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width < .05 || crop.height < .05 || crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001) return null
    return { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
  } catch { return null }
}

async function getDuration(file) {
  const output = await run(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], true)
  const duration = Number(output.trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Délku videa se nepodařilo zjistit.')
  return duration
}

function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data) => { stdout += data })
    child.stderr?.on('data', (data) => { stderr += data })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(command)} skončil s kódem ${code}: ${stderr.slice(-1400)}`)))
  })
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('ass') || message.includes('No such filter')) return 'FFmpeg v této instalaci nepodporuje vykreslení profilového štítku.'
  return `Zpracování selhalo: ${message.slice(0, 260)}`
}

setInterval(async () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.state === 'processing') continue
    const expired = await fs.stat(path.join(workRoot, 'jobs', id)).then((stat) => stat.mtimeMs < cutoff).catch(() => false)
    if (expired) {
      jobs.delete(id)
      await fs.rm(path.join(workRoot, 'jobs', id), { recursive: true, force: true })
    }
  }
}, 60 * 60 * 1000).unref()
