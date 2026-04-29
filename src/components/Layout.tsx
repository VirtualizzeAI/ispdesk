import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Users,
  Ticket, Settings, LogOut, Wifi, Bell, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas' },
  { to: '/contacts', icon: Users, label: 'Clientes' },
  { to: '/tickets', icon: Ticket, label: 'Chamados' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

export default function Layout() {
  const navigate = useNavigate()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col transition-all duration-200 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
        style={{ backgroundColor: '#1a1a2e' }}
      >
        {/* Logo */}
        <div className={`flex items-center py-5 border-b border-white/10 ${isSidebarCollapsed ? 'justify-center px-3' : 'px-6'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Wifi size={16} className="text-white" />
            </div>
            {!isSidebarCollapsed && <span className="text-white font-bold text-lg">ISPDesk</span>}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} ${isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {!isSidebarCollapsed && label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/10 space-y-1.5">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(current => !current)}
            title={isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            className={`px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/10 hover:text-white transition-all w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!isSidebarCollapsed && 'Recolher menu'}
          </button>
          <button
            onClick={handleLogout}
            title="Sair"
            className={`px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/10 hover:text-white transition-all w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}
          >
            <LogOut size={18} />
            {!isSidebarCollapsed && 'Sair'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <h1 className="text-sm text-gray-500">Bem-vindo ao ISPDesk</h1>
          <div className="flex items-center gap-3">
            <button className="relative text-gray-400 hover:text-gray-600">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              A
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}