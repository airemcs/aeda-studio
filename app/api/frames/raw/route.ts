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
    const file = url.searchParams.get("file") || ""
    if (bad(video) || bad(file)) {
      return new Response("Bad request", { status: 400 })
    }
    const full = path.join(process.cwd(), "uploads", ".saved_frames", video, file)
    const data = await fs.readFile(full)
    return new Response(data, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
