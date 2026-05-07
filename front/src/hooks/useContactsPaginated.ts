import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Contact } from '../types'

const PAGE_SIZE = 20

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getStatusFromData(data: Record<string, unknown> | null): 'A' | 'S' | 'I' {
  if (!data) return 'S'

  const ativado = String(data.cli_ativado || '').trim().toLowerCase()
  const bloqueado = String(data.bloqueado || '').trim().toLowerCase()

  if (ativado === 's' && bloqueado === 'sim') return 'I'
  if (ativado === 's') return 'A'
  if (ativado === 'n') return 'S'

  return 'A'
}

export interface PaginatedContactsResult {
  contacts: Contact[]
  planOptions: string[]
  totalCount: number
  currentPage: number
  totalPages: number
  isLoading: boolean
  error: string
  goToPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
  refetch: () => void
}

function getPlanFromData(data: Record<string, unknown> | null): string {
  if (!data) return ''
  return String(data.plano || data.tipo || '').trim()
}

export function useContactsPaginated(
  tenantId: string | null,
  search = '',
  statusFilter: 'ALL' | 'A' | 'S' | 'I' = 'ALL',
  planFilter = 'ALL'
): PaginatedContactsResult {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [planOptions, setPlanOptions] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchPlanOptions = useCallback(async () => {
    if (!tenantId) {
      setPlanOptions([])
      return
    }

    const { data, error: optionsError } = await supabase
      .from('contacts')
      .select('mk_data')
      .eq('tenant_id', tenantId)
      .not('mk_id', 'is', null)
      .limit(10000)

    if (optionsError) return

    const uniquePlans = Array.from(new Set(
      (data || [])
        .map(item => {
          const mkData = typeof item.mk_data === 'object' && item.mk_data !== null
            ? (item.mk_data as unknown as Record<string, unknown>)
            : null
          return getPlanFromData(mkData)
        })
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    setPlanOptions(uniquePlans)
  }, [tenantId])

  const fetchContacts = useCallback(async () => {
    if (!tenantId) return

    setIsLoading(true)
    setError('')

    const normalizedSearch = normalizeSearchText(search)
    const offset = (currentPage - 1) * PAGE_SIZE

    if (normalizedSearch || statusFilter !== 'ALL' || planFilter !== 'ALL') {
      // Busca global: traz candidatos do tenant e filtra localmente sem acento/case.
      const { data: allContacts, error: allError } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .not('mk_id', 'is', null)
        .order('mk_synced_at', { ascending: false, nullsFirst: false })
        .limit(10000)

      if (allError) {
        setError(`Erro ao buscar contatos: ${allError.message}`)
        setIsLoading(false)
        return
      }

      const filteredContacts = (allContacts || []).filter(contact => {
        const normalizedName = normalizeSearchText(contact.name || '')
        const normalizedWhatsapp = normalizeSearchText(contact.whatsapp || '')
        const normalizedMkId = normalizeSearchText(contact.mk_id || '')
        const mkData = typeof contact.mk_data === 'object' && contact.mk_data !== null
          ? (contact.mk_data as unknown as Record<string, unknown>)
          : null
        const currentStatus = getStatusFromData(mkData)
        const currentPlan = normalizeSearchText(getPlanFromData(mkData))

        const matchesStatus = statusFilter === 'ALL' ? true : currentStatus === statusFilter
        const matchesPlan = planFilter === 'ALL' ? true : currentPlan === normalizeSearchText(planFilter)

        if (!matchesStatus) return false
        if (!matchesPlan) return false

        if (!normalizedSearch) return true

        return (
          normalizedName.includes(normalizedSearch) ||
          normalizedWhatsapp.includes(normalizedSearch) ||
          normalizedMkId.includes(normalizedSearch) ||
          currentPlan.includes(normalizedSearch)
        )
      })

      setTotalCount(filteredContacts.length)
      setContacts(filteredContacts.slice(offset, offset + PAGE_SIZE))
      setIsLoading(false)
      return
    }

    // Buscar total
    const { count, error: countError } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('mk_id', 'is', null)

    if (countError) {
      setError(`Erro ao contar contatos: ${countError.message}`)
      setIsLoading(false)
      return
    }

    setTotalCount(count || 0)

    // Buscar página
    const { data, error: dataError } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('mk_id', 'is', null)
      .order('mk_synced_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (dataError) {
      setError(`Erro ao buscar contatos: ${dataError.message}`)
      setIsLoading(false)
      return
    }

    setContacts(data || [])
    setIsLoading(false)
  }, [tenantId, currentPage, search, statusFilter, planFilter])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  useEffect(() => {
    fetchPlanOptions()
  }, [fetchPlanOptions])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, planFilter])

  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE)

  return {
    contacts,
    planOptions,
    totalCount,
    currentPage,
    totalPages,
    isLoading,
    error,
    goToPage: (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page)
      }
    },
    nextPage: () => {
      if (currentPage < totalPages) {
        setCurrentPage(currentPage + 1)
      }
    },
    prevPage: () => {
      if (currentPage > 1) {
        setCurrentPage(currentPage - 1)
      }
    },
    refetch: fetchContacts,
  }
}
