import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle() // não lança erro se não encontrar

        if (!cancelled) {
          setProfile(data ?? null)
          setLoading(false)
        }
      } catch (error) {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, []) // array vazio = roda só uma vez, sem loop

  return { profile, loading }
}