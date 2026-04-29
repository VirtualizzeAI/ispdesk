import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const EVOLUTION_URL = Deno.env.get('VITE_EVOLUTION_URL') || Deno.env.get('EVOLUTION_API_URL') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function mediaMimeByType(mediaType: string) {
  if (mediaType === 'image') return 'image/jpeg'
  if (mediaType === 'video') return 'video/mp4'
  if (mediaType === 'audio') return 'audio/ogg'
  return 'application/octet-stream'
}

function normalizeToDataUri(base64Value: string, mediaType: string, mimeType?: string | null) {
  const trimmed = String(base64Value || '').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed
  return `data:${mimeType || mediaMimeByType(mediaType)};base64,${trimmed}`
}

function unwrapMessage(message: any): any {
  let current = message
  for (let i = 0; i < 5; i += 1) {
    if (!current || typeof current !== 'object') break

    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message
      continue
    }
    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message
      continue
    }
    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message
      continue
    }
    if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message
      continue
    }
    if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message
      continue
    }
    break
  }

  return current || message
}

function mediaTypeFromMime(mimetype: string) {
  const lower = String(mimetype || '').toLowerCase()
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('video/')) return 'video'
  if (lower.startsWith('audio/')) return 'audio'
  return 'document'
}

serve(async (req) => {
  try {
    const payload = await req.json()
    
    if (payload.event !== 'messages.upsert') {
      return new Response('Ignorado', { status: 200 })
    }

    const instanceName = payload.instance
    const msgData = payload.data?.message
    const msgKey = payload.data?.key
    // messageType é o indicador mais confiável do tipo da mensagem
    const messageType = (payload.data?.messageType as string) || ''
    
    if (!msgData || !msgKey || msgKey.fromMe) {
      return new Response('Ignorado - Mensagem inválida ou enviada por mim', { status: 200 })
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, evolution_api_key')
      .eq('evolution_instance', instanceName)
      .single()

    if (!tenant) {
      console.log('Tenant não encontrado para a instância', instanceName)
      return new Response('Tenant não encontrado', { status: 200 })
    }

    const phone = msgKey.remoteJid.replace('@s.whatsapp.net', '')

    // Upsert garante idempotencia de contato em mensagens simultaneas.
    const pushName = payload.data?.pushName || phone
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .upsert({
        tenant_id: tenant.id,
        whatsapp: phone,
        name: pushName,
      }, { onConflict: 'tenant_id,whatsapp' })
      .select('id')
      .single()

    if (contactError || !contact) throw contactError || new Error('Falha ao resolver contato')

    // Busca todas as conversas ativas para consolidar em apenas uma conversa canonica.
    let { data: activeConversations, error: activeConvError } = await supabase
      .from('conversations')
      .select('id, status, created_at')
      .eq('tenant_id', tenant.id)
      .eq('contact_id', contact.id)
      .in('status', ['open', 'waiting'])
      .order('created_at', { ascending: true })

    if (activeConvError) throw activeConvError

    if (!activeConversations || activeConversations.length === 0) {
      const { error: convInsertError } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenant.id,
          contact_id: contact.id,
          status: 'waiting',
          assigned_to: null,
          title: 'Novo Chat',
        })

      if (convInsertError) throw convInsertError

      const { data: refetchedConversations, error: refetchError } = await supabase
        .from('conversations')
        .select('id, status, created_at')
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contact.id)
        .in('status', ['open', 'waiting'])
        .order('created_at', { ascending: true })

      if (refetchError) throw refetchError
      activeConversations = refetchedConversations || []
    }

    const conversation = activeConversations[0]
    if (!conversation) throw new Error('Falha ao resolver conversa')

    if (activeConversations.length > 1) {
      const duplicatedConversationIds = activeConversations.slice(1).map((item) => item.id)
      await supabase
        .from('conversations')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .in('id', duplicatedConversationIds)
    }

    const normalizedMessage = unwrapMessage(msgData)

    // Deduplicação: ignora se whatsapp_id já existe (webhook pode disparar múltiplas vezes para o mesmo evento)
    const { count: existingCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('whatsapp_id', msgKey.id)
      .eq('tenant_id', tenant.id)
    
    if (existingCount && existingCount > 0) {
      return new Response('Duplicado ignorado', { status: 200 })
    }

    // Processar Conteúdo da Mensagem e Mídia
    // Usa messageType do payload como indicador primário (mais confiável que checar chaves internas)
    let content = ''
    let mediaType = 'text'
    let mediaBase64: string | null = null
    let mediaMimeType: string | null = null

    if (messageType === 'imageMessage' || normalizedMessage.imageMessage) {
      mediaType = 'image'
      const imgMsg = normalizedMessage.imageMessage || {}
      content = imgMsg.caption || ''
      mediaMimeType = imgMsg.mimetype || 'image/jpeg'
    } else if (messageType === 'videoMessage' || normalizedMessage.videoMessage) {
      mediaType = 'video'
      const vidMsg = normalizedMessage.videoMessage || {}
      content = vidMsg.caption || ''
      mediaMimeType = vidMsg.mimetype || 'video/mp4'
    } else if (messageType === 'audioMessage' || messageType === 'pttMessage' || normalizedMessage.audioMessage || normalizedMessage.pttMessage) {
      mediaType = 'audio'
      const audMsg = normalizedMessage.audioMessage || normalizedMessage.pttMessage || {}
      mediaMimeType = audMsg.mimetype || 'audio/ogg'
    } else if (messageType === 'documentMessage' || messageType === 'documentWithCaptionMessage' || normalizedMessage.documentMessage) {
      const docMsg = normalizedMessage.documentMessage || {}
      mediaMimeType = docMsg.mimetype || 'application/octet-stream'
      mediaType = mediaTypeFromMime(mediaMimeType)
      content = docMsg.caption || docMsg.fileName || ''
    } else if (normalizedMessage.conversation || normalizedMessage.extendedTextMessage?.text) {
      content = normalizedMessage.conversation || normalizedMessage.extendedTextMessage?.text || ''
    }

    // Se for mídia, tenta puxar o Base64 da Evolution API
    if (mediaType !== 'text') {
      try {
        const evolutionApiKey = tenant.evolution_api_key || Deno.env.get('VITE_EVOLUTION_KEY') || ''
        const b64Res = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            message: { key: { id: msgKey.id } },
            convertToMp4: mediaType === 'video'
          })
        })
        
        if (b64Res.ok) {
          const b64Data = await b64Res.json()
          const rawBase64 = b64Data?.base64 || null
          if (rawBase64) {
            // Usa o mimetype real da resposta, não o inferido
            const responseMime = b64Data?.mimetype || mediaMimeType || mediaMimeByType(mediaType)
            mediaMimeType = responseMime
            // Salva a Data URI completa na coluna base64
            mediaBase64 = `data:${responseMime};base64,${rawBase64}`
            // Pega caption da resposta se não veio no webhook
            if (!content && b64Data?.caption) {
              content = b64Data.caption
            }
          }
        } else {
          console.error('Falha getBase64FromMediaMessage:', b64Res.status, await b64Res.text())
        }
      } catch (err) {
        console.error('Falha ao baixar base64:', err)
      }
    }

    if (!content && mediaType === 'text') {
      content = '[Mensagem não suportada]'
    }

    // Inserir a nova mensagem
    const { error: msgInsertError } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      tenant_id: tenant.id,
      from_me: false,
      content: content,
      type: mediaType,
      base64: mediaBase64,      // Data URI completa: data:mime/type;base64,... (sem media_url)
      whatsapp_id: msgKey.id
    })
    
    if (msgInsertError) {
      console.error('Erro ao inserir mensagem:', msgInsertError)
    }

    // Atualiza o updated_at da conversa depois da mensagem persistida.
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('WebHook Error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})
