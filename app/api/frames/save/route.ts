import fs from "fs/promises"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function bad(name: string) {
  return !name || name.includes("/") || name.includes("\\")
}

interface IncomingFrame {
  index: number
  base64: string
  vehicleCounts?: { name: string; count: number }[]
  instances?: { id: string; label: string; bbox?: [number, number, number, number]; confidence?: number }[]
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const video: string = body.video
    const frames: IncomingFrame[] = body.frames || []
    if (!video || bad(video) || !Array.isArray(frames)) {
      return Response.json({ success: false, error: "Invalid payload" }, { status: 400 })
    }

    const baseDir = path.join(process.cwd(), "uploads", ".saved_frames", video)
    await fs.mkdir(baseDir, { recursive: true })

    const written: string[] = []
    const countsPerFrame: {
      index: number
      vehicleCounts: { name: string; count: number }[]
      instances?: IncomingFrame["instances"]
      totalVehicles: number
    }[] = []

    for (const f of frames) {
      if (!f || typeof f.index !== "number" || !f.base64) continue
      const fileName = `frame-${String(f.index).padStart(5, "0")}.jpg`
      const full = path.join(baseDir, fileName)

      try {
        await fs.access(full)
      } catch {
        const buf = Buffer.from(f.base64, "base64")
        await fs.writeFile(full, buf)
      }
      written.push(fileName)

      const vc = Array.isArray(f.vehicleCounts) ? f.vehicleCounts : []
      countsPerFrame.push({
        index: f.index,
        vehicleCounts: vc,
        instances: Array.isArray(f.instances) ? f.instances : undefined,
        totalVehicles: vc.reduce((a, c) => a + (c.count || 0), 0)
      })
    }

    written.sort()

    const aggregate: Record<string, number> = {}
    for (const fr of countsPerFrame) {
      for (const c of fr.vehicleCounts) {
        aggregate[c.name] = (aggregate[c.name] || 0) + c.count
      }
    }

    const countsPath = path.join(baseDir, "counts.json")
    const countsPayload = {
      video,
      frameCount: written.length,
      aggregate,
      frames: countsPerFrame.sort((a, b) => a.index - b.index),
      updatedAt: new Date().toISOString()
    }
    await fs.writeFile(countsPath, JSON.stringify(countsPayload, null, 2), "utf8")

    const removed: string[] = []
    try {
      const framesRoot = path.join(process.cwd(), "uploads", ".frames")
      const baseName = video.replace(/\.[^/.]+$/, "")
      let entries: string[] = []
      try {
        entries = await fs.readdir(framesRoot)
      } catch {
        entries = []
      }

      const targets = new Set<string>()
      for (const d of entries) {
        if (d === video || d === baseName || d.startsWith(baseName + "_")) {
          targets.add(d)
        }
      }

      for (const d of targets) {
        const full = path.join(framesRoot, d)
        try {
          const stat = await fs.stat(full)
          if (stat.isDirectory()) {
            await fs.rm(full, { recursive: true, force: true })
            removed.push(d)
          }
        } catch {
      
        }
      }
    } catch {
     
    }

    return Response.json({
      success: true,
      files: written,
      countsFile: "counts.json",
      cleanup: { removed }
    })
  } catch {
    return Response.json({ success: false, error: "Save failed" }, { status: 500 })
  }
}
