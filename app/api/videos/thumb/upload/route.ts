import fs from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function bad(name: string) {
  return !name || name.includes("/") || name.includes("\\")
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { filename, imageBase64, overwrite = false } = body || {}
    if (bad(filename) || typeof imageBase64 !== "string" || !imageBase64.trim()) {
      return Response.json({ success: false, error: "Invalid payload" }, { status: 400 })
    }
    const uploadsDir = path.join(process.cwd(), "uploads")
    const thumbsDir = path.join(uploadsDir, ".thumbs")
    await fs.mkdir(thumbsDir, { recursive: true })
    const thumbName = filename + ".thumb.jpg"
    const dest = path.join(thumbsDir, thumbName)

    const exists = await fs.stat(dest).catch(() => null)
    if (exists && !overwrite) {
      return Response.json({ success: true, existed: true, url: `/api/videos/thumb/${encodeURIComponent(thumbName)}?v=${Math.trunc(exists.mtimeMs)}` })
    }

    let raw = imageBase64
    if (/^data:image\/\w+;base64,/.test(raw)) {
      raw = raw.split(",")[1]
    }
    const buf = Buffer.from(raw, "base64")
    await fs.writeFile(dest, buf)
    const st = await fs.stat(dest)
    return Response.json({
      success: true,
      url: `/api/videos/thumb/${encodeURIComponent(thumbName)}?v=${Math.trunc(st.mtimeMs)}`
    })
  } catch {
    return Response.json({ success: false, error: "Save failed" }, { status: 500 })
  }
}
