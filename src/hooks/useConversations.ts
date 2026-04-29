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
        .select(`*, contact:contacts(*), messages(id, conversation_id, tenant_id, from_me, content, type, media_url, whatsapp_id, created_at)`)
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false, foreignTable: 'messages' })
        .limit(1, { foreignTable: 'messages' })

      const conversationsWithLastMessage = ((data as any) ?? []).map((conv: any) => {
        const msgs: Message[] = conv.messages ?? []
        const { messages: _msgs, ...rest } = conv
        return { ...rest, last_message: msgs[0] ?? undefined }
      }) as Conversation[]

      if (!cancelled) {
        setConversations(conversationsWithLastMessage)
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
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
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
  const [loadingMessages, setLoadingMessages] = useState(false)

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    // Limpa imediatamente ao trocar de conversa para não mostrar mensagens antigas
    setMessages([])
    setLoadingMessages(true)
    let cancelled = false

    async function fetchMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (!cancelled) {
        setMessages(data ?? [])
        setLoadingMessages(false)
      }
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
        setMessages(prev => {
          // Evita duplicar se o realtime chegou antes do fetch terminar
          if (prev.some(m => m.id === (payload.new as Message).id)) return prev
          return [...prev, payload.new as Message]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === (payload.new as Message).id ? payload.new as Message : m))
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  return { messages, loadingMessages }
}