import fs from "fs/promises"
import fsc from "fs"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const pExec = promisify(execFile)
const THUMB_DIR = "thumbnails"
const UPLOADS_DIR = process.env.VIDEOS_UPLOADS_DIR || path.join(process.cwd(), "uploads")

// Match main API sanitize (only block path separators)
function sanitize(name: string) {
  if (name.includes("/") || name.includes("\\")) throw new Error("Bad name")
  return name
}

const genLocks = new Map<string, Promise<boolean>>()

async function ensureThumbExists(fileAbs: string, videoAbs: string): Promise<boolean> {
  // Fast disk check first
  try {
    const s = await fs.stat(fileAbs)
    if (s.isFile()) return true
  } catch {}

  if (genLocks.has(fileAbs)) return genLocks.get(fileAbs)!
  const promise = (async () => {
    // Check ffmpeg presence
    try { await pExec("ffmpeg", ["-version"]) } catch { return false }

    // Determine timestamp (optional)
    let ts = "1"
    try {
      const { stdout } = await pExec("ffprobe", [
        "-v","error",
        "-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",
        videoAbs
      ])
      const dur = parseFloat(stdout.trim())
      if (dur && dur > 2) {
        const mid = Math.max(0.5, Math.min(dur - 0.5, dur / 2))
        ts = mid.toString()
      }
    } catch {}

    try {
      await fs.mkdir(path.dirname(fileAbs), { recursive: true })
      await pExec("ffmpeg", [
        "-hide_banner","-loglevel","error",
        "-ss", ts,
        "-i", videoAbs,
        "-frames:v","1",
        "-vf","scale=320:-1",
        "-q:v","3",
        "-y",
        fileAbs
      ])
      // Verify
      try {
        const s = await fs.stat(fileAbs)
        return s.isFile()
      } catch { return false }
    } catch {
      return false
    } finally {
      genLocks.delete(fileAbs)
    }
  })()
  genLocks.set(fileAbs, promise)
  return promise
}

function tinyPlaceholder(): Response {
  // 1x1 transparent GIF
  const b64 = "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
  return new Response(Buffer.from(b64, "base64"), {
    status: 200,
    headers: {
      "Content-Type":"image/gif",
      "Cache-Control":"public, max-age=60",
      "X-Thumb-Placeholder":"1"
    }
  })
}

export async function GET(req: Request, ctx: { params: { name: string } }) {
  try {
    const url = new URL(req.url)
    const debug = url.searchParams.get("debug") === "1"
    const raw = await ctx.params.name
    const name = sanitize(decodeURIComponent(raw))
    const fileAbs = path.join(UPLOADS_DIR, THUMB_DIR, name)

    // If missing, attempt lazy generation (extract original video file name)
    let stat = await fs.stat(fileAbs).catch(() => null)
    if (!stat && name.endsWith(".thumb.jpg")) {
      const videoName = name.slice(0, -".thumb.jpg".length)  // original video filename
      const videoAbs = path.join(UPLOADS_DIR, sanitize(videoName))
      const vStat = await fs.stat(videoAbs).catch(() => null)
      if (vStat && vStat.isFile()) {
        const ok = await ensureThumbExists(fileAbs, videoAbs)
        if (ok) stat = await fs.stat(fileAbs).catch(() => null)
      }
    }

    if (debug) {
      return Response.json({
        requested: name,
        exists: !!stat,
        path: fileAbs,
        generated: !!stat,
        lock: genLocks.has(fileAbs)
      })
    }

    if (!stat || !stat.isFile()) {
      // Return placeholder instead of 404 to avoid broken UI (change to 404 if preferred)
      return tinyPlaceholder()
    }

    const etag = `"${stat.size}-${stat.mtimeMs}"`
    const ifNone = req.headers.get("if-none-match")
    if (ifNone === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }

    // Stream file
    const stream = fsc.createReadStream(fileAbs)
    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Type":"image/jpeg",
        "Cache-Control":"public, max-age=3600, immutable",
        "ETag": etag
      }
    })
  } catch {
    return tinyPlaceholder()
  }
}
