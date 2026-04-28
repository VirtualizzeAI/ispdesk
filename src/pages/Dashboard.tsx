import { MessageSquare, Clock, CheckCircle, Wifi } from 'lucide-react'

const stats = [
  { label: 'Conversas abertas', value: '12', icon: MessageSquare, color: 'bg-indigo-500' },
  { label: 'Aguardando', value: '4', icon: Clock, color: 'bg-yellow-500' },
  { label: 'Resolvidos hoje', value: '28', icon: CheckCircle, color: 'bg-green-500' },
  { label: 'WhatsApp', value: 'Conectado', icon: Wifi, color: 'bg-emerald-500' },
]

const recentConversations = [
  { name: 'João Silva', number: '5584999990001', message: 'Meu boleto está vencido...', time: '5min', status: 'open' },
  { name: 'Maria Santos', number: '5584999990002', message: 'Preciso de desbloqueio', time: '12min', status: 'waiting' },
  { name: 'Pedro Alves', number: '5584999990003', message: 'Internet caiu novamente', time: '18min', status: 'open' },
  { name: 'Ana Lima', number: '5584999990004', message: 'Quero mudar de plano', time: '34min', status: 'closed' },
]

const statusLabel: Record<string, string> = {
  open: 'Aberto',
  waiting: 'Aguardando',
  closed: 'Fechado',
}

const statusColor: Record<string, string> = {
  open: 'bg-indigo-100 text-indigo-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-green-100 text-green-700',
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 text-sm">Visão geral do atendimento</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{label}</span>
              <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center`}>
                <Icon size={18} className="text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent conversations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Conversas recentes</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {recentConversations.map((conv) => (
            <div key={conv.number} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer">
              <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
                {conv.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{conv.name}</p>
                <p className="text-xs text-gray-400 truncate">{conv.message}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-gray-400">{conv.time}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[conv.status]}`}>
                  {statusLabel[conv.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}