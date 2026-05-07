import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Department } from '../types'

type DepartmentInput = {
  name: string
  description?: string
  color?: string
}

export function useDepartments(tenantId: string | null) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDepartments = useCallback(async () => {
    if (!tenantId) {
      setDepartments([])
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('departments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })

    if (fetchError) {
      if (fetchError.code === 'PGRST205') {
        setError('Tabela departments ausente. Aplique a migracao em supabase/migrations/20260507_create_departments.sql no SQL Editor do Supabase.')
      } else {
        setError(fetchError.message)
      }
      setDepartments([])
      setLoading(false)
      return
    }

    setDepartments((data as Department[]) ?? [])
    setLoading(false)
  }, [tenantId])

  useEffect(() => {
    fetchDepartments()
  }, [fetchDepartments])

  const createDepartment = useCallback(async (input: DepartmentInput) => {
    if (!tenantId) throw new Error('Tenant nao encontrado')

    const { error: createError } = await supabase.from('departments').insert({
      tenant_id: tenantId,
      name: input.name,
      description: input.description || null,
      color: input.color || null,
    })

    if (createError) {
      if (createError.code === 'PGRST205') {
        throw new Error('Tabela departments ausente. Aplique a migracao SQL de departments antes de criar setores.')
      }
      throw createError
    }
    await fetchDepartments()
  }, [fetchDepartments, tenantId])

  const updateDepartment = useCallback(async (id: string, input: DepartmentInput) => {
    const { error: updateError } = await supabase
      .from('departments')
      .update({
        name: input.name,
        description: input.description || null,
        color: input.color || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) throw updateError
    await fetchDepartments()
  }, [fetchDepartments])

  const removeDepartment = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError
    await fetchDepartments()
  }, [fetchDepartments])

  return {
    departments,
    loading,
    error,
    refetch: fetchDepartments,
    createDepartment,
    updateDepartment,
    removeDepartment,
  }
}
