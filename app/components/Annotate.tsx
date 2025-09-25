'use client'
import React, { useState, useEffect, useRef } from "react"
import { FaVideo } from "react-icons/fa"
import UploadingPanel from "./annotate/Uploading"
import AnnotatingPanel from "./annotate/Annotating"
import SuccessPanel from "./annotate/Success"
import FailedPanel from "./annotate/Failed"
import { type VideoData } from "./annotate/types"

export default function Annotate() {
  const [videos, setVideos] = useState<VideoData[]>([])
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [active, setActive] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const [playToken, setPlayToken] = useState(0)
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false)
  const [annotatingExtract, setAnnotatingExtract] = useState(false)
  const [annotationError, setAnnotationError] = useState<string | null>(null)
  const [streamMeta, setStreamMeta] = useState<null | {
    original_total_frames: number
    total_frames_to_process: number
    frames_per_interval: number
    fps: number
  }>(null)
  const [isSynced, setIsSynced] = useState(true)
  const isSyncedRef = useRef(true)
  const setSynced = (v: boolean) => { isSyncedRef.current = v; setIsSynced(v) }
  const [streamComplete, setStreamComplete] = useState(false)
  const [leftTab, setLeftTab] = useState<"uploaded" | "annotated" | "pending">("uploaded")
  const [uploadFilter, setUploadFilter] = useState<'all' | 'processed' | 'unprocessed'>('all')
  const [uploadView, setUploadView] = useState<'large' | 'medium' | 'small'>('medium')
  const [annotatedSets, setAnnotatedSets] = useState<{ id: string; firstFrameFile: string | null; totalFrames: number }[]>([])
  const [framesSaved, setFramesSaved] = useState(false)
  const [savingFrames, setSavingFrames] = useState(false)
  const [savedFrameFiles, setSavedFrameFiles] = useState<string[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)
  const [busyAnnotatedDelete, setBusyAnnotatedDelete] = useState<string | null>(null)
  const [framesVersion, setFramesVersion] = useState(0)

  const STREAM_BATCH_MAX = 5
  const STREAM_FLUSH_INTERVAL_MS = 80

  function fmtDate(d: Date) { return d.toISOString().slice(0, 10) }
  const todayStr = fmtDate(new Date())
  const tomorrowStr = fmtDate(new Date(Date.now() + 24 * 60 * 60 * 1000))

  const statuses = [
    { label: "Uploading", color: "bg-indigo-400" },
    { label: "Annotating", color: "bg-amber-400" },
    { label: "Success", color: "bg-green-400" },
    { label: "Failed", color: "bg-red-400" }
  ]
  const activeLabel = statuses[active].label

  useEffect(() => { refreshVideos(); loadAnnotatedSets() }, [])
  async function refreshVideos(light: boolean = true) {
    try {
      const res = await fetch(`/api/videos${light ? '?light=1' : ''}`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      if (data.success) {
        setVideos(data.videos)
        if (!selectedVideo && data.videos.length > 0) {
          setSelectedVideo(data.videos[0])
          setCurrentFrame(0)
        }
      }
    } catch {}
  }

  async function loadAnnotatedSets() {
    try {
      const res = await fetch("/api/frames/sets", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      if (data.success) setAnnotatedSets(data.sets)
    } catch {}
  }
  useEffect(() => { if (framesSaved) loadAnnotatedSets() }, [framesSaved])

  function handleUploadSuccess() {
    setUploadComplete(true)
    refreshVideos(true)
    setTimeout(() => refreshVideos(false), 2000)
  }

  useEffect(() => {
    if (active === 1 && !annotatingExtract && streamMeta?.total_frames_to_process === selectedVideo?.frames.length) {
      const timer = setTimeout(() => {
        setActive(2)
        setPlayToken(t => t + 1)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [active, annotatingExtract, streamMeta, selectedVideo])

  function goToAnnotating(autoAdvance = true) {
    stopStream()
    setAnnotationError(null)
    setActive(1)
    setPlayToken(t => t + 1)
    setShowAnnotationPanel(false)
    setStreamMeta(null)
    setSynced(true)
    setStreamComplete(false)
    if (autoAdvance) setTimeout(() => setActive(2), 1500)
  }

  function handleUploadError() { setActive(3) }

  function resetToUpload() {
    stopStream()
    setActive(0)
    setUploadComplete(false)
    setShowAnnotationPanel(false)
    setAnnotationError(null)
    setStreamMeta(null)
    setSynced(true)
    setStreamComplete(false)
  }

  function backToUploading() { resetToUpload() }

  async function deleteVideo(id: string) {
    setBusyActionId(id)
    try {
      const res = await fetch(`/api/videos?file=${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setVideos(data.videos)
        if (selectedVideo?.id === id) setSelectedVideo(data.videos[0] || null)
      }
    } finally { setBusyActionId(null) }
  }

  async function deleteAnnotatedSet(id: string) {
    if (busyAnnotatedDelete) return
    setBusyAnnotatedDelete(id)
    try {
      const res = await fetch(`/api/frames/sets?video=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (res.ok) {
        let data: any = null
        try { data = await res.json() } catch {}
        if (data?.success && Array.isArray(data.sets)) {
          setAnnotatedSets(data.sets)
        } else {
          setAnnotatedSets(prev => prev.filter(s => s.id !== id))
        }
        if (selectedVideo?.id === id) {
          setSelectedVideo(null)
          setCurrentFrame(0)
        }
      }
    } finally {
      setBusyAnnotatedDelete(null)
    }
  }

  function stopStream() {
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    setAnnotatingExtract(false)
    setStreamMeta(null)
    setSynced(true)
    setStreamComplete(false)
  }

  function handleUserScrub(frame: number) {
    setSynced(false)
    setCurrentFrame(frame)
  }

  function reSync() {
    setSynced(true)
    setSelectedVideo(prev => {
      if (!prev) return prev
      setCurrentFrame(Math.max(0, prev.frames.length - 1))
      return prev
    })
  }

  async function deleteFrameAt(index: number) {
    if (!selectedVideo) return
    if (index < 0 || index >= selectedVideo.frames.length) return
    const frame = selectedVideo.frames[index]
    const fileName = (frame as any).fileName
    const payload = {
      videoId: selectedVideo.id,
      frameNumber: fileName ? undefined : index,
      file: fileName,
      action: 'delete'
    }
    try {
      const res = await fetch("/api/frames/del", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!data.success) return
      setSelectedVideo(prev => {
        if (!prev) return prev
        const newFrames = [...prev.frames]
        newFrames.splice(index, 1)
        setCurrentFrame(cf => {
          if (cf >= newFrames.length) return Math.max(0, newFrames.length - 1)
          if (index <= cf) return Math.max(0, cf - 1)
          return cf
        })
        setAnnotatedSets(list =>
          list.map(s => s.id === prev.id ? { ...s, totalFrames: newFrames.length } : s)
        )
        return { ...prev, frames: newFrames, totalFrames: newFrames.length }
      })
      setFramesVersion(v => v + 1)
    } catch (e) {}
  }

  async function restoreFrameAt(index: number, frame: any) {
    if (!selectedVideo) return
    const fileName = (frame as any).fileName
    if (fileName) {
      const payload = { videoId: selectedVideo.id, file: fileName, action: 'restore' }
      const res = await fetch("/api/frames/del", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (!data.success) return
    }
    setSelectedVideo(prev => {
      if (!prev) return prev
      const insertAt = Math.min(Math.max(index, 0), prev.frames.length)
      const newFrames = [...prev.frames]
      newFrames.splice(insertAt, 0, { ...frame })
      setCurrentFrame(cf => (insertAt <= cf ? cf + 1 : cf))
      setAnnotatedSets(list =>
        list.map(s => s.id === prev.id ? { ...s, totalFrames: newFrames.length } : s)
      )
      return { ...prev, frames: newFrames, totalFrames: newFrames.length }
    })
    setFramesVersion(v => v + 1)
  }

  async function startAnnotation() {
    if (!selectedVideo || annotatingExtract) return
    stopStream()
    setAnnotatingExtract(true)
    setAnnotationError(null)
    setShowAnnotationPanel(true)
    setCurrentFrame(0)
    setSelectedVideo(prev => prev ? { ...prev, totalFrames: 0, frames: [] } : prev)
    setStreamComplete(false)
    const controller = new AbortController()
    streamAbortRef.current = controller
    try {
      const resp = await fetch(`/api/annotate/stream?file=${encodeURIComponent(selectedVideo.id)}`, {
        method: "POST",
        signal: controller.signal
      })
      if (!resp.ok || !resp.body) throw new Error("Stream failed (proxy)")
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let batch: any[] = []
      let lastFlush = performance.now()
      let nextFrameIndex = 0
      let receivedCount = 0
      const flushBatch = () => {
        if (!batch.length) return
        const toAppend = batch
        batch = []
        setSelectedVideo(prev => {
          if (!prev) return prev
          const newFrames = prev.frames.concat(toAppend)
          const updated = {
            ...prev,
            frames: newFrames,
            totalFrames: streamMeta?.total_frames_to_process || prev.totalFrames || newFrames.length
          }
          if (isSyncedRef.current) setCurrentFrame(newFrames.length - 1)
          return updated
        })
        lastFlush = performance.now()
      }
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const raw of lines) {
          const line = raw.trim()
          if (!line) continue
          let msg: any
          try { msg = JSON.parse(line) } catch { continue }
          if (msg.meta) {
            const m = msg.meta
            setStreamMeta(m)
            setSelectedVideo(prev => prev ? { ...prev, totalFrames: m.total_frames_to_process || prev.totalFrames } : prev)
            continue
          }
          const vehicleCountsMap: Record<string, number> = {}
          if (Array.isArray(msg.grouped_vehicles)) {
            for (const v of msg.grouped_vehicles) {
              const cls = v.class || "Vehicle"
              vehicleCountsMap[cls] = (vehicleCountsMap[cls] || 0) + 1
            }
          }
          const vehicleCounts = Object.entries(vehicleCountsMap).map(([name, count]) => ({ name, count }))
          const b64 = msg.combined_frame_b64
          const imageUrl = b64 ? `data:image/jpeg;base64,${b64}` : undefined
          const frameObj = {
            frameNumber: nextFrameIndex,
            imageUrl,
            vehicleCounts,
            instances: (msg.grouped_vehicles || []).map((v: any, idx: number) => ({
              id: `${nextFrameIndex}-${idx}`,
              label: v.class || "vehicle",
              bbox: [v.x, v.y, v.w, v.h] as [number, number, number, number]
            }))
          }
          nextFrameIndex++
          receivedCount++
          batch.push(frameObj)
          const now = performance.now()
          if (batch.length >= STREAM_BATCH_MAX || (now - lastFlush) >= STREAM_FLUSH_INTERVAL_MS) flushBatch()
        }
      }
      if (batch.length) flushBatch()
      setSelectedVideo(prev => {
        if (!prev) return prev
        if (streamMeta?.total_frames_to_process && prev.frames.length < streamMeta.total_frames_to_process) {
          return { ...prev, totalFrames: prev.frames.length }
        }
        return prev
      })
      setStreamMeta(prev => {
        if (!prev) return prev
        if (prev.total_frames_to_process && receivedCount < prev.total_frames_to_process) {
          return { ...prev, total_frames_to_process: receivedCount }
        }
        return prev
      })
    } catch (e: any) {
      if (e.name !== "AbortError") setAnnotationError(e.message || "Streaming failed.")
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null
      setAnnotatingExtract(false)
    }
  }

  useEffect(() => {
    if (
      showAnnotationPanel &&
      !annotatingExtract &&
      !framesSaved &&
      !savingFrames &&
      streamMeta?.total_frames_to_process &&
      selectedVideo?.frames.length === streamMeta.total_frames_to_process
    ) {
      void saveFrames()
    }
  }, [showAnnotationPanel, annotatingExtract, framesSaved, savingFrames, streamMeta, selectedVideo])

  async function saveFrames() {
    if (!selectedVideo) return
    setSavingFrames(true)
    try {
      const payload = {
        video: selectedVideo.id,
        frames: selectedVideo.frames.map(f => ({
          index: f.frameNumber,
          base64: f.imageUrl?.split(",")[1] || "",
          vehicleCounts: f.vehicleCounts || [],
          instances: f.instances || []
        }))
      }
      const res = await fetch("/api/frames/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        setFramesSaved(true)
        setSavedFrameFiles(data.files || [])
      }
    } catch {}
    finally { setSavingFrames(false) }
  }

  useEffect(() => {
    if (
      showAnnotationPanel &&
      !annotatingExtract &&
      !annotationError &&
      streamMeta?.total_frames_to_process &&
      selectedVideo?.frames.length === streamMeta.total_frames_to_process &&
      selectedVideo.frames.length > 0
    ) {
      setStreamComplete(true)
    }
  }, [showAnnotationPanel, annotatingExtract, annotationError, streamMeta, selectedVideo])

  function goToSuccess() { setActive(2) }

  async function loadAnnotatedFrames(videoId: string) {
    try {
      const listRes = await fetch(`/api/frames/list?video=${encodeURIComponent(videoId)}`, { cache: "no-store" })
      if (!listRes.ok) return
      const listData = await listRes.json()
      if (!listData.success) return
      const files: string[] = listData.files || []
      let countsMap: Record<number, { vehicleCounts: any[]; instances: any[] }> = {}
      try {
        const countsRes = await fetch(`/api/frames/counts?video=${encodeURIComponent(videoId)}`, { cache: "no-store" })
        if (countsRes.ok) {
          const countsData = await countsRes.json()
          if (countsData.success && countsData.frames) {
            for (const fr of countsData.frames) {
              countsMap[fr.index] = {
                vehicleCounts: fr.vehicleCounts || [],
                instances: fr.instances || []
              }
            }
          }
        }
      } catch {}
      const frames = files.map((f, i) => {
        const info = countsMap[i] || { vehicleCounts: [], instances: [] }
        return {
          frameNumber: i,
          imageUrl: `/api/frames/raw?video=${encodeURIComponent(videoId)}&file=${encodeURIComponent(f)}`,
          vehicleCounts: info.vehicleCounts,
          instances: info.instances,
          fileName: f
        }
      })
      setSelectedVideo({
        id: videoId,
        title: videoId,
        thumbnailUrl: "",
        totalFrames: files.length,
        frames
      } as any)
      setActive(2)
    } catch (e) {}
  }

  function cancelIfAnnotating() {
    if (annotatingExtract || showAnnotationPanel) stopStream()
  }

  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  function getItemDate(obj: any): string | null {
    if (!obj) return null
    const meta = obj.meta || obj.metadata || {}
    const DATE_KEYS_PRIORITY = [
      'recordedAt','captureDate','capturedAt','startTime','endTime',
      'date','datetime','creationTime','createTime',
      'createdAt','uploadedAt','timestamp','created'
    ]
    const sources: any[] = [meta, obj]
    for (const src of sources) {
      for (const key of DATE_KEYS_PRIORITY) {
        if (src && src[key] != null) {
          let v = src[key]
          if (typeof v === 'number') {
            if (v < 1e12) v = v * 1000
            const d = new Date(v)
            if (!isNaN(d.getTime())) return d.toISOString()
          } else if (typeof v === 'string') {
            const trimmed = v.trim()
            const parsed = Date.parse(trimmed.match(/^\d{4}-\d{2}-\d{2}$/) ? trimmed + 'T00:00:00Z' : trimmed)
            if (!isNaN(parsed)) return new Date(parsed).toISOString()
          }
        }
      }
    }
    return null
  }

  function withinDate(obj: any) {
    const iso = getItemDate(obj)
    if (!iso) return true
    const day = Math.floor(Date.parse(iso) / 86400000)
    if (dateFrom) {
      const fromDay = Math.floor(Date.parse(dateFrom + 'T00:00:00Z') / 86400000)
      if (day < fromDay) return false
    }
    if (dateTo) {
      const toDay = Math.floor(Date.parse(dateTo + 'T00:00:00Z') / 86400000)
      if (day > toDay) return false
    }
    return true
  }

  const FilterBar = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase text-stone-600">Filter:</span>
          {Object.entries({ all: "All", processed: "Processed", unprocessed: "Not Processed" }).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setUploadFilter(k as any)}
              className={`btn btn-xs ${uploadFilter === k ? 'btn-primary' : 'btn-ghost'}`}
            >{lbl}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold uppercase text-stone-600">View:</span>
          {Object.entries({ small: "Small", medium: "Medium", large: "Large" }).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setUploadView(k as any)}
              className={`btn btn-xs ${uploadView === k ? 'btn-primary' : 'btn-ghost'}`}
            >{lbl}</button>
          ))}
        </div>
        <label className="flex flex-col">
          <span className="text-[10px] uppercase text-stone-600 font-semibold">Search</span>
          <input
            className="input input-xs input-bordered bg-white"
            placeholder="Filename..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] uppercase text-stone-600 font-semibold">From</span>
          <input
            type="date"
            className="input input-xs input-bordered bg-white"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            onFocus={() => {
              if (!dateFrom) setDateFrom(todayStr)
              if (!dateTo) setDateTo(tomorrowStr)
            }}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] uppercase text-stone-600 font-semibold">To</span>
          <input
            type="date"
            className="input input-xs input-bordered bg-white"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            onFocus={() => {
              if (!dateFrom) setDateFrom(todayStr)
              if (!dateTo) setDateTo(tomorrowStr)
            }}
          />
        </label>
        <button
          className="btn btn-xs btn-outline"
          onClick={() => { setSearchTerm(""); setDateFrom(""); setDateTo(""); }}
        >Clear</button>
      </div>
    </div>
  )

  let panel: React.ReactNode

  switch (activeLabel) {
    case "Uploading":
      panel = (
        <div className="flex flex-col gap-4">
          <UploadingPanel onSuccess={handleUploadSuccess} onError={handleUploadError} />
          {uploadComplete && (
            <button onClick={() => goToAnnotating()} className="btn btn-primary w-max">Continue</button>
          )}
        </div>
      )
      break
    case "Annotating":
      panel = (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between">
            <button onClick={backToUploading} className="btn btn-sm btn-outline">Back</button>
            {!showAnnotationPanel && <span className="text-sm text-stone-600 self-center">Preview mode</span>}
          </div>
          {!showAnnotationPanel && selectedVideo && (
            <>
              <video
                key={playToken + selectedVideo.id}
                src={`/api/videos/raw/${encodeURIComponent(selectedVideo.id)}`}
                className="w-full max-h-96 bg-black rounded-lg"
                controls autoPlay muted playsInline preload="none"
              />
              <button
                onClick={startAnnotation}
                className="btn btn-primary w-max"
                disabled={annotatingExtract}
              >
                {annotatingExtract ? "Streaming..." : "Annotate"}
              </button>
              {annotatingExtract && <div className="text-xs text-stone-600">Connecting...</div>}
            </>
          )}
          {showAnnotationPanel && (
            <div className="flex flex-col gap-4">
              {annotatingExtract && (
                <div className="text-xs text-stone-600">
                  Receiving frames... ({selectedVideo?.frames.length || 0}{streamMeta?.total_frames_to_process ? ` / ${streamMeta.total_frames_to_process}` : ""})
                </div>
              )}
              {annotationError && !annotatingExtract && (
                <div className="alert alert-error text-xs">{annotationError}</div>
              )}
              {!annotationError && (
                <AnnotatingPanel
                  selectedVideo={selectedVideo}
                  currentFrame={currentFrame}
                  setCurrentFrame={(f) => handleUserScrub(f)}
                  isSynced={isSynced}
                  onSyncToggle={() => (isSynced ? setSynced(false) : reSync())}
                  expectedTotal={streamMeta?.total_frames_to_process}
                />
              )}
              {streamComplete && !annotationError && (
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={goToSuccess} className="btn btn-primary btn-sm">Continue</button>
                  <span className="text-xs text-stone-600">
                    All frames received ({selectedVideo?.frames.length})
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )
      break
    case "Success":
      panel = (
        <SuccessPanel
          selectedVideo={selectedVideo}
            onDeleteFrame={(i) => deleteFrameAt(i)}
          onRestoreFrame={(i, f) => restoreFrameAt(i, f)}
          framesVersion={framesVersion}
        />
      )
      break
    case "Failed":
      panel = (
        <div className="flex flex-col gap-4">
          <FailedPanel />
          <button onClick={resetToUpload} className="btn btn-sm btn-outline w-max">Try Again</button>
        </div>
      )
      break
    default:
      panel = null
  }

  return (
    <div className="grid grid-cols-4 lg:h-[calc(100vh-4.063rem)] gap-x-4">
      <div className="mb-4 p-4 bg-stone-300 rounded-lg overflow-hidden flex flex-col gap-4">
        <div className="grid grid-cols-3 text-xs font-semibold rounded-lg border border-stone-400">
          {[
            {
              key: "uploaded",
              label: "Uploaded"
            },
            {
              key: "annotated",
              label: "Annotated"
            },
            {
              key: "pending",
              label: "Pending"
            }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setLeftTab(t.key as any)}
              className={`py-2 transition-colors ${
                leftTab === t.key ? "bg-indigo-500 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              } ${t.key !== "pending" ? "border-r border-stone-400" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="overflow-auto grid gap-y-4 pr-1">
          {leftTab === "uploaded" && (
            <>
              {FilterBar}
              {(() => {
                const processedIds = new Set(annotatedSets.map(s => s.id))
                let list = videos
                if (uploadFilter === 'processed') list = list.filter(v => processedIds.has(v.id))
                else if (uploadFilter === 'unprocessed') list = list.filter(v => !processedIds.has(v.id))
                const term = searchTerm.trim().toLowerCase()
                if (term) list = list.filter(v => v.id.toLowerCase().includes(term))
                list = list.filter(v => withinDate(v))
                if (list.length === 0) {
                  return <div className="text-xs text-stone-600 italic">No videos match the filters.</div>
                }
                const containerClass =
                  uploadView === 'large'
                    ? 'grid gap-4'
                    : uploadView === 'medium'
                      ? 'grid gap-4 grid-cols-2 auto-rows-fr'
                      : 'grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 auto-rows-fr'
                const cardHeight =
                  uploadView === 'large' ? 'h-48' :
                  uploadView === 'medium' ? 'h-44' : 'h-40'
                return (
                  <div className={containerClass}>
                    {list.map(video => {
                      const isSelected = selectedVideo?.id === video.id
                      const isAnnotated = processedIds.has(video.id)
                      const deleting = busyActionId === video.id
                      return (
                        <div
                          key={video.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            cancelIfAnnotating()
                            setSelectedVideo(video)
                            setCurrentFrame(0)
                            goToAnnotating(false)
                            setTimeout(() => refreshVideos(false), 300)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              cancelIfAnnotating()
                              setSelectedVideo(video)
                              setCurrentFrame(0)
                              goToAnnotating(false)
                              setTimeout(() => refreshVideos(false), 300)
                            }
                          }}
                          className={`group relative ${cardHeight} w-full rounded-lg overflow-hidden shadow-md border transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                            isSelected && leftTab === 'uploaded'
                              ? 'border-indigo-500 ring-2 ring-indigo-300'
                              : 'border-stone-300'
                          }`}
                          title="Click to annotate this video"
                        >
                          {isAnnotated && (
                            <span className="absolute top-1 left-1 z-10 bg-green-600/90 text-[10px] text-white px-1.5 py-0.5 rounded">
                              Annotated
                            </span>
                          )}
                          <div className="absolute top-1 right-1 z-10">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteVideo(video.id) }}
                              disabled={deleting}
                              className="btn btn-xs btn-error px-2 py-0.5"
                              title="Delete video"
                            >{deleting ? '...' : 'Del'}</button>
                          </div>
                          <div className="h-2/3 w-full bg-black flex items-center justify-center">
                            {video.thumbnailUrl ? (
                              <img
                                src={video.thumbnailUrl}
                                alt={video.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-[10px] text-stone-400 gap-1 w-full h-full bg-stone-900">
                                <FaVideo className="opacity-40" />
                                <span className="px-1 text-center leading-tight">Generating thumbnail…</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 h-1/3">
                            <span className="truncate flex-1" title={video.id}>
                              {video.id} {isAnnotated && <span className="text-green-600">(A)</span>}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </>
          )}

          {leftTab === "annotated" && (
            <>
              {FilterBar}
              {(() => {
                let list = annotatedSets
                const term = searchTerm.trim().toLowerCase()
                if (term) list = list.filter(s => s.id.toLowerCase().includes(term))
                const videoMap = new Map(videos.map(v => [v.id, v as any]))
                list = list.filter(s => withinDate(videoMap.get(s.id)))
                if (uploadFilter === 'unprocessed') list = []
                if (list.length === 0) {
                  return <div className="text-xs text-stone-600 italic">No annotated sets match filters.</div>
                }
                const containerClass =
                  uploadView === 'large'
                    ? 'grid gap-4'
                    : uploadView === 'medium'
                      ? 'grid gap-4 grid-cols-2 auto-rows-fr'
                      : 'grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 auto-rows-fr'
                return (
                  <div className={containerClass}>
                    {list.map(set => {
                      const isActive = selectedVideo?.id === set.id && leftTab === "annotated"
                      const deleting = busyAnnotatedDelete === set.id
                      return (
                        <div
                          key={set.id}
                          className={`h-48 w-full rounded-lg overflow-hidden shadow-md border cursor-pointer transition relative ${
                            isActive ? "border-green-500 ring-2 ring-green-300" : "border-stone-300"
                          }`}
                          onClick={() => {
                            if (deleting) return
                            cancelIfAnnotating()
                            loadAnnotatedFrames(set.id)
                          }}
                          title="Click to view annotated frames"
                        >
                          <div className="absolute top-1 right-1 z-10">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteAnnotatedSet(set.id) }}
                              disabled={deleting}
                              className="btn btn-xs btn-error px-2 py-0.5"
                              title="Delete annotated set"
                            >{deleting ? "..." : "Del"}</button>
                          </div>
                          <div className="h-32 w-full bg-black flex items-center justify-center">
                            {set.firstFrameFile ? (
                              <img
                                src={`/api/frames/raw?video=${encodeURIComponent(set.id)}&file=${encodeURIComponent(set.firstFrameFile)}`}
                                alt={set.id}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <FaVideo className="size-1/2 opacity-30 text-stone-500" />
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 h-1/3">
                            <span className="truncate" title={set.id}>{set.id}</span>
                            <span className="text-[10px] text-stone-500">{set.totalFrames}f</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </>
          )}

          {leftTab === "pending" && (
            <>
              {FilterBar}
              <div className="text-xs text-stone-600 italic">No pending items.</div>
            </>
          )}
        </div>
      </div>
      <div className="mb-4 col-span-3 bg-stone-300 p-4 rounded-lg flex flex-col gap-y-4">
        <div className="grid grid-cols-4 border border-stone-300 rounded-lg overflow-hidden">
          {statuses.map((s, i) => (
            <div
              key={s.label}
              role={i === 0 ? "button" : undefined}
              tabIndex={i === 0 ? 0 : -1}
              onClick={i === 0 ? () => resetToUpload() : undefined}
              onKeyDown={i === 0 ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  resetToUpload()
                }
              } : undefined}
              className={`flex justify-center items-center text-lg font-semibold py-3 transition-colors duration-500 select-none ${
                i === active ? s.color : "bg-stone-100 text-stone-600"
              } border-r border-stone-300 last:border-r-0 ${i === 0 ? 'cursor-pointer hover:bg-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500' : ''}`}
              title={i === 0 ? "Click to return to Uploading" : undefined}
            >
              {s.label}
            </div>
          ))}
        </div>
        {panel}
      </div>
    </div>
  )
}