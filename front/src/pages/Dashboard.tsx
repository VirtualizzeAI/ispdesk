import { MessageSquare, Clock, CheckCircle, Wifi, Wallet, Users, ReceiptText, Ticket } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useDashboardMetrics } from '../hooks/useDashboardMetrics'

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

type MetricCard = {
  label: string
  value: string | number
  icon: any
  color: string
  note?: string
}

function SectionCards({ title, subtitle, data }: { title: string; subtitle: string; data: MetricCard[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map(({ label, value, icon: Icon, color, note }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{label}</span>
              <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center`}>
                <Icon size={18} className="text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { profile } = useProfile()
  const { loading, error, metrics } = useDashboardMetrics(profile?.tenant_id || null)

  const financialKPIs = [
    { label: 'Clientes ativos', value: metrics.activeClients, icon: Users, color: 'bg-emerald-500' },
    { label: 'Inadimplentes', value: metrics.delinquentClients, icon: ReceiptText, color: 'bg-amber-500' },
    { label: 'Desativados', value: metrics.inactiveClients, icon: Users, color: 'bg-rose-500' },
    {
      label: 'Receita estimada',
      value: metrics.estimatedRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      icon: Wallet,
      color: 'bg-indigo-500',
    },
  ]

  const atendimentoKPIs = [
    { label: 'Conversas abertas', value: metrics.openConversations, icon: MessageSquare, color: 'bg-indigo-500' },
    { label: 'Aguardando', value: metrics.waitingConversations, icon: Clock, color: 'bg-yellow-500' },
    { label: 'Tempo medio de resposta', value: metrics.avgResponseLabel, icon: Clock, color: 'bg-blue-500' },
    { label: 'Tempo medio de conclusao', value: metrics.avgResolutionLabel, icon: CheckCircle, color: 'bg-green-500' },
  ]

  const ticketKPIs = [
    { label: 'Chamados abertos', value: metrics.openTickets, icon: Ticket, color: 'bg-indigo-500' },
    { label: 'Em andamento', value: metrics.inProgressTickets, icon: Clock, color: 'bg-yellow-500' },
    { label: 'Fechados hoje', value: metrics.closedTicketsToday, icon: CheckCircle, color: 'bg-green-500' },
    { label: 'SLA cumprido', value: metrics.slaLabel, icon: CheckCircle, color: 'bg-emerald-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 text-sm">Visao consolidada financeira, atendimento e chamados</p>
        </div>
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-100">
          <Wifi size={14} /> WhatsApp conectado
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Carregando KPIs...</div>}
      {error && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Falha ao carregar KPIs reais: {error}</div>}

      <SectionCards
        title="KPIs financeiros"
        subtitle="Clientes ativos, inadimplencia, desativados e receita estimada"
        data={financialKPIs}
      />

      <SectionCards
        title="KPIs de atendimento"
        subtitle="Velocidade e qualidade operacional das conversas"
        data={atendimentoKPIs}
      />

      <SectionCards
        title="KPIs de chamados"
        subtitle="Volume, execucao e cumprimento de SLA"
        data={ticketKPIs}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Conversas recentes</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {metrics.recentConversations.map(c => (
            <div key={c.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-gray-500 truncate">{c.message}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <span className="text-xs text-gray-400">{new Date(c.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[c.status]}`}>
                  {statusLabel[c.status]}
                </span>
              </div>
            </div>
          ))}
          {metrics.recentConversations.length === 0 && (
            <div className="px-5 py-6 text-sm text-gray-500">Sem conversas recentes para exibir.</div>
          )}
        </div>
      </div>
    </div>
  )
}
