export default function FailedPanel() {
  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <div className="alert alert-error max-w-md text-center">
        <span className="font-semibold">Annotation failed. Please retry.</span>
      </div>
      <button className="btn btn-outline btn-error">Retry</button>
    </div>
  )
}
