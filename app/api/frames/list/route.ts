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
    if (bad(video)) return Response.json({ success: false, error: "Bad video" }, { status: 400 })
    const dir = path.join(process.cwd(), "uploads", ".saved_frames", video)
    let entries: string[] = []
    try {
      entries = await fs.readdir(dir)
    } catch {
      return Response.json({ success: true, files: [] })
    }
    const files = entries
      .filter(f => /frame-\d+\.jpg$/i.test(f))
      .sort()
    return Response.json({ success: true, files })
  } catch {
    return Response.json({ success: false, error: "List failed" }, { status: 500 })
  }
}
