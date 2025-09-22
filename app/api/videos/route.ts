import fs from "fs/promises"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const pExec = promisify(execFile)

const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".webm", ".avi"]
const THUMB_DIR = ".thumbs"

function sanitize(name: string) {
  if (name.includes("/") || name.includes("\\"))
    throw new Error("Invalid filename")
  return name
}

async function ensureThumbnail(uploadsDir: string, filename: string): Promise<string> {
  try {
    const thumbsAbs = path.join(uploadsDir, THUMB_DIR)
    await fs.mkdir(thumbsAbs, { recursive: true })
    const thumbName = filename + ".thumb.jpg"
    const thumbAbs = path.join(thumbsAbs, thumbName)
    try {
      await fs.stat(thumbAbs)
      return `/api/videos/thumb/${encodeURIComponent(thumbName)}`
    } catch {

    }

    const videoAbs = path.join(uploadsDir, filename)

    let duration = 0
    try {
      const { stdout } = await pExec("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        videoAbs
      ])
      duration = parseFloat(stdout.trim()) || 0
    } catch {

    }
   
    let ts = 1
    if (duration > 2) {
      ts = Math.min(duration - 1, Math.max(0.5, Math.random() * duration))
    }

    const tmp = thumbAbs + ".tmp"
    try {
      await pExec("ffmpeg", [
        "-ss", ts.toString(),
        "-i", videoAbs,
        "-vframes", "1",
        "-vf", "scale=320:-1",
        "-q:v", "3",
        "-y",
        tmp
      ])
      await fs.rename(tmp, thumbAbs)
      return `/api/videos/thumb/${encodeURIComponent(thumbName)}`
    } catch {

      try { await fs.unlink(tmp) } catch {}
      return ""
    }
  } catch {
    return ""
  }
}

async function buildList(uploadsDir: string) {
  let entries: string[] = []
  try {
    entries = await fs.readdir(uploadsDir)
  } catch {
    return []
  }
  const filtered = entries.filter(f => VIDEO_EXTS.some(ext => f.toLowerCase().endsWith(ext)))
  const out = await Promise.all(filtered.map(async f => ({
    id: f,
    title: f,
    thumbnailUrl: await ensureThumbnail(uploadsDir, f),
    totalFrames: 0,
    frames: []
  })))
  return out
}

export async function GET() {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads")
    const videos = await buildList(uploadsDir)
    return Response.json({ success: true, videos })
  } catch {
    return Response.json({ success: false, error: "Failed to list videos" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const file = url.searchParams.get("file")
    if (!file) return Response.json({ success: false, error: "Missing file" }, { status: 400 })
    const uploadsDir = path.join(process.cwd(), "uploads")
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

    const uploadsDir = path.join(process.cwd(), "uploads")
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
