import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const CHUNK_DIR = path.join(UPLOAD_DIR, ".chunks");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function sanitizeFilename(name: string) {
  name = name.replace(/[/\\]/g, "");

  if (!/^[\w ().-]+$/.test(name)) {

    const ext = path.extname(name);
    return randomUUID() + ext;
  }
  return name;
}

async function saveFile(file: File, originalName: string) {
  await ensureDir(UPLOAD_DIR);
  const clean = sanitizeFilename(originalName);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const finalPath = path.join(UPLOAD_DIR, clean);
  await fs.writeFile(finalPath, buffer);
  return { original: originalName, stored: clean, size: buffer.length };
}

async function handleStandard(form: FormData) {
  const fileEntries: File[] = [];
  for (const [key, value] of form.entries()) {
    if (
      value instanceof File &&
      (key === "file" ||
        key === "files" ||
        key.toLowerCase().includes("file"))
    ) {
      fileEntries.push(value);
    }
  }
  const results = [];
  for (const f of fileEntries) {
    results.push(await saveFile(f, f.name));
  }
  return Response.json({ success: true, files: results });
}

async function handleChunk(form: FormData) {
  const file = form.get("file");
  const fileId = form.get("fileId");
  const chunkIndex = form.get("chunkIndex");
  const totalChunks = form.get("totalChunks");
  const originalFilename = form.get("originalFilename");

  if (
    !(file instanceof File) ||
    typeof fileId !== "string" ||
    typeof chunkIndex !== "string" ||
    typeof totalChunks !== "string" ||
    typeof originalFilename !== "string"
  ) {
    return Response.json({ success: false, error: "Invalid chunk payload" }, { status: 400 });
  }

  const idx = parseInt(chunkIndex, 10);
  const total = parseInt(totalChunks, 10);
  if (Number.isNaN(idx) || Number.isNaN(total) || total <= 0 || idx < 0 || idx >= total) {
    return Response.json({ success: false, error: "Bad chunk indices" }, { status: 400 });
  }

  await ensureDir(CHUNK_DIR);
  const chunkFolder = path.join(CHUNK_DIR, fileId);
  await ensureDir(chunkFolder);

  const chunkPath = path.join(chunkFolder, `${idx}.part`);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(chunkPath, buf);

  if (idx < total - 1) {
    return Response.json({
      success: true,
      chunkReceived: true,
      fileId,
      chunkIndex: idx,
      totalChunks: total
    });
  }

  const cleanName = sanitizeFilename(originalFilename);
  await ensureDir(UPLOAD_DIR);
  const finalPath = path.join(UPLOAD_DIR, cleanName);
  const writeStream = await fs.open(finalPath, "w");

  try {
    for (let i = 0; i < total; i++) {
      const partPath = path.join(chunkFolder, `${i}.part`);
      const part = await fs.readFile(partPath);
      await writeStream.write(part);
    }
  } finally {
    await writeStream.close();
   
    try { await fs.rm(chunkFolder, { recursive: true, force: true }) } catch {}
  }

  const stats = await fs.stat(finalPath);
  return Response.json({
    success: true,
    files: [
      {
        original: originalFilename,
        stored: cleanName,
        size: stats.size
      }
    ]
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
   
    const isChunk =
      form.has("fileId") &&
      form.has("chunkIndex") &&
      form.has("totalChunks") &&
      form.has("originalFilename");
    if (isChunk) return handleChunk(form);
    return handleStandard(form);
  } catch (e) {
    return Response.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}