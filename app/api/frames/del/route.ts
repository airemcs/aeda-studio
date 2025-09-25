import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"

type Payload = {
  videoId: string
  frameNumber?: number
  file?: string
  renumber?: boolean
  action?: 'delete' | 'restore' | 'list'         // list added
}

const FRAME_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"])
const FRAMES_ROOT = process.env.FRAMES_DIR
  ? path.resolve(process.env.FRAMES_DIR)
  : path.join(process.cwd(), "uploads", ".saved_frames") // soft delete target root

function sortNatural(a: string, b: string) {
  const na = a.match(/\d+/); const nb = b.match(/\d+/)
  if (na && nb) {
    const diff = parseInt(na[0], 10) - parseInt(nb[0], 10)
    if (diff !== 0) return diff
  }
  return a.localeCompare(b)
}

async function listFrameFiles(dir: string) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter(d => d.isFile())
      .map(d => d.name)
      .filter(n => FRAME_EXTS.has(path.extname(n).toLowerCase()))
      .sort(sortNatural)
  } catch {
    return []
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Payload
    if (!body?.videoId) {
      return NextResponse.json({ success: false, error: "videoId required" }, { status: 400 })
    }
    const { videoId, frameNumber, file, action = 'delete' } = body
    const videoDir = path.join(FRAMES_ROOT, videoId)
    const deletedDir = path.join(videoDir, "_deleted")
    try { await fs.access(videoDir) } catch {
      return NextResponse.json({ success: false, error: "Video frames directory not found" }, { status: 404 })
    }

    // NEW: list action
    if (action === 'list') {
      const active = await listFrameFiles(videoDir)
      let deleted: string[] = []
      try {
        const entries = await fs.readdir(deletedDir, { withFileTypes: true })
        deleted = entries
          .filter(d => d.isFile())
          .map(d => d.name)
          .filter(n => FRAME_EXTS.has(path.extname(n).toLowerCase()))
          .sort(sortNatural)
      } catch {}
      return NextResponse.json({
        success: true,
        action: 'list',
        active,
        deleted,
        activeCount: active.length,
        deletedCount: deleted.length
      })
    }

    if (action === 'restore') {
      if (!file) return NextResponse.json({ success: false, error: "file required to restore" }, { status: 400 })
      try { await fs.access(deletedDir) } catch {
        return NextResponse.json({ success: false, error: "No deleted store" }, { status: 404 })
      }
      const from = path.join(deletedDir, file)
      const to = path.join(videoDir, file)
      try { await fs.rename(from, to) } catch (e: any) {
        return NextResponse.json({ success: false, error: "Restore failed: " + (e?.message || "") }, { status: 500 })
      }
      const remaining = await listFrameFiles(videoDir)
      return NextResponse.json({ success: true, action: 'restore', restored: file, remainingCount: remaining.length, remaining })
    }

    // DELETE (soft)
    const files = await listFrameFiles(videoDir)
    if (!files.length) return NextResponse.json({ success: false, error: "No frames to delete" }, { status: 404 })

    let targetFile: string | undefined
    if (file) {
      if (!files.includes(file)) {
        return NextResponse.json({ success: false, error: "Specified file not found" }, { status: 404 })
      }
      targetFile = file
    } else if (typeof frameNumber === 'number') {
      if (frameNumber < 0 || frameNumber >= files.length) {
        return NextResponse.json({ success: false, error: "frameNumber out of range" }, { status: 400 })
      }
      targetFile = files[frameNumber]
    } else {
      return NextResponse.json({ success: false, error: "Provide file or frameNumber" }, { status: 400 })
    }

    await fs.mkdir(deletedDir, { recursive: true })
    const from = path.join(videoDir, targetFile!)
    const to = path.join(deletedDir, targetFile!)
    try { await fs.rename(from, to) } catch (e: any) {
      return NextResponse.json({ success: false, error: "Soft delete failed: " + (e?.message || "") }, { status: 500 })
    }

    const remaining = await listFrameFiles(videoDir)
    return NextResponse.json({
      success: true,
      action: 'delete',
      deleted: targetFile,
      remainingCount: remaining.length,
      remaining
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 })
  }
}
