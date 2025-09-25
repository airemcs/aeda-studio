import path from "path"
import fs from "fs/promises"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const REMOTE_URL = process.env.ANNOTATE_URL || "http://localhost:26000/process-video"

function bad(name: string) {
  return !name || name.includes("/") || name.includes("\\")
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const file = url.searchParams.get("file")
    if (!file || bad(file)) {
      return new Response("Missing file", { status: 400 })
    }
    const uploadsDir = path.join(process.cwd(), "uploads")
    const full = path.join(uploadsDir, file)
    try { await fs.access(full) } catch { return new Response("Not found", { status: 404 }) }

    const data = await fs.readFile(full)
    const fd = new FormData()
    fd.append("file", new Blob([data]), file)
    fd.append("stream", "true")
    fd.append("include_frames", "true")
    fd.append("downscale_to", "720")
    fd.append("encode_ext", ".jpg")
    fd.append("encode_quality", "80")

    const resp = await fetch(REMOTE_URL, { method: "POST", body: fd })
    if (!resp.ok || !resp.body) {
      return new Response("Upstream error", { status: 502 })
    }

    // Simple pass-through (no server buffering)
    return new Response(resp.body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no"
      }
    })
  } catch {
    return new Response("Proxy failure", { status: 500 })
  }
}
