import { useState, useEffect, useRef } from 'react'
import { Search, Send, MoreVertical, User, FileText, Loader, CheckCircle, RefreshCw, Paperclip, X, Image as ImageIcon, File as FileIcon, Mic } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useConversations, useMessages } from '../hooks/useConversations'
import { useProfile } from '../hooks/useProfile'
import { getMKClientByLogin, getMKTitulosByCPF } from '../lib/mkauth'
import { sendTextMessage, sendMediaMessage, getMediaBase64 } from '../lib/evolution'

import MKSearchPanel from '../components/MKSearchPanel'

const statusColor: Record<string, string> = {
  open: 'bg-indigo-100 text-indigo-700',
  waiting: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-green-100 text-green-700',
}
const statusLabel: Record<string, string> = {
  open: 'Aberto', waiting: 'Aguardando', closed: 'Fechado',
}



const MessageMedia = ({ msg, instanceName }: { msg: any, instanceName: string }) => {
  const [b64, setB64] = useState<string | null>(msg.media_url || null)
  const [loading, setLoading] = useState(!msg.media_url)

  useEffect(() => {
    if (msg.media_url) return
    const fetchB64 = async () => {
      // Usa msg.whatsapp_id ou fallback msg.whatsapp_message_id
      const wid = msg.whatsapp_id || msg.whatsapp_message_id || msg.id
      if (instanceName && wid) {
        const base64Str = await getMediaBase64(instanceName, wid)
        if (base64Str) setB64(base64Str)
      }
      setLoading(false)
    }
    fetchB64()
  }, [msg, instanceName])

  if (loading) return <div className="flex items-center gap-2 py-2"><Loader className="animate-spin text-indigo-400" size={16} /> <span className="text-xs text-gray-500">Carregando mídia...</span></div>

  if (!b64) return null

  if (msg.type === 'document') {
    return (
      <a href={b64} target="_blank" rel="noreferrer" download={msg.content || 'documento'} className="flex items-center gap-2 bg-black/10 p-2 rounded-lg hover:bg-black/20 transition-colors mb-2 text-current cursor-pointer">
        <FileIcon size={16} />
        <span className="truncate max-w-[200px]">{msg.content || 'Baixar arquivo'}</span>
      </a>
    )
  }

  if (msg.type === 'audio') {
    return <audio src={b64} controls className="max-w-full mb-1" />
  }

  if (msg.type === 'video') {
    return <video src={b64} controls className="max-w-full rounded-lg mb-1" />
  }

  return <img src={b64} alt="Imagem" className="max-w-full rounded-lg mb-1" />
}

export default function Conversations() {
  const { profile } = useProfile()
  const { conversations, loading } = useConversations(profile?.tenant_id || '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = conversations.find(c => c.id === selectedId) ?? null
  const { messages } = useMessages(selectedId || '')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'cliente' | 'boletos'>('cliente')
  const [mkClient, setMkClient] = useState<any>(null)
  const [boletos, setBoletos] = useState<any[]>([])
  const [loadingMK, setLoadingMK] = useState(false)
  const [instanceName, setInstanceName] = useState('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messageCountRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [attachment, setAttachment] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // Reseta contador ao trocar de conversa e vai para o fim das mensagens
  useEffect(() => {
    messageCountRef.current = 0
    // Scroll para o fim ao abrir uma conversa
    setTimeout(() => {
      const el = messagesContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 50)
  }, [selectedId])

  // Auto scroll para última mensagem — só quando o número de mensagens aumenta
  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      const el = messagesContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    messageCountRef.current = messages.length
  }, [messages])

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
    return matchSearch && matchFilter
  })

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

  const handleSend = async () => {
    if ((!message.trim() && !attachment) || !selected || !profile || uploading) return
    const content = message
    setMessage('')
    setUploading(true)

    try {
      let mediaUrl = null
      let mediaType = 'text'
      let mediaBase64 = null

      if (attachment) {
        mediaType = getMediaType(attachment)
        mediaBase64 = await fileToBase64(attachment)
        mediaUrl = `data:${attachment.type};base64,${mediaBase64}`
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
          sentWppId = res?.key?.id || null
        } else {
          const res = await sendTextMessage(instanceName, selected.contact.whatsapp, content)
          sentWppId = res?.key?.id || null
        }
      }

      // Salva no banco local
      await supabase.from('messages').insert({
        conversation_id: selected.id,
        tenant_id: profile.tenant_id,
        from_me: true,
        content: content || (attachment ? attachment.name : ''),
        type: mediaType,
        media_url: mediaUrl, // Salva o base64 direto no banco
        media_type: attachment?.type,
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {conv.contact?.name || conv.contact?.whatsapp}
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                    {new Date(conv.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor[conv.status]}`}>
                  {statusLabel[conv.status]}
                </span>
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
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm whitespace-pre-line ${msg.from_me ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white text-gray-800 shadow-sm rounded-tl-sm'
                  }`}>
                  {msg.type !== 'text' && (
                    <MessageMedia msg={msg} instanceName={instanceName} />
                  )}
                  {msg.type !== 'document' && msg.content && <p>{msg.content}</p>}
                  <p className={`text-xs mt-1 ${msg.from_me ? 'text-indigo-200' : 'text-gray-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
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
                  className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  disabled={uploading}
                >
                  <Paperclip size={20} />
                </button>
                <input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder={attachment ? "Adicione uma legenda..." : "Digite uma mensagem..."}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={uploading}
                />
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
      <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex gap-1">
            {[['cliente', <User size={13} />, 'Cliente'], ['boletos', <FileText size={13} />, 'Boletos']].map(([val, icon, label]) => (
              <button key={val as string} onClick={() => setActiveTab(val as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg font-medium transition-colors ${activeTab === val ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {icon as any} {label as string}
              </button>
            ))}
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
    </div>
  )
}