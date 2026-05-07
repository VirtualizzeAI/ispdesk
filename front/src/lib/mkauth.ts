const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mkauth-proxy`
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY

async function proxyRequest(tenantId: string, action: string, params?: object) {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ tenant_id: tenantId, action, params }),
    })
    if (!res.ok) {
      console.error('mkauth-proxy erro:', res.status, await res.text())
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('mkauth-proxy falha:', e)
    return null
  }
}

export async function getMKClienteListar(tenantId: string, pagina = 1, query?: string) {
  const data = await proxyRequest(tenantId, 'listar_clientes', { pagina, query })
  return data?.clientes || []
}

export async function getMKClientByLogin(tenantId: string, login: string) {
  return proxyRequest(tenantId, 'buscar_cliente', { login })
}

export async function getMKTitulosByCPF(tenantId: string, cpf: string) {
  const data = await proxyRequest(tenantId, 'titulos_cpf', { cpf })
  return data?.titulos || []
}

export async function getMKTitulosAbertos(tenantId: string, cpf: string) {
  const data = await proxyRequest(tenantId, 'titulos_abertos', { cpf })
  return data?.titulos || []
}

export async function desbloquearClienteMK(tenantId: string, uuid: string) {
  return proxyRequest(tenantId, 'desbloquear', { uuid })
}

export async function criarChamadoMK(tenantId: string, params: {
  login: string; assunto: string; prioridade?: string
}) {
  return proxyRequest(tenantId, 'abrir_chamado', params)
}

export function formatMKStatus(tipo: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    'pppoe': { label: 'Ativo (PPPoE)', color: 'text-green-600' },
    'hotspot': { label: 'Ativo (Hotspot)', color: 'text-green-600' },
    'cancelado': { label: 'Cancelado', color: 'text-red-600' },
    'suspenso': { label: 'Suspenso', color: 'text-red-600' },
    'bloqueado': { label: 'Bloqueado', color: 'text-orange-600' },
  }
  return map[tipo?.toLowerCase()] || { label: tipo || 'Desconhecido', color: 'text-gray-500' }
}

export function formatMKValor(valor: string): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(parseFloat(valor || '0'))
}

export function formatMKData(data: string): string {
  if (!data) return '-'
  return new Date(data).toLocaleDateString('pt-BR')
}

export async function searchMKByCPF(tenantId: string, cpf: string) {
  return proxyRequest(tenantId, 'buscar_por_cpf', { cpf })
}