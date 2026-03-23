import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 pb-14 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
