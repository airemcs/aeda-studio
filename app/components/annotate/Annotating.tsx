import React from "react"
import { FaFileImage } from "react-icons/fa"
import { type VideoData } from "./types"

interface Props {
  selectedVideo: VideoData | null
  currentFrame: number
  setCurrentFrame: (v: number) => void         
  isSynced?: boolean
  onSyncToggle?: () => void
  expectedTotal?: number | null
}

export default function AnnotatingPanel({
  selectedVideo,
  currentFrame,
  setCurrentFrame,
  isSynced = true,
  onSyncToggle,
  expectedTotal
}: Props) {
  const frames = selectedVideo?.frames || []
  const currentFrameData = frames[currentFrame]

  if (currentFrame >= frames.length && frames.length > 0) {
    setCurrentFrame(frames.length - 1)
  }

  const totalDisplay = expectedTotal || selectedVideo?.totalFrames || frames.length
  const rangeMax = Math.max(0, frames.length - 1) 

  return (
    <div className="grid grid-cols-4 gap-x-4 h-full">
      {/* Left: frame + slider */}
      <div className="col-span-3 grid gap-y-4">
        <div className="skeleton h-full w-full flex items-center justify-center relative overflow-hidden rounded-lg">
          {currentFrameData?.imageUrl ? (
            <img
              src={currentFrameData.imageUrl}
              alt={`Frame ${currentFrame}`}
              className="h-full w-full object-contain select-none"
              draggable={false}
            />
          ) : (
            <FaFileImage className="size-1/2 opacity-30" />
          )}
          <div className="absolute top-2 left-2 bg-stone-900/70 text-stone-200 text-[11px] px-2 py-1 rounded">
            {frames.length
              ? `Frame ${currentFrame + 1} / ${totalDisplay || "?"}`
              : "No frames"}
          </div>
        </div>

        {frames.length > 0 && (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={rangeMax}
              value={Math.min(currentFrame, rangeMax)}
              onChange={e => setCurrentFrame(Number(e.target.value))}
              className="range range-lg w-full"
              onMouseDown={() => {
                if (isSynced && onSyncToggle) onSyncToggle() 
              }}
              onTouchStart={() => {
                if (isSynced && onSyncToggle) onSyncToggle()
              }}
            />
            <span className="whitespace-nowrap text-sm font-medium text-stone-700">
              {currentFrame}/{Math.max(0, totalDisplay - 1)}
            </span>
            <button
              type="button"
              className={`btn btn-xs ${isSynced ? "btn-success" : "btn-outline"}`}
              onClick={() => onSyncToggle && onSyncToggle()}
              title={isSynced ? "Click to stop auto-follow" : "Click to jump to latest & follow"}
            >
              {isSynced ? "Synced" : "Sync"}
            </button>
          </div>
        )}

        {frames.length === 0 && (
          <div className="text-xs text-stone-500">No frames yet...</div>
        )}
      </div>

      {/* Right sidebar: vehicle counts */}
      <div className="flex flex-col bg-white shadow-md rounded-xl w-full h-fit overflow-hidden">
        {currentFrameData ? (
          <>
            <div className="bg-stone-100 border-b border-stone-300 px-4 py-2 text-center flex justify-between items-center">
              <span className="text-lg font-semibold tracking-wide text-stone-700">
                Frame #{String(currentFrame).padStart(4, "0")}
              </span>
              <span className="text-[10px] text-stone-500">
                Received: {frames.length}{expectedTotal ? ` / ${expectedTotal}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 border-t border-l border-stone-300">
              <div className="text-right font-semibold text-stone-600 px-4 py-2 border-r border-b border-stone-300">
                Vehicle
              </div>
              <div className="text-left font-semibold text-stone-600 px-4 py-2 border-b border-stone-300">
                Counter
              </div>
              {(currentFrameData.vehicleCounts || []).map(v => (
                <React.Fragment key={v.name}>
                  <div className="text-right text-stone-800 px-4 py-2 border-r border-b border-stone-300">
                    {v.name}
                  </div>
                  <div className="text-left text-stone-800 px-4 py-2 border-b border-stone-300">
                    {v.count}
                  </div>
                </React.Fragment>
              ))}
              {(!currentFrameData.vehicleCounts || currentFrameData.vehicleCounts.length === 0) && (
                <div className="col-span-2 text-center text-xs text-stone-500 py-4 border-b border-stone-300">
                  No vehicle counts.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-stone-500">
            No frame selected.
          </div>
        )}
      </div>
    </div>
  )
}
