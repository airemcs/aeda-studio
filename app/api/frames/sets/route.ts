import fs from "fs/promises"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function listSets(root: string) {
  let dirs: string[] = []
  try { dirs = await fs.readdir(root) } catch { return [] }
  const sets: { id: string; firstFrameFile: string | null; totalFrames: number }[] = []
  for (const d of dirs) {
    if (d.startsWith(".")) continue
    const full = path.join(root, d)
    let stat
    try { stat = await fs.stat(full) } catch { continue }
    if (!stat.isDirectory()) continue
    let files: string[] = []
    try { files = await fs.readdir(full) } catch { files = [] }
    const frameFiles = files.filter(f => /frame-\d+\.jpg$/i.test(f)).sort()
    sets.push({
      id: d,
      firstFrameFile: frameFiles[0] || null,
      totalFrames: frameFiles.length
    })
  }
  sets.sort((a, b) => a.id.localeCompare(b.id))
  return sets
}

function bad(v: string) {
  return !v || v.includes("/") || v.includes("\\")
}

export async function GET() {
  try {
    const root = path.join(process.cwd(), "uploads", ".saved_frames")
    const sets = await listSets(root)
    return Response.json({ success: true, sets })
  } catch {
    return Response.json({ success: false, sets: [] }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const video = url.searchParams.get("video") || ""
    if (bad(video)) {
      return Response.json({ success: false, error: "Bad video" }, { status: 400 })
    }
    const root = path.join(process.cwd(), "uploads", ".saved_frames")
    const target = path.join(root, video)
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    const sets = await listSets(root)
    return Response.json({ success: true, sets, deleted: video })
  } catch {
    return Response.json({ success: false, error: "Delete failed" }, { status: 500 })
  }
}
