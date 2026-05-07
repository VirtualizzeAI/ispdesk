import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Carrega variáveis do .env da raiz do projeto
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '..', '.env') })
config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY || ''
const EVOLUTION_URL = process.env.VITE_EVOLUTION_URL || ''
const EVOLUTION_KEY = process.env.VITE_EVOLUTION_KEY || ''
const PORT = process.env.WEBHOOK_PORT || 3001

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_KEY são obrigatórios no .env')
  process.exit(1)
}

// Usa o service key para ter permissão de escrita sem RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ---------- helpers ----------

function mediaMimeByType(mediaType: string): string {
  if (mediaType === 'image') return 'image/jpeg'
  if (mediaType === 'video') return 'video/mp4'
  if (mediaType === 'audio') return 'audio/ogg'
  return 'application/octet-stream'
}

function mediaTypeFromMime(mimetype: string): string {
  const lower = String(mimetype || '').toLowerCase()
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('video/')) return 'video'
  if (lower.startsWith('audio/')) return 'audio'
  return 'document'
}

function unwrapMessage(message: any): any {
  let current = message
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== 'object') break
    if (current.ephemeralMessage?.message)          { current = current.ephemeralMessage.message; continue }
    if (current.viewOnceMessage?.message)           { current = current.viewOnceMessage.message; continue }
    if (current.viewOnceMessageV2?.message)         { current = current.viewOnceMessageV2.message; continue }
    if (current.viewOnceMessageV2Extension?.message){ current = current.viewOnceMessageV2Extension.message; continue }
    if (current.documentWithCaptionMessage?.message){ current = current.documentWithCaptionMessage.message; continue }
    break
  }
  return current || message
}

function resolveIncomingMessage(payload: any): {
  msgData: any
  msgKey: any
  messageType: string
  pushName: string
} {
  const data = payload?.data || {}

  // Formato comum: data.message + data.key
  if (data?.message && data?.key) {
    return {
      msgData: data.message,
      msgKey: data.key,
      messageType: data.messageType || '',
      pushName: data.pushName || '',
    }
  }

  // Formato alternativo: data.messages[0]
  const first = Array.isArray(data?.messages) ? data.messages[0] : null
  if (first?.message && first?.key) {
    return {
      msgData: first.message,
      msgKey: first.key,
      messageType: first.messageType || data.messageType || '',
      pushName: first.pushName || data.pushName || '',
    }
  }

  return {
    msgData: null,
    msgKey: null,
    messageType: data?.messageType || '',
    pushName: data?.pushName || '',
  }
}

// ---------- app ----------

const app = express()
app.use(express.json({ limit: '50mb' }))

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

app.post('/webhook/evolution', async (req, res) => {
  const payload = req.body
  const evento = payload?.event || ''
  const incoming = resolveIncomingMessage(payload)
  const fromMe = incoming?.msgKey?.fromMe
  console.log(`[webhook] ← evento="${evento}" instance="${payload?.instance}" messageType="${incoming?.messageType || payload?.data?.messageType}" fromMe=${fromMe}`)

  // Responde imediatamente para não deixar a Evolution esperando
  res.status(200).json({ ok: true })

  try {
    // Aceita eventos em qualquer formato (messages.upsert / MESSAGES_UPSERT)
    const eventNorm = evento.toLowerCase().replace(/[._\s-]/g, '')
    if (eventNorm !== 'messagesupsert') {
      console.log(`[webhook] ignorado — evento não é messages.upsert (recebido: "${evento}")`)
      return
    }

    const instanceName: string = payload.instance
    const msgData = incoming.msgData
    const msgKey  = incoming.msgKey
    const messageType: string = incoming.messageType || ''

    if (!msgData || !msgKey) {
      console.warn('[webhook] ignorado — msgData ou msgKey ausente (formato de payload não reconhecido)')
      return
    }
    if (msgKey.fromMe) {
      console.log('[webhook] ignorado — mensagem enviada por mim (fromMe=true)')
      return
    }

    // ---------- tenant (via evolution_configs) ----------
    const { data: evoConfig } = await supabase
      .from('evolution_configs')
      .select('tenant_id')
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (!evoConfig?.tenant_id) {
      console.warn('[webhook] instância não vinculada a nenhum tenant:', instanceName)
      return
    }

    // Confirma que o tenant existe
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', evoConfig.tenant_id)
      .single()

    if (!tenant) {
      console.warn('[webhook] tenant não encontrado:', evoConfig.tenant_id)
      return
    }
    const evolutionApiKey = EVOLUTION_KEY

    // ---------- contato ----------
    const phone    = msgKey.remoteJid.replace('@s.whatsapp.net', '')
    const pushName = incoming.pushName || phone

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        { tenant_id: tenant.id, whatsapp: phone, name: pushName },
        { onConflict: 'tenant_id,whatsapp' }
      )
      .select('id')
      .single()

    if (contactError || !contact) {
      console.error('[webhook] erro ao resolver contato:', contactError?.message)
      return
    }

    // ---------- conversa ----------
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, status, created_at')
      .eq('tenant_id', tenant.id)
      .eq('contact_id', contact.id)
      .in('status', ['open', 'waiting'])
      .order('created_at', { ascending: true })

    let activeConversations = convData || []

    if (activeConversations.length === 0) {
      const { error: insConvErr } = await supabase.from('conversations').insert({
        tenant_id: tenant.id,
        contact_id: contact.id,
        status: 'waiting',
        assigned_to: null,
      })
      if (insConvErr) {
        console.error('[webhook] erro ao criar conversa:', insConvErr.message)
        return
      }
      const { data: refetched } = await supabase
        .from('conversations')
        .select('id, status, created_at')
        .eq('tenant_id', tenant.id)
        .eq('contact_id', contact.id)
        .in('status', ['open', 'waiting'])
        .order('created_at', { ascending: true })
      activeConversations = refetched || []
    }

    const conversation = activeConversations[0]
    if (!conversation) {
      console.warn('[webhook] sem conversa disponível')
      return
    }

    // Fecha conversas duplicadas
    if (activeConversations.length > 1) {
      const ids = activeConversations.slice(1).map((c: any) => c.id)
      await supabase
        .from('conversations')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .in('id', ids)
    }

    // ---------- deduplicação ----------
    const { count: existingCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('whatsapp_id', msgKey.id)
      .eq('tenant_id', tenant.id)

    if (existingCount && existingCount > 0) return

    // ---------- tipo / conteúdo ----------
    const normalizedMessage = unwrapMessage(msgData)

    let content     = ''
    let mediaType   = 'text'
    let mediaBase64: string | null = null
    let mediaMime:   string | null = null

    if (messageType === 'imageMessage' || normalizedMessage.imageMessage) {
      const m = normalizedMessage.imageMessage || {}
      mediaType = 'image'
      content   = m.caption || ''
      mediaMime = m.mimetype || 'image/jpeg'
    } else if (messageType === 'videoMessage' || normalizedMessage.videoMessage) {
      const m = normalizedMessage.videoMessage || {}
      mediaType = 'video'
      content   = m.caption || ''
      mediaMime = m.mimetype || 'video/mp4'
    } else if (messageType === 'audioMessage' || messageType === 'pttMessage' || normalizedMessage.audioMessage || normalizedMessage.pttMessage) {
      const m = normalizedMessage.audioMessage || normalizedMessage.pttMessage || {}
      mediaType = 'audio'
      mediaMime = m.mimetype || 'audio/ogg'
    } else if (messageType === 'documentMessage' || messageType === 'documentWithCaptionMessage' || normalizedMessage.documentMessage) {
      const m = normalizedMessage.documentMessage || {}
      mediaMime = m.mimetype || 'application/octet-stream'
      mediaType = mediaTypeFromMime(mediaMime || 'application/octet-stream')
      content   = m.caption || m.fileName || ''
    } else if (normalizedMessage.conversation || normalizedMessage.extendedTextMessage?.text) {
      content = normalizedMessage.conversation || normalizedMessage.extendedTextMessage?.text || ''
    }

    // ---------- base64 da mídia ----------
    if (mediaType !== 'text') {
      try {
        const apiKey = evolutionApiKey
        const b64Res = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({
            message: { key: { id: msgKey.id } },
            convertToMp4: mediaType === 'video',
          }),
        })

        if (b64Res.ok) {
          const b64Data = await b64Res.json()
          const payloadMedia = b64Data?.data?.message || b64Data?.data || b64Data?.message || b64Data
          const raw = payloadMedia?.base64 || b64Data?.base64 || null
          if (raw) {
            const mime = payloadMedia?.mimetype || payloadMedia?.mimeType || b64Data?.mimetype || mediaMime || mediaMimeByType(mediaType)
            mediaMime   = mime
            mediaBase64 = `data:${mime};base64,${raw}`
            if (!content && payloadMedia?.caption) content = payloadMedia.caption
            if (!content && payloadMedia?.fileName) content = payloadMedia.fileName
          }
        } else {
          console.error('[webhook] Falha getBase64:', b64Res.status, await b64Res.text())
        }
      } catch (err) {
        console.error('[webhook] Erro ao buscar base64:', err)
      }
    }

    if (!content && mediaType === 'text') content = '[Mensagem não suportada]'

    // ---------- inserir mensagem ----------
    const { error: insertError } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      tenant_id:       tenant.id,
      from_me:         false,
      content,
      type:            mediaType,
      base64:          mediaBase64,
      whatsapp_id:     msgKey.id,
    })

    if (insertError) {
      console.error('[webhook] Erro ao inserir mensagem:', insertError)
      return
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversation.id)

    console.log(`[webhook] ✅ ${mediaType} de ${phone} salvo (conv ${conversation.id})`)
  } catch (err) {
    console.error('[webhook] Erro não tratado:', err)
  }
})

app.listen(PORT, () => {
  console.log(`🚀 Webhook server rodando em http://localhost:${PORT}`)
  console.log(`   Endpoint: POST http://localhost:${PORT}/webhook/evolution`)
})
