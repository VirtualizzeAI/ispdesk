export interface Tenant {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'trial'
  plan: string
  created_at: string
}

export interface Profile {
  id: string
  tenant_id: string
  name: string
  email: string
  role: 'admin' | 'agent'
}

export interface Contact {
  id: string
  tenant_id: string
  whatsapp: string
  name?: string
  mk_id?: string
  mk_data?: MKAuthClient
  mk_synced_at?: string
}

export interface MKAuthClient {
  id: string
  nome: string
  cpf: string
  email: string
  plano: string
  status: 'A' | 'S' | 'I' // Ativo, Suspenso, Inadimplente
  endereco: string
  telefone: string
}

export interface MKAuthBoleto {
  id: string
  valor: string
  vencimento: string
  status: 'aberto' | 'pago' | 'vencido'
  link?: string
}

export interface Conversation {
  id: string
  tenant_id: string
  contact_id: string
  assigned_to?: string
  status: 'open' | 'closed' | 'waiting'
  created_at: string
  updated_at: string
  contact?: Contact
  last_message?: Message
}

export interface Message {
  id: string
  conversation_id: string
  tenant_id: string
  from_me: boolean
  content: string
  type: 'text' | 'image' | 'audio' | 'document' | 'video'
  media_url?: string
  media_type?: string
  whatsapp_id?: string
  created_at: string
}

export interface Ticket {
  id: string
  tenant_id: string
  contact_id: string
  conversation_id?: string
  title: string
  status: 'open' | 'in_progress' | 'closed'
  priority: 'low' | 'normal' | 'high'
  assigned_to?: string
  created_at: string
  updated_at: string
  contact?: Contact
}