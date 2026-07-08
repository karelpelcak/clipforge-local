import { ZipArchive } from 'archiver'
import cors from 'cors'
import express from 'express'
import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import multer from 'multer'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workRoot = path.join(root, '.clipforge')
const port = 8790
const upload = multer({ dest: path.join(workRoot, 'uploads'), limits: { fileSize: 1_500_000_000, files: 10 } })
const jobs = new Map()
const app = express()

await fs.mkdir(path.join(workRoot, 'uploads'), { recursive: true })
await fs.mkdir(path.join(workRoot, 'jobs'), { recursive: true })

app.use(cors())
app.use(express.json())

app.post('/api/jobs', upload.array('clips', 10), async (req, res) => {
  const body = req.body || {}
  const clips = Array.isArray(req.files) ? req.files : []
  const items = parseItems(body.items)
  const reject = async (message) => {
    await Promise.all(clips.map((clip) => fs.rm(clip.path, { force: true })))
    return res.status(400).json({ error: message })
  }

  if (!clips.length) return reject('Chybí zdrojové klipy.')
  if (!items || items.length !== clips.length) return reject('Nastavení klipů není platné.')

  const clipConfigs = clips.map((clip, index) => ({
    clip: clip.path,
    originalName: sanitizeBaseName(items[index].originalName || clip.originalname),
    nickname: sanitizeNickname(items[index].nickname),
    gameplayCrop: parseCrop(items[index].gameplayCrop),
    cameraCrop: parseCrop(items[index].cameraCrop),
  }))
  if (clipConfigs.some((clip) => !clip.gameplayCrop || !clip.cameraCrop)) return reject('Některý klip má neplatné výřezy.')
  if (clipConfigs.some((clip) => !clip.nickname)) return reject('Každý klip musí mít vlastní nickname.')

  const id = crypto.randomUUID()
  const jobDir = path.join(workRoot, 'jobs', id)
  await fs.mkdir(jobDir, { recursive: true })
  const batch = clips.length > 1
  const job = {
    id,
    state: 'queued',
    phase: 'Čekám na zpracování…',
    progress: 5,
    completed: 0,
    total: clips.length,
    output: '',
    filename: batch ? `clipforge-batch-${id.slice(0, 8)}.zip` : `clipforge-${clipConfigs[0].nickname}.mp4`,
    contentType: batch ? 'application/zip' : 'video/mp4',
  }
  jobs.set(id, job)
  res.status(202).json({ id })

  void processBatch(job, clipConfigs, {
    platform: ['youtube', 'twitch', 'kick'].includes(body.platform) ? body.platform : 'youtube',
    jobDir,
  }).finally(async () => {
    await Promise.all(clips.map((clip) => fs.rm(clip.path, { force: true })))
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
  res.type(job.contentType)
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
  const uploadError = error?.code === 'LIMIT_FILE_SIZE' ? 'Video je větší než 1,5 GB.' : error?.code === 'LIMIT_FILE_COUNT' ? 'Najednou lze zpracovat maximálně 10 klipů.' : null
  res.status(uploadError ? 413 : 500).json({ error: uploadError || 'Server nedokázal požadavek zpracovat.' })
})

app.listen(port, '127.0.0.1', () => console.log(`ClipForge server běží na http://localhost:${port}`))

async function processBatch(job, clips, shared) {
  try {
    const outputs = []
    for (let index = 0; index < clips.length; index += 1) {
      const clip = clips[index]
      const label = `${index + 1}/${clips.length}: ${clip.originalName}`
      update(job, 'processing', `Připravuji ${label}`, 8 + Math.floor(index / clips.length * 82))
      const clipDir = path.join(shared.jobDir, `clip-${String(index + 1).padStart(2, '0')}`)
      await fs.mkdir(clipDir, { recursive: true })
      const config = { ...shared, ...clip, jobDir: clipDir }
      const duration = await getDuration(config.clip)
      const assPath = path.join(clipDir, 'profile.ass')
      await fs.writeFile(assPath, makeProfileOverlay(config, duration), 'utf8')
      update(job, 'processing', `Renderuji ${label}`, 12 + Math.floor(index / clips.length * 82))
      const name = `${String(index + 1).padStart(2, '0')}-${clip.originalName}.mp4`
      const output = path.join(clipDir, name)
      await renderVideo(config, assPath, output, duration)
      outputs.push({ path: output, name })
      job.completed = index + 1
    }

    if (outputs.length === 1) job.output = outputs[0].path
    else {
      update(job, 'processing', 'Balím hotové klipy do ZIPu…', 94)
      job.output = path.join(shared.jobDir, job.filename)
      await createZip(outputs, job.output)
    }
    update(job, 'done', outputs.length > 1 ? 'Hotovo — všechny klipy jsou zabalené v ZIPu.' : 'Hotovo — klip je připravený ke stažení.', 100)
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
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Profile,Arial,38,&H00FFFFFF,&H000000FF,&H00101010,&HC0000000,-1,0,0,0,100,100,0,0,3,0,0,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,${assTime(duration)},Profile,,0,0,0,,{\\an5\\pos(540,640)}${handle}\n`
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
    const crop = typeof value === 'string' ? JSON.parse(value) : value
    const numbers = [crop.x, crop.y, crop.width, crop.height]
    if (!numbers.every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width < .05 || crop.height < .05 || crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001) return null
    return { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
  } catch { return null }
}

function parseItems(value) {
  try {
    const items = JSON.parse(value)
    return Array.isArray(items) && items.length <= 10 ? items : null
  } catch { return null }
}

function sanitizeBaseName(value) {
  const base = path.parse(String(value || 'clip')).name
  return base.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'clip'
}

function sanitizeNickname(value) {
  return String(value || '').trim().replace(/^@/, '').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 32)
}

function createZip(files, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = new ZipArchive({ zlib: { level: 6 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    files.forEach((file) => archive.file(file.path, { name: file.name }))
    void archive.finalize()
  })
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
