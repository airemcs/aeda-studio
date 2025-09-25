import fs from "fs/promises"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import Busboy from "busboy"
import { Readable } from "stream"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const pExec = promisify(execFile)

const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".webm", ".avi"]
const THUMB_DIR = "thumbnails"  // new directory name

const UPLOADS_DIR = process.env.VIDEOS_UPLOADS_DIR || path.join(process.cwd(), "uploads")
const PARTS_HIDDEN_DIR = ".parts"  // temp chunk storage root (under uploads)
const ASSEMBLY_HIDDEN_DIR = ".assembling" // temp assembly dir (under uploads)

function log(...args: any[]) {
  if (process.env.THUMB_DEBUG) {
    console.log("[thumb]", ...args)
  }
}

async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true })
  } catch (e: any) {
    log("Failed to create uploads dir", UPLOADS_DIR, e?.message)
    throw e
  }
  return UPLOADS_DIR
}

function sanitize(name: string) {
  if (name.includes("/") || name.includes("\\"))
    throw new Error("Invalid filename")
  return name
}
function sanitizeId(id: string) {
  if (!/^[a-zA-Z0-9_-]{6,128}$/.test(id)) throw new Error("Invalid id")
  return id
}
function toInt(s: string | null, name: string) {
  if (!s) throw new Error(`Missing ${name}`)
  const n = Number(s)
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${name}`)
  return n
}

// In‑memory caches (reset on serverless cold start)
const thumbOk = new Set<string>()            // thumbnails confirmed to exist
const generationLocks = new Map<string, Promise<string>>()  // in‑flight generations
// In‑memory meta cache to avoid fs.stat storms on listing
const metaCache = new Map<string, string>()  // filename -> uploadedAt ISO

let migratedOldThumbs = false
async function migrateOldThumbDir(uploadsDir: string) {
  if (migratedOldThumbs) return
  migratedOldThumbs = true
  const oldDir = path.join(uploadsDir, ".thumbs")
  const newDir = path.join(uploadsDir, THUMB_DIR)
  try {
    const stat = await fs.stat(oldDir).catch(() => null)
    if (!stat) return
    await fs.mkdir(newDir, { recursive: true })
    const files = await fs.readdir(oldDir).catch(() => [])
    await Promise.all(files.map(async f => {
      const src = path.join(oldDir, f)
      const dst = path.join(newDir, f)
      try {
        await fs.stat(dst)
      } catch {
        try { await fs.rename(src, dst) } catch {
          try { await fs.copyFile(src, dst) } catch {}
        }
      }
    }))
  } catch {
    // ignore migration errors
  }
}

let ffmpegChecked = false
let ffmpegAvailable = false
const debugState = {
  ffmpegAvailable: false,
  lastErrors: [] as string[],
  thumbDirAbs: "",
  generated: [] as string[]
}
function pushErr(e: any) {
  const msg = (e?.message || String(e)).slice(0, 500)
  debugState.lastErrors.unshift(msg)
  debugState.lastErrors = debugState.lastErrors.slice(0, 20)
  log("ERROR:", msg)
}

async function checkFfmpegOnce() {
  if (ffmpegChecked) return ffmpegAvailable
  ffmpegChecked = true
  try {
    await pExec("ffmpeg", ["-version"])
    await pExec("ffprobe", ["-version"])
    ffmpegAvailable = true
  } catch (e) {
    pushErr("ffmpeg/ffprobe not available in PATH")
    ffmpegAvailable = false
  }
  debugState.ffmpegAvailable = ffmpegAvailable
  return ffmpegAvailable
}

// Simple throttle queue for ffmpeg (prevents CPU contention)
const ffmpegQueue: Promise<any>[] = []
const MAX_CONCURRENT_FFMPEG = Number(process.env.THUMB_FFMPEG_CONCURRENCY || 2)
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    try { return await task() } finally {
      ffmpegQueue.splice(ffmpegQueue.indexOf(p), 1)
    }
  }
  const active = ffmpegQueue.length
  const p = active >= MAX_CONCURRENT_FFMPEG
    ? ffmpegQueue[active - MAX_CONCURRENT_FFMPEG].then(run)
    : run()
  ffmpegQueue.push(p)
  return p
}

async function ensureThumbnail(uploadsDir: string, filename: string): Promise<string> {
  await migrateOldThumbDir(uploadsDir)
  if (!(await checkFfmpegOnce())) {
    return ""
  }
  try {
    const thumbsAbs = path.join(uploadsDir, THUMB_DIR)
    debugState.thumbDirAbs = thumbsAbs
    await fs.mkdir(thumbsAbs, { recursive: true }).catch(e => {
      pushErr(e)
      throw e
    })
    const thumbName = filename + ".thumb.jpg"
    const thumbAbs = path.resolve(thumbsAbs, thumbName)

    if (thumbOk.has(thumbAbs)) return `/api/videos/thumb/${encodeURIComponent(thumbName)}`

    try {
      await fs.stat(thumbAbs)
      thumbOk.add(thumbAbs)
      return `/api/videos/thumb/${encodeURIComponent(thumbName)}`
    } catch {
      // not there
    }

    if (generationLocks.has(thumbAbs)) {
      log("Awaiting in-flight generation", thumbName)
      return await generationLocks.get(thumbAbs)!
    }

    const genPromise = (async () => {
      const videoAbs = path.join(uploadsDir, filename)
      let duration = 0
      const fast = !!process.env.THUMB_FAST
      if (!fast) {
        try {
          const t0 = Date.now()
          const { stdout } = await pExec("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            videoAbs
          ])
          duration = parseFloat(stdout.trim()) || 0
          if (process.env.THUMB_DEBUG) log("ffprobe ms", Date.now() - t0, filename)
        } catch (e: any) {
          log("ffprobe failed", e?.message)
        }
      }

      let ts = 1
      if (!fast && duration > 2) ts = Math.max(0.5, Math.min(duration - 0.5, duration / 2))

      try {
        const started = Date.now()
        const doGen = async () => {
          log("Generating thumbnail", { videoAbs, thumbAbs, ts, fast })
          await pExec("ffmpeg", [
            "-hide_banner",
            "-loglevel", "error",
            "-ss", ts.toString(),
            "-i", videoAbs,
            "-frames:v", "1",
            "-vf", "scale=320:-1",
            "-q:v", fast ? "5" : "3",
            "-y",
            thumbAbs
          ])
        }
        await enqueue(doGen)
        if (process.env.THUMB_DEBUG) log("ffmpeg gen ms", Date.now() - started, filename)
        try {
          await fs.stat(thumbAbs)
          thumbOk.add(thumbAbs)
          debugState.generated.unshift(thumbAbs)
          debugState.generated = debugState.generated.slice(0, 30)
          if (process.env.THUMB_DEBUG) {
            try {
              const files = await fs.readdir(path.dirname(thumbAbs))
              log("Thumb dir now contains:", files)
            } catch {}
          }
          log("Thumbnail saved", thumbAbs)
          return `/api/videos/thumb/${encodeURIComponent(thumbName)}`
        } catch (e: any) {
          pushErr("After generation file missing: " + e?.message)
          return ""
        }
      } catch (e: any) {
        pushErr(e)
        return ""
      } finally {
        generationLocks.delete(thumbAbs)
      }
    })()

    generationLocks.set(thumbAbs, genPromise)
    return await genPromise
  } catch (e: any) {
    pushErr(e)
    return ""
  }
}

async function quickThumbUrl(uploadsDir: string, filename: string) {
  const thumbName = filename + ".thumb.jpg"
  const thumbAbs = path.join(uploadsDir, THUMB_DIR, thumbName)
  try {
    await fs.stat(thumbAbs)
    return `/api/videos/thumb/${encodeURIComponent(thumbName)}`
  } catch {
    return ""
  }
}

async function buildList(uploadsDir: string, opts: { light?: boolean } = {}) {
  let entries: string[] = []
  try {
    entries = await fs.readdir(uploadsDir)
  } catch {
    return []
  }
  const filtered = entries.filter(f => VIDEO_EXTS.some(ext => f.toLowerCase().endsWith(ext)))
  const out = await Promise.all(filtered.map(async f => {
    let uploadedAt: string | null = null
    if (opts.light) {
      uploadedAt = metaCache.get(f) || null
    }
    if (!uploadedAt) {
      try {
        const st = await fs.stat(path.join(uploadsDir, f))
        uploadedAt = st.mtime.toISOString()
        metaCache.set(f, uploadedAt)
      } catch {}
    }
    const thumbnailUrl = opts.light
      ? await quickThumbUrl(uploadsDir, f)
      : await ensureThumbnail(uploadsDir, f)
    return {
      id: f,
      title: f,
      thumbnailUrl,
      totalFrames: 0,
      frames: [],
      uploadedAt
    }
  }))
  return out
}

// ---------- Parallel chunk upload utilities ----------

type UploadMeta = {
  uploadId: string
  finalName: string
  totalChunks: number
  totalSize?: number
  createdAt: string
  partSize?: number
}

function randomId(len = 20) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
  let s = ""
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

async function ensurePartsDirs(uploadsDir: string) {
  const partsRoot = path.join(uploadsDir, PARTS_HIDDEN_DIR)
  await fs.mkdir(partsRoot, { recursive: true })
  return partsRoot
}
async function ensureAssemblyDir(uploadsDir: string) {
  const assemblyRoot = path.join(uploadsDir, ASSEMBLY_HIDDEN_DIR)
  await fs.mkdir(assemblyRoot, { recursive: true })
  return assemblyRoot
}
function sessionDirFromId(uploadsDir: string, uploadId: string) {
  return path.join(uploadsDir, PARTS_HIDDEN_DIR, uploadId)
}
function metaPath(uploadsDir: string, uploadId: string) {
  return path.join(sessionDirFromId(uploadsDir, uploadId), "meta.json")
}
function partPath(uploadsDir: string, uploadId: string, index: number) {
  return path.join(sessionDirFromId(uploadsDir, uploadId), `${index}.part`)
}
async function writeJson(file: string, obj: any) {
  await fs.writeFile(file, JSON.stringify(obj), "utf8")
}
async function readJson<T = any>(file: string): Promise<T> {
  const s = await fs.readFile(file, "utf8")
  return JSON.parse(s) as T
}
async function safeUniqueFinalName(uploadsDir: string, desired: string) {
  const safe = sanitize(desired)
  const ext = path.extname(safe)
  const base = safe.slice(0, -ext.length)
  let finalName = safe
  let i = 1
  while (true) {
    try { await fs.stat(path.join(uploadsDir, finalName)); finalName = `${base}_${i++}${ext}` } catch { break }
  }
  return finalName
}

// assembly lock to avoid concurrent finalize of same session
const assembleLocks = new Map<string, Promise<any>>()

async function assembleSession(uploadsDir: string, meta: UploadMeta) {
  const lockKey = meta.uploadId
  if (assembleLocks.has(lockKey)) return assembleLocks.get(lockKey)

  const p = (async () => {
    const sessionDir = sessionDirFromId(uploadsDir, meta.uploadId)
    const finalPath = path.join(uploadsDir, meta.finalName)
    await ensureAssemblyDir(uploadsDir)
    const assemblingPath = path.join(uploadsDir, ASSEMBLY_HIDDEN_DIR, `${meta.uploadId}.tmp`)

    // verify all parts exist
    for (let i = 0; i < meta.totalChunks; i++) {
      const pth = partPath(uploadsDir, meta.uploadId, i)
      try {
        await fs.stat(pth)
      } catch {
        throw new Error(`Missing part ${i}`)
      }
    }

    const fsNode = await import("fs")
    await new Promise<void>((resolve, reject) => {
      const ws = fsNode.createWriteStream(assemblingPath, { highWaterMark: 1 << 20 })
      ws.on("error", reject)
      ;(async () => {
        try {
          for (let i = 0; i < meta.totalChunks; i++) {
            const rp = fsNode.createReadStream(partPath(uploadsDir, meta.uploadId, i), { highWaterMark: 1 << 20 })
            await new Promise<void>((res, rej) => {
              rp.on("error", rej)
              rp.on("end", res)
              rp.pipe(ws, { end: false })
            })
          }
          ws.end()
          ws.on("finish", resolve)
        } catch (e) {
          ws.destroy()
          reject(e)
        }
      })().catch(reject)
    })

    // Optionally validate size
    if (meta.totalSize && meta.totalSize > 0) {
      try {
        const st = await fs.stat(assemblingPath)
        if (st.size !== meta.totalSize) {
          throw new Error(`Size mismatch: got ${st.size}, expected ${meta.totalSize}`)
        }
      } catch (e) {
        await fs.unlink(assemblingPath).catch(() => {})
        throw e
      }
    }

    // atomic move into uploads
    await fs.rename(assemblingPath, finalPath)

    // cleanup parts
    try { await fs.rm(sessionDir, { recursive: true, force: true }) } catch {}

    const nowIso = new Date().toISOString()
    metaCache.set(meta.finalName, nowIso)

    if (!process.env.THUMB_DISABLE_ON_UPLOAD) {
      setImmediate(() => { void ensureThumbnail(uploadsDir, meta.finalName).catch(() => {}) })
    }
    return { file: meta.finalName }
  })()

  assembleLocks.set(lockKey, p)
  return p.finally(() => assembleLocks.delete(lockKey))
}

// ---------- Route handlers ----------

export async function GET(req: Request) {
  try {
    await checkFfmpegOnce()
    const uploadsDir = await ensureUploadsDir()
    const url = new URL(req.url)
    const debug = url.searchParams.get("debug")
    const light = url.searchParams.get("light") === "1"
    if (debug === "1") {
      return Response.json({ success: true, debug: debugState })
    }
    const videos = await buildList(uploadsDir, { light })
    return Response.json({
      success: true,
      videos,
      uploadsDir,
      thumbDir: path.join(uploadsDir, THUMB_DIR),
      ffmpeg: debugState.ffmpegAvailable,
      light
    })
  } catch (e: any) {
    pushErr(e)
    return Response.json({ success: false, error: "Failed to list videos", debug: debugState }, { status: 500 })
  }
}

// POST supports:
// - multipart/form-data upload (legacy single-stream)
// - op=init => initialize parallel upload session
// - op=finalize => finalize a session into the final file
export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const op = url.searchParams.get("op")

    const uploadsDir = await ensureUploadsDir()
    await fs.mkdir(path.join(uploadsDir, THUMB_DIR), { recursive: true })

    if (op === "init") {
      // body: { filename, totalChunks, totalSize?, partSize? }
      const payload = await req.json().catch(() => ({}))
      const desired = sanitize(String(payload.filename || "upload.bin"))
      const totalChunks = Number(payload.totalChunks)
      const totalSize = payload.totalSize ? Number(payload.totalSize) : undefined
      const partSize = payload.partSize ? Number(payload.partSize) : undefined
      if (!Number.isInteger(totalChunks) || totalChunks <= 0)
        return Response.json({ success: false, error: "Invalid totalChunks" }, { status: 400 })

      const finalName = await safeUniqueFinalName(uploadsDir, desired)
      const uploadId = randomId(24)
      const partsRoot = await ensurePartsDirs(uploadsDir)
      const sessionDir = path.join(partsRoot, uploadId)
      await fs.mkdir(sessionDir, { recursive: true })
      const meta: UploadMeta = {
        uploadId,
        finalName,
        totalChunks,
        totalSize,
        partSize,
        createdAt: new Date().toISOString()
      }
      await writeJson(metaPath(uploadsDir, uploadId), meta)
      return Response.json({ success: true, uploadId, finalName, totalChunks })
    }

    if (op === "finalize") {
      const uploadId = sanitizeId(url.searchParams.get("uploadId") || "")
      const minimal = url.searchParams.get("minimal") === "1" || !!process.env.THUMB_SKIP_LIST_AFTER_UPLOAD
      const meta = await readJson<UploadMeta>(metaPath(uploadsDir, uploadId)).catch(() => null)
      if (!meta) return Response.json({ success: false, error: "Unknown uploadId" }, { status: 400 })
      try {
        const { file } = await assembleSession(uploadsDir, meta)
        if (minimal) return Response.json({ success: true, file })
        const videos = await buildList(uploadsDir, { light: true })
        return Response.json({ success: true, file, videos })
      } catch (e: any) {
        pushErr(e)
        return Response.json({ success: false, error: e?.message || "Finalize failed" }, { status: 500 })
      }
    }

    // Default: legacy multipart upload
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.startsWith("multipart/form-data"))
      return Response.json({ success: false, error: "Expected multipart/form-data or op=init/finalize" }, { status: 400 })

    const minimal = url.searchParams.get("minimal") === "1" || !!process.env.THUMB_SKIP_LIST_AFTER_UPLOAD

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_BYTES || 0) || undefined,
        files: Number(process.env.UPLOAD_MAX_FILES || 50)
      }
    })
    const saved: { file: string; size: number }[] = []

    const done = new Promise<void>((resolve, reject) => {
      bb.on("file", (name, file, info) => {
        const orig = sanitize(info.filename || "upload.bin")
        const ext = path.extname(orig)
        const base = orig.slice(0, -ext.length) || "file"
        let finalName = orig
        let counter = 1
        const targetPath = () => path.join(uploadsDir, finalName)
        const ensureUnique = async () => {
          while (true) {
            try { await fs.stat(targetPath()); finalName = `${base}_${counter++}${ext}` } catch { break }
          }
        }

        let bytes = 0
        ;(async () => {
          await ensureUnique()
          const ws = (await import("fs")).createWriteStream(targetPath(), { highWaterMark: 1 << 20 })
          file.on("data", (d: Buffer) => { bytes += d.length })
          file.on("error", reject)
          ws.on("error", reject)
          ws.on("finish", () => {
            saved.push({ file: finalName, size: bytes })
            const nowIso = new Date().toISOString()
            metaCache.set(finalName, nowIso)
            if (!process.env.THUMB_DISABLE_ON_UPLOAD) {
              setImmediate(() => { void ensureThumbnail(uploadsDir, finalName).catch(() => {}) })
            }
          })
          file.pipe(ws)
        })().catch(reject)
      })
      bb.on("error", reject)
      bb.on("finish", resolve)
    })

    const nodeStream = Readable.fromWeb(req.body as any)
    nodeStream.pipe(bb)
    await done

    if (minimal) {
      return Response.json({ success: true, uploaded: saved })
    }

    const videos = await buildList(uploadsDir, { light: true })
    return Response.json({ success: true, uploaded: saved, videos })
  } catch (e: any) {
    pushErr(e)
    return Response.json({ success: false, error: "Upload failed" }, { status: 500 })
  }
}

// PUT supports:
// - op=part => raw chunk upload for a session (parallel friendly)
// - legacy raw full-file upload (no multipart, single stream)
export async function PUT(req: Request) {
  try {
    const url = new URL(req.url)
    const op = url.searchParams.get("op")
    const uploadsDir = await ensureUploadsDir()

    if (op === "part") {
      const uploadId = sanitizeId(url.searchParams.get("uploadId") || "")
      const index = toInt(url.searchParams.get("index"), "index")
      const meta = await readJson<UploadMeta>(metaPath(uploadsDir, uploadId)).catch(() => null)
      if (!meta) return Response.json({ success: false, error: "Unknown uploadId" }, { status: 400 })
      if (index >= meta.totalChunks) return Response.json({ success: false, error: "index out of range" }, { status: 400 })

      const sessionDir = sessionDirFromId(uploadsDir, uploadId)
      await fs.mkdir(sessionDir, { recursive: true })

      const dest = partPath(uploadsDir, uploadId, index)
      // If part exists and matches size, accept idempotently
      const expected = req.headers.get("content-length") ? Number(req.headers.get("content-length")) : undefined
      if (expected !== undefined && Number.isFinite(expected)) {
        try {
          const st = await fs.stat(dest)
          if (st.size === expected) {
            return Response.json({ success: true, index, skipped: true })
          }
        } catch {}
      }

      const fh = await fs.open(dest, "w")
      let bytes = 0
      try {
        const nodeStream = Readable.fromWeb(req.body as any)
        for await (const chunk of nodeStream as any) {
          if (chunk) {
            bytes += chunk.length || chunk.byteLength || 0
            await fh.write(chunk)
          }
        }
      } finally {
        await fh.close()
      }
      return Response.json({ success: true, index, size: bytes })
    }

    // Legacy raw upload (single stream)
    const filenameParam = url.searchParams.get("filename")
    if (!filenameParam) return Response.json({ success: false, error: "Missing filename (or use op=part)" }, { status: 400 })
    const minimal = url.searchParams.get("minimal") === "1" || !!process.env.THUMB_SKIP_LIST_AFTER_UPLOAD
    const safe = sanitize(filenameParam)

    let finalName = safe
    const ext = path.extname(safe)
    const base = safe.slice(0, -ext.length)
    let i = 1
    while (true) {
      try { await fs.stat(path.join(uploadsDir, finalName)); finalName = `${base}_${i++}${ext}` } catch { break }
    }

    const fullPath = path.join(uploadsDir, finalName)
    const fh = await fs.open(fullPath, "w")
    const t0 = Date.now()
    try {
      const nodeStream = Readable.fromWeb(req.body as any)
      for await (const chunk of nodeStream as any) {
        if (chunk) await fh.write(chunk)
      }
    } finally {
      await fh.close()
    }
    if (process.env.THUMB_DEBUG) log("PUT upload ms", Date.now() - t0, finalName)

    const nowIso = new Date().toISOString()
    metaCache.set(finalName, nowIso)

    if (!process.env.THUMB_DISABLE_ON_UPLOAD) {
      setImmediate(() => { void ensureThumbnail(uploadsDir, finalName).catch(() => {}) })
    }

    if (minimal) {
      return Response.json({ success: true, file: finalName })
    }
    const videos = await buildList(uploadsDir, { light: true })
    return Response.json({ success: true, file: finalName, videos })
  } catch (e: any) {
    pushErr(e)
    return Response.json({ success: false, error: "Raw upload failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const file = url.searchParams.get("file")
    if (!file) return Response.json({ success: false, error: "Missing file" }, { status: 400 })
    const uploadsDir = await ensureUploadsDir()
    const target = path.join(uploadsDir, sanitize(file))
    await fs.unlink(target).catch(() => {})
    const thumb = path.join(uploadsDir, THUMB_DIR, file + ".thumb.jpg")
    await fs.unlink(thumb).catch(() => {})
    const videos = await buildList(uploadsDir)
    return Response.json({ success: true, videos })
  } catch {
    return Response.json({ success: false, error: "Delete failed" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const { file, newName } = body || {}
    if (!file || !newName)
      return Response.json({ success: false, error: "Missing file or newName" }, { status: 400 })

    const uploadsDir = await ensureUploadsDir()
    const oldName = sanitize(file)
    const oldPath = path.join(uploadsDir, oldName)

    const ext = path.extname(oldName)
    const base = newName.replace(/\.[^/.]+$/, "")
    const finalName = sanitize(base + ext)
    const newPath = path.join(uploadsDir, finalName)

    await fs.rename(oldPath, newPath)
    const oldThumb = path.join(uploadsDir, THUMB_DIR, oldName + ".thumb.jpg")
    const newThumb = path.join(uploadsDir, THUMB_DIR, finalName + ".thumb.jpg")
    try { await fs.rename(oldThumb, newThumb) } catch {}

    const videos = await buildList(uploadsDir)
    return Response.json({ success: true, videos, renamedTo: finalName })
  } catch {
    return Response.json({ success: false, error: "Rename failed" }, { status: 500 })
  }
}