"use client"
import React, { useState } from "react"

export default function LoginForm() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Login attempt:", formData)
  }

  return (
  <div className="min-h-screen bg-gray-100 pt-[65px] flex items-center justify-center">
  <div className="max-w-sm w-full bg-white shadow-lg rounded-2xl p-8">
    
    <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Admin Login</h2>

    <form onSubmit={handleSubmit} className="space-y-5 text-sm">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Username</label>
        <input type="text" name="username" value={formData.username} onChange={handleChange} required placeholder="Enter your username" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Password</label>
        <input type="password" name="password" value={formData.password} onChange={handleChange} required placeholder="••••••••" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div>
        <button type="submit" className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 font-medium text-sm shadow">Login</button>
      </div>
    </form>
    
  </div>
  </div>
  )
}
