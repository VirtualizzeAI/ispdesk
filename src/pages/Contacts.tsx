import { useState } from 'react'
import { Search, Wifi, WifiOff, AlertCircle } from 'lucide-react'

const contacts = [
  { id: '1', name: 'João Silva', whatsapp: '5584999990001', plano: 'Fibra 100MB', status: 'S', lastContact: '18/03/2026' },
  { id: '2', name: 'Maria Santos', whatsapp: '5584999990002', plano: 'Fibra 200MB', status: 'A', lastContact: '17/03/2026' },
  { id: '3', name: 'Pedro Alves', whatsapp: '5584999990003', plano: 'Fibra 50MB', status: 'I', lastContact: '16/03/2026' },
  { id: '4', name: 'Ana Lima', whatsapp: '5584999990004', plano: 'Fibra 100MB', status: 'A', lastContact: '15/03/2026' },
  { id: '5', name: 'Carlos Mendes', whatsapp: '5584999990005', plano: 'Fibra 300MB', status: 'A', lastContact: '14/03/2026' },
]

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  A: { label: 'Ativo', color: 'bg-green-100 text-green-700', icon: Wifi },
  S: { label: 'Suspenso', color: 'bg-red-100 text-red-700', icon: WifiOff },
  I: { label: 'Inadimplente', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
}

export default function Contacts() {
  const [search, setSearch] = useState('')

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.whatsapp.includes(search)
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Clientes</h2>
          <p className="text-gray-500 text-sm">Gerenciar clientes cadastrados</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou número..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">WhatsApp</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Plano</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Último contato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(contact => {
                const s = statusMap[contact.status]
                const Icon = s.icon
                return (
                  <tr key={contact.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm">
                          {contact.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{contact.whatsapp}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{contact.plano}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
                        <Icon size={11} /> {s.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">{contact.lastContact}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}