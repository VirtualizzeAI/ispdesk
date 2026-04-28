import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Conversation, Message } from '../types'

export function useConversations(tenantId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    // Aguarda tenant_id estar disponível
    if (!tenantId) return

    let cancelled = false
    initialLoadDone.current = false

    async function fetchConversations() {
      // Só mostra loading na primeira carga — refreshes do realtime são silenciosos
      if (!initialLoadDone.current) setLoading(true)

      const { data } = await supabase
        .from('conversations')
        .select(`*, contact:contacts(*)`)
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })

      if (!cancelled) {
        setConversations((data as any) ?? [])
        if (!initialLoadDone.current) {
          setLoading(false)
          initialLoadDone.current = true
        }
      }
    }

    fetchConversations()

    // Realtime
    const channel = supabase
      .channel(`conversations:${tenantId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => fetchConversations())
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [tenantId]) // só roda quando tenantId mudar

  return { conversations, loading }
}

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    if (!conversationId) return

    let cancelled = false

    async function fetchMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (!cancelled) setMessages(data ?? [])
    }

    fetchMessages()

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  return { messages }
}