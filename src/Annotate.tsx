import React, { useState, useEffect } from "react"
import { FaVideo, FaFileImage } from "react-icons/fa"

type VehicleCount = {
  name: string
  count: number
}

type FrameData = {
  frameNumber: number
  vehicleCounts: VehicleCount[]
}

type VideoData = {
  id: string
  title: string
  thumbnailUrl?: string
  totalFrames: number
  frames: FrameData[]
}

export default function Annotate() {

  const [videos, setVideos] = useState<VideoData[]>([])
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)

  // TODO: Change this to the actual fetch call - these are just dummy values to simulate what it would look like. The max is only 4 for this case.
  useEffect(() => {
  const fakeVideos: VideoData[] = [
    {
      id: "vid1",
      title: "Traffic Sample 1",
      thumbnailUrl: "",
      totalFrames: 100,
      frames: [
        {
          frameNumber: 0,
          vehicleCounts: [
            { name: "Cars", count: 1 },
            { name: "Motorcycles", count: 0 },
            { name: "Jeepneys", count: 0 },
            { name: "Trucks", count: 0 },
            { name: "Bicycles", count: 0 },
            { name: "Pedestrians", count: 2 },
            { name: "Tricycles", count: 0 },
          ],
        },
        {
          frameNumber: 1,
          vehicleCounts: [
            { name: "Cars", count: 2 },
            { name: "Motorcycles", count: 1 },
            { name: "Jeepneys", count: 0 },
            { name: "Trucks", count: 0 },
            { name: "Bicycles", count: 0 },
            { name: "Pedestrians", count: 2 },
            { name: "Tricycles", count: 0 },
          ],
        },
        {
          frameNumber: 2,
          vehicleCounts: [
            { name: "Cars", count: 3 },
            { name: "Motorcycles", count: 1 },
            { name: "Jeepneys", count: 1 },
            { name: "Trucks", count: 0 },
            { name: "Bicycles", count: 1 },
            { name: "Pedestrians", count: 3 },
            { name: "Tricycles", count: 0 },
          ],
        },
      ],
    },
    {
      id: "vid2",
      title: "Traffic Sample 2",
      thumbnailUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400",
      totalFrames: 80,
      frames: [
        {
          frameNumber: 0,
          vehicleCounts: [
            { name: "Cars", count: 4 },
            { name: "Motorcycles", count: 2 },
            { name: "Jeepneys", count: 1 },
            { name: "Trucks", count: 0 },
            { name: "Bicycles", count: 0 },
            { name: "Pedestrians", count: 1 },
            { name: "Tricycles", count: 0 },
          ],
        },
        {
          frameNumber: 1,
          vehicleCounts: [
            { name: "Cars", count: 6 },
            { name: "Motorcycles", count: 3 },
            { name: "Jeepneys", count: 1 },
            { name: "Trucks", count: 1 },
            { name: "Bicycles", count: 0 },
            { name: "Pedestrians", count: 2 },
            { name: "Tricycles", count: 0 },
          ],
        },
        {
          frameNumber: 2,
          vehicleCounts: [
            { name: "Cars", count: 7 },
            { name: "Motorcycles", count: 4 },
            { name: "Jeepneys", count: 2 },
            { name: "Trucks", count: 1 },
            { name: "Bicycles", count: 1 },
            { name: "Pedestrians", count: 3 },
            { name: "Tricycles", count: 1 },
          ],
        },
      ],
    },
  ]

  setVideos(fakeVideos)
  setSelectedVideo(fakeVideos[0])
  setCurrentFrame(0)
  }, [])

  const [active, setActive] = useState(0)
  const statuses = [
    { label: "Uploading", color: "bg-indigo-400" },
    { label: "Annotating", color: "bg-amber-400" },
    { label: "Success", color: "bg-green-400" },
    { label: "Failed", color: "bg-red-400" },
  ]

  // TODO: Change this to the actual status - right now it's just looping infinitely.
  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % 4)
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  const currentFrameData = selectedVideo?.frames.find((f) => f.frameNumber === currentFrame)

  return (
  <div className="grid grid-cols-4 lg:h-[calc(100vh-4.063rem)] gap-x-4">

    <div className="ml-4 mb-4 p-4 bg-stone-300 rounded-lg overflow-auto grid gap-y-4">

      {videos.length === 0 ? (Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-48 w-full flex items-center justify-center" >
          <FaVideo className="size-1/2 opacity-30" />
        </div>

      ))) : (

      videos.map((video) =>(
        <button key={video.id} onClick={() => {
          setSelectedVideo(video)
          setCurrentFrame(0)}} 
          className={`h-48 w-full rounded-lg overflow-hidden shadow-md border ${selectedVideo?.id === video.id
            ? "border-indigo-500 ring-2 ring-indigo-300"
            : "border-stone-300"
        }`}>
      
        {video.thumbnailUrl ? (
          <div className="h-full w-full flex flex-col">
            <img src={video.thumbnailUrl} alt={video.title} className="h-32 w-full object-cover"/>
            <div className="flex-1 flex items-center justify-center bg-white px-2 text-sm font-medium text-stone-700">{video.title}</div>
          </div>
        ) : (
          <div className="skeleton h-full w-full flex items-center justify-center">
            <FaVideo className="size-1/2 opacity-30" />
          </div>
        )}
        </button>
      )))}
    </div>

    <div className="mr-4 mb-4 col-span-3 bg-stone-300 p-4 rounded-lg flex flex-col gap-y-4">
      
      {/* Status */}
      <div className="grid grid-cols-4 border border-stone-300 rounded-lg overflow-hidden">
        {statuses.map((s, i) => (
          <div key={s.label} className={`flex justify-center items-center text-lg font-semibold py-3 transition-colors duration-500  ${ i === active ? s.color : "bg-stone-100 text-stone-600"} border-r border-stone-300 last:border-r-0`}>{s.label}</div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-x-4">
        <div className="col-span-3 grid gap-y-4">
          
          {/* Image */}
          <div className="skeleton h-full w-full flex items-center justify-center">
            <FaFileImage className="size-1/2 opacity-30" />
          </div>

          {/* Slider */}
          {selectedVideo && (
            <div className="flex items-center gap-4">
              <input type="range" min={0} max={selectedVideo.totalFrames - 1} value={currentFrame} onChange={(e) => setCurrentFrame(Number(e.target.value))} className="range range-lg w-full"/>
              <span className="whitespace-nowrap text-sm font-medium text-stone-700">{currentFrame}/{selectedVideo.totalFrames - 1}</span>
            </div>
          )}
        </div>

        {/* Vehicle Counter */}
        {currentFrameData && (
          <div className="flex flex-col bg-white shadow-md rounded-xl w-full h-fit overflow-hidden">
            <div className="bg-stone-100 border-b border-stone-300 px-4 py-2 text-center">
              <span className="text-lg font-semibold tracking-wide text-stone-700">Frame #{String(currentFrame).padStart(4, "0")}</span>
            </div>

            <div className="grid grid-cols-2 border-t border-l border-stone-300">
              <div className="text-right font-semibold text-stone-600 px-4 py-2 border-r border-b border-stone-300">Vehicle</div>
              <div className="text-left font-semibold text-stone-600 px-4 py-2 border-b border-stone-300">Counter</div>

              {currentFrameData.vehicleCounts.map((v) => (
                <React.Fragment key={v.name}>
                  <div className="text-right text-stone-800 px-4 py-2 border-r border-b border-stone-300">{v.name}</div>
                  <div className="text-left text-stone-800 px-4 py-2 border-b border-stone-300">{v.count}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        
      </div>
    </div>
  </div>
  )
}
