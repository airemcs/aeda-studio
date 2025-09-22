export type VehicleCount = {
  name: string
  count: number
}

export interface FrameInstance {
  id: string
  label: string
  bbox?: [number, number, number, number] 
  confidence?: number
}

export type FrameData = {
  frameNumber: number
  vehicleCounts: VehicleCount[]
  imageUrl?: string 
  instances?: FrameInstance[] 
}

export type VideoData = {
  id: string
  title: string
  thumbnailUrl: string
  totalFrames: number
  frames: FrameData[]
}
