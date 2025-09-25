"use client"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts"

export default function Dashboard() {

  const activities = [
    { icon: "📹", action: "Uploaded", file: "dashcam1.mp4", time: "Today" },
    { icon: "✅", action: "Annotated", file: "jeepney_2.mp4", time: "Yesterday" },
    { icon: "📝", action: "Approved", file: "motorcycle_lane.mp4", time: "2 days ago" },
  ]

  const stats = [
    { label: "Videos", value: "12" },
    { label: "Frames Extracted", value: "23,400" },
    { label: "Bounding Boxes", value: "50,231" },
    { label: "Total Duration", value: "10h 45m" },
    { label: "Approval Rate", value: "92%", highlight: true },
    { label: "Dataset Size", value: "48 GB" },
  ]

  const classData = [
    { name: "Cars", value: 1200 },
    { name: "Motorcycles", value: 800 },
    { name: "Trucks", value: 300 },
    { name: "Jeepneys", value: 150 },
    { name: "Tricycles", value: 100 },
  ]

  const uploadsByDay = [
    { day: "Mon", uploads: 3 },
    { day: "Tue", uploads: 5 },
    { day: "Wed", uploads: 2 },
    { day: "Thu", uploads: 6 },
    { day: "Fri", uploads: 4 },
  ]

  const progressData = [
    { week: "W1", completion: 20 },
    { week: "W2", completion: 35 },
    { week: "W3", completion: 50 },
    { week: "W4", completion: 65 },
  ]

  const COLORS = ["#2563eb", "#16a34a", "#facc15", "#f97316", "#dc2626"]

  return (
  <div className="p-4 md:p-6 bg-gray-50 min-h-screen space-y-6">

    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Dataset Dashboard</h1>
      <button className="mt-3 md:mt-0 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm font-medium shadow">Download Report</button>
    </div>

    <div className="overflow-x-auto">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 min-w-max">
      {stats.map((stat, index) => (
        <div key={index} className="bg-white shadow-sm p-4 rounded-xl">
          <p className="text-gray-500 text-sm">{stat.label}</p>
          <p className={`text-xl font-bold ${stat.highlight ? "text-green-600" : "text-gray-800"}`}>{stat.value}</p>
        </div>
      ))}
    </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <div className="bg-white shadow-sm p-5 rounded-xl">
        <h2 className="text-lg font-semibold mb-3">Class Distribution</h2>
        <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie data={classData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label >
            {classData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white shadow-sm p-5 rounded-xl">
        <h2 className="text-lg font-semibold mb-3">Completion Progress</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={progressData}>
            <XAxis dataKey="week" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="completion" stroke="#16a34a" strokeWidth={3} dot />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-3 text-sm text-gray-500"> Estimated Completion Date:{" "}
          <span className="font-semibold">Nov 2025</span>
        </p>
      </div>

      <div className="bg-white shadow-sm p-5 rounded-xl">
        <h2 className="text-lg font-semibold mb-3">Uploads This Week</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={uploadsByDay}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="uploads" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>

    <div className="bg-white shadow-sm p-5 rounded-xl">
      <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
      <ul className="space-y-2 text-gray-600 text-sm">
        {activities.map((activity, index) => (
          <li key={index}>
            {activity.icon} {activity.action}: {activity.file}{" "}
            <span className="text-gray-400">({activity.time})</span>
          </li>
        ))}
      </ul>
    </div>
    
  </div>
  )
}
