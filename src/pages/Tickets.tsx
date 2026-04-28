import { useState } from 'react'
import { AlertCircle, Clock, CheckCircle } from 'lucide-react'

const tickets = [
  { id: 'T-001', contact: 'João Silva', title: 'Boleto vencido - solicita 2ª via', status: 'open', priority: 'high', agent: 'Ana', date: '18/03/2026' },
  { id: 'T-002', contact: 'Maria Santos', title: 'Desbloqueio temporário de conexão', status: 'in_progress', priority: 'high', agent: 'Carlos', date: '18/03/2026' },
  { id: 'T-003', contact: 'Pedro Alves', title: 'Lentidão na conexão após 22h', status: 'open', priority: 'normal', agent: '-', date: '17/03/2026' },
  { id: 'T-004', contact: 'Ana Lima', title: 'Troca de plano para 200MB', status: 'closed', priority: 'low', agent: 'Ana', date: '16/03/2026' },
  { id: 'T-005', contact: 'Carlos Mendes', title: 'Sem sinal desde ontem', status: 'in_progress', priority: 'high', agent: 'Carlos', date: '17/03/2026' },
]

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Aberto', color: 'bg-indigo-100 text-indigo-700', icon: AlertCircle },
  in_progress: { label: 'Em andamento', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  closed: { label: 'Fechado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
}

const priorityMap: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: 'bg-red-100 text-red-700' },
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-600' },
  low: { label: 'Baixa', color: 'bg-blue-100 text-blue-700' },
}

const filters = [
  ['all', 'Todos'],
  ['open', 'Abertos'],
  ['in_progress', 'Em andamento'],
  ['closed', 'Fechados'],
]

export default function Tickets() {
  const [filter, setFilter] = useState('all')

  const filtered = tickets.filter(t => filter === 'all' || t.status === filter)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Chamados</h2>
        <p className="text-gray-500 text-sm">Gestão de tickets de suporte</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex gap-2">
          {filters.map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${filter === val ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['ID', 'Cliente', 'Título', 'Status', 'Prioridade', 'Responsável', 'Data'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(ticket => {
                const s = statusMap[ticket.status]
                const p = priorityMap[ticket.priority]
                const Icon = s.icon
                return (
                  <tr key={ticket.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3.5 text-sm font-mono text-gray-400">{ticket.id}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{ticket.contact}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 max-w-xs truncate">{ticket.title}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${s.color}`}>
                        <Icon size={11} /> {s.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${p.color}`}>{p.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{ticket.agent}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">{ticket.date}</td>
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