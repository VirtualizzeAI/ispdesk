import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type InviteBody = {
  name: string
  email: string
  role: 'admin' | 'agent' | 'manager'
  department_id?: string | null
  status?: 'active' | 'inactive'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo nao permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const accessToken = authHeader.replace('Bearer ', '').trim()

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken)
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const requesterId = authData.user.id

    const { data: requesterProfile, error: requesterError } = await adminClient
      .from('profiles')
      .select('tenant_id, role')
      .eq('id', requesterId)
      .maybeSingle()

    if (requesterError || !requesterProfile) {
      return new Response(JSON.stringify({ error: 'Perfil do solicitante nao encontrado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (requesterProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Apenas administradores podem convidar colaboradores' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as InviteBody
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const role = body.role || 'agent'
    const departmentId = body.department_id || null
    const status = body.status || 'active'

    if (!name || !email) {
      return new Response(JSON.stringify({ error: 'Nome e email sao obrigatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: invitedUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name },
    })

    if (inviteError || !invitedUser.user) {
      return new Response(JSON.stringify({ error: inviteError?.message || 'Falha ao enviar convite' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const invitedUserId = invitedUser.user.id

    const { error: upsertError } = await adminClient
      .from('profiles')
      .upsert({
        id: invitedUserId,
        tenant_id: requesterProfile.tenant_id,
        name,
        email,
        role,
        department_id: departmentId,
        status,
      }, { onConflict: 'id' })

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: invitedUserId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
