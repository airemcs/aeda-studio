"use client"
import React, { useState } from "react"

export default function SubmissionForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    location: "",
    timeOfDay: "",
    weather: "",
    roadType: "",
    video: null as File | null,
    consentAgree: false,
    consentRead: false,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === "checkbox") {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked })
    } else if (type === "file") {
      setFormData({ ...formData, video: (e.target as HTMLInputElement).files?.[0] || null })
    } else {
      setFormData({ ...formData, [name]: value })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Form Submitted:", formData)
    alert("Your submission has been recorded. Thank you!")
  }

  return (
  <div className="min-h-screen bg-gray-100 pt-[65px] flex items-center justify-center">
  <div className="max-w-2xl w-full bg-white shadow-lg rounded-2xl p-8 relative">
    
    <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Submit Dashcam Footage</h2>

    <form onSubmit={handleSubmit} className="space-y-6">
    
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-600">Email (Optional)</label>
          <span className="text-xs text-gray-400">Provide if you want updates on your submission</span>
        </div>
        <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="yourname@email.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Upload Video</label>
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg h-32 cursor-pointer hover:border-indigo-500 transition">
          <input type="file" name="video" accept="video/*" onChange={handleChange} className="hidden" required />
          <span className="text-gray-500 text-sm">{formData.video ? formData.video.name : "Click to upload or drag & drop"}</span>
          <span className="text-xs text-gray-400">Accepted formats: mp4, mov, avi</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Location (City / Area)</label>
        <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g., Quezon City" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Time of Day</label>
        <select name="timeOfDay" value={formData.timeOfDay} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" >
          <option value="" disabled>Select...</option>
          <option value="Morning">Morning</option>
          <option value="Afternoon">Afternoon</option>
          <option value="Night">Night</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Weather</label>
        <select name="weather" value={formData.weather} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" >
          <option value="" disabled>Select...</option>
          <option value="Sunny">Sunny</option>
          <option value="Rainy">Rainy</option>
          <option value="Cloudy">Cloudy</option>
          <option value="Night">Nighttime</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Road Type</label>
        <select name="roadType" value={formData.roadType} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" >
          <option value="" disabled>Select...</option>
          <option value="Highway">Highway</option>
          <option value="Urban">Urban</option>
          <option value="Rural">Rural</option>
        </select>
      </div>

      <div className="flex items-start space-x-2">
        <input type="checkbox" name="consentAgree" checked={formData.consentAgree} onChange={handleChange} required className="mt-1" />
        <label className="text-sm text-gray-600 leading-snug">
          I confirm this footage can be used for research and dataset development. Faces and license plates will be <span className="font-semibold">anonymized</span>. Data will only be used for academic and scientific purposes.
        </label>
      </div>

      <div className="flex items-start space-x-2">
        <input type="checkbox" name="consentRead" checked={formData.consentRead} onChange={handleChange} required className="mt-1" />
        <label className="text-sm text-gray-600 leading-snug">
          I have read and understood the <span className="font-semibold">Data Privacy Notice</span>, and I acknowledge the policies on anonymization, storage, and ethical use of data.
        </label>
      </div>

      <div>
        <button type="submit" className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 font-medium shadow">Submit</button>
      </div>

    </form>
  </div>
  </div>
  )
}
