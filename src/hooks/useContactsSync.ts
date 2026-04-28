import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { getMKClienteListar } from '../lib/mkauth'
import type { Contact } from '../types'

const BATCH_SIZE = 100
const MAX_PAGES = 50

type MKClientLike = {
  nome?: string
  razao_social?: string
  login?: string
  uuid?: string
  fone?: string
  celular?: string
  whatsapp?: string
  [key: string]: unknown
}

export function useContactsSync() {
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncError, setSyncError] = useState('')

  const syncContacts = async (tenantId: string): Promise<number> => {
    setSyncing(true)
    setSyncProgress(0)
    setSyncError('')

    let totalSynced = 0
    const dedupedByKey = new Map<string, Partial<Contact>>()
    let lastPageSignature = ''

    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const pageClients = await getMKClienteListar(tenantId, page)

        if (!Array.isArray(pageClients) || pageClients.length === 0) {
          break
        }

        const pageSignature = JSON.stringify(
          pageClients.map((client: MKClientLike) => client.uuid || client.login || client.fone || client.celular || '')
        )

        // Alguns retornos do MK ignoram a pagina e repetem sempre o mesmo lote.
        if (pageSignature === lastPageSignature) {
          break
        }
        lastPageSignature = pageSignature

        for (const client of pageClients as MKClientLike[]) {
          const phone = String(client.fone || client.celular || client.whatsapp || '').replace(/\D/g, '')
          const login = String(client.login || client.uuid || '').trim()

          // Sem telefone valido e sem login, nao ha como manter chave estável.
          if (!phone && !login) continue

          const dedupeKey = phone || `mk:${login}`
          dedupedByKey.set(dedupeKey, {
            tenant_id: tenantId,
            whatsapp: phone || `mk-${login}`,
            name: String(client.nome || client.razao_social || login || ''),
            mk_id: login,
            mk_data: client as unknown as Contact['mk_data'],
            mk_synced_at: new Date().toISOString(),
          })
        }

        // Parar se a página retorna poucos registros (indica última página)
        if (pageClients.length < 50) {
          break
        }
      }

      const contactsToUpsert = Array.from(dedupedByKey.values())

      for (let i = 0; i < contactsToUpsert.length; i += BATCH_SIZE) {
        const batch = contactsToUpsert.slice(i, i + BATCH_SIZE)

        const { error: upsertError } = await supabase
          .from('contacts')
          .upsert(batch, { onConflict: 'tenant_id,whatsapp' })

        if (upsertError) {
          setSyncError(`Erro ao salvar batch: ${upsertError.message}`)
          setSyncing(false)
          return totalSynced
        }

        totalSynced += batch.length
        setSyncProgress(totalSynced)
      }

      setSyncing(false)
      return totalSynced
    } catch (error) {
      setSyncError(`Erro ao sincronizar: ${String(error)}`)
      setSyncing(false)
      return totalSynced
    }
  }

  return { syncing, syncProgress, syncError, syncContacts }
}
