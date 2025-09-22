import fs from "fs/promises"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function bad(v: string) {
  return !v || v.includes("/") || v.includes("\\")
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const video = url.searchParams.get("video") || ""
    if (bad(video)) {
      return Response.json({ success: false, error: "Bad video" }, { status: 400 })
    }
    const countsPath = path.join(process.cwd(), "uploads", ".saved_frames", video, "counts.json")
    let raw: string
    try {
      raw = await fs.readFile(countsPath, "utf8")
    } catch {
      return Response.json({ success: true, video, aggregate: {}, frames: [] })
    }
    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      return Response.json({ success: false, error: "Parse error" }, { status: 500 })
    }
    return Response.json({
      success: true,
      video: data.video || video,
      aggregate: data.aggregate || {},
      frames: Array.isArray(data.frames) ? data.frames : []
    })
  } catch {
    return Response.json({ success: false, error: "Failed" }, { status: 500 })
  }
}
