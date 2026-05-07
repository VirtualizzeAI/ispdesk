import { useState } from 'react'
import { getMKClienteListar, searchMKByCPF } from '../lib/mkauth'

export function useMKSearch(tenantId: string) {
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [cpfResult, setCpfResult] = useState<{ cliente: any; titulos: any[] } | null>(null)

  const search = async (query: string) => {
    if (!query || query.length < 2) {
      setResults([])
      setCpfResult(null)
      return
    }

    setSearching(true)
    const isCPF = query.replace(/\D/g, '').length >= 8

    if (isCPF) {
      // Busca por CPF — retorna cliente + títulos de uma vez
      const data = await searchMKByCPF(tenantId, query.replace(/\D/g, ''))
      if (data?.cliente) {
        setCpfResult({ cliente: data.cliente, titulos: data.titulos || [] })
        setResults([])
      } else {
        setCpfResult(null)
        setResults([])
      }
    } else {
      // Busca por nome — lista e filtra
      setCpfResult(null)
      const clientes = await getMKClienteListar(tenantId, 1, query)
      setResults(clientes.slice(0, 8))
    }

    setSearching(false)
  }

  return { results, searching, search, setResults, cpfResult, setCpfResult }
}