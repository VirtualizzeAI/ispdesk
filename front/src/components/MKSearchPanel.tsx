import { useState } from 'react'
import { Search, Link, CheckCircle, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { searchMKByCPF, getMKClienteListar, getMKTitulosByCPF, formatMKStatus } from '../lib/mkauth'

interface Props {
  contact: any
  profile: any
  mkClient: any
  boletos: any[]
  activeTab: 'cliente' | 'boletos'
  conversationClosed?: boolean
  onClientSelected: (client: any) => void
  onBoletosFetched: (boletos: any[]) => void
  onEnviarBoleto?: (boleto: any) => void
}

export default function MKSearchPanel({
  contact, profile, mkClient, boletos, activeTab, conversationClosed, onClientSelected, onBoletosFetched, onEnviarBoleto
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linked, setLinked] = useState(false)
  const [mostrarPagos, setMostrarPagos] = useState(false)
  const [resultSource, setResultSource] = useState<'db' | 'mk' | null>(null)

  const normalizeSearchText = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

  const onlyDigits = (value: string) => value.replace(/\D/g, '')

  const searchLocalClients = async (rawQuery: string) => {
    const normalizedQuery = normalizeSearchText(rawQuery)
    const digitsQuery = onlyDigits(rawQuery)

    const { data, error } = await supabase
      .from('contacts')
      .select('name, mk_id, mk_data, whatsapp, mk_synced_at')
      .eq('tenant_id', profile.tenant_id)
      .not('mk_id', 'is', null)
      .order('mk_synced_at', { ascending: false, nullsFirst: false })
      .limit(1000)

    if (error || !data) return []

    return data
      .map((row: any) => {
        const mkData = typeof row.mk_data === 'object' && row.mk_data !== null
          ? row.mk_data
          : {}

        const nome = String((mkData as any).nome || row.name || '')
        const login = String((mkData as any).login || row.mk_id || '')
        const cpfCnpj = String((mkData as any).cpf_cnpj || '')
        const whatsapp = String(row.whatsapp || '')

        return {
          ...mkData,
          nome,
          login,
          cpf_cnpj: cpfCnpj,
          fone: String((mkData as any).fone || whatsapp || ''),
        }
      })
      .filter((cliente: any) => {
        const normalizedName = normalizeSearchText(String(cliente.nome || ''))
        const normalizedLogin = normalizeSearchText(String(cliente.login || ''))
        const normalizedCpf = onlyDigits(String(cliente.cpf_cnpj || ''))

        if (digitsQuery.length >= 3) {
          return normalizedCpf.includes(digitsQuery)
            || normalizedLogin.includes(normalizedQuery)
            || normalizedName.includes(normalizedQuery)
        }

        return normalizedName.includes(normalizedQuery)
          || normalizedLogin.includes(normalizedQuery)
      })
      .slice(0, 8)
  }

  const handleSearch = (value: string) => {
    setQuery(value)
    setResults([])
    setResultSource(null)
  }

  const handleBuscar = async () => {
    if (!query || query.length < 3) return
    setSearching(true)
    setResultSource(null)

    try {
      const localResults = await searchLocalClients(query)
      if (localResults.length > 0) {
        setResults(localResults)
        setResultSource('db')
        return
      }

      const isCPF = onlyDigits(query).length >= 8

      if (isCPF) {
        const cpf = onlyDigits(query)
        const data = await searchMKByCPF(profile.tenant_id, cpf)
        if (data?.cliente) {
          setResults([{ ...data.cliente, _titulos: data.titulos }])
          setResultSource('mk')
        } else {
          setResults([])
        }
      } else {
        const clientes = await getMKClienteListar(profile.tenant_id, 1, query)
        const reducedResults = clientes.slice(0, 8)
        setResults(reducedResults)
        if (reducedResults.length > 0) setResultSource('mk')
      }
    } finally {
      setSearching(false)
    }
  }

  const linkClient = async (cliente: any) => {
    setLinking(true)
    const titulos = Array.isArray(cliente._titulos)
      ? cliente._titulos
      : (cliente.cpf_cnpj ? await getMKTitulosByCPF(profile.tenant_id, cliente.cpf_cnpj) : [])

    await supabase
      .from('contacts')
      .update({
        mk_id: cliente.login,
        name: cliente.nome,
        mk_data: cliente,
        mk_synced_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    onBoletosFetched(titulos)
    onClientSelected(cliente)
    setResults([])
    setQuery('')
    setResultSource(null)
    setLinked(true)
    setTimeout(() => setLinked(false), 3000)
    setLinking(false)
  }

  // Ordena boletos: vencido → aberto → pago
  const ordemStatus: Record<string, number> = { vencido: 0, aberto: 1, pago: 2 }
  const boletosFiltrados = boletos
    .filter(b => mostrarPagos || b.status !== 'pago')
    .sort((a, b) => (ordemStatus[a.status] ?? 3) - (ordemStatus[b.status] ?? 3))

  const boletoColor: Record<string, string> = {
    pago: 'bg-green-100 text-green-700',
    vencido: 'bg-red-100 text-red-700',
    aberto: 'bg-yellow-100 text-yellow-700',
  }

  const clienteStatus = mkClient ? formatMKStatus(mkClient.tipo) : null

  // Formata data corretamente
  const formatData = (valor: string) => {
    if (!valor) return '-'
    const d = new Date(valor)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('pt-BR')
  }

  // Formata valor monetário
  const formatValor = (valor: string) => {
    if (!valor) return 'R$ 0,00'
    // Remove R$ se já vier formatado
    const limpo = String(valor).replace(/[R$\s]/g, '').replace(',', '.')
    const num = parseFloat(limpo)
    if (isNaN(num)) return valor
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL'
    }).format(num)
  }

  const handleDesvincular = async () => {
    await supabase
      .from('contacts')
      .update({
        mk_id: null,
        name: null,
        mk_data: null,
        mk_synced_at: null,
      })
      .eq('id', contact.id)

    onClientSelected(null)
    onBoletosFetched([])
  }

  // ── ABA CLIENTE ──
  if (activeTab === 'cliente') {
    return (
      <div className="space-y-3">
        {mkClient ? (
          <div className="space-y-3">
            {linked && (
              <div className="flex items-center gap-1.5 text-green-600 text-xs bg-green-50 px-3 py-2 rounded-lg">
                <CheckCircle size={13} /> Cliente vinculado!
              </div>
            )}
            <div className="text-center">
              <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xl mx-auto mb-2">
                {mkClient.nome?.charAt(0) || '?'}
              </div>
              <p className="font-semibold text-gray-900">{mkClient.nome}</p>
              <p className={`text-sm font-medium ${clienteStatus?.color}`}>
                {clienteStatus?.label}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
              {[
                ['Login', mkClient.login],
                ['CPF/CNPJ', mkClient.cpf_cnpj],
                ['Plano', mkClient.plano || mkClient.tipo],
                ['Email', mkClient.email],
                ['Telefone', mkClient.fone],
                ['Cadastro', formatData(mkClient.cadastro)],
              ].filter(([, v]) => v && v !== '-').map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-800">{value}</p>
                </div>
              ))}
            </div>
            <button
              onClick={handleDesvincular}
              className="w-full text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 py-1.5 rounded-lg transition-colors"
            >
              Desvincular cliente
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">Vincular cliente MK-Auth</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                value={query}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                placeholder="CPF ou nome..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={handleBuscar}
              disabled={searching || query.length < 3}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {searching
                ? <><Loader size={14} className="animate-spin" /> Buscando...</>
                : <><Search size={14} /> Buscar cliente</>
              }
            </button>

            {resultSource && results.length > 0 && (
              <p className="text-[11px] text-gray-400 text-center">
                {resultSource === 'db' ? 'Resultados do banco local' : 'Resultados do MK-Auth'}
              </p>
            )}

            {results.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {results.map((cliente: any) => (
                  <div
                    key={cliente.uuid || cliente.login}
                    className="flex items-center justify-between p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                    onClick={() => linkClient(cliente)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{cliente.nome}</p>
                      <p className="text-xs text-gray-400">{cliente.cpf_cnpj} · {cliente.login}</p>
                    </div>
                    {linking
                      ? <Loader size={14} className="animate-spin text-indigo-400 flex-shrink-0" />
                      : <Link size={14} className="text-indigo-400 flex-shrink-0 ml-2" />
                    }
                  </div>
                ))}
              </div>
            )}

            {query.length >= 3 && results.length === 0 && !searching && (
              <p className="text-xs text-gray-400 text-center py-3">
                Nenhum cliente encontrado
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── ABA BOLETOS ──
  return (
    <div className="space-y-3">
      {/* Checkbox mostrar pagos */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={mostrarPagos}
          onChange={e => setMostrarPagos(e.target.checked)}
          className="w-4 h-4 accent-indigo-600"
        />
        <span className="text-xs text-gray-500">Exibir boletos pagos</span>
      </label>

      {!mkClient ? (
        <p className="text-xs text-gray-400 text-center py-6">
          Vincule um cliente para ver os boletos
        </p>
      ) : boletosFiltrados.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">
          {mostrarPagos ? 'Nenhum boleto encontrado' : 'Nenhum boleto em aberto ou vencido'}
        </p>
      ) : (
        boletosFiltrados.map((boleto: any, i: number) => (
          <div key={boleto.uuid || i} className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-gray-900">
                {formatValor(boleto.valor)}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${boletoColor[boleto.status] || 'bg-gray-100 text-gray-600'}`}>
                {boleto.status}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Vence: {formatData(boleto.datavenc)}
            </p>
            {boleto.status !== 'pago' && !conversationClosed && (
              <button
                onClick={() => onEnviarBoleto && onEnviarBoleto(boleto)}
                className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-lg transition-colors"
              >
                Enviar via WhatsApp
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}