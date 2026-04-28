const EVOLUTION_URL = import.meta.env.VITE_EVOLUTION_URL || ''
const EVOLUTION_KEY = import.meta.env.VITE_EVOLUTION_KEY || ''

const headers = {
  'Content-Type': 'application/json',
  'apikey': EVOLUTION_KEY,
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
  // If it's an audio file and looks like a voice recording, we should probably send it as WhatsApp Audio (PTT).
  // But standard /message/sendMedia handles all media types.
  
  const payload: any = {
    number: to,
    mediatype: mediaType,
    mimetype: mimeType,
    media: mediaBase64,
  }

  // Documents and other media usually use fileName
  if (fileName) {
    payload.fileName = fileName;
  }
  if (caption && mediaType !== 'audio') {
    payload.caption = caption;
  }

  // Se o tipo for áudio e for gravação de voz, o Evolution aceita o endpoint sendWhatsAppAudio.
  // Vamos usar um endpoint dinâmico: se for gravação de voz o ideal é outro endpoint ou usar o pt /voice.
  // Mas a documentação padrão do Evolution recomenda sendWhatsAppAudio para mensagens de áudio gravado.
  const endpoint = mediaType === 'audio' ? 'sendWhatsAppAudio' : 'sendMedia';

  const res = await fetch(`${EVOLUTION_URL}/message/${endpoint}/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  
  return res.json()
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

export async function getMediaBase64(instanceName: string, messageId: string) {
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: {
          key: {
            id: messageId
          }
        },
        convertToMp4: false
      }),
    })
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      return json.base64 || null
    } catch(e) {
      if (text && text.includes('data:')) return text;
      return null
    }
  } catch(error) {
    console.error('Error fetching base64 from Evolution:', error)
    return null
  }
}