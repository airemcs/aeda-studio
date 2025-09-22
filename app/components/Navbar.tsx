import Link from 'next/link'
import React from 'react'

const Navbar = () => {
  return (
    <div className="navbar bg-base-100 shadow-md px-4 ">
      <div className="navbar-start lg:ml-2">
        <div className="dropdown">
          <div tabIndex={0} role="button" className="btn btn-ghost lg:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </div>
          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow font-semibold"
          >
            <li><Link href="/dashboard">View Dashboard</Link></li>
            <li><Link href="/submit">Submission Form</Link></li>
            <li><Link href="/annotate">Annotation Tool</Link></li>
            <li><Link href="/about">About Us</Link></li>
          </ul>
        </div>
        <Link href="/" className="text-xl font-bold">AEDA Studio</Link>
      </div>

      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1 gap-x-8 font-semibold">
          <li><Link href="/dashboard">View Dashboard</Link></li>
          <li><Link href="/submit">Submission Form</Link></li>
          <li><Link href="/annotate">Annotation Tool</Link></li>
          <li><Link href="/about">About Us</Link></li>
        </ul>
      </div>

      <div className="navbar-end lg:mr-2">
        <Link href="/login" className="btn btn-primary">Login</Link>
      </div>
    </div>
  )
}

export default Navbar
