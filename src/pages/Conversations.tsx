import { useState, useEffect, useRef } from 'react'
import { Search, Send, MoreVertical, User, FileText, Loader, CheckCircle, RefreshCw, Paperclip, X, Image as ImageIcon, File as FileIcon, Mic, PanelRightClose, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useConversations, useMessages } from '../hooks/useConversations'
import { useProfile } from '../hooks/useProfile'
import { getMKClientByLogin, getMKTitulosByCPF } from '../lib/mkauth'
import { sendTextMessage, sendMediaMessage, getMediaBase64 } from '../lib/evolution'
import type { Message } from '../types'

import MKSearchPanel from '../components/MKSearchPanel'

const statusColor: Record<string, string> = {
  open: 'bg-indigo-100 text-indigo-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-green-100 text-green-700',
}
const statusLabel: Record<string, string> = {
  open: 'Aberto', waiting: 'Aguardando', closed: 'Fechado',
}

type MessageListItem =
  | { type: 'separator'; key: string; label: string }
  | { type: 'message'; key: string; message: Message }

type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'older'

function getStartOfDay(date: Date) {
  const normalizedDate = new Date(date)
  normalizedDate.setHours(0, 0, 0, 0)
  return normalizedDate
}

function isSameCalendarDay(firstDate: string, secondDate: string) {
  const first = new Date(firstDate)
  const second = new Date(secondDate)

  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate()
}

function formatDaySeparatorLabel(dateString: string) {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (isSameCalendarDay(dateString, today.toISOString())) return 'Hoje'
  if (isSameCalendarDay(dateString, yesterday.toISOString())) return 'Ontem'

  const includeYear = date.getFullYear() !== today.getFullYear()

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  })
}

function buildMessageListItems(messages: Message[]): MessageListItem[] {
  const items: MessageListItem[] = []

  messages.forEach((message, index) => {
    const previousMessage = messages[index - 1]

    if (!previousMessage || !isSameCalendarDay(previousMessage.created_at, message.created_at)) {
      items.push({
        type: 'separator',
        key: `separator-${message.created_at}`,
        label: formatDaySeparatorLabel(message.created_at),
      })
    }

    items.push({
      type: 'message',
      key: message.id,
      message,
    })
  })

  return items
}

function matchesDateFilter(dateString: string, filter: DateFilter) {
  if (filter === 'all') return true

  const targetDate = getStartOfDay(new Date(dateString))
  const today = getStartOfDay(new Date())
  const differenceInDays = Math.floor((today.getTime() - targetDate.getTime()) / 86400000)

  if (filter === 'today') return differenceInDays === 0
  if (filter === 'yesterday') return differenceInDays === 1
  if (filter === 'week') return differenceInDays >= 2 && differenceInDays <= 7

  return differenceInDays > 7
}

function getConversationPreview(conv: any) {
  const lastMessage = conv.last_message
  if (!lastMessage) return 'Sem mensagens ainda'

  let content = (lastMessage.content || '').trim()

  if (!content) {
    if (lastMessage.type === 'image') content = '[Imagem]'
    else if (lastMessage.type === 'video') content = '[Video]'
    else if (lastMessage.type === 'audio') content = '[Audio]'
    else if (lastMessage.type === 'document') content = '[Documento]'
    else content = '[Mensagem]'
  }

  return lastMessage.from_me ? `Voce: ${content}` : content
}

function isMediaPlaceholder(content?: string) {
  const normalized = String(content || '').trim().toLowerCase()
  return normalized === '[midia]' || normalized === '[mídia]'
}



const MessageMedia = ({ msg, instanceName }: { msg: any, instanceName: string }) => {
  const inferMimeFromBase64 = (value: string) => {
    const raw = String(value || '').trim()
    if (!raw || raw.startsWith('data:')) return null
    if (raw.startsWith('/9j/')) return 'image/jpeg'
    if (raw.startsWith('iVBORw0KGgo')) return 'image/png'
    if (raw.startsWith('R0lGOD')) return 'image/gif'
    if (raw.startsWith('UklGR')) return 'image/webp'
    if (raw.startsWith('JVBERi0')) return 'application/pdf'
    if (raw.startsWith('AAAAIGZ0eXB') || raw.startsWith('AAAAGGZ0eXB')) return 'video/mp4'
    if (raw.startsWith('T2dnUw')) return 'audio/ogg'
    if (raw.startsWith('SUQz')) return 'audio/mpeg'
    return null
  }

  const mediaMimeByType = (mediaType: string) => {
    if (mediaType === 'image') return 'image/jpeg'
    if (mediaType === 'video') return 'video/mp4'
    if (mediaType === 'audio') return 'audio/ogg'
    return 'application/octet-stream'
  }

  const normalizeToDataUri = (value: string | null | undefined, mediaType: string) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return null
    if (trimmed.startsWith('data:')) return trimmed
    const inferredMime = inferMimeFromBase64(trimmed)
    return `data:${inferredMime || mediaMimeByType(mediaType)};base64,${trimmed}`
  }

  const effectiveType = msg.type === 'text' ? 'document' : msg.type
  const storedMedia = msg.media_url || msg.base64 || null
  const [b64, setB64] = useState<string | null>(normalizeToDataUri(storedMedia, effectiveType))
  const [loading, setLoading] = useState(!normalizeToDataUri(storedMedia, effectiveType))

  useEffect(() => {
    const normalizedStoredMedia = normalizeToDataUri(msg.media_url || msg.base64, effectiveType)
    if (normalizedStoredMedia) {
      setB64(normalizedStoredMedia)
      setLoading(false)
      return
    }

    const fetchB64 = async () => {
      // Não chama a API para mensagens tipo 'text' — são dados legados com placeholder
      if (msg.type === 'text') {
        setLoading(false)
        return
      }

      const wid = msg.whatsapp_id || msg.id
      if (instanceName && wid) {
        const base64Str = await getMediaBase64(instanceName, wid, effectiveType)
        if (base64Str) {
          setB64(base64Str)
          // Persiste a Data URI completa na coluna base64 para não chamar a API novamente
          await supabase
            .from('messages')
            .update({ base64: base64Str })
            .eq('id', msg.id)
        }
      }
      setLoading(false)
    }
    fetchB64()
  }, [msg.id, msg.media_url, msg.base64, msg.type, msg.whatsapp_id, instanceName])

  if (loading) return <div className="flex items-center gap-2 py-2"><Loader className="animate-spin text-indigo-400" size={16} /> <span className="text-xs text-gray-500">Carregando mídia...</span></div>

  if (!b64) {
    // Dados legados salvos como text/[mídia] antes da correção do webhook
    if (msg.type === 'text') return <span className="text-xs text-gray-400 italic">[mídia indisponível]</span>
    if (msg.type === 'document') {
      return (
        <div className="flex items-center gap-2 bg-black/10 p-2 rounded-lg mb-2 text-current">
          <FileIcon size={16} />
          <span className="truncate max-w-[220px]">{msg.content || 'Documento recebido (sem visualização)'}</span>
        </div>
      )
    }
    return null
  }

  const inferredDataType = b64.startsWith('data:image')
    ? 'image'
    : b64.startsWith('data:video')
      ? 'video'
      : b64.startsWith('data:audio')
        ? 'audio'
        : 'document'

  const renderType = msg.type === 'text' ? inferredDataType : msg.type

  if (renderType === 'document') {
    return (
      <a href={b64} target="_blank" rel="noreferrer" download={msg.content || 'documento'} className="flex items-center gap-2 bg-black/10 p-2 rounded-lg hover:bg-black/20 transition-colors mb-2 text-current cursor-pointer">
        <FileIcon size={16} />
        <span className="truncate max-w-[200px]">{msg.content || 'Baixar arquivo'}</span>
      </a>
    )
  }

  if (renderType === 'audio') {
    return <audio src={b64} controls className="w-[240px] max-w-full mb-1" />
  }

  if (renderType === 'video') {
    return <video src={b64} controls className="w-[240px] max-w-full max-h-[320px] rounded-lg mb-1 object-contain" />
  }

  return <img src={b64} alt="Imagem" className="w-[240px] max-w-full max-h-[320px] rounded-lg mb-1 object-contain" />
}

export default function Conversations() {
  const { profile } = useProfile()
  const { conversations, loading } = useConversations(profile?.tenant_id || '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = conversations.find(c => c.id === selectedId) ?? null
  const { messages, loadingMessages } = useMessages(selectedId || '')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [activeTab, setActiveTab] = useState<'cliente' | 'boletos'>('cliente')
  const [mkClient, setMkClient] = useState<any>(null)
  const [boletos, setBoletos] = useState<any[]>([])
  const [loadingMK, setLoadingMK] = useState(false)
  const [instanceName, setInstanceName] = useState('')
  const [isClientPanelCollapsed, setIsClientPanelCollapsed] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messageCountRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  
  const [attachment, setAttachment] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Reseta contador ao trocar de conversa e vai para o fim das mensagens
  useEffect(() => {
    messageCountRef.current = 0
  }, [selectedId])

  // Auto scroll para o fim — quando termina o carregamento inicial e quando chegam novas mensagens
  useEffect(() => {
    if (loadingMessages) return
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
    messageCountRef.current = messages.length
  }, [loadingMessages, messages])

  // Busca instância Evolution do tenant
  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase
      .from('evolution_configs')
      .select('instance_name')
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle()
      .then(({ data }) => { if (data) setInstanceName(data.instance_name) })
  }, [profile])

  // Seleciona primeira conversa automaticamente
  useEffect(() => {
    if (conversations.length > 0 && !selectedId) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations])

  // Busca dados MK-Auth ao selecionar conversa
  useEffect(() => {
    if (!selected?.contact?.whatsapp) return
    setMkClient(null)
    setBoletos([])
    setLoadingMK(true)

    async function fetchMK() {
      // Busca pelo login salvo no contato (mk_id = login no MK-Auth)
      const login = selected?.contact?.mk_id
      if (!login) {
        setLoadingMK(false)
        return
      }

      // Busca config MK-Auth do tenant
      const { data: mkConfig } = await supabase
        .from('mkauth_configs')
        .select('*')
        .eq('tenant_id', profile!.tenant_id)
        .maybeSingle()

      if (!mkConfig) {
        setLoadingMK(false)
        return
      }

      const mkData = await getMKClientByLogin(profile!.tenant_id, login)
      setMkClient(mkData)

      if (mkData?.cpf_cnpj) {
        const bols = await getMKTitulosByCPF(
          profile!.tenant_id, mkData.cpf_cnpj
        )
        setBoletos(Array.isArray(bols) ? bols : [])
      }
      setLoadingMK(false)
    }
    fetchMK()
  }, [selected?.id])

  const filtered = conversations.filter(c => {
    const name = c.contact?.name || c.contact?.whatsapp || ''
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact?.whatsapp?.includes(search)
    const matchFilter = filter === 'all' || c.status === filter
    const matchDateFilter = matchesDateFilter(c.updated_at, dateFilter)
    return matchSearch && matchFilter && matchDateFilter
  })

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null)
      return
    }

    if (!selectedId || !filtered.some(conversation => conversation.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  const handleCloseConversation = async () => {
    if (!selected || !profile) return
    const newStatus = selected.status === 'closed' ? 'open' : 'closed'
    await supabase
      .from('conversations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', selected.id)
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = error => reject(error)
    })
  }

  const getMediaType = (file: File): 'image' | 'audio' | 'video' | 'document' => {
    if (file.type.startsWith('image/')) return 'image'
    if (file.type.startsWith('audio/')) return 'audio'
    if (file.type.startsWith('video/')) return 'video'
    return 'document'
  }

  const startRecording = async () => {
    try {
      audioChunksRef.current = []
      setRecordingTime(0)
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const preferredMimeTypes = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/webm'
      ]
      const chosenMimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type))

      const mediaRecorder = chosenMimeType
        ? new MediaRecorder(stream, { mimeType: chosenMimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }
      
      mediaRecorder.onstop = async () => {
        const finalMimeType = mediaRecorder.mimeType || chosenMimeType || 'audio/webm'
        const extension = finalMimeType.includes('ogg') ? 'ogg' : 'webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType })
        const audioFile = new File([audioBlob], `audio_${Date.now()}.${extension}`, { type: finalMimeType })
        setAttachment(audioFile)
        
        // Para o stream
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        mediaRecorderRef.current = null
        
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current)
          recordingIntervalRef.current = null
        }
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      
      // Contador do tempo de gravação
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } catch (error) {
      console.error('Erro ao acessar microfone:', error)
      alert('Permissão de microfone negada')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setRecordingTime(0)
      setAttachment(null)
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }

  const handleSend = async () => {
    if ((!message.trim() && !attachment) || !selected || !profile || uploading) return
    const rawContent = message.trim()
    setMessage('')
    setUploading(true)

    try {
      let mediaUrl = null
      let mediaType = 'text'
      let mediaBase64 = null

      // Audio nao aceita legenda; ignora qualquer texto digitado nesse caso.
      let content = rawContent

      if (attachment) {
        mediaType = getMediaType(attachment)
        mediaBase64 = await fileToBase64(attachment)
        mediaUrl = `data:${attachment.type};base64,${mediaBase64}`
        if (mediaType === 'audio') {
          content = ''
        }
      }

      let sentWppId = null

      // Envia pelo WhatsApp via Evolution API
      if (instanceName && selected?.contact?.whatsapp) {
        if (attachment && mediaBase64) {
          const res = await sendMediaMessage(
            instanceName,
            selected.contact.whatsapp,
            mediaBase64,
            mediaType as any,
            attachment.type,
            attachment.name,
            content
          )
          sentWppId = res?.key?.id || res?.data?.key?.id || res?.message?.key?.id || null
          const sendStatus = String(res?.status || res?.data?.status || '').toUpperCase()
          if (!sentWppId && sendStatus !== 'PENDING') {
            throw new Error('Evolution nao confirmou o envio da midia.')
          }
        } else {
          const res = await sendTextMessage(instanceName, selected.contact.whatsapp, content)
          sentWppId = res?.key?.id || res?.data?.key?.id || res?.message?.key?.id || null
          const sendStatus = String(res?.status || res?.data?.status || '').toUpperCase()
          if (!sentWppId && sendStatus !== 'PENDING') {
            throw new Error('Evolution nao confirmou o envio da mensagem.')
          }
        }
      }

      // Salva no banco local
      const messageContent = attachment
        ? (mediaType === 'document' ? (content || attachment.name) : content)
        : content

      await supabase.from('messages').insert({
        conversation_id: selected.id,
        tenant_id: profile.tenant_id,
        from_me: true,
        content: messageContent,
        type: mediaType,
        media_url: mediaUrl, // Salva o base64 direto no banco
        base64: mediaBase64,
        whatsapp_id: sentWppId
      })

      // Atualiza conversa
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selected.id)

      setAttachment(null)
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      alert(error instanceof Error ? error.message : 'Erro ao enviar mensagem')
    } finally {
      setUploading(false)
    }
  }

  const handleSendBoleto = async (boleto: any) => {
    if (!selected || !profile || !instanceName) return

    const valor = new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL'
    }).format(parseFloat(String(boleto.valor).replace(/[R$\s]/g, '').replace(',', '.') || '0'))

    const vencimento = boleto.datavenc
      ? new Date(boleto.datavenc).toLocaleDateString('pt-BR')
      : '-'

    const text = `📄 *Segunda via do boleto*\nValor: ${valor}\nVencimento: ${vencimento}\n\n${boleto.linhadig || boleto.url || 'Link indisponível'}`

    await supabase.from('messages').insert({
      conversation_id: selected.id,
      tenant_id: profile.tenant_id,
      from_me: true,
      content: text,
    })

    const wpp = selected?.contact?.whatsapp
    if (!wpp) return

    await sendTextMessage(instanceName, wpp, text)
  }

  const messageListItems = buildMessageListItems(messages)

  if (!profile) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Loader className="animate-spin text-indigo-500 mx-auto mb-2" size={28} />
        <p className="text-sm text-gray-400">Carregando perfil...</p>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Loader className="animate-spin text-indigo-500 mx-auto mb-2" size={28} />
        <p className="text-sm text-gray-400">Carregando conversas...</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100%+3rem)] -m-6 overflow-hidden">

      {/* Lista */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-3">Conversas</h2>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-1">
            {[['all', 'Todos'], ['open', 'Abertos'], ['waiting', 'Ag.'], ['closed', 'Fechados']].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${filter === val ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              ['all', 'Tudo'],
              ['today', 'Hoje'],
              ['yesterday', 'Ontem'],
              ['week', '7 dias'],
              ['older', 'Antigas'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setDateFilter(val as DateFilter)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${dateFilter === val ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">
              Nenhuma conversa ainda.<br />Aguardando mensagens do WhatsApp.
            </div>
          )}
          {filtered.map(conv => (
            <div key={conv.id} onClick={() => setSelectedId(conv.id)}
              className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selected?.id === conv.id ? 'bg-indigo-50 border-r-2 border-indigo-500' : ''}`}>
              <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
                {(conv.contact?.name || conv.contact?.whatsapp || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {conv.contact?.name || conv.contact?.whatsapp}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {getConversationPreview(conv)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {new Date(conv.last_message?.created_at || conv.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor[conv.status]}`}>
                    {statusLabel[conv.status]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat */}
      {selected ? (
        <div className="flex-1 flex flex-col bg-gray-50">
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
                {(selected?.contact?.name || selected?.contact?.whatsapp || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {selected?.contact?.name || selected?.contact?.whatsapp}
                </p>
                <p className="text-xs text-gray-400">{selected?.contact?.whatsapp}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selected.status === 'closed' ? (
                <button
                  onClick={handleCloseConversation}
                  className="flex items-center gap-1.5 text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors font-medium"
                >
                  <RefreshCw size={13} /> Reabrir conversa
                </button>
              ) : (
                <button
                  onClick={handleCloseConversation}
                  className="flex items-center gap-1.5 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors font-medium"
                >
                  <CheckCircle size={13} /> Fechar conversa
                </button>
              )}
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <MoreVertical size={17} />
              </button>
            </div>
          </div>

          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 space-y-3">
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <Loader className="animate-spin text-indigo-400" size={24} />
              </div>
            ) : messageListItems.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Nenhuma mensagem
              </div>
            ) : messageListItems.map(item => {
              if (item.type === 'separator') {
                return (
                  <div key={item.key} className="flex justify-center py-1">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm ring-1 ring-blue-200">
                      {item.label}
                    </span>
                  </div>
                )
              }

              const msg = item.message

              return (
                <div key={item.key} className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm whitespace-pre-line break-words ${msg.from_me ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 shadow-sm rounded-tl-sm'
                    }`}>
                    {(msg.type !== 'text' || isMediaPlaceholder(msg.content)) && (
                      <MessageMedia
                        msg={msg}
                        instanceName={instanceName}
                      />
                    )}
                    {msg.type !== 'document' && msg.content && !isMediaPlaceholder(msg.content) && <p className="break-words">{msg.content}</p>}
                    <p className={`text-xs mt-1 ${msg.from_me ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-white border-t border-gray-200 p-4">
            {attachment && (
              <div className="mb-3 flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-500 rounded flex items-center justify-center flex-shrink-0">
                  {attachment.type.startsWith('image/') ? <ImageIcon size={20} /> :
                    attachment.type.startsWith('audio/') ? <Mic size={20} /> :
                      <FileIcon size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{attachment.name}</p>
                  <p className="text-xs text-gray-500">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={() => setAttachment(null)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-white transition-colors">
                  <X size={16} />
                </button>
              </div>
            )}
            {selected.status === 'closed' ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                <CheckCircle size={15} className="text-green-500" />
                Conversa encerrada —
                <button onClick={handleCloseConversation} className="text-indigo-500 hover:underline font-medium">
                  reabrir
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 relative">
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={e => setAttachment(e.target.files?.[0] || null)}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                  disabled={uploading || attachment?.type.startsWith('audio/')}
                  title={attachment?.type.startsWith('audio/') ? "Remova o áudio para anexar outro arquivo" : "Enviar arquivo ou mídia"}
                >
                  <Paperclip size={20} />
                </button>
                {isRecording ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 rounded-xl ring-2 ring-red-200">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-sm font-mono text-red-600 font-medium">
                        {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
                      </span>
                    </div>
                    <button
                      onClick={stopRecording}
                      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                      title="Parar gravação"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                    <button
                      onClick={cancelRecording}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Cancelar gravação"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startRecording}
                    className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    disabled={uploading}
                    title="Gravar áudio"
                  >
                    <Mic size={20} />
                  </button>
                )}
                {attachment?.type.startsWith('audio/') ? (
                  <div className="flex-1 h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 flex items-center text-sm text-gray-500">
                    Audio pronto para envio
                  </div>
                ) : (
                  <input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder={attachment ? "Adicione uma legenda..." : "Digite uma mensagem..."}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={uploading || isRecording}
                  />
                )}
                <button onClick={handleSend}
                  disabled={uploading || (!message.trim() && !attachment)}
                  className="w-11 h-11 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-colors">
                  {uploading ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <p className="text-gray-400 text-sm">Selecione uma conversa</p>
        </div>
      )}

      {/* Painel MK-Auth */}
      {isClientPanelCollapsed ? (
        <div className="w-14 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col items-center py-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('cliente')
              setIsClientPanelCollapsed(false)
            }}
            title="Abrir menu do cliente"
            aria-label="Abrir menu do cliente"
            className={`p-2 rounded-lg transition-colors ${activeTab === 'cliente' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
          >
            <User size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('boletos')
              setIsClientPanelCollapsed(false)
            }}
            title="Abrir menu de boletos"
            aria-label="Abrir menu de boletos"
            className={`p-2 rounded-lg transition-colors ${activeTab === 'boletos' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
          >
            <FileText size={16} />
          </button>
        </div>
      ) : (
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 flex gap-1">
                {[['cliente', <User size={13} />, 'Cliente'], ['boletos', <FileText size={13} />, 'Boletos']].map(([val, icon, label]) => (
                  <button key={val as string} onClick={() => setActiveTab(val as any)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg font-medium transition-colors ${activeTab === val ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {icon as any} {label as string}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsClientPanelCollapsed(true)}
                title="Recolher perfil do cliente"
                aria-label="Recolher perfil do cliente"
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <PanelRightClose size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loadingMK ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="animate-spin text-indigo-400" size={20} />
              </div>
            ) : (
              <MKSearchPanel
                contact={selected?.contact}
                profile={profile!}
                mkClient={mkClient}
                boletos={boletos}
                activeTab={activeTab}
                conversationClosed={selected?.status === 'closed'}
                onClientSelected={(client) => setMkClient(client)}
                onBoletosFetched={(bols) => setBoletos(bols)}
                onEnviarBoleto={(boleto) => handleSendBoleto(boleto)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}