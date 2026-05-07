import { useMemo, useState } from 'react'
import { AlertCircle, Clock, CheckCircle, Rows3, LayoutGrid } from 'lucide-react'

const tickets = [
  { id: 'T-001', contact: 'Joao Silva', title: 'Boleto vencido - solicita 2a via', status: 'open', priority: 'high', agent: 'Ana', date: '18/03/2026' },
  { id: 'T-002', contact: 'Maria Santos', title: 'Desbloqueio temporario de conexao', status: 'in_progress', priority: 'high', agent: 'Carlos', date: '18/03/2026' },
  { id: 'T-003', contact: 'Pedro Alves', title: 'Lentidao na conexao apos 22h', status: 'open', priority: 'normal', agent: '-', date: '17/03/2026' },
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

const boardColumns = [
  { key: 'open', title: 'Abertos', color: 'border-indigo-200 bg-indigo-50/40' },
  { key: 'in_progress', title: 'Em andamento', color: 'border-yellow-200 bg-yellow-50/40' },
  { key: 'closed', title: 'Fechados', color: 'border-green-200 bg-green-50/40' },
]

export default function Tickets() {
  const [filter, setFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban')

  const filtered = useMemo(() => {
    return tickets.filter(t => filter === 'all' || t.status === filter)
  }, [filter])

  const grouped = useMemo(() => {
    return {
      open: filtered.filter(t => t.status === 'open'),
      in_progress: filtered.filter(t => t.status === 'in_progress'),
      closed: filtered.filter(t => t.status === 'closed'),
    }
  }, [filtered])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Chamados</h2>
        <p className="text-gray-500 text-sm">Gestao de tickets de suporte</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2 flex-wrap">
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

          <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1 ${viewMode === 'kanban' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <LayoutGrid size={14} /> Kanban
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1 ${viewMode === 'table' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <Rows3 size={14} /> Tabela
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['ID', 'Cliente', 'Titulo', 'Status', 'Prioridade', 'Responsavel', 'Data'].map(h => (
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
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {boardColumns.map(column => (
                <div key={column.key} className={`rounded-xl border ${column.color} min-h-[420px]`}>
                  <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">{column.title}</p>
                    <span className="text-xs bg-white/80 text-gray-600 px-2 py-0.5 rounded-full">
                      {grouped[column.key as keyof typeof grouped].length}
                    </span>
                  </div>

                  <div className="p-3 space-y-3">
                    {grouped[column.key as keyof typeof grouped].length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-white/70 px-3 py-6 text-center text-xs text-gray-500">
                        Nenhum chamado nesta coluna
                      </div>
                    ) : (
                      grouped[column.key as keyof typeof grouped].map(ticket => {
                        const p = priorityMap[ticket.priority]
                        return (
                          <article key={ticket.id} className="rounded-lg bg-white border border-gray-200 p-3 shadow-sm hover:shadow transition-shadow cursor-pointer">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-mono text-gray-400">{ticket.id}</p>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${p.color}`}>{p.label}</span>
                            </div>

                            <h4 className="mt-2 text-sm font-semibold text-gray-900 line-clamp-2">{ticket.title}</h4>
                            <p className="mt-1 text-xs text-gray-500">Cliente: {ticket.contact}</p>

                            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                              <span>{ticket.agent}</span>
                              <span>{ticket.date}</span>
                            </div>
                          </article>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
