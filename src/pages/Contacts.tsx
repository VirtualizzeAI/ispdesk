import { useMemo, useState } from 'react'
import { Search, Wifi, WifiOff, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'
import { useContactsSync } from '../hooks/useContactsSync'
import { useContactsPaginated } from '../hooks/useContactsPaginated'

type StatusIcon = typeof Wifi | typeof WifiOff | typeof AlertCircle

const statusMap: Record<string, { label: string; color: string; icon: StatusIcon }> = {
  A: { label: 'Ativo', color: 'bg-green-100 text-green-700', icon: Wifi },
  S: { label: 'Inativo', color: 'bg-red-100 text-red-700', icon: WifiOff },
  I: { label: 'Inadimplente', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
}

function getStatusFromData(data: Record<string, unknown> | null): string {
  if (!data) return 'S'

  const ativado = String(data.cli_ativado || '').trim().toLowerCase()
  const bloqueado = String(data.bloqueado || '').trim().toLowerCase()

  // Regra de negócio MK:
  // - Inadimplente: ativado = s e bloqueado = sim
  // - Ativo: ativado = s e bloqueado != sim
  // - Inativo: ativado = n
  if (ativado === 's' && bloqueado === 'sim') return 'I'
  if (ativado === 's') return 'A'
  if (ativado === 'n') return 'S'

  return 'A'
}

export default function Contacts() {
  const { profile } = useProfile()
  const { syncing, syncProgress, syncError, syncContacts } = useContactsSync()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'A' | 'S' | 'I'>('ALL')
  const [planFilter, setPlanFilter] = useState('ALL')
  const pagination = useContactsPaginated(profile?.tenant_id || null, search, statusFilter, planFilter)
  const [syncStarted, setSyncStarted] = useState(false)
  const [lastSyncTotal, setLastSyncTotal] = useState(0)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const handleSync = async () => {
    if (!profile?.tenant_id) return
    setSyncStarted(true)
    const total = await syncContacts(profile.tenant_id)
    setLastSyncTotal(total)
    setSyncStarted(false)
    await pagination.refetch()
  }

  const filtered = useMemo(() => pagination.contacts, [pagination.contacts])

  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null
    return filtered.find(c => c.id === selectedContactId) || null
  }, [filtered, selectedContactId])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Clientes</h2>
          <p className="text-gray-500 text-sm">
            {pagination.totalCount > 0 ? `${pagination.totalCount} cliente(s) no banco` : 'Gerenciar clientes cadastrados'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || !profile?.tenant_id}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? `Sincronizando... (${syncProgress})` : 'Sincronizar com MK Auth'}
        </button>
      </div>

      {syncError && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
          {syncError}
        </div>
      )}

      {syncStarted && !syncing && lastSyncTotal > 0 && (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
          Sincronizacao concluida: {lastSyncTotal} cliente(s) salvos
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-wrap items-end gap-3">
            <div className="max-w-sm w-full">
              <label className="block text-xs font-medium text-gray-500 mb-1">Busca</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome, numero ou login..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'ALL' | 'A' | 'S' | 'I')}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-700"
              >
                <option value="ALL">Todos os status</option>
                <option value="A">Ativo</option>
                <option value="S">Inativo</option>
                <option value="I">Inadimplente</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Plano</label>
              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-700"
              >
                <option value="ALL">Todos os planos</option>
                {pagination.planOptions.map(plan => (
                  <option key={plan} value={plan}>{plan}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {pagination.isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            <p className="text-gray-500 text-sm mt-3">Carregando contatos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {pagination.totalCount === 0
              ? 'Nenhum cliente sincronizado. Clique em "Sincronizar com MK Auth"'
              : 'Nenhum cliente encontrado com esses criterios'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Cliente</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">WhatsApp</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Plano</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Login</th>
                    <th className="text-center text-xs font-medium text-gray-400 px-5 py-3">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(contact => {
                    const mkData = typeof contact.mk_data === 'object' && contact.mk_data !== null ? (contact.mk_data as unknown as Record<string, unknown>) : null
                    const statusCode: string = getStatusFromData(mkData)
                    const statusInfo = statusMap[statusCode] || statusMap['A']
                    const Icon = statusInfo.icon

                    const uniqueKey = contact.id

                    return (
                      <tr key={uniqueKey} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm">
                              {(contact.name || '?').charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-gray-900">{contact.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{contact.whatsapp}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">
                          {mkData ? String(mkData.plano || mkData.tipo || '-') : '-'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>
                            <Icon size={11} /> {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">
                          {contact.mk_id || '-'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedContactId(contact.id)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginacao */}
            {pagination.totalPages > 1 && (
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Pagina {pagination.currentPage} de {pagination.totalPages}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={pagination.prevPage}
                    disabled={pagination.currentPage <= 1 || pagination.isLoading}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft size={18} className="text-gray-600" />
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                      .filter(p => Math.abs(p - pagination.currentPage) <= 2 || p === 1 || p === pagination.totalPages)
                      .map((page, idx, arr) => (
                        <div key={`p${page}`}>
                          {idx > 0 && arr[idx - 1] !== page - 1 && <span className="px-2 text-gray-400">...</span>}
                          <button
                            onClick={() => pagination.goToPage(page)}
                            disabled={pagination.isLoading}
                            className={`px-2 py-1 rounded text-sm transition-colors ${
                              pagination.currentPage === page
                                ? 'bg-indigo-600 text-white'
                                : 'hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        </div>
                      ))}
                  </div>

                  <button
                    onClick={pagination.nextPage}
                    disabled={pagination.currentPage >= pagination.totalPages || pagination.isLoading}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight size={18} className="text-gray-600" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Detalhes do cliente</h3>
              <button
                type="button"
                onClick={() => setSelectedContactId(null)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Nome</p>
                  <p className="text-sm font-medium text-gray-900">{selectedContact.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">WhatsApp</p>
                  <p className="text-sm font-medium text-gray-900">{selectedContact.whatsapp || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Login</p>
                  <p className="text-sm font-medium text-gray-900">{selectedContact.mk_id || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Sincronizado em</p>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedContact.mk_synced_at
                      ? new Date(selectedContact.mk_synced_at).toLocaleString('pt-BR')
                      : '-'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">Dados completos (MK Auth)</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 overflow-auto max-h-72">
                  {JSON.stringify(selectedContact.mk_data || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
