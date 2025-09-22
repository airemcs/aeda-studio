import { type VideoData } from "./types"

interface Props {
  selectedVideo: VideoData | null
}

export default function SuccessPanel({ selectedVideo }: Props) {
  if (!selectedVideo) {
    return <div className="p-8 text-center text-stone-600">No video selected.</div>
  }

  const aggregate = new Map<string, number>()
  selectedVideo.frames.forEach((f) =>
    f.vehicleCounts.forEach(({ name, count }) =>
      aggregate.set(name, (aggregate.get(name) ?? 0) + count)
    )
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="alert alert-success shadow">
        <span className="font-semibold">
          Annotation complete for: {selectedVideo.title}
        </span>
      </div>

      <div>
        <button className="btn btn-primary">Download Report</button>
      </div>
    </div>
  )
}
