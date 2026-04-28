import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const EVOLUTION_URL = Deno.env.get('VITE_EVOLUTION_URL') || Deno.env.get('EVOLUTION_API_URL') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  try {
    const payload = await req.json()
    
    if (payload.event !== 'messages.upsert') {
      return new Response('Ignorado', { status: 200 })
    }

    const instanceName = payload.instance
    const msgData = payload.data?.message
    const msgKey = payload.data?.key
    
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

    // Buscar ou criar contato
    let { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('whatsapp', phone)
      .single()

    if (!contact) {
      const pushName = payload.data?.pushName || phone
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenant.id,
          whatsapp: phone,
          name: pushName,
        })
        .select()
        .single()
      
      if (contactError) throw contactError
      contact = newContact
    }

    // Buscar ou criar conversa
    let { data: conversation } = await supabase
      .from('conversations')
      .select('id, status')
      .eq('tenant_id', tenant.id)
      .eq('contact_id', contact.id)
      .in('status', ['open', 'waiting'])
      .maybeSingle()

    if (!conversation) {
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenant.id,
          contact_id: contact.id,
          status: 'waiting',
          assigned_to: null,
          title: 'Novo Chat',
        })
        .select()
        .single()
      
      if (convError) throw convError
      conversation = newConversation
    }

    // Se a conversa estava closed ou waiting, atualiza o status ou updated_at
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation.id)

    // Processar Conteúdo da Mensagem e Mídia
    let content = ''
    let mediaType = 'text'
    let mediaUrl = null

    if (msgData.conversation || msgData.extendedTextMessage?.text) {
      content = msgData.conversation || msgData.extendedTextMessage?.text
    } else if (msgData.imageMessage) {
      mediaType = 'image'
      content = msgData.imageMessage.caption || ''
    } else if (msgData.videoMessage) {
      mediaType = 'video'
      content = msgData.videoMessage.caption || ''
    } else if (msgData.audioMessage) {
      mediaType = 'audio'
    } else if (msgData.documentMessage) {
      mediaType = 'document'
      content = msgData.documentMessage.fileName || 'documento'
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
            message: { key: msgKey },
            convertToMp4: false
          })
        })
        
        if (b64Res.ok) {
          const b64Data = await b64Res.json()
          let base64str = b64Data.base64
          if (!base64str && typeof b64Data === 'string' && b64Data.startsWith('data:')) {
            base64str = b64Data
          }
          if (base64str) {
            mediaUrl = base64str
          }
        }
      } catch (err) {
        console.error('Falha ao baixar base64:', err)
      }
    }

    if (!content && !mediaUrl) {
      content = '[Mensagem não suportada]'
    }

    // Inserir a nova mensagem
    const { error: msgInsertError } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      tenant_id: tenant.id,
      from_me: false,
      content: content,
      type: mediaType,
      media_url: mediaUrl,
      whatsapp_id: msgKey.id
    })
    
    if (msgInsertError) {
      console.error('Erro ao inserir mensagem:', msgInsertError)
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('WebHook Error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})
