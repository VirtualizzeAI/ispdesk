import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, QrCode, Wifi, WifiOff, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { createInstance, getQRCode, getInstanceStatus, deleteInstance, setWebhook } from '../lib/evolution'

export default function Settings() {
  const { profile } = useProfile()
  const [tab, setTab] = useState<'mkauth' | 'whatsapp' | 'team'>('mkauth')

  // MK-Auth
  const [mkUrl, setMkUrl] = useState('')
  const [mkClientId, setMkClientId] = useState('')
  const [mkSecret, setMkSecret] = useState('')
  const [mkConfigId, setMkConfigId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<null | 'ok' | 'error'>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // WhatsApp
  const [instanceName, setInstanceName] = useState('')
  const [newInstanceName, setNewInstanceName] = useState('')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading')
  const [loadingQR, setLoadingQR] = useState(false)
  const [pollingRef, setPollingRef] = useState<any>(null)
  const [whatsappPhone, setWhatsappPhone] = useState('')

  // Team
  const [inviteEmail, setInviteEmail] = useState('')
  const [members, setMembers] = useState<any[]>([])

  useEffect(() => {
    if (!profile?.tenant_id) return

    supabase.from('mkauth_configs').select('*')
      .eq('tenant_id', profile.tenant_id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMkUrl(data.url)
          setMkClientId(data.client_id)
          setMkSecret(data.client_secret)
          setMkConfigId(data.id)
        }
      })

    supabase.from('evolution_configs').select('*')
      .eq('tenant_id', profile.tenant_id).maybeSingle()
      .then(({ data }) => {
        if (data?.instance_name) {
          setInstanceName(data.instance_name)
          checkWhatsAppStatus(data.instance_name)
        } else {
          setWhatsappStatus('disconnected')
        }
      })

    supabase.from('profiles').select('*')
      .eq('tenant_id', profile.tenant_id)
      .then(({ data }) => { if (data) setMembers(data) })
  }, [profile])

  const checkWhatsAppStatus = async (instance: string): Promise<boolean> => {
    setWhatsappStatus('loading')
    try {
      const result = await getInstanceStatus(instance)
      const state = result?.instance?.state || result?.state
      const connected = state === 'open'
      setWhatsappStatus(connected ? 'connected' : 'disconnected')
      return connected
    } catch {
      setWhatsappStatus('disconnected')
      return false
    }
  }

  const testConnection = async () => {
    if (!mkUrl || !mkClientId || !mkSecret) { setTestStatus('error'); return }
    setTesting(true)
    setTestStatus(null)
    try {
      const res = await fetch(`${mkUrl}api/cliente/id/1?client_id=${mkClientId}&client_secret=${mkSecret}`)
      setTestStatus(res.ok || res.status === 404 ? 'ok' : 'error')
    } catch { setTestStatus('error') }
    setTesting(false)
  }

  const saveMkAuth = async () => {
    if (!profile?.tenant_id) return
    setSaving(true)
    const payload = { tenant_id: profile.tenant_id, url: mkUrl, client_id: mkClientId, client_secret: mkSecret }
    if (mkConfigId) {
      await supabase.from('mkauth_configs').update(payload).eq('id', mkConfigId)
    } else {
      const { data } = await supabase.from('mkauth_configs').insert(payload).select().single()
      if (data) setMkConfigId(data.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleGenerateQR = async () => {
    const apelido = newInstanceName || instanceName
    if (!apelido) return

    const instancia = instanceName || `${apelido}_${profile?.tenant_id?.slice(0, 8)}`
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`

    setLoadingQR(true)
    setQrCode(null)
    if (pollingRef) clearInterval(pollingRef)

    try {
      if (!instanceName) {
        // Instância nova — cria, salva no banco e registra webhook
        await createInstance(instancia)

        if (profile?.tenant_id) {
          const { data: existing } = await supabase
            .from('evolution_configs')
            .select('id')
            .eq('tenant_id', profile.tenant_id)
            .maybeSingle()

          if (existing) {
            await supabase.from('evolution_configs')
              .update({ instance_name: instancia, status: 'disconnected', phone: `55${whatsappPhone}` })
              .eq('tenant_id', profile.tenant_id)
          } else {
            await supabase.from('evolution_configs')
              .insert({ tenant_id: profile.tenant_id, instance_name: instancia, status: 'disconnected', phone: `55${whatsappPhone}` })
          }

          setInstanceName(instancia)

          // Registra webhook na instância nova
          await setWebhook(instancia, webhookUrl)
          console.log('Webhook registrado na instância nova:', instancia)
        }
      } else {
        // Instância já existe — garante que o webhook está registrado
        await setWebhook(instancia, webhookUrl)
        console.log('Webhook re-registrado na instância existente:', instancia)
      }

      // Busca QR Code
      const result = await getQRCode(instancia)
      const base64 = result?.base64 || result?.qrcode?.base64 || result?.code
      if (base64) {
        setQrCode(base64)
      } else {
        console.error('QR Code não retornado:', result)
      }

      // Polling a cada 3s para detectar conexão
      const interval = setInterval(async () => {
        const connected = await checkWhatsAppStatus(instancia)
        if (connected) {
          clearInterval(interval)
          setQrCode(null)

          // Garante webhook após conectar
          await setWebhook(instancia, webhookUrl)
          console.log('Webhook confirmado após conexão')

          // Atualiza status no banco
          await supabase.from('evolution_configs')
            .update({ status: 'connected' })
            .eq('tenant_id', profile!.tenant_id)

          console.log('WhatsApp conectado e webhook ativo!')
        }
      }, 3000)

      setPollingRef(interval)

    } catch (e) {
      console.error('Erro ao gerar QR:', e)
    }

    setLoadingQR(false)
  }

  const handleDeleteInstance = async () => {
    if (!instanceName) return
    if (pollingRef) clearInterval(pollingRef)
    await deleteInstance(instanceName)
    await supabase.from('evolution_configs')
      .update({ instance_name: null, status: 'disconnected' })
      .eq('tenant_id', profile!.tenant_id)
    setInstanceName('')
    setQrCode(null)
    setWhatsappStatus('disconnected')
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Configurações</h2>
        <p className="text-gray-500 text-sm">Gerencie as integrações da sua conta</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-100">
          {[['mkauth', 'MK-Auth'], ['whatsapp', 'WhatsApp'], ['team', 'Equipe']].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val as any)}
              className={`px-6 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === val ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* MK-Auth */}
          {tab === 'mkauth' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Integração MK-Auth</h3>
                <p className="text-sm text-gray-500">Configure a URL e credenciais do MK-Auth do provedor</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL do MK-Auth</label>
                <input value={mkUrl} onChange={e => setMkUrl(e.target.value)}
                  placeholder="http://192.168.1.1/"
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                <input value={mkClientId} onChange={e => setMkClientId(e.target.value)}
                  placeholder="Seu client_id"
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                <input type="password" value={mkSecret} onChange={e => setMkSecret(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={testConnection} disabled={testing}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  {testing ? 'Testando...' : 'Testar conexão'}
                </button>
                <button onClick={saveMkAuth} disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                {testStatus === 'ok' && <span className="flex items-center gap-1.5 text-green-600 text-sm"><CheckCircle size={16} /> Conexão OK!</span>}
                {testStatus === 'error' && <span className="flex items-center gap-1.5 text-red-600 text-sm"><XCircle size={16} /> Falha na conexão</span>}
                {saved && <span className="flex items-center gap-1.5 text-green-600 text-sm"><CheckCircle size={16} /> Salvo!</span>}
              </div>
            </div>
          )}

          {/* WhatsApp */}
          {tab === 'whatsapp' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Conexão WhatsApp</h3>
                <p className="text-sm text-gray-500">
                  Instância: <span className="font-mono text-indigo-600">
                    {instanceName
                      ? instanceName.split('_').slice(0, -1).join('_') || instanceName
                      : 'não configurada'}
                  </span>
                  {whatsappPhone && whatsappStatus === 'connected' && (
                    <span className="ml-2 text-green-600 font-medium">· {whatsappPhone}</span>
                  )}
                </p>
              </div>

              <div className={`flex items-center gap-3 rounded-xl p-4 border ${whatsappStatus === 'connected' ? 'bg-green-50 border-green-200' :
                whatsappStatus === 'loading' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'
                }`}>
                {whatsappStatus === 'loading' ? <Loader size={20} className="animate-spin text-gray-400" />
                  : whatsappStatus === 'connected' ? <Wifi size={20} className="text-green-600" />
                    : <WifiOff size={20} className="text-red-500" />}
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${whatsappStatus === 'connected' ? 'text-green-800' :
                    whatsappStatus === 'loading' ? 'text-gray-600' : 'text-red-700'
                    }`}>
                    {whatsappStatus === 'connected' ? 'Conectado' :
                      whatsappStatus === 'loading' ? 'Verificando...' : 'Desconectado'}
                  </p>
                </div>
                <button onClick={() => instanceName && checkWhatsAppStatus(instanceName)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline">
                  Atualizar
                </button>
              </div>

              {!instanceName && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Apelido da instância
                    </label>
                    <input
                      value={newInstanceName}
                      onChange={e => setNewInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder="ex: principal, suporte, cobranca"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {/* <p className="text-xs text-gray-400 mt-1">
                      Nome na Evolution: <span className="font-mono text-indigo-500">
                        {newInstanceName ? `${newInstanceName}_${profile?.tenant_id?.slice(0, 8)}` : 'apelido_xxxxxxxx'}
                      </span>
                    </p> */}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Número do WhatsApp
                    </label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                      <span className="px-3 py-2.5 bg-gray-50 text-sm text-gray-500 border-r border-gray-200">
                        +55
                      </span>
                      <input
                        value={whatsappPhone}
                        onChange={e => setWhatsappPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="84999990000"
                        maxLength={11}
                        className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">DDD + número (só números)</p>
                  </div>
                </div>
              )}

              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                {loadingQR ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader size={28} className="animate-spin text-indigo-400" />
                    <p className="text-sm text-gray-400">Gerando QR Code...</p>
                  </div>
                ) : qrCode ? (
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code WhatsApp"
                      className="w-52 h-52 mx-auto rounded-lg"
                    />
                    <p className="text-xs text-gray-400">
                      Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                    </p>
                    {whatsappStatus !== 'connected' ? (
                      <div className="flex items-center gap-2 text-xs text-indigo-500">
                        <Loader size={12} className="animate-spin" /> Aguardando leitura...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <CheckCircle size={14} /> WhatsApp conectado com sucesso!
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <QrCode size={40} className="text-gray-300" />
                    <p className="text-sm text-gray-500">
                      {whatsappStatus === 'connected' ? 'WhatsApp já está conectado' : 'Clique para gerar o QR Code e conectar'}
                    </p>
                    <button onClick={handleGenerateQR} disabled={loadingQR || (!instanceName && !newInstanceName)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      {whatsappStatus === 'connected' ? 'Reconectar' : 'Gerar QR Code'}
                    </button>
                  </div>
                )}
              </div>

              {instanceName && whatsappStatus === 'connected' && (
                <button
                  onClick={async () => {
                    if (pollingRef) clearInterval(pollingRef)
                    await fetch(`${import.meta.env.VITE_EVOLUTION_URL}/instance/logout/${instanceName}`, {
                      method: 'DELETE',
                      headers: { 'apikey': import.meta.env.VITE_EVOLUTION_KEY }
                    })
                    await supabase
                      .from('evolution_configs')
                      .update({ status: 'disconnected' })
                      .eq('tenant_id', profile!.tenant_id)
                    setWhatsappStatus('disconnected')
                    setQrCode(null)
                  }}
                  className="w-full text-xs text-orange-400 hover:text-orange-600 border border-orange-200 hover:border-orange-400 py-2 rounded-lg transition-colors"
                >
                  Desconectar WhatsApp
                </button>
              )}
              {instanceName && whatsappStatus !== 'connected' && (
                <button onClick={handleDeleteInstance}
                  className="w-full text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 py-2 rounded-lg transition-colors">
                  Remover instância e reconectar
                </button>
              )}
            </div>
          )}

          {/* Team */}
          {tab === 'team' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Equipe</h3>
                <p className="text-sm text-gray-500">Gerencie os atendentes do provedor</p>
              </div>
              <div className="flex gap-2">
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="email@atendente.com"
                  className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap">
                  Convidar
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm">
                        {member.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.name}</p>
                        <p className="text-xs text-gray-400">{member.email}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${member.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                      {member.role === 'admin' ? 'Admin' : 'Atendente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}