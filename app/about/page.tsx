import Navbar from "../components/Navbar"

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <div className="pt-20 max-w-3xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">About Us</h1>
        <p className="text-stone-700">
          This is a placeholder About page. Add your project / team info here.
        </p>
      </div>
    </>
  )
}
