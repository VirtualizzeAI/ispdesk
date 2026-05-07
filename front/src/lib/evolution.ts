const EVOLUTION_URL = import.meta.env.VITE_EVOLUTION_URL || ''
const EVOLUTION_KEY = import.meta.env.VITE_EVOLUTION_KEY || ''

const headers = {
  'Content-Type': 'application/json',
  'apikey': EVOLUTION_KEY,
}

function mediaMimeByType(mediaType: 'image' | 'audio' | 'video' | 'document') {
  if (mediaType === 'image') return 'image/jpeg'
  if (mediaType === 'video') return 'video/mp4'
  if (mediaType === 'audio') return 'audio/ogg'
  return 'application/octet-stream'
}

export async function createInstance(instanceName: string) {
  const res = await fetch(`${EVOLUTION_URL}/instance/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })
  return res.json()
}

export async function getQRCode(instanceName: string) {
  const res = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
    headers,
  })
  return res.json()
}

export async function getInstanceStatus(instanceName: string) {
  const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
    headers,
  })
  return res.json()
}

export async function deleteInstance(instanceName: string) {
  const res = await fetch(`${EVOLUTION_URL}/instance/delete/${instanceName}`, {
    method: 'DELETE',
    headers,
  })
  return res.json()
}

export async function sendTextMessage(instanceName: string, to: string, text: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number: to,
      text,
    }),
  })
  return res.json()
}

export async function sendMediaMessage(
  instanceName: string,
  to: string,
  mediaBase64: string,
  mediaType: 'image' | 'audio' | 'video' | 'document',
  mimeType: string,
  fileName: string,
  caption?: string
) {
  const payload: any = {
    number: to,
    mediatype: mediaType,
    mimetype: mimeType,
    media: mediaBase64,
  }

  if (fileName) payload.fileName = fileName
  if (caption && mediaType !== 'audio') payload.caption = caption

  const parseKeyId = (data: any) => data?.key?.id || data?.data?.key?.id || data?.message?.key?.id || null

  const postEvolution = async (endpoint: string, body: any) => {
    const res = await fetch(`${EVOLUTION_URL}/message/${endpoint}/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    const keyId = parseKeyId(json)
    const status = String(json?.status || json?.data?.status || '').toUpperCase()
    return { ok: res.ok, keyId, status, json, endpoint }
  }

  if (mediaType === 'audio') {
    const audioPayload = {
      number: to,
      audio: mediaBase64,
      ptt: true,
      delay: 1200,
    }

    const audioResult = await postEvolution('sendWhatsAppAudio', audioPayload)
    console.log('[Evolution] Resposta sendWhatsAppAudio:', audioResult.json)
    if (audioResult.ok && (audioResult.keyId || audioResult.status === 'PENDING')) {
      return audioResult.json
    }
  }

  const mediaResult = await postEvolution('sendMedia', payload)
  console.log('[Evolution] Resposta sendMedia:', mediaResult.json)
  if (!mediaResult.ok) {
    console.error(`[Evolution] Erro ao enviar ${mediaType}:`, mediaResult.json)
  }
  return mediaResult.json
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  const res = await fetch(`${EVOLUTION_URL}/webhook/set/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
        ],
      }
    }),
  })
  const data = await res.json()
  console.log('Webhook set response:', JSON.stringify(data))
  return data
}

export async function getMediaBase64(
  instanceName: string,
  messageId: string,
  mediaType: 'image' | 'audio' | 'video' | 'document' = 'document'
) {
  try {
    const requestBody = {
      message: {
        key: {
          id: messageId,
        }
      },
      convertToMp4: mediaType === 'video'
    }

    const res = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!res.ok) return null

    const json = await res.json()
    const payload = json?.data?.message || json?.data || json?.message || json
    const rawBase64 = payload?.base64 || json?.base64 || null
    if (!rawBase64) return null
    // Usa o mimetype real da resposta (não inferência por assinatura)
    const mime = payload?.mimetype || payload?.mimeType || json?.mimetype || mediaMimeByType(mediaType)
    return `data:${mime};base64,${rawBase64}`
  } catch(error) {
    console.error('Error fetching base64 from Evolution:', error)
    return null
  }
}
