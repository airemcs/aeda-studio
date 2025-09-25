import React, { useEffect, useRef, useState } from "react"
import { type VideoData } from "./types"

type Props = {
  selectedVideo: VideoData | null
  onDeleteFrame?: (frameIndex: number) => void
  onRestoreFrame?: (frameIndex: number, frame: any) => void | Promise<any> // allow async
  framesVersion?: number
}

const DECODE_CONCURRENCY = 12
const PLAY_INTERVAL_MS = 150

export default function SuccessPanel({ selectedVideo, onDeleteFrame, onRestoreFrame, framesVersion }: Props) {
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<'frame' | 'aggregate'>('frame')
  const [deletedStack, setDeletedStack] = useState<{ frame: any; index: number }[]>([])

  const decodedImages = useRef<Map<string, HTMLImageElement>>(new Map())
  const [decodeProgress, setDecodeProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 })
  const [decodedVersion, setDecodedVersion] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [frameReady, setFrameReady] = useState(false)

  // NEW: track current index with a ref
  const currentIndexRef = useRef(0)

  // Reset when video changes (stop auto play so progress bar doesn't move while loading)
  useEffect(() => {
    setIdx(0)
    currentIndexRef.current = 0
    setPlaying(false)            // CHANGED: was true
    setMode('frame')
    setFrameReady(false)
    setDeletedStack([])
    // NEW: fetch previously deleted (soft‑deleted) frames so Undo works after reload
    if (selectedVideo?.id) {
      ;(async () => {
        try {
          const res = await fetch("/api/frames/del", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: selectedVideo.id, action: 'list' })
          })
          const data = await res.json().catch(() => ({}))
          if (!data.success || !Array.isArray(data.deleted) || !data.deleted.length) return
          // Seed stack with placeholders (most recent presumed last in list)
          // We push them in order so that undo restores the last deleted first (LIFO)
          setDeletedStack(
            data.deleted.map((fname: string) => ({
              frame: { fileName: fname },  // minimal; real image loads after restore
              index: selectedVideo.frames.length // append restored frames at end by default
            }))
          )
        } catch {}
      })()
    }
  }, [selectedVideo?.id])

  // Lightweight clamp only when frame count changes
  useEffect(() => {
    if (!selectedVideo) return
    if (idx >= selectedVideo.frames.length) {
      setIdx(Math.max(0, selectedVideo.frames.length - 1))
      currentIndexRef.current = Math.max(0, selectedVideo.frames.length - 1)
    }
  }, [selectedVideo?.frames.length, idx])

  // Sync currentIndexRef with idx
  useEffect(() => {
    currentIndexRef.current = idx
  }, [idx])

  // Aggregate counts
  const aggregateCounts = React.useMemo(() => {
    const agg: Record<string, number> = {}
    selectedVideo?.frames.forEach(f =>
      (f.vehicleCounts || []).forEach(vc => {
        agg[vc.name] = (agg[vc.name] || 0) + vc.count
      })
    )
    return agg
  }, [selectedVideo])

  // Frame counts
  const frameCounts = React.useMemo(() => {
    if (!selectedVideo) return {}
    const f = selectedVideo.frames[idx]
    const map: Record<string, number> = {}
    f?.vehicleCounts?.forEach(vc => { map[vc.name] = (map[vc.name] || 0) + vc.count })
    return map
  }, [idx, selectedVideo])

  const tableEntries = React.useMemo(() => {
    const src = mode === 'frame' ? frameCounts : aggregateCounts
    return Object.entries(src).sort((a, b) => a[0].localeCompare(b[0]))
  }, [mode, frameCounts, aggregateCounts])

  // Stable key for each frame (does not depend on array position)
  function frameKey(frame: any, arrayIndex: number) {
    return frame?.fileName || `f_${frame?.frameNumber ?? arrayIndex}`
  }

  // Preload & decode (update: use stable keys, no clearing on delete)
  useEffect(() => {
    if (!selectedVideo) return
    const vid = selectedVideo.id
    const tasks: { key: string; url: string }[] = []
    selectedVideo.frames.forEach((fr, i) => {
      if (!fr?.imageUrl) return
      const k = `${vid}|${frameKey(fr, i)}`
      if (!decodedImages.current.has(k)) {
        tasks.push({ key: k, url: fr.imageUrl })
      }
    })
    if (!tasks.length) return
    setDecodeProgress({ loaded: 0, total: tasks.length })

    let cursor = 0, active = 0, loaded = 0
    const launch = () => {
      while (active < DECODE_CONCURRENCY && cursor < tasks.length) {
        const task = tasks[cursor++]
        active++
        ;(async () => {
          try {
            const img = new Image()
            img.decoding = "async"
            img.src = task.url
            try { await img.decode() } catch {
              await new Promise(res => { img.onload = () => res(null); img.onerror = () => res(null) })
            }
            if (!decodedImages.current.has(task.key)) decodedImages.current.set(task.key, img)
            loaded++
            setDecodeProgress(p => ({ ...p, loaded }))
            if (cursor === tasks.length || task.key.endsWith(frameKey(selectedVideo.frames[idx], idx))) {
              setDecodedVersion(v => v + 1)
            }
          } finally {
            active--
            if (cursor < tasks.length) launch()
          }
        })()
      }
    }
    launch()
  }, [selectedVideo, idx])

  // Playback (only advance when current frame is ready & not still decoding)
  useEffect(() => {
    if (!playing) return
    if (!selectedVideo) return
    if (!frameReady) return       // NEW: gate movement until frame rendered
    if (decodeProgress.total > 0 && decodeProgress.loaded < decodeProgress.total) return // optional extra gate
    if (idx >= selectedVideo.frames.length - 1) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() =>
      setIdx(i => Math.min(selectedVideo.frames.length - 1, i + 1)),
      PLAY_INTERVAL_MS
    )
    return () => clearTimeout(t)
  }, [playing, idx, selectedVideo, frameReady, decodeProgress.total, decodeProgress.loaded])

  // Draw frame (use stable key)
  useEffect(() => {
    if (!selectedVideo) return
    const f = selectedVideo.frames[idx]
    if (!f) return
    const key = `${selectedVideo.id}|${frameKey(f, idx)}`
    const img = decodedImages.current.get(key)
    const canvas = canvasRef.current
    if (!canvas || !img || !img.complete) { setFrameReady(false); return }
    const parent = canvas.parentElement
    if (parent) {
      const w = parent.clientWidth, h = parent.clientHeight
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    const scale = Math.min(canvas.width / iw, canvas.height / ih)
    const dw = iw * scale, dh = ih * scale
    const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
    setFrameReady(true)
  }, [idx, decodedVersion, selectedVideo])

  // Resize handling
  useEffect(() => {
    const onResize = () => requestAnimationFrame(() => setDecodedVersion(v => v + 1))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [selectedVideo])

  // Delete current frame (keep same idx so next frame slides into its place)
  function handleDeleteCurrent() {
    if (!selectedVideo || !selectedVideo.frames.length) return
    if (idx < 0 || idx >= selectedVideo.frames.length) return
    setPlaying(false)
    const frame = selectedVideo.frames[idx]
    setDeletedStack(s => [...s, { frame: { ...frame }, index: idx }])
    // Do NOT pre-adjust idx unless deleting the last frame
    if (idx === selectedVideo.frames.length - 1 && selectedVideo.frames.length > 1) {
      const newIdx = idx - 1
      setIdx(newIdx)
      currentIndexRef.current = newIdx
    }
    onDeleteFrame?.(idx)
  }

  // Undo last deletion (safe sync/async)
  function handleUndo() {
    if (!deletedStack.length) return
    const last = deletedStack[deletedStack.length - 1]
    const maybe = onRestoreFrame?.(last.index, last.frame)

    const apply = () => {
      setIdx(prev => {
        const target = Math.min(last.index, (selectedVideo?.frames.length || 1) - 1)
        currentIndexRef.current = target
        return target
      })
      setDeletedStack(s => s.slice(0, -1))
      setDecodedVersion(v => v + 1)
    }

    if (maybe && typeof (maybe as any).then === "function") {
      ;(maybe as Promise<any>).then(apply).catch(e => {
        console.warn("Undo restore failed", e)
      })
    } else {
      apply()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {!frameReady && selectedVideo?.frames.length ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-stone-400">Loading frame…</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-xs"
              onClick={() => {
                console.log("⬅️ PREV clicked, current idx:", idx, "frames:", selectedVideo?.frames.length)
                const newIdx = Math.max(0, idx - 1)
                console.log("⬅️ Setting idx to:", newIdx)
                setIdx(newIdx)
                currentIndexRef.current = newIdx
                setPlaying(false)
              }}
              disabled={!selectedVideo || selectedVideo.frames.length === 0 || idx <= 0}
            >Prev</button>
            <button
              className="btn btn-xs"
              onClick={() => {
                console.log("➡️ NEXT clicked, current idx:", idx, "frames:", selectedVideo?.frames.length)
                if (!selectedVideo || !selectedVideo.frames.length) return
                const newIdx = Math.min(selectedVideo.frames.length - 1, idx + 1)
                console.log("➡️ Setting idx to:", newIdx)
                setIdx(newIdx)
                currentIndexRef.current = newIdx
                setPlaying(false)
              }}
              disabled={!selectedVideo || !selectedVideo.frames.length || idx >= (selectedVideo?.frames.length || 1) - 1}
            >Next</button>
            <button
              className="btn btn-xs"
              onClick={() => {
                if (!selectedVideo) return
                if (idx >= selectedVideo.frames.length - 1) {
                  setIdx(0)
                  setPlaying(true)
                } else {
                  setPlaying(p => !p)
                }
              }}
              disabled={!selectedVideo || (selectedVideo.frames.length === 0)}
            >
              {playing
                ? "Pause"
                : selectedVideo && idx >= (selectedVideo.frames.length || 1) - 1
                  ? "Replay"
                  : "Play"}
            </button>
            <button
              className="btn btn-xs btn-error"
              onClick={handleDeleteCurrent}
              disabled={!selectedVideo || !selectedVideo.frames.length}
              title="Delete current frame"
            >
              Delete
            </button>
            <button
              className="btn btn-xs"
              onClick={handleUndo}
              disabled={!deletedStack.length}
              title={deletedStack.length ? "Undo last delete" : "Nothing to undo"}
            >
              Undo
            </button>
            <span className="text-xs text-stone-600">
              {selectedVideo?.frames.length
                ? `Frame ${selectedVideo.frames.length ? (idx + 1) : 0} / ${selectedVideo.frames.length}`
                : "No frames"}
            </span>
            {deletedStack.length > 0 && (
              <span className="text-[10px] text-amber-600">
                {deletedStack.length} deleted (undo available)
              </span>
            )}
        </div>
        {selectedVideo?.frames.length ? (
          <input
            type="range"
            className="range range-sm w-full"
            min={0}
            max={selectedVideo.frames.length - 1}
            value={Math.min(idx, Math.max(0, (selectedVideo.frames.length || 1) - 1))}
            onChange={e => { setIdx(Number(e.target.value)); setPlaying(false) }}
          />
        ) : null}
      </div>

      {selectedVideo?.frames.length ? (
        <div className="bg-white rounded-lg shadow border border-stone-300 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-stone-100 border-b border-stone-300">
            <span className="font-semibold text-stone-700">
              {mode === 'frame' ? `Frame ${Math.min(idx + 1, selectedVideo.frames.length)} Vehicle Counts` : 'Aggregated Vehicle Counts'}
            </span>
            <div className="flex gap-1">
              <button
                className={`btn btn-xs ${mode === 'frame' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMode('frame')}
              >Per Frame</button>
              <button
                className={`btn btn-xs ${mode === 'aggregate' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMode('aggregate')}
              >Aggregated</button>
            </div>
          </div>
          {tableEntries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-stone-500">
              No counts available.
            </div>
          ) : (
            <div className="grid grid-cols-2">
              {tableEntries.map(([label, val]) => (
                <React.Fragment key={label}>
                  <div className="text-right px-4 py-2 border-r border-b border-stone-300 text-stone-700">
                    {label}
                  </div>
                  <div className="text-left px-4 py-2 border-b border-stone-300 text-stone-800">
                    {val}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
