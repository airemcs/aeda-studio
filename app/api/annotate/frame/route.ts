import path from "path"
import fs from "fs/promises"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function bad(name: string) {
  return !name || name.includes("/") || name.includes("\\")
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const set = url.searchParams.get("set") || ""
    const f = url.searchParams.get("f") || ""
    if (bad(set) || bad(f)) return new Response("Bad request", { status: 400 })

    const framePath = path.join(process.cwd(), "uploads", ".frames", set, f)
    const data = await fs.readFile(framePath)
    return new Response(data, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store"
      }
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
