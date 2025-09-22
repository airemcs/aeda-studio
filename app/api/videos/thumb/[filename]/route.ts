import fs from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await ctx.params
    const safe = filename.replace(/[/\\]/g, "")
    if (safe !== filename) return new Response("Bad name", { status: 400 })
    const filePath = path.join(process.cwd(), "uploads", ".thumbs", safe)
    const data = await fs.readFile(filePath)
    return new Response(data, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=60",
      }
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
