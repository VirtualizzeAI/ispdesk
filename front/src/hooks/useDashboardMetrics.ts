import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type DashboardMetrics = {
  activeClients: number
  inactiveClients: number
  delinquentClients: number
  estimatedRevenue: number
  openConversations: number
  waitingConversations: number
  avgResponseMinutes: number
  avgResolutionMinutes: number
  openTickets: number
  inProgressTickets: number
  closedTicketsToday: number
  slaCompliancePercent: number
  recentConversations: Array<{
    id: string
    name: string
    message: string
    status: string
    updatedAt: string
  }>
}

function getStatusFromData(data: Record<string, unknown> | null): 'A' | 'S' | 'I' {
  if (!data) return 'S'
  const ativado = String(data.cli_ativado || '').trim().toLowerCase()
  const bloqueado = String(data.bloqueado || '').trim().toLowerCase()
  if (ativado === 's' && bloqueado === 'sim') return 'I'
  if (ativado === 's') return 'A'
  return 'S'
}

function parseCurrencyLike(value: unknown): number {
  if (value === undefined || value === null) return 0
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function useDashboardMetrics(tenantId: string | null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeClients: 0,
    inactiveClients: 0,
    delinquentClients: 0,
    estimatedRevenue: 0,
    openConversations: 0,
    waitingConversations: 0,
    avgResponseMinutes: 0,
    avgResolutionMinutes: 0,
    openTickets: 0,
    inProgressTickets: 0,
    closedTicketsToday: 0,
    slaCompliancePercent: 0,
    recentConversations: [],
  })

  useEffect(() => {
    async function fetchMetrics() {
      if (!tenantId) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const [contactsRes, conversationsRes, ticketsRes, messagesRes] = await Promise.all([
          supabase
            .from('contacts')
            .select('id,mk_data')
            .eq('tenant_id', tenantId),
          supabase
            .from('conversations')
            .select('id,status,created_at,updated_at,contact:contacts(name,whatsapp),messages(content,created_at)')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false })
            .limit(10),
          supabase
            .from('tickets')
            .select('id,status,created_at,updated_at')
            .eq('tenant_id', tenantId),
          supabase
            .from('messages')
            .select('id,conversation_id,from_me,created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(1200),
        ])

        if (contactsRes.error) throw contactsRes.error
        if (conversationsRes.error) throw conversationsRes.error
        if (ticketsRes.error) throw ticketsRes.error
        if (messagesRes.error) throw messagesRes.error

        const contacts = (contactsRes.data ?? []) as Array<{ mk_data?: Record<string, unknown> | null }>
        const conversations = (conversationsRes.data ?? []) as Array<Record<string, any>>
        const tickets = (ticketsRes.data ?? []) as Array<{ status: string; created_at: string; updated_at: string }>
        const messages = (messagesRes.data ?? []) as Array<{ conversation_id: string; from_me: boolean; created_at: string }>

        let activeClients = 0
        let inactiveClients = 0
        let delinquentClients = 0
        let estimatedRevenue = 0

        contacts.forEach(contact => {
          const mkData = (contact.mk_data ?? null) as Record<string, unknown> | null
          const status = getStatusFromData(mkData)
          if (status === 'A') activeClients += 1
          if (status === 'S') inactiveClients += 1
          if (status === 'I') delinquentClients += 1

          const value = mkData
            ? parseCurrencyLike(
              mkData.valor_mensalidade
              || mkData.valor_plano
              || mkData.mensalidade
              || mkData.vlr_plano,
            )
            : 0

          estimatedRevenue += value
        })

        const openConversations = conversations.filter(conversation => conversation.status === 'open').length
        const waitingConversations = conversations.filter(conversation => conversation.status === 'waiting').length

        const groupedByConversation = new Map<string, Array<{ from_me: boolean; created_at: string }>>()
        messages.forEach(message => {
          const list = groupedByConversation.get(message.conversation_id) || []
          list.push(message)
          groupedByConversation.set(message.conversation_id, list)
        })

        let totalResponseMinutes = 0
        let responseSamples = 0

        groupedByConversation.forEach(list => {
          const ordered = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          for (let index = 0; index < ordered.length - 1; index += 1) {
            const current = ordered[index]
            const next = ordered[index + 1]
            if (!current.from_me && next.from_me) {
              const diffMs = new Date(next.created_at).getTime() - new Date(current.created_at).getTime()
              if (diffMs >= 0) {
                totalResponseMinutes += diffMs / 60000
                responseSamples += 1
              }
            }
          }
        })

        const avgResponseMinutes = responseSamples > 0 ? totalResponseMinutes / responseSamples : 0

        const resolvedTickets = tickets.filter(ticket => ticket.status === 'closed')
        const totalResolutionMinutes = resolvedTickets.reduce((acc, ticket) => {
          const created = new Date(ticket.created_at).getTime()
          const updated = new Date(ticket.updated_at).getTime()
          if (updated <= created) return acc
          return acc + ((updated - created) / 60000)
        }, 0)

        const avgResolutionMinutes = resolvedTickets.length > 0
          ? totalResolutionMinutes / resolvedTickets.length
          : 0

        const openTickets = tickets.filter(ticket => ticket.status === 'open').length
        const inProgressTickets = tickets.filter(ticket => ticket.status === 'in_progress').length

        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        const closedTicketsToday = resolvedTickets.filter(ticket => new Date(ticket.updated_at) >= startOfDay).length

        const ticketsWithinSla = resolvedTickets.filter(ticket => {
          const created = new Date(ticket.created_at).getTime()
          const updated = new Date(ticket.updated_at).getTime()
          return updated > created && (updated - created) <= (24 * 60 * 60 * 1000)
        }).length

        const slaCompliancePercent = resolvedTickets.length > 0
          ? (ticketsWithinSla / resolvedTickets.length) * 100
          : 0

        const recentConversations = conversations.slice(0, 4).map(conversation => {
          const latestMessage = Array.isArray(conversation.messages)
            ? conversation.messages[conversation.messages.length - 1]
            : null
          const contact = conversation.contact || {}
          return {
            id: String(conversation.id),
            name: String(contact.name || contact.whatsapp || 'Sem nome'),
            message: String(latestMessage?.content || 'Sem mensagens recentes'),
            status: String(conversation.status || 'open'),
            updatedAt: String(conversation.updated_at),
          }
        })

        setMetrics({
          activeClients,
          inactiveClients,
          delinquentClients,
          estimatedRevenue,
          openConversations,
          waitingConversations,
          avgResponseMinutes,
          avgResolutionMinutes,
          openTickets,
          inProgressTickets,
          closedTicketsToday,
          slaCompliancePercent,
          recentConversations,
        })
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Erro ao carregar KPIs'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [tenantId])

  const formatted = useMemo(() => ({
    ...metrics,
    avgResponseLabel: `${Math.round(metrics.avgResponseMinutes)}m`,
    avgResolutionLabel: `${Math.round(metrics.avgResolutionMinutes)}m`,
    slaLabel: `${metrics.slaCompliancePercent.toFixed(1)}%`,
  }), [metrics])

  return {
    loading,
    error,
    metrics: formatted,
  }
}
