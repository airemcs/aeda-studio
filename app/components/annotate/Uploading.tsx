import React, { useCallback, useRef, useState } from "react"

const BASE_API = "/api" 

interface Props {
  onSuccess: (files: File[]) => void
  onError: () => void
}

const ACCEPT = {
  "video/*": [],
  "application/zip": [".zip"],
}
const CHUNK_BYTES = 99 * 1024 * 1024

export default function UploadingPanel({ onSuccess, onError }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadedBytesState, setUploadedBytesState] = useState(0)
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null)
  const [lastUploadedBytes, setLastUploadedBytes] = useState<number>(0)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(isAllowed)
    if (dropped.length) {
      setFiles((prev) => [...prev, ...dedupe(prev, dropped)])
    }
  }, [])

  function isAllowed(f: File) {
    return f.type.startsWith("video/") || f.name.toLowerCase().endsWith(".zip")
  }

  function dedupe(existing: File[], incoming: File[]) {
    const names = new Set(existing.map((f) => f.name))
    return incoming.filter((f) => !names.has(f.name))
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []).filter(isAllowed)
    if (chosen.length) setFiles((prev) => [...prev, ...dedupe(prev, chosen)])
    e.target.value = ""
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }

  async function apiPing(): Promise<boolean> {
    try {
      const r = await fetch(`${BASE_API}/ping`)
      if (!r.ok) return false
      const j = await r.json()
      return !!j.ok
    } catch {
      return false
    }
  }

  async function upload() {
    if (!files.length) return
    setUploading(true)
    setError(null)
    setProgress(0)
    setUploadedBytesState(0)
    setUploadStartTime(Date.now())
    setLastUpdateTime(Date.now())
    setLastUploadedBytes(0)

    const reachable = await apiPing()
    if (!reachable) console.warn("Ping failed, attempting upload anyway.")

    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    let uploadedBytes = 0

    const genId = () =>
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2))

    try {
      for (const file of files) {
        const fileId = genId()
        const totalChunks = Math.ceil(file.size / CHUNK_BYTES) || 1

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_BYTES
          const end = Math.min(file.size, start + CHUNK_BYTES)
          const blob = file.slice(start, end)

          const form = new FormData()
          form.append("fileId", fileId)
          form.append("chunkIndex", String(chunkIndex))
          form.append("totalChunks", String(totalChunks))
          form.append("originalFilename", file.name)
          form.append("file", blob, file.name)

          // Use XHR for progress within each chunk
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open("POST", "/api/upload")
            xhr.responseType = "json"
            xhr.upload.onprogress = (e) => {
              if (!e.lengthComputable) return
              const overall = uploadedBytes + e.loaded
              setProgress(Math.min(100, Math.round((overall / totalBytes) * 100)))
              setUploadedBytesState(overall)
              setLastUpdateTime(Date.now())
              setLastUploadedBytes(overall)
            }
            xhr.onerror = () => reject(new Error("Network error"))
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                const r = xhr.response
                if (
                  chunkIndex < totalChunks - 1 &&
                  !(r?.chunkReceived || r?.success)
                ) {
                  reject(new Error("Unexpected chunk response"))
                } else {
                  resolve()
                }
              } else {
                reject(new Error(xhr.response?.error || `HTTP ${xhr.status}`))
              }
            }
            xhr.send(form)
          })

          uploadedBytes += blob.size
          setUploadedBytesState(uploadedBytes)
          setLastUpdateTime(Date.now())
          setLastUploadedBytes(uploadedBytes)
          setProgress(Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)))
        }
      }

      setProgress(100)
      setUploadedBytesState(totalBytes)
      setLastUpdateTime(Date.now())
      setLastUploadedBytes(totalBytes)
      onSuccess(files)
      setFiles([])
    } catch (err: any) {
      console.error("Upload failed:", err)
      setError(err.message || "Upload failed.")
      onError()
    } finally {
      setUploading(false)
      setUploadStartTime(null)
      setLastUpdateTime(null)
      setLastUploadedBytes(0)
    }
  }

  function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB"
    }
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + " MB"
    }
    if (bytes >= 1024) {
      return (bytes / 1024).toFixed(2) + " KB"
    }
    return bytes + " B"
  }

  function formatSpeed(bytesPerSec: number) {
    if (bytesPerSec >= 1024 * 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(2) + " GB/s"
    }
    if (bytesPerSec >= 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(2) + " MB/s"
    }
    if (bytesPerSec >= 1024) {
      return (bytesPerSec / 1024).toFixed(2) + " KB/s"
    }
    return bytesPerSec + " B/s"
  }

  function formatTime(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const min = Math.floor(seconds / 60)
    const sec = Math.round(seconds % 60)
    return `${min}m ${sec}s`
  }

  let speedStr = ""
  let etaStr = ""
  if (
    uploading &&
    uploadStartTime &&
    lastUpdateTime &&
    lastUploadedBytes > 0
  ) {
    const elapsedSec = (lastUpdateTime - uploadStartTime) / 1000
    const speed = lastUploadedBytes / Math.max(elapsedSec, 1e-2)
    speedStr = formatSpeed(speed)
    const totalBytes = files.reduce((s, f) => s + f.size, 0)
    const remainingBytes = totalBytes - lastUploadedBytes
    const etaSec = speed > 0 ? remainingBytes / speed : 0
    etaStr = formatTime(etaSec)
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-8 transition ${
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-stone-400 bg-stone-100"
        } flex flex-col items-center gap-4 text-stone-700`}
      >
        <div className="text-lg font-semibold">
          Drag & Drop Videos or ZIP here
        </div>
        <div className="text-sm opacity-70">
          Accepted: MP4 / WebM / any video format + .zip
        </div>
        <button
          type="button"
            className="btn btn-sm btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          Browse Files
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="video/*,.zip"
          onChange={handleSelect}
        />
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3 max-h-64 overflow-auto">
          <div className="font-medium text-stone-600">
            Files ({files.length})
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-4 border rounded px-3 py-1.5" 
              >
                <span className="truncate text-stone-800">{f.name}</span>
                <button
                  onClick={() => removeFile(f.name)}
                  className="text-red-600 hover:underline disabled:opacity-40"
                  disabled={uploading}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
          

            
              {uploading ? (
                <span className="text-black">Uploading...</span>
              ) : (
                <button
                  onClick={upload}
                  disabled={uploading}
                  className="btn btn-sm btn-success"
                  style={{ minWidth: 90 }}
                >
                  Upload
                </button>
              )}

            {uploading && (
              <div className="flex items-center gap-2 flex-1">
                <div className="h-2 bg-stone-200 rounded overflow-hidden flex-1">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-stone-700">
                  {progress}% &nbsp;
                  <span className="opacity-80">
                    ({formatBytes(uploadedBytesState)} / {formatBytes(files.reduce((s, f) => s + f.size, 0))})
                  </span>
                  {speedStr && (
                    <>
                      &nbsp;•&nbsp;
                      <span className="opacity-80">{speedStr}</span>
                    </>
                  )}
                  {etaStr && (
                    <>
                      &nbsp;•&nbsp;
                      <span className="opacity-80">{etaStr} remaining</span>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
          {error && (
            <div className="text-red-600 text-xs font-medium">{error}</div>
          )}
        </div>
      )}

      {!files.length && (
        <div className="text-sm text-stone-500">
          No files selected yet.
        </div>
      )}
    </div>
  )
}