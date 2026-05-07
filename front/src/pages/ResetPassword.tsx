import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wifi } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [canReset, setCanReset] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let isMounted = true

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      if (data.session) {
        setCanReset(true)
      }
      setCheckingAccess(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || !!session) {
        setCanReset(true)
        setCheckingAccess(false)
      }
    })

    checkSession()

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!canReset) {
      setError('Link de recuperacao invalido ou expirado.')
      return
    }

    if (password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas nao conferem.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('Nao foi possivel redefinir sua senha. Solicite um novo link e tente novamente.')
      setLoading(false)
      return
    }

    setSuccess('Senha atualizada com sucesso. Voce sera redirecionado para o login.')
    setLoading(false)
    setTimeout(() => {
      navigate('/login')
    }, 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md mx-4 sm:mx-0">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center mb-3">
            <Wifi size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Redefinir senha</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Crie uma nova senha para acessar sua conta
          </p>
        </div>

        {checkingAccess ? (
          <div className="bg-gray-50 text-gray-700 text-sm px-4 py-3 rounded-lg">
            Validando link de recuperacao...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
                {success}
              </div>
            )}

            {!canReset && (
              <div className="bg-amber-50 text-amber-700 text-sm px-4 py-3 rounded-lg">
                Este link nao e valido no momento. Solicite uma nova recuperacao.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
                minLength={6}
                required
                disabled={!canReset || loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
                minLength={6}
                required
                disabled={!canReset || loading}
              />
            </div>

            <button
              type="submit"
              disabled={!canReset || loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
