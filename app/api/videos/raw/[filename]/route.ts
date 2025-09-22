import fs from "fs/promises"
import { createReadStream } from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs" 

function contentType(file: string) {
  const ext = path.extname(file).toLowerCase()
  switch (ext) {
    case ".mp4": return "video/mp4"
    case ".webm": return "video/webm"
    case ".mov": return "video/quicktime"
    case ".mkv": return "video/x-matroska"
    case ".avi": return "video/x-msvideo"
    default: return "application/octet-stream"
  }
}

function invalid(name: string) {
  return name.includes("/") || name.includes("\\")
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ filename: string }> } 
) {
  try {
    const { filename } = await ctx.params
    const file = decodeURIComponent(filename)
    if (invalid(file)) return new Response("Invalid filename", { status: 400 })

    const uploadsDir = path.join(process.cwd(), "uploads")
    const full = path.join(uploadsDir, file)
    const stat = await fs.stat(full)
    const fileSize = stat.size
    const range = req.headers.get("range")
    const type = contentType(file)

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      if (!match) return new Response("Malformed Range", { status: 416 })
      let start = match[1] ? parseInt(match[1], 10) : 0
      let end = match[2] ? parseInt(match[2], 10) : fileSize - 1
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
        return new Response("Unsatisfiable Range", { status: 416 })
      }
      const chunkSize = end - start + 1
      const stream = createReadStream(full, { start, end })
      return new Response(stream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": type,
          "Cache-Control": "no-store"
        }
      })
    }

    const stream = createReadStream(full)
    return new Response(stream as any, {
      headers: {
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Content-Type": type,
        "Cache-Control": "no-store"
      }
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
