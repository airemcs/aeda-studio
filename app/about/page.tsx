"use client"
import Navbar from "../components/Navbar"

export default function AboutUsPage() {
  const team = [
    { name: "Arren Matthew Antioquia", role: "Thesis Adviser", img: "/team/antioquia.jpg" },
    { name: "Adriel Manuel Fancubit", role: "Thesis Researcher", img: "/civi.jpg" },
    { name: "Airelle Loumel Maagma", role: "Thesis Researcher", img: "/team/maagma.jpg" },
    { name: "Dylan Andrei Rodriguez", role: "Thesis Researcher", img: "/team/rodriguez.jpeg" },
    { name: "Edric Jensen See", role: "Thesis Researcher", img: "/team/see.jpg" },
  ]

  return (
    <>
      <Navbar />

      <div className="mt-[52px] px-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-12">
        
        <div className="flex-1 space-y-12">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <img src="/civi.jpg" alt="CIVI Logo" className="w-32 h-32 object-contain rounded-lg shadow-md" />
            <div className="text-center md:text-left">
              <h1 className="text-3xl font-bold text-gray-800">About Us</h1>
              <p className="text-gray-600 mt-3">
                We are an <span className="font-semibold">Undergraduate Research Team</span> under the{" "}
                <span className="font-semibold">Center for Computational Imaging and Visual Innovations (CIVI)</span>, 
                De La Salle University. Our project focuses on the development of a localized dashcam dataset 
                to improve vehicle detection models for Philippine traffic conditions.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Our Project</h2>
            <p className="text-gray-600 text-md leading-relaxed">
              Our thesis project, <span className="font-semibold">AEDA: Annotated Dashcam Dataset for Vehicle Detection</span>, 
              addresses the lack of localized datasets for the Philippines. Most existing datasets like KITTI or BDD100K 
              are collected abroad, making them less effective for detecting unique vehicle types and conditions in 
              Philippine roads such as <span className="font-semibold">jeepneys, tricycles, motorcycles, and congested urban traffic</span>.
            </p>

            <p className="text-gray-600 text-md leading-relaxed mt-3">
              We designed a data pipeline that collects raw dashcam footage, extracts video frames, 
              and applies bounding box annotations for vehicles. The dataset is also processed with 
              <span className="font-semibold"> privacy-preserving techniques</span> such as anonymizing faces 
              and license plates to meet ethical and legal standards.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">About CIVI</h2>
            <p className="text-gray-600 text-md leading-relaxed">
              The Center for Computational Imaging & Visual Innovations (CIVI) is a research center under the 
              Advanced Research Institute for Informatics, Computing, and Networking (AdRIC) at De La Salle University. 
              We specialize in research projects centered on solving real-world problems through deep learning 
              solutions trained on visual data. 
            </p>
            <ul className="list-disc list-inside text-gray-600 text-md mt-3 space-y-1">
              <li><span className="font-semibold">Data Collection</span> – building novel high-quality datasets</li>
              <li><span className="font-semibold">Model Building & Optimization</span> – developing efficient architectures</li>
              <li><span className="font-semibold">Application Development</span> – integrating AI into real-world tools</li>
            </ul>
          </div>
        </div>

        <div className="w-full lg:w-fit bg-white rounded-xl border-1 border-slate-200 shadow-xl p-6 h-fill">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Research Team</h2>
          <div className="space-y-6">
            {team.map((member, index) => (
              <div key={index} className="flex items-center gap-4">
                <img src={member.img} alt={member.name} className="w-16 h-16 rounded-full object-cover shadow-xl" />
                <div>
                  <h3 className="font-semibold text-gray-800 text-md">{member.name}</h3>
                  <p className="text-sm text-gray-500">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
