'use client'
import React, { useState, useEffect, useRef } from "react"
import { FaVideo } from "react-icons/fa"
import UploadingPanel from "./components/annotate/Uploading"
import AnnotatingPanel from "./components/annotate/Annotating"
import SuccessPanel from "./components/annotate/Success"
import FailedPanel from "./components/annotate/Failed"
import { type VideoData } from "./components/annotate/types"

export default function Annotate() {
  const [videos, setVideos] = useState<VideoData[]>([])
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [active, setActive] = useState(0)
  const [uploadComplete, setUploadComplete] = useState(false)
  const [renamingVideo, setRenamingVideo] = useState<VideoData | null>(null)
  const [renameInput, setRenameInput] = useState("")
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
  const [successIdx, setSuccessIdx] = useState(0)
  const [successPlaying, setSuccessPlaying] = useState(false)
  const [leftTab, setLeftTab] = useState<"uploaded" | "annotated" | "pending">("uploaded")
  const [uploadFilter, setUploadFilter] = useState<'all' | 'processed' | 'unprocessed'>('all')
  const [uploadView, setUploadView] = useState<'large' | 'medium' | 'small'>('medium')
  const [annotatedSets, setAnnotatedSets] = useState<{ id: string; firstFrameFile: string | null; totalFrames: number }[]>([])
  const [framesSaved, setFramesSaved] = useState(false)
  const [savingFrames, setSavingFrames] = useState(false)
  const [savedFrameFiles, setSavedFrameFiles] = useState<string[]>([])
  const [playIdx, setPlayIdx] = useState(0)
  const playTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [countsMode, setCountsMode] = useState<'frame' | 'aggregate'>('frame')
  const [aggregateCountsMap, setAggregateCountsMap] = useState<Record<string, Record<string, number>>>({}) // NEW

  const streamAbortRef = useRef<AbortController | null>(null)

  const statuses = [
    { label: "Uploading", color: "bg-indigo-400" },
    { label: "Annotating", color: "bg-amber-400" },
    { label: "Success", color: "bg-green-400" },
    { label: "Failed", color: "bg-red-400" }
  ]
  useEffect(() => { refreshVideos(); loadAnnotatedSets() }, []) 
  async function refreshVideos() {
    try {
      const res = await fetch("/api/videos", { cache: "no-store" })
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
  useEffect(() => {
    if (framesSaved) loadAnnotatedSets()
  }, [framesSaved])

  const activeLabel = statuses[active].label

  function handleUploadSuccess() {
    setUploadComplete(true)
    refreshVideos()
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
    setSuccessIdx(0)                  
    setSuccessPlaying(false)           
    if (autoAdvance) {
      setTimeout(() => setActive(2), 1500)
    }
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

  function openRename(video: VideoData) {
    setRenamingVideo(video)
    setRenameInput(video.id.replace(/\.[^/.]+$/, ""))
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault()
    if (!renamingVideo) return
    setBusyActionId(renamingVideo.id)
    try {
      const res = await fetch("/api/videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: renamingVideo.id, newName: renameInput })
      })
      const data = await res.json()
      if (data.success) {
        setVideos(data.videos)
        if (selectedVideo?.id === renamingVideo.id) {
          const updated = data.videos.find((v: any) => v.id === data.renamedTo)
          setSelectedVideo(updated || null)
        }
        setRenamingVideo(null)
      }
    } finally { setBusyActionId(null) }
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
          const vehicleCounts = Object.entries(vehicleCountsMap)
            .map(([name, count]) => ({ name, count }))

          //const b64 = msg.anonymized_frame_b64 || msg.vehicles_frame_b64 || msg.bbox_frame_b64\
          const b64= msg.combined_frame_b64
          const imageUrl = b64 ? `data:image/jpeg;base64,${b64}` : undefined

          setSelectedVideo(prev => {
            if (!prev) return prev
            const newFrames = [...prev.frames, {
              frameNumber: prev.frames.length,
              imageUrl,
              vehicleCounts,
              instances: (msg.grouped_vehicles || []).map((v: any, idx: number) => ({
                id: `${prev.frames.length}-${idx}`,
                label: v.class || "vehicle",
                bbox: [v.x, v.y, v.w, v.h] as [number, number, number, number]
              }))
            }]
            const updated: VideoData = {
              ...prev,
              frames: newFrames,
              totalFrames: streamMeta?.total_frames_to_process || prev.totalFrames || newFrames.length
            }

            if (isSyncedRef.current) {
              setCurrentFrame(newFrames.length - 1)
            }
            return updated
          })
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setAnnotationError(e.message || "Streaming failed.")
      }
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
    } catch {
      // ignore
    } finally {
      setSavingFrames(false)
    }
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

  useEffect(() => {
    if (active !== 2) {
      setSuccessPlaying(false)
      return
    }
    const framesArr = selectedVideo?.frames || []
    if (!successPlaying || framesArr.length === 0) return
    if (successIdx >= framesArr.length - 1) {
      setSuccessPlaying(false)
      return
    }
    const t = setTimeout(() => setSuccessIdx(i => Math.min(framesArr.length - 1, i + 1)), 150)
    return () => clearTimeout(t)
  }, [active, successPlaying, successIdx, selectedVideo])

  function goToSuccess() {
    setActive(2)
    setSuccessIdx(0)
    setSuccessPlaying(true)
    setCountsMode('frame') 
  }

  function backToUploading() {
    stopStream()
    setActive(0)                 
    setShowAnnotationPanel(false)
    setAnnotationError(null)
    setStreamMeta(null)
    setSynced(true)
    setStreamComplete(false)
    setSuccessIdx(0)
    setSuccessPlaying(false)
  }

 
  async function loadAnnotatedFrames(videoId: string) {
    try {
   
      const listRes = await fetch(`/api/frames/list?video=${encodeURIComponent(videoId)}`, { cache: "no-store" })
      if (!listRes.ok) return
      const listData = await listRes.json()
      if (!listData.success) return
      const files: string[] = listData.files || []
      let countsMap: Record<number, { vehicleCounts: any[]; instances: any[] }> = {}
      let aggregateCounts: Record<string, number> | undefined
      try {
        const countsRes = await fetch(`/api/frames/counts?video=${encodeURIComponent(videoId)}`, { cache: "no-store" })
        if (countsRes.ok) {
          const countsData = await countsRes.json()
          if (countsData.success && countsData.frames) {
            aggregateCounts = countsData.aggregate || {}
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
          instances: info.instances
        }
      })

      setSelectedVideo({
        id: videoId,
        title: videoId,
        thumbnailUrl: "",
        totalFrames: files.length,
        frames
      } as any)
      if (aggregateCounts) {
        setAggregateCountsMap(prev => ({ ...prev, [videoId]: aggregateCounts })) // NEW
      }
      setSuccessIdx(0)
      setSuccessPlaying(true)
      setCountsMode('frame')
      setActive(2)
    } catch {
      // silent
    }
  }


  const derivedAggregate = React.useMemo(() => {
    if (selectedVideo && aggregateCountsMap[selectedVideo.id]) {
      return aggregateCountsMap[selectedVideo.id]
    }
    const agg: Record<string, number> = {}
    selectedVideo?.frames.forEach(f =>
      (f.vehicleCounts || []).forEach(vc => {
        agg[vc.name] = (agg[vc.name] || 0) + vc.count
      })
    )
    return agg
  }, [selectedVideo, aggregateCountsMap])

  let panel: React.ReactNode
  switch (activeLabel) {
    case "Uploading":
      panel = (
        <div className="flex flex-col gap-4">
          <UploadingPanel onSuccess={handleUploadSuccess} onError={handleUploadError} />
          {uploadComplete && (
            <button onClick={() => goToAnnotating()} className="btn btn-primary w-max">
              Continue
            </button>
          )}
        </div>
      )
      break
    case "Annotating":
      panel = (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between">
            <button onClick={backToUploading} className="btn btn-sm btn-outline">
              Back
            </button>
            {!showAnnotationPanel && (
              <span className="text-sm text-stone-600 self-center">Preview mode</span>
            )}
          </div>
          {!showAnnotationPanel && selectedVideo && (
            <>
              <video
                key={playToken + selectedVideo.id}
                src={`/api/videos/raw/${encodeURIComponent(selectedVideo.id)}`}
                className="w-full max-h-96 bg-black rounded-lg"
                controls autoPlay muted playsInline preload="auto"
              />
              <button
                onClick={startAnnotation}
                className="btn btn-primary w-max"
                disabled={annotatingExtract}
              >
                {annotatingExtract ? "Streaming..." : "Annotate"}
              </button>
              {annotatingExtract && (
                <div className="text-xs text-stone-600">Connecting...</div>
              )}
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
                  <button
                    onClick={goToSuccess}
                    className="btn btn-primary btn-sm"
                  >
                    Continue
                  </button>
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
        <div className="flex flex-col gap-4">
          {/* Playback */}
          <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center overflow-hidden">
            {selectedVideo?.frames.length
              ? (
                <img
                  src={selectedVideo.frames[successIdx]?.imageUrl}
                  alt={`Frame ${successIdx}`}
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                />
              )
              : <span className="text-stone-400 text-xs">No frames.</span>}
          </div>
          <div className="flex flex-col gap-2">
            {/* Playback controls */}
            <div className="flex items-center gap-3">
              <button
                className="btn btn-xs"
                onClick={() => setSuccessIdx(i => Math.max(0, i - 1))}
                disabled={successIdx === 0}
              >Prev</button>
              <button
                className="btn btn-xs"
                onClick={() => setSuccessIdx(i => Math.min((selectedVideo?.frames.length || 1) - 1, i + 1))}
                disabled={successIdx >= (selectedVideo?.frames.length || 1) - 1}
              >Next</button>
              <button
                className="btn btn-xs"
                onClick={() => setSuccessPlaying(p => !p)}
                disabled={(selectedVideo?.frames.length || 0) === 0}
              >
                {successPlaying ? "Pause" : successIdx >= (selectedVideo?.frames.length || 1) - 1 ? "Replay" : "Play"}
              </button>
              <span className="text-xs text-stone-600">
                {selectedVideo?.frames.length
                  ? `Frame ${successIdx + 1} / ${selectedVideo.frames.length}`
                  : "No frames"}
              </span>
            </div>
            {selectedVideo?.frames && selectedVideo.frames.length > 0 && (
              <input
                type="range"
                className="range range-sm w-full"
                min={0}
                max={selectedVideo.frames.length - 1}
                value={successIdx}
                onChange={e => {
                  const v = Number(e.target.value)
                  setSuccessIdx(v)
                  setSuccessPlaying(false)
                }}
              />
            )}
          </div>

          {/* Counts Card WITH tabs */}
          {selectedVideo?.frames && selectedVideo.frames.length > 0 && (
            (() => {
              const frameCountsArr = (selectedVideo.frames[successIdx]?.vehicleCounts || [])
                .map(vc => ({ name: vc.name, count: vc.count }))
              const frameCounts: Record<string, number> = {}
              frameCountsArr.forEach(c => { frameCounts[c.name] = (frameCounts[c.name] || 0) + c.count })

              const entries = (countsMode === 'frame'
                ? Object.entries(frameCounts)
                : Object.entries(derivedAggregate)
              ).sort((a, b) => a[0].localeCompare(b[0]))

              const empty = entries.length === 0

              return (
                <div className="bg-white rounded-lg shadow border border-stone-300 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-stone-100 border-b border-stone-300">
                    <span className="font-semibold text-stone-700">
                      {countsMode === 'frame' ? `Frame ${successIdx + 1} Vehicle Counts` : 'Aggregated Vehicle Counts'}
                    </span>
                    <div className="flex gap-1">
                      <button
                        className={`btn btn-xs ${countsMode === 'frame' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setCountsMode('frame')}
                      >
                        Per Frame
                      </button>
                      <button
                        className={`btn btn-xs ${countsMode === 'aggregate' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setCountsMode('aggregate')}
                      >
                        Aggregated
                      </button>
                    </div>
                  </div>
                  {empty ? (
                    <div className="px-4 py-6 text-center text-xs text-stone-500">
                      No counts available.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2">
                      {entries.map(([label, val], i) => (
                        <div key={label + i} className="contents">
                          <div className="text-right px-4 py-2 border-r border-b border-stone-300 text-stone-700">
                            {label}
                          </div>
                          <div className="text-left px-4 py-2 border-b border-stone-300 text-stone-800">
                            {val}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()
          )}

          {/* Success summary panel */}
          <SuccessPanel selectedVideo={selectedVideo} />
        </div>
      )
      break
    case "Failed":
      panel = (
        <div className="flex flex-col gap-4">
          <FailedPanel />
          <button onClick={resetToUpload} className="btn btn-sm btn-outline w-max">
            Try Again
          </button>
        </div>
      )
      break
    default:
      panel = null
  }

  function cancelIfAnnotating() {
    if (annotatingExtract || showAnnotationPanel) {
      stopStream()
    }
  }

  return (
    <div className="grid grid-cols-4 lg:h-[calc(100vh-4.063rem)] gap-x-4">
      {/* Left sidebar with tabs */}
      <div className="ml-4 mb-4 p-4 bg-stone-300 rounded-lg overflow-hidden flex flex-col gap-4">
        {/* Tabs */}
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

        {/* Scroll area */}
        <div className="overflow-auto grid gap-y-4 pr-1">
          {leftTab === "uploaded" && (
            <>
              {/* Controls: Filters + View  */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase text-stone-600">Filter:</span>
                    {Object.entries({
                      all: "All",
                      processed: "Processed",
                      unprocessed: "Not Processed"
                    }).map(([k, lbl]) => (
                      <button
                        key={k}
                        onClick={() => setUploadFilter(k as any)}
                        className={`btn btn-xs ${uploadFilter === k ? 'btn-primary' : 'btn-ghost'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase text-stone-600">View:</span>
                    {/*
                      NEW upload list view size buttons
                    */}
                    {Object.entries({
                      small: "Small",
                      medium: "Medium",
                      large: "Large"
                    }).map(([k, lbl]) => (
                      <button
                        key={k}
                        onClick={() => setUploadView(k as any)}
                        className={`btn btn-xs ${uploadView === k ? 'btn-primary' : 'btn-ghost'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(() => {
                const processedIds = new Set(annotatedSets.map(s => s.id))
                let list = videos
                if (uploadFilter === 'processed') {
                  list = list.filter(v => processedIds.has(v.id))
                } else if (uploadFilter === 'unprocessed') {
                  list = list.filter(v => !processedIds.has(v.id))
                }

                if (list.length === 0) {
                  return (
                    <div className="text-xs text-stone-600 italic">
                      No videos match the selected filter.
                    </div>
                  )
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
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              cancelIfAnnotating()
                              setSelectedVideo(video)
                              setCurrentFrame(0)
                              goToAnnotating(false)
                            }
                          }}
                          title="Click to annotate this video"
                          className={`group relative ${cardHeight} w-full rounded-lg overflow-hidden shadow-md border transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                            isSelected && leftTab === 'uploaded'
                              ? 'border-indigo-500 ring-2 ring-indigo-300'
                              : 'border-stone-300'
                          }`}
                        >
                          {isAnnotated && (
                            <span className="absolute top-1 left-1 z-10 bg-green-600/90 text-[10px] text-white px-1.5 py-0.5 rounded">
                              Annotated
                            </span>
                          )}
                          <div className="h-2/3 w-full bg-black flex items-center justify-center">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <video
                                className="h-full w-full object-cover"
                                src={`/api/videos/raw/${encodeURIComponent(video.id)}`}
                                muted
                                preload="metadata"
                                playsInline
                              />
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 h-1/3">
                            <span className="truncate flex-1" title={video.id}>
                              {video.id} {isAnnotated && <span className="text-green-600">(A)</span>}
                            </span>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openRename(video) }}
                                className="btn btn-ghost btn-[10px] px-2 h-6"
                                disabled={busyActionId === video.id}
                              >
                                Ren
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); deleteVideo(video.id) }}
                                className="btn btn-error btn-[10px] px-2 h-6"
                                disabled={busyActionId === video.id}
                              >
                                {busyActionId === video.id ? '...' : 'Del'}
                              </button>
                            </div>
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
              {annotatedSets.length === 0 && (
                <div className="text-xs text-stone-600">No annotated sets yet.</div>
              )}
              {annotatedSets.map(set => {
                const isActive = selectedVideo?.id === set.id && leftTab === "annotated"
                return (
                  <div
                    key={set.id}
                    className={`h-48 w-full rounded-lg overflow-hidden shadow-md border cursor-pointer transition relative ${
                      isActive ? "border-green-500 ring-2 ring-green-300" : "border-stone-300"
                    }`}
                    onClick={() => {
                      cancelIfAnnotating()
                      loadAnnotatedFrames(set.id)        
                    }}
                    title="Click to view annotated frames"
                  >
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
                    <div className="flex items-center justify-between gap-2 bg-white px-2 py-1 text-xs font-medium text-stone-700">
                      <span className="truncate" title={set.id}>{set.id}</span>
                      <span className="text-[10px] text-stone-500">{set.totalFrames}f</span>
                    </div>
                  </div>
                )
              })}
            </>
          )}

            {leftTab === "pending" && (
              <div className="text-xs text-stone-600 italic">Pending queue placeholder...</div>
            )}
        </div>
      </div>
      {/* Right content */}
      <div className="mr-4 mb-4 col-span-3 bg-stone-300 p-4 rounded-lg flex flex-col gap-y-4">
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

      {renamingVideo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form
            onSubmit={submitRename}
            className="bg-white rounded-lg p-6 w-full max-w-sm flex flex-col gap-4"
          >
            <h2 className="text-lg font-semibold">Rename File</h2>
            <p className="text-xs text-stone-500 break-all">
              Current: {renamingVideo.id}
            </p>
            <label className="form-control w-full">
              <span className="label-text text-sm">New name (without extension)</span>
              <input
                className="input input-bordered input-sm bg-white"
                value={renameInput}
                onChange={e => setRenameInput(e.target.value)}
                required
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRenamingVideo(null)}
                disabled={busyActionId !== null}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={!renameInput.trim() || busyActionId !== null}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}